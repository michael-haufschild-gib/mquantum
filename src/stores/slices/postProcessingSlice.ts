/**
 * Post-processing slice for visual store
 *
 * Manages post-processing effects:
 * - Bloom (glow effect)
 */

import type { StateCreator } from 'zustand'
import {
  type AntiAliasingMethod,
  type PaperQuality,
  DEFAULT_ANTI_ALIASING_METHOD,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_INTENSITY,
  DEFAULT_BLOOM_LEVELS,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_SMOOTHING,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_FRAME_BLENDING_ENABLED,
  DEFAULT_FRAME_BLENDING_FACTOR,
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
  /** Number of blur levels/mip levels (1-5) */
  bloomLevels: number

  // --- Anti-aliasing ---
  antiAliasingMethod: AntiAliasingMethod

  // --- Cinematic ---
  cinematicEnabled: boolean
  cinematicAberration: number
  cinematicVignette: number
  cinematicGrain: number

  // --- Depth Buffer ---
  /** When true, depth-based effects use object-only depth. */
  objectOnlyDepth: boolean

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

  // --- Frame Blending ---
  /** Whether frame blending is enabled */
  frameBlendingEnabled: boolean
  /** Blend factor - how much previous frame is blended in (0-1) */
  frameBlendingFactor: number
}

export interface PostProcessingSliceActions {
  // --- Bloom Actions ---
  setBloomEnabled: (enabled: boolean) => void
  setBloomIntensity: (intensity: number) => void
  setBloomThreshold: (threshold: number) => void
  setBloomRadius: (radius: number) => void
  setBloomSmoothing: (smoothing: number) => void
  setBloomLevels: (levels: number) => void

  // --- Anti-aliasing Actions ---
  setAntiAliasingMethod: (method: AntiAliasingMethod) => void

  // --- Cinematic Actions ---
  setCinematicEnabled: (enabled: boolean) => void
  setCinematicAberration: (intensity: number) => void
  setCinematicVignette: (intensity: number) => void
  setCinematicGrain: (intensity: number) => void

  // --- Depth Buffer Actions ---
  setObjectOnlyDepth: (objectOnly: boolean) => void

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

  // --- Frame Blending Actions ---
  setFrameBlendingEnabled: (enabled: boolean) => void
  setFrameBlendingFactor: (factor: number) => void
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

  // Anti-aliasing
  antiAliasingMethod: DEFAULT_ANTI_ALIASING_METHOD,

  // Cinematic
  cinematicEnabled: false,
  cinematicAberration: 0.005,
  cinematicVignette: 1.2,
  cinematicGrain: 0.0,

  // Depth Buffer
  objectOnlyDepth: DEFAULT_OBJECT_ONLY_DEPTH,

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

  // Frame Blending
  frameBlendingEnabled: DEFAULT_FRAME_BLENDING_ENABLED,
  frameBlendingFactor: DEFAULT_FRAME_BLENDING_FACTOR,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createPostProcessingSlice: StateCreator<
  PostProcessingSlice,
  [],
  [],
  PostProcessingSlice
> = (set) => ({
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

  // --- Frame Blending Actions ---
  setFrameBlendingEnabled: (enabled: boolean) => {
    set({ frameBlendingEnabled: enabled })
  },

  setFrameBlendingFactor: (factor: number) => {
    set({ frameBlendingFactor: Math.max(0, Math.min(1, factor)) })
  },
})
