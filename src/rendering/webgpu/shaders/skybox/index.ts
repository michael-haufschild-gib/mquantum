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
export type { SkyboxEffects, SkyboxMode, SkyboxShaderConfig } from './types'
export { SKYBOX_BIND_GROUPS, SKYBOX_BINDINGS } from './types'

// Core modules
export { constantsBlock } from './core/constants.wgsl'
export { uniformAliasesBlock, uniformBindingsBlock, uniformStructBlock } from './core/uniforms.wgsl'
export {
  fragmentOutputStruct,
  fragmentOutputStructSingle,
  generateVertexOutputStruct,
} from './core/varyings.wgsl'

// Utility modules
export { colorBlock } from './utils/color.wgsl'
export { noiseBlock } from './utils/noise.wgsl'
export { rotationBlock } from './utils/rotation.wgsl'

// Effect modules
export { sunBlock } from './effects/sun.wgsl'
export { vignetteBlock } from './effects/vignette.wgsl'

// Mode modules
export { auroraBlock } from './modes/aurora.wgsl'
export { classicBlock } from './modes/classic.wgsl'
export { crystallineBlock } from './modes/crystalline.wgsl'
export { horizonBlock } from './modes/horizon.wgsl'
export { nebulaBlock } from './modes/nebula.wgsl'
export { oceanBlock } from './modes/ocean.wgsl'
export { twilightBlock } from './modes/twilight.wgsl'

// Composition
export { composeSkyboxFragmentShader, composeSkyboxVertexShader } from './compose'
export { generateMain } from './main.wgsl'
