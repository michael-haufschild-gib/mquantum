import {
  BlackHoleConfig,
  BlackHoleLightingMode,
  BlackHoleManifoldType,
  BlackHolePaletteMode,
  BlackHoleQuality,
  BlackHoleRayBendingMode,
  CliffordTorusConfig,
  CliffordTorusEdgeMode,
  CliffordTorusMode,
  HydrogenNDPresetName,
  HydrogenOrbitalPresetName,
  MandelbulbColorMode,
  MandelbulbConfig,
  MandelbulbPalette,
  MandelbulbQualityPreset,
  MandelbulbRenderStyle,
  NestedTorusConfig,
  NestedTorusEdgeMode,
  PolytopeConfig,
  QuaternionJuliaConfig,
  RaymarchQuality,
  RootSystemConfig,
  RootSystemType,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerPresetName,
  SchroedingerQualityPreset,
  SchroedingerQuantumMode,
  SchroedingerRenderStyle,
  WythoffPolytopeConfig,
  WythoffPreset,
  WythoffSymmetryGroup,
} from '@/lib/geometry/extended/types'

// ============================================================================
// Polytope Slice
// ============================================================================
export interface PolytopeSliceState {
  polytope: PolytopeConfig
}

export interface PolytopeSliceActions {
  setPolytopeScale: (scale: number) => void
  initializePolytopeForType: (polytopeType: string) => void

  // Modulation / Breathing Animation
  setPolytopeFacetOffsetEnabled: (enabled: boolean) => void
  setPolytopeFacetOffsetAmplitude: (amplitude: number) => void
  setPolytopeFacetOffsetFrequency: (frequency: number) => void
  setPolytopeFacetOffsetPhaseSpread: (spread: number) => void
  setPolytopeFacetOffsetBias: (bias: number) => void
}

export type PolytopeSlice = PolytopeSliceState & PolytopeSliceActions

// ============================================================================
// Wythoff Polytope Slice
// ============================================================================
export interface WythoffPolytopeSliceState {
  wythoffPolytope: WythoffPolytopeConfig
}

export interface WythoffPolytopeSliceActions {
  setWythoffSymmetryGroup: (symmetryGroup: WythoffSymmetryGroup) => void
  setWythoffPreset: (preset: WythoffPreset) => void
  setWythoffCustomSymbol: (customSymbol: boolean[]) => void
  setWythoffScale: (scale: number) => void
  setWythoffSnub: (snub: boolean) => void
  setWythoffConfig: (config: Partial<WythoffPolytopeConfig>) => void
  initializeWythoffForDimension: (dimension: number) => void
}

export type WythoffPolytopeSlice = WythoffPolytopeSliceState & WythoffPolytopeSliceActions

// ============================================================================
// Root System Slice
// ============================================================================
export interface RootSystemSliceState {
  rootSystem: RootSystemConfig
}

export interface RootSystemSliceActions {
  setRootSystemType: (type: RootSystemType) => void
  setRootSystemScale: (scale: number) => void
}

export type RootSystemSlice = RootSystemSliceState & RootSystemSliceActions

// ============================================================================
// Clifford Torus Slice
// ============================================================================
export interface CliffordTorusSliceState {
  cliffordTorus: CliffordTorusConfig
}

export interface CliffordTorusSliceActions {
  setCliffordTorusRadius: (radius: number) => void
  setCliffordTorusEdgeMode: (mode: CliffordTorusEdgeMode) => void
  setCliffordTorusMode: (mode: CliffordTorusMode) => void
  setCliffordTorusResolutionU: (resolution: number) => void
  setCliffordTorusResolutionV: (resolution: number) => void
  setCliffordTorusStepsPerCircle: (steps: number) => void
  initializeCliffordTorusForDimension: (dimension: number) => void
}

export type CliffordTorusSlice = CliffordTorusSliceState & CliffordTorusSliceActions

// ============================================================================
// Nested Torus Slice
// ============================================================================
export interface NestedTorusSliceState {
  nestedTorus: NestedTorusConfig
}

