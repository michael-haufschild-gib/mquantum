import type {
  ColorAlgorithm,
  CosineCoefficients,
  DistributionSettings,
  MultiSourceWeights,
} from '@/rendering/shaders/palette'
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_EDGE_COLOR,
  DEFAULT_FACE_COLOR,
  DEFAULT_LCH_CHROMA,
  DEFAULT_LCH_LIGHTNESS,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
  DEFAULT_PER_DIMENSION_COLOR_ENABLED,
} from '@/stores/defaults/visualDefaults'
import type { StateCreator } from 'zustand'
import type { AppearanceSlice, ColorSlice, ColorSliceState } from './types'

// ============================================================================
// Algorithm Parameter Groups
// ============================================================================

/**
 * Define which parameter sets each color algorithm uses.
 * Used to determine what to reset when switching algorithms.
 */
type AlgorithmParamSet = 'distribution' | 'cosine' | 'lch' | 'multiSource'

const ALGORITHM_PARAMS: Record<ColorAlgorithm, AlgorithmParamSet[]> = {
  // HSL-based (only uses distribution for value mapping)
  monochromatic: ['distribution'],
  analogous: ['distribution'],
  // Cosine palette-based
  cosine: ['distribution', 'cosine'],
  normal: ['distribution', 'cosine'],
  distance: ['distribution', 'cosine'],
  radial: ['distribution', 'cosine'],
  phase: ['distribution', 'cosine'],
  mixed: ['distribution', 'cosine'],
  multiSource: ['distribution', 'cosine', 'multiSource'],
  // LCH-based
  lch: ['distribution', 'lch'],
  // Simple gradient (blackbody uses distribution)
  blackbody: ['distribution'],
}

/**
 * Check if two algorithms use the same parameter sets.
 * Returns the parameters that are new in the target algorithm.
 * @param prevAlgorithm
 * @param newAlgorithm
 */
function getNewParamsForAlgorithm(
  prevAlgorithm: ColorAlgorithm,
  newAlgorithm: ColorAlgorithm
): AlgorithmParamSet[] {
  const prevParams = ALGORITHM_PARAMS[prevAlgorithm] || ['distribution']
  const newParams = ALGORITHM_PARAMS[newAlgorithm] || ['distribution']
  return newParams.filter((p) => !prevParams.includes(p))
}

export const COLOR_INITIAL_STATE: ColorSliceState = {
  edgeColor: DEFAULT_EDGE_COLOR,
  faceColor: DEFAULT_FACE_COLOR,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  perDimensionColorEnabled: DEFAULT_PER_DIMENSION_COLOR_ENABLED,
  colorAlgorithm: DEFAULT_COLOR_ALGORITHM,
  cosineCoefficients: { ...DEFAULT_COSINE_COEFFICIENTS },
  distribution: { ...DEFAULT_DISTRIBUTION },
  multiSourceWeights: { ...DEFAULT_MULTI_SOURCE_WEIGHTS },
  lchLightness: DEFAULT_LCH_LIGHTNESS,
  lchChroma: DEFAULT_LCH_CHROMA,
}

