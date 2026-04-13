/**
 * TDSE Compute Pass — Buffer Creation
 *
 * Creates all GPU buffers required by the TDSE compute pass.
 * Extracted from TDSEComputePass to keep individual files under the 600-line limit.
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { FFT_UNIFORM_SIZE, PACK_UNIFORM_SIZE } from './computePassUtils'
import { buildTdseFFTAxisStagingData, buildTdseFFTStagingData } from './TDSEComputePassUniforms'

/**
 * TDSEUniforms struct size in bytes.
 *
 * Last documented offsets in `tdseUniforms.wgsl.ts`:
 *   - compactDimsMask:    u32 @ 736
 *   - branchingEnabled:   u32 @ 740
 *   - branchPlanePosition: f32 @ 744
 *   - bhMass:             f32 @ 748 (blackHoleRingdown / Regge-Wheeler)
 *   - bhMultipoleL:       f32 @ 752
 *   - bhSpin:             f32 @ 756
 *   - _padBh0/_padBh1:    u32 @ 760/764 (16-byte align)
 *
 * Total = 764 + 4 = 768. Update both this constant and the WGSL struct
 * if you add new fields, and keep this comment in sync — the previous
 * "740 = 736 + 4" annotation drifted when stochastic-decoherence
 * branching was added and silently misled readers about the layout.
 *
 * Exported as `TDSE_UNIFORM_SIZE` so tests that validate struct packing
 * offsets can import the canonical size instead of hardcoding a literal
 * that silently drifts from the WGSL definition.
 */
export const TDSE_UNIFORM_SIZE = 768
const UNIFORM_SIZE = TDSE_UNIFORM_SIZE
/** Diagnostics workgroup size (must match @workgroup_size in diagnostic shaders) */
const DIAG_WG = 256
/** DiagReduceUniforms struct size (32 bytes) */
const DIAG_UNIFORM_SIZE = 32
/** Number of f32 values in diagnostic result buffer: [norm, maxDensity, normLeft, normRight, sumPsi4] */
const DIAG_RESULT_COUNT = 5

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface TdseDestroyableBuffers {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  /** PERF: one pre-populated uniform buffer per (axis, direction) slot — eliminates
   *  per-axis copyBufferToBuffer + per-dispatch compute pass boundaries. */
  fftAxisUniformBuffers?: GPUBuffer[] | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
}

/**
 * GPU buffers created by {@link rebuildTdseBuffers}.
 * Every field is non-null after a successful call.
 */
export interface TdseBufferResult {
  psiReBuffer: GPUBuffer
  psiImBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  uniformBuffer: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftStagingBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  fftAxisStagingBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms for batched Strang FFT dispatch
   *  (length = 2 × latticeDim: forward axes first, then inverse axes).
   *  Each buffer holds a single pre-populated FFTAxisUniforms struct. */
  fftAxisUniformBuffers: GPUBuffer[]
  packUniformBuffer: GPUBuffer
  omegaStagingBuffer: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagPartialIprBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  fwdStageCount: number
  /** Forward axis count for shared-mem FFT (= latticeDim; inverse starts at this offset) */
  fwdAxisCount: number
  diagNumWorkgroups: number
}

/**
 * Helper callbacks that bridge to the base class's protected methods.
 */
export interface TdseBufferHelpers {
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/**
 * Destroy old GPU buffers and create all buffers required by the TDSE
 * compute pass for the given lattice configuration.
 *
 * @param device - WebGPU device
 * @param config - Current TDSE configuration (already sanitized)
 * @param old - Buffers from the previous configuration to destroy
 * @param helpers - Base-class helper methods
 * @returns All newly created buffers and derived scalar state
 */
export function rebuildTdseBuffers(
  device: GPUDevice,
  config: TdseConfig,
  old: TdseDestroyableBuffers,
  helpers: TdseBufferHelpers
): TdseBufferResult {
  // Destroy old buffers
  old.psiReBuffer?.destroy()
  old.psiImBuffer?.destroy()
  old.potentialBuffer?.destroy()
  old.fftScratchA?.destroy()
  old.fftScratchB?.destroy()
  old.uniformBuffer?.destroy()
  old.fftUniformBuffer?.destroy()
  old.fftStagingBuffer?.destroy()
  old.fftAxisUniformBuffer?.destroy()
  old.fftAxisStagingBuffer?.destroy()
  if (old.fftAxisUniformBuffers) {
    for (const b of old.fftAxisUniformBuffers) b.destroy()
  }
  old.packUniformBuffer?.destroy()
  old.omegaStagingBuffer?.destroy()
  old.diagUniformBuffer?.destroy()
  old.diagPartialSumsBuffer?.destroy()
  old.diagPartialMaxBuffer?.destroy()
  old.diagPartialLeftBuffer?.destroy()
  old.diagPartialRightBuffer?.destroy()
  old.diagPartialIprBuffer?.destroy()
  old.diagResultBuffer?.destroy()
  old.diagStagingBuffer?.destroy()

  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) totalSites *= config.gridSize[d]!
  const siteBytes = totalSites * 4
  const complexBytes = totalSites * 8 // 2 floats per complex

