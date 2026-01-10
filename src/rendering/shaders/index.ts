/**
 * Shader Utilities Module
 *
 * Provides shared shader utilities, constants, and helper functions
 * for the rendering pipeline. Materials with shaders are now in
 * src/rendering/materials/
 *
 * This module contains:
 * - Shader types and interfaces
 * - Dimension-based color utilities
 * - Palette system (cosine gradients, presets)
 * - N-D transformation utilities
 * - Post-processing shaders
 *
 * For materials (SkyboxShader, UnifiedMaterial), import from:
 * @see @/rendering/materials
 */

// Shared types
export * from './types'

// Dimension-based coloring utilities
export * from './dimensionColors'

// Palette system (cosine gradients)
export * from './palette'

// N-D transformation utilities
export * from './transforms'

// Post-processing shaders (Bokeh, SSR, Refraction)
export * from './postprocessing/BokehShader'
export * from './postprocessing/SSRShader'
export * from './postprocessing/RefractionShader'
