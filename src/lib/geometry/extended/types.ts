/**
 * Type definitions for extended n-dimensional objects
 *
 * Configuration interfaces for:
 * - Schrödinger quantum visualization (volumetric wavefunction rendering)
 *
 * @see src/lib/shaders/constants.ts for shared visual constants
 */

// ============================================================================
// Raymarching Quality System
// ============================================================================

/**
 * Unified raymarching quality presets for all raymarching object types.
 *
 * For Schrödinger, `sampleCount` is kept in sync with `raymarchQuality` for
 * backward compatibility. The mesh reads from `raymarchQuality` directly.
 */
export type RaymarchQuality = 'fast' | 'balanced' | 'quality' | 'ultra'

/**
 * Volumetric raymarch sample counts for Schrödinger.
 * Controls the number of samples taken along each ray through the quantum volume.
 * Higher values produce smoother gradients but reduce framerate.
 *
 * @see SchroedingerMesh for usage with screen coverage adaptation
 */
export const RAYMARCH_QUALITY_TO_SAMPLES: Record<RaymarchQuality, number> = {
  fast: 16, // Noticeable banding, fastest rendering
  balanced: 32, // Good balance for most hardware
  quality: 48, // Smooth gradients, moderate performance cost
  ultra: 64, // Maximum smoothness, may impact framerate
}

// ============================================================================
// Schroedinger Configuration
// ============================================================================

/**
 * Color modes for Schroedinger quantum visualization
 * - density: Color based on probability density |ψ|²
 * - phase: Color based on wavefunction phase arg(ψ)
 * - mixed: Phase for hue, density for brightness
 * - palette: Cosine gradient palette based on density/phase
 * - blackbody: Physical temperature color based on density
 */
export type SchroedingerColorMode = 'density' | 'phase' | 'mixed' | 'palette' | 'blackbody'

/**
 * Named preset identifiers for quantum state configurations
 */
export type SchroedingerPresetName =
  | 'groundState'
  | 'firstExcited'
  | 'quantumBeat'
  | 'groundExcitedBeat'
  | 'highEnergy'
  | 'excitedTriad'
  | 'nearDegenerate'
  | 'isotropic'
  | 'nodalStructure'
  | 'richSuperposition'
  | 'custom'

/**
 * Color palette presets for Schroedinger visualization.
 */
export type SchroedingerPalette =
  | 'monochrome'
  | 'complement'
  | 'triadic'
  | 'analogous'
  | 'shifted'
  | 'nebula'
  | 'sunset'
  | 'aurora'
  | 'ocean'
  | 'fire'
  | 'ice'
  | 'forest'
  | 'plasma'

/**
 * Quality presets for Schroedinger computation
 */
export type SchroedingerQualityPreset = 'draft' | 'standard' | 'high' | 'ultra'

/**
 * Rendering styles for Schroedinger visualization
 * - rayMarching: Volumetric ray marching in shader (3D+ only)
 */
export type SchroedingerRenderStyle = 'rayMarching'

/**
 * Quantum physics mode for Schroedinger visualization
 * - harmonicOscillator: Cartesian-separable harmonic oscillator (default)
 * - hydrogenND: N-dimensional hydrogen orbital (hybrid: Y_lm for first 3D + HO for extra dims)
 */
export type SchroedingerQuantumMode = 'harmonicOscillator' | 'hydrogenND'

/**
 * Wavefunction representation space.
 * - position: ψ(x), rendered in configuration space
 * - momentum: φ(k), rendered in reciprocal space
 */
export type SchroedingerRepresentation = 'position' | 'momentum'

/**
 * UI display units for momentum-space interpretation.
 * Internal evaluation remains in k-space.
 */
export type SchroedingerMomentumDisplayUnits = 'normalized' | 'k' | 'p'

/**
 * Physically grounded nodal set definitions.
 */
export type SchroedingerNodalDefinition = 'psiAbs' | 'realPart' | 'imagPart' | 'complexIntersection'

/**
 * Optional node-family filter for hydrogen/hydrogenND.
 */
export type SchroedingerNodalFamilyFilter = 'all' | 'radial' | 'angular'

/**
 * Nodal rendering mode:
 * - band: volumetric near-zero band (default)
 * - surface: true nodal ray-hit surfaces
 */
