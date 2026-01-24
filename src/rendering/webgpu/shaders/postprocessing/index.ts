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
export { bloomThresholdShader, bloomBlurShader, bloomCompositeShader } from './bloom.wgsl'

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