export interface NestedTorusSliceActions {
  setNestedTorusRadius: (radius: number) => void
  setNestedTorusEdgeMode: (mode: NestedTorusEdgeMode) => void
  setNestedTorusEta: (eta: number) => void
  setNestedTorusResolutionXi1: (resolution: number) => void
  setNestedTorusResolutionXi2: (resolution: number) => void
  setNestedTorusShowNestedTori: (show: boolean) => void
  setNestedTorusNumberOfTori: (count: number) => void
  setNestedTorusFiberResolution: (resolution: number) => void
  setNestedTorusBaseResolution: (resolution: number) => void
  setNestedTorusShowFiberStructure: (show: boolean) => void
}

export type NestedTorusSlice = NestedTorusSliceState & NestedTorusSliceActions

// ============================================================================
// Mandelbulb Slice
// ============================================================================
export interface MandelbulbSliceState {
  mandelbulb: MandelbulbConfig
}

export interface MandelbulbSliceActions {
  setMandelbulbScale: (scale: number) => void
  setMandelbulbMaxIterations: (value: number) => void
  setMandelbulbEscapeRadius: (value: number) => void
  setMandelbulbQualityPreset: (preset: MandelbulbQualityPreset) => void
  setMandelbulbResolution: (value: number) => void
  setMandelbulbVisualizationAxes: (axes: [number, number, number]) => void
  setMandelbulbVisualizationAxis: (index: 0 | 1 | 2, dimIndex: number) => void
  setMandelbulbParameterValue: (dimIndex: number, value: number) => void
  setMandelbulbParameterValues: (values: number[]) => void
  resetMandelbulbParameters: () => void
  setMandelbulbCenter: (center: number[]) => void
  setMandelbulbExtent: (extent: number) => void
  fitMandelbulbToView: () => void
  setMandelbulbColorMode: (mode: MandelbulbColorMode) => void
  setMandelbulbPalette: (palette: MandelbulbPalette) => void
  setMandelbulbCustomPalette: (palette: { start: string; mid: string; end: string }) => void
  setMandelbulbInvertColors: (invert: boolean) => void
  setMandelbulbInteriorColor: (color: string) => void
  setMandelbulbPaletteCycles: (cycles: number) => void
  setMandelbulbRenderStyle: (style: MandelbulbRenderStyle) => void
  setMandelbulbPointSize: (size: number) => void
  setMandelbulbBoundaryThreshold: (threshold: [number, number]) => void
  setMandelbulbMandelbulbPower: (power: number) => void
  setMandelbulbConfig: (config: Partial<MandelbulbConfig>) => void
  initializeMandelbulbForDimension: (dimension: number) => void
  getMandelbulbConfig: () => MandelbulbConfig
  // Power Animation (Mandelbulb-specific)
  setMandelbulbPowerAnimationEnabled: (enabled: boolean) => void
  setMandelbulbPowerMin: (min: number) => void
  setMandelbulbPowerMax: (max: number) => void
  setMandelbulbPowerSpeed: (speed: number) => void
  // Alternate Power (Technique B variant)
  setMandelbulbAlternatePowerEnabled: (enabled: boolean) => void
  setMandelbulbAlternatePowerValue: (power: number) => void
  setMandelbulbAlternatePowerBlend: (blend: number) => void
  // Dimension Mixing (Technique A)
  setMandelbulbDimensionMixEnabled: (enabled: boolean) => void
  setMandelbulbMixIntensity: (intensity: number) => void
  setMandelbulbMixFrequency: (frequency: number) => void
  // Origin Drift (Technique C)
  setMandelbulbOriginDriftEnabled: (enabled: boolean) => void
  setMandelbulbDriftAmplitude: (amplitude: number) => void
  setMandelbulbDriftBaseFrequency: (frequency: number) => void
  setMandelbulbDriftFrequencySpread: (spread: number) => void
  // Slice Animation (4D+ only)
  setMandelbulbSliceAnimationEnabled: (enabled: boolean) => void
  setMandelbulbSliceSpeed: (speed: number) => void
  setMandelbulbSliceAmplitude: (amplitude: number) => void
  // Angular Phase Shifts
  setMandelbulbPhaseShiftEnabled: (enabled: boolean) => void
  setMandelbulbPhaseSpeed: (speed: number) => void
  setMandelbulbPhaseAmplitude: (amplitude: number) => void

