/**
 * WGSL Schrödinger SDF shader modules for isosurface rendering
 *
 * These are Mandelbulb-style fractal SDFs used for the isosurface
 * rendering mode of Schrödinger wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf
 */

export { sdf3dBlock } from './sdf3d.wgsl'
export { sdf4dBlock } from './sdf4d.wgsl'
export { sdf5dBlock } from './sdf5d.wgsl'
export { sdf6dBlock } from './sdf6d.wgsl'
export { sdf7dBlock } from './sdf7d.wgsl'
export { sdf8dBlock } from './sdf8d.wgsl'
export { sdfHighDBlock } from './sdf-high-d.wgsl'
