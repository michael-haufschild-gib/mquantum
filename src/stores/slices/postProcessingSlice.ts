/**
 * Post-processing slice for visual store
 *
 * Manages post-processing effects:
 * - Bloom (glow effect)
 * - Bokeh (depth of field)
 */

import type { StateCreator } from 'zustand'
import {
  type AntiAliasingMethod,
  type BokehBlurMethod,
  type BokehFocusMode,
  type PaperQuality,
  type SSRQuality,
  DEFAULT_ANTI_ALIASING_METHOD,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_INTENSITY,
  DEFAULT_BLOOM_LEVELS,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_SMOOTHING,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_BOKEH_BLUR_METHOD,
  DEFAULT_BOKEH_ENABLED,
  DEFAULT_BOKEH_FOCAL_LENGTH,
  DEFAULT_BOKEH_FOCUS_MODE,
  DEFAULT_BOKEH_SCALE,
  DEFAULT_BOKEH_SHOW_DEBUG,
  DEFAULT_BOKEH_SMOOTH_TIME,
  DEFAULT_BOKEH_WORLD_FOCUS_DISTANCE,
  DEFAULT_BOKEH_WORLD_FOCUS_RANGE,
  DEFAULT_GRAVITY_CHROMATIC_ABERRATION,
  DEFAULT_GRAVITY_DISTORTION_SCALE,
  DEFAULT_GRAVITY_ENABLED,
  DEFAULT_GRAVITY_FALLOFF,
  DEFAULT_GRAVITY_STRENGTH,
  DEFAULT_OBJECT_ONLY_DEPTH,
  DEFAULT_PAPER_COLOR_BACK,
  DEFAULT_PAPER_COLOR_FRONT,
  DEFAULT_PAPER_CONTRAST,
  DEFAULT_PAPER_CRUMPLE_SIZE,
  DEFAULT_PAPER_CRUMPLES,
  DEFAULT_PAPER_DROPS,
  DEFAULT_PAPER_ENABLED,
  DEFAULT_PAPER_FADE,
  DEFAULT_PAPER_FIBER,
  DEFAULT_PAPER_FIBER_SIZE,
  DEFAULT_PAPER_FOLD_COUNT,
  DEFAULT_PAPER_FOLDS,
  DEFAULT_PAPER_INTENSITY,
  DEFAULT_PAPER_QUALITY,
  DEFAULT_PAPER_ROUGHNESS,
  DEFAULT_PAPER_SEED,
  DEFAULT_REFRACTION_CHROMATIC_ABERRATION,
  DEFAULT_REFRACTION_ENABLED,
  DEFAULT_REFRACTION_IOR,
  DEFAULT_REFRACTION_STRENGTH,
  DEFAULT_SSAO_ENABLED,
  DEFAULT_SSAO_INTENSITY,
  DEFAULT_SSR_ENABLED,
  DEFAULT_SSR_FADE_END,
  DEFAULT_SSR_FADE_START,
  DEFAULT_SSR_INTENSITY,
  DEFAULT_SSR_MAX_DISTANCE,
  DEFAULT_SSR_QUALITY,
  DEFAULT_SSR_THICKNESS,
} from '../defaults/visualDefaults'

// ============================================================================
// State Interface
// ============================================================================

export interface PostProcessingSliceState {
  // --- Bloom ---
  bloomEnabled: boolean
  /** Bloom intensity/strength (0-2) */
  bloomIntensity: number
  /** Luminance threshold - pixels below this won't bloom (0-1) */
  bloomThreshold: number
  /** Blur radius/spread (0-1) */
  bloomRadius: number
  /** Luminance smoothing - softens the threshold transition (0-1) */
  bloomSmoothing: number
  /** Number of blur levels/mip levels (1-8) */
  bloomLevels: number

