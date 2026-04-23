/**
 * Pauli Compute Pass — Buffer Creation & Uniform Writing
 *
 * Pure data-writing functions extracted from PauliComputePass.
 * Creates all GPU buffers and writes uniform data.
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'
import { sigmaMaxFromPmlConfig } from '@/lib/physics/pml/profile'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import {
  FFT_UNIFORM_SIZE,
  MAX_DIM,
  MAX_SLICE_POSITIONS_WRITE_COUNT,
  PACK_UNIFORM_SIZE,
  packFFTStageUniforms,
} from './computePassUtils'

/** PauliUniforms struct size in bytes (592 = 148 indices × 4) */
const UNIFORM_SIZE = 592
/** Diagnostics workgroup size — must match @workgroup_size in pauliDiagnostics.wgsl.ts */
const DIAG_WG = 64
/** Number of f32 values in diagnostic result buffer:
 *  totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad */
const DIAG_RESULT_COUNT = 8

/** GPU buffers created by {@link rebuildPauliBuffers}. */
export interface PauliBufferResult {
  spinorReBuffer: GPUBuffer
  spinorImBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  uniformBuffer: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftStagingBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  fwdStageCount: number
  diagNumWorkgroups: number
}

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface PauliDestroyableBuffers {
  spinorReBuffer: GPUBuffer | null
  spinorImBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  packUniformBufferNoNorm: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
}

/**
 * Destroy old GPU buffers and create all buffers required by the Pauli
 * compute pass for the given lattice configuration.
 *
 * @param device - WebGPU device
 * @param config - Current Pauli configuration (already sanitized)
 * @param old - Buffers from the previous configuration to destroy
 * @returns All newly created buffers and derived scalar state
 */
