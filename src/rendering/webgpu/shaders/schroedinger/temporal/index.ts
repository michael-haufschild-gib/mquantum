/**
 * WGSL Temporal accumulation shader modules for Schrödinger visualization
 *
 * Provides reprojection and reconstruction functions for temporal
 * accumulation of volumetric cloud rendering.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporal
 */

export { temporalCloudUniformsBlock } from './uniforms.wgsl'

// Note: reprojection.wgsl and reconstruction.wgsl are full shader programs
// that would be ported as complete vertex/fragment or compute shader pairs.
// They require additional pipeline setup beyond shader blocks.