  // Advanced Rendering
  setMandelbulbRoughness: (value: number) => void
  setMandelbulbSssEnabled: (value: boolean) => void
  setMandelbulbSssIntensity: (value: number) => void
  setMandelbulbSssColor: (value: string) => void
  setMandelbulbSssThickness: (value: number) => void
}

export type MandelbulbSlice = MandelbulbSliceState & MandelbulbSliceActions

// ============================================================================
// Quaternion Julia Slice
// ============================================================================
export interface QuaternionJuliaSliceState {
  quaternionJulia: QuaternionJuliaConfig
}

export interface QuaternionJuliaSliceActions {
  // Core parameters
  setQuaternionJuliaConstant: (value: [number, number, number, number]) => void
  setQuaternionJuliaPower: (value: number) => void
  setQuaternionJuliaMaxIterations: (value: number) => void
  setQuaternionJuliaBailoutRadius: (value: number) => void
  setQuaternionJuliaScale: (value: number) => void
  // Quality parameters
  setQuaternionJuliaSurfaceThreshold: (value: number) => void
  setQuaternionJuliaMaxRaymarchSteps: (value: number) => void
  setQuaternionJuliaQualityMultiplier: (value: number) => void
  setQuaternionJuliaQualityPreset: (preset: 'draft' | 'standard' | 'high' | 'ultra') => void
  // D-dimensional parameters
  setQuaternionJuliaParameterValue: (index: number, value: number) => void
  setQuaternionJuliaParameterValues: (values: number[]) => void
  resetQuaternionJuliaParameters: () => void
  initializeQuaternionJuliaForDimension: (dimension: number) => void
  // Color parameters
  setQuaternionJuliaColorMode: (value: number) => void
  setQuaternionJuliaBaseColor: (value: string) => void
  setQuaternionJuliaCosineCoefficients: (
    coefficients: QuaternionJuliaConfig['cosineCoefficients']
  ) => void
  setQuaternionJuliaColorPower: (value: number) => void
  setQuaternionJuliaColorCycles: (value: number) => void
  setQuaternionJuliaColorOffset: (value: number) => void
  setQuaternionJuliaLchLightness: (value: number) => void
  setQuaternionJuliaLchChroma: (value: number) => void
  // Opacity parameters
  setQuaternionJuliaOpacityMode: (value: number) => void
  setQuaternionJuliaOpacity: (value: number) => void
  setQuaternionJuliaLayerCount: (value: number) => void
  setQuaternionJuliaLayerOpacity: (value: number) => void
  setQuaternionJuliaVolumetricDensity: (value: number) => void
  // Shadow parameters
  setQuaternionJuliaShadowEnabled: (value: boolean) => void
  setQuaternionJuliaShadowQuality: (value: number) => void
  setQuaternionJuliaShadowSoftness: (value: number) => void
  setQuaternionJuliaShadowAnimationMode: (value: number) => void
  // Utility
  getQuaternionJuliaConfig: () => QuaternionJuliaConfig
  randomizeJuliaConstant: () => void

  // Advanced Rendering
  setQuaternionJuliaRoughness: (value: number) => void
  setQuaternionJuliaSssEnabled: (value: boolean) => void
  setQuaternionJuliaSssIntensity: (value: number) => void
  setQuaternionJuliaSssColor: (value: string) => void
  setQuaternionJuliaSssThickness: (value: number) => void

