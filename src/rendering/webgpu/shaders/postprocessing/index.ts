/**
 * WebGPU Post-Processing Shaders
 *
 * Exports all post-processing shader modules.
 *
 * @module rendering/webgpu/shaders/postprocessing
 */

// Bloom
export {
  bloomThresholdShader,
  createBloomBlurShader,
  createBloomCompositeShader,
  bloomConvolutionCompositeShader,
  bloomCopyShader,
} from './bloom.wgsl'

// Anti-aliasing
export { fxaaShader } from './fxaa.wgsl'
export {
  smaaEdgeDetectionShader,
  smaaBlendingWeightShader,
  smaaNeighborhoodBlendingShader,
  smaaShaders,
} from './smaa.wgsl'
