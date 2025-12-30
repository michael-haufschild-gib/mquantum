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
export const DEFAULT_EDGE_THICKNESS = 1
export const DEFAULT_FACE_OPACITY = 1
export const DEFAULT_FACE_COLOR = '#33cc9e'
export const DEFAULT_BACKGROUND_COLOR = '#0F0F1A'

/** Background blend mode for compositing skybox with background color */
export type BackgroundBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'add'
export const DEFAULT_BACKGROUND_BLEND_MODE: BackgroundBlendMode = 'normal'

// Unified PBR properties (single value for all objects: faces, edges, fractals)
export const DEFAULT_ROUGHNESS = 0.3
export const DEFAULT_METALLIC = 0.0

// Edge-specific specular (for TubeWireframe when thickness > 1)
export const DEFAULT_EDGE_SPECULAR_INTENSITY = 0.5
export const DEFAULT_EDGE_SPECULAR_COLOR = '#ffffff'

// Tube wireframe caps (false = hollow tubes for performance, true = capped ends)
export const DEFAULT_TUBE_CAPS = false

export const DEFAULT_EDGES_VISIBLE = true
export const DEFAULT_FACES_VISIBLE = true

// ============================================================================
// Bloom Defaults
// ============================================================================

export const DEFAULT_BLOOM_ENABLED = false
/** Bloom intensity/strength (0-2, default 0.5) */
export const DEFAULT_BLOOM_INTENSITY = 0.5
/** Luminance threshold - pixels below this won't bloom (0-1, default 0.8) */
export const DEFAULT_BLOOM_THRESHOLD = 0.8
/** Blur radius/spread (0-1, default 0.4) */
export const DEFAULT_BLOOM_RADIUS = 0.4
/** Luminance smoothing - softens the threshold transition (0-1, default 0.1) */
export const DEFAULT_BLOOM_SMOOTHING = 0.1
/** Number of blur levels/mip levels (1-8, default 5) */
export const DEFAULT_BLOOM_LEVELS = 5

// ============================================================================
// Bokeh (Depth of Field) Defaults
// ============================================================================

/** Bokeh focus mode type */
export type BokehFocusMode = 'auto-center' | 'auto-mouse' | 'manual'

/** Bokeh blur method type */
export type BokehBlurMethod = 'disc' | 'jittered' | 'separable' | 'hexagonal'

export const DEFAULT_BOKEH_ENABLED = false
export const DEFAULT_BOKEH_FOCUS_MODE: BokehFocusMode = 'auto-center'
export const DEFAULT_BOKEH_BLUR_METHOD: BokehBlurMethod = 'hexagonal'
export const DEFAULT_BOKEH_WORLD_FOCUS_DISTANCE = 15
export const DEFAULT_BOKEH_WORLD_FOCUS_RANGE = 10
export const DEFAULT_BOKEH_SCALE = 0.0
export const DEFAULT_BOKEH_FOCAL_LENGTH = 0.1
export const DEFAULT_BOKEH_SMOOTH_TIME = 0.25
export const DEFAULT_BOKEH_SHOW_DEBUG = false

// ============================================================================
// SSR (Screen-Space Reflections) Defaults
// ============================================================================

/** SSR quality level - controls ray march steps */
export type SSRQuality = 'low' | 'medium' | 'high'

export const DEFAULT_SSR_ENABLED = false
export const DEFAULT_SSR_INTENSITY = 0.5
export const DEFAULT_SSR_MAX_DISTANCE = 30
export const DEFAULT_SSR_THICKNESS = 0.5
export const DEFAULT_SSR_FADE_START = 0.7
export const DEFAULT_SSR_FADE_END = 1.0
export const DEFAULT_SSR_QUALITY: SSRQuality = 'high'

/** Map SSR quality to ray march steps */
export const SSR_QUALITY_STEPS: Record<SSRQuality, number> = {
  low: 16,
  medium: 32,
  high: 64,
}

// ============================================================================
// Screen-Space Refraction Defaults
// ============================================================================

export const DEFAULT_REFRACTION_ENABLED = false
export const DEFAULT_REFRACTION_IOR = 1.5
export const DEFAULT_REFRACTION_STRENGTH = 0.0
export const DEFAULT_REFRACTION_CHROMATIC_ABERRATION = 0.0

// ============================================================================
// Anti-aliasing Defaults
// ============================================================================

/** Anti-aliasing method type */
export type AntiAliasingMethod = 'none' | 'fxaa' | 'smaa'

export const DEFAULT_ANTI_ALIASING_METHOD: AntiAliasingMethod = 'none'

/** Whether depth-based effects use object-only depth (excludes walls) or full scene depth */
export const DEFAULT_OBJECT_ONLY_DEPTH = true

// ============================================================================
// SSAO (Screen-Space Ambient Occlusion) Defaults
// ============================================================================

