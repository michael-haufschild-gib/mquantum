/**
 * Dirac Compute Pass — Types & Buffer Creation
 *
 * Type definitions and GPU buffer lifecycle for the Dirac equation compute pass.
 * Merged from DiracComputePassTypes + DiracComputePassBuffers.
 */

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { spinorSize } from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import {
  assertPow2Log2,
  FFT_UNIFORM_SIZE,
  PACK_UNIFORM_SIZE,
  packFFTAxisUniforms,
} from './computePassUtils'
import { buildFFTTwiddleTable, FFT_TWIDDLE_BYTES } from './FFTTwiddle'

// ───────────────────────────────────────────────────────────────────────────
// Type definitions
// ───────────────────────────────────────────────────────────────────────────

/**
 * GPU buffers created by {@link rebuildDiracBuffers}.
 * Every field is non-null after a successful call.
 */
export interface DiracBufferResult {
  /**
   * Merged spinor buffer: `array<vec2f>` of length `S * totalSites`.
   * Component c at site idx = `spinor[c*totalSites + idx] = vec2f(re, im)`.
   * Replaces the previous split `spinorReBuffer` / `spinorImBuffer` layout so
   * the gamma mat-vec loops perform one 8-byte complex load per component
   * rather than two 4-byte f32 loads.
   */
  spinorBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  gammaBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  uniformBuffer: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftStagingBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  fftAxisStagingBuffer: GPUBuffer
  /**
   * Per-slot FFT axis uniform buffers (one per axis per direction).
   * Enables batching every FFT axis dispatch into a single open compute pass
   * without copyBufferToBuffer forcing pass boundaries. Length = latticeDim * 2
   * (latticeDim forward axes followed by latticeDim inverse axes).
   */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed radix-2 twiddle table bound to every Dirac FFT dispatch
   * (per-stage Stockham + shared-mem). Replaces per-thread `cos/sin` at
   * stages >= 2. See `FFTTwiddle.ts` for layout. Same buffer shape as the
   * TDSE twiddle table — Dirac FFT axis lengths fit in N_MAX_FFT_TWIDDLE=128.
   */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialNormBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialParticleBuffer: GPUBuffer
  diagPartialAntiBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  currentSpinorSize: number
  fwdStageCount: number
  diagNumWorkgroups: number
}

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface DiracDestroyableBuffers {
  spinorBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  gammaBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffers: GPUBuffer[] | null
  fftTwiddleBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  packUniformBufferNoNorm: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialNormBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialParticleBuffer: GPUBuffer | null
  diagPartialAntiBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
}

/**
 * Pipeline and bind group layout objects created by {@link buildDiracPipelines}.
 *
 * Pipelines for the four site-based kernels that consume N-D coords (init,
 * potential, absorber, kinetic) are emitted in two variants: a 1-D dispatch
 * variant (`@workgroup_size(64)`, decodes coords via `linearToND`) and a 3-D
 * dispatch variant (`@workgroup_size(4, 4, 4)`, reads coords directly from
 * `gid.xyz`). The `use3DSiteDispatch` flag indicates which variant the
 * `*Pipeline` field references — `true` when `latticeDim === 3`. The 3-D path
 * eliminates the per-thread `linearToND` decode (a few shifts + masks +
 * `firstTrailingBit` calls per dim, since strides are pow-of-2). Bind group
 * layouts are unchanged between variants, so bind groups built from this
 * result work for both paths.
 */
