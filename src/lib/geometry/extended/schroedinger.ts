/**
 * Schrödinger configuration type definitions.
 *
 * The main SchroedingerConfig interface and all its associated types:
 * representation, nodal, cross-section, probability current, Wigner,
 * second quantization, hydrogen ND presets, quality presets, and defaults.
 */

import type { OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

import type { BecConfig } from './bec'
import { DEFAULT_BEC_CONFIG } from './bec'
import type {
  RaymarchQuality,
  SchroedingerColorMode,
  SchroedingerPalette,
  SchroedingerPresetName,
  SchroedingerQualityPreset,
  SchroedingerQuantumMode,
  SchroedingerRenderStyle,
} from './common'
import type { DiracConfig } from './dirac'
import { DEFAULT_DIRAC_CONFIG } from './dirac'
import type { FreeScalarConfig } from './freeScalar'
import { DEFAULT_FREE_SCALAR_CONFIG } from './freeScalar'
import type { QuantumWalkConfig } from './quantumWalk'
import { DEFAULT_QUANTUM_WALK_CONFIG } from './quantumWalk'
import type { TdseConfig } from './tdse'
import { DEFAULT_TDSE_CONFIG } from './tdse'

// ============================================================================
// Schroedinger-Specific Types
// ============================================================================

/**
 * Second-quantization educational layer interpretation mode.
 * - fock: Number state |n> (default)
 * - coherent: Coherent state |alpha> = displacement operator on vacuum
 * - squeezed: Squeezed vacuum state S(r,theta)|0>
 */
export type SecondQuantizationMode = 'fock' | 'coherent' | 'squeezed'

/**
 * Wavefunction representation space.
 * - position: ψ(x), rendered in configuration space
 * - momentum: φ(k), rendered in reciprocal space
 */
export type SchroedingerRepresentation = 'position' | 'momentum' | 'wigner'

/**
 * UI display units for momentum-space interpretation.
 * Internal evaluation remains in k-space.
 */
export type SchroedingerMomentumDisplayUnits = 'k' | 'p'

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
  | '1s_2d'
  | '2s_2d'
  | '2p_2d'
  | '1s_3d'
  | '2s_3d'
  | '2pz_3d'
  | '3dz2_3d'
  | '3dxy_3d'
  | '4fz3_3d'
  | '2pz_4d'
  | '3dz2_4d'
  | '2pz_5d'
  | '3dz2_5d'
  | '2pz_6d'
  | '3dz2_6d'
  | '4fz3_6d'
  | 'custom'

// ============================================================================
// SchroedingerConfig
// ============================================================================

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

  // === Hydrogen ND Coupled Configuration (when quantumMode === 'hydrogenNDCoupled') ===
  /**
   * Angular momentum chain for D-dimensional hyperspherical harmonics.
   * Length D-2 (indices 0..D-3): l_1 >= l_2 >= ... >= l_{D-2} >= 0.
   * l_1 maps to azimuthalQuantumNumber, m maps to magneticQuantumNumber.
   * Intermediate values l_2..l_{D-3} are stored here (indices 1..D-3).
   * Maximum length 8 (for D=11: 9 angles, chain length 9, but l_1 and |m| stored separately).
   */
  angularChain: number[]

  // === Volume Rendering Parameters ===
  /** Time evolution speed multiplier (0.1-2.0) */
  timeScale: number
  /** Coordinate scale into HO basis (0.5-2.0) */
  fieldScale: number
  /** Absorption coefficient for Beer-Lambert (0.1-5.0) */
  densityGain: number
  /** Power-curve exponent for lobe sharpening (1.0=linear, >1=sharper lobes, default 1.8) */
  densityContrast: number
  /** Maximum auto-scale amplification factor (1-100). Prevents negligible residuals from being amplified to full brightness. */
  autoScaleMaxGain: number
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

  // === PML Absorbing Boundary (shared across all dynamic modes) ===
  /** Enable PML absorbing boundary layer */
  absorberEnabled: boolean
  /** PML layer width as fraction of grid (0.05-0.50) */
  absorberWidth: number
  /** Per-step damping at outer edge — exp(-σ_max·dt) = pmlTargetReflection */
  pmlTargetReflection: number

  // === Raymarching Quality ===
  /** Unified raymarching quality preset (affects sample count) */
  raymarchQuality: RaymarchQuality

  // SSS state lives on the appearance store (`sssEnabled`, `sssIntensity`,
  // `sssColor`, `sssThickness`, `sssJitter`). The renderer reads from there
  // exclusively — no schroedinger-scoped duplicates.

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

  // === Phase Shimmer ===
  /** Enable legacy density-modulated flow-noise animation */
  phaseShimmerEnabled: boolean
  /** Flow animation speed (0.1-5.0) */
  phaseShimmerSpeed: number
  /** Flow modulation strength (0.0-1.0) */
  phaseShimmerStrength: number

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

  // === Radial Probability Overlay (hydrogen only) ===
  /** Show P(r) = 4πr²|R_nl(r)|² as semi-transparent spherical shell overlay */
  radialProbabilityEnabled: boolean
  /** Overlay opacity [0,1] */
  radialProbabilityOpacity: number
  /** Shell color (CSS hex) */
  radialProbabilityColor: string

  // === Wigner Phase-Space Visualization ===
  /** Which dimension index to display in Wigner phase space (0-based) */
  wignerDimensionIndex: number
  /** Auto-compute axis ranges from physics (bounding radius, omega) */
  wignerAutoRange: boolean
  /** Manual x-axis range (position units) when autoRange is off */
  wignerXRange: number
  /** Manual p-axis range (momentum units) when autoRange is off */
  wignerPRange: number
  /** Include cross terms in HO superposition Wigner function */
  wignerCrossTermsEnabled: boolean
  /** Number of quadrature points for hydrogen numerical Wigner transform */
  wignerQuadPoints: number
  /** Resolution of the pre-computed Wigner cache texture (128-1024) */
  wignerCacheResolution: number

  // === Second Quantization Educational Layer ===
  /** Master toggle for second-quantization interpretation overlay */
  sqLayerEnabled: boolean
  /** Interpretation mode: Fock, coherent, or squeezed */
  sqLayerMode: SecondQuantizationMode
  /** Which HO dimension mode index to inspect (0-based) */
  sqLayerSelectedModeIndex: number
  /** Fock-state quantum number n for educational number-state interpretation */
  sqLayerFockQuantumNumber: number
  /** Show occupation number table */
  sqLayerShowOccupation: boolean
  /** Show uncertainty metrics card */
  sqLayerShowUncertainty: boolean
  /** Re(alpha) for coherent state preset */
  sqLayerCoherentAlphaRe: number
  /** Im(alpha) for coherent state preset */
  sqLayerCoherentAlphaIm: number
  /** Squeeze parameter r */
  sqLayerSqueezeR: number
  /** Squeeze angle theta */
  sqLayerSqueezeTheta: number

  // === Free Scalar Field Configuration (when quantumMode === 'freeScalarField') ===
  /** Klein-Gordon lattice field configuration */
  freeScalar: FreeScalarConfig

  // === TDSE Configuration (when quantumMode === 'tdseDynamics') ===
  /** Time-dependent Schroedinger equation solver configuration */
  tdse: TdseConfig

  // === BEC Configuration (when quantumMode === 'becDynamics') ===
  /** Gross-Pitaevskii condensate configuration */
  bec: BecConfig

  // === Dirac Equation Configuration (when quantumMode === 'diracEquation') ===
  /** Relativistic Dirac equation solver configuration */
  dirac: DiracConfig

  // === Quantum Walk Configuration (when quantumMode === 'quantumWalk') ===
  /** Discrete-time quantum walk on N-D lattice */
  quantumWalk: QuantumWalkConfig

  // === N-D Basis Vectors (for free scalar field and TDSE) ===
  /** Basis vector for X axis in N-dimensional space */
  basisX: Float32Array
  /** Basis vector for Y axis in N-dimensional space */
  basisY: Float32Array
  /** Basis vector for Z axis in N-dimensional space */
  basisZ: Float32Array
  /** Origin point in N-dimensional space */
  origin: Float32Array

  // === Open Quantum System Configuration ===
  /** Density matrix + Lindblad decoherence configuration */
  openQuantum: OpenQuantumConfig
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
  momentumDisplayUnits: 'k',
  momentumScale: 1.0,
  momentumHbar: 1.0,

  // Harmonic oscillator state (matches 'groundState' preset)
  presetName: 'groundState',
  seed: 13,
  termCount: 1,
  maxQuantumNumber: 1,
  frequencySpread: 0.01,

  // Hydrogen state
  principalQuantumNumber: 2,
  azimuthalQuantumNumber: 1,
  magneticQuantumNumber: 0,
  useRealOrbitals: true,
  bohrRadiusScale: 1.0,

  // Hydrogen ND state
  hydrogenNDPreset: '2pz_3d',
  extraDimQuantumNumbers: [0, 0, 0, 0, 0, 0, 0, 0], // 8 values for dims 4-11
  extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  extraDimFrequencySpread: 0.0,

  // Hydrogen ND Coupled state — angular chain l_2..l_{D-3} (l_1 = azimuthalL, m = magneticM)
  angularChain: [0, 0, 0, 0, 0, 0, 0, 0],

  // Volume rendering
  timeScale: 0.8,
  fieldScale: 1.0,
  densityGain: 2.0,
  densityContrast: 1.8,
  autoScaleMaxGain: 20,
  powderScale: 1.0,
  sampleCount: 32, // Derived from raymarchQuality: 'balanced'

  // Emission
  emissionIntensity: 0.5,
  emissionThreshold: 0.3,
  emissionColorShift: 0.0,
  scatteringAnisotropy: 0.0,
  roughness: 0.3,

  // PML Absorbing Boundary
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,

  // Raymarching Quality
  raymarchQuality: 'balanced',

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
  uncertaintyBoundaryEnabled: false,
  uncertaintyBoundaryStrength: 0.5,
  uncertaintyConfidenceMass: 0.68,
  uncertaintyBoundaryWidth: 0.6,
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

  // Phase Shimmer
  phaseShimmerEnabled: false,
  phaseShimmerSpeed: 1.0,
  phaseShimmerStrength: 0.3,

  // Isosurface (disabled by default)
  isoEnabled: false,
  isoThreshold: -3.0,

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

  // Radial Probability Overlay (hydrogen only)
  radialProbabilityEnabled: false,
  radialProbabilityOpacity: 0.6,
  radialProbabilityColor: '#44aaff',

  // Wigner Phase-Space Visualization
  wignerDimensionIndex: 0,
  wignerAutoRange: true,
  wignerXRange: 6.0,
  wignerPRange: 6.0,
  wignerCrossTermsEnabled: true,
  wignerQuadPoints: 32,
  wignerCacheResolution: 256,

  // Second Quantization Educational Layer
  sqLayerEnabled: false,
  sqLayerMode: 'fock' as SecondQuantizationMode,
  sqLayerSelectedModeIndex: 0,
  sqLayerFockQuantumNumber: 0,
  sqLayerShowOccupation: true,
  sqLayerShowUncertainty: true,
  sqLayerCoherentAlphaRe: 1.0,
  sqLayerCoherentAlphaIm: 0.0,
  sqLayerSqueezeR: 0.5,
  sqLayerSqueezeTheta: 0.0,

  // Free Scalar Field
  freeScalar: DEFAULT_FREE_SCALAR_CONFIG,

  // TDSE
  tdse: DEFAULT_TDSE_CONFIG,

  // BEC
  bec: DEFAULT_BEC_CONFIG,

  // Dirac
  dirac: DEFAULT_DIRAC_CONFIG,

  // Quantum Walk
  quantumWalk: DEFAULT_QUANTUM_WALK_CONFIG,

  // N-D Basis Vectors
  basisX: new Float32Array([1, 0, 0]),
  basisY: new Float32Array([0, 1, 0]),
  basisZ: new Float32Array([0, 0, 1]),
  origin: new Float32Array([0, 0, 0]),

  // Open Quantum System
  openQuantum: DEFAULT_OPEN_QUANTUM_CONFIG,
}

/**
 * Create a fresh copy of the default Schroedinger config.
 *
 * Clones mutable typed arrays (basisX/Y/Z, origin) to prevent shared
 * references between store instances and the global default constant.
 * Use this instead of `{ ...DEFAULT_SCHROEDINGER_CONFIG }` in store
 * factories and reset actions.
 */
export function createDefaultSchroedingerConfig(): SchroedingerConfig {
  return {
    ...DEFAULT_SCHROEDINGER_CONFIG,
    basisX: Float32Array.from(DEFAULT_SCHROEDINGER_CONFIG.basisX),
    basisY: Float32Array.from(DEFAULT_SCHROEDINGER_CONFIG.basisY),
    basisZ: Float32Array.from(DEFAULT_SCHROEDINGER_CONFIG.basisZ),
    origin: Float32Array.from(DEFAULT_SCHROEDINGER_CONFIG.origin),
  }
}