export const createColorSlice: StateCreator<AppearanceSlice, [], [], ColorSlice> = (set) =>
  ({
    // State
    ...COLOR_INITIAL_STATE,

    // Actions
    setEdgeColor: (color: string) => set({ edgeColor: color }),
    setFaceColor: (color: string) => set({ faceColor: color }),
    setBackgroundColor: (color: string) => set({ backgroundColor: color }),
    setPerDimensionColorEnabled: (enabled: boolean) => set({ perDimensionColorEnabled: enabled }),

    setColorAlgorithm: (algorithm: ColorAlgorithm) =>
      set((state) => {
        // Determine which parameters are new for this algorithm
        const newParams = getNewParamsForAlgorithm(state.colorAlgorithm, algorithm)

        // Build reset object for parameters that are new to this algorithm
        // This ensures clean defaults when switching to algorithms with different parameter sets
        const resets: Partial<ColorSliceState> = {}

        if (newParams.includes('cosine')) {
          // Switching to cosine-based algorithm - reset cosine coefficients
          resets.cosineCoefficients = { ...DEFAULT_COSINE_COEFFICIENTS }
        }

        if (newParams.includes('lch')) {
          // Switching to LCH algorithm - reset LCH parameters
          resets.lchLightness = DEFAULT_LCH_LIGHTNESS
          resets.lchChroma = DEFAULT_LCH_CHROMA
        }

        if (newParams.includes('multiSource')) {
          // Switching to multiSource algorithm - reset blend weights
          resets.multiSourceWeights = { ...DEFAULT_MULTI_SOURCE_WEIGHTS }
        }

        // Also reset distribution when switching FROM cosine/lch/multiSource TO simple HSL-based
        // This prevents confusion when old distribution settings affect HSL algorithms
        const prevParams = ALGORITHM_PARAMS[state.colorAlgorithm] || ['distribution']
        const targetParams = ALGORITHM_PARAMS[algorithm] || ['distribution']
        const wasComplex = prevParams.some(
          (p) => p === 'cosine' || p === 'lch' || p === 'multiSource'
        )
        const isSimple = !targetParams.some(
          (p) => p === 'cosine' || p === 'lch' || p === 'multiSource'
        )

        if (wasComplex && isSimple) {
          // Switching from complex (cosine/lch/multiSource) to simple HSL-based - reset distribution
          resets.distribution = { ...DEFAULT_DISTRIBUTION }
        }

        return { colorAlgorithm: algorithm, ...resets }
      }),

    setCosineCoefficients: (coefficients: CosineCoefficients) =>
      set({ cosineCoefficients: { ...coefficients } }),

    setCosineCoefficient: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) =>
      set((state) => {
        const newCoefficients = { ...state.cosineCoefficients }
        const arr = [...newCoefficients[key]] as [number, number, number]
        arr[index] = Math.max(0, Math.min(2, value))
        newCoefficients[key] = arr
        return { cosineCoefficients: newCoefficients }
      }),

    setDistribution: (settings: Partial<DistributionSettings>) =>
      set((state) => ({
        distribution: {
          ...state.distribution,
          power:
            settings.power !== undefined
              ? Math.max(0.25, Math.min(4, settings.power))
              : state.distribution.power,
          cycles:
            settings.cycles !== undefined
              ? Math.max(0.5, Math.min(5, settings.cycles))
              : state.distribution.cycles,
          offset:
            settings.offset !== undefined
              ? Math.max(0, Math.min(1, settings.offset))
              : state.distribution.offset,
        },
      })),

    setMultiSourceWeights: (weights: Partial<MultiSourceWeights>) =>
      set((state) => ({
        multiSourceWeights: {
          ...state.multiSourceWeights,
          depth:
            weights.depth !== undefined
              ? Math.max(0, Math.min(1, weights.depth))
              : state.multiSourceWeights.depth,
          orbitTrap:
            weights.orbitTrap !== undefined
              ? Math.max(0, Math.min(1, weights.orbitTrap))
              : state.multiSourceWeights.orbitTrap,
          normal:
            weights.normal !== undefined
              ? Math.max(0, Math.min(1, weights.normal))
              : state.multiSourceWeights.normal,
        },
      })),

    setLchLightness: (lightness: number) =>
      set({ lchLightness: Math.max(0.1, Math.min(1, lightness)) }),
    setLchChroma: (chroma: number) => set({ lchChroma: Math.max(0, Math.min(0.4, chroma)) }),
  }) as unknown as AppearanceSlice
// Casting because we are only implementing part of the interface here,
// but in the final merge it will be complete.
// Actually, safer pattern is:
// export const createColorSlice: StateCreator<AppearanceSlice, [], [], ColorSlice> = ...
// But ColorSlice doesn't include the other properties needed for initialization if we do spreading.
// The standard Zustand pattern for slice splitting with TypeScript usually involves
// defining the Slice as a part of the whole Store state.
