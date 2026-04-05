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
   * Called eagerly (before GPU readback starts) to snapshot store state
   * while it still matches the buffer contents being copied.
   */
  getMetadata: () => Promise<StateSaveMetadata>
  /** Called when the async operation completes (success or failure). */
  onFinished: () => void
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Initiate an async GPU readback → serialize → download state save.
 *
 * Creates a dedicated command encoder, copies source buffers to staging,
 * submits immediately, then asynchronously maps, extracts, serializes,
 * and downloads the data. Metadata is captured eagerly before the async
 * readback to prevent stale store reads. All staging buffers are destroyed
 * on every code path (success, early return, and error).
 *
 * @param ctx - Render context (only `device` is used; the frame encoder is not touched)
 * @param request - Save parameters
 */
export function requestStateSave(ctx: WebGPURenderContext, request: StateSaveRequest): void {
  const { device } = ctx
  const { source, totalSites, label, getMetadata, onFinished } = request

  // Capture metadata eagerly — store state must match buffer contents
  const metadataPromise = getMetadata()

  if (source.layout === 'separate') {
    requestSeparateSave(device, source, totalSites, label, metadataPromise, onFinished)
  } else {
    requestInterleavedSave(device, source, totalSites, label, metadataPromise, onFinished)
  }
}

/** Save from two separate re/im buffers (TDSE, FSF, Dirac, Pauli). */
function requestSeparateSave(
  device: GPUDevice,
  source: SeparateBufferSource,
  totalSites: number,
  label: string,
  metadataPromise: Promise<StateSaveMetadata>,
  onFinished: () => void
): void {
  let stagingRe: GPUBuffer | null = null
  let stagingIm: GPUBuffer | null = null

  try {
    stagingRe = device.createBuffer({
      label: `${label}-save-staging-re`,
      size: source.byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    stagingIm = device.createBuffer({
      label: `${label}-save-staging-im`,
      size: source.byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    const encoder = device.createCommandEncoder({ label: `${label}-state-save` })
    encoder.copyBufferToBuffer(source.reBuffer, 0, stagingRe, 0, source.byteSize)
    encoder.copyBufferToBuffer(source.imBuffer, 0, stagingIm, 0, source.byteSize)
    device.queue.submit([encoder.finish()])
  } catch (err) {
    stagingRe?.destroy()
    stagingIm?.destroy()
    reportSaveError(err)
    onFinished()
    return
  }

  const re$ = stagingRe
  const im$ = stagingIm

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (re$.mapState !== 'unmapped' || im$.mapState !== 'unmapped') {
        re$.destroy()
        im$.destroy()
        onFinished()
        return
      }
      await Promise.all([re$.mapAsync(GPUMapMode.READ), im$.mapAsync(GPUMapMode.READ)])

      const re = new Float32Array(re$.getMappedRange()).slice(0)
      const im = new Float32Array(im$.getMappedRange()).slice(0)
      re$.unmap()
      im$.unmap()
      re$.destroy()
      im$.destroy()

      const meta = await metadataPromise
      await serializeAndDownload(re, im, totalSites, meta)
      onFinished()
    })
    .catch((err) => {
      re$.destroy()
      im$.destroy()
      reportSaveError(err)
      onFinished()
    })
}

/** Save from a single interleaved complex buffer (Quantum Walk). */
function requestInterleavedSave(
  device: GPUDevice,
  source: InterleavedBufferSource,
  totalSites: number,
  label: string,
  metadataPromise: Promise<StateSaveMetadata>,
  onFinished: () => void
): void {
  let staging: GPUBuffer | null = null

  try {
    staging = device.createBuffer({
      label: `${label}-save-staging`,
      size: source.byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    const encoder = device.createCommandEncoder({ label: `${label}-state-save` })
    encoder.copyBufferToBuffer(source.buffer, 0, staging, 0, source.byteSize)
    device.queue.submit([encoder.finish()])
  } catch (err) {
    staging?.destroy()
    reportSaveError(err)
    onFinished()
    return
  }

  const s$ = staging

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (s$.mapState !== 'unmapped') {
        s$.destroy()
        onFinished()
        return
      }
      await s$.mapAsync(GPUMapMode.READ)
      const interleaved = new Float32Array(s$.getMappedRange())

      const n = source.elementCount
      const re = new Float32Array(n)
      const im = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        re[i] = interleaved[i * 2]!
        im[i] = interleaved[i * 2 + 1]!
      }
      s$.unmap()
      s$.destroy()

      const meta = await metadataPromise
      await serializeAndDownload(re, im, totalSites, meta)
      onFinished()
    })
    .catch((err) => {
      s$.destroy()
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
  meta: StateSaveMetadata
): Promise<void> {
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
