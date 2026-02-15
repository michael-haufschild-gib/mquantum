/**
 * Post-processing slice for visual store
 *
 * Manages post-processing effects:
 * - Bloom (Gaussian sum + optional convolution)
 */

import type { StateCreator } from 'zustand'
import {
  type AntiAliasingMethod,
  type BloomBandSettings,
  type BloomMode,
  type PaperQuality,
  DEFAULT_ANTI_ALIASING_METHOD,
  DEFAULT_BLOOM_BANDS,
  DEFAULT_BLOOM_CONVOLUTION_BOOST,
  DEFAULT_BLOOM_CONVOLUTION_RADIUS,
  DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE,
  DEFAULT_BLOOM_CONVOLUTION_TINT,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_MODE,
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

const BLOOM_BAND_COUNT = 5

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

function cloneDefaultBands(): BloomBandSettings[] {
  return DEFAULT_BLOOM_BANDS.map((band) => ({ ...band }))
}

function mapBloomBands(
  bands: BloomBandSettings[],
  index: number,
  updater: (band: BloomBandSettings) => BloomBandSettings
): BloomBandSettings[] {
  return bands.map((band, bandIndex) => (bandIndex === index ? updater({ ...band }) : { ...band }))
}

// ============================================================================
// State Interface
// ============================================================================

export interface PostProcessingSliceState {
  // --- Bloom ---
  bloomEnabled: boolean
  bloomMode: BloomMode
  /** Global gain multiplier (0-3). */
  bloomGain: number
  /** Scene-linear threshold (0-5). */
  bloomThreshold: number
  /** Threshold smooth knee width. */
  bloomKnee: number
  /** UE-style 5 bloom bands for gaussian mode. */
  bloomBands: BloomBandSettings[]
  /** Convolution mode radius scale. */
  bloomConvolutionRadius: number
  /** Convolution mode internal resolution scale. */
  bloomConvolutionResolutionScale: number
  /** Convolution mode scatter/boost. */
  bloomConvolutionBoost: number
  /** Convolution mode tint color. */
  bloomConvolutionTint: string

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

export interface PostProcessingSliceActions {
  // --- Bloom Actions ---
  setBloomEnabled: (enabled: boolean) => void
  setBloomMode: (mode: BloomMode) => void
  setBloomGain: (gain: number) => void
  setBloomThreshold: (threshold: number) => void
  setBloomKnee: (knee: number) => void
  setBloomBandEnabled: (index: number, enabled: boolean) => void
  setBloomBandWeight: (index: number, weight: number) => void
  setBloomBandSize: (index: number, size: number) => void
  setBloomBandTint: (index: number, tint: string) => void
  setBloomRadius: (radius: number) => void
  setBloomConvolutionRadius: (radius: number) => void
  setBloomConvolutionResolutionScale: (scale: number) => void
  setBloomConvolutionBoost: (boost: number) => void
  setBloomConvolutionTint: (tint: string) => void

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

export type PostProcessingSlice = PostProcessingSliceState & PostProcessingSliceActions

// ============================================================================
// Initial State
// ============================================================================

export const POST_PROCESSING_INITIAL_STATE: PostProcessingSliceState = {
  // Bloom
  bloomEnabled: DEFAULT_BLOOM_ENABLED,
  bloomMode: DEFAULT_BLOOM_MODE,
  bloomGain: DEFAULT_BLOOM_GAIN,
  bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
  bloomKnee: DEFAULT_BLOOM_KNEE,
  bloomBands: cloneDefaultBands(),
  bloomConvolutionRadius: DEFAULT_BLOOM_CONVOLUTION_RADIUS,
  bloomConvolutionResolutionScale: DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE,
  bloomConvolutionBoost: DEFAULT_BLOOM_CONVOLUTION_BOOST,
  bloomConvolutionTint: DEFAULT_BLOOM_CONVOLUTION_TINT,

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

  setBloomMode: (mode: BloomMode) => {
    set({ bloomMode: mode })
  },

  setBloomGain: (gain: number) => {
    set({ bloomGain: clamp(gain, 0, 3) })
  },

  setBloomThreshold: (threshold: number) => {
    set({ bloomThreshold: clamp(threshold, 0, 5) })
  },

  setBloomKnee: (knee: number) => {
    set({ bloomKnee: clamp(knee, 0, 5) })
  },

  setBloomBandEnabled: (index: number, enabled: boolean) => {
    if (index < 0 || index >= BLOOM_BAND_COUNT) return

    set((state) => {
      const nextBands = state.bloomBands.map((band) => ({ ...band }))

      if (enabled) {
        // Enabling a band enables all lower bands to keep a contiguous active prefix.
        for (let i = 0; i <= index; i++) nextBands[i]!.enabled = true
      } else {
        // Disabling a band disables this and all higher bands for level specialization.
        for (let i = index; i < BLOOM_BAND_COUNT; i++) nextBands[i]!.enabled = false
      }

      return { bloomBands: nextBands }
    })
  },

  setBloomBandWeight: (index: number, weight: number) => {
    if (index < 0 || index >= BLOOM_BAND_COUNT) return
    set((state) => ({
      bloomBands: mapBloomBands(state.bloomBands, index, (band) => ({
        ...band,
        weight: clamp(weight, 0, 4),
      })),
    }))
  },

  setBloomBandSize: (index: number, size: number) => {
    if (index < 0 || index >= BLOOM_BAND_COUNT) return
    set((state) => ({
      bloomBands: mapBloomBands(state.bloomBands, index, (band) => ({
        ...band,
        size: clamp(size, 0.25, 4),
      })),
    }))
  },

  setBloomBandTint: (index: number, tint: string) => {
    if (index < 0 || index >= BLOOM_BAND_COUNT) return
    if (!isValidHexColor(tint)) return
    set((state) => ({
      bloomBands: mapBloomBands(state.bloomBands, index, (band) => ({
        ...band,
        tint,
      })),
    }))
  },

  setBloomRadius: (radius: number) => {
    const clamped = clamp(radius, 0.25, 4)
    set((state) => ({
      bloomBands: state.bloomBands.map((band) => ({ ...band, size: clamped })),
    }))
  },

  setBloomConvolutionRadius: (radius: number) => {
    set({ bloomConvolutionRadius: clamp(radius, 0.5, 6) })
  },

  setBloomConvolutionResolutionScale: (scale: number) => {
    set({ bloomConvolutionResolutionScale: clamp(scale, 0.25, 1) })
  },

  setBloomConvolutionBoost: (boost: number) => {
    set({ bloomConvolutionBoost: clamp(boost, 0, 4) })
  },

  setBloomConvolutionTint: (tint: string) => {
    if (!isValidHexColor(tint)) return
    set({ bloomConvolutionTint: tint })
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