  const psiReBuffer = device.createBuffer({
    label: 'tdse-psiRe',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const psiImBuffer = device.createBuffer({
    label: 'tdse-psiIm',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const potentialBuffer = device.createBuffer({
    label: 'tdse-potential',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const fftScratchA = device.createBuffer({
    label: 'tdse-fft-scratch-a',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftScratchB = device.createBuffer({
    label: 'tdse-fft-scratch-b',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const uniformBuffer = helpers.createUniformBuffer(device, UNIFORM_SIZE, 'tdse-uniforms')
  const fftUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'tdse-fft-uniforms'
  )
  const packUniformBuffer = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'tdse-pack-uniforms'
  )

  // FFT staging buffer: pre-computed stage uniforms for all axes x both directions.
  // encoder.copyBufferToBuffer from staging to fftUniformBuffer before each dispatch
  // ensures correct per-stage data (device.queue.writeBuffer would race with command buffer).
  let fwdStageCount = 0
  for (let d = 0; d < config.latticeDim; d++) {
    fwdStageCount += Math.log2(config.gridSize[d]!)
  }
  const totalFFTStages = fwdStageCount * 2 // forward + inverse
  const fftStagingBuffer = device.createBuffer({
    label: 'tdse-fft-staging',
    size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  // Pre-compute and upload FFT staging data once (only depends on grid config)
  const fftStagingData = buildTdseFFTStagingData(config, totalSites)
  device.queue.writeBuffer(fftStagingBuffer, 0, fftStagingData)

  // Shared-memory FFT: per-axis uniform buffer + staging buffer
  const fftAxisUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'tdse-fft-axis-uniforms'
  )
  const axisSlotCount = config.latticeDim * 2 // forward + inverse
  const fftAxisStagingBuffer = device.createBuffer({
    label: 'tdse-fft-axis-staging',
    size: Math.max(FFT_UNIFORM_SIZE, axisSlotCount * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftAxisStagingData = buildTdseFFTAxisStagingData(config, totalSites)
  device.queue.writeBuffer(fftAxisStagingBuffer, 0, fftAxisStagingData)

  // PERF: per-slot uniform buffers for batched Strang-step FFT dispatch.
  // Each (axis, direction) gets its own uniform buffer with its 32-byte
  // FFTAxisUniforms struct pre-populated. With one bind group per buffer,
  // all latticeDim × 2 FFT dispatches can run inside a single compute pass
  // without per-axis copyBufferToBuffer calls forcing pass boundaries.
  const fftAxisUniformBuffers: GPUBuffer[] = new Array(axisSlotCount)
  const axisStagingBytes = new Uint8Array(fftAxisStagingData)
  for (let slot = 0; slot < axisSlotCount; slot++) {
    const buf = helpers.createUniformBuffer(
      device,
      FFT_UNIFORM_SIZE,
      `tdse-fft-axis-uniforms-${slot}`
    )
    const slotOffset = slot * FFT_UNIFORM_SIZE
    const slotData = axisStagingBytes.slice(slotOffset, slotOffset + FFT_UNIFORM_SIZE)
    device.queue.writeBuffer(buf, 0, slotData)
    fftAxisUniformBuffers[slot] = buf
  }

  // Pack uniforms: totalSites and invN don't change between frames
  const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const pu32 = new Uint32Array(packData)
  const pf32 = new Float32Array(packData)
  pu32[0] = totalSites
  pf32[1] = 1.0 / totalSites
  device.queue.writeBuffer(packUniformBuffer, 0, packData)

  // Staging buffer for trap-frequency quench: holds evolution harmonicOmega (4 bytes)
  // to overwrite the init-time value between init and potential fill passes.
  const omegaStagingBuffer = device.createBuffer({
    label: 'tdse-omega-staging',
    size: 4,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Diagnostics: norm reduction buffers
  const diagNumWorkgroups = Math.ceil(totalSites / DIAG_WG)
  const diagUniformBuffer = helpers.createUniformBuffer(
    device,
    DIAG_UNIFORM_SIZE,
    'tdse-diag-uniforms'
  )
  const diagPartialSumsBuffer = device.createBuffer({
    label: 'tdse-diag-partial-sums',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialMaxBuffer = device.createBuffer({
    label: 'tdse-diag-partial-max',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialLeftBuffer = device.createBuffer({
    label: 'tdse-diag-partial-left',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialRightBuffer = device.createBuffer({
    label: 'tdse-diag-partial-right',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialIprBuffer = device.createBuffer({
    label: 'tdse-diag-partial-ipr',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagResultBuffer = device.createBuffer({
    label: 'tdse-diag-result',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const diagStagingBuffer = device.createBuffer({
    label: 'tdse-diag-staging',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  useDiagnosticsStore.getState().resetTdse()

  return {
    psiReBuffer,
    psiImBuffer,
    potentialBuffer,
    fftScratchA,
    fftScratchB,
    uniformBuffer,
    fftUniformBuffer,
    fftStagingBuffer,
    fftAxisUniformBuffer,
    fftAxisStagingBuffer,
    fftAxisUniformBuffers,
    packUniformBuffer,
    omegaStagingBuffer,
    diagUniformBuffer,
    diagPartialSumsBuffer,
    diagPartialMaxBuffer,
    diagPartialLeftBuffer,
    diagPartialRightBuffer,
    diagPartialIprBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    fwdStageCount,
    fwdAxisCount: config.latticeDim,
    diagNumWorkgroups,
  }
}

/** Mutable buffer fields on TDSEComputePass that mirror TdseBufferResult + TdseDestroyableBuffers. */
export interface TdsePassBufferFields {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffers: GPUBuffer[] | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  totalSites: number
  fwdAxisCount: number
  diagNumWorkgroups: number
}

/** Collect old buffer references from the pass for destroy-and-rebuild. */
export function collectOldBuffers(
  fields: TdsePassBufferFields,
  diagResultBuffer: GPUBuffer | null,
  diagStagingBuffer: GPUBuffer | null
): TdseDestroyableBuffers {
  return { ...fields, diagResultBuffer, diagStagingBuffer }
}

/** Apply rebuild result to the pass's mutable buffer fields and derived scalars. */
export function applyBufferResult(fields: TdsePassBufferFields, r: TdseBufferResult): void {
  fields.psiReBuffer = r.psiReBuffer
  fields.psiImBuffer = r.psiImBuffer
  fields.potentialBuffer = r.potentialBuffer
  fields.fftScratchA = r.fftScratchA
  fields.fftScratchB = r.fftScratchB
  fields.uniformBuffer = r.uniformBuffer
  fields.fftUniformBuffer = r.fftUniformBuffer
  fields.fftStagingBuffer = r.fftStagingBuffer
  fields.fftAxisUniformBuffer = r.fftAxisUniformBuffer
  fields.fftAxisStagingBuffer = r.fftAxisStagingBuffer
  fields.fftAxisUniformBuffers = r.fftAxisUniformBuffers
  fields.packUniformBuffer = r.packUniformBuffer
  fields.omegaStagingBuffer = r.omegaStagingBuffer
  fields.diagUniformBuffer = r.diagUniformBuffer
  fields.diagPartialSumsBuffer = r.diagPartialSumsBuffer
  fields.diagPartialMaxBuffer = r.diagPartialMaxBuffer
  fields.diagPartialLeftBuffer = r.diagPartialLeftBuffer
  fields.diagPartialRightBuffer = r.diagPartialRightBuffer
  fields.diagPartialIprBuffer = r.diagPartialIprBuffer
  fields.totalSites = r.totalSites
  fields.fwdAxisCount = r.fwdAxisCount
  fields.diagNumWorkgroups = r.diagNumWorkgroups
}
