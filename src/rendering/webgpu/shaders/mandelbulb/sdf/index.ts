/**
 * Mandelbulb SDF WGSL Shader Blocks
 *
 * Exports all dimension-specific SDF blocks for Mandelbulb rendering.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf
 */

// Dimension-specific SDF blocks
export { sdf5dBlock } from './sdf5d.wgsl'
export { sdf6dBlock } from './sdf6d.wgsl'
export { sdf7dBlock } from './sdf7d.wgsl'
export { sdf8dBlock } from './sdf8d.wgsl'
export { sdf9dBlock } from './sdf9d.wgsl'
export { sdf10dBlock } from './sdf10d.wgsl'
export { sdf11dBlock } from './sdf11d.wgsl'

// Generic high-D fallback
export { sdfHighDBlock } from './sdf-high-d.wgsl'

// Dispatch generation utilities
export { generateDispatch, getSdfBlockName, getSdfImportPath } from './dispatch'
