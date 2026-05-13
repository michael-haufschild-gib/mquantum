/**
 * Schrödinger configuration type definitions.
 *
 * The main SchroedingerConfig interface and all its associated types:
 * representation, nodal, cross-section, probability current, Wigner,
 * second quantization, hydrogen ND presets, quality presets, and defaults.
 */

import type { OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

import type { AntiDeSitterConfig } from './antiDeSitter'
import { DEFAULT_ANTI_DE_SITTER_CONFIG } from './antiDeSitter'
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
import type { PmlAbsorberConfig } from './crossMode'
import type { DiracConfig } from './dirac'
import { DEFAULT_DIRAC_CONFIG } from './dirac'
import type { FreeScalarConfig } from './freeScalar'
import { DEFAULT_FREE_SCALAR_CONFIG } from './freeScalar'
import type { QuantumWalkConfig } from './quantumWalk'
import { DEFAULT_QUANTUM_WALK_CONFIG } from './quantumWalk'
import type { TdseConfig } from './tdse'
import { DEFAULT_TDSE_CONFIG } from './tdse'
import type { WheelerDeWittConfig } from './wheelerDeWitt'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from './wheelerDeWitt'

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
// SchroedingerConfig Sub-Interfaces
// ============================================================================

/** Nodal surface highlighting configuration. */
export interface SchroedingerNodalConfig {
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
}

/** Physical probability-current (j-field) overlay configuration. */
export interface SchroedingerProbabilityCurrentConfig {
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
}

/** 2D cross-section slice visualization configuration. */
export interface SchroedingerCrossSectionConfig {
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
}

/** Wigner phase-space visualization configuration. */
export interface SchroedingerWignerConfig {
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
}

/** Volume rendering parameters (density, sampling, scaling). */
export interface SchroedingerVolumeConfig {
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
}

/** HDR emission and scattering configuration. */
export interface SchroedingerEmissionConfig {
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
}

/** Quantum visual-effect overlays (uncertainty, phase materiality, interference, lensing, topology). */
export interface SchroedingerQuantumEffectsConfig {
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
  /** Enable probability-stress optical metric deformation */
  quantumBackreactionLensingEnabled: boolean
  /** Optical metric perturbation strength (0.0-3.0) */
  quantumBackreactionLensingStrength: number
  /** Caustic emission multiplier gain after coordinate deformation (0.0-2.0) */
  quantumBackreactionCausticGain: number
  /** Softening radius for probability-stress lensing (0.05-2.0) */
  quantumBackreactionSoftening: number
  /** Enable bilocal Einstein-Rosen bridge topology between mirrored endpoints */
  bilocalERBridgeEnabled: boolean
  /** Coordinate warp strength for bilocal bridge sampling (0.0-2.0) */
  bilocalERBridgeStrength: number
  /** Bridge throat radius controlling transverse softening (0.05-2.0) */
  bilocalERBridgeThroatRadius: number
  /** Phase-coherence lock between local and mirrored endpoint (0.0-1.0) */
  bilocalERBridgePhaseLock: number
  /** Enable entropy-gradient time-shear filaments in the raymarch sampler */
  entropicTimeShearEnabled: boolean
  /** Time-shear coordinate deformation strength (0.0-2.0) */
  entropicTimeShearStrength: number
  /** Spatial coherence scale of entropy-shear filaments (0.1-4.0) */
  entropicTimeShearFilamentScale: number
  /** Bias toward monotone entropy gain instead of reversible signed shear (0.0-1.0) */
  entropicTimeShearIrreversibility: number
  /** Enable local heat-kernel spectral-dimension collapse in the raymarch sampler */
  spectralDimensionFlowEnabled: boolean
  /** Strength of spectral-dimension coordinate compression (0.0-2.0) */
  spectralDimensionFlowStrength: number
  /** Short-distance ultraviolet spectral dimension target (1.2-3.5) */
  spectralDimensionFlowUvDimension: number
  /** Diffusion scale for gradient-curvature heat-kernel proxy (0.05-3.0) */
  spectralDimensionFlowDiffusionScale: number
  /** Enable Coleman-De Luccia false-vacuum bubble wall lensing */
  vacuumBubbleLensEnabled: boolean
  /** Bubble wall coordinate refraction and emission strength (0.0-2.0) */
  vacuumBubbleLensStrength: number
  /** Bubble wall radius as a fraction of bounding radius (0.05-1.5) */
  vacuumBubbleWallRadius: number
  /** Bubble wall thickness as a fraction of bounding radius (0.02-0.5) */
  vacuumBubbleWallThickness: number
  /** False-vacuum wall tension term in the CDL action proxy (0.0-3.0) */
  vacuumBubbleTension: number
  /** True-vacuum volume bias term in the CDL action proxy (0.0-3.0) */
  vacuumBubbleBias: number
  /** Enable Born-null weave nodal aperture lensing in analytic volumetric raymarching */
  bornNullWeaveEnabled: boolean
  /** Coordinate deformation/emission strength for null-aperture membranes (0.0-2.0) */
  bornNullWeaveStrength: number
  /** Born-density node width as fraction of peak density (0.0001-0.2) */
  bornNullWeaveNodeWidth: number
  /** Current-over-density circulation sensitivity (0.0-8.0) */
  bornNullWeaveCirculation: number
}

/** Second-quantization educational layer configuration. */
export interface SchroedingerSecondQuantConfig {
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
}

/** Wavefunction representation space and momentum-space display options. */
export interface SchroedingerRepresentationConfig {
  /** Position-space ψ(x) or momentum-space φ(k) */
  representation: SchroedingerRepresentation
  /** How momentum-space axes/labels are interpreted in the UI */
  momentumDisplayUnits: SchroedingerMomentumDisplayUnits
  /** Reciprocal-space zoom factor applied before momentum evaluation */
  momentumScale: number
  /** Effective reduced Planck constant used for p = ħk display conversions */
  momentumHbar: number
}

/** Harmonic oscillator superposition configuration (when quantumMode === 'harmonicOscillator'). */
export interface SchroedingerHOConfig {
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
}

/** Hydrogen orbital configuration (shared across hydrogen, hydrogenND, and hydrogenND coupled modes). */
export interface SchroedingerHydrogenConfig {
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
  /** Named hydrogen ND preset */
  hydrogenNDPreset: HydrogenNDPresetName
  /** Quantum numbers for extra dimensions (dims 4-11), array of length 8 */
  extraDimQuantumNumbers: number[]
  /** Frequencies for extra dimensions (dims 4-11), array of length 8 */
  extraDimOmega: number[]
  /** Energy spread factor for extra dimensions (0-0.5) */
  extraDimFrequencySpread: number
  /**
   * Angular momentum chain for D-dimensional hyperspherical harmonics.
   * Length D-2 (indices 0..D-3): l_1 >= l_2 >= ... >= l_{D-2} >= 0.
   * l_1 maps to azimuthalQuantumNumber, m maps to magneticQuantumNumber.
   * Intermediate values l_2..l_{D-3} are stored here (indices 1..D-3).
   * Maximum length 8 (for D=11: 9 angles, chain length 9, but l_1 and |m| stored separately).
   */
  angularChain: number[]
}

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
export interface SchroedingerConfig
  extends
    PmlAbsorberConfig,
    SchroedingerNodalConfig,
    SchroedingerProbabilityCurrentConfig,
    SchroedingerCrossSectionConfig,
    SchroedingerWignerConfig,
    SchroedingerVolumeConfig,
    SchroedingerEmissionConfig,
    SchroedingerQuantumEffectsConfig,
    SchroedingerSecondQuantConfig,
    SchroedingerRepresentationConfig,
    SchroedingerHOConfig,
    SchroedingerHydrogenConfig {
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

  // Representation — see SchroedingerRepresentationConfig

  // Harmonic Oscillator — see SchroedingerHOConfig

  // Hydrogen — see SchroedingerHydrogenConfig

  // Volume rendering — see SchroedingerVolumeConfig

  // Emission — see SchroedingerEmissionConfig

  // === PML Absorbing Boundary (shared across all dynamic modes; fields
  // declared on PmlAbsorberConfig in crossMode.ts) ===

  // === Raymarching Quality ===
  /** Unified raymarching quality preset (affects sample count) */
  raymarchQuality: RaymarchQuality

  // SSS state lives on the appearance store (`sssEnabled`, `sssIntensity`,
  // `sssColor`, `sssThickness`, `sssJitter`). The renderer reads from there
  // exclusively — no schroedinger-scoped duplicates.

  // === Quantum Effects ===
  // Nodal — see SchroedingerNodalConfig
  // Quantum effect overlays — see SchroedingerQuantumEffectsConfig

  // Physical Probability Current — see SchroedingerProbabilityCurrentConfig

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

  // 2D Cross-Section Slice — see SchroedingerCrossSectionConfig

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

  // Wigner Phase-Space — see SchroedingerWignerConfig

  // Second quantization — see SchroedingerSecondQuantConfig

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

  // === Wheeler–DeWitt Configuration (when quantumMode === 'wheelerDeWitt') ===
  /** Minisuperspace Wheeler–DeWitt (a, φ₁, φ₂) solver configuration */
  wheelerDeWitt: WheelerDeWittConfig

  // === Anti-de Sitter Configuration (when quantumMode === 'antiDeSitter') ===
  /** Closed-form bound-state configuration for AdS_d scalar fields. */
  antiDeSitter: AntiDeSitterConfig

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
  quantumBackreactionLensingEnabled: false,
  quantumBackreactionLensingStrength: 1.0,
  quantumBackreactionCausticGain: 0.6,
  quantumBackreactionSoftening: 0.45,
  bilocalERBridgeEnabled: false,
  bilocalERBridgeStrength: 0.8,
  bilocalERBridgeThroatRadius: 0.45,
  bilocalERBridgePhaseLock: 0.7,
  entropicTimeShearEnabled: false,
  entropicTimeShearStrength: 0.8,
  entropicTimeShearFilamentScale: 1.25,
  entropicTimeShearIrreversibility: 0.6,
  spectralDimensionFlowEnabled: false,
  spectralDimensionFlowStrength: 0.75,
  spectralDimensionFlowUvDimension: 2.0,
  spectralDimensionFlowDiffusionScale: 0.7,
  vacuumBubbleLensEnabled: false,
  vacuumBubbleLensStrength: 0.75,
  vacuumBubbleWallRadius: 0.55,
  vacuumBubbleWallThickness: 0.12,
  vacuumBubbleTension: 0.9,
  vacuumBubbleBias: 0.8,
  bornNullWeaveEnabled: false,
  bornNullWeaveStrength: 0.9,
  bornNullWeaveNodeWidth: 0.025,
  bornNullWeaveCirculation: 2.0,

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

  // Wheeler–DeWitt minisuperspace
  wheelerDeWitt: DEFAULT_WHEELER_DEWITT_CONFIG,

  // Anti-de Sitter bound-state (Stage 1)
  antiDeSitter: DEFAULT_ANTI_DE_SITTER_CONFIG,

  // N-D Basis Vectors
  basisX: new Float32Array([1, 0, 0]),
  basisY: new Float32Array([0, 1, 0]),
  basisZ: new Float32Array([0, 0, 1]),
  origin: new Float32Array([0, 0, 0]),

  // Open Quantum System
  openQuantum: DEFAULT_OPEN_QUANTUM_CONFIG,
}

/** Sanitized hydrogen quantum fields safe for store state and GPU uniforms. */
export interface SanitizedHydrogenQuantumState {
  principalQuantumNumber: number
  azimuthalQuantumNumber: number
  magneticQuantumNumber: number
  bohrRadiusScale: number
}

type HydrogenQuantumStateInput = Partial<SanitizedHydrogenQuantumState>

function finiteOrFallback(
  value: number | undefined,
  fallback: number,
  defaultValue: number
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Number.isFinite(fallback)) return fallback
  return defaultValue
}