  // --- Bokeh (Depth of Field) ---
  bokehEnabled: boolean
  bokehFocusMode: BokehFocusMode
  bokehBlurMethod: BokehBlurMethod
  bokehWorldFocusDistance: number
  bokehWorldFocusRange: number
  bokehScale: number
  bokehFocalLength: number
  bokehSmoothTime: number
  bokehShowDebug: boolean

  // --- SSR (Screen-Space Reflections) ---
  ssrEnabled: boolean
  ssrIntensity: number
  ssrMaxDistance: number
  ssrThickness: number
  ssrFadeStart: number
  ssrFadeEnd: number
  ssrQuality: SSRQuality

  // --- Screen-Space Refraction ---
  refractionEnabled: boolean
  refractionIOR: number
  refractionStrength: number
  refractionChromaticAberration: number

  // --- Anti-aliasing ---
  antiAliasingMethod: AntiAliasingMethod

  // --- Cinematic ---
  cinematicEnabled: boolean
  cinematicAberration: number
  cinematicVignette: number
  cinematicGrain: number

  // --- Depth Buffer ---
  /** When true, depth-based effects exclude walls/environment. When false, walls are included. */
  objectOnlyDepth: boolean

  // --- SSAO (Screen-Space Ambient Occlusion) ---
  /** Global AO toggle - affects all object types (SSAO for polytopes, SDF AO for fractals) */
  ssaoEnabled: boolean
  /** AO intensity/strength (0-2 range) */
  ssaoIntensity: number

  // --- Gravitational Lensing (Environment Effect) ---
  /** Whether gravitational lensing is enabled (applies to environment layer) */
  gravityEnabled: boolean
  /** Gravity strength / mass parameter (0.1-10) */
  gravityStrength: number
  /** Distortion scale (0.1-5) */
  gravityDistortionScale: number
  /** Distance falloff exponent (0.5-4) */
  gravityFalloff: number
  /** Chromatic aberration for lensing (0-1) */
  gravityChromaticAberration: number
  /** Version counter for gravity settings (dirty-flag tracking) */
  gravityVersion: number

  // --- Paper Texture Effect ---
  /** Whether paper texture effect is enabled */
  paperEnabled: boolean
  /** Contrast - blending behavior (0-1) */
  paperContrast: number
  /** Roughness - pixel noise intensity (0-1) */
  paperRoughness: number
  /** Fiber - curly-shaped noise intensity (0-1) */
  paperFiber: number
  /** Fiber size - curly-shaped noise scale (0.1-2) */
  paperFiberSize: number
  /** Crumples - cell-based crumple pattern intensity (0-1) */
  paperCrumples: number
  /** Crumple size - cell-based crumple pattern scale (0.1-2) */
  paperCrumpleSize: number
  /** Folds - depth of the folds (0-1) */
  paperFolds: number
  /** Fold count - number of folds (1-15) */
  paperFoldCount: number
  /** Drops - visibility of speckle pattern (0-1) */
  paperDrops: number
  /** Fade - big-scale noise mask (0-1) */
  paperFade: number
  /** Seed - randomization seed (0-1000) */
  paperSeed: number
  /** Front color - foreground color (hex) */
  paperColorFront: string
  /** Back color - background color (hex) */
  paperColorBack: string
  /** Quality level - controls feature complexity */
  paperQuality: PaperQuality
  /** Intensity - overall effect blend intensity (0-1) */
  paperIntensity: number
}

export interface PostProcessingSliceActions {
  // --- Bloom Actions ---
  setBloomEnabled: (enabled: boolean) => void
  setBloomIntensity: (intensity: number) => void
  setBloomThreshold: (threshold: number) => void
  setBloomRadius: (radius: number) => void
  setBloomSmoothing: (smoothing: number) => void
  setBloomLevels: (levels: number) => void

  // --- Bokeh Actions ---
  setBokehEnabled: (enabled: boolean) => void
  setBokehFocusMode: (mode: BokehFocusMode) => void
  setBokehBlurMethod: (method: BokehBlurMethod) => void
  setBokehWorldFocusDistance: (distance: number) => void
  setBokehWorldFocusRange: (range: number) => void
  setBokehScale: (scale: number) => void
  setBokehFocalLength: (length: number) => void
  setBokehSmoothTime: (time: number) => void
  setBokehShowDebug: (show: boolean) => void

