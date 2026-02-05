/**
 * WebGPU Skybox Shaders
 *
 * WGSL port of the skybox rendering system with:
 * - 7 procedural modes (aurora, nebula, crystalline, horizon, ocean, twilight, classic)
 * - KTX2 cube texture support for classic mode
 * - Sun and vignette effects
 * - Cosine palette coloring system
 */

// Types
export type { SkyboxMode, SkyboxEffects, SkyboxShaderConfig } from './types'
export { SKYBOX_BIND_GROUPS, SKYBOX_BINDINGS } from './types'

// Core modules
export {
  constantsBlock,
} from './core/constants.wgsl'
export {
  uniformStructBlock,
  uniformBindingsBlock,
  uniformAliasesBlock,
} from './core/uniforms.wgsl'
export {
  generateVertexOutputStruct,
  fragmentOutputStruct,
  fragmentOutputStructSingle,
} from './core/varyings.wgsl'

// Utility modules
export { colorBlock } from './utils/color.wgsl'
export { rotationBlock } from './utils/rotation.wgsl'
export { noiseBlock } from './utils/noise.wgsl'

// Effect modules
export { sunBlock } from './effects/sun.wgsl'
export { vignetteBlock } from './effects/vignette.wgsl'

// Mode modules
export { classicBlock } from './modes/classic.wgsl'
export { auroraBlock } from './modes/aurora.wgsl'
export { nebulaBlock } from './modes/nebula.wgsl'
export { crystallineBlock } from './modes/crystalline.wgsl'
export { horizonBlock } from './modes/horizon.wgsl'
export { oceanBlock } from './modes/ocean.wgsl'
export { twilightBlock } from './modes/twilight.wgsl'

// Composition
export { composeSkyboxFragmentShader, composeSkyboxVertexShader } from './compose'
export { generateMain } from './main.wgsl'
