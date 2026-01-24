/**
 * Julia WGSL Shaders
 *
 * Exports Julia-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/julia
 */

export { juliaUniformsBlock } from './uniforms.wgsl'
export { juliaPowerBlock } from './power.wgsl'
export { quaternionBlock } from './quaternion.wgsl'
export { sdf3dBlock } from './sdf3d.wgsl'
export { sdf4dBlock } from './sdf4d.wgsl'
export { sdf5dBlock } from './sdf5d.wgsl'
export { sdf6dBlock } from './sdf6d.wgsl'
export { sdf7dBlock } from './sdf7d.wgsl'
export { sdf8dBlock } from './sdf8d.wgsl'
export { sdf9dBlock } from './sdf9d.wgsl'
export { sdf10dBlock } from './sdf10d.wgsl'
export { sdf11dBlock } from './sdf11d.wgsl'
export { mainBlock, mainBlockWithIBL } from './main.wgsl'
export { composeJuliaShader, composeJuliaVertexShader } from './compose'
