/**
 * WebGPU Post-Processing Shaders
 *
 * Exports all post-processing shader modules.
 *
 * @module rendering/webgpu/shaders/postprocessing
 */

// Bloom
export { bloomThresholdShader, createBloomBlurShader, bloomCompositeShader } from './bloom.wgsl'

// Tonemapping
export { tonemappingShader } from './tonemapping.wgsl'

// Anti-aliasing
export { fxaaShader } from './fxaa.wgsl'
export {
  smaaEdgeDetectionShader,
  smaaBlendingWeightShader,
  smaaNeighborhoodBlendingShader,
  smaaShaders,
} from './smaa.wgsl'

// Normal compositing
export {
  normalCompositeUniformsBlock,
  normalCompositeVertexShader,
  normalCompositeFragmentShader,
} from './normal-composite.wgsl'

// Frame blending
export {
  frameBlendingUniformsBlock,
  frameBlendingVertexShader,
  frameBlendingFragmentShader,
} from './frame-blending.wgsl'

// Cloud compositing
export {
  cloudCompositeUniformsBlock,
  cloudCompositeVertexShader,
  cloudCompositeFragmentShader,
} from './cloud-composite.wgsl'
