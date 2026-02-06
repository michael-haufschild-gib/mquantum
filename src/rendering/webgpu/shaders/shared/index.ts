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
export { selectorBlock } from './color/selector.wgsl'
export { generateColorSelectorBlock, getColorModuleDependencies } from './color/selectorVariants.wgsl'

// Lighting
export { ggxBlock } from './lighting/ggx.wgsl'
export { multiLightBlock } from './lighting/multi-light.wgsl'
export { sssBlock } from './lighting/sss.wgsl'

// Raymarching
export { raymarchCoreBlock } from './raymarch/core.wgsl'
export { normalBlock } from './raymarch/normal.wgsl'
export { sphereIntersectBlock } from './raymarch/sphere-intersect.wgsl'

// Math utilities
export { safeMathBlock } from './math/safe-math.wgsl'

// Features
export { temporalBlock } from './features/temporal.wgsl'

// Depth rendering
export {
  packDepthBlock,
  depthUniformsBlock,
  ndTransformDepthBlock,
} from './depth/customDepth.wgsl'

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
