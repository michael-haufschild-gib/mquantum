import type { StateCreator } from 'zustand'

import { normalizeOpaqueHexColor } from '@/lib/colors/colorUtils'
import {
  COLOR_ALGORITHM_TO_INT,
  type ColorAlgorithm,
  type CosineCoefficients,
  type DistributionSettings,
  type DivergingPsiSettings,
  type DomainColoringModulusMode,
  type DomainColoringSettings,
  type MultiSourceWeights,
  type PhaseDivergingSettings,
} from '@/lib/colors/palette'
import { logger } from '@/lib/logger'
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

function isColorAlgorithm(value: unknown): value is ColorAlgorithm {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(COLOR_ALGORITHM_TO_INT, value)
  )
}

function mergeDivergingComponent(
  current: DivergingPsiSettings['component'],
  incoming: DivergingPsiSettings['component'] | undefined
): DivergingPsiSettings['component'] {
  if (incoming === undefined) return current
  if (incoming === 'real' || incoming === 'imag') return incoming
  logger.warn('[colorSlice] Ignoring invalid divergingPsi.component:', incoming)
  return current
}

function isValidCosineIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < 3
}

const COSINE_KEYS = ['a', 'b', 'c', 'd'] as const

function isCosineKey(value: unknown): value is keyof CosineCoefficients {
  return typeof value === 'string' && (COSINE_KEYS as readonly string[]).includes(value)
}

function isDomainColoringModulusMode(value: unknown): value is DomainColoringModulusMode {
  return value === 'logPsiAbsSquared' || value === 'logPsiAbs'
}

/** Merge an optional numeric value with validation and clamping. */
function mergeNumeric(current: number, incoming: unknown, min: number, max: number): number {
  if (incoming === undefined || typeof incoming !== 'number' || !Number.isFinite(incoming)) {
    return current
  }
  return Math.max(min, Math.min(max, incoming))
}

function mergeCosineVector(
  current: [number, number, number],
  incoming: unknown,
  key: keyof CosineCoefficients
): [number, number, number] {
  if (incoming === undefined) return current
  if (!Array.isArray(incoming)) {
    logger.warn(`[colorSlice] Ignoring invalid cosine coefficient vector ${key}:`, incoming)
    return current
  }
  return [
    mergeNumeric(current[0], incoming[0], 0, 2),
    mergeNumeric(current[1], incoming[1], 0, 2),
    mergeNumeric(current[2], incoming[2], 0, 2),
  ]
}

function mergeDomainColoringModulusMode(
  current: DomainColoringModulusMode,
  incoming: unknown
): DomainColoringModulusMode {
  if (incoming === undefined) return current
  if (isDomainColoringModulusMode(incoming)) return incoming
  logger.warn('[colorSlice] Ignoring invalid domainColoring.modulusMode:', incoming)
  return current
}

function mergeBoolean(current: boolean, incoming: unknown, field: string): boolean {
  if (incoming === undefined) return current
  if (typeof incoming === 'boolean') return incoming
  logger.warn(`[colorSlice] Ignoring invalid ${field}:`, incoming)
  return current
}

function mergeOpaqueHexColor(current: string, incoming: string | undefined, field: string): string {
  if (incoming === undefined) return current
  const normalized = normalizeOpaqueHexColor(incoming)
  if (normalized) return normalized
  logger.warn(`[colorSlice] Ignoring invalid ${field}:`, incoming)
  return current
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
    setEdgeColor: (color: string) => {
      const normalized = normalizeOpaqueHexColor(color)
      if (!normalized) {
        logger.warn('[colorSlice] Ignoring invalid edgeColor:', color)
        return
      }
      set({ edgeColor: normalized })
    },
    setFaceColor: (color: string) => {
      const normalized = normalizeOpaqueHexColor(color)
      if (!normalized) {
        logger.warn('[colorSlice] Ignoring invalid faceColor:', color)
        return
      }
      set({ faceColor: normalized })
    },
    setPerDimensionColorEnabled: (enabled: boolean) => set({ perDimensionColorEnabled: enabled }),

    setColorAlgorithm: (algorithm: ColorAlgorithm) => {
      if (!isColorAlgorithm(algorithm)) {
        logger.warn('[colorSlice] Ignoring invalid colorAlgorithm:', algorithm)
        return
      }
      set({ colorAlgorithm: algorithm })
    },

    setCosineCoefficients: (coefficients: CosineCoefficients) =>
      set((state) => {
        const source =
          coefficients !== null && typeof coefficients === 'object'
            ? (coefficients as Partial<Record<keyof CosineCoefficients, unknown>>)
            : {}
        const next = { ...state.cosineCoefficients }
        if (source !== coefficients) {
          logger.warn('[colorSlice] Ignoring invalid cosine coefficients payload:', coefficients)
        }
        for (const key of COSINE_KEYS) {
          next[key] = mergeCosineVector(state.cosineCoefficients[key], source[key], key)
        }
        return { cosineCoefficients: next }
      }),

    setCosineCoefficient: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) =>
      set((state) => {
        if (!isCosineKey(key)) {
          logger.warn('[colorSlice] Ignoring invalid cosine coefficient key:', key)
          return state
        }
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
          modulusMode: mergeDomainColoringModulusMode(
            state.domainColoring.modulusMode,
            settings.modulusMode
          ),
          contoursEnabled: mergeBoolean(
            state.domainColoring.contoursEnabled,
            settings.contoursEnabled,
            'domainColoring.contoursEnabled'
          ),
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
          neutralColor: mergeOpaqueHexColor(
            state.phaseDiverging.neutralColor,
            settings.neutralColor,
            'phaseDiverging.neutralColor'
          ),
          positiveColor: mergeOpaqueHexColor(
            state.phaseDiverging.positiveColor,
            settings.positiveColor,
            'phaseDiverging.positiveColor'
          ),
          negativeColor: mergeOpaqueHexColor(
            state.phaseDiverging.negativeColor,
            settings.negativeColor,
            'phaseDiverging.negativeColor'
          ),
        },
      })),

    setDivergingPsiSettings: (settings: Partial<DivergingPsiSettings>) =>
      set((state) => ({
        divergingPsi: {
          neutralColor: mergeOpaqueHexColor(
            state.divergingPsi.neutralColor,
            settings.neutralColor,
            'divergingPsi.neutralColor'
          ),
          positiveColor: mergeOpaqueHexColor(
            state.divergingPsi.positiveColor,
            settings.positiveColor,
            'divergingPsi.positiveColor'
          ),
          negativeColor: mergeOpaqueHexColor(
            state.divergingPsi.negativeColor,
            settings.negativeColor,
            'divergingPsi.negativeColor'
          ),
          intensityFloor: mergeNumeric(
            state.divergingPsi.intensityFloor,
            settings.intensityFloor,
            0,
            1
          ),
          component: mergeDivergingComponent(state.divergingPsi.component, settings.component),
        },
      })),
  }) as unknown as AppearanceSlice