  // --- SSR Actions ---
  setSSREnabled: (enabled: boolean) => void
  setSSRIntensity: (intensity: number) => void
  setSSRMaxDistance: (distance: number) => void
  setSSRThickness: (thickness: number) => void
  setSSRFadeStart: (start: number) => void
  setSSRFadeEnd: (end: number) => void
  setSSRQuality: (quality: SSRQuality) => void

  // --- Refraction Actions ---
  setRefractionEnabled: (enabled: boolean) => void
  setRefractionIOR: (ior: number) => void
  setRefractionStrength: (strength: number) => void
  setRefractionChromaticAberration: (ca: number) => void

  // --- Anti-aliasing Actions ---
  setAntiAliasingMethod: (method: AntiAliasingMethod) => void

  // --- Cinematic Actions ---
  setCinematicEnabled: (enabled: boolean) => void
  setCinematicAberration: (intensity: number) => void
  setCinematicVignette: (intensity: number) => void
  setCinematicGrain: (intensity: number) => void

  // --- Depth Buffer Actions ---
  setObjectOnlyDepth: (objectOnly: boolean) => void

  // --- SSAO Actions ---
  setSSAOEnabled: (enabled: boolean) => void
  setSSAOIntensity: (intensity: number) => void

  // --- Gravity Actions ---
  setGravityEnabled: (enabled: boolean) => void
  setGravityStrength: (strength: number) => void
  setGravityDistortionScale: (scale: number) => void
  setGravityFalloff: (falloff: number) => void
  setGravityChromaticAberration: (aberration: number) => void

  // --- Paper Texture Actions ---
  setPaperEnabled: (enabled: boolean) => void
  setPaperContrast: (contrast: number) => void
  setPaperRoughness: (roughness: number) => void
  setPaperFiber: (fiber: number) => void
  setPaperFiberSize: (size: number) => void
  setPaperCrumples: (crumples: number) => void
  setPaperCrumpleSize: (size: number) => void
  setPaperFolds: (folds: number) => void
  setPaperFoldCount: (count: number) => void
  setPaperDrops: (drops: number) => void
  setPaperFade: (fade: number) => void
  setPaperSeed: (seed: number) => void
  setPaperColorFront: (color: string) => void
  setPaperColorBack: (color: string) => void
  setPaperQuality: (quality: PaperQuality) => void
  setPaperIntensity: (intensity: number) => void
}

export type PostProcessingSlice = PostProcessingSliceState & PostProcessingSliceActions

// ============================================================================
// Initial State
// ============================================================================