  // Atmosphere
  setQuaternionJuliaFogEnabled: (value: boolean) => void
  setQuaternionJuliaFogContribution: (value: number) => void
  setQuaternionJuliaInternalFogDensity: (value: number) => void
}

export type QuaternionJuliaSlice = QuaternionJuliaSliceState & QuaternionJuliaSliceActions

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

  // Hydrogen Orbital Configuration
  setSchroedingerHydrogenPreset: (presetName: HydrogenOrbitalPresetName) => void
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

  // Origin Drift Animation
  setSchroedingerOriginDriftEnabled: (enabled: boolean) => void
  setSchroedingerDriftAmplitude: (amplitude: number) => void
  setSchroedingerDriftBaseFrequency: (frequency: number) => void
  setSchroedingerDriftFrequencySpread: (spread: number) => void

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
// Black Hole Slice
// ============================================================================
export interface BlackHoleSliceState {
  blackhole: BlackHoleConfig
}

export interface BlackHoleSliceActions {
  setBlackHoleHorizonRadius: (radius: number) => void
  setBlackHoleSpin: (spin: number) => void
  setBlackHoleDiskTemperature: (temperature: number) => void
  setBlackHoleGravityStrength: (strength: number) => void
  setBlackHoleManifoldIntensity: (intensity: number) => void
  setBlackHoleManifoldThickness: (thickness: number) => void
  setBlackHolePhotonShellWidth: (width: number) => void
  setBlackHoleTimeScale: (scale: number) => void
  setBlackHoleBaseColor: (color: string) => void
  setBlackHolePaletteMode: (mode: BlackHolePaletteMode) => void
  setBlackHoleBloomBoost: (boost: number) => void

  // Lensing
  setBlackHoleDimensionEmphasis: (emphasis: number) => void
  setBlackHoleDistanceFalloff: (falloff: number) => void
  setBlackHoleEpsilonMul: (epsilon: number) => void
  setBlackHoleBendScale: (scale: number) => void
  setBlackHoleBendMaxPerStep: (max: number) => void
  setBlackHoleLensingClamp: (clamp: number) => void
  setBlackHoleRayBendingMode: (mode: BlackHoleRayBendingMode) => void

  // Photon Shell
  setBlackHolePhotonShellRadiusMul: (mul: number) => void
  setBlackHolePhotonShellRadiusDimBias: (bias: number) => void
  setBlackHoleShellGlowStrength: (strength: number) => void
  setBlackHoleShellGlowColor: (color: string) => void
  setBlackHoleShellStepMul: (mul: number) => void
  setBlackHoleShellContrastBoost: (boost: number) => void

  // Manifold
  setBlackHoleManifoldType: (type: BlackHoleManifoldType) => void

  setBlackHoleDiskInnerRadiusMul: (mul: number) => void
  setBlackHoleDiskOuterRadiusMul: (mul: number) => void
  setBlackHoleRadialSoftnessMul: (mul: number) => void
  setBlackHoleThicknessPerDimMax: (max: number) => void
  setBlackHoleHighDimWScale: (scale: number) => void
  setBlackHoleSwirlAmount: (amount: number) => void
  setBlackHoleNoiseScale: (scale: number) => void
  setBlackHoleNoiseAmount: (amount: number) => void
  setBlackHoleMultiIntersectionGain: (gain: number) => void

  // Rendering Quality
  setBlackHoleRaymarchQuality: (quality: BlackHoleQuality) => void
  setBlackHoleMaxSteps: (steps: number) => void
  setBlackHoleStepBase: (step: number) => void
  setBlackHoleStepMin: (step: number) => void
  setBlackHoleStepMax: (step: number) => void
  setBlackHoleStepAdaptG: (adapt: number) => void
  setBlackHoleStepAdaptR: (adapt: number) => void
  setBlackHoleEnableAbsorption: (enable: boolean) => void
  setBlackHoleAbsorption: (absorption: number) => void
  setBlackHoleTransmittanceCutoff: (cutoff: number) => void
  setBlackHoleFarRadius: (radius: number) => void

