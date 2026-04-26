/**
 * Type definitions for the Dirac compute pass setup functions.
 *
 * Separated from implementation to keep file sizes within the 600-line limit.
 * Used by both DiracComputePass.ts and DiracComputePassSetup.ts.
 */

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
   * stages >= 2. See `TDSEFFTTwiddle.ts` for layout. Same buffer shape as the
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
 * `*Pipeline` field references — `true` when `latticeDim ≤ 3`. The 3-D path
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
