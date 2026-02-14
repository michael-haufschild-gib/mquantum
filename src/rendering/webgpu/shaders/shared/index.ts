/**
 * Shared WGSL Shader Blocks
 *
 * Exports all shared shader blocks for composition.
 *
 * @module rendering/webgpu/shaders/shared
 */

// Core
export { constantsBlock } from './core/constants.wgsl'
export { uniformsBlock } from './core/uniforms.wgsl'

// Color
export { cosinePaletteBlock } from './color/cosine-palette.wgsl'
export { hslBlock } from './color/hsl.wgsl'
export { oklabBlock } from './color/oklab.wgsl'

// Lighting
export { ggxBlock } from './lighting/ggx.wgsl'
export { multiLightBlock } from './lighting/multi-light.wgsl'

// Raymarching
export { sphereIntersectBlock } from './raymarch/sphere-intersect.wgsl'

// Features
export { temporalBlock } from './features/temporal.wgsl'

// Composition helpers
export {
  assembleShaderBlocks,
  fullscreenVertexInputsBlock,
  generateObjectBindGroup,
  generateStandardBindGroups,
  generateTextureBindings,
  mrtOutputBlock,
  processFeatureFlags,
  raymarchVertexInputsBlock,
  singleOutputBlock,
  type FeatureFlags,
  type ShaderBlock,
  type WGSLShaderConfig,
} from './compose-helpers'
