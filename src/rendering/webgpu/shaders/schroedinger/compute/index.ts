/**
 * Density Grid Compute Shader Module
 *
 * Exports the compute shader blocks and composer function for
 * pre-computing 3D density textures from quantum wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute
 */

export {
  composeDensityGridComputeShader,
  type ComputeQuantumMode,
  type DensityGridComputeConfig,
} from './compose'
export { composeEigenfunctionCacheComputeShader } from './composeEigenCache'
export {
  composeWignerCacheComputeShader,
  type WignerCacheComputeConfig,
} from './composeWignerCache'
export { composeWignerReconstructComputeShader } from './composeWignerReconstruct'
export {
  composeWignerSpatialComputeShader,
  type WignerSpatialComputeConfig,
} from './composeWignerSpatial'
export { densityGridComputeBlock, gridParamsBlock } from './densityGrid.wgsl'
export {
  eigenCacheComputeBindingsBlock,
  eigenCacheComputeMainBlock,
  eigenCacheComputeParamsBlock,
} from './eigenfunctionCache.wgsl'
export {
  WIGNER_GRID_PARAMS_SIZE,
  wignerCacheComputeBlock,
  wignerGridParamsBlock,
} from './wignerCache.wgsl'
export {
  WIGNER_RECONSTRUCT_PARAMS_SIZE,
  wignerReconstructComputeBlock,
  wignerReconstructParamsBlock,
} from './wignerReconstruct.wgsl'
export {
  WIGNER_SPATIAL_PARAMS_SIZE,
  wignerSpatialComputeBlock,
  wignerSpatialParamsBlock,
} from './wignerSpatial.wgsl'