export function rebuildPauliBuffers(
  device: GPUDevice,
  config: PauliConfig,
  old: PauliDestroyableBuffers
): PauliBufferResult {
  // Destroy old buffers
  old.spinorReBuffer?.destroy()
  old.spinorImBuffer?.destroy()
  old.fftScratchA?.destroy()
  old.fftScratchB?.destroy()
  old.uniformBuffer?.destroy()
  old.fftUniformBuffer?.destroy()
  old.fftStagingBuffer?.destroy()
  old.packUniformBuffer?.destroy()
  old.packUniformBufferNoNorm?.destroy()
  old.diagUniformBuffer?.destroy()
  old.diagPartialBuffer?.destroy()
  old.diagResultBuffer?.destroy()
  old.diagStagingBuffer?.destroy()

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  const S = 2 // Always 2 spinor components

  // Spinor buffers: S components packed sequentially
  const spinorBytes = S * totalSites * Float32Array.BYTES_PER_ELEMENT
  const spinorReBuffer = device.createBuffer({
    label: 'pauli-spinor-re',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const spinorImBuffer = device.createBuffer({
    label: 'pauli-spinor-im',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // FFT scratch (interleaved complex: 2 floats per site)
  const fftBytes = totalSites * 2 * Float32Array.BYTES_PER_ELEMENT
  const fftScratchA = device.createBuffer({
    label: 'pauli-fft-scratch-a',
    size: fftBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftScratchB = device.createBuffer({
    label: 'pauli-fft-scratch-b',
    size: fftBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // PauliUniforms params buffer is STORAGE (not UNIFORM) because the struct
  // embeds scalar arrays that are spec-forbidden in uniform address space.
  // See pauliInit.wgsl.ts for the matching `var<storage, read>` declaration.
  const uniformBuffer = device.createBuffer({
    label: 'pauli-uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // FFT stage uniforms — sum(log2(N_d)) per direction, not max(log2(N))*dim
  let fwdStageCount = 0
  for (let d = 0; d < config.latticeDim; d++) {
    fwdStageCount += Math.round(Math.log2(gridSize[d]!))
  }
  const fftUniformBytes = fwdStageCount * 2 * FFT_UNIFORM_SIZE // fwd + inv
  const fftUniformBuffer = device.createBuffer({
    label: 'pauli-fft-uniforms',
    size: Math.max(32, fftUniformBytes),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const fftStagingBuffer = buildPauliFFTStagingData(device, config, totalSites)

  // Pack uniforms (with and without normalization)
  const packUniformBuffer = device.createBuffer({
    label: 'pauli-pack-uniforms',
    size: PACK_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const packUniformBufferNoNorm = device.createBuffer({
    label: 'pauli-pack-uniforms-no-norm',
    size: PACK_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // Write pack uniforms (dual views: u32 for totalElements, f32 for invN)
  const packBuf = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const packU32 = new Uint32Array(packBuf)
  const packF32 = new Float32Array(packBuf)
  packU32[0] = totalSites
  packF32[1] = 1.0 / totalSites // normalization factor
  device.queue.writeBuffer(packUniformBuffer, 0, packBuf)
  packF32[1] = 1.0 // no normalization
  device.queue.writeBuffer(packUniformBufferNoNorm, 0, packBuf)

  // Diagnostics buffers
  const diagNumWorkgroups = Math.ceil(totalSites / DIAG_WG)

  const diagUniformBuffer = device.createBuffer({
    label: 'pauli-diag-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const diagPartialBuffer = device.createBuffer({
    label: 'pauli-diag-partial',
    size: diagNumWorkgroups * DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagResultBuffer = device.createBuffer({
    label: 'pauli-diag-result',
    size: DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const diagStagingBuffer = device.createBuffer({
    label: 'pauli-diag-staging',
    size: DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  // Write diagnostics uniforms
  const diagData = new Uint32Array(4)
  diagData[0] = totalSites
  diagData[1] = diagNumWorkgroups
  diagData[2] = 2 // spinor size always 2
  device.queue.writeBuffer(diagUniformBuffer, 0, diagData)

  // Reset diagnostics store to clear stale observables from previous config
  useDiagnosticsStore.getState().resetPauli()

  return {
    spinorReBuffer,
    spinorImBuffer,
    fftScratchA,
    fftScratchB,
    uniformBuffer,
    fftUniformBuffer,
    fftStagingBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    diagUniformBuffer,
    diagPartialBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    fwdStageCount,
    diagNumWorkgroups,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// FFT Staging Data
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pre-compute all FFT stage uniforms for all axes and both directions.
 * Matches FFTStageUniforms struct layout (tdseStockhamFFT.wgsl.ts):
 *   axisDim: u32, stage: u32, direction: f32, totalElements: u32,
 *   axisStride: u32, batchCount: u32, invN: f32, _pad0: u32
 *
 * Slots laid out in execution order: forward FFT axes (latticeDim-1 down to 0),
 * then inverse FFT axes (same axis order). Each axis has log2(N) stages in
 * ascending order (0..log2N-1) for both directions.
 */
function buildPauliFFTStagingData(
  device: GPUDevice,
  config: PauliConfig,
  totalSites: number
): GPUBuffer {
  const data = packFFTStageUniforms(config, totalSites)
  const buf = device.createBuffer({
    label: 'pauli-fft-staging',
    size: Math.max(32, data.byteLength),
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  })
  new Uint8Array(buf.getMappedRange()).set(new Uint8Array(data))
  buf.unmap()
  return buf
}

// ───────────────────────────────────────────────────────────────────────────
// Uniform Writing
// ───────────────────────────────────────────────────────────────────────────

/** Parameters for writing PauliUniforms to a GPU buffer. */
export interface PauliUniformParams {
  config: PauliConfig
  totalSites: number
  simTime: number
  maxDensity: number
  strides: number[]
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  boundingRadius?: number
}

/**
 * Write the PauliUniforms struct into the given uniform buffer.
 *
 * @param device - WebGPU device
 * @param uniformBuffer - Target GPU buffer
 * @param uniformData - Backing ArrayBuffer (reused for zero-alloc writes)
 * @param uniformU32 - Uint32Array view of uniformData
 * @param uniformF32 - Float32Array view of uniformData
 * @param params - All values to write
 */
export function writePauliUniforms(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  uniformData: ArrayBuffer,
  uniformU32: Uint32Array,
  uniformF32: Float32Array,
  params: PauliUniformParams
): void {
  const {
    config,
    totalSites,
    simTime,
    maxDensity,
    strides,
    basisX,
    basisY,
    basisZ,
    boundingRadius,
  } = params
  const u32 = uniformU32
  const f32 = uniformF32
  u32.fill(0)

  const gridSize = config.gridSize.slice(0, config.latticeDim)

  let o = 0
  // Grid parameters (u32)
  u32[o++] = config.latticeDim
  for (let d = 0; d < MAX_DIM; d++) u32[o++] = gridSize[d] ?? 1
  for (let d = 0; d < MAX_DIM; d++) u32[o++] = strides[d] ?? 0
  u32[o] = totalSites

  // Physics parameters (f32, offset 26*4 = 104)
  o = 26
  f32[o++] = config.dt
  f32[o++] = config.hbar
  f32[o++] = config.mass
  f32[o] = simTime

  // Magnetic field (offset 30*4 = 120)
  o = 30
  const fieldTypeMap: Record<string, number> = {
    uniform: 0,
    gradient: 1,
    rotating: 2,
    quadrupole: 3,
  }
  u32[o++] = fieldTypeMap[config.fieldType] ?? 0
  f32[o++] = config.fieldStrength
  f32[o++] = config.fieldDirection[0] // theta
  f32[o++] = config.fieldDirection[1] // phi
  f32[o++] = config.gradientStrength
  f32[o] = config.rotatingFrequency
  // 2 padding floats (o+1, o+2) skipped; next section uses absolute offset

  // Initial spin state (offset 38*4 = 152)
  o = 38
  f32[o++] = config.initialSpinDirection[0] // theta
  f32[o] = config.initialSpinDirection[1] // phi

  // Initial condition (offset 40*4 = 160)
  o = 40
  const icMap: Record<string, number> = {
    gaussianSpinUp: 0,
    gaussianSpinDown: 1,
    gaussianSuperposition: 2,
    planeWaveSpinor: 3,
  }
  u32[o++] = icMap[config.initialCondition] ?? 0
  f32[o++] = config.packetWidth
  for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.packetCenter[d] ?? 0
  for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.packetMomentum[d] ?? 0

  // Potential (offset 67*4 = 268)
  o = 67
  const potMap: Record<string, number> = {
    none: 0,
    harmonicTrap: 1,
    harmonic: 1,
    barrier: 2,
    doubleWell: 3,
  }
  u32[o++] = potMap[config.potentialType] ?? 0
  f32[o++] = config.harmonicOmega
  f32[o++] = config.wellDepth
  f32[o++] = config.wellWidth
  u32[o] = config.showPotential ? 1 : 0

  // PML absorber (offset 72*4 = 288)
  o = 72
  u32[o++] = config.absorberEnabled ? 1 : 0
  f32[o++] = config.absorberWidth
  // Auto-compute σ_max from PML target reflection coefficient
  f32[o] = sigmaMaxFromPmlConfig(config)
  // o+1 would be pad slot; skipped since next section uses absolute offset

  // Display (offset 76*4 = 304)
  o = 76
  const fvMap: Record<string, number> = {
    spinDensity: 0,
    totalDensity: 1,
    spinExpectation: 2,
    coherence: 3,
  }
  u32[o++] = fvMap[config.fieldView] ?? 0
  u32[o++] = config.autoScale ? 1 : 0
  f32[o++] = config.spinUpColor[0]
  f32[o++] = config.spinUpColor[1]
  f32[o++] = config.spinUpColor[2]
  f32[o++] = config.spinDownColor[0]
  f32[o++] = config.spinDownColor[1]
  f32[o] = config.spinDownColor[2]

  // Bounding / Basis (offset 84*4 = 336)
  o = 84
  f32[o++] = boundingRadius ?? 5.0
  f32[o] = maxDensity
  // 2 padding floats

  // Basis vectors — N-D arrays for proper higher-dim rotation (offset 88*4 = 352)
  o = 88
  if (basisX) {
    for (let d = 0; d < Math.min(basisX.length, MAX_DIM); d++) f32[o + d] = basisX[d]!
  } else {
    f32[o] = 1.0
  }
  o += MAX_DIM // array<f32, 12>
  if (basisY) {
    for (let d = 0; d < Math.min(basisY.length, MAX_DIM); d++) f32[o + d] = basisY[d]!
  } else {
    f32[o + 1] = 1.0
  }
  o += MAX_DIM
  if (basisZ) {
    for (let d = 0; d < Math.min(basisZ.length, MAX_DIM); d++) f32[o + d] = basisZ[d]!
  } else {
    f32[o + 2] = 1.0
  }
  // Spacing (offset 124*4 = 496)
  o = 124
  for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.spacing[d] ?? 0.1

  // Slice positions (offset 136*4 = 544, WGSL array<f32, 12>)
  // WGSL reads slicePositions[d] where d is the full dimension index (d >= 3).
  // config.slicePositions is 0-indexed for extra dims: [0] = dim 3, [1] = dim 4, etc.
  // Write at WGSL index (i + 3) to match the shader's access pattern.
  // Clamped to MAX_SLICE_POSITIONS_WRITE_COUNT so an oversized store array
  // cannot overflow past the 12-slot region into the next uniform field.
  o = 136
  // Indices 0-2 (visible dims): always 0 — shader only reads d >= 3
  const pauliSliceN = Math.min(config.slicePositions.length, MAX_SLICE_POSITIONS_WRITE_COUNT)
  for (let i = 0; i < pauliSliceN; i++) {
    const d = i + 3 // physical dimension index
    let pos = config.slicePositions[i] ?? 0
    if (config.sliceAnimationEnabled && d < config.latticeDim) {
      const PHI = 1.618033988749895
      const phase = i * PHI
      const t1 = simTime * config.sliceSpeed * 2 * Math.PI + phase
      const t2 = simTime * config.sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
      pos += config.sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
    }
    f32[o + d] = pos
  }

  device.queue.writeBuffer(uniformBuffer, 0, uniformData)
}
