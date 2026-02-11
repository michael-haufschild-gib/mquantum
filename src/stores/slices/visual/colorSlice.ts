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
              ? Math.max(1, Math.min(32, settings.contourDensity))
              : state.domainColoring.contourDensity,
          contourWidth:
            settings.contourWidth !== undefined
              ? Math.max(0.005, Math.min(0.25, settings.contourWidth))
              : state.domainColoring.contourWidth,
          contourStrength:
            settings.contourStrength !== undefined
              ? Math.max(0, Math.min(1, settings.contourStrength))
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
              ? Math.max(0, Math.min(1, settings.intensityFloor))
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