export interface DiracPipelineResult {
  initPipeline: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  potentialPipeline: GPUComputePipeline
  potentialBGL: GPUBindGroupLayout
  potentialHalfPipeline: GPUComputePipeline
  potentialHalfBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  packBGL: GPUBindGroupLayout
  unpackPipeline: GPUComputePipeline
  unpackBGL: GPUBindGroupLayout
  fftStagePipeline: GPUComputePipeline
  fftStageBGL: GPUBindGroupLayout
  fftSharedMemPipeline: GPUComputePipeline
  fftSharedMemBGL: GPUBindGroupLayout
  kineticPipeline: GPUComputePipeline
  kineticBGL: GPUBindGroupLayout
  writeGridPipeline: GPUComputePipeline
  writeGridBGL: GPUBindGroupLayout
  diagReducePipeline: GPUComputePipeline
  diagReduceBGL: GPUBindGroupLayout
  diagFinalizePipeline: GPUComputePipeline
  diagFinalizeBGL: GPUBindGroupLayout
  /**
   * `true` when the init/potential/absorber/kinetic pipelines were built from
   * the 3-D dispatch variant (`@workgroup_size(4, 4, 4)`, `gid.xyz`-direct
   * coords). Caller must use a 3-D workgroup count for these dispatches.
   * Always `false` for `latticeDim > 3`.
   */
  use3DSiteDispatch: boolean
}

/**
 * Bind group objects created by {@link rebuildDiracBindGroups}.
 */
export interface DiracBindGroupResult {
  initBG: GPUBindGroup | null
  potentialBG: GPUBindGroup | null
  potentialHalfBG: GPUBindGroup | null
  fftStageABBG: GPUBindGroup | null
  fftStageBABG: GPUBindGroup | null
  fftSharedMemBG: GPUBindGroup | null
  /**
   * Per-slot shared-memory FFT bind groups (one per axis per direction).
   * Indexed by fftSlot: forward axes in [0, latticeDim), inverse axes in
   * [latticeDim, 2*latticeDim). Populated when the buffer layer provides
   * per-slot uniform buffers; enables single-compute-pass Strang batching.
   */
  fftSharedMemBGs: GPUBindGroup[]
  kineticBG: GPUBindGroup | null
  writeGridBG: GPUBindGroup | null
  diagReduceBG: GPUBindGroup | null
  diagFinalizeBG: GPUBindGroup | null
  renormalizeBG: GPUBindGroup | null
  renormalizeUniformBuffer: GPUBuffer | null
  cachedPackBGs: GPUBindGroup[]
  cachedUnpackBGs: GPUBindGroup[]
  cachedUnpackBGsNoNorm: GPUBindGroup[]
}

/** Buffers and resources needed to create bind groups. */
export interface DiracBindGroupInputs {
  uniformBuffer: GPUBuffer
  spinorBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  gammaBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  fftAxisUniformBuffers: GPUBuffer[]
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialNormBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialParticleBuffer: GPUBuffer
  diagPartialAntiBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
  currentSpinorSize: number
}

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by DiracComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface DiracPassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

// ───────────────────────────────────────────────────────────────────────────
// Buffer creation
// ───────────────────────────────────────────────────────────────────────────

/** DiracUniforms struct size in bytes (592 — includes kGridScale) */
const UNIFORM_SIZE = 592
/** Diagnostics workgroup size */
const DIAG_WG = 256
/** DiracDiagUniforms struct size (16 bytes: totalSites, numWorkgroups, spinorSize, pad) */
const DIAG_UNIFORM_SIZE = 16
/** Number of f32 values in diagnostic result buffer */
const DIAG_RESULT_COUNT = 4

/**
 * Destroy old GPU buffers and create all buffers required by the Dirac
 * compute pass for the given lattice configuration.
 *
 * @param device - WebGPU device
 * @param config - Current Dirac configuration (already sanitized)
 * @param old - Buffers from the previous configuration to destroy
 * @param helpers - Base-class helper methods
 * @param buildFFTStagingData - Callback to generate pre-computed FFT stage uniforms
 * @returns All newly created buffers and derived scalar state
 */