function clampFloored(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

/**
 * Normalize hydrogen quantum fields shared by store bulk updates and GPU packing.
 *
 * Direct UI setters reject non-finite values; bulk scene/preset loads and tests
 * can bypass those setters, so callers use previous state as fallback.
 */
export function sanitizeHydrogenQuantumState(
  input: HydrogenQuantumStateInput | null | undefined,
  fallback: HydrogenQuantumStateInput = DEFAULT_SCHROEDINGER_CONFIG
): SanitizedHydrogenQuantumState {
  const defaultState = DEFAULT_SCHROEDINGER_CONFIG
  const rawN = finiteOrFallback(
    input?.principalQuantumNumber,
    fallback.principalQuantumNumber ?? defaultState.principalQuantumNumber,
    defaultState.principalQuantumNumber
  )
  const principalQuantumNumber = clampFloored(rawN, 1, 7)

  const rawL = finiteOrFallback(
    input?.azimuthalQuantumNumber,
    fallback.azimuthalQuantumNumber ?? defaultState.azimuthalQuantumNumber,
    defaultState.azimuthalQuantumNumber
  )
  const azimuthalQuantumNumber = clampFloored(rawL, 0, principalQuantumNumber - 1)

  const rawM = finiteOrFallback(
    input?.magneticQuantumNumber,
    fallback.magneticQuantumNumber ?? defaultState.magneticQuantumNumber,
    defaultState.magneticQuantumNumber
  )
  const magneticQuantumNumber =
    Math.max(-azimuthalQuantumNumber, Math.min(azimuthalQuantumNumber, Math.floor(rawM))) || 0

  const rawBohrRadius = finiteOrFallback(
    input?.bohrRadiusScale,
    fallback.bohrRadiusScale ?? defaultState.bohrRadiusScale,
    defaultState.bohrRadiusScale
  )
  const bohrRadiusScale = Math.max(0.5, Math.min(3.0, rawBohrRadius))

  return {
    principalQuantumNumber,
    azimuthalQuantumNumber,
    magneticQuantumNumber,
    bohrRadiusScale,
  }
}

/**
 * Create a fresh copy of the default Schroedinger config.
 *
 * Deep-clones mutable nested configs, arrays, and typed arrays to prevent
 * shared references between store instances and the global default constant.
 * Use this instead of `{ ...DEFAULT_SCHROEDINGER_CONFIG }` in store
 * factories and reset actions.
 */
export function createDefaultSchroedingerConfig(): SchroedingerConfig {
  return structuredClone(DEFAULT_SCHROEDINGER_CONFIG)
}
