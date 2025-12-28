import {
  DEFAULT_SCHROEDINGER_CONFIG,
  RAYMARCH_QUALITY_TO_SAMPLES,
  type RaymarchQuality,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  SchroedingerPresetName,
  SchroedingerQuantumMode,
  HydrogenOrbitalPresetName,
  HydrogenNDPresetName,
} from '@/lib/geometry/extended/types'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { getHydrogenPreset } from '@/lib/geometry/extended/schroedinger/hydrogenPresets'
import { getHydrogenNDPreset } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'

export const createSchroedingerSlice: StateCreator<ExtendedObjectSlice, [], [], SchroedingerSlice> = (set, get) => {
  /**
   * Wrapped setter that auto-increments schroedingerVersion when schroedinger state changes.
   * This avoids manually adding version increment to 80+ individual setters.
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
  setSchroedingerColorMode: (mode: SchroedingerColorMode) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, colorMode: mode },
    }))
  },

  setSchroedingerPalette: (palette) => {
    const definitions = SCHROEDINGER_PALETTE_DEFINITIONS[palette]
    setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        palette,
        cosineParams: definitions ? definitions : state.schroedinger.cosineParams
      },
    }))
  },

  setSchroedingerCustomPalette: (palette) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, customPalette: palette },
    }))
  },

  setSchroedingerInvertColors: (invert) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, invertColors: invert },
    }))
  },

  // === Rendering Style ===
  setSchroedingerRenderStyle: (style) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, renderStyle: style },
    }))
  },

  // === Quantum State Configuration ===
  setSchroedingerPresetName: (name: SchroedingerPresetName) => {
    // If selecting a named preset, apply its parameters to the state
    // This keeps the UI sliders in sync with the visual preset
    let updates = {};
    if (name !== 'custom') {
      const preset = SCHROEDINGER_NAMED_PRESETS[name];
      if (preset) {
        updates = {
          seed: preset.seed,
          termCount: preset.termCount,
          maxQuantumNumber: preset.maxN,
          frequencySpread: preset.frequencySpread
        };
      }
    }

    setWithVersion((state) => ({
      schroedinger: { 
        ...state.schroedinger, 
        presetName: name,
        ...updates
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
      schroedinger: { ...state.schroedinger, maxQuantumNumber: clampedMaxN, presetName: 'custom' },
    }))
  },

  setSchroedingerFrequencySpread: (spread) => {
    const clampedSpread = Math.max(0, Math.min(0.5, spread))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, frequencySpread: clampedSpread, presetName: 'custom' },
    }))
  },

  // === Quantum Mode Selection ===
  setSchroedingerQuantumMode: (mode: SchroedingerQuantumMode) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, quantumMode: mode },
    }))
  },

  // === Hydrogen Orbital Configuration ===
  setSchroedingerHydrogenPreset: (presetName: HydrogenOrbitalPresetName) => {
    // For 'custom', only update the preset name - preserve existing quantum numbers
    if (presetName === 'custom') {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenPreset: presetName,
        },
      }))
      return
    }

    // For named presets, apply all preset values
    const preset = getHydrogenPreset(presetName)
    setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        hydrogenPreset: presetName,
        principalQuantumNumber: preset.n,
        azimuthalQuantumNumber: preset.l,
        magneticQuantumNumber: preset.m,
        useRealOrbitals: preset.useReal,
        bohrRadiusScale: preset.bohrRadiusScale,
      },
    }))
  },

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
        hydrogenPreset: 'custom',
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
        hydrogenPreset: 'custom',
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
        hydrogenPreset: 'custom',
      },
    }))
  },

  setSchroedingerUseRealOrbitals: (useReal: boolean) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, useRealOrbitals: useReal },
    }))
  },

  setSchroedingerBohrRadiusScale: (scale: number) => {
    const clamped = Math.max(0.5, Math.min(3.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, bohrRadiusScale: clamped },
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
  setSchroedingerTimeScale: (scale) => {
    const clampedScale = Math.max(0.1, Math.min(2.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, timeScale: clampedScale },
    }))
  },

  setSchroedingerFieldScale: (scale) => {
    const clampedScale = Math.max(0.5, Math.min(2.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, fieldScale: clampedScale },
    }))
  },

  setSchroedingerDensityGain: (gain) => {
    const clampedGain = Math.max(0.1, Math.min(5.0, gain))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, densityGain: clampedGain },
    }))
  },

  setSchroedingerPowderScale: (scale) => {
    const clampedScale = Math.max(0.0, Math.min(2.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, powderScale: clampedScale },
    }))
  },

  setSchroedingerSampleCount: (count) => {
    const clampedCount = Math.max(16, Math.min(128, count))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sampleCount: clampedCount },
    }))
  },

  setSchroedingerEmissionIntensity: (intensity) => {
    const clamped = Math.max(0.0, Math.min(5.0, intensity))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, emissionIntensity: clamped },
    }))
  },

  setSchroedingerEmissionThreshold: (threshold) => {
    const clamped = Math.max(0.0, Math.min(1.0, threshold))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, emissionThreshold: clamped },
    }))
  },

  setSchroedingerEmissionColorShift: (shift) => {
    const clamped = Math.max(-1.0, Math.min(1.0, shift))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, emissionColorShift: clamped },
    }))
  },

  setSchroedingerEmissionPulsing: (pulsing) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, emissionPulsing: pulsing },
    }))
  },

  setSchroedingerRimExponent: (exponent) => {
    const clamped = Math.max(1.0, Math.min(10.0, exponent))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, rimExponent: clamped },
    }))
  },

  setSchroedingerScatteringAnisotropy: (anisotropy) => {
    const clamped = Math.max(-0.9, Math.min(0.9, anisotropy))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, scatteringAnisotropy: clamped },
    }))
  },

  setSchroedingerRoughness: (roughness) => {
    const clamped = Math.max(0.0, Math.min(1.0, roughness))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, roughness: clamped },
    }))
  },

  setSchroedingerFogIntegrationEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, fogIntegrationEnabled: enabled },
    }))
  },

  setSchroedingerFogContribution: (contribution) => {
    const clamped = Math.max(0.0, Math.min(2.0, contribution))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, fogContribution: clamped },
    }))
  },

  setSchroedingerInternalFogDensity: (density) => {
    const clamped = Math.max(0.0, Math.min(1.0, density))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, internalFogDensity: clamped },
    }))
  },

  setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => {
    // Update both raymarchQuality and sampleCount for consistency.
    // Note: The mesh reads raymarchQuality directly via RAYMARCH_QUALITY_TO_SAMPLES mapping.
    // sampleCount is kept in sync for backward compatibility with any code that reads it directly.
    const sampleCount = RAYMARCH_QUALITY_TO_SAMPLES[quality]
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, raymarchQuality: quality, sampleCount },
    }))
  },

  setSchroedingerSssEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sssEnabled: enabled },
    }))
  },

  setSchroedingerSssIntensity: (intensity) => {
    const clamped = Math.max(0.0, Math.min(2.0, intensity))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sssIntensity: clamped },
    }))
  },

  setSchroedingerSssColor: (color) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sssColor: color },
    }))
  },

  setSchroedingerSssThickness: (thickness) => {
    const clamped = Math.max(0.1, Math.min(5.0, thickness))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sssThickness: clamped },
    }))
  },

  setSchroedingerSssJitter: (jitter) => {
    const clamped = Math.max(0.0, Math.min(1.0, jitter))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sssJitter: clamped },
    }))
  },

  setSchroedingerErosionStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(1.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, erosionStrength: clamped },
    }))
  },

  setSchroedingerErosionScale: (scale) => {
    const clamped = Math.max(0.25, Math.min(4.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, erosionScale: clamped },
    }))
  },

  setSchroedingerErosionTurbulence: (turbulence) => {
    const clamped = Math.max(0.0, Math.min(1.0, turbulence))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, erosionTurbulence: clamped },
    }))
  },

  setSchroedingerErosionNoiseType: (type) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, erosionNoiseType: type },
    }))
  },

  setSchroedingerCurlEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, curlEnabled: enabled },
    }))
  },

  setSchroedingerCurlStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(1.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, curlStrength: clamped },
    }))
  },

  setSchroedingerCurlScale: (scale) => {
    const clamped = Math.max(0.25, Math.min(4.0, scale))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, curlScale: clamped },
    }))
  },

  setSchroedingerCurlSpeed: (speed) => {
    const clamped = Math.max(0.1, Math.min(5.0, speed))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, curlSpeed: clamped },
    }))
  },

  setSchroedingerCurlBias: (bias) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, curlBias: bias },
    }))
  },

  setSchroedingerDispersionEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, dispersionEnabled: enabled },
    }))
  },

  setSchroedingerDispersionStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(1.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, dispersionStrength: clamped },
    }))
  },

  setSchroedingerDispersionDirection: (direction) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, dispersionDirection: direction },
    }))
  },

  setSchroedingerDispersionQuality: (quality) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, dispersionQuality: quality },
    }))
  },

  setSchroedingerShadowsEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, shadowsEnabled: enabled },
    }))
  },

  setSchroedingerShadowStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(2.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, shadowStrength: clamped },
    }))
  },

  setSchroedingerShadowSteps: (steps) => {
    const clamped = Math.max(1, Math.min(8, steps))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, shadowSteps: clamped },
    }))
  },

  setSchroedingerAoEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, aoEnabled: enabled },
    }))
  },

  setSchroedingerAoStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(2.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, aoStrength: clamped },
    }))
  },

  setSchroedingerAoQuality: (quality) => {
    const clamped = Math.max(3, Math.min(8, quality))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, aoQuality: clamped },
    }))
  },

  setSchroedingerAoRadius: (radius) => {
    const clamped = Math.max(0.1, Math.min(2.0, radius))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, aoRadius: clamped },
    }))
  },

  setSchroedingerAoColor: (color) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, aoColor: color },
    }))
  },

  setSchroedingerNodalEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, nodalEnabled: enabled },
    }))
  },

  setSchroedingerNodalColor: (color) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, nodalColor: color },
    }))
  },

  setSchroedingerNodalStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(2.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, nodalStrength: clamped },
    }))
  },

  setSchroedingerEnergyColorEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, energyColorEnabled: enabled },
    }))
  },

  setSchroedingerShimmerEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, shimmerEnabled: enabled },
    }))
  },

  setSchroedingerShimmerStrength: (strength) => {
    const clamped = Math.max(0.0, Math.min(1.0, strength))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, shimmerStrength: clamped },
    }))
  },

  setSchroedingerIsoEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, isoEnabled: enabled },
    }))
  },

  setSchroedingerIsoThreshold: (threshold) => {
    const clampedThreshold = Math.max(-6, Math.min(0, threshold))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, isoThreshold: clampedThreshold },
    }))
  },

  // === Origin Drift Animation ===
  setSchroedingerOriginDriftEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, originDriftEnabled: enabled },
    }))
  },

  setSchroedingerDriftAmplitude: (amplitude) => {
    const clampedAmplitude = Math.max(0.01, Math.min(0.5, amplitude))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, driftAmplitude: clampedAmplitude },
    }))
  },

  setSchroedingerDriftBaseFrequency: (frequency) => {
    const clampedFrequency = Math.max(0.05, Math.min(0.5, frequency))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, driftBaseFrequency: clampedFrequency },
    }))
  },

  setSchroedingerDriftFrequencySpread: (spread) => {
    const clampedSpread = Math.max(0.0, Math.min(1.0, spread))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, driftFrequencySpread: clampedSpread },
    }))
  },

  // === Slice Animation (4D+ only) ===
  setSchroedingerSliceAnimationEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sliceAnimationEnabled: enabled },
    }))
  },

  setSchroedingerSliceSpeed: (speed) => {
    const clampedSpeed = Math.max(0.01, Math.min(0.1, speed))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sliceSpeed: clampedSpeed },
    }))
  },

  setSchroedingerSliceAmplitude: (amplitude) => {
    const clampedAmplitude = Math.max(0.1, Math.min(1.0, amplitude))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, sliceAmplitude: clampedAmplitude },
    }))
  },

  // === Spread Animation ===
  setSchroedingerSpreadAnimationEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, spreadAnimationEnabled: enabled },
    }))
  },

  setSchroedingerSpreadAnimationSpeed: (speed) => {
    const clampedSpeed = Math.max(0.1, Math.min(2.0, speed))
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, spreadAnimationSpeed: clampedSpeed },
    }))
  },

  // === Phase Animation (Hydrogen ND only) ===
  setSchroedingerPhaseAnimationEnabled: (enabled) => {
    setWithVersion((state) => ({
      schroedinger: { ...state.schroedinger, phaseAnimationEnabled: enabled },
    }))
  },

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
}}
