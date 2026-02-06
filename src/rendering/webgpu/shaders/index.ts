/**
 * WebGPU WGSL Shaders
 *
 * Main entry point for all WebGPU shader modules.
 *
 * @module rendering/webgpu/shaders
 */

// Shared blocks and utilities
export * from './shared'

// Post-processing shaders
export * from './postprocessing'

// Re-export composition types
export type { WGSLShaderConfig, ShaderBlock, FeatureFlags } from './shared/compose-helpers'
