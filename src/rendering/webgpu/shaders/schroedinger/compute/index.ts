/**
 * Density Grid Compute Shader Module
 *
 * Exports the compute shader blocks and composer function for
 * pre-computing 3D density textures from quantum wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute
 */

export {
  gridParamsBlock,
  densityGridComputeBlock,
} from './densityGrid.wgsl'

export {
  composeDensityGridComputeShader,
  type DensityGridComputeConfig,
  type ComputeQuantumMode,
} from './compose'

export {
  eigenCacheComputeParamsBlock,
  eigenCacheComputeBindingsBlock,
  eigenCacheComputeMainBlock,
} from './eigenfunctionCache.wgsl'

export { composeEigenfunctionCacheComputeShader } from './composeEigenCache'

export {
  wignerGridParamsBlock,
  wignerCacheComputeBlock,
  WIGNER_GRID_PARAMS_SIZE,
} from './wignerCache.wgsl'

export {
  composeWignerCacheComputeShader,
  type WignerCacheComputeConfig,
} from './composeWignerCache'

export {
  wignerSpatialParamsBlock,
  wignerSpatialComputeBlock,
  WIGNER_SPATIAL_PARAMS_SIZE,
} from './wignerSpatial.wgsl'

export {
  composeWignerSpatialComputeShader,
  type WignerSpatialComputeConfig,
} from './composeWignerSpatial'

export {
  wignerReconstructParamsBlock,
  wignerReconstructComputeBlock,
  WIGNER_RECONSTRUCT_PARAMS_SIZE,
} from './wignerReconstruct.wgsl'

export { composeWignerReconstructComputeShader } from './composeWignerReconstruct'
