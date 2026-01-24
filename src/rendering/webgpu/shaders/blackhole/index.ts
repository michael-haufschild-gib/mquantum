/**
 * BlackHole WGSL Shaders
 *
 * Exports BlackHole-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/blackhole
 */

// Core modules
export { blackHoleUniformsBlock } from './uniforms.wgsl'
export { lensingBlock } from './lensing.wgsl'
export { horizonBlock } from './horizon.wgsl'
export { shellBlock } from './shell.wgsl'
export { diskSdfBlock } from './disk-sdf.wgsl'
export { dopplerBlock } from './doppler.wgsl'
export { mainBlock, mainBlockWithEnvMap } from './main.wgsl'

// Color algorithm dispatcher
export { colorsBlock } from './colors.wgsl'

// Accretion disk manifold (noise, density, colors)
export { manifoldBlock } from './manifold.wgsl'

// Volumetric accretion disk (Kerr warp, ridged noise, Doppler)
export { diskVolumetricBlock } from './disk-volumetric.wgsl'

// Motion blur for orbital velocity
export { motionBlurBlock } from './motion-blur.wgsl'

// Deferred gravitational lensing post-process
export { deferredLensingBlock, deferredLensingUniformsBlock } from './deferred-lensing.wgsl'

// Composition and types
export { composeBlackHoleShader, composeBlackHoleVertexShader } from './compose'
export type { BlackHoleWGSLShaderConfig } from './compose'
