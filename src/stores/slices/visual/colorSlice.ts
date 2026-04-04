import type { StateCreator } from 'zustand'

import { logger } from '@/lib/logger'
import type {
  ColorAlgorithm,
  CosineCoefficients,
  DistributionSettings,
  DivergingPsiSettings,
  DomainColoringSettings,
  MultiSourceWeights,
  PhaseDivergingSettings,
} from '@/rendering/shaders/palette'
import {
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_DIVERGING_PSI_SETTINGS,
  DEFAULT_DOMAIN_COLORING_SETTINGS,
  DEFAULT_EDGE_COLOR,
  DEFAULT_FACE_COLOR,
  DEFAULT_LCH_CHROMA,
  DEFAULT_LCH_LIGHTNESS,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
  DEFAULT_PER_DIMENSION_COLOR_ENABLED,
  DEFAULT_PHASE_DIVERGING_SETTINGS,
} from '@/stores/defaults/visualDefaults'

import type { AppearanceSlice, ColorSlice, ColorSliceState } from './types'

function isValidCosineIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < 3
}

/** Merge an optional numeric value with validation and clamping. */
function mergeNumeric(
  current: number,
  incoming: number | undefined,
  min: number,
  max: number
): number {
  if (incoming === undefined || !Number.isFinite(incoming)) return current
  return Math.max(min, Math.min(max, incoming))
}

export const COLOR_INITIAL_STATE: ColorSliceState = {
  edgeColor: DEFAULT_EDGE_COLOR,
  faceColor: DEFAULT_FACE_COLOR,
  perDimensionColorEnabled: DEFAULT_PER_DIMENSION_COLOR_ENABLED,
  colorAlgorithm: DEFAULT_COLOR_ALGORITHM,
  cosineCoefficients: { ...DEFAULT_COSINE_COEFFICIENTS },
  distribution: { ...DEFAULT_DISTRIBUTION },
  multiSourceWeights: { ...DEFAULT_MULTI_SOURCE_WEIGHTS },
  lchLightness: DEFAULT_LCH_LIGHTNESS,
  lchChroma: DEFAULT_LCH_CHROMA,
  domainColoring: { ...DEFAULT_DOMAIN_COLORING_SETTINGS },
  phaseDiverging: { ...DEFAULT_PHASE_DIVERGING_SETTINGS },
  divergingPsi: { ...DEFAULT_DIVERGING_PSI_SETTINGS },
}

