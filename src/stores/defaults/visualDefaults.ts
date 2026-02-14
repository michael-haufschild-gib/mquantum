/**
 * Default values for visual store
 *
 * Centralized constants used across visual store slices.
 */

import type { TransformMode } from '@/rendering/lights/types'
import { createDefaultLight, createDefaultSpotLight } from '@/rendering/lights/types'
import {
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DOMAIN_COLORING_SETTINGS,
  DEFAULT_DIVERGING_PSI_SETTINGS,
  DEFAULT_PHASE_DIVERGING_SETTINGS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
  type CosineCoefficients,
  type DistributionSettings,
} from '@/rendering/shaders/palette'
import type { ShaderType, ToneMappingAlgorithm } from '@/rendering/shaders/types'

// ============================================================================
// Basic Visual Defaults
// ============================================================================

export const DEFAULT_EDGE_COLOR = '#19e697'
export const DEFAULT_FACE_COLOR = '#33cc9e'
export const DEFAULT_BACKGROUND_COLOR = '#232323'

// Unified PBR properties
export const DEFAULT_ROUGHNESS = 0.3
export const DEFAULT_METALLIC = 0.0

// ============================================================================
// Bloom Defaults (Bloom V2)
// ============================================================================

export type BloomMode = 'gaussian' | 'convolution'

export interface BloomBandSettings {
  enabled: boolean
  weight: number
  /** Per-band blur scale multiplier. */
  size: number
  /** Hex tint color applied at composite stage. */
  tint: string
}

export const DEFAULT_BLOOM_ENABLED = false
/** Preferred bloom method. */
export const DEFAULT_BLOOM_MODE: BloomMode = 'gaussian'
/** Global bloom gain multiplier (0-3). */
export const DEFAULT_BLOOM_GAIN = 1.25
/**
 * Minimum brightness for bloom contribution.
 * -1 disables thresholding and routes all pixels into bloom.
 */
export const DEFAULT_BLOOM_THRESHOLD = 1.0
/** Threshold soft knee width (0-5). */
export const DEFAULT_BLOOM_KNEE = 0.5
/** Per-band Gaussian controls matching UE-style 5-band setup. */
export const DEFAULT_BLOOM_BANDS: ReadonlyArray<BloomBandSettings> = [
  { enabled: true, weight: 1.0, size: 1.0, tint: '#ffffff' },
  { enabled: true, weight: 0.8, size: 1.0, tint: '#ffffff' },
  { enabled: true, weight: 0.6, size: 1.0, tint: '#ffffff' },
  { enabled: true, weight: 0.4, size: 1.0, tint: '#ffffff' },
  { enabled: true, weight: 0.2, size: 1.0, tint: '#ffffff' },
]
/** Convolution kernel radius scale (0.5-6). */
export const DEFAULT_BLOOM_CONVOLUTION_RADIUS = 2.0
/** Internal convolution source resolution scale (0.25-1). */
export const DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE = 0.5
/** Convolution scatter/boost multiplier (0-4). */
export const DEFAULT_BLOOM_CONVOLUTION_BOOST = 1.0
/** Convolution tint color. */
export const DEFAULT_BLOOM_CONVOLUTION_TINT = '#ffffff'

// ============================================================================
// Anti-aliasing Defaults
// ============================================================================

/** Anti-aliasing method type */
export type AntiAliasingMethod = 'none' | 'fxaa' | 'smaa'

export const DEFAULT_ANTI_ALIASING_METHOD: AntiAliasingMethod = 'none'

// ============================================================================
// Paper Texture Effect Defaults
// ============================================================================

/** Paper texture quality level */
export type PaperQuality = 'low' | 'medium' | 'high'

/** Paper texture enabled by default */
export const DEFAULT_PAPER_ENABLED = false

/** Contrast - blending behavior, sharper vs smoother color transitions (0-1) */
export const DEFAULT_PAPER_CONTRAST = 0.5

/** Roughness - pixel noise intensity (0-1) */
export const DEFAULT_PAPER_ROUGHNESS = 0.3

/** Fiber - curly-shaped noise intensity (0-1) */
export const DEFAULT_PAPER_FIBER = 0.4

/** Fiber size - curly-shaped noise scale (0.1-2) */
export const DEFAULT_PAPER_FIBER_SIZE = 0.5

/** Crumples - cell-based crumple pattern intensity (0-1) */
export const DEFAULT_PAPER_CRUMPLES = 0.2

/** Crumple size - cell-based crumple pattern scale (0.1-2) */
export const DEFAULT_PAPER_CRUMPLE_SIZE = 0.5

/** Folds - depth of the folds (0-1) */
export const DEFAULT_PAPER_FOLDS = 0.1

/** Fold count - number of folds (1-15) */
export const DEFAULT_PAPER_FOLD_COUNT = 5

/** Drops - visibility of speckle/water drop pattern (0-1) */
export const DEFAULT_PAPER_DROPS = 0.0

/** Fade - big-scale noise mask applied to the pattern (0-1) */
export const DEFAULT_PAPER_FADE = 0.0

/** Seed - randomization seed for procedural patterns (0-1000) */
export const DEFAULT_PAPER_SEED = 42