export const POST_PROCESSING_INITIAL_STATE: PostProcessingSliceState = {
  // Bloom
  bloomEnabled: DEFAULT_BLOOM_ENABLED,
  bloomIntensity: DEFAULT_BLOOM_INTENSITY,
  bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
  bloomRadius: DEFAULT_BLOOM_RADIUS,
  bloomSmoothing: DEFAULT_BLOOM_SMOOTHING,
  bloomLevels: DEFAULT_BLOOM_LEVELS,

  // Bokeh
  bokehEnabled: DEFAULT_BOKEH_ENABLED,
  bokehFocusMode: DEFAULT_BOKEH_FOCUS_MODE,
  bokehBlurMethod: DEFAULT_BOKEH_BLUR_METHOD,
  bokehWorldFocusDistance: DEFAULT_BOKEH_WORLD_FOCUS_DISTANCE,
  bokehWorldFocusRange: DEFAULT_BOKEH_WORLD_FOCUS_RANGE,
  bokehScale: DEFAULT_BOKEH_SCALE,
  bokehFocalLength: DEFAULT_BOKEH_FOCAL_LENGTH,
  bokehSmoothTime: DEFAULT_BOKEH_SMOOTH_TIME,
  bokehShowDebug: DEFAULT_BOKEH_SHOW_DEBUG,

  // SSR
  ssrEnabled: DEFAULT_SSR_ENABLED,
  ssrIntensity: DEFAULT_SSR_INTENSITY,
  ssrMaxDistance: DEFAULT_SSR_MAX_DISTANCE,
  ssrThickness: DEFAULT_SSR_THICKNESS,
  ssrFadeStart: DEFAULT_SSR_FADE_START,
  ssrFadeEnd: DEFAULT_SSR_FADE_END,
  ssrQuality: DEFAULT_SSR_QUALITY,

  // Refraction
  refractionEnabled: DEFAULT_REFRACTION_ENABLED,
  refractionIOR: DEFAULT_REFRACTION_IOR,
  refractionStrength: DEFAULT_REFRACTION_STRENGTH,
  refractionChromaticAberration: DEFAULT_REFRACTION_CHROMATIC_ABERRATION,

  // Anti-aliasing
  antiAliasingMethod: DEFAULT_ANTI_ALIASING_METHOD,

  // Cinematic
  cinematicEnabled: false,
  cinematicAberration: 0.005,
  cinematicVignette: 1.2,
  cinematicGrain: 0.0,

  // Depth Buffer
  objectOnlyDepth: DEFAULT_OBJECT_ONLY_DEPTH,

  // SSAO (Screen-Space Ambient Occlusion)
  ssaoEnabled: DEFAULT_SSAO_ENABLED,
  ssaoIntensity: DEFAULT_SSAO_INTENSITY,

  // Gravitational Lensing
  gravityEnabled: DEFAULT_GRAVITY_ENABLED,
  gravityStrength: DEFAULT_GRAVITY_STRENGTH,
  gravityDistortionScale: DEFAULT_GRAVITY_DISTORTION_SCALE,
  gravityFalloff: DEFAULT_GRAVITY_FALLOFF,
  gravityChromaticAberration: DEFAULT_GRAVITY_CHROMATIC_ABERRATION,
  gravityVersion: 0, // Dirty-flag tracking for uniform updates

  // Paper Texture
  paperEnabled: DEFAULT_PAPER_ENABLED,
  paperContrast: DEFAULT_PAPER_CONTRAST,
  paperRoughness: DEFAULT_PAPER_ROUGHNESS,
  paperFiber: DEFAULT_PAPER_FIBER,
  paperFiberSize: DEFAULT_PAPER_FIBER_SIZE,
  paperCrumples: DEFAULT_PAPER_CRUMPLES,
  paperCrumpleSize: DEFAULT_PAPER_CRUMPLE_SIZE,
  paperFolds: DEFAULT_PAPER_FOLDS,
  paperFoldCount: DEFAULT_PAPER_FOLD_COUNT,
  paperDrops: DEFAULT_PAPER_DROPS,
  paperFade: DEFAULT_PAPER_FADE,
  paperSeed: DEFAULT_PAPER_SEED,
  paperColorFront: DEFAULT_PAPER_COLOR_FRONT,
  paperColorBack: DEFAULT_PAPER_COLOR_BACK,
  paperQuality: DEFAULT_PAPER_QUALITY,
  paperIntensity: DEFAULT_PAPER_INTENSITY,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createPostProcessingSlice: StateCreator<
  PostProcessingSlice,
  [],
  [],
  PostProcessingSlice
> = (set, get) => ({
  ...POST_PROCESSING_INITIAL_STATE,

  // --- Bloom Actions ---
  setBloomEnabled: (enabled: boolean) => {
    set({ bloomEnabled: enabled })
  },

  setBloomIntensity: (intensity: number) => {
    set({ bloomIntensity: Math.max(0, Math.min(2, intensity)) })
  },

  setBloomThreshold: (threshold: number) => {
    set({ bloomThreshold: Math.max(0, Math.min(1, threshold)) })
  },

  setBloomRadius: (radius: number) => {
    set({ bloomRadius: Math.max(0, Math.min(1, radius)) })
  },

  setBloomSmoothing: (smoothing: number) => {
    set({ bloomSmoothing: Math.max(0, Math.min(1, smoothing)) })
  },

  setBloomLevels: (levels: number) => {
    set({ bloomLevels: Math.max(1, Math.min(5, Math.round(levels))) })
  },

  // --- Bokeh Actions ---
  setBokehEnabled: (enabled: boolean) => {
    set({ bokehEnabled: enabled })
  },

  setBokehFocusMode: (mode: BokehFocusMode) => {
    set({ bokehFocusMode: mode })
  },

  setBokehBlurMethod: (method: BokehBlurMethod) => {
    set({ bokehBlurMethod: method })
  },

  setBokehWorldFocusDistance: (distance: number) => {
    set({ bokehWorldFocusDistance: Math.max(1, Math.min(50, distance)) })
  },

  setBokehWorldFocusRange: (range: number) => {
    set({ bokehWorldFocusRange: Math.max(1, Math.min(100, range)) })
  },

  setBokehScale: (scale: number) => {
    set({ bokehScale: Math.max(0, Math.min(3, scale)) })
  },

  setBokehFocalLength: (length: number) => {
    set({ bokehFocalLength: Math.max(0.01, Math.min(1, length)) })
  },

  setBokehSmoothTime: (time: number) => {
    set({ bokehSmoothTime: Math.max(0, Math.min(2, time)) })
  },

  setBokehShowDebug: (show: boolean) => {
    set({ bokehShowDebug: show })
  },

  // --- SSR Actions ---
  setSSREnabled: (enabled: boolean) => {
    set({ ssrEnabled: enabled })
  },

  setSSRIntensity: (intensity: number) => {
    set({ ssrIntensity: Math.max(0, Math.min(1, intensity)) })
  },

  setSSRMaxDistance: (distance: number) => {
    set({ ssrMaxDistance: Math.max(1, Math.min(50, distance)) })
  },

  setSSRThickness: (thickness: number) => {
    set({ ssrThickness: Math.max(0.01, Math.min(2, thickness)) })
  },

  setSSRFadeStart: (start: number) => {
    const clamped = Math.max(0, Math.min(1, start))
    const { ssrFadeEnd } = get()
    // Ensure fadeStart is always less than fadeEnd
    set({ ssrFadeStart: Math.min(clamped, ssrFadeEnd - 0.01) })
  },

  setSSRFadeEnd: (end: number) => {
    const clamped = Math.max(0, Math.min(1, end))
    const { ssrFadeStart } = get()
    // Ensure fadeEnd is always greater than fadeStart
    set({ ssrFadeEnd: Math.max(clamped, ssrFadeStart + 0.01) })
  },

  setSSRQuality: (quality: SSRQuality) => {
    set({ ssrQuality: quality })
  },

  // --- Refraction Actions ---
  setRefractionEnabled: (enabled: boolean) => {
    set({ refractionEnabled: enabled })
  },

  setRefractionIOR: (ior: number) => {
    set({ refractionIOR: Math.max(1.0, Math.min(2.5, ior)) })
  },

  setRefractionStrength: (strength: number) => {
    set({ refractionStrength: Math.max(0, Math.min(1, strength)) })
  },

  setRefractionChromaticAberration: (ca: number) => {
    set({ refractionChromaticAberration: Math.max(0, Math.min(1, ca)) })
  },

  // --- Anti-aliasing Actions ---
  setAntiAliasingMethod: (method: AntiAliasingMethod) => {
    set({ antiAliasingMethod: method })
  },

  // --- Cinematic Actions ---
  setCinematicEnabled: (enabled: boolean) => {
    set({ cinematicEnabled: enabled })
  },

  setCinematicAberration: (intensity: number) => {
    set({ cinematicAberration: Math.max(0, Math.min(0.1, intensity)) })
  },

  setCinematicVignette: (intensity: number) => {
    set({ cinematicVignette: Math.max(0, Math.min(3.0, intensity)) })
  },

  setCinematicGrain: (intensity: number) => {
    set({ cinematicGrain: Math.max(0, Math.min(0.2, intensity)) })
  },

  // --- Depth Buffer Actions ---
  setObjectOnlyDepth: (objectOnly: boolean) => {
    set({ objectOnlyDepth: objectOnly })
  },

  // --- SSAO Actions ---
  setSSAOEnabled: (enabled: boolean) => {
    set({ ssaoEnabled: enabled })
  },

  setSSAOIntensity: (intensity: number) => {
    set({ ssaoIntensity: Math.max(0, Math.min(2, intensity)) })
  },

  // --- Gravity Actions ---
  // All gravity setters increment gravityVersion for dirty-flag tracking
  setGravityEnabled: (enabled: boolean) => {
    set((s) => ({ gravityEnabled: enabled, gravityVersion: s.gravityVersion + 1 }))
  },

  setGravityStrength: (strength: number) => {
    set((s) => ({
      gravityStrength: Math.max(0.1, Math.min(10, strength)),
      gravityVersion: s.gravityVersion + 1,
    }))
  },

  setGravityDistortionScale: (scale: number) => {
    set((s) => ({
      gravityDistortionScale: Math.max(0.1, Math.min(5, scale)),
      gravityVersion: s.gravityVersion + 1,
    }))
  },

  setGravityFalloff: (falloff: number) => {
    set((s) => ({
      gravityFalloff: Math.max(0.5, Math.min(4, falloff)),
      gravityVersion: s.gravityVersion + 1,
    }))
  },

  setGravityChromaticAberration: (aberration: number) => {
    set((s) => ({
      gravityChromaticAberration: Math.max(0, Math.min(1, aberration)),
      gravityVersion: s.gravityVersion + 1,
    }))
  },

  // --- Paper Texture Actions ---
  setPaperEnabled: (enabled: boolean) => {
    set({ paperEnabled: enabled })
  },

  setPaperContrast: (contrast: number) => {
    set({ paperContrast: Math.max(0, Math.min(1, contrast)) })
  },

  setPaperRoughness: (roughness: number) => {
    set({ paperRoughness: Math.max(0, Math.min(1, roughness)) })
  },

  setPaperFiber: (fiber: number) => {
    set({ paperFiber: Math.max(0, Math.min(1, fiber)) })
  },

  setPaperFiberSize: (size: number) => {
    set({ paperFiberSize: Math.max(0.1, Math.min(2, size)) })
  },

  setPaperCrumples: (crumples: number) => {
    set({ paperCrumples: Math.max(0, Math.min(1, crumples)) })
  },

  setPaperCrumpleSize: (size: number) => {
    set({ paperCrumpleSize: Math.max(0.1, Math.min(2, size)) })
  },

  setPaperFolds: (folds: number) => {
    set({ paperFolds: Math.max(0, Math.min(1, folds)) })
  },

  setPaperFoldCount: (count: number) => {
    set({ paperFoldCount: Math.max(1, Math.min(15, Math.round(count))) })
  },

  setPaperDrops: (drops: number) => {
    set({ paperDrops: Math.max(0, Math.min(1, drops)) })
  },

  setPaperFade: (fade: number) => {
    set({ paperFade: Math.max(0, Math.min(1, fade)) })
  },

  setPaperSeed: (seed: number) => {
    set({ paperSeed: Math.max(0, Math.min(1000, seed)) })
  },

  setPaperColorFront: (color: string) => {
    set({ paperColorFront: color })
  },

  setPaperColorBack: (color: string) => {
    set({ paperColorBack: color })
  },

  setPaperQuality: (quality: PaperQuality) => {
    set({ paperQuality: quality })
  },

  setPaperIntensity: (intensity: number) => {
    set({ paperIntensity: Math.max(0, Math.min(1, intensity)) })
  },
})