export const createColorSlice: StateCreator<AppearanceSlice, [], [], ColorSlice> = (set) =>
  ({
    // State
    ...COLOR_INITIAL_STATE,

    // Actions
    setEdgeColor: (color: string) => set({ edgeColor: color }),
    setFaceColor: (color: string) => set({ faceColor: color }),
    setPerDimensionColorEnabled: (enabled: boolean) => set({ perDimensionColorEnabled: enabled }),

    setColorAlgorithm: (algorithm: ColorAlgorithm) => set({ colorAlgorithm: algorithm }),

    setCosineCoefficients: (coefficients: CosineCoefficients) =>
      set((state) => {
        const next = { ...state.cosineCoefficients }
        for (const key of ['a', 'b', 'c', 'd'] as const) {
          const values = coefficients[key]
          const prev = state.cosineCoefficients[key]
          next[key] = [
            mergeNumeric(prev[0], values[0], 0, 2),
            mergeNumeric(prev[1], values[1], 0, 2),
            mergeNumeric(prev[2], values[2], 0, 2),
          ]
          for (let i = 0; i < 3; i++) {
            if (!Number.isFinite(values[i])) {
              logger.warn(
                `[colorSlice] Ignoring non-finite cosine coefficient ${key}[${i}]:`,
                values[i]
              )
            }
          }
        }
        return { cosineCoefficients: next }
      }),

    setCosineCoefficient: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) =>
      set((state) => {
        if (!isValidCosineIndex(index)) {
          logger.warn('[colorSlice] Ignoring invalid cosine coefficient index:', index)
          return state
        }
        if (!Number.isFinite(value)) {
          logger.warn('[colorSlice] Ignoring non-finite cosine coefficient value:', value)
          return state
        }
        const newCoefficients = { ...state.cosineCoefficients }
        const arr = [...newCoefficients[key]] as [number, number, number]
        arr[index] = Math.max(0, Math.min(2, value))
        newCoefficients[key] = arr
        return { cosineCoefficients: newCoefficients }
      }),

    setDistribution: (settings: Partial<DistributionSettings>) =>
      set((state) => ({
        distribution: {
          power: mergeNumeric(state.distribution.power, settings.power, 0.25, 4),
          cycles: mergeNumeric(state.distribution.cycles, settings.cycles, 0.5, 5),
          offset: mergeNumeric(state.distribution.offset, settings.offset, 0, 1),
        },
      })),

    setMultiSourceWeights: (weights: Partial<MultiSourceWeights>) =>
      set((state) => ({
        multiSourceWeights: {
          depth: mergeNumeric(state.multiSourceWeights.depth, weights.depth, 0, 1),
          orbitTrap: mergeNumeric(state.multiSourceWeights.orbitTrap, weights.orbitTrap, 0, 1),
          normal: mergeNumeric(state.multiSourceWeights.normal, weights.normal, 0, 1),
        },
      })),

    setLchLightness: (lightness: number) => {
      if (!Number.isFinite(lightness)) {
        logger.warn('[colorSlice] Ignoring non-finite LCH lightness:', lightness)
        return
      }
      set({ lchLightness: Math.max(0.1, Math.min(1, lightness)) })
    },
    setLchChroma: (chroma: number) => {
      if (!Number.isFinite(chroma)) {
        logger.warn('[colorSlice] Ignoring non-finite LCH chroma:', chroma)
        return
      }
      set({ lchChroma: Math.max(0, Math.min(0.4, chroma)) })
    },

    setDomainColoringSettings: (settings: Partial<DomainColoringSettings>) =>
      set((state) => ({
        domainColoring: {
          modulusMode: settings.modulusMode ?? state.domainColoring.modulusMode,
          contoursEnabled: settings.contoursEnabled ?? state.domainColoring.contoursEnabled,
          contourDensity: mergeNumeric(
            state.domainColoring.contourDensity,
            settings.contourDensity,
            1,
            32
          ),
          contourWidth: mergeNumeric(
            state.domainColoring.contourWidth,
            settings.contourWidth,
            0.005,
            0.25
          ),
          contourStrength: mergeNumeric(
            state.domainColoring.contourStrength,
            settings.contourStrength,
            0,
            1
          ),
        },
      })),

    setPhaseDivergingSettings: (settings: Partial<PhaseDivergingSettings>) =>
      set((state) => ({
        phaseDiverging: {
          neutralColor: settings.neutralColor ?? state.phaseDiverging.neutralColor,
          positiveColor: settings.positiveColor ?? state.phaseDiverging.positiveColor,
          negativeColor: settings.negativeColor ?? state.phaseDiverging.negativeColor,
        },
      })),

    setDivergingPsiSettings: (settings: Partial<DivergingPsiSettings>) =>
      set((state) => ({
        divergingPsi: {
          neutralColor: settings.neutralColor ?? state.divergingPsi.neutralColor,
          positiveColor: settings.positiveColor ?? state.divergingPsi.positiveColor,
          negativeColor: settings.negativeColor ?? state.divergingPsi.negativeColor,
          intensityFloor: mergeNumeric(
            state.divergingPsi.intensityFloor,
            settings.intensityFloor,
            0,
            1
          ),
          component: settings.component ?? state.divergingPsi.component,
        },
      })),
  }) as unknown as AppearanceSlice
// Casting because we are only implementing part of the interface here,
// but in the final merge it will be complete.
// Actually, safer pattern is:
// export const createColorSlice: StateCreator<AppearanceSlice, [], [], ColorSlice> = ...
// But ColorSlice doesn't include the other properties needed for initialization if we do spreading.
// The standard Zustand pattern for slice splitting with TypeScript usually involves
// defining the Slice as a part of the whole Store state.