  // Lighting
  setBlackHoleLightingMode: (mode: BlackHoleLightingMode) => void
  setBlackHoleRoughness: (roughness: number) => void
  setBlackHoleSpecular: (specular: number) => void
  setBlackHoleAmbientTint: (tint: number) => void
  setBlackHoleShadowEnabled: (enabled: boolean) => void
  setBlackHoleShadowSteps: (steps: number) => void
  setBlackHoleShadowDensity: (density: number) => void

  // Temporal
  setBlackHoleTemporalAccumulationEnabled: (enabled: boolean) => void

  // Doppler Effect
  setBlackHoleDopplerEnabled: (enabled: boolean) => void
  setBlackHoleDopplerStrength: (strength: number) => void

  // Cross-section
  setBlackHoleParameterValue: (index: number, value: number) => void
  setBlackHoleParameterValues: (values: number[]) => void
  resetBlackHoleParameters: () => void

  // Motion Blur
  setBlackHoleMotionBlurEnabled: (enabled: boolean) => void
  setBlackHoleMotionBlurStrength: (strength: number) => void
  setBlackHoleMotionBlurSamples: (samples: number) => void
  setBlackHoleMotionBlurRadialFalloff: (falloff: number) => void

  // Deferred Lensing
  setBlackHoleDeferredLensingEnabled: (enabled: boolean) => void
  setBlackHoleDeferredLensingStrength: (strength: number) => void
  setBlackHoleDeferredLensingRadius: (radius: number) => void
  setBlackHoleDeferredLensingChromaticAberration: (amount: number) => void
  setBlackHoleSkyCubemapResolution: (resolution: number) => void

  // Screen-Space Lensing (NOTE: screenSpaceLensingEnabled removed - controlled globally)
  setBlackHoleLensingFalloff: (falloff: number) => void

  // Scene Object Lensing
  setBlackHoleSceneObjectLensingEnabled: (enabled: boolean) => void
  setBlackHoleSceneObjectLensingStrength: (strength: number) => void

  // Animation
  setBlackHoleSwirlAnimationEnabled: (enabled: boolean) => void
  setBlackHoleSwirlAnimationSpeed: (speed: number) => void
  setBlackHolePulseEnabled: (enabled: boolean) => void
  setBlackHolePulseSpeed: (speed: number) => void
  setBlackHolePulseAmount: (amount: number) => void
  setBlackHoleSliceAnimationEnabled: (enabled: boolean) => void
  setBlackHoleSliceSpeed: (speed: number) => void
  setBlackHoleSliceAmplitude: (amplitude: number) => void

  // Keplerian Disk Rotation
  setBlackHoleKeplerianDifferential: (differential: number) => void

  // Config Operations
  setBlackHoleConfig: (config: Partial<BlackHoleConfig>) => void
  initializeBlackHoleForDimension: (dimension: number) => void
  getBlackHoleConfig: () => BlackHoleConfig
}

export type BlackHoleSlice = BlackHoleSliceState & BlackHoleSliceActions

// ============================================================================
// Combined Extended Object Slice
// ============================================================================
export type ExtendedObjectSlice = PolytopeSlice &
  WythoffPolytopeSlice &
  RootSystemSlice &
  CliffordTorusSlice &
  NestedTorusSlice &
  MandelbulbSlice &
  QuaternionJuliaSlice &
  SchroedingerSlice &
  BlackHoleSlice & {
    /** Version counter for polytope state changes (dirty-flag tracking) */
    polytopeVersion: number
    /** Version counter for blackhole state changes (dirty-flag tracking) */
    blackholeVersion: number
    /** Version counter for schroedinger state changes (dirty-flag tracking) */
    schroedingerVersion: number
    /** Version counter for mandelbulb state changes (dirty-flag tracking) */
    mandelbulbVersion: number
    /** Version counter for quaternionJulia state changes (dirty-flag tracking) */
    quaternionJuliaVersion: number
    reset: () => void
  }
