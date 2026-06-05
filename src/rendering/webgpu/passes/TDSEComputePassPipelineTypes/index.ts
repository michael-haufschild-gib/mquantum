/**
 * TDSE Compute Pass — Pipeline & BindGroupLayout result interfaces.
 *
 * Extracted into its own module so that helper files (TDSEGramSchmidt,
 * TDSEObservablesDispatch) can reference these types without importing
 * the orchestration modules (TDSEComputePassSetup / TDSEComputePassResources)
 * — which would create a circular dependency because Resources already
 * imports state types from those helpers.
 */

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
