/**
 * WebGPU Post-Processing Shaders
 *
 * Exports all post-processing shader modules.
 *
 * @module rendering/webgpu/shaders/postprocessing
 */

// Environment compositing
export { environmentCompositeShader } from './environment-composite.wgsl'

// Reflections
export { ssrShader } from './ssr.wgsl'

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

// Jet volumetric effects
export {
  jetVolumetricUniformsBlock,
  jetNoiseBlock,
  jetVolumetricVertexShader,
  jetVolumetricFragmentShader,
  jetCompositeVertexShader,
  jetCompositeFragmentShader,
} from './jet-volumetric.wgsl'

// Normal compositing
export {
  normalCompositeUniformsBlock,
  normalCompositeVertexShader,
  normalCompositeFragmentShader,
} from './normal-composite.wgsl'

// Screen-space lensing
export {
  screenSpaceLensingUniformsBlock,
  screenSpaceLensingVertexShader,
  screenSpaceLensingFragmentShader,
} from './screen-space-lensing.wgsl'

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
