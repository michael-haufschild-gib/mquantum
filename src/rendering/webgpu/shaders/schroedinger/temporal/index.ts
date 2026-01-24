/**
 * WGSL Temporal accumulation shader modules for Schrödinger visualization
 *
 * Provides reprojection and reconstruction functions for temporal
 * accumulation of volumetric cloud rendering.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporal
 */

export { temporalCloudUniformsBlock } from './uniforms.wgsl'
export {
  reconstructionVertexShader,
  reconstructionFragmentShader,
} from './reconstruction.wgsl'
export {
  reprojectionVertexShader,
  reprojectionFragmentShader,
} from './reprojection.wgsl'
