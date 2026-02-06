import {
  HydrogenNDPresetName,
  RaymarchQuality,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerPresetName,
  SchroedingerQualityPreset,
  SchroedingerQuantumMode,
  SchroedingerRenderStyle,
} from '@/lib/geometry/extended/types'

// ============================================================================
// Schroedinger Slice
// ============================================================================
export interface SchroedingerSliceState {
  schroedinger: SchroedingerConfig
}

export interface SchroedingerSliceActions {
  // Geometry Settings
  setSchroedingerScale: (scale: number) => void

  // Quality Settings
  setSchroedingerQualityPreset: (preset: SchroedingerQualityPreset) => void
  setSchroedingerResolution: (value: number) => void

  // Visualization Axes
  setSchroedingerVisualizationAxes: (axes: [number, number, number]) => void
  setSchroedingerVisualizationAxis: (index: 0 | 1 | 2, dimIndex: number) => void

  // Slice Parameters
  setSchroedingerParameterValue: (dimIndex: number, value: number) => void
  setSchroedingerParameterValues: (values: number[]) => void
  resetSchroedingerParameters: () => void

  // Navigation
  setSchroedingerCenter: (center: number[]) => void
  setSchroedingerExtent: (extent: number) => void
  fitSchroedingerToView: () => void

  // Color Settings
  setSchroedingerColorMode: (mode: SchroedingerColorMode) => void
  setSchroedingerPalette: (palette: SchroedingerPalette) => void
  setSchroedingerCustomPalette: (palette: { start: string; mid: string; end: string }) => void
  setSchroedingerInvertColors: (invert: boolean) => void

  // Rendering Style
  setSchroedingerRenderStyle: (style: SchroedingerRenderStyle) => void

  // Quantum Mode Selection
  setSchroedingerQuantumMode: (mode: SchroedingerQuantumMode) => void

  // Harmonic Oscillator Configuration
  setSchroedingerPresetName: (name: SchroedingerPresetName) => void
  setSchroedingerSeed: (seed: number) => void
  randomizeSchroedingerSeed: () => void
  setSchroedingerTermCount: (count: number) => void
  setSchroedingerMaxQuantumNumber: (maxN: number) => void
  setSchroedingerFrequencySpread: (spread: number) => void

  // Hydrogen Configuration
  setSchroedingerPrincipalQuantumNumber: (n: number) => void
  setSchroedingerAzimuthalQuantumNumber: (l: number) => void
  setSchroedingerMagneticQuantumNumber: (m: number) => void
  setSchroedingerUseRealOrbitals: (useReal: boolean) => void
  setSchroedingerBohrRadiusScale: (scale: number) => void

  // Hydrogen ND Configuration
  setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => void
  setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => void
  setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => void
  setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => void
  setSchroedingerExtraDimOmegaAll: (omegas: number[]) => void
  setSchroedingerExtraDimFrequencySpread: (spread: number) => void

  // Volume Rendering Parameters
  setSchroedingerTimeScale: (scale: number) => void
  setSchroedingerFieldScale: (scale: number) => void
  setSchroedingerDensityGain: (gain: number) => void
  setSchroedingerPowderScale: (scale: number) => void
  setSchroedingerSampleCount: (count: number) => void
  setSchroedingerUseDensityGrid: (enabled: boolean) => void

  // Emission Settings
  setSchroedingerEmissionIntensity: (intensity: number) => void
  setSchroedingerEmissionThreshold: (threshold: number) => void
  setSchroedingerEmissionColorShift: (shift: number) => void
  setSchroedingerEmissionPulsing: (pulsing: boolean) => void
  setSchroedingerRimExponent: (exponent: number) => void
  setSchroedingerScatteringAnisotropy: (anisotropy: number) => void
  setSchroedingerRoughness: (roughness: number) => void

  // Fog Settings
  setSchroedingerFogIntegrationEnabled: (enabled: boolean) => void
  setSchroedingerFogContribution: (contribution: number) => void
  setSchroedingerInternalFogDensity: (density: number) => void

  // Raymarching Quality
  setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => void

  // SSS Settings
  setSchroedingerSssEnabled: (enabled: boolean) => void
  setSchroedingerSssIntensity: (intensity: number) => void
  setSchroedingerSssColor: (color: string) => void
  setSchroedingerSssThickness: (thickness: number) => void
  setSchroedingerSssJitter: (jitter: number) => void

  // Erosion Settings
  setSchroedingerErosionStrength: (strength: number) => void
  setSchroedingerErosionScale: (scale: number) => void
  setSchroedingerErosionTurbulence: (turbulence: number) => void
  setSchroedingerErosionNoiseType: (type: number) => void
  setSchroedingerErosionHQ: (hq: boolean) => void

  // Curl Noise Settings
  setSchroedingerCurlEnabled: (enabled: boolean) => void
  setSchroedingerCurlStrength: (strength: number) => void
  setSchroedingerCurlScale: (scale: number) => void
  setSchroedingerCurlSpeed: (speed: number) => void
  setSchroedingerCurlBias: (bias: number) => void

  // Dispersion Settings
  setSchroedingerDispersionEnabled: (enabled: boolean) => void
  setSchroedingerDispersionStrength: (strength: number) => void
  setSchroedingerDispersionDirection: (direction: number) => void
  setSchroedingerDispersionQuality: (quality: number) => void

  // Shadow Settings
  setSchroedingerShadowsEnabled: (enabled: boolean) => void
  setSchroedingerShadowStrength: (strength: number) => void
  setSchroedingerShadowSteps: (steps: number) => void

  // AO Settings
  setSchroedingerAoEnabled: (enabled: boolean) => void
  setSchroedingerAoStrength: (strength: number) => void
  setSchroedingerAoQuality: (quality: number) => void
  setSchroedingerAoRadius: (radius: number) => void
  setSchroedingerAoColor: (color: string) => void

  // Quantum Effects
  setSchroedingerNodalEnabled: (enabled: boolean) => void
  setSchroedingerNodalColor: (color: string) => void
  setSchroedingerNodalStrength: (strength: number) => void
  setSchroedingerEnergyColorEnabled: (enabled: boolean) => void
  setSchroedingerShimmerEnabled: (enabled: boolean) => void
  setSchroedingerShimmerStrength: (strength: number) => void

  // Isosurface Mode
  setSchroedingerIsoEnabled: (enabled: boolean) => void
  setSchroedingerIsoThreshold: (threshold: number) => void

  // Slice Animation (4D+ only)
  setSchroedingerSliceAnimationEnabled: (enabled: boolean) => void
  setSchroedingerSliceSpeed: (speed: number) => void
  setSchroedingerSliceAmplitude: (amplitude: number) => void

  // Spread Animation
  setSchroedingerSpreadAnimationEnabled: (enabled: boolean) => void
  setSchroedingerSpreadAnimationSpeed: (speed: number) => void

  // Phase Animation (Hydrogen ND only)
  setSchroedingerPhaseAnimationEnabled: (enabled: boolean) => void

  // Config Operations
  setSchroedingerConfig: (config: Partial<SchroedingerConfig>) => void
  initializeSchroedingerForDimension: (dimension: number) => void
  getSchroedingerConfig: () => SchroedingerConfig
}

export type SchroedingerSlice = SchroedingerSliceState & SchroedingerSliceActions

// ============================================================================
// Combined Extended Object Slice
// ============================================================================
export type ExtendedObjectSlice = SchroedingerSlice & {
  /** Version counter for schroedinger state changes (dirty-flag tracking) */
  schroedingerVersion: number
  /** Manually bump all version counters (used after direct setState calls) */
  bumpAllVersions: () => void
  reset: () => void
}
