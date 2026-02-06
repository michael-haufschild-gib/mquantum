import {
  DEFAULT_SCHROEDINGER_CONFIG,
  RAYMARCH_QUALITY_TO_SAMPLES,
  type RaymarchQuality,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  SchroedingerPresetName,
  HydrogenNDPresetName,
} from '@/lib/geometry/extended/types'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { getHydrogenNDPreset } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'

export const createSchroedingerSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  SchroedingerSlice
> = (set, get) => {
  /**
   * Wrapped setter that auto-increments schroedingerVersion when schroedinger state changes.
   * This avoids manually adding version increment to 80+ individual setters.
   * @param updater
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      // If updating schroedinger, also bump version
      if ('schroedinger' in update) {
        return { ...update, schroedingerVersion: state.schroedingerVersion + 1 }
      }
      return update
    })
  }

  // === Setter Factories ===
  // Reduce boilerplate for common setter patterns

  /**
   * Factory for simple value setters (no validation)
   * @param key
   */
  const valueSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K) =>
    (value: (typeof DEFAULT_SCHROEDINGER_CONFIG)[K]) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: value },
      }))
    }

  /**
   * Factory for clamped numeric setters
   * @param key
   * @param min
   * @param max
   */
  const clampedSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K, min: number, max: number) =>
    (value: number) => {
      const clamped = Math.max(min, Math.min(max, value))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: clamped },
      }))
    }

  return {
    schroedinger: { ...DEFAULT_SCHROEDINGER_CONFIG },

    // === Geometry Settings ===
    setSchroedingerScale: (scale) => {
      const clampedScale = Math.max(0.1, Math.min(2.0, scale))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, scale: clampedScale },
      }))
    },

    // === Quality Settings ===
    setSchroedingerQualityPreset: (preset) => {
      const settings = SCHROEDINGER_QUALITY_PRESETS[preset]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          qualityPreset: preset,
          resolution: settings.resolution,
        },
      }))
    },

    setSchroedingerResolution: (value) => {
      const validResolutions = [16, 24, 32, 48, 64, 96, 128]
      const closest = validResolutions.reduce((prev, curr) =>
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      )
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, resolution: closest },
      }))
    },

    // === Visualization Axes ===
    setSchroedingerVisualizationAxes: (axes) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: axes },
      }))
    },

    setSchroedingerVisualizationAxis: (index, dimIndex) => {
      const clampedDimIndex = Math.max(0, Math.min(10, Math.floor(dimIndex)))
      const current = [...get().schroedinger.visualizationAxes] as [number, number, number]
      current[index] = clampedDimIndex
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: current },
      }))
    },

    // === Slice Parameters ===
    setSchroedingerParameterValue: (dimIndex, value) => {
      const values = [...get().schroedinger.parameterValues]
      if (dimIndex < 0 || dimIndex >= values.length) {
        if (import.meta.env.DEV) {
          console.warn(
            `setSchroedingerParameterValue: Invalid dimension index ${dimIndex} (valid range: 0-${values.length - 1})`
          )
        }
        return
      }
      const clampedValue = Math.max(-2.0, Math.min(2.0, value))
      values[dimIndex] = clampedValue
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: values },
      }))
    },

    setSchroedingerParameterValues: (values) => {
      const clampedValues = values.map((v) => Math.max(-2.0, Math.min(2.0, v)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: clampedValues },
      }))
    },

    resetSchroedingerParameters: () => {
      const len = get().schroedinger.parameterValues.length
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: new Array(len).fill(0) },
      }))
    },

    // === Navigation ===
    setSchroedingerCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, center },
      }))
    },

    setSchroedingerExtent: (extent) => {
      const clampedExtent = Math.max(0.001, Math.min(10.0, extent))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extent: clampedExtent },
      }))
    },

    fitSchroedingerToView: () => {
      const centerLen = get().schroedinger.center.length
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          center: new Array(centerLen).fill(0),
          extent: 2.5,
        },
      }))
    },

    // === Color Settings ===
    setSchroedingerColorMode: valueSetter('colorMode'),

    setSchroedingerPalette: (palette) => {
      const definitions = SCHROEDINGER_PALETTE_DEFINITIONS[palette]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          palette,
          cosineParams: definitions ? definitions : state.schroedinger.cosineParams,
        },
      }))
    },

    setSchroedingerCustomPalette: valueSetter('customPalette'),
    setSchroedingerInvertColors: valueSetter('invertColors'),

    // === Rendering Style ===
    setSchroedingerRenderStyle: valueSetter('renderStyle'),

    // === Quantum State Configuration ===
    setSchroedingerPresetName: (name: SchroedingerPresetName) => {
      // If selecting a named preset, apply its parameters to the state
      // This keeps the UI sliders in sync with the visual preset
      let updates = {}
      if (name !== 'custom') {
        const preset = SCHROEDINGER_NAMED_PRESETS[name]
        if (preset) {
          updates = {
            seed: preset.seed,
            termCount: preset.termCount,
            maxQuantumNumber: preset.maxN,
            frequencySpread: preset.frequencySpread,
          }
        }
      }

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          presetName: name,
          ...updates,
        },
      }))
    },

    setSchroedingerSeed: (seed) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: Math.floor(seed) },
      }))
    },

    randomizeSchroedingerSeed: () => {
      const newSeed = Math.floor(Math.random() * 1000000)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: newSeed, presetName: 'custom' },
      }))
    },

    setSchroedingerTermCount: (count) => {
      const clampedCount = Math.max(1, Math.min(8, Math.floor(count)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, termCount: clampedCount, presetName: 'custom' },
      }))
    },

    setSchroedingerMaxQuantumNumber: (maxN) => {
      const clampedMaxN = Math.max(2, Math.min(6, Math.floor(maxN)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          maxQuantumNumber: clampedMaxN,
          presetName: 'custom',
        },
      }))
    },

    setSchroedingerFrequencySpread: (spread) => {
      const clampedSpread = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          frequencySpread: clampedSpread,
          presetName: 'custom',
        },
      }))
    },

    // === Quantum Mode Selection ===
    setSchroedingerQuantumMode: valueSetter('quantumMode'),

    setSchroedingerPrincipalQuantumNumber: (n: number) => {
      const clamped = Math.max(1, Math.min(7, Math.floor(n)))
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber

      // Enforce l < n constraint
      const newL = Math.min(currentL, clamped - 1)
      // Enforce |m| <= l constraint
      const newM = Math.max(-newL, Math.min(newL, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          principalQuantumNumber: clamped,
          azimuthalQuantumNumber: newL,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerAzimuthalQuantumNumber: (l: number) => {
      const currentN = get().schroedinger.principalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber

      // Enforce l < n and l >= 0 constraints
      const clamped = Math.max(0, Math.min(currentN - 1, Math.floor(l)))
      // Enforce |m| <= l constraint
      const newM = Math.max(-clamped, Math.min(clamped, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          azimuthalQuantumNumber: clamped,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerMagneticQuantumNumber: (m: number) => {
      const currentL = get().schroedinger.azimuthalQuantumNumber
      // Enforce |m| <= l constraint
      const clamped = Math.max(-currentL, Math.min(currentL, Math.floor(m)))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          magneticQuantumNumber: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerUseRealOrbitals: (useRealOrbitals) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          useRealOrbitals,
          hydrogenNDPreset: 'custom',
        },
      }))
    },
    setSchroedingerBohrRadiusScale: (bohrRadiusScale) => {
      const clamped = Math.max(0.5, Math.min(3.0, bohrRadiusScale))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bohrRadiusScale: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    // === Hydrogen ND Configuration ===
    setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => {
      // For 'custom', only update the preset name - preserve existing values
      if (preset === 'custom') {
        set((state) => ({
          schroedinger: {
            ...state.schroedinger,
            hydrogenNDPreset: preset,
          },
        }))
        return
      }

      // For named presets, apply all preset values
      const presetData = getHydrogenNDPreset(preset)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenNDPreset: preset,
          // Update 3D hydrogen quantum numbers
          principalQuantumNumber: presetData.n,
          azimuthalQuantumNumber: presetData.l,
          magneticQuantumNumber: presetData.m,
          useRealOrbitals: presetData.useReal,
          bohrRadiusScale: presetData.bohrRadiusScale,
          // Update extra dimension configuration
          extraDimQuantumNumbers: [...presetData.extraDimN],
          extraDimOmega: [...presetData.extraDimOmega],
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => {
      const numbers = [...get().schroedinger.extraDimQuantumNumbers]
      if (dimIndex < 0 || dimIndex >= 8) return
      numbers[dimIndex] = Math.max(0, Math.min(6, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: numbers,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => {
      const clamped = numbers.slice(0, 8).map((n) => Math.max(0, Math.min(6, Math.floor(n))))
      while (clamped.length < 8) clamped.push(0)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => {
      const omegas = [...get().schroedinger.extraDimOmega]
      if (dimIndex < 0 || dimIndex >= 8) return
      omegas[dimIndex] = Math.max(0.1, Math.min(2.0, omega))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: omegas },
      }))
    },

    setSchroedingerExtraDimOmegaAll: (omegas: number[]) => {
      const clamped = omegas.slice(0, 8).map((o) => Math.max(0.1, Math.min(2.0, o)))
      while (clamped.length < 8) clamped.push(1.0)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: clamped },
      }))
    },

    setSchroedingerExtraDimFrequencySpread: (spread: number) => {
      const clamped = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimFrequencySpread: clamped },
      }))
    },

    // === Volume Rendering Parameters ===
    setSchroedingerTimeScale: clampedSetter('timeScale', 0.1, 2.0),
    setSchroedingerFieldScale: clampedSetter('fieldScale', 0.5, 2.0),
    setSchroedingerDensityGain: clampedSetter('densityGain', 0.1, 5.0),
    setSchroedingerPowderScale: clampedSetter('powderScale', 0.0, 2.0),
    setSchroedingerSampleCount: clampedSetter('sampleCount', 16, 128),
    setSchroedingerUseDensityGrid: valueSetter('useDensityGrid'),
    setSchroedingerEmissionIntensity: clampedSetter('emissionIntensity', 0.0, 5.0),
    setSchroedingerEmissionThreshold: clampedSetter('emissionThreshold', 0.0, 1.0),
    setSchroedingerEmissionColorShift: clampedSetter('emissionColorShift', -1.0, 1.0),
    setSchroedingerEmissionPulsing: valueSetter('emissionPulsing'),
    setSchroedingerRimExponent: clampedSetter('rimExponent', 1.0, 10.0),
    setSchroedingerScatteringAnisotropy: clampedSetter('scatteringAnisotropy', -0.9, 0.9),
    setSchroedingerRoughness: clampedSetter('roughness', 0.0, 1.0),
    setSchroedingerFogIntegrationEnabled: valueSetter('fogIntegrationEnabled'),
    setSchroedingerFogContribution: clampedSetter('fogContribution', 0.0, 2.0),
    setSchroedingerInternalFogDensity: clampedSetter('internalFogDensity', 0.0, 1.0),

    setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => {
      // Update both raymarchQuality and sampleCount for consistency.
      // Note: The mesh reads raymarchQuality directly via RAYMARCH_QUALITY_TO_SAMPLES mapping.
      // sampleCount is kept in sync for backward compatibility with any code that reads it directly.
      const sampleCount = RAYMARCH_QUALITY_TO_SAMPLES[quality]
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, raymarchQuality: quality, sampleCount },
      }))
    },

    // === SSS (Subsurface Scattering) ===
    setSchroedingerSssEnabled: valueSetter('sssEnabled'),
    setSchroedingerSssIntensity: clampedSetter('sssIntensity', 0.0, 2.0),
    setSchroedingerSssColor: valueSetter('sssColor'),
    setSchroedingerSssThickness: clampedSetter('sssThickness', 0.1, 5.0),
    setSchroedingerSssJitter: clampedSetter('sssJitter', 0.0, 1.0),

    // === Erosion ===
    setSchroedingerErosionStrength: clampedSetter('erosionStrength', 0.0, 1.0),
    setSchroedingerErosionScale: clampedSetter('erosionScale', 0.25, 4.0),
    setSchroedingerErosionTurbulence: clampedSetter('erosionTurbulence', 0.0, 1.0),
    setSchroedingerErosionNoiseType: valueSetter('erosionNoiseType'),
    setSchroedingerErosionHQ: valueSetter('erosionHQ'),

    // === Curl Noise Animation ===
    setSchroedingerCurlEnabled: valueSetter('curlEnabled'),
    setSchroedingerCurlStrength: clampedSetter('curlStrength', 0.0, 1.0),
    setSchroedingerCurlScale: clampedSetter('curlScale', 0.25, 4.0),
    setSchroedingerCurlSpeed: clampedSetter('curlSpeed', 0.1, 5.0),
    setSchroedingerCurlBias: valueSetter('curlBias'),

    // === Dispersion ===
    setSchroedingerDispersionEnabled: valueSetter('dispersionEnabled'),
    setSchroedingerDispersionStrength: clampedSetter('dispersionStrength', 0.0, 1.0),
    setSchroedingerDispersionDirection: valueSetter('dispersionDirection'),
    setSchroedingerDispersionQuality: valueSetter('dispersionQuality'),

    // === Shadows ===
    setSchroedingerShadowsEnabled: valueSetter('shadowsEnabled'),
    setSchroedingerShadowStrength: clampedSetter('shadowStrength', 0.0, 2.0),
    setSchroedingerShadowSteps: clampedSetter('shadowSteps', 1, 8),

    // === Ambient Occlusion ===
    setSchroedingerAoEnabled: valueSetter('aoEnabled'),
    setSchroedingerAoStrength: clampedSetter('aoStrength', 0.0, 2.0),
    setSchroedingerAoQuality: clampedSetter('aoQuality', 3, 8),
    setSchroedingerAoRadius: clampedSetter('aoRadius', 0.1, 2.0),
    setSchroedingerAoColor: valueSetter('aoColor'),

    // === Nodal Surfaces ===
    setSchroedingerNodalEnabled: valueSetter('nodalEnabled'),
    setSchroedingerNodalColor: valueSetter('nodalColor'),
    setSchroedingerNodalStrength: clampedSetter('nodalStrength', 0.0, 2.0),

    // === Visual Effects ===
    setSchroedingerEnergyColorEnabled: valueSetter('energyColorEnabled'),
    setSchroedingerShimmerEnabled: valueSetter('shimmerEnabled'),
    setSchroedingerShimmerStrength: clampedSetter('shimmerStrength', 0.0, 1.0),
    setSchroedingerPhaseMaterialityEnabled: valueSetter('phaseMaterialityEnabled'),
    setSchroedingerPhaseMaterialityStrength: clampedSetter('phaseMaterialityStrength', 0.0, 1.0),
    setSchroedingerIsoEnabled: valueSetter('isoEnabled'),
    setSchroedingerIsoThreshold: clampedSetter('isoThreshold', -6, 0),

    // === Slice Animation (4D+ only) ===
    setSchroedingerSliceAnimationEnabled: valueSetter('sliceAnimationEnabled'),
    setSchroedingerSliceSpeed: clampedSetter('sliceSpeed', 0.01, 0.1),
    setSchroedingerSliceAmplitude: clampedSetter('sliceAmplitude', 0.1, 1.0),

    // === Spread Animation ===
    setSchroedingerSpreadAnimationEnabled: valueSetter('spreadAnimationEnabled'),
    setSchroedingerSpreadAnimationSpeed: clampedSetter('spreadAnimationSpeed', 0.1, 2.0),

    // === Phase Animation (Hydrogen ND only) ===
    setSchroedingerPhaseAnimationEnabled: valueSetter('phaseAnimationEnabled'),

    // === Config Operations ===
    setSchroedingerConfig: (config) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, ...config },
      }))
    },

    initializeSchroedingerForDimension: (dimension) => {
      const paramCount = Math.max(0, dimension - 3)

      // Default color mode for quantum visualization
      const colorMode: SchroedingerColorMode = 'mixed'

      // Extent: standard volume size
      const extent = 2.0

      // Center at origin for all dimensions
      const center = new Array(dimension).fill(0)

      // Scale densityGain with dimension to compensate for
      // product of Hermite polynomials at slice positions.
      // Higher dimensions need more gain to remain visible.
      // Base gain of 2.0 works well for 3D-4D, scale up for higher.
      const baseDensityGain = 2.0
      const dimensionBoost = dimension > 4 ? 1.0 + (dimension - 4) * 0.4 : 1.0
      const densityGain = Math.min(baseDensityGain * dimensionBoost, 5.0) // Clamp to max

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          parameterValues: new Array(paramCount).fill(0),
          center,
          visualizationAxes: [0, 1, 2],
          colorMode,
          extent,
          densityGain,
        },
      }))
    },

    getSchroedingerConfig: () => {
      return { ...get().schroedinger }
    },
  }
}
