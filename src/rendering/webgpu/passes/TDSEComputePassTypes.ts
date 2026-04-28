/**
 * Type-only module for the TDSE compute-pass shape.
 *
 * Lives in its own file so the sibling modules can import these shapes
 * without importing each other:
 * - `TDSEComputePassSetup.ts` re-exports types here, plus value composers.
 * - `TDSEComputePassBindGroups.ts` reads {@link TdseBindGroupInputs},
 *   {@link TdseBindGroupResult}, {@link TdsePipelineResult}.
 * - `TDSEObservablesGSPipelines.ts` reads {@link TdsePassHelpers} and writes
 *   {@link ObsGSPipelineResult}.
 *
 * Splitting types here breaks the structural cycles madge reports without
 * relying on `import type` edges (which the raw madge gate cannot see).
 *
 * @module rendering/webgpu/passes/TDSEComputePassTypes
 */

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by TDSEComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface TdsePassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/** Pipeline results for observables + Gram-Schmidt. */
export interface ObsGSPipelineResult {
  obsPosReducePipeline: GPUComputePipeline
  obsPosReduceBGL: GPUBindGroupLayout
  obsPosFinalPipeline: GPUComputePipeline
  obsPosFinalBGL: GPUBindGroupLayout
  obsMomReducePipeline: GPUComputePipeline
  obsMomReduceBGL: GPUBindGroupLayout
  obsMomFinalPipeline: GPUComputePipeline
  obsMomFinalBGL: GPUBindGroupLayout
  gsReducePipeline: GPUComputePipeline
  gsReduceBGL: GPUBindGroupLayout
  gsFinalizePipeline: GPUComputePipeline
  gsFinalizeBGL: GPUBindGroupLayout
  gsSubtractPipeline: GPUComputePipeline
  gsSubtractBGL: GPUBindGroupLayout
  energySpectrumPipeline: GPUComputePipeline
  energySpectrumBGL: GPUBindGroupLayout
}

/**
 * Pipeline and bind group layout objects created by `buildTdsePipelines`.
 */
export interface TdsePipelineResult extends ObsGSPipelineResult {
  initPipeline: GPUComputePipeline
  /**
   * 3-D dispatch variant of {@link initPipeline}. Same layout, same output;
   * @workgroup_size(4,4,4) reads gid.xyz directly instead of decomposing
   * the linear gid.x via linearToND. Selected by host when latticeDim===3
   * (see pickSiteDispatch in computePassUtils).
   */
  initPipeline3D: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  potentialPipeline: GPUComputePipeline
  /** 3-D dispatch variant of {@link potentialPipeline}. See initPipeline3D. */
  potentialPipeline3D: GPUComputePipeline
  potentialBGL: GPUBindGroupLayout
  potentialHalfPipeline: GPUComputePipeline
  potentialHalfBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  /** 3-D dispatch variant of {@link absorberPipeline}. See initPipeline3D. */
  absorberPipeline3D: GPUComputePipeline
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  packBGL: GPUBindGroupLayout
  unpackPipeline: GPUComputePipeline
  unpackBGL: GPUBindGroupLayout
  /** PERF: Fused potentialHalf + pack kernel (saves 1 dispatch per substep) */
  fusedPotentialPackPipeline: GPUComputePipeline
  fusedPotentialPackBGL: GPUBindGroupLayout
  /** PERF: Fused unpack + potentialHalf kernel (saves 1 dispatch per substep) */
  fusedUnpackPotentialPipeline: GPUComputePipeline
  fusedUnpackPotentialBGL: GPUBindGroupLayout
  fftStagePipeline: GPUComputePipeline
  fftStageBGL: GPUBindGroupLayout
  /** Shared-memory FFT: one dispatch per axis (replaces per-stage Stockham for TDSE) */
  fftSharedMemPipeline: GPUComputePipeline
  fftSharedMemBGL: GPUBindGroupLayout
  kineticPipeline: GPUComputePipeline
  /** 3-D dispatch variant of {@link kineticPipeline}. See initPipeline3D. */
  kineticPipeline3D: GPUComputePipeline
  kineticBGL: GPUBindGroupLayout
  writeGridPipeline: GPUComputePipeline
  writeGridBGL: GPUBindGroupLayout
  diagReducePipeline: GPUComputePipeline
  diagReduceBGL: GPUBindGroupLayout
  diagFinalizePipeline: GPUComputePipeline
  diagFinalizeBGL: GPUBindGroupLayout
}

/**
 * Bind group objects created by `rebuildTdseBindGroups`.
 */
export interface TdseBindGroupResult {
  initBG: GPUBindGroup
  potentialBG: GPUBindGroup
  potentialHalfBG: GPUBindGroup
  fusedPotentialPackBG: GPUBindGroup
  fusedUnpackPotentialBG: GPUBindGroup
  packBG: GPUBindGroup
  unpackBG: GPUBindGroup
  fftStageABBG: GPUBindGroup
  fftStageBABG: GPUBindGroup
  /** Shared-memory FFT bind group: axis uniforms + complexBuf(rw) */
  fftSharedMemBG: GPUBindGroup
  /** PERF: per-slot FFT bind groups (length = 2 × latticeDim) for batched Strang dispatch. */
  fftSharedMemBGs: GPUBindGroup[]
  kineticBG: GPUBindGroup
  writeGridBG: GPUBindGroup
  diagReduceBG: GPUBindGroup
  diagFinalizeBG: GPUBindGroup
  renormalizeBG: GPUBindGroup
  renormalizeUniformBuffer: GPUBuffer
}

/** Buffers and resources needed to create bind groups. */
export interface TdseBindGroupInputs {
  uniformBuffer: GPUBuffer
  /** Merged ψ (array<vec2f>). */
  psiBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  /** Per-axis uniform buffer for shared-memory FFT (legacy singular — used by observables path). */
  fftAxisUniformBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms (length = 2 × latticeDim) for batched Strang FFT. */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed radix-2 twiddle table bound to every TDSE FFT dispatch
   * (shared-mem + per-stage kernels). Replaces per-thread `cos/sin` at
   * stages >= 2. See `FFTTwiddle.ts` for format.
   */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagPartialIprBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
}
