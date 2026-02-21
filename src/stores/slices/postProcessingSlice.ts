/**
 * Post-processing slice for visual store
 *
 * Manages post-processing effects:
 * - Bloom (progressive downsample/upsample)
 */

import type { StateCreator } from 'zustand'
import {
  type AntiAliasingMethod,
  type PaperQuality,
  DEFAULT_ANTI_ALIASING_METHOD,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_FRAME_BLENDING_ENABLED,
  DEFAULT_FRAME_BLENDING_FACTOR,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isFinitePostProcessingInput(value: number): boolean {
  return Number.isFinite(value)
}

// ============================================================================
// State Interface
// ============================================================================

/**
 * Post-processing slice state fields.
 */
export interface PostProcessingSliceState {
  // --- Bloom ---
  bloomEnabled: boolean
  /** Global gain multiplier (0-3). */
  bloomGain: number
  /** Scene-linear threshold (0-5). */
  bloomThreshold: number
  /** Threshold smooth knee width. */
  bloomKnee: number
  /** Upsample filter radius (0.25-4). */
  bloomRadius: number

  // --- Anti-aliasing ---
  antiAliasingMethod: AntiAliasingMethod

  // --- Cinematic ---
  cinematicEnabled: boolean
  cinematicAberration: number
  cinematicVignette: number
  cinematicGrain: number

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

/**
 * Post-processing slice actions.
 */
export interface PostProcessingSliceActions {
  // --- Bloom Actions ---
  setBloomEnabled: (enabled: boolean) => void
  setBloomGain: (gain: number) => void
  setBloomThreshold: (threshold: number) => void
  setBloomKnee: (knee: number) => void
  setBloomRadius: (radius: number) => void

  // --- Anti-aliasing Actions ---
  setAntiAliasingMethod: (method: AntiAliasingMethod) => void

  // --- Cinematic Actions ---
  setCinematicEnabled: (enabled: boolean) => void
  setCinematicAberration: (intensity: number) => void
  setCinematicVignette: (intensity: number) => void
  setCinematicGrain: (intensity: number) => void

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

/**
 * Combined post-processing slice type.
 */
export type PostProcessingSlice = PostProcessingSliceState & PostProcessingSliceActions

// ============================================================================
// Initial State
// ============================================================================

export const POST_PROCESSING_INITIAL_STATE: PostProcessingSliceState = {
  // Bloom
  bloomEnabled: DEFAULT_BLOOM_ENABLED,
  bloomGain: DEFAULT_BLOOM_GAIN,
  bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
  bloomKnee: DEFAULT_BLOOM_KNEE,
  bloomRadius: DEFAULT_BLOOM_RADIUS,

  // Anti-aliasing
  antiAliasingMethod: DEFAULT_ANTI_ALIASING_METHOD,

  // Cinematic
  cinematicEnabled: false,
  cinematicAberration: 0.005,
  cinematicVignette: 1.2,
  cinematicGrain: 0.0,

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

  setBloomGain: (gain: number) => {
    if (!isFinitePostProcessingInput(gain)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite bloom gain:', gain)
      }
      return
    }
    set({ bloomGain: clamp(gain, 0, 3) })
  },

  setBloomThreshold: (threshold: number) => {
    if (!isFinitePostProcessingInput(threshold)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite bloom threshold:', threshold)
      }
      return
    }
    set({ bloomThreshold: clamp(threshold, 0, 5) })
  },

  setBloomKnee: (knee: number) => {
    if (!isFinitePostProcessingInput(knee)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite bloom knee:', knee)
      }
      return
    }
    set({ bloomKnee: clamp(knee, 0, 5) })
  },

  setBloomRadius: (radius: number) => {
    if (!isFinitePostProcessingInput(radius)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite bloom radius:', radius)
      }
      return
    }
    set({ bloomRadius: clamp(radius, 0.25, 4) })
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
    if (!isFinitePostProcessingInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[postProcessingSlice] Ignoring non-finite cinematic aberration:',
          intensity
        )
      }
      return
    }
    set({ cinematicAberration: Math.max(0, Math.min(0.1, intensity)) })
  },

  setCinematicVignette: (intensity: number) => {
    if (!isFinitePostProcessingInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite cinematic vignette:', intensity)
      }
      return
    }
    set({ cinematicVignette: Math.max(0, Math.min(3.0, intensity)) })
  },

  setCinematicGrain: (intensity: number) => {
    if (!isFinitePostProcessingInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite cinematic grain:', intensity)
      }
      return
    }
    set({ cinematicGrain: Math.max(0, Math.min(0.2, intensity)) })
  },

  // --- Paper Texture Actions ---
  setPaperEnabled: (enabled: boolean) => {
    set({ paperEnabled: enabled })
  },

  setPaperContrast: (contrast: number) => {
    if (!isFinitePostProcessingInput(contrast)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper contrast:', contrast)
      }
      return
    }
    set({ paperContrast: Math.max(0, Math.min(1, contrast)) })
  },

  setPaperRoughness: (roughness: number) => {
    if (!isFinitePostProcessingInput(roughness)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper roughness:', roughness)
      }
      return
    }
    set({ paperRoughness: Math.max(0, Math.min(1, roughness)) })
  },

  setPaperFiber: (fiber: number) => {
    if (!isFinitePostProcessingInput(fiber)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper fiber:', fiber)
      }
      return
    }
    set({ paperFiber: Math.max(0, Math.min(1, fiber)) })
  },

  setPaperFiberSize: (size: number) => {
    if (!isFinitePostProcessingInput(size)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper fiber size:', size)
      }
      return
    }
    set({ paperFiberSize: Math.max(0.1, Math.min(2, size)) })
  },

  setPaperCrumples: (crumples: number) => {
    if (!isFinitePostProcessingInput(crumples)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper crumples:', crumples)
      }
      return
    }
    set({ paperCrumples: Math.max(0, Math.min(1, crumples)) })
  },

  setPaperCrumpleSize: (size: number) => {
    if (!isFinitePostProcessingInput(size)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper crumple size:', size)
      }
      return
    }
    set({ paperCrumpleSize: Math.max(0.1, Math.min(2, size)) })
  },

  setPaperFolds: (folds: number) => {
    if (!isFinitePostProcessingInput(folds)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper folds:', folds)
      }
      return
    }
    set({ paperFolds: Math.max(0, Math.min(1, folds)) })
  },

  setPaperFoldCount: (count: number) => {
    if (!isFinitePostProcessingInput(count)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper fold count:', count)
      }
      return
    }
    set({ paperFoldCount: Math.max(1, Math.min(15, Math.round(count))) })
  },

  setPaperDrops: (drops: number) => {
    if (!isFinitePostProcessingInput(drops)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper drops:', drops)
      }
      return
    }
    set({ paperDrops: Math.max(0, Math.min(1, drops)) })
  },

  setPaperFade: (fade: number) => {
    if (!isFinitePostProcessingInput(fade)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper fade:', fade)
      }
      return
    }
    set({ paperFade: Math.max(0, Math.min(1, fade)) })
  },

  setPaperSeed: (seed: number) => {
    if (!isFinitePostProcessingInput(seed)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper seed:', seed)
      }
      return
    }
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
    if (!isFinitePostProcessingInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn('[postProcessingSlice] Ignoring non-finite paper intensity:', intensity)
      }
      return
    }
    set({ paperIntensity: Math.max(0, Math.min(1, intensity)) })
  },

  // --- Frame Blending Actions ---
  setFrameBlendingEnabled: (enabled: boolean) => {
    set({ frameBlendingEnabled: enabled })
  },

  setFrameBlendingFactor: (factor: number) => {
    if (!isFinitePostProcessingInput(factor)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[postProcessingSlice] Ignoring non-finite frame blending factor:',
          factor
        )
      }
      return
    }
    set({ frameBlendingFactor: Math.max(0, Math.min(1, factor)) })
  },
})