/** Global AO enabled by default (enhances depth perception) */
export const DEFAULT_SSAO_ENABLED = false

/** AO intensity/strength (0-2 range, 1.0 = normal) */
export const DEFAULT_SSAO_INTENSITY = 1.0

// ============================================================================
// Gravitational Lensing Defaults
// ============================================================================

/** Gravitational lensing enabled (global effect applied to environment) */
export const DEFAULT_GRAVITY_ENABLED = false

/** Gravity strength (0.1-10, affects lensing intensity) */
export const DEFAULT_GRAVITY_STRENGTH = 1.0

/** Distortion scale (0.1-5, affects warping strength) */
export const DEFAULT_GRAVITY_DISTORTION_SCALE = 1.0

/** Distance falloff exponent (0.5-4, how quickly effect fades with distance) */
export const DEFAULT_GRAVITY_FALLOFF = 1.5

/** Chromatic aberration for lensing (0-1, color fringing effect) */
export const DEFAULT_GRAVITY_CHROMATIC_ABERRATION = 0.0

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

// Shadow system - re-export from lib for convenience
export {
  DEFAULT_SHADOW_ANIMATION_MODE,
  DEFAULT_SHADOW_ENABLED,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SOFTNESS,
  SHADOW_SOFTNESS_RANGE,
} from '@/rendering/shadows/constants'
export type { ShadowAnimationMode, ShadowQuality } from '@/rendering/shadows/types'

// ============================================================================
// Surface Effect Defaults
// ============================================================================

export const DEFAULT_FRESNEL_ENABLED = false
export const DEFAULT_FRESNEL_INTENSITY = 0.1
export const DEFAULT_PER_DIMENSION_COLOR_ENABLED = false

// ============================================================================
// LCH Color Defaults
// ============================================================================

export const DEFAULT_LCH_LIGHTNESS = 0.7
export const DEFAULT_LCH_CHROMA = 0.15

// ============================================================================
// Ground Plane Defaults
// ============================================================================

/** Wall position types for environment surfaces */
export type WallPosition = 'floor' | 'back' | 'left' | 'right' | 'top'

/** All wall positions */
export const ALL_WALL_POSITIONS: WallPosition[] = ['floor', 'back', 'left', 'right', 'top']

/** Ground plane surface type */
export type GroundPlaneType = 'two-sided' | 'plane'
//export const DEFAULT_ACTIVE_WALLS: WallPosition[] = ['floor']

export const DEFAULT_ACTIVE_WALLS: WallPosition[] = ['floor']
export const DEFAULT_GROUND_PLANE_OFFSET = 10
export const DEFAULT_GROUND_PLANE_COLOR = '#ead6e8'
export const DEFAULT_GROUND_PLANE_TYPE: GroundPlaneType = 'plane'
export const DEFAULT_GROUND_PLANE_SIZE_SCALE = 10
export const DEFAULT_SHOW_GROUND_GRID = true
export const DEFAULT_GROUND_GRID_COLOR = '#dbdcdb'
export const DEFAULT_GROUND_GRID_SPACING = 5.0

// ============================================================================
// PBR Settings Defaults (Unified for Face, Edge, Ground)
// ============================================================================

/**
 * PBR configuration for a single object type.
 * All three object types (face, edge, ground) use this structure.
 */
export interface PBRConfig {
  roughness: number // 0.04-1.0 (min 0.04 avoids GGX divide-by-zero)
  metallic: number // 0.0-1.0
  specularIntensity: number // 0.0-2.0 (artistic multiplier)
  specularColor: string // hex color string
}

/** PBR for main objects (polytope faces, mandelbulb, julia, schroedinger, blackhole) */
export const DEFAULT_FACE_PBR: PBRConfig = {
  roughness: 0.3,
  metallic: 0.0,
  specularIntensity: 0.8,
  specularColor: '#ffffff',
}

/** PBR for TubeWireframe (edges with thickness > 1) */
export const DEFAULT_EDGE_PBR: PBRConfig = {
  roughness: 0.3,
  metallic: 0.0,
  specularIntensity: 0.5,
  specularColor: '#ffffff',
}

/** PBR for ground plane and walls */
export const DEFAULT_GROUND_PBR: PBRConfig = {
  roughness: 0.2,
  metallic: 0.6,
  specularIntensity: 0.8,
  specularColor: '#ffffff',
}

// ============================================================================
// IBL (Image-Based Lighting) Defaults
// ============================================================================

/** IBL quality level for wall/environment reflections on objects */
export type IBLQuality = 'off' | 'low' | 'high'

/** Default IBL quality - high for testing */
export const DEFAULT_IBL_QUALITY: IBLQuality = 'low'

/** IBL intensity multiplier */
export const DEFAULT_IBL_INTENSITY = 0.5

// ============================================================================
// Skybox Defaults
// ============================================================================

export type SkyboxTexture = 'space_blue' | 'space_lightblue' | 'space_red' | 'none'