/** Front color - foreground/highlight color (hex) */
export const DEFAULT_PAPER_COLOR_FRONT = '#f5f5dc'

/** Back color - background/shadow color (hex) */
export const DEFAULT_PAPER_COLOR_BACK = '#ffffff'

/** Quality level - controls feature complexity and performance */
export const DEFAULT_PAPER_QUALITY: PaperQuality = 'medium'

/** Intensity - overall effect blend intensity (0-1) */
export const DEFAULT_PAPER_INTENSITY = 1.0

// ============================================================================
// Frame Blending Defaults
// ============================================================================

/** Frame blending enabled by default */
export const DEFAULT_FRAME_BLENDING_ENABLED = false

/** Blend factor - how much previous frame is blended in (0-1, higher = more ghosting) */
export const DEFAULT_FRAME_BLENDING_FACTOR = 0.3

// ============================================================================
// Lighting Defaults
// ============================================================================

export const DEFAULT_LIGHT_ENABLED = true
export const DEFAULT_LIGHT_COLOR = '#FFFFFF'
export const DEFAULT_LIGHT_HORIZONTAL_ANGLE = 145
export const DEFAULT_LIGHT_VERTICAL_ANGLE = 30
export const DEFAULT_AMBIENT_ENABLED = true
export const DEFAULT_AMBIENT_INTENSITY = 0.15
export const DEFAULT_AMBIENT_COLOR = '#FFFFFF'
export const DEFAULT_SPECULAR_INTENSITY = 0.8
export const DEFAULT_SHOW_LIGHT_INDICATOR = false

// Enhanced lighting
export const DEFAULT_SPECULAR_COLOR = '#FFFFFF'
export const DEFAULT_LIGHT_STRENGTH = 1.0
export const DEFAULT_TONE_MAPPING_ENABLED = true
export const DEFAULT_TONE_MAPPING_ALGORITHM: ToneMappingAlgorithm = 'aces'
export const DEFAULT_EXPOSURE = 0.7

// Multi-light system
//export const DEFAULT_LIGHTS = [createDefaultLight(), createDefaultSpotLight()]
export const DEFAULT_LIGHTS = [createDefaultLight(), createDefaultSpotLight()]
export const DEFAULT_SELECTED_LIGHT_ID: string | null = null
export const DEFAULT_TRANSFORM_MODE: TransformMode = 'translate'
export const DEFAULT_SHOW_LIGHT_GIZMOS = false

// ============================================================================
// Surface Effect Defaults
// ============================================================================

export const DEFAULT_PER_DIMENSION_COLOR_ENABLED = false

// ============================================================================
// LCH Color Defaults
// ============================================================================

export const DEFAULT_LCH_LIGHTNESS = 0.7
export const DEFAULT_LCH_CHROMA = 0.15

// ============================================================================
// PBR Settings Defaults (Face + Edge)
// ============================================================================

/**
 * PBR configuration for a single object type.
 * Face and edge use this structure.
 */
export interface PBRConfig {
  roughness: number // 0.04-1.0 (min 0.04 avoids GGX divide-by-zero)
  metallic: number // 0.0-1.0
  specularIntensity: number // 0.0-2.0 (artistic multiplier)
  specularColor: string // hex color string
}

/** PBR for main objects (schroedinger wavefunctions) */
export const DEFAULT_FACE_PBR: PBRConfig = {
  roughness: 0.3,
  metallic: 0.0,
  specularIntensity: 0.8,
  specularColor: '#ffffff',
}

// ============================================================================
// Skybox Defaults
// ============================================================================

export type SkyboxTexture = 'space_blue' | 'space_lightblue' | 'space_red' | 'none'

export type SkyboxMode =
  | 'classic'
  | 'procedural_aurora'
  | 'procedural_nebula'
  | 'procedural_crystalline'
  | 'procedural_horizon'
  | 'procedural_ocean'
  | 'procedural_twilight'

/** Unified skybox selection - combines disabled, classic textures, and procedural modes */
export type SkyboxSelection =
  | 'none'
  | 'space_blue'
  | 'space_lightblue'
  | 'space_red'
  | 'procedural_aurora'
  | 'procedural_nebula'
  | 'procedural_crystalline'
  | 'procedural_horizon'
  | 'procedural_ocean'
  | 'procedural_twilight'

export const DEFAULT_SKYBOX_ENABLED = false
export const DEFAULT_SKYBOX_TEXTURE: SkyboxTexture = 'space_blue'
export const DEFAULT_SKYBOX_SELECTION: SkyboxSelection = 'none'
export const DEFAULT_SKYBOX_INTENSITY = 1
export const DEFAULT_SKYBOX_ROTATION = 0
export const DEFAULT_SKYBOX_HIGH_QUALITY = false

export type SkyboxAnimationMode =
  | 'none'
  | 'cinematic' // Smooth Y orbit + subtle vertical bob (The "Standard")
  | 'heatwave' // UV Distortion (The "Hot")
  | 'tumble' // Chaotic tumbling (The "Disaster")
  | 'ethereal' // Complex rot + Shimmer (The "Magic")
  | 'nebula' // Color shifting (The "Cosmic")

