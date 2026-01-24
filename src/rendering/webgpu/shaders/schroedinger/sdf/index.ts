/**
 * WGSL Schrödinger SDF shader modules for isosurface rendering
 *
 * These are Mandelbulb-style fractal SDFs used for the isosurface
 * rendering mode of Schrödinger wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf
 */

export { sdf3dBlock } from './sdf3d.wgsl'
export { sdfHighDBlock } from './sdf-high-d.wgsl'

// Note: sdf4d through sdf11d follow the same pattern.
// They can be generated using the same approach as mandelbulb SDF variants.
// For now, sdf3d and sdfHighD cover the essential cases.
