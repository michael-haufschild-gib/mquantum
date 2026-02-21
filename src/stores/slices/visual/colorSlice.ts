import type {
  ColorAlgorithm,
  CosineCoefficients,
  DivergingPsiSettings,
  DomainColoringSettings,
  PhaseDivergingSettings,
  DistributionSettings,
  MultiSourceWeights,
} from '@/rendering/shaders/palette'
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DIVERGING_PSI_SETTINGS,
  DEFAULT_DOMAIN_COLORING_SETTINGS,
  DEFAULT_PHASE_DIVERGING_SETTINGS,
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

function isFiniteColorInput(value: number): boolean {
  return Number.isFinite(value)
}

function clampColorValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isValidCosineIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < 3
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
    setBackgroundColor: (color: string) => set({ backgroundColor: color }),
    setPerDimensionColorEnabled: (enabled: boolean) => set({ perDimensionColorEnabled: enabled }),

    setColorAlgorithm: (algorithm: ColorAlgorithm) => set({ colorAlgorithm: algorithm }),

    setCosineCoefficients: (coefficients: CosineCoefficients) =>
      set((state) => {
        const next = { ...state.cosineCoefficients }
        for (const key of ['a', 'b', 'c', 'd'] as const) {
          const values = coefficients[key]
          const prev = state.cosineCoefficients[key]
          next[key] = [
            isFiniteColorInput(values[0]) ? clampColorValue(values[0], 0, 2) : prev[0],
            isFiniteColorInput(values[1]) ? clampColorValue(values[1], 0, 2) : prev[1],
            isFiniteColorInput(values[2]) ? clampColorValue(values[2], 0, 2) : prev[2],
          ]

          if (import.meta.env.DEV) {
            if (!isFiniteColorInput(values[0])) {
              console.warn(`[colorSlice] Ignoring non-finite cosine coefficient ${key}[0]:`, values[0])
            }
            if (!isFiniteColorInput(values[1])) {
              console.warn(`[colorSlice] Ignoring non-finite cosine coefficient ${key}[1]:`, values[1])
            }
            if (!isFiniteColorInput(values[2])) {
              console.warn(`[colorSlice] Ignoring non-finite cosine coefficient ${key}[2]:`, values[2])
            }
          }
        }
        return { cosineCoefficients: next }
      }),

    setCosineCoefficient: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) =>
      set((state) => {
        if (!isValidCosineIndex(index)) {
          if (import.meta.env.DEV) {
            console.warn('[colorSlice] Ignoring invalid cosine coefficient index:', index)
          }
          return state
        }
        if (!isFiniteColorInput(value)) {
          if (import.meta.env.DEV) {
            console.warn('[colorSlice] Ignoring non-finite cosine coefficient value:', value)
          }
          return state
        }
        const newCoefficients = { ...state.cosineCoefficients }
        const arr = [...newCoefficients[key]] as [number, number, number]
        arr[index] = clampColorValue(value, 0, 2)
        newCoefficients[key] = arr
        return { cosineCoefficients: newCoefficients }
      }),

    setDistribution: (settings: Partial<DistributionSettings>) =>
      set((state) => ({
        distribution: {
          ...state.distribution,
          power:
            settings.power !== undefined
              ? isFiniteColorInput(settings.power)
                ? clampColorValue(settings.power, 0.25, 4)
                : state.distribution.power
              : state.distribution.power,
          cycles:
            settings.cycles !== undefined
              ? isFiniteColorInput(settings.cycles)
                ? clampColorValue(settings.cycles, 0.5, 5)
                : state.distribution.cycles
              : state.distribution.cycles,
          offset:
            settings.offset !== undefined
              ? isFiniteColorInput(settings.offset)
                ? clampColorValue(settings.offset, 0, 1)
                : state.distribution.offset
              : state.distribution.offset,
        },
      })),

    setMultiSourceWeights: (weights: Partial<MultiSourceWeights>) =>
      set((state) => ({
        multiSourceWeights: {
          ...state.multiSourceWeights,
          depth:
            weights.depth !== undefined
              ? isFiniteColorInput(weights.depth)
                ? clampColorValue(weights.depth, 0, 1)
                : state.multiSourceWeights.depth
              : state.multiSourceWeights.depth,
          orbitTrap:
            weights.orbitTrap !== undefined
              ? isFiniteColorInput(weights.orbitTrap)
                ? clampColorValue(weights.orbitTrap, 0, 1)
                : state.multiSourceWeights.orbitTrap
              : state.multiSourceWeights.orbitTrap,
          normal:
            weights.normal !== undefined
              ? isFiniteColorInput(weights.normal)
                ? clampColorValue(weights.normal, 0, 1)
                : state.multiSourceWeights.normal
              : state.multiSourceWeights.normal,
        },
      })),

    setLchLightness: (lightness: number) => {
      if (!isFiniteColorInput(lightness)) {
        if (import.meta.env.DEV) {
          console.warn('[colorSlice] Ignoring non-finite LCH lightness:', lightness)
        }
        return
      }
      set({ lchLightness: clampColorValue(lightness, 0.1, 1) })
    },
    setLchChroma: (chroma: number) => {
      if (!isFiniteColorInput(chroma)) {
        if (import.meta.env.DEV) {
          console.warn('[colorSlice] Ignoring non-finite LCH chroma:', chroma)
        }
        return
      }
      set({ lchChroma: clampColorValue(chroma, 0, 0.4) })
    },

    setDomainColoringSettings: (settings: Partial<DomainColoringSettings>) =>
      set((state) => ({
        domainColoring: {
          ...state.domainColoring,
          modulusMode:
            settings.modulusMode !== undefined
              ? settings.modulusMode
              : state.domainColoring.modulusMode,
          contoursEnabled:
            settings.contoursEnabled !== undefined
              ? settings.contoursEnabled
              : state.domainColoring.contoursEnabled,
          contourDensity:
            settings.contourDensity !== undefined
              ? isFiniteColorInput(settings.contourDensity)
                ? clampColorValue(settings.contourDensity, 1, 32)
                : state.domainColoring.contourDensity
              : state.domainColoring.contourDensity,
          contourWidth:
            settings.contourWidth !== undefined
              ? isFiniteColorInput(settings.contourWidth)
                ? clampColorValue(settings.contourWidth, 0.005, 0.25)
                : state.domainColoring.contourWidth
              : state.domainColoring.contourWidth,
          contourStrength:
            settings.contourStrength !== undefined
              ? isFiniteColorInput(settings.contourStrength)
                ? clampColorValue(settings.contourStrength, 0, 1)
                : state.domainColoring.contourStrength
              : state.domainColoring.contourStrength,
        },
      })),

    setPhaseDivergingSettings: (settings: Partial<PhaseDivergingSettings>) =>
      set((state) => ({
        phaseDiverging: {
          ...state.phaseDiverging,
          neutralColor:
            settings.neutralColor !== undefined
              ? settings.neutralColor
              : state.phaseDiverging.neutralColor,
          positiveColor:
            settings.positiveColor !== undefined
              ? settings.positiveColor
              : state.phaseDiverging.positiveColor,
          negativeColor:
            settings.negativeColor !== undefined
              ? settings.negativeColor
              : state.phaseDiverging.negativeColor,
        },
      })),

    setDivergingPsiSettings: (settings: Partial<DivergingPsiSettings>) =>
      set((state) => ({
        divergingPsi: {
          ...state.divergingPsi,
          neutralColor:
            settings.neutralColor !== undefined
              ? settings.neutralColor
              : state.divergingPsi.neutralColor,
          positiveColor:
            settings.positiveColor !== undefined
              ? settings.positiveColor
              : state.divergingPsi.positiveColor,
          negativeColor:
            settings.negativeColor !== undefined
              ? settings.negativeColor
              : state.divergingPsi.negativeColor,
          intensityFloor:
            settings.intensityFloor !== undefined
              ? isFiniteColorInput(settings.intensityFloor)
                ? clampColorValue(settings.intensityFloor, 0, 1)
                : state.divergingPsi.intensityFloor
              : state.divergingPsi.intensityFloor,
          component:
            settings.component !== undefined ? settings.component : state.divergingPsi.component,
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
