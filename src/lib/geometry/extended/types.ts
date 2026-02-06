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
  | 'highEnergy'
  | 'simpleCoherence'
  | 'symmetry'
  | 'complexOrbital'
  | 'diffuseCloud'
  | 'stationary'
  | 'denseState'
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
  /** Multiple scattering "powder" effect strength (0.0-2.0) */
  powderScale: number
  /** Samples per ray (32-128) */
  sampleCount: number
  /** Use precomputed density grid acceleration (volumetric mode only) */
  useDensityGrid: boolean

  // === Emission Settings ===
  /** HDR emission intensity (0.0-5.0) */
  emissionIntensity: number
  /** Density threshold for emission (0.0-1.0) */
  emissionThreshold: number
  /** Emission color temperature shift (-1.0 to 1.0) */
  emissionColorShift: number
  /** Enable phase-based emission pulsing */
  emissionPulsing: boolean
  /** Fresnel rim falloff exponent (1.0-10.0) */
  rimExponent: number
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

  // === Curl Noise Turbulence ===
  /** Enable curl noise flow animation */
  curlEnabled: boolean
  /** Strength of flow distortion (0.0-1.0) */
  curlStrength: number
  /** Scale of flow patterns (0.25-4.0) */
  curlScale: number
  /** Speed of flow animation (0.1-5.0) */
  curlSpeed: number
  /** Flow direction bias (0=None, 1=Up, 2=Out, 3=In) */
  curlBias: number

  // === Chromatic Dispersion ===
  /** Enable chromatic dispersion */
  dispersionEnabled: boolean
  /** Dispersion strength (0.0-1.0) */
  dispersionStrength: number
  /** Dispersion direction (0=Radial, 1=View-Aligned, 2=Custom) */
  dispersionDirection: number
  /** Dispersion quality/accuracy (0=Gradient Hack, 1=Full Sampling) */
  dispersionQuality: number

  // === Volumetric Self-Shadowing ===
  /** Enable volumetric self-shadowing */
  shadowsEnabled: boolean
  /** Shadow strength/darkness (0.0-2.0) */
  shadowStrength: number
  /** Shadow quality steps (1-8) */
  shadowSteps: number

  // === Volumetric Ambient Occlusion (AO) ===
  /** Enable volumetric ambient occlusion */
  aoEnabled: boolean
  /** AO strength/darkness (0.0-2.0) */
  aoStrength: number
  /** AO quality steps/cones (3-8) */
  aoQuality: number
  /** AO radius (0.1-2.0) */
  aoRadius: number
  /** AO tint color (hex string) */
  aoColor: string

  // === Quantum Effects ===
  /** Enable nodal surface highlighting */
  nodalEnabled: boolean
  /** Nodal surface color (hex string) */
  nodalColor: string
  /** Nodal surface strength (0.0-2.0) */
  nodalStrength: number
  /** Enable energy level coloring */
  energyColorEnabled: boolean
  /** Enable uncertainty shimmer */
  shimmerEnabled: boolean
  /** Shimmer strength (0.0-1.0) */
  shimmerStrength: number

  // === Isosurface Mode (Optional) ===
  /** Enable isosurface rendering instead of volumetric */
  isoEnabled: boolean
  /** Log-density threshold for isosurface (-6 to 0) */
  isoThreshold: number

  // === Slice Animation (4D+ only) ===
  /** Enable slice animation through extra dimensions */
  sliceAnimationEnabled: boolean
  /** Slice animation speed (0.01-0.1) */
  sliceSpeed: number
  /** Slice animation amplitude (0.1-1.0) */
  sliceAmplitude: number

  // === Spread Animation ===
  /** Enable frequency spread animation (animates frequencySpread parameter) */
  spreadAnimationEnabled: boolean
  /** Spread animation speed (0.1-2.0) */
  spreadAnimationSpeed: number

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

  // Harmonic oscillator state
  presetName: 'custom',
  seed: 42,
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
  powderScale: 1.0,
  sampleCount: 32, // Derived from raymarchQuality: 'balanced'
  useDensityGrid: false,

  // Emission
  emissionIntensity: 0.5,
  emissionThreshold: 0.3,
  emissionColorShift: 0.0,
  emissionPulsing: false,
  rimExponent: 3.0,
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

  // Curl Noise
  curlEnabled: false,
  curlStrength: 0.3,
  curlScale: 1.0,
  curlSpeed: 1.0,
  curlBias: 0,

  // Dispersion
  dispersionEnabled: false,
  dispersionStrength: 0.2,
  dispersionDirection: 0,
  dispersionQuality: 0,

  // Shadows
  shadowsEnabled: false,
  shadowStrength: 1.0,
  shadowSteps: 4,

  // AO
  aoEnabled: false,
  aoStrength: 1.0,
  aoQuality: 4,
  aoRadius: 0.5,
  aoColor: '#000000',

  // Quantum Effects
  nodalEnabled: false,
  nodalColor: '#00ffff', // Cyan
  nodalStrength: 1.0,
  energyColorEnabled: false,
  shimmerEnabled: false,
  shimmerStrength: 0.5,

  // Isosurface (disabled by default)
  isoEnabled: false,
  isoThreshold: -0.76,

  // Slice Animation
  sliceAnimationEnabled: false,
  sliceSpeed: 0.02,
  sliceAmplitude: 0.3,

  // Spread Animation
  spreadAnimationEnabled: false,
  spreadAnimationSpeed: 0.5,

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
