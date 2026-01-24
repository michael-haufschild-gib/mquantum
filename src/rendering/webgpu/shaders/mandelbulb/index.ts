/**
 * Mandelbulb WGSL Shaders
 *
 * Exports Mandelbulb-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/mandelbulb
 */

export { mandelbulbUniformsBlock } from './uniforms.wgsl'
export { powerBlock } from './power.wgsl'
export { sdf3dBlock } from './sdf3d.wgsl'
export { sdf4dBlock } from './sdf4d.wgsl'
export { mainBlock, mainBlockWithIBL } from './main.wgsl'
export { composeMandelbulbShader, composeMandelbulbVertexShader } from './compose'

// Higher dimension SDF blocks (5D-11D)
export {
  sdf5dBlock,
  sdf6dBlock,
  sdf7dBlock,
  sdf8dBlock,
  sdf9dBlock,
  sdf10dBlock,
  sdf11dBlock,
  sdfHighDBlock,
  generateDispatch,
  getSdfBlockName,
  getSdfImportPath,
} from './sdf'
