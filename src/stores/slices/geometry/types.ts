import {
  type FreeScalarFieldView,
  type FreeScalarInitialCondition,
  type OpenQuantumVisualizationMode,
  type TdseDriveWaveform,
  type TdseFieldView,
  type TdseInitialCondition,
  type TdsePotentialType,
  HydrogenNDPresetName,
  RaymarchQuality,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerPresetName,
  SchroedingerQualityPreset,
  SchroedingerQuantumMode,
  SchroedingerRenderStyle,
  SecondQuantizationMode,
} from '@/lib/geometry/extended/types'

// ============================================================================
// Schroedinger Slice
// ============================================================================
/**
 *
 */
export interface SchroedingerSliceState {
  schroedinger: SchroedingerConfig
}

/**
 *
 */
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
  setSchroedingerRepresentation: (mode: SchroedingerConfig['representation']) => void
  setSchroedingerMomentumDisplayUnits: (units: SchroedingerConfig['momentumDisplayUnits']) => void
  setSchroedingerMomentumScale: (scale: number) => void
  setSchroedingerMomentumHbar: (hbar: number) => void

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
  setSchroedingerDensityContrast: (contrast: number) => void
  setSchroedingerPowderScale: (scale: number) => void
  setSchroedingerSampleCount: (count: number) => void

  // Emission Settings
  setSchroedingerEmissionIntensity: (intensity: number) => void
  setSchroedingerEmissionThreshold: (threshold: number) => void
  setSchroedingerEmissionColorShift: (shift: number) => void
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

  // Quantum Effects
  setSchroedingerNodalEnabled: (enabled: boolean) => void
  setSchroedingerNodalColor: (color: string) => void
  setSchroedingerNodalStrength: (strength: number) => void
  setSchroedingerNodalDefinition: (definition: SchroedingerConfig['nodalDefinition']) => void
  setSchroedingerNodalTolerance: (tolerance: number) => void
  setSchroedingerNodalFamilyFilter: (filter: SchroedingerConfig['nodalFamilyFilter']) => void
  setSchroedingerNodalRenderMode: (mode: SchroedingerConfig['nodalRenderMode']) => void
  setSchroedingerNodalLobeColoringEnabled: (enabled: boolean) => void
  setSchroedingerNodalColorReal: (color: string) => void
  setSchroedingerNodalColorImag: (color: string) => void
  setSchroedingerNodalColorPositive: (color: string) => void
  setSchroedingerNodalColorNegative: (color: string) => void
  setSchroedingerUncertaintyBoundaryEnabled: (enabled: boolean) => void
  setSchroedingerUncertaintyBoundaryStrength: (strength: number) => void
  setSchroedingerUncertaintyConfidenceMass: (mass: number) => void
  setSchroedingerUncertaintyBoundaryWidth: (width: number) => void
  setSchroedingerPhaseMaterialityEnabled: (enabled: boolean) => void
  setSchroedingerPhaseMaterialityStrength: (strength: number) => void
  setSchroedingerInterferenceEnabled: (enabled: boolean) => void
  setSchroedingerInterferenceAmp: (amp: number) => void
  setSchroedingerInterferenceFreq: (freq: number) => void
  setSchroedingerInterferenceSpeed: (speed: number) => void
  // Physical Probability Current (j-field)
  setSchroedingerProbabilityCurrentEnabled: (enabled: boolean) => void
  setSchroedingerProbabilityCurrentStyle: (
    style: SchroedingerConfig['probabilityCurrentStyle']
  ) => void
  setSchroedingerProbabilityCurrentPlacement: (
    placement: SchroedingerConfig['probabilityCurrentPlacement']
  ) => void
  setSchroedingerProbabilityCurrentColorMode: (
    mode: SchroedingerConfig['probabilityCurrentColorMode']
  ) => void
  setSchroedingerProbabilityCurrentScale: (scale: number) => void
  setSchroedingerProbabilityCurrentSpeed: (speed: number) => void
  setSchroedingerProbabilityCurrentDensityThreshold: (threshold: number) => void
  setSchroedingerProbabilityCurrentMagnitudeThreshold: (threshold: number) => void
  setSchroedingerProbabilityCurrentLineDensity: (density: number) => void
  setSchroedingerProbabilityCurrentStepSize: (stepSize: number) => void
  setSchroedingerProbabilityCurrentSteps: (steps: number) => void
  setSchroedingerProbabilityCurrentOpacity: (opacity: number) => void
  // Probability Current Flow
  setSchroedingerProbabilityFlowEnabled: (enabled: boolean) => void
  setSchroedingerProbabilityFlowSpeed: (speed: number) => void
  setSchroedingerProbabilityFlowStrength: (strength: number) => void

  // Radial Probability Overlay (hydrogen)
  setSchroedingerRadialProbabilityEnabled: (enabled: boolean) => void
  setSchroedingerRadialProbabilityOpacity: (opacity: number) => void
  setSchroedingerRadialProbabilityColor: (color: string) => void

  // Isosurface Mode
  setSchroedingerIsoEnabled: (enabled: boolean) => void
  setSchroedingerIsoThreshold: (threshold: number) => void

  // Cross-Section Slice
  setSchroedingerCrossSectionEnabled: (enabled: boolean) => void
  setSchroedingerCrossSectionCompositeMode: (
    mode: SchroedingerConfig['crossSectionCompositeMode']
  ) => void
  setSchroedingerCrossSectionScalar: (scalar: SchroedingerConfig['crossSectionScalar']) => void
  setSchroedingerCrossSectionPlaneMode: (mode: SchroedingerConfig['crossSectionPlaneMode']) => void
  setSchroedingerCrossSectionAxis: (axis: SchroedingerConfig['crossSectionAxis']) => void
  setSchroedingerCrossSectionPlaneNormal: (normal: [number, number, number]) => void
  setSchroedingerCrossSectionPlaneOffset: (offset: number) => void
  setSchroedingerCrossSectionOpacity: (opacity: number) => void
  setSchroedingerCrossSectionThickness: (thickness: number) => void
  setSchroedingerCrossSectionPlaneColor: (color: string) => void
  setSchroedingerCrossSectionAutoWindow: (enabled: boolean) => void
  setSchroedingerCrossSectionWindowMin: (min: number) => void
  setSchroedingerCrossSectionWindowMax: (max: number) => void

  // Slice Animation (4D+ only)
  setSchroedingerSliceAnimationEnabled: (enabled: boolean) => void
  setSchroedingerSliceSpeed: (speed: number) => void
  setSchroedingerSliceAmplitude: (amplitude: number) => void

  // Phase Animation (Hydrogen ND only)
  setSchroedingerPhaseAnimationEnabled: (enabled: boolean) => void

  // Wigner Phase-Space Visualization
  setSchroedingerWignerDimensionIndex: (index: number) => void
  setSchroedingerWignerAutoRange: (enabled: boolean) => void
  setSchroedingerWignerXRange: (range: number) => void
  setSchroedingerWignerPRange: (range: number) => void
  setSchroedingerWignerCrossTermsEnabled: (enabled: boolean) => void
  setSchroedingerWignerQuadPoints: (points: number) => void
  setSchroedingerWignerClassicalOverlay: (enabled: boolean) => void
  setSchroedingerWignerCacheResolution: (resolution: number) => void

  // Second Quantization Educational Layer
  setSchroedingerSqLayerEnabled: (enabled: boolean) => void
  setSchroedingerSqLayerMode: (mode: SecondQuantizationMode) => void
  setSchroedingerSqLayerSelectedModeIndex: (index: number) => void
  setSchroedingerSqLayerFockQuantumNumber: (n: number) => void
  setSchroedingerSqLayerShowOccupation: (show: boolean) => void
  setSchroedingerSqLayerShowUncertainty: (show: boolean) => void
  setSchroedingerSqLayerCoherentAlphaRe: (re: number) => void
  setSchroedingerSqLayerCoherentAlphaIm: (im: number) => void
  setSchroedingerSqLayerSqueezeR: (r: number) => void
  setSchroedingerSqLayerSqueezeTheta: (theta: number) => void

  // Free Scalar Field Configuration
  setFreeScalarLatticeDim: (dim: number) => void
  setFreeScalarGridSize: (size: number[]) => void
  setFreeScalarSpacing: (spacing: number[]) => void
  setFreeScalarMass: (mass: number) => void
  setFreeScalarDt: (dt: number) => void
  setFreeScalarStepsPerFrame: (steps: number) => void
  setFreeScalarInitialCondition: (condition: FreeScalarInitialCondition) => void
  setFreeScalarFieldView: (view: FreeScalarFieldView) => void
  setFreeScalarPacketCenter: (center: number[]) => void
  setFreeScalarPacketWidth: (width: number) => void
  setFreeScalarPacketAmplitude: (amplitude: number) => void
  setFreeScalarModeK: (k: number[]) => void
  setFreeScalarAutoScale: (autoScale: boolean) => void
  setFreeScalarVacuumSeed: (seed: number) => void
  setFreeScalarSlicePosition: (dimIndex: number, value: number) => void
  resetFreeScalarField: () => void
  clearFreeScalarNeedsReset: () => void

  // k-Space Visualization Display Transforms
  setFreeScalarKSpaceDisplayMode: (mode: import('@/lib/geometry/extended/types').KSpaceDisplayMode) => void
  setFreeScalarKSpaceFftShift: (enabled: boolean) => void
  setFreeScalarKSpaceExposureMode: (mode: import('@/lib/geometry/extended/types').KSpaceExposureMode) => void
  setFreeScalarKSpaceLowPercentile: (value: number) => void
  setFreeScalarKSpaceHighPercentile: (value: number) => void
  setFreeScalarKSpaceGamma: (value: number) => void
  setFreeScalarKSpaceBroadeningEnabled: (enabled: boolean) => void
  setFreeScalarKSpaceBroadeningRadius: (value: number) => void
  setFreeScalarKSpaceBroadeningSigma: (value: number) => void
  setFreeScalarKSpaceRadialBinCount: (value: number) => void

  // TDSE (Time-Dependent Schroedinger Equation) Configuration
  setTdseLatticeDim: (dim: number) => void
  setTdseGridSize: (size: number[]) => void
  setTdseSpacing: (spacing: number[]) => void
  setTdseMass: (mass: number) => void
  setTdseHbar: (hbar: number) => void
  setTdseDt: (dt: number) => void
  setTdseStepsPerFrame: (steps: number) => void
  setTdseInitialCondition: (condition: TdseInitialCondition) => void
  setTdsePacketCenter: (center: number[]) => void
  setTdsePacketWidth: (width: number) => void
  setTdsePacketAmplitude: (amplitude: number) => void
  setTdsePacketMomentum: (momentum: number[]) => void
  setTdsePotentialType: (type: TdsePotentialType) => void
  setTdseBarrierHeight: (height: number) => void
  setTdseBarrierWidth: (width: number) => void
  setTdseBarrierCenter: (center: number) => void
  setTdseWellDepth: (depth: number) => void
  setTdseWellWidth: (width: number) => void
  setTdseHarmonicOmega: (omega: number) => void
  setTdseStepHeight: (height: number) => void
  setTdseSlitSeparation: (separation: number) => void
  setTdseSlitWidth: (width: number) => void
  setTdseWallThickness: (thickness: number) => void
  setTdseWallHeight: (height: number) => void
  setTdseLatticeDepth: (depth: number) => void
  setTdseLatticePeriod: (period: number) => void
  setTdseDoubleWellLambda: (lambda: number) => void
  setTdseDoubleWellSeparation: (separation: number) => void
  setTdseDoubleWellAsymmetry: (asymmetry: number) => void
  setTdseDriveEnabled: (enabled: boolean) => void
  setTdseDriveWaveform: (waveform: TdseDriveWaveform) => void
  setTdseDriveFrequency: (frequency: number) => void
  setTdseDriveAmplitude: (amplitude: number) => void
  setTdseAbsorberEnabled: (enabled: boolean) => void
  setTdseAbsorberWidth: (width: number) => void
  setTdseAbsorberStrength: (strength: number) => void
  setTdseFieldView: (view: TdseFieldView) => void
  setTdseAutoScale: (autoScale: boolean) => void
  setTdseShowPotential: (show: boolean) => void
  setTdseAutoLoop: (autoLoop: boolean) => void
  setTdseDiagnosticsEnabled: (enabled: boolean) => void
  setTdseDiagnosticsInterval: (interval: number) => void
  setTdseSlicePosition: (dimIndex: number, value: number) => void
  applyTdsePreset: (presetId: string) => void
  resetTdseField: () => void
  clearTdseNeedsReset: () => void

  // Open Quantum System
  setOpenQuantumEnabled: (enabled: boolean) => void
  setOpenQuantumDephasingRate: (rate: number) => void
  setOpenQuantumRelaxationRate: (rate: number) => void
  setOpenQuantumThermalUpRate: (rate: number) => void
  setOpenQuantumDt: (dt: number) => void
  setOpenQuantumSubsteps: (n: number) => void
  setOpenQuantumChannelEnabled: (
    channel: 'dephasing' | 'relaxation' | 'thermal',
    enabled: boolean,
  ) => void
  setOpenQuantumVisualizationMode: (mode: OpenQuantumVisualizationMode) => void
  requestOpenQuantumStateReset: () => void
  resetOpenQuantumToDefault: () => void
  setOpenQuantumBathTemperature: (T: number) => void
  setOpenQuantumCouplingScale: (s: number) => void
  setOpenQuantumHydrogenBasisMaxN: (n: number) => void
  setOpenQuantumDephasingModel: (model: 'none' | 'uniform') => void

  // Config Operations
  setSchroedingerConfig: (config: Partial<SchroedingerConfig>) => void
  initializeSchroedingerForDimension: (dimension: number) => void
  getSchroedingerConfig: () => SchroedingerConfig
}

/**
 *
 */
export type SchroedingerSlice = SchroedingerSliceState & SchroedingerSliceActions

// ============================================================================
// Combined Extended Object Slice
// ============================================================================
/**
 *
 */
export type ExtendedObjectSlice = SchroedingerSlice & {
  /** Version counter for schroedinger state changes (dirty-flag tracking) */
  schroedingerVersion: number
  /** Manually bump all version counters (used after direct setState calls) */
  bumpAllVersions: () => void
  reset: () => void
}
