/**
 * Generic Simulation State Save
 *
 * Shared async GPU readback → serialize → download pipeline used by all
 * compute modes (TDSE, BEC, FSF, Dirac, Pauli, Quantum Walk).
 *
 * Each mode's `requestStateSave` is a thin wrapper that provides
 * mode-specific buffer references and metadata, then delegates here.
 *
 * @module rendering/webgpu/passes/stateSave
 */

import type { SaveableQuantumMode } from '@/lib/export/simulationState'

import type { WebGPURenderContext } from '../core/types'

// ─── Buffer Source Variants ─────────────────────────────────────────────────

/** Two separate GPU buffers for real and imaginary parts. */
interface SeparateBufferSource {
  layout: 'separate'
  reBuffer: GPUBuffer
  imBuffer: GPUBuffer
  /** Byte size per buffer (totalSites * componentCount * 4). */
  byteSize: number
}

/**
 * Single GPU buffer with interleaved [re, im, re, im, ...] complex data.
 * Used by Quantum Walk where coin state components are interleaved.
 */
interface InterleavedBufferSource {
  layout: 'interleaved'
  buffer: GPUBuffer
  /** Total byte size (elementCount * 2 * 4). */
  byteSize: number
  /** Number of complex elements to de-interleave. */
  elementCount: number
}

/** GPU buffer source for state readback. */
export type StateSaveBufferSource = SeparateBufferSource | InterleavedBufferSource

// ─── Metadata ───────────────────────────────────────────────────────────────

/**
 * Serialization metadata resolved after successful GPU readback.
 * Provided by each mode via an async callback so store reads are
 * deferred until the data is actually available.
 */
export interface StateSaveMetadata {
  /** Quantum mode identifier for the .mqstate header. */
  quantumMode: SaveableQuantumMode
  /** JSON-serializable configuration snapshot. */
  config: Record<string, unknown>
  /** Per-dimension grid sizes for the active lattice dimensions. */
  gridSize: number[]
  /** Number of field components per site (1 for scalar, 2 for spinor, etc.). */
  componentCount: number
}

// ─── Request ────────────────────────────────────────────────────────────────

/** Parameters for a generic state save operation. */
export interface StateSaveRequest {
  /** GPU buffer(s) to read back. */
  source: StateSaveBufferSource
  /** Total number of lattice sites. */
  totalSites: number
  /** Label prefix for GPU resource names. */
  label: string
  /**
   * Async callback to resolve serialization metadata.
   * Called only after successful GPU readback, so dynamic imports
   * and store reads are deferred until data is available.
   */
  getMetadata: () => Promise<StateSaveMetadata>
  /** Called when the async operation completes (success or failure). */
  onFinished: () => void
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Initiate an async GPU readback → serialize → download state save.
 *
 * Creates staging buffers, encodes copy commands on the current encoder,
 * then asynchronously maps, extracts, serializes, and downloads the data.
 * All staging buffers are destroyed on every code path (success, early
 * return, and error).
 *
 * @param ctx - Render context with device and command encoder
 * @param request - Save parameters
 */
export function requestStateSave(ctx: WebGPURenderContext, request: StateSaveRequest): void {
  const { device, encoder } = ctx
  const { source, totalSites, label, getMetadata, onFinished } = request

  if (source.layout === 'separate') {
    requestSeparateSave(device, encoder, source, totalSites, label, getMetadata, onFinished)
  } else {
    requestInterleavedSave(device, encoder, source, totalSites, label, getMetadata, onFinished)
  }
}

/** Save from two separate re/im buffers (TDSE, FSF, Dirac, Pauli). */
function requestSeparateSave(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  source: SeparateBufferSource,
  totalSites: number,
  label: string,
  getMetadata: () => Promise<StateSaveMetadata>,
  onFinished: () => void
): void {
  const stagingRe = device.createBuffer({
    label: `${label}-save-staging-re`,
    size: source.byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const stagingIm = device.createBuffer({
    label: `${label}-save-staging-im`,
    size: source.byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(source.reBuffer, 0, stagingRe, 0, source.byteSize)
  encoder.copyBufferToBuffer(source.imBuffer, 0, stagingIm, 0, source.byteSize)

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        stagingRe.destroy()
        stagingIm.destroy()
        onFinished()
        return
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])

      const re = new Float32Array(stagingRe.getMappedRange()).slice(0)
      const im = new Float32Array(stagingIm.getMappedRange()).slice(0)
      stagingRe.unmap()
      stagingIm.unmap()
      stagingRe.destroy()
      stagingIm.destroy()

      await serializeAndDownload(re, im, totalSites, getMetadata)
      onFinished()
    })
    .catch((err) => {
      stagingRe.destroy()
      stagingIm.destroy()
      reportSaveError(err)
      onFinished()
    })
}

/** Save from a single interleaved complex buffer (Quantum Walk). */
function requestInterleavedSave(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  source: InterleavedBufferSource,
  totalSites: number,
  label: string,
  getMetadata: () => Promise<StateSaveMetadata>,
  onFinished: () => void
): void {
  const staging = device.createBuffer({
    label: `${label}-save-staging`,
    size: source.byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(source.buffer, 0, staging, 0, source.byteSize)

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (staging.mapState !== 'unmapped') {
        staging.destroy()
        onFinished()
        return
      }
      await staging.mapAsync(GPUMapMode.READ)
      const interleaved = new Float32Array(staging.getMappedRange())

      const n = source.elementCount
      const re = new Float32Array(n)
      const im = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        re[i] = interleaved[i * 2]!
        im[i] = interleaved[i * 2 + 1]!
      }
      staging.unmap()
      staging.destroy()

      await serializeAndDownload(re, im, totalSites, getMetadata)
      onFinished()
    })
    .catch((err) => {
      staging.destroy()
      reportSaveError(err)
      onFinished()
    })
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Serialize readback data and trigger browser download. */
async function serializeAndDownload(
  re: Float32Array,
  im: Float32Array,
  totalSites: number,
  getMetadata: () => Promise<StateSaveMetadata>
): Promise<void> {
  const meta = await getMetadata()

  const { serializeSimulationState } = await import('@/lib/export/simulationState')
  const { downloadFile, exportFilename } = await import('@/lib/export/dataExport')
  const { useSimulationStateStore } = await import('@/stores/simulationStateStore')

  const blob = await serializeSimulationState(
    meta.config,
    { re, im, totalSites, componentCount: meta.componentCount },
    meta.quantumMode,
    meta.gridSize
  )
  downloadFile(blob, exportFilename('mdim-state', 'mqstate'), 'application/octet-stream')
  useSimulationStateStore.getState().setSaveComplete()
}

/** Report save error to the simulation state store. */
function reportSaveError(err: unknown): void {
  void import('@/stores/simulationStateStore').then(({ useSimulationStateStore }) => {
    useSimulationStateStore.getState().setSaveError(String(err))
  })
}
