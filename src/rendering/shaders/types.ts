/**
 * Shader Type System for Enhanced Visuals
 *
 * Defines shader types and per-shader settings interfaces.
 * Default values are centralized in @/stores/appearanceStore.ts to avoid conflicts.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

/** Available shader types for polytope rendering */
export type ShaderType = 'wireframe' | 'surface'

/** Wireframe shader settings - simple line rendering */
export interface WireframeSettings {
  /** Line thickness in pixels (1-5) */
  lineThickness: number
}

/** Surface shader settings - filled faces with lighting */
export interface SurfaceSettings {
  /** Face opacity (0-1, 0 = wireframe, 1 = solid) */
  faceOpacity: number
  /** Specular intensity multiplier (0-2) */
  specularIntensity: number
}

/** Union type for all shader settings */
export type ShaderSettings = WireframeSettings | SurfaceSettings

/** Complete shader settings object for all shader types */
export interface AllShaderSettings {
  wireframe: WireframeSettings
  surface: SurfaceSettings
}

// ============================================================================
// NOTE: Default values are defined in @/stores/appearanceStore.ts
// This file contains only type definitions to avoid duplicate/conflicting defaults.
// Import defaults from appearanceSlice for shader settings.
// ============================================================================

/** Shader display names for UI */
export const SHADER_DISPLAY_NAMES: Record<ShaderType, string> = {
  wireframe: 'Wireframe',
  surface: 'Surface',
}

/** Shader descriptions for UI tooltips */
export const SHADER_DESCRIPTIONS: Record<ShaderType, string> = {
  wireframe: 'Simple solid color edges',
  surface: 'Filled faces with lighting',
}

// ============================================================================
// Tone Mapping Types
// Maps to Three.js ToneMapping constants
// @see https://threejs.org/docs/#api/en/constants/Renderer
// ============================================================================

/**
 * Available tone mapping algorithms matching Three.js constants.
 * CustomToneMapping is excluded as it requires custom shader code.
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

/**
 * Maps our algorithm names to Three.js ToneMapping constant values.
 * These match THREE.NoToneMapping (0), THREE.LinearToneMapping (1), etc.
 */
export const TONE_MAPPING_TO_THREE: Record<ToneMappingAlgorithm, number> = {
  none: 0, // THREE.NoToneMapping
  linear: 1, // THREE.LinearToneMapping
  reinhard: 2, // THREE.ReinhardToneMapping
  cineon: 3, // THREE.CineonToneMapping
  aces: 4, // THREE.ACESFilmicToneMapping
  agx: 6, // THREE.AgXToneMapping
  neutral: 7, // THREE.NeutralToneMapping
}

/**
 * Maps our algorithm names to postprocessing ToneMappingMode enum values.
 * Used by @react-three/postprocessing EffectComposer.
 * @see postprocessing ToneMappingMode enum
 */
export const TONE_MAPPING_TO_POSTPROCESSING: Record<ToneMappingAlgorithm, number> = {
  none: 0, // ToneMappingMode.LINEAR (no mapping effect)
  linear: 0, // ToneMappingMode.LINEAR
  reinhard: 1, // ToneMappingMode.REINHARD
  cineon: 6, // ToneMappingMode.CINEON
  aces: 7, // ToneMappingMode.ACES_FILMIC
  agx: 8, // ToneMappingMode.AGX
  neutral: 9, // ToneMappingMode.NEUTRAL
}

/**
 * Type guard to check if settings match a specific shader type
 * @param settings - The shader settings to check
 * @returns True if settings are WireframeSettings
 */
export function isWireframeSettings(settings: ShaderSettings): settings is WireframeSettings {
  return 'lineThickness' in settings
}

/**
 * Type guard to check if settings match surface shader type
 * @param settings - The shader settings to check
 * @returns True if settings are SurfaceSettings
 */
export function isSurfaceSettings(settings: ShaderSettings): settings is SurfaceSettings {
  return 'faceOpacity' in settings && 'specularIntensity' in settings
}