export type SchroedingerNodalRenderMode = 'band' | 'surface'

/**
 * Cross-section compositing mode.
 * - overlay: blend slice over the current rendering mode
 * - sliceOnly: render only the slice plane
 */
export type SchroedingerCrossSectionCompositeMode = 'overlay' | 'sliceOnly'

/**
 * Scalar source sampled on the cross-section plane.
 */
export type SchroedingerCrossSectionScalar = 'density' | 'real' | 'imag'

/**
 * Plane orientation mode for cross-section slicing.
 */
export type SchroedingerCrossSectionPlaneMode = 'axisAligned' | 'free'

/**
 * Axis preset for axis-aligned cross-section planes.
 */
export type SchroedingerCrossSectionAxis = 'x' | 'y' | 'z'

/**
 * Probability current visualization style.
 */
export type SchroedingerProbabilityCurrentStyle =
  | 'magnitude'
  | 'arrows'
  | 'surfaceLIC'
  | 'streamlines'

/**
 * Placement mode for probability current overlays.
 */
export type SchroedingerProbabilityCurrentPlacement = 'isosurface' | 'volume'

/**
 * Coloring mode for probability current overlays.
 */
export type SchroedingerProbabilityCurrentColorMode = 'magnitude' | 'direction' | 'circulationSign'

/**
 * Named presets for Hydrogen ND mode (n-dimensional hydrogen orbitals)
 * Format: {orbital}_{dimension}d (e.g., '2pz_4d' = 2pz orbital in 4D)
 */
export type HydrogenNDPresetName =
  | '2pz_4d'
  | '3dz2_4d'
  | '2pz_5d'
  | '3dz2_5d'
  | '2pz_6d'
  | '3dz2_6d'
  | '4fz3_6d'
  | 'custom'

/**
 * Configuration for n-dimensional Schroedinger set generation
 *
 * Supports:
 * - 3D: Schroedinger (spherical coordinates)
 * - 4D-11D: Schroedinger (hyperspherical coordinates)
 */
export interface SchroedingerConfig {
  // === Geometry Settings ===
  /** Overall scale of the rendered object (0.1-2.0) */
  scale: number

  // === Quality Settings ===
  /** Quality preset (affects sample count and resolution) */
  qualityPreset: SchroedingerQualityPreset
  /** Samples per axis in the 3D grid (16-128) */
  resolution: number

  // === Visualization Axes ===
  /** Indices of dimensions to map to X, Y, Z */
  visualizationAxes: [number, number, number]
  /** Fixed values for dimensions not being visualized (slice position) */
  parameterValues: number[]

  // === Navigation ===
  /** Center coordinates in N-dimensional space */
  center: number[]
  /** Extent (zoom level) - half-width of viewing region */
  extent: number

  // === Color Settings ===
  /** Color mode for visualization */
  colorMode: SchroedingerColorMode
  /** Color palette preset */
  palette: SchroedingerPalette
  /** Custom palette colors (used when palette='custom') */
  customPalette: { start: string; mid: string; end: string }
  /** Cosine gradient coefficients (a, b, c, d) for palette mode */
  cosineParams: {
    a: [number, number, number]
    b: [number, number, number]
    c: [number, number, number]
    d: [number, number, number]
  }
  /** Whether to invert color mapping */
  invertColors: boolean

  // === Rendering Style ===
  /** How to render the volume */
  renderStyle: SchroedingerRenderStyle

  // === Quantum Mode Selection ===
  /** Physics mode: harmonic oscillator vs hydrogen ND */
  quantumMode: SchroedingerQuantumMode

  // === Representation Selection ===
  /** Position-space ψ(x) or momentum-space φ(k) */
  representation: SchroedingerRepresentation
  /** How momentum-space axes/labels are interpreted in the UI */
  momentumDisplayUnits: SchroedingerMomentumDisplayUnits
  /** Reciprocal-space zoom factor applied before momentum evaluation */
  momentumScale: number
  /** Effective reduced Planck constant used for p = ħk display conversions */
  momentumHbar: number

  // === Harmonic Oscillator Configuration (when quantumMode === 'harmonicOscillator') ===
  /** Named preset or 'custom' */
  presetName: SchroedingerPresetName
  /** Random seed for preset generation */
  seed: number
  /** Number of superposition terms (1-8) */
  termCount: number
  /** Maximum quantum number per dimension (2-6) */
  maxQuantumNumber: number
  /** Variation in per-dimension frequencies (0-0.5) */
  frequencySpread: number

