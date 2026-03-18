/**
 * WebGPU Post-Processing Shaders
 *
 * Exports all post-processing shader modules.
 *
 * @module rendering/webgpu/shaders/postprocessing
 */

// Bloom (progressive downsample/upsample)
export {
  bloomCompositeShader,
  bloomCopyShader,
  bloomDownsampleShader,
  bloomPrefilterShader,
  bloomUpsampleShader,
} from './bloom.wgsl'

// Anti-aliasing
export { fxaaShader } from './fxaa.wgsl'
export {
  smaaBlendingWeightShader,
  smaaEdgeDetectionShader,
  smaaNeighborhoodBlendingShader,
  smaaShaders,
} from './smaa.wgsl'
