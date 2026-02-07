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