  // === Hydrogen Configuration (shared with hydrogenND mode) ===
  /** Principal quantum number n (1-7) - determines shell and energy */
  principalQuantumNumber: number
  /** Azimuthal quantum number l (0 to n-1) - determines orbital shape (s,p,d,f) */
  azimuthalQuantumNumber: number
  /** Magnetic quantum number m (-l to +l) - determines orbital orientation */
  magneticQuantumNumber: number
  /** Use real spherical harmonics (px/py/pz) vs complex (m=-1,0,+1) */
  useRealOrbitals: boolean
  /** Bohr radius scale factor (affects orbital size, 0.5-3.0) */
  bohrRadiusScale: number

  // === Hydrogen ND Configuration (when quantumMode === 'hydrogenND') ===
  /** Named hydrogen ND preset */
  hydrogenNDPreset: HydrogenNDPresetName
  /** Quantum numbers for extra dimensions (dims 4-11), array of length 8 */
  extraDimQuantumNumbers: number[]
  /** Frequencies for extra dimensions (dims 4-11), array of length 8 */
  extraDimOmega: number[]
  /** Energy spread factor for extra dimensions (0-0.5) */
  extraDimFrequencySpread: number

  // === Volume Rendering Parameters ===
  /** Time evolution speed multiplier (0.1-2.0) */
  timeScale: number
  /** Coordinate scale into HO basis (0.5-2.0) */
  fieldScale: number
  /** Absorption coefficient for Beer-Lambert (0.1-5.0) */
  densityGain: number
  /** Power-curve exponent for lobe sharpening (1.0=linear, >1=sharper lobes, default 1.8) */
  densityContrast: number
  /** Multiple scattering "powder" effect strength (0.0-2.0) */
  powderScale: number
  /** Samples per ray (32-128) */
  sampleCount: number

  // === Emission Settings ===
  /** HDR emission intensity (0.0-5.0) */
  emissionIntensity: number
  /** Density threshold for emission (0.0-1.0) */
  emissionThreshold: number
  /** Emission color temperature shift (-1.0 to 1.0) */
  emissionColorShift: number
  /** Scattering anisotropy (-0.9 to 0.9) */
  scatteringAnisotropy: number
  /** Surface roughness for specular highlights (0.0-1.0) */
  roughness: number

  // === Fog / Atmosphere ===
  /** Enable scene fog integration */
  fogIntegrationEnabled: boolean
  /** Fog contribution strength (0.0-2.0) */
  fogContribution: number
  /** Internal object-space fog density (0.0-1.0) */
  internalFogDensity: number

  // === Raymarching Quality ===
  /** Unified raymarching quality preset (affects sample count) */
  raymarchQuality: RaymarchQuality

  // === Subsurface Scattering (SSS) ===
  /** Enable subsurface scattering approximation */
  sssEnabled: boolean
  /** SSS intensity (0.0-2.0) */
  sssIntensity: number
  /** SSS tint color (hex string) */
  sssColor: string
  /** Thickness factor for SSS attenuation (0.1-5.0) */
  sssThickness: number
  /** Jitter/Noise amount for SSS (0.0-1.0) */
  sssJitter: number

  // === Edge Detail Erosion ===
  /** Strength of edge noise erosion (0.0-1.0) */
  erosionStrength: number
  /** Scale of erosion noise (0.25-4.0) */
  erosionScale: number
  /** Turbulence/swirl amount for erosion (0.0-1.0) */
  erosionTurbulence: number
  /** Noise type for erosion (0=Worley, 1=Perlin, 2=Hybrid) */
  erosionNoiseType: number
  /** High quality erosion mode (3×3×3 Worley + 4-sample curl vs 2×2×2 + 2-sample) */
  erosionHQ: boolean

  // === Chromatic Dispersion ===
  /** Enable chromatic dispersion */
  dispersionEnabled: boolean
  /** Dispersion strength (0.0-1.0) */
  dispersionStrength: number
  /** Dispersion direction (0=Radial, 1=View-Aligned, 2=Custom) */
  dispersionDirection: number
  /** Dispersion quality/accuracy (0=Gradient Hack, 1=Full Sampling) */
  dispersionQuality: number

