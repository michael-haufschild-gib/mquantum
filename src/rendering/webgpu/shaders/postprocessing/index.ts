/**
 * WebGPU Post-Processing Shaders
 *
 * Exports all post-processing shader modules.
 *
 * @module rendering/webgpu/shaders/postprocessing
 */

// Bloom (progressive downsample/upsample)
export {
  bloomPrefilterShader,
  bloomDownsampleShader,
  bloomUpsampleShader,
  bloomCompositeShader,
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