export const DEFAULT_SKYBOX_ANIMATION_MODE: SkyboxAnimationMode = 'heatwave'
export const DEFAULT_SKYBOX_ANIMATION_SPEED = 0.01

// --- Procedural Skybox Defaults ---

/** Aurora-specific settings for the procedural aurora mode */
export interface AuroraSettings {
  curtainHeight: number // 0-1, how high the aurora extends (default 0.5)
  waveFrequency: number // 0.5-3, density of curtain waves (default 1.0)
}

export const DEFAULT_AURORA_SETTINGS: AuroraSettings = {
  curtainHeight: 0.5,
  waveFrequency: 1.0,
}

/** Horizon-specific settings for the procedural horizon mode */
export interface HorizonSettings {
  gradientContrast: number // 0-1, sharpness of gradient bands (default 0.5)
  spotlightFocus: number // 0-1, central spotlight intensity (default 0.5)
}

export const DEFAULT_HORIZON_SETTINGS: HorizonSettings = {
  gradientContrast: 0.5,
  spotlightFocus: 0.5,
}

/** Ocean-specific settings for the procedural ocean depth mode */
export interface OceanSettings {
  causticIntensity: number // 0-1, strength of caustic light patterns (default 0.5)
  depthGradient: number // 0-1, how pronounced the depth falloff is (default 0.5)
  bubbleDensity: number // 0-1, amount of rising particle/bubble effects (default 0.3)
  surfaceShimmer: number // 0-1, intensity of surface light shimmer effect (default 0.4)
}

export const DEFAULT_OCEAN_SETTINGS: OceanSettings = {
  causticIntensity: 0.5,
  depthGradient: 0.5,
  bubbleDensity: 0.3,
  surfaceShimmer: 0.4,
}

export interface SkyboxProceduralSettings {
  // Core
  scale: number
  complexity: number // 0-1 (Quality)
  timeScale: number

  // Appearance
  cosineCoefficients: CosineCoefficients // Independent skybox palette
  distribution: DistributionSettings // Distribution curve settings
  hue: number // -0.5 to 0.5 (color rotation)
  saturation: number // 0-2 (color intensity)

  // Delight Features
  turbulence: number // 0-1
  dualToneContrast: number // 0-1 (Shadow intensity)
  sunIntensity: number // 0-1
  sunPosition: [number, number, number]
  evolution: number // 0-1 (The "Seed" / W-coordinate)

  // Mode-specific settings
  aurora: AuroraSettings
  horizonGradient: HorizonSettings
  ocean: OceanSettings
}

export const DEFAULT_SKYBOX_MODE: SkyboxMode = 'procedural_aurora'

export const DEFAULT_SKYBOX_PROCEDURAL_SETTINGS: SkyboxProceduralSettings = {
  scale: 1.0,
  complexity: 0.5,
  timeScale: 0.2,
  cosineCoefficients: { ...DEFAULT_COSINE_COEFFICIENTS },
  distribution: { ...DEFAULT_DISTRIBUTION },
  hue: 0,
  saturation: 1,
  turbulence: 0.3,
  dualToneContrast: 0.5,
  sunIntensity: 0.0,
  sunPosition: [10, 10, 10],
  evolution: 0.0,
  aurora: { ...DEFAULT_AURORA_SETTINGS },
  horizonGradient: { ...DEFAULT_HORIZON_SETTINGS },
  ocean: { ...DEFAULT_OCEAN_SETTINGS },
}

// ============================================================================
// Shader Defaults
// ============================================================================

export const DEFAULT_SHADER_TYPE: ShaderType = 'surface'

export const DEFAULT_WIREFRAME_SETTINGS = {
  lineThickness: 1,
}

export const DEFAULT_SURFACE_SETTINGS = {
  specularIntensity: DEFAULT_SPECULAR_INTENSITY,
}

export const DEFAULT_SHADER_SETTINGS = {
  wireframe: DEFAULT_WIREFRAME_SETTINGS,
  surface: DEFAULT_SURFACE_SETTINGS,
}

// ============================================================================
// UI / Miscellaneous Defaults
// ============================================================================

export const DEFAULT_SHOW_AXIS_HELPER = false
export const DEFAULT_SHOW_PERF_MONITOR = true
export const DEFAULT_SHOW_DEPTH_BUFFER = false
export const DEFAULT_SHOW_NORMAL_BUFFER = false
export const DEFAULT_SHOW_TEMPORAL_DEPTH_BUFFER = false
export const DEFAULT_ANIMATION_BIAS = 0
export const MIN_ANIMATION_BIAS = 0
export const MAX_ANIMATION_BIAS = 1

// FPS Limiting
export const DEFAULT_MAX_FPS = 60
export const MIN_MAX_FPS = 15
export const MAX_MAX_FPS = 120

// ============================================================================
// Re-exports from lib for convenience
// ============================================================================

export {
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DOMAIN_COLORING_SETTINGS,
  DEFAULT_DIVERGING_PSI_SETTINGS,
  DEFAULT_PHASE_DIVERGING_SETTINGS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
}