  // === Quantum Effects ===
  /** Enable nodal surface highlighting */
  nodalEnabled: boolean
  /** Nodal surface color (hex string) */
  nodalColor: string
  /** Nodal surface strength (0.0-2.0) */
  nodalStrength: number
  /** Node definition in wavefunction space (|psi|, Re, Im, Re∩Im) */
  nodalDefinition: SchroedingerNodalDefinition
  /** Numerical tolerance epsilon used by physical nodal classification */
  nodalTolerance: number
  /** Optional hydrogen node-family filter (all/radial/angular) */
  nodalFamilyFilter: SchroedingerNodalFamilyFilter
  /** Nodal rendering style (band/surface) */
  nodalRenderMode: SchroedingerNodalRenderMode
  /** Enable sign/lobe-aware nodal coloring */
  nodalLobeColoringEnabled: boolean
  /** Color for Re(psi)=0 nodal visualization */
  nodalColorReal: string
  /** Color for Im(psi)=0 nodal visualization */
  nodalColorImag: string
  /** Color for positive lobe/phase sign */
  nodalColorPositive: string
  /** Color for negative lobe/phase sign */
  nodalColorNegative: string
  /** Enable energy level coloring */
  energyColorEnabled: boolean
  /** Enable physically-derived uncertainty boundary emphasis */
  uncertaintyBoundaryEnabled: boolean
  /** Visual strength of uncertainty boundary emphasis (0.0-1.0) */
  uncertaintyBoundaryStrength: number
  /** Target cumulative probability mass for confidence boundary (0.5-0.99) */
  uncertaintyConfidenceMass: number
  /** Half-width of boundary band in log-density space (0.05-1.0) */
  uncertaintyBoundaryWidth: number
  /** Enable phase-dependent materiality (plasma vs smoke based on wavefunction phase) */
  phaseMaterialityEnabled: boolean
  /** Blend strength for phase materiality effect (0.0-1.0) */
  phaseMaterialityStrength: number
  /** Enable interference fringing (density modulation by phase bands) */
  interferenceEnabled: boolean
  /** Interference fringe amplitude (0.0-1.0) */
  interferenceAmp: number
  /** Interference fringe frequency / number of rings (1.0-50.0) */
  interferenceFreq: number
  /** Interference fringe animation speed (0.0-10.0) */
  interferenceSpeed: number

  // === Physical Probability Current (j-field) ===
  /** Enable physical probability-current visualization (j = Im(conj(psi)∇psi)) */
  probabilityCurrentEnabled: boolean
  /** Current-field visualization style */
  probabilityCurrentStyle: SchroedingerProbabilityCurrentStyle
  /** Overlay placement for current visualization */
  probabilityCurrentPlacement: SchroedingerProbabilityCurrentPlacement
  /** Color mapping mode for current overlays */
  probabilityCurrentColorMode: SchroedingerProbabilityCurrentColorMode
  /** Visual scale multiplier for current magnitude */
  probabilityCurrentScale: number
  /** Animation/advection speed for current patterns */
  probabilityCurrentSpeed: number
  /** Minimum density required to show current overlays */
  probabilityCurrentDensityThreshold: number
  /** Minimum |j| required to show current overlays */
  probabilityCurrentMagnitudeThreshold: number
  /** Pattern/glyph density for arrows/LIC/streamlines */
  probabilityCurrentLineDensity: number
  /** Integration/sample step size for LIC/streamline styles */
  probabilityCurrentStepSize: number
  /** Integration/sample step count for LIC/streamline styles */
  probabilityCurrentSteps: number
  /** Overlay opacity for current visualization */
  probabilityCurrentOpacity: number

  // === Probability Current Flow ===
  /** Enable legacy density-modulated flow-noise animation */
  probabilityFlowEnabled: boolean
  /** Flow animation speed (0.1-5.0) */
  probabilityFlowSpeed: number
  /** Flow modulation strength (0.0-1.0) */
  probabilityFlowStrength: number

  // === Isosurface Mode (Optional) ===
  /** Enable isosurface rendering instead of volumetric */
  isoEnabled: boolean
  /** Log-density threshold for isosurface (-6 to 0) */
  isoThreshold: number

