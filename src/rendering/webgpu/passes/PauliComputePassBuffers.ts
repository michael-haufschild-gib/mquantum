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
  packFFTAxisUniforms,
} from './computePassUtils'
import { buildFFTTwiddleTable, FFT_TWIDDLE_BYTES } from './FFTTwiddle'

/** PauliUniforms struct size in bytes (640 = 160 indices × 4) */
export const PAULI_UNIFORM_SIZE = 640
/** Diagnostics workgroup size — must match @workgroup_size in pauliDiagnostics.wgsl.ts */
const DIAG_WG = 64
/** Number of f32 values in diagnostic result buffer:
 *  totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad */
const DIAG_RESULT_COUNT = 8

/** GPU buffers created by {@link rebuildPauliBuffers}. */
export interface PauliBufferResult {
  /**
   * Merged spinor buffer: `array<vec2f>` of length `2 * totalSites`.
   * Layout: `spinor[c * totalSites + idx] = vec2f(re, im)` for c ∈ {0, 1}.
   * One 8-byte load replaces two 4-byte loads from the previous split
   * Re/Im buffers.
   */
  spinorBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  uniformBuffer: GPUBuffer
  /**
   * Per-(axis, direction) FFT axis-uniform buffers. Length = `latticeDim * 2`.
   * Each holds a 32-byte FFTAxisUniforms struct pre-populated for the
   * corresponding axis dispatch slot. Forward axes occupy slots [0, latticeDim);
   * inverse axes occupy [latticeDim, 2·latticeDim). With one bind group per
   * buffer, all FFT dispatches inside a Strang substep can run inside a single
   * compute pass without per-axis copyBufferToBuffer calls forcing pass
   * boundaries.
   */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed radix-2 twiddle table bound at binding 2 of every Pauli
   * shared-memory FFT dispatch. Replaces per-thread `cos/sin` at stages >= 2.
   * See `FFTTwiddle.ts` for layout. Same N_MAX_FFT_TWIDDLE = 128 cap as TDSE.
   */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  /** Scalar potential V(x) — filled once per parameter change, read every substep. */
  potentialBuffer: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  /** Number of axis slots per direction (== `latticeDim`). */
  fwdAxisCount: number
  diagNumWorkgroups: number
}

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface PauliDestroyableBuffers {
  spinorBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftAxisUniformBuffers: GPUBuffer[] | null
  fftTwiddleBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  packUniformBufferNoNorm: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
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
  old.spinorBuffer?.destroy()
  old.fftScratchA?.destroy()
  old.uniformBuffer?.destroy()
  if (old.fftAxisUniformBuffers) {
    for (const b of old.fftAxisUniformBuffers) b.destroy()
  }
  old.fftTwiddleBuffer?.destroy()
  old.packUniformBuffer?.destroy()
  old.packUniformBufferNoNorm?.destroy()
  old.potentialBuffer?.destroy()
  old.diagUniformBuffer?.destroy()
  old.diagPartialBuffer?.destroy()
  old.diagResultBuffer?.destroy()
  old.diagStagingBuffer?.destroy()

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  const S = 2 // Always 2 spinor components

  // Merged spinor buffer: `array<vec2f>` of length S * totalSites, where
  // spinor[c * totalSites + idx] = vec2f(re, im). Size in bytes is
  // S * totalSites * 8 (vs the previous 2 * S * totalSites * 4 split into
  // separate Re/Im storage buffers). Alignment for pack/unpack
  // per-component sub-bindings (offset = c * totalSites * 8) is safe:
  // Pauli enforces latticeDim >= 3 and per-axis gridSize >= 8, so
  // totalSites * 8 >= 4096, always a multiple of 256.
  const SPINOR_VEC2F_BYTES = 8
  const spinorBytes = S * totalSites * SPINOR_VEC2F_BYTES
  const spinorBuffer = device.createBuffer({
    label: 'pauli-spinor',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Scalar potential buffer V(x). Written once per parameter change by the
  // pauliPotential compute pass; read every substep by pauliPotentialHalf.
  const potentialBuffer = device.createBuffer({
    label: 'pauli-potential',
    size: totalSites * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  })

  // FFT scratch (interleaved complex: 2 floats per site).
  // The shared-memory FFT operates in-place on this single buffer; no
  // ping-pong scratch B is needed.
  const fftBytes = totalSites * 2 * Float32Array.BYTES_PER_ELEMENT
  const fftScratchA = device.createBuffer({
    label: 'pauli-fft-scratch-a',
    size: fftBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // PauliUniforms params buffer is STORAGE (not UNIFORM) because the struct
  // embeds scalar arrays that are spec-forbidden in uniform address space.
  // See pauliInit.wgsl.ts for the matching `var<storage, read>` declaration.
  const uniformBuffer = device.createBuffer({
    label: 'pauli-uniforms',
    size: PAULI_UNIFORM_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // PERF: per-(axis, direction) FFT axis-uniform buffers. Each holds a
  // 32-byte FFTAxisUniforms struct pre-populated for one dispatch slot.
  // With one bind group per buffer, the entire Strang substep (fwd FFT
  // axes × 2 components, kinetic, inv FFT axes × 2 components, V-half/
  // absorber/etc.) can run inside a single compute pass without
  // per-axis copyBufferToBuffer calls forcing pass boundaries.
  const fwdAxisCount = config.latticeDim
  const axisSlotCount = fwdAxisCount * 2 // forward + inverse
  const fftAxisStagingData = packFFTAxisUniforms(config, totalSites)
  const axisStagingBytes = new Uint8Array(fftAxisStagingData)
  const fftAxisUniformBuffers: GPUBuffer[] = new Array(axisSlotCount)
  for (let slot = 0; slot < axisSlotCount; slot++) {
    const buf = device.createBuffer({
      label: `pauli-fft-axis-uniforms-${slot}`,
      size: FFT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const slotOffset = slot * FFT_UNIFORM_SIZE
    const slotData = axisStagingBytes.slice(slotOffset, slotOffset + FFT_UNIFORM_SIZE)
    device.queue.writeBuffer(buf, 0, slotData)
    fftAxisUniformBuffers[slot] = buf
  }

  // CPU-precomputed radix-2 twiddle table. Replaces per-thread cos/sin in the
  // Stockham butterfly at stages s >= 2. Sized for N_MAX_FFT_TWIDDLE = 128
  // (Pauli per-axis grids fit in this bound); a single 512-byte buffer covers
  // every axis length. Uploaded once per rebuild — values are axis-independent.
  const fftTwiddleBuffer = device.createBuffer({
    label: 'pauli-fft-twiddle',
    size: FFT_TWIDDLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(fftTwiddleBuffer, 0, buildFFTTwiddleTable())

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
    spinorBuffer,
    fftScratchA,
    uniformBuffer,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    potentialBuffer,
    diagUniformBuffer,
    diagPartialBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    fwdAxisCount,
    diagNumWorkgroups,
  }
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

/** Fill the PauliUniforms struct into caller-owned typed-array views. */
export function packPauliUniforms(
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
  const fieldTypeId = fieldTypeMap[config.fieldType] ?? 0
  u32[o++] = fieldTypeId
  f32[o++] = config.fieldStrength
  f32[o++] = config.fieldDirection[0] // theta
  f32[o++] = config.fieldDirection[1] // phi
  f32[o++] = config.gradientStrength
  f32[o] = config.rotatingFrequency
  // Slots [36] (fieldVecBx) and [37] (fieldVecBy) follow. fieldVecBz lives at
  // [66] inside what was previously _pad2. Host precomputes the uniform-field
  // B vector so the shader fieldType=0 branch avoids 4 sin/cos per thread per
  // Strang substep. For fieldType != 0 these stay at 0 (zeroed by the fill on
  // line 320) — the shader does not read them on those paths.
  if (fieldTypeId === 0) {
    const B0 = config.fieldStrength
    const theta = config.fieldDirection[0] ?? 0
    const phi = config.fieldDirection[1] ?? 0
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)
    f32[36] = B0 * sinTheta * Math.cos(phi)
    f32[37] = B0 * sinTheta * Math.sin(phi)
    f32[66] = B0 * cosTheta
  }

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
    spinHelicity: 4,
    berryCurvature: 5,
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

  // kGridScale (offset 148*4 = 592, indices 148-159): 2π / (N · a) per dim.
  // Hoisted out of the kinetic kernel so each thread replaces a divide with
  // a multiply during k-vector construction. Mirrors TDSE/Dirac kGridScale.
  // Slots beyond latticeDim left at the zero-fill default (unused by shader).
  {
    const TWO_PI = Math.PI * 2
    for (let d = 0; d < config.latticeDim; d++) {
      const N = config.gridSize[d]!
      const a = config.spacing[d] ?? 0.1
      f32[148 + d] = TWO_PI / (N * a)
    }
  }

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
  packPauliUniforms(uniformU32, uniformF32, params)
  device.queue.writeBuffer(uniformBuffer, 0, uniformData)
}