export type SkyboxMode =
  | 'classic'
  | 'procedural_aurora'
  | 'procedural_nebula'
  | 'procedural_void'
  | 'procedural_crystalline'
  | 'procedural_horizon'
  | 'procedural_ocean'
  | 'procedural_twilight'
  | 'procedural_starfield'

/** Unified skybox selection - combines disabled, classic textures, and procedural modes */
export type SkyboxSelection =
  | 'none'
  | 'space_blue'
  | 'space_lightblue'
  | 'space_red'
  | 'procedural_aurora'
  | 'procedural_nebula'
  | 'procedural_void'
  | 'procedural_crystalline'
  | 'procedural_horizon'
  | 'procedural_ocean'
  | 'procedural_twilight'
  | 'procedural_starfield'

export const DEFAULT_SKYBOX_ENABLED = true
export const DEFAULT_SKYBOX_TEXTURE: SkyboxTexture = 'space_blue'
export const DEFAULT_SKYBOX_SELECTION: SkyboxSelection = 'procedural_aurora'
export const DEFAULT_SKYBOX_BLUR = 0
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

/** Starfield-specific settings for the procedural starfield mode */
export interface StarfieldSettings {
  density: number // 0-1, how many stars appear (default 0.5)
  brightness: number // 0-2, overall star brightness (default 1.0)
  size: number // 0-1, base star size (default 0.5)
  twinkle: number // 0-1, scintillation intensity (default 0.3)
  glow: number // 0-1, halo around bright stars (default 0.5)
  colorVariation: number // 0-1, spectral color range (default 0.5)
}

export const DEFAULT_STARFIELD_SETTINGS: StarfieldSettings = {
  density: 0.5,
  brightness: 1.0,
  size: 0.5,
  twinkle: 0.3,
  glow: 0.5,
  colorVariation: 0.5,
}

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
  syncWithObject: boolean // "Harmonic Link"
  cosineCoefficients: CosineCoefficients // Independent skybox palette
  distribution: DistributionSettings // Distribution curve settings
  hue: number // -0.5 to 0.5 (color rotation)
  saturation: number // 0-2 (color intensity)

  // Delight Features (The 10 "Wow" Factors)
  chromaticAberration: number // 0-1 (Radial/Lens style)
  horizon: number // 0-1 (0 = none, 1 = strong plane)
  turbulence: number // 0-1
  dualToneContrast: number // 0-1 (Shadow intensity)
  sunIntensity: number // 0-1
  sunPosition: [number, number, number]
  noiseGrain: number // 0-1
  evolution: number // 0-1 (The "Seed" / W-coordinate)

  // Mode-specific settings
  starfield: StarfieldSettings
  aurora: AuroraSettings
  horizonGradient: HorizonSettings
  ocean: OceanSettings

  // Parallax depth (for classic textures)
  parallaxEnabled: boolean
  parallaxStrength: number // 0-1
}

export const DEFAULT_SKYBOX_MODE: SkyboxMode = 'procedural_aurora'

export const DEFAULT_SKYBOX_PROCEDURAL_SETTINGS: SkyboxProceduralSettings = {
  scale: 1.0,
  complexity: 0.5,
  timeScale: 0.2,
  syncWithObject: true,
  cosineCoefficients: { ...DEFAULT_COSINE_COEFFICIENTS },
  distribution: { ...DEFAULT_DISTRIBUTION },
  hue: 0,
  saturation: 1,
  chromaticAberration: 0.1,
  horizon: 0.0,
  turbulence: 0.3,
  dualToneContrast: 0.5,
  sunIntensity: 0.0,
  sunPosition: [10, 10, 10],
  noiseGrain: 0,
  evolution: 0.0,
  starfield: { ...DEFAULT_STARFIELD_SETTINGS },
  aurora: { ...DEFAULT_AURORA_SETTINGS },
  horizonGradient: { ...DEFAULT_HORIZON_SETTINGS },
  ocean: { ...DEFAULT_OCEAN_SETTINGS },
  parallaxEnabled: false,
  parallaxStrength: 0.5,
}

// ============================================================================
// Shader Defaults
// ============================================================================

export const DEFAULT_SHADER_TYPE: ShaderType = 'surface'

export const DEFAULT_WIREFRAME_SETTINGS = {
  lineThickness: DEFAULT_EDGE_THICKNESS,
}

export const DEFAULT_SURFACE_SETTINGS = {
  faceOpacity: DEFAULT_FACE_OPACITY,
  specularIntensity: DEFAULT_SPECULAR_INTENSITY,
  fresnelEnabled: DEFAULT_FRESNEL_ENABLED,
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
export const DEFAULT_MAX_FPS = 120
export const MIN_MAX_FPS = 15
export const MAX_MAX_FPS = 120

// ============================================================================
// Re-exports from lib for convenience
// ============================================================================

export {
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
}