  // === 2D Cross-Section Slice ===
  /** Enable 2D plane slice visualization of the current 3D projection */
  crossSectionEnabled: boolean
  /** Whether to overlay on volume/surface or render slice only */
  crossSectionCompositeMode: SchroedingerCrossSectionCompositeMode
  /** Scalar sampled on the plane: |psi|^2, Re(psi), or Im(psi) */
  crossSectionScalar: SchroedingerCrossSectionScalar
  /** Plane orientation mode (axis preset vs free normal vector) */
  crossSectionPlaneMode: SchroedingerCrossSectionPlaneMode
  /** Axis preset when crossSectionPlaneMode='axisAligned' */
  crossSectionAxis: SchroedingerCrossSectionAxis
  /** Unit normal vector for free-plane mode */
  crossSectionPlaneNormal: [number, number, number]
  /** Offset along plane normal in normalized object radius units (-1 to 1) */
  crossSectionPlaneOffset: number
  /** Slice alpha contribution (0.0-1.0) */
  crossSectionOpacity: number
  /** Slab half-thickness in normalized radius units (0.0-0.2) */
  crossSectionThickness: number
  /** Visual tint color for the slice plane surface */
  crossSectionPlaneColor: string
  /** Auto-scale scalar window based on scalar type */
  crossSectionAutoWindow: boolean
  /** Manual window minimum when auto-window is disabled */
  crossSectionWindowMin: number
  /** Manual window maximum when auto-window is disabled */
  crossSectionWindowMax: number

  // === Slice Animation (4D+ only) ===
  /** Enable slice animation through extra dimensions */
  sliceAnimationEnabled: boolean
  /** Slice animation speed (0.01-0.1) */
  sliceSpeed: number
  /** Slice animation amplitude (0.1-1.0) */
  sliceAmplitude: number

  // === Phase Animation (Hydrogen ND only) ===
  /** Enable quantum phase evolution animation for Hydrogen ND mode */
  phaseAnimationEnabled: boolean
}

/**
 * Quality preset configurations for Schroedinger
 */
export const SCHROEDINGER_QUALITY_PRESETS: Record<
  SchroedingerQualityPreset,
  { maxIterations: number; resolution: number }
> = {
  draft: { maxIterations: 30, resolution: 24 },
  standard: { maxIterations: 80, resolution: 32 },
  high: { maxIterations: 200, resolution: 64 },
  ultra: { maxIterations: 500, resolution: 96 },
}

/**
 * Default Schroedinger quantum visualization configuration
 */