export function rebuildDiracBuffers(
  device: GPUDevice,
  config: DiracConfig,
  old: DiracDestroyableBuffers,
  helpers: DiracPassHelpers,
  buildFFTStagingData: (config: DiracConfig, totalSites: number) => ArrayBuffer
): DiracBufferResult {
  // Destroy old buffers
  old.spinorBuffer?.destroy()
  old.potentialBuffer?.destroy()
  old.gammaBuffer?.destroy()
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
  old.fftTwiddleBuffer?.destroy()
  old.packUniformBuffer?.destroy()
  old.packUniformBufferNoNorm?.destroy()
  old.diagUniformBuffer?.destroy()
  old.diagPartialNormBuffer?.destroy()
  old.diagPartialMaxBuffer?.destroy()
  old.diagPartialParticleBuffer?.destroy()
  old.diagPartialAntiBuffer?.destroy()
  old.diagResultBuffer?.destroy()
  old.diagStagingBuffer?.destroy()

  // Compute dimensions
  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) totalSites *= config.gridSize[d]!
  const S = spinorSize(config.latticeDim)

  // Merged spinor buffer: S × totalSites vec2f (8 bytes per complex element).
  // Component c at site idx = spinor[c*totalSites + idx] = vec2f(re, im).
  // One vec2f load per site replaces two f32 loads — halves address
  // arithmetic in the S-wide preload of the gamma mat-vec kernels.
  const spinorBytes = S * totalSites * 8
  const spinorBuffer = device.createBuffer({
    label: 'dirac-spinor',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Potential buffer (scalar, one per site)
  const siteBytes = totalSites * 4
  const potentialBuffer = device.createBuffer({
    label: 'dirac-potential',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // Gamma matrices buffer: (N+1) matrices × S×S×2 floats
  const gammaFloats = (config.latticeDim + 1) * S * S * 2
  const gammaBuffer = device.createBuffer({
    label: 'dirac-gamma-matrices',
    size: gammaFloats * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // FFT scratch buffers (used for one component at a time)
  const complexBytes = totalSites * 8
  const fftScratchA = device.createBuffer({
    label: 'dirac-fft-scratch-a',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftScratchB = device.createBuffer({
    label: 'dirac-fft-scratch-b',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // DiracUniforms params buffer is STORAGE (not UNIFORM) because the struct
  // embeds scalar arrays that are spec-forbidden in uniform address space.
  // See diracInit.wgsl.ts for the matching `var<storage, read>` declaration.
  const uniformBuffer = device.createBuffer({
    label: 'dirac-uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const fftUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'dirac-fft-uniforms'
  )
  const packUniformBuffer = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'dirac-pack-uniforms'
  )

  // FFT staging buffer (Stockham per-stage fallback — still allocated for diagnostics FFT)
  let stockhamFwdStageCount = 0
  for (let d = 0; d < config.latticeDim; d++) {
    stockhamFwdStageCount += assertPow2Log2(config.gridSize[d]!)
  }
  const totalFFTStages = stockhamFwdStageCount * 2
  // Shared-memory FFT: one slot per axis (used as inverse FFT offset)
  const fwdStageCount = config.latticeDim
  const fftStagingBuffer = device.createBuffer({
    label: 'dirac-fft-staging',
    size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftStagingData = buildFFTStagingData(config, totalSites)
  device.queue.writeBuffer(fftStagingBuffer, 0, fftStagingData)

  // Shared-memory FFT: per-axis uniform buffer + staging buffer
  const fftAxisUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'dirac-fft-axis-uniforms'
  )
  const axisSlotCount = config.latticeDim * 2 // forward + inverse
  const fftAxisStagingBuffer = device.createBuffer({
    label: 'dirac-fft-axis-staging',
    size: Math.max(FFT_UNIFORM_SIZE, axisSlotCount * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftAxisStagingData = packFFTAxisUniforms(config, totalSites)
  device.queue.writeBuffer(fftAxisStagingBuffer, 0, fftAxisStagingData)

  // PERF: per-slot uniform buffers for batched Strang-step FFT dispatch.
  // Each (axis, direction) gets its own uniform buffer with its 32-byte
  // FFTAxisUniforms struct pre-populated, so every FFT axis can dispatch
  // inside a single open compute pass by just switching bind groups — no
  // copyBufferToBuffer forces a pass boundary. Layout mirrors TDSE.
  const fftAxisUniformBuffers: GPUBuffer[] = new Array(axisSlotCount)
  const axisStagingBytes = new Uint8Array(fftAxisStagingData)
  for (let slot = 0; slot < axisSlotCount; slot++) {
    const buf = helpers.createUniformBuffer(
      device,
      FFT_UNIFORM_SIZE,
      `dirac-fft-axis-uniforms-${slot}`
    )
    const slotOffset = slot * FFT_UNIFORM_SIZE
    const slotData = axisStagingBytes.slice(slotOffset, slotOffset + FFT_UNIFORM_SIZE)
    device.queue.writeBuffer(buf, 0, slotData)
    fftAxisUniformBuffers[slot] = buf
  }

  // CPU-precomputed radix-2 twiddle table. Replaces per-thread cos/sin in the
  // Stockham butterfly at stages s >= 2 for both the per-stage and shared-mem
  // FFT kernels. Sized for N_MAX_FFT_TWIDDLE = 128 (matches Dirac's per-axis
  // grid clamp); a single 512-byte buffer serves every axis length in [8, 128].
  // Uploaded once per rebuild — values are axis-length-independent.
  const fftTwiddleBuffer = device.createBuffer({
    label: 'dirac-fft-twiddle',
    size: FFT_TWIDDLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(fftTwiddleBuffer, 0, buildFFTTwiddleTable())

  // Pack uniforms (with 1/N normalization for inverse FFT unpack)
  const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const pu32 = new Uint32Array(packData)
  const pf32 = new Float32Array(packData)
  pu32[0] = totalSites
  pf32[1] = 1.0 / totalSites
  device.queue.writeBuffer(packUniformBuffer, 0, packData)

  // Pack uniforms WITHOUT normalization (invN=1.0 for forward FFT unpack)
  const packUniformBufferNoNorm = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'dirac-pack-uniforms-no-norm'
  )
  const noNormData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const nnu32 = new Uint32Array(noNormData)
  const nnf32 = new Float32Array(noNormData)
  nnu32[0] = totalSites
  nnf32[1] = 1.0 // No normalization for forward FFT
  device.queue.writeBuffer(packUniformBufferNoNorm, 0, noNormData)

  // Diagnostics
  const diagNumWorkgroups = Math.ceil(totalSites / DIAG_WG)
  const diagUniformBuffer = helpers.createUniformBuffer(
    device,
    DIAG_UNIFORM_SIZE,
    'dirac-diag-uniforms'
  )
  const diagPartialNormBuffer = device.createBuffer({
    label: 'dirac-diag-partial-norm',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialMaxBuffer = device.createBuffer({
    label: 'dirac-diag-partial-max',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialParticleBuffer = device.createBuffer({
    label: 'dirac-diag-partial-particle',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialAntiBuffer = device.createBuffer({
    label: 'dirac-diag-partial-anti',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagResultBuffer = device.createBuffer({
    label: 'dirac-diag-result',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const diagStagingBuffer = device.createBuffer({
    label: 'dirac-diag-staging',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  useDiagnosticsStore.getState().resetDirac()

  return {
    spinorBuffer,
    potentialBuffer,
    gammaBuffer,
    fftScratchA,
    fftScratchB,
    uniformBuffer,
    fftUniformBuffer,
    fftStagingBuffer,
    fftAxisUniformBuffer,
    fftAxisStagingBuffer,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    diagUniformBuffer,
    diagPartialNormBuffer,
    diagPartialMaxBuffer,
    diagPartialParticleBuffer,
    diagPartialAntiBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    currentSpinorSize: S,
    fwdStageCount,
    diagNumWorkgroups,
  }
}
