/**
 * Shader Type System
 *
 * Defines shader types, tone mapping algorithms, and per-shader
 * settings interfaces for the WebGPU rendering pipeline.
 * Default values are centralized in @/stores/scene/appearanceStore.ts.
 *
 * @module lib/rendering/shaderTypes
 */

/** Available shader types for rendering */
export type ShaderType = 'wireframe' | 'surface'

/** Wireframe shader settings - simple line rendering */
export interface WireframeSettings {
  /** Line thickness in pixels (1-5) */
  lineThickness: number
}

/** Surface shader settings - filled faces with lighting */
export interface SurfaceSettings {
  /** Specular intensity multiplier (0-2) */
  specularIntensity: number
}

/** Complete shader settings object for all shader types */
export interface AllShaderSettings {
  wireframe: WireframeSettings
  surface: SurfaceSettings
}

// ============================================================================
// NOTE: Default values are defined in @/stores/scene/appearanceStore.ts
// This file contains only type definitions to avoid duplicate/conflicting defaults.
// Import defaults from appearanceSlice for shader settings.
// ============================================================================

// ============================================================================
// Tone Mapping Types
// ============================================================================

/**
 * Available tone mapping algorithms.
 * Implemented in WGSL via ToneMappingCinematicPass.
 */
export type ToneMappingAlgorithm =
  | 'none'
  | 'linear'
  | 'reinhard'
  | 'cineon'
  | 'aces'
  | 'agx'
  | 'neutral'

/** Tone mapping algorithm options for UI dropdown */
export const TONE_MAPPING_OPTIONS = [
  { value: 'none' as const, label: 'None', description: 'No tone mapping' },
  { value: 'linear' as const, label: 'Linear', description: 'Simple linear mapping' },
  { value: 'reinhard' as const, label: 'Reinhard', description: 'Classic HDR algorithm' },
  { value: 'cineon' as const, label: 'Cineon', description: 'Film-like response' },
  { value: 'aces' as const, label: 'ACES Filmic', description: 'Industry standard for HDR' },
  { value: 'agx' as const, label: 'AgX', description: 'Modern filmic look' },
  { value: 'neutral' as const, label: 'Neutral', description: 'Balanced output' },
] as const