export const DEFAULT_SCHROEDINGER_CONFIG: SchroedingerConfig = {
  // Geometry
  scale: 0.6,

  // Quality
  qualityPreset: 'standard',
  resolution: 32,

  // Visualization
  visualizationAxes: [0, 1, 2],
  parameterValues: [],
  center: [],
  extent: 2.0,

  // Color
  colorMode: 'mixed',
  palette: 'complement',
  customPalette: { start: '#0000ff', mid: '#ffffff', end: '#ff8000' },
  cosineParams: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67],
  },
  invertColors: false,

  // Rendering
  renderStyle: 'rayMarching',

  // Quantum mode
  quantumMode: 'harmonicOscillator',

  // Representation
  representation: 'position',
  momentumDisplayUnits: 'normalized',
  momentumScale: 1.0,
  momentumHbar: 1.0,

  // Harmonic oscillator state
  presetName: 'custom',
  seed: 13,
  termCount: 1,
  maxQuantumNumber: 6,
  frequencySpread: 0.01,

  // Hydrogen state
  principalQuantumNumber: 2,
  azimuthalQuantumNumber: 1,
  magneticQuantumNumber: 0,
  useRealOrbitals: true,
  bohrRadiusScale: 1.0,

  // Hydrogen ND state
  hydrogenNDPreset: '2pz_4d',
  extraDimQuantumNumbers: [0, 0, 0, 0, 0, 0, 0, 0], // 8 values for dims 4-11
  extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  extraDimFrequencySpread: 0.0,

  // Volume rendering
  timeScale: 0.8,
  fieldScale: 1.0,
  densityGain: 2.0,
  densityContrast: 1.8,
  powderScale: 1.0,
  sampleCount: 32, // Derived from raymarchQuality: 'balanced'

  // Emission
  emissionIntensity: 0.5,
  emissionThreshold: 0.3,
  emissionColorShift: 0.0,
  scatteringAnisotropy: 0.0,
  roughness: 0.3,

  // Fog
  fogIntegrationEnabled: true,
  fogContribution: 1.0,
  internalFogDensity: 0.0,

  // Raymarching Quality
  raymarchQuality: 'balanced',

  // SSS
  sssEnabled: false,
  sssIntensity: 1.0,
  sssColor: '#ff8844', // Warm orange default
  sssThickness: 1.0,
  sssJitter: 0.2,

  // Erosion
  erosionStrength: 0.0,
  erosionScale: 1.0,
  erosionTurbulence: 0.5,
  erosionNoiseType: 0,
  erosionHQ: false,

  // Dispersion
  dispersionEnabled: false,
  dispersionStrength: 0.2,
  dispersionDirection: 0,
  dispersionQuality: 0,

  // Quantum Effects
  nodalEnabled: false,
  nodalColor: '#00ffff', // Cyan
  nodalStrength: 1.0,
  nodalDefinition: 'psiAbs',
  nodalTolerance: 0.02,
  nodalFamilyFilter: 'all',
  nodalRenderMode: 'band',
  nodalLobeColoringEnabled: false,
  nodalColorReal: '#00ffff',
  nodalColorImag: '#ff66ff',
  nodalColorPositive: '#22c55e',
  nodalColorNegative: '#ef4444',
  energyColorEnabled: false,
  uncertaintyBoundaryEnabled: false,
  uncertaintyBoundaryStrength: 0.5,
  uncertaintyConfidenceMass: 0.68,
  uncertaintyBoundaryWidth: 0.3,
  phaseMaterialityEnabled: false,
  phaseMaterialityStrength: 1.0,
  interferenceEnabled: false,
  interferenceAmp: 0.5,
  interferenceFreq: 10.0,
  interferenceSpeed: 1.0,

  // Physical Probability Current (j-field)
  probabilityCurrentEnabled: false,
  probabilityCurrentStyle: 'magnitude',
  probabilityCurrentPlacement: 'isosurface',
  probabilityCurrentColorMode: 'magnitude',
  probabilityCurrentScale: 1.0,
  probabilityCurrentSpeed: 1.0,
  probabilityCurrentDensityThreshold: 0.01,
  probabilityCurrentMagnitudeThreshold: 0.0,
  probabilityCurrentLineDensity: 8.0,
  probabilityCurrentStepSize: 0.04,
  probabilityCurrentSteps: 20,
  probabilityCurrentOpacity: 0.7,

  // Probability Current Flow
  probabilityFlowEnabled: false,
  probabilityFlowSpeed: 1.0,
  probabilityFlowStrength: 0.3,

  // Isosurface (disabled by default)
  isoEnabled: false,
  isoThreshold: -0.76,

  // 2D Cross-Section Slice
  crossSectionEnabled: false,
  crossSectionCompositeMode: 'overlay',
  crossSectionScalar: 'density',
  crossSectionPlaneMode: 'axisAligned',
  crossSectionAxis: 'z',
  crossSectionPlaneNormal: [0, 0, 1],
  crossSectionPlaneOffset: 0.0,
  crossSectionOpacity: 0.75,
  crossSectionThickness: 0.02,
  crossSectionPlaneColor: '#66ccff',
  crossSectionAutoWindow: true,
  crossSectionWindowMin: 0.0,
  crossSectionWindowMax: 1.0,

  // Slice Animation
  sliceAnimationEnabled: false,
  sliceSpeed: 0.02,
  sliceAmplitude: 0.3,

  // Phase Animation (Hydrogen ND only)
  phaseAnimationEnabled: false,
}

// ============================================================================
// Combined Object Parameters
// ============================================================================

/**
 * Combined parameters for extended object types.
 * Used by the unified geometry generator for consistent configuration.
 */
export interface ExtendedObjectParams {
  /** Configuration for Schroedinger quantum visualization */
  schroedinger: SchroedingerConfig
}

/**
 * Default parameters for all object types
 */
export const DEFAULT_EXTENDED_OBJECT_PARAMS: ExtendedObjectParams = {
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
}
