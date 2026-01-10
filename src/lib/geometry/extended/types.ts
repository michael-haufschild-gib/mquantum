/**
 * Type definitions for extended n-dimensional objects
 *
 * Configuration interfaces for:
 * - Root Systems (A, D, E8 polytopes)
 * - Clifford Torus (flat torus on S^3)
 * - Mandelbulb Set (n-dimensional fractal)
 *
 * ## Scale Consistency
 *
 * All objects are designed to have consistent visual scale when using default settings:
 *
 * - **Polytopes** (hypercube, simplex, cross-polytope):
 *   Use scale=1.0, creating vertices in [-1, 1] per axis.
 *   Bounding box is a cube of side length 2.
 *
 * - **Clifford Torus** (radius=1.0):
 *   Points lie on a torus embedded in S³ with sphere radius 1.0.
 *
 * - **Root Systems** (scale=1.0):
 *   Roots are normalized to have maximum coordinate extent ≈ 1.0.
 *
 * - **Mandelbulb** (extent=2.5):
 *   Default viewing region centered at origin, encompassing the main cardioid.
 *
 * @see src/lib/shaders/constants.ts for shared visual constants
 */

// Import Wythoff types from canonical source (avoid duplication)
// Import values for local use and re-export them
import {
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_SCALES,
  type WythoffPolytopeConfig,
  type WythoffPreset,
  type WythoffSymmetryGroup,
} from '../wythoff/types'
export { DEFAULT_WYTHOFF_POLYTOPE_CONFIG, DEFAULT_WYTHOFF_SCALES }
export type { WythoffPolytopeConfig, WythoffPreset, WythoffSymmetryGroup }

// ============================================================================
// Polytope Configuration (for consistency with extended objects)
// ============================================================================

// ============================================================================
// Raymarching Quality System
// ============================================================================

/**
 * Unified raymarching quality presets for all raymarching object types.
 *
 * MIGRATION NOTES (December 2024):
 * - Replaces per-object LOD controls with unified 4-tier quality system
 * - Schrödinger: Previously had direct `sampleCount` (16-128) and LOD sliders
 * - Mandelbulb/Julia: Previously had global `qualityMultiplier` (0.25-1.0) via LOD
 * - New system provides consistent UX across all raymarching objects
 * - Screen coverage detection still applies adaptive quality reduction
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

/**
 * SDF raymarch quality multipliers for Mandelbulb/Julia.
 * Controls the step size multiplier for sphere tracing (lower = smaller steps = more accurate).
 * Screen coverage detection applies additional reduction when object fills viewport.
 *
 * @see MandelbulbMesh, QuaternionJuliaMesh for usage
 */
export const RAYMARCH_QUALITY_TO_MULTIPLIER: Record<RaymarchQuality, number> = {
  fast: 0.25, // 4x larger steps, fewer iterations
  balanced: 0.5, // 2x larger steps, good balance
  quality: 0.75, // 1.33x larger steps, high detail
  ultra: 1.0, // Full resolution, maximum detail
}

/**
 * Configuration for standard polytope generation.
 *
 * This brings polytopes into alignment with extended objects by providing
 * a unified configuration interface. The scale parameter controls the
 * size of the generated polytope (vertices in [-scale, scale] per axis).
 */
export interface PolytopeConfig {
  /**
   * Scale factor for polytope generation (0.5-8.0).
   * Determines the bounding box: vertices lie in [-scale, scale] per axis.
   * Default varies by type: hypercube 1.8, simplex 4.0, cross-polytope 1.8
   */
  scale: number
}

/**
 * Type-specific default scales for polytopes.
 * Different polytope types look best at different initial scales.
 */
export const DEFAULT_POLYTOPE_SCALES: Record<string, number> = {
  hypercube: 1.8,
  simplex: 4.0,
  'cross-polytope': 1.8,
  'wythoff-polytope': 2.0,
}

/**
 * Default polytope configuration (uses hypercube as baseline)
 */
export const DEFAULT_POLYTOPE_CONFIG: PolytopeConfig = {
  scale: 1.8,
}

// ============================================================================
// Root System Types
// ============================================================================

/**
 * Supported root system types
 * - A: Type A_{n-1} roots (n(n-1) roots)
 * - D: Type D_n roots (2n(n-1) roots, requires n >= 4)
 * - E8: Exceptional E8 roots (240 roots, requires n = 8)
 */
export type RootSystemType = 'A' | 'D' | 'E8'

// ============================================================================
// Root System Configuration
// ============================================================================

/**
 * Configuration for root system generation
 *
 * Root systems always have edges enabled (like polytopes).
 * Uses global scale transform for sizing.
 */
export interface RootSystemConfig {
  /** Type of root system (A, D, or E8) */
  rootType: RootSystemType
  /** Scale factor for the roots (0.5-4.0, default 2.0) */
  scale: number
}

/**
 * Default root system configuration
 */
export const DEFAULT_ROOT_SYSTEM_CONFIG: RootSystemConfig = {
  rootType: 'A',
  scale: 2.0,
}

// ============================================================================
// Clifford Torus Configuration
// ============================================================================

/**
 * Edge display modes for Clifford torus
 */
export type CliffordTorusEdgeMode = 'grid' | 'none'

/**
 * Clifford torus internal mode
 * - classic: 2D torus T² in S³ ⊂ ℝ⁴ (only works for n >= 4)
 * - generalized: k-torus Tᵏ in S^(2k-1) ⊂ ℝ^(2k) (works for n >= 3, with k ≤ floor(n/2))
 */
export type CliffordTorusMode = 'classic' | 'generalized'

/**
 * Configuration for Clifford torus generation (flat mode only)
 *
 * Clifford torus creates flat, grid-like structures with independent circles.
 * Available for dimensions 3-11.
 *
 * For nested/Hopf tori with coupled angles, use the 'nested-torus' object type.
 *
 * @see docs/research/clifford-tori-guide.md
 */
export interface CliffordTorusConfig {
  /** Radius of the containing sphere (0.5-6.0) */
  radius: number
  /** Edge display mode */
  edgeMode: CliffordTorusEdgeMode

  /** Internal mode: classic (4D) or generalized (nD) */
  mode: CliffordTorusMode
  /** Resolution in U direction for classic mode (8-128) */
  resolutionU: number
  /** Resolution in V direction for classic mode (8-128) */
  resolutionV: number
  /**
   * Torus dimension k for generalized mode.
   * Creates a k-torus Tᵏ living on S^(2k-1) ⊂ ℝ^(2k).
   * Must satisfy: 1 ≤ k ≤ floor(n/2)
   * - k=1: circle (trivial)
   * - k=2: classic 2-torus (same as classic mode in 4D)
   * - k=3: 3-torus in 6D, etc.
   */
  k: number
  /**
   * Angular resolution per circle for generalized mode.
   * Total points = stepsPerCircle^k (use carefully for k >= 3)
   */
  stepsPerCircle: number
}

/**
 * Default Clifford torus configuration
 */
export const DEFAULT_CLIFFORD_TORUS_CONFIG: CliffordTorusConfig = {
  radius: 3.0,
  edgeMode: 'grid',
  mode: 'classic',
  resolutionU: 32,
  resolutionV: 32,
  k: 2,
  stepsPerCircle: 16,
}

// ============================================================================
// Nested Torus Configuration
// ============================================================================

/**
 * Edge display modes for Nested torus
 */
export type NestedTorusEdgeMode = 'grid' | 'none'

/**
 * Configuration for Nested torus generation
 *
 * Nested tori use Hopf-like coupled structures:
 * - 4D: Hopf fibration (S³ → S²)
 * - 5D: Twisted 2-torus (T² + helix)
 * - 6D: 3-torus (T³) with coupled angles
 * - 7D: Twisted 3-torus (T³ + helix)
 * - 8D: Quaternionic Hopf (S⁷ → S⁴)
 * - 9D: Twisted 4-torus (T⁴ + helix)
 * - 10D: 5-torus (T⁵) with coupled angles
 * - 11D: Twisted 5-torus (T⁵ + helix)
 *
 * @see docs/research/clifford-tori-guide.md
 */
export interface NestedTorusConfig {
  /** Radius of the containing sphere (0.5-6.0) */
  radius: number
  /** Edge display mode */
  edgeMode: NestedTorusEdgeMode

  // ============== Nested (Hopf) Mode Properties - 4D ==============

  /**
   * Torus position (η) in the Hopf fibration (4D only).
   * Range: 0.05 to ~1.52 radians (π/64 to π/2 - π/64).
   * - η = π/4 (0.785): Main Clifford torus with equal circle radii
   * - η → 0: Degenerates to a circle in x₂x₃ plane
   * - η → π/2: Degenerates to a circle in x₀x₁ plane
   */
  eta: number
  /** Resolution in ξ₁ direction for Hopf mode (8-128) */
  resolutionXi1: number
  /** Resolution in ξ₂ direction for Hopf mode (8-128) */
  resolutionXi2: number
  /** Display multiple tori at different η values */
  showNestedTori: boolean
  /** Number of nested tori to display when showNestedTori is true (2-5) */
  numberOfTori: number

  // ============== Nested (Hopf) Mode Properties - 8D ==============

  /** S³ fiber sampling resolution for 8D quaternionic Hopf (4-32) */
  fiberResolution: number
  /** S⁴ base sampling resolution for 8D quaternionic Hopf (4-32) */
  baseResolution: number
  /** Connect points along S³ fibers to reveal fibration structure */
  showFiberStructure: boolean
}

/**
 * Default Nested torus configuration
 */
export const DEFAULT_NESTED_TORUS_CONFIG: NestedTorusConfig = {
  // Shared
  radius: 3.0,
  edgeMode: 'grid',

  // Nested (Hopf) 4D mode
  eta: Math.PI / 4, // Main Clifford torus position
  resolutionXi1: 48,
  resolutionXi2: 48,
  showNestedTori: false,
  numberOfTori: 3,

  // Nested (Hopf) 8D mode
  // NOTE: Face count = fiberRes³ × baseRes² - keep low to avoid memory issues
  // With fiberRes=6, baseRes=8: 216 × 64 = 13,824 faces (manageable)
  // With fiberRes=12, baseRes=12: 1728 × 144 = 248,832 faces (too many!)
  fiberResolution: 6,
  baseResolution: 8,
  showFiberStructure: true,
}

// ============================================================================
// Mandelbulb Set Configuration
// ============================================================================

/**
 * Color modes for Mandelbulb visualization
 * - escapeTime: Basic discrete coloring based on iteration count
 * - smoothColoring: Continuous coloring without banding
 * - distanceEstimation: Color based on distance to set boundary
 * - interiorOnly: Show only points inside the set
 * - boundaryOnly: Show only points near the boundary (useful for 3D+)
 */
export type MandelbulbColorMode =
  | 'escapeTime'
  | 'smoothColoring'
  | 'distanceEstimation'
  | 'interiorOnly'
  | 'boundaryOnly'

/**
 * Color palette presets for Mandelbulb visualization.
 *
 * All palettes (except 'custom') are derived from the user's vertexColor
 * setting, ensuring visual consistency with the overall theme.
 *
 * - monochrome: Dark → vertexColor → White (shades of selected hue)
 * - complement: vertexColor → White → complementary color (180° hue shift)
 * - triadic: Uses vertexColor in a triadic scheme (120° shifts)
 * - analogous: vertexColor with ±60° hue variations
 * - shifted: vertexColor → 90° hue-shifted version
 */
export type MandelbulbPalette = 'monochrome' | 'complement' | 'triadic' | 'analogous' | 'shifted'

/**
 * Quality presets for Mandelbulb computation
 */
export type MandelbulbQualityPreset = 'draft' | 'standard' | 'high' | 'ultra'

/**
 * Rendering styles for Mandelbulb visualization
 * - rayMarching: Volumetric ray marching in shader (3D+ only)
 */
export type MandelbulbRenderStyle = 'rayMarching'

/**
 * Configuration for n-dimensional Mandelbulb set generation
 *
 * Supports:
 * - 3D: Mandelbulb (spherical coordinates)
 * - 4D-11D: Mandelbulb (hyperspherical coordinates)
 *
 * @see docs/prd/ndimensional-mandelbulb.md
 * @see docs/research/mandelbulb-guide.md
 */
export interface MandelbulbConfig {
  /** Visual scale multiplier for the mesh (0.1-10.0, default 1.0) */
  scale?: number

  // Iteration parameters
  /** Maximum iterations before considering point bounded (10-500) */
  maxIterations: number
  /**
   * Escape radius threshold (2.0-16.0).
   * Higher dimensions may need larger values (8-16) for stability.
   * Also known as "bailout" in fractal literature.
   */
  escapeRadius: number
  /** Quality preset (affects iterations and resolution) */
  qualityPreset: MandelbulbQualityPreset

  // Sampling resolution
  /** Samples per axis in the 3D grid (16-128) */
  resolution: number

  // Visualization axes (which 3 of N dimensions to render)
  /** Indices of dimensions to map to X, Y, Z */
  visualizationAxes: [number, number, number]

  // Parameter values for non-visualized dimensions
  /** Fixed values for dimensions not being visualized */
  parameterValues: number[]

  // Navigation (zoom/pan)
  /** Center coordinates in N-dimensional space */
  center: number[]
  /** Extent (zoom level) - half-width of viewing region */
  extent: number

  // Color mapping
  /** Color algorithm to use */
  colorMode: MandelbulbColorMode
  /** Color palette preset */
  palette: MandelbulbPalette
  /** Custom palette colors (used when palette='custom') */
  customPalette: { start: string; mid: string; end: string }
  /** Whether to invert color mapping */
  invertColors: boolean
  /** Color for points inside the set */
  interiorColor: string
  /** Number of palette cycles (1-20) */
  paletteCycles: number

  // Rendering style
  /** How to render the point cloud */
  renderStyle: MandelbulbRenderStyle
  /** Point size for point cloud mode */
  pointSize: number

  // Boundary filtering (for 3D+ visualization)
  /**
   * Boundary threshold range for 'boundaryOnly' color mode.
   * Points with escape time in [min*maxIter, max*maxIter] are shown.
   * Default: [0.1, 0.9] shows points escaping between 10%-90% of maxIterations.
   */
  boundaryThreshold: [number, number]

  // Mandelbulb/Mandelbulb settings (for 3D+)
  /**
   * Power for Mandelbulb/Mandelbulb formula (3D and higher).
   * Default: 8 produces the classic bulb shape.
   * Range: 2-16
   */
  mandelbulbPower: number

  /**
   * Epsilon for numerical stability near origin.
   * Used in hyperspherical coordinate calculations to avoid
   * division by zero and undefined angles.
   * Default: 1e-12
   */
  epsilon: number

  // === Power Animation (Mandelbulb-specific) ===

  /**
   * Enable/disable power animation.
   * Animates the mandelbulbPower parameter for dramatic morphing.
   * Uses multi-frequency organic motion for non-repeating patterns.
   */
  powerAnimationEnabled: boolean

  /**
   * Minimum power value during animation (2.0 to 10.0, default 5.0).
   * Lower values create more "blobby" shapes.
   */
  powerMin: number

  /**
   * Maximum power value during animation (4.0 to 16.0, default 12.0).
   * Higher values create more detailed, spiky shapes.
   */
  powerMax: number

  /**
   * Speed of power animation (0.01 to 0.2, default 0.03).
   * Lower values create slower, more dramatic morphing.
   * Uses multi-frequency curve for organic, non-repeating motion.
   */
  powerSpeed: number

  // === Alternate Power (Mandelbulb variant of Technique B) ===

  /**
   * Enable/disable power alternation per iteration.
   * Uses different power values for even/odd iterations.
   */
  alternatePowerEnabled: boolean

  /**
   * Power value for odd iterations (2.0 to 16.0, default 4.0).
   * Creates hybrid bulb forms by mixing two powers.
   */
  alternatePowerValue: number

  /**
   * Blend factor between base and alternate power (0.0 to 1.0, default 0.5).
   * 0 = fully base power, 1 = fully alternate on odd iterations.
   */
  alternatePowerBlend: number

  // === Slice Animation (4D+ only) ===

  /**
   * Enable/disable animated slice position through higher dimensions.
   * For 4D+ Mandelbulbs, animates which 3D cross-section is visible,
   * creating a "flying through" effect.
   */
  sliceAnimationEnabled: boolean

  /**
   * Speed of slice animation (0.01 to 0.1, default 0.02).
   * Lower values create slower, more dramatic morphing.
   */
  sliceSpeed: number

  /**
   * Amplitude of slice position oscillation (0.1 to 1.0, default 0.3).
   * Controls how far the slice moves in each extra dimension.
   */
  sliceAmplitude: number

  // === Angular Phase Shifts ===

  /**
   * Enable/disable angular phase shift animation.
   * Adds animated phase offsets to theta/phi angles before power operation,
   * creating twisting/spiraling morphs.
   */
  phaseShiftEnabled: boolean

  /**
   * Speed of phase shift animation (0.01 to 0.2, default 0.03).
   * Controls how fast the phase angles change.
   */
  phaseSpeed: number

  /**
   * Maximum phase shift amplitude in radians (0.0 to PI/4, default 0.3).
   * Controls the intensity of the twisting effect.
   */
  phaseAmplitude: number

  // === SDF Render Quality ===
  /**
   * Maximum SDF iterations for fractal calculation (10-200, default 30).
   * Higher values produce more detail but reduce performance.
   * This value is used directly by the shader.
   */
  sdfMaxIterations: number

  /**
   * Surface distance threshold for raymarching hit detection (0.0005-0.01, default 0.002).
   * Lower values produce sharper edges but require more steps.
   * This value is used directly by the shader.
   */
  sdfSurfaceDistance: number

  // === Advanced Rendering ===
  /** Surface roughness for GGX specular (0.0-1.0) */
  roughness: number
  /** Enable subsurface scattering */
  sssEnabled: boolean
  /** SSS intensity (0.0-2.0) */
  sssIntensity: number
  /** SSS tint color (hex) */
  sssColor: string
  /** SSS thickness (0.1-5.0) */
  sssThickness: number
}

/**
 * Quality preset configurations
 */
export const MANDELBROT_QUALITY_PRESETS: Record<
  MandelbulbQualityPreset,
  { maxIterations: number; resolution: number }
> = {
  draft: { maxIterations: 30, resolution: 24 },
  standard: { maxIterations: 80, resolution: 32 },
  high: { maxIterations: 200, resolution: 64 },
  ultra: { maxIterations: 500, resolution: 96 },
}

/**
 * Default Mandelbulb configuration
 */
export const DEFAULT_MANDELBROT_CONFIG: MandelbulbConfig = {
  scale: 1.0,
  maxIterations: 80,
  escapeRadius: 4.0,
  qualityPreset: 'standard',
  resolution: 32,
  visualizationAxes: [0, 1, 2],
  parameterValues: [],
  center: [],
  extent: 2.0, // Default extent for 3D+ Mandelbulb/Mandelbulb
  colorMode: 'escapeTime',
  palette: 'complement',
  customPalette: { start: '#0000ff', mid: '#ffffff', end: '#ff8000' },
  invertColors: false,
  interiorColor: '#000000',
  paletteCycles: 1,
  renderStyle: 'rayMarching',
  pointSize: 3,
  boundaryThreshold: [0.1, 0.9], // Show points with escape time 10%-90% of maxIter
  mandelbulbPower: 8, // Classic Mandelbulb/Mandelbulb power
  epsilon: 1e-12, // Numerical stability for hyperspherical calculations
  // Power Animation defaults (Mandelbulb-specific)
  // Uses multi-frequency organic motion for smooth, non-repeating animation
  powerAnimationEnabled: false,
  powerMin: 5.0, // Creates blobby shapes at low end
  powerMax: 12.0, // Creates detailed shapes at high end
  powerSpeed: 0.03, // Very slow organic wandering
  // Alternate Power defaults
  alternatePowerEnabled: false,
  alternatePowerValue: 4.0,
  alternatePowerBlend: 0.5,
  // Slice Animation defaults (4D+ only)
  sliceAnimationEnabled: false,
  sliceSpeed: 0.02, // Slow movement through slices
  sliceAmplitude: 0.3, // Moderate displacement in extra dimensions
  // Angular Phase Shifts defaults
  phaseShiftEnabled: false,
  phaseSpeed: 0.03, // Slow phase evolution
  phaseAmplitude: 0.3, // ~17 degrees max phase shift

  // SDF Render Quality (animation-friendly defaults = current LQ values)
  sdfMaxIterations: 30,
  sdfSurfaceDistance: 0.002,

  // Advanced Rendering
  roughness: 0.3,
  sssEnabled: false,
  sssIntensity: 1.0,
  sssColor: '#ff8844',
  sssThickness: 1.0,
}

// ============================================================================
// Schroedinger Configuration (Copy of Mandelbulb for future modification)
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
 * - hydrogenOrbital: Spherical hydrogen atom orbitals (s, p, d, f)
 * - hydrogenND: N-dimensional hydrogen orbital (hybrid: Y_lm for first 3D + HO for extra dims)
 */
export type SchroedingerQuantumMode = 'harmonicOscillator' | 'hydrogenOrbital' | 'hydrogenND'

/**
 * Named hydrogen orbital presets (1s, 2s, 2p, 3d, 4f, etc.)
 */
export type HydrogenOrbitalPresetName =
  | '1s'
  | '2s'
  | '3s'
  | '4s'
  | '2px'
  | '2py'
  | '2pz'
  | '3px'
  | '3py'
  | '3pz'
  | '3dxy'
  | '3dxz'
  | '3dyz'
  | '3dz2'
  | '3dx2y2'
  | '4fz3'
  | '4fxyz'
  | '4fy3x2y2'
  | '4fzx2y2'
  | 'custom'

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
  /** Physics mode: harmonic oscillator vs hydrogen orbital */
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

  // === Hydrogen Orbital Configuration (when quantumMode === 'hydrogenOrbital') ===
  /** Named hydrogen orbital preset (1s, 2px, 3dz2, etc.) */
  hydrogenPreset: HydrogenOrbitalPresetName
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

  // Hydrogen orbital state
  hydrogenPreset: '2pz',
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

  // Emission
  emissionIntensity: 0.0,
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
// Quaternion Julia Configuration
// ============================================================================

/**
 * Julia constant preset for Quaternion Julia sets
 */
export interface JuliaConstantPreset {
  name: string
  value: [number, number, number, number]
}

/**
 * Configuration for Quaternion Julia fractal generation
 *
 * Mathematical basis: z = z^n + c where z and c are quaternions
 * The Julia constant c is fixed (unlike Mandelbulb where c = initial position)
 *
 * Supports 3D to 11D via hyperspherical quaternion generalization.
 *
 * @see docs/prd/quaternion-julia-fractal.md
 */
export interface QuaternionJuliaConfig {
  /**
   * Julia constant c (4D quaternion components).
   * Default: [0.3, 0.5, 0.4, 0.2] ("Classic Bubble")
   * Range: -2.0 to 2.0 per component
   */
  juliaConstant: [number, number, number, number]

  /**
   * Iteration power (2-8, default 2 for quadratic).
   * Higher powers create more complex folding patterns.
   */
  power: number

  /**
   * Maximum iterations before escape (32-256, default 64).
   */
  maxIterations: number

  /**
   * Bailout/escape radius (2.0-16.0, default 4.0).
   */
  bailoutRadius: number

  /**
   * Scale/extent parameter for auto-positioning (0.5-5.0, default 2.0).
   * Controls the sampling volume - larger values show more of the fractal.
   */
  scale: number

  /**
   * Surface distance threshold for raymarching (0.0005-0.004).
   * @deprecated Use sdfSurfaceDistance instead
   */
  surfaceThreshold: number

  /**
   * Maximum raymarch steps (64-512).
   */
  maxRaymarchSteps: number

  // === SDF Render Quality ===
  /**
   * Maximum SDF iterations for fractal calculation (10-200, default 30).
   * Higher values produce more detail but reduce performance.
   * This value is used directly by the shader.
   */
  sdfMaxIterations: number

  /**
   * Surface distance threshold for raymarching hit detection (0.0005-0.01, default 0.002).
   * Lower values produce sharper edges but require more steps.
   * This value is used directly by the shader.
   */
  sdfSurfaceDistance: number

  /**
   * Quality multiplier for fine-tuning (0.25-1.0, default 1.0).
   */
  qualityMultiplier: number

  /**
   * D-dimensional rotation parameter values (for dimensions 4-11).
   * Array length = dimension - 3.
   */
  parameterValues: number[]

  // === Color Configuration ===

  /** Color algorithm (0-7): Mono, Analogous, Cosine, Normal, Distance, LCH, Multi, Radial */
  colorMode: number
  /** Base hex color for monochromatic/analogous modes */
  baseColor: string
  /** Cosine palette coefficients (Inigo Quilez formula) */
  cosineCoefficients: {
    a: [number, number, number]
    b: [number, number, number]
    c: [number, number, number]
    d: [number, number, number]
  }
  /** Color distribution power (0.25-4.0) */
  colorPower: number
  /** Number of color cycles (0.5-5.0) */
  colorCycles: number
  /** Color phase offset (0.0-1.0) */
  colorOffset: number
  /** LCH lightness (0.1-1.0) */
  lchLightness: number
  /** LCH chroma (0.0-0.4) */
  lchChroma: number

  // === Shadow Configuration ===

  /** Enable shadow calculation */
  shadowEnabled: boolean
  /** Shadow quality: 0=Low(16), 1=Medium(32), 2=High(64), 3=Ultra(128) */
  shadowQuality: number
  /** Shadow softness (0.0-2.0) */
  shadowSoftness: number
  /** Shadow animation mode: 0=Pause, 1=Low, 2=Full */
  shadowAnimationMode: number

  // === Advanced Rendering ===
  /** Surface roughness for GGX specular (0.0-1.0) */
  roughness: number
  /** Enable subsurface scattering */
  sssEnabled: boolean
  /** SSS intensity (0.0-2.0) */
  sssIntensity: number
  /** SSS tint color (hex) */
  sssColor: string
  /** SSS thickness (0.1-5.0) */
  sssThickness: number

  // === Atmosphere ===
  /** Enable scene fog integration */
  fogEnabled: boolean
  /** Fog contribution (0.0-2.0) */
  fogContribution: number
  /** Internal fog density (0.0-1.0) */
  internalFogDensity: number
  // NOTE: Julia fractals have no animation properties.
  // Smooth shape morphing is achieved via 4D+ rotation (handled by the rotation system).
}

/**
 * Julia constant presets
 */
export const JULIA_CONSTANT_PRESETS: JuliaConstantPreset[] = [
  { name: 'Tentacles', value: [-0.2, 0.8, 0.0, 0.0] },
  { name: 'Bubble', value: [0.285, 0.01, 0.0, 0.0] },
  { name: 'Coral', value: [-0.1, 0.65, 0.45, -0.2] },
  { name: 'Sponge', value: [-0.4, -0.4, 0.4, 0.4] },
  { name: 'Twisted', value: [-0.08, 0.0, -0.83, 0.025] },
]

/**
 * Quality presets for Quaternion Julia
 */
export const QUATERNION_JULIA_QUALITY_PRESETS = {
  draft: { maxIterations: 32, surfaceThreshold: 0.004, maxRaymarchSteps: 64 },
  standard: { maxIterations: 64, surfaceThreshold: 0.002, maxRaymarchSteps: 128 },
  high: { maxIterations: 128, surfaceThreshold: 0.001, maxRaymarchSteps: 256 },
  ultra: { maxIterations: 256, surfaceThreshold: 0.0005, maxRaymarchSteps: 512 },
}

/**
 * Default configuration for Quaternion Julia
 */
export const DEFAULT_QUATERNION_JULIA_CONFIG: QuaternionJuliaConfig = {
  juliaConstant: [-0.2, 0.8, 0.0, 0.0],
  power: 2,
  maxIterations: 64,
  bailoutRadius: 4.0,
  scale: 1.0,
  surfaceThreshold: 0.002,
  maxRaymarchSteps: 128,
  // SDF Render Quality (animation-friendly defaults = current LQ values)
  sdfMaxIterations: 30,
  sdfSurfaceDistance: 0.002,
  qualityMultiplier: 1.0,
  parameterValues: [],

  // Color defaults
  colorMode: 2, // Cosine gradient
  baseColor: '#4488ff',
  cosineCoefficients: {
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.33, 0.67],
  },
  colorPower: 1.0,
  colorCycles: 1.0,
  colorOffset: 0.0,
  lchLightness: 0.7,
  lchChroma: 0.15,

  // Shadow defaults
  shadowEnabled: false,
  shadowQuality: 1, // Medium
  shadowSoftness: 1.0,
  shadowAnimationMode: 1, // Low

  // Advanced Rendering
  roughness: 0.3,
  sssEnabled: false,
  sssIntensity: 1.0,
  sssColor: '#ff8844',
  sssThickness: 1.0,

  // Atmosphere
  fogEnabled: false,
  fogContribution: 1.0,
  internalFogDensity: 0.0,
  // NOTE: Julia fractals have no animation properties.
  // Smooth shape morphing is achieved via 4D+ rotation (handled by the rotation system).
}

// ============================================================================
// Black Hole Configuration
// ============================================================================

/**
 * Quality presets for black hole rendering
 */
export type BlackHoleQuality = 'fast' | 'balanced' | 'quality' | 'ultra'

/**
 * Palette modes for black hole coloring
 */
export type BlackHolePaletteMode = 'diskGradient' | 'normalBased' | 'shellOnly' | 'heatmap'

/**
 * Lighting mode for accretion material
 */
export type BlackHoleLightingMode = 'emissiveOnly' | 'fakeLit'

/**
 * Manifold type override
 */
export type BlackHoleManifoldType = 'autoByN' | 'disk' | 'sheet' | 'slab' | 'field'

/**
 * Ray bending mode for gravitational lensing
 * - spiral: Bends rays directly toward center (current, artistic effect)
 * - orbital: Einstein-ring style orbital arcs (more physically accurate)
 */
export type BlackHoleRayBendingMode = 'spiral' | 'orbital'

/**
 * Sky cubemap resolution options for gravitational lensing.
 * Higher resolutions provide sharper reflections but use more memory.
 * - 256: Fast, suitable for performance mode
 * - 512: Balanced (default)
 * - 1024: High quality
 */
export type SkyCubemapResolution = 256 | 512 | 1024

/**
 * Configuration for n-dimensional Black Hole visualization
 *
 * Implements gravitational lensing, photon shell, and luminous accretion manifold.
 * Uses volumetric raymarching with bent rays (unlike SDF-based Mandelbulb).
 *
 * Supports 3D-11D with dimension-aware manifold geometry.
 *
 * === Physics-Based Parameters (Kerr Black Hole) ===
 *
 * The black hole uses Kerr metric physics. Key parameters:
 * - horizonRadius: Visual scale (Schwarzschild radius rs = 2M)
 * - spin: Dimensionless spin chi = a/M (0 = Schwarzschild, 0.998 = near-extremal)
 * - diskTemperature: Inner disk temperature in Kelvin (for blackbody coloring)
 *
 * From these, the system computes:
 * - Event horizon: r+ = M(1 + sqrt(1 - chi²))
 * - Photon sphere: r_ph = 2M(1 + cos(2/3 * arccos(-chi)))
 * - ISCO (inner disk edge): Complex formula dependent on spin
 *
 * References:
 * - https://en.wikipedia.org/wiki/Kerr_metric
 * - https://www.fabiopacucci.com/resources/black-hole-calculator/formulas-black-hole-calculator/
 */
export interface BlackHoleConfig {
  // === PHYSICS-BASED (Primary Controls) ===
  /**
   * Schwarzschild radius rs = 2M, determines visual scale (0.05-20, default 2.0).
   * All other radii (ISCO, photon sphere) are computed relative to this.
   */
  horizonRadius: number
  /**
   * Dimensionless spin parameter chi = a/M (0-0.998, default 0).
   * 0 = non-rotating Schwarzschild black hole
   * 0.998 = near-extremal Kerr (maximum physical spin)
   *
   * Affects:
   * - Event horizon size (shrinks with spin)
   * - ISCO (moves inward for prograde disk)
   * - Photon sphere (asymmetric for prograde/retrograde)
   * - Frame dragging (not yet implemented in shader)
   */
  spin: number
  /**
   * Inner disk temperature in Kelvin (1000-40000, default 6500).
   * Used for blackbody coloring of the accretion disk.
   * - 1000K: Deep red (cool outer regions)
   * - 6500K: White (like the Sun)
   * - 10000K: Blue-white (hot inner regions)
   * - 40000K: Blue (extremely hot)
   */
  diskTemperature: number
  /** Gravity strength k (0-10, default 1.0) - artistic multiplier */
  gravityStrength: number
  /** Manifold emission intensity (0-20, default 1.0) */
  manifoldIntensity: number
  /** Manifold thickness (0-2, default 0.15) */
  manifoldThickness: number
  /** Photon shell width (0-0.3, default 0.05) */
  photonShellWidth: number
  /** Animation time scale (0-5, default 1.0) */
  timeScale: number
  /** Base color for accretion (hex string) */
  baseColor: string
  /** Palette mode for coloring */
  paletteMode: BlackHolePaletteMode
  /** Bloom boost multiplier (0-5, default 1.5) */
  bloomBoost: number

  // === LENSING (Advanced) ===
  /** Dimension emphasis alpha (0-2, default 0.8) */
  dimensionEmphasis: number
  /** Distance falloff beta (0.5-4, default 1.6) */
  distanceFalloff: number
  /** Epsilon multiplier (1e-5 to 0.5, default 0.01) */
  epsilonMul: number
  /** Bend scale (0-5, default 1.0) */
  bendScale: number
  /** Max bend per step in radians (0-0.8, default 0.25) */
  bendMaxPerStep: number
  /** Lensing clamp value (0-100, default 10) */
  lensingClamp: number
  /** Ray bending mode (spiral or orbital) */
  rayBendingMode: BlackHoleRayBendingMode

  // === PHOTON SHELL (Advanced) ===
  /** Photon shell radius multiplier (1.0-2.0, default 1.3) */
  photonShellRadiusMul: number
  /** Photon shell radius dimension bias (0-0.5, default 0.1) */
  photonShellRadiusDimBias: number
  /** Shell glow strength (0-20, default 3.0) */
  shellGlowStrength: number
  /** Shell glow color (hex string) */
  shellGlowColor: string
  /** Shell step multiplier (0.05-1, default 0.35) */
  shellStepMul: number
  /** Shell contrast boost (0-3, default 1.0) */
  shellContrastBoost: number

  // === MANIFOLD / ACCRETION (Advanced) ===
  /** Manifold type */
  manifoldType: BlackHoleManifoldType

  /** Disk inner radius multiplier (0-10, default 1.2) */
  diskInnerRadiusMul: number
  /** Disk outer radius multiplier (0.1-200, default 8.0) */
  diskOuterRadiusMul: number
  /** Radial softness multiplier (0-2, default 0.2) */
  radialSoftnessMul: number
  /** Thickness per dimension max (1-10, default 4.0) */
  thicknessPerDimMax: number
  /** High dimension W scale (1-10, default 2.0) */
  highDimWScale: number
  /** Swirl amount (0-2, default 0.6) */
  swirlAmount: number
  /** Noise scale (0.1-10, default 1.0) */
  noiseScale: number
  /** Noise amount (0-1, default 0.25) */
  noiseAmount: number
  /** Multi-intersection gain (0-3, default 1.0) */
  multiIntersectionGain: number

  // === RENDERING QUALITY ===
  /** Raymarch quality preset */
  raymarchQuality: BlackHoleQuality
  /** Max raymarch steps (16-512, default 96) */
  maxSteps: number
  /** Base step size (0.001-1, default 0.08) */
  stepBase: number
  /** Minimum step size (0.0001-0.5, default 0.01) */
  stepMin: number
  /** Maximum step size (0.001-5, default 0.2) */
  stepMax: number
  /** Adaptive step gravity factor (0-5, default 1.0) */
  stepAdaptG: number
  /** Adaptive step radius factor (0-2, default 0.2) */
  stepAdaptR: number
  /** Enable absorption (default false) */
  enableAbsorption: boolean
  /** Absorption coefficient (0-10, default 1.0) */
  absorption: number
  /** Transmittance cutoff (0-0.2, default 0.01) */
  transmittanceCutoff: number
  /** Far radius multiplier (default 20.0) */
  farRadius: number

  // === LIGHTING (Optional) ===
  /** Lighting mode */
  lightingMode: BlackHoleLightingMode
  /** Surface roughness (0-1, default 0.6) */
  roughness: number
  /** Specular intensity (0-1, default 0.2) */
  specular: number
  /** Ambient tint (0-1, default 0.1) */
  ambientTint: number
  /** Shadow enabled (default false) */
  shadowEnabled: boolean
  /** Shadow steps (4-64, default 16) */
  shadowSteps: number
  /** Shadow density (0-10, default 2.0) */
  shadowDensity: number

  // === TEMPORAL ===
  /** Temporal accumulation enabled (default true) */
  temporalAccumulationEnabled: boolean

  // === DOPPLER EFFECT ===
  /** Doppler effect enabled (default false) */
  dopplerEnabled: boolean
  /** Doppler strength (0-2, default 0.6) */
  dopplerStrength: number

  // === CROSS-SECTION (4D+) ===
  /** Extra dimension slice positions */
  parameterValues: number[]

  // === MOTION BLUR ===
  /** Motion blur enabled (default false) */
  motionBlurEnabled: boolean
  /** Motion blur strength (0-2, default 0.5) */
  motionBlurStrength: number
  /** Motion blur samples (1-8, default 4) */
  motionBlurSamples: number
  /** Motion blur radial falloff (0-5, default 2.0) */
  motionBlurRadialFalloff: number

  // === DEFERRED LENSING ===
  /** Deferred lensing enabled (default false) */
  deferredLensingEnabled: boolean
  /** Deferred lensing strength (0-2, default 1.0) */
  deferredLensingStrength: number
  /** Deferred lensing radius in horizon units (0-10, default 5.0) */
  deferredLensingRadius: number
  /** Deferred lensing chromatic aberration amount (0-1, default 0.3) */
  deferredLensingChromaticAberration: number
  /** Sky cubemap resolution for lensing (256, 512, or 1024) */
  skyCubemapResolution: SkyCubemapResolution

  // === SCREEN-SPACE LENSING ===
  // NOTE: screenSpaceLensingEnabled removed - gravity lensing is now controlled globally
  /**
   * Screen-space lensing falloff exponent (0.5-4.0, default 1.5)
   *
   * Controls how lensing intensity changes with distance from center:
   * - Higher values (2.0-4.0): Effect concentrated near center, drops rapidly
   * - Lower values (0.5-1.0): Effect extends further from center, more gradual
   *
   * Note: Deflection always increases closer to center; this parameter only
   * controls the rate of falloff, not the direction of the effect.
   */
  lensingFalloff: number

  // === SCENE OBJECT LENSING ===
  /** Scene object lensing enabled (default true) */
  sceneObjectLensingEnabled: boolean
  /** Scene object lensing strength (0-2, default 1.0) */
  sceneObjectLensingStrength: number

  // === ANIMATION ===
  /** Manifold pulse animation enabled */
  pulseEnabled: boolean
  /** Pulse animation speed (0-2, default 0.3) */
  pulseSpeed: number
  /** Pulse animation amount (0-1, default 0.2) */
  pulseAmount: number
  /** Slice animation enabled (4D+ only) */
  sliceAnimationEnabled: boolean
  /** Slice animation speed (0.01-0.1, default 0.02) */
  sliceSpeed: number
  /** Slice animation amplitude (0.1-1.0, default 0.3) */
  sliceAmplitude: number

  // === Keplerian Disk Rotation ===
  /**
   * Keplerian differential strength for disk rotation (0-1, default 0.5).
   * Controls how much faster the inner disk rotates vs outer disk.
   * 0 = uniform rotation (all radii same speed)
   * 1 = full Keplerian (ω ∝ r^-1.5, inner ~3x faster than outer)
   */
  keplerianDifferential: number

  // === POLAR JETS ===
  /**
   * Enable polar jets emanating from black hole poles (default false).
   * Rendered as volumetric cones with soft edges and depth intersections.
   */
  jetsEnabled: boolean
  /**
   * Jet cone height in horizon radius units (10-50, default 25).
   * Height of each jet cone from the black hole center.
   */
  jetsHeight: number
  /**
   * Jet cone base width as fraction of height (0.1-0.5, default 0.2).
   * Lower values = narrow, focused jets. Higher values = wide, diffuse jets.
   */
  jetsWidth: number
  /**
   * Jet emission intensity (0-10, default 3.0).
   * Controls brightness/emissive strength of the jet material.
   */
  jetsIntensity: number
  /**
   * Jet base color (hex string, default '#4488ff').
   * Blue-white is typical for relativistic jets; can also use warm colors.
   */
  jetsColor: string
  /**
   * Jet intensity falloff exponent (1-5, default 2.0).
   * Controls how quickly jet brightness decreases with distance from axis.
   */
  jetsFalloff: number
  /**
   * Jet turbulence noise amount (0-1, default 0.3).
   * Adds animated turbulence to break up uniform appearance.
   */
  jetsNoiseAmount: number
  /**
   * Jet pulsation speed (0-2, default 0.5).
   * Controls animation speed of brightness pulsation along jet length.
   */
  jetsPulsation: number
  /**
   * Enable god rays effect for jets (default true).
   * Adds radial blur light scattering effect (GPU Gems 3 technique).
   */
  jetsGodRaysEnabled: boolean
  /**
   * God rays intensity multiplier (0-2, default 0.8).
   * Controls strength of the radial blur light scattering.
   */
  jetsGodRaysIntensity: number
  /**
   * God rays sample count (16-128, default 64).
   * Higher = better quality but more expensive. 64 is a good balance.
   */
  jetsGodRaysSamples: number
  /**
   * God rays decay factor (0.9-1.0, default 0.96).
   * How quickly light intensity decreases along ray march.
   */
  jetsGodRaysDecay: number
}

/**
 * Quality presets for black hole rendering
 */
export const BLACK_HOLE_QUALITY_PRESETS: Record<BlackHoleQuality, Partial<BlackHoleConfig>> = {
  fast: {
    maxSteps: 128,
    stepBase: 0.1,
    stepMin: 0.02,
    stepMax: 0.5,
    bendMaxPerStep: 0.15, // Larger steps, less accurate orbits
    shadowEnabled: false,
    enableAbsorption: false,
    temporalAccumulationEnabled: true,
  },
  balanced: {
    maxSteps: 256,
    stepBase: 0.08,
    stepMin: 0.01,
    stepMax: 0.3,
    bendMaxPerStep: 0.08, // Accurate orbits for Einstein ring
    shadowEnabled: false,
    enableAbsorption: false,
    temporalAccumulationEnabled: true,
  },
  quality: {
    maxSteps: 400,
    stepBase: 0.05,
    stepMin: 0.005,
    stepMax: 0.2,
    bendMaxPerStep: 0.05, // High accuracy orbits
    shadowEnabled: true,
    enableAbsorption: true,
    temporalAccumulationEnabled: false,
  },
  ultra: {
    maxSteps: 512,
    stepBase: 0.03,
    stepMin: 0.003,
    stepMax: 0.15,
    bendMaxPerStep: 0.03, // Maximum accuracy
    shadowEnabled: true,
    enableAbsorption: true,
    temporalAccumulationEnabled: false,
  },
}

/**
 * Default black hole configuration
 */
export const DEFAULT_BLACK_HOLE_CONFIG: BlackHoleConfig = {
  // Physics-based parameters (Kerr black hole)
  // horizonRadius is the Schwarzschild radius rs = 2M (visual scale)
  horizonRadius: 0.5,
  spin: 0.3, // Low spin for ethereal dreamlike effect
  diskTemperature: 19700, // Hot accretion disk
  gravityStrength: 0.8, // Ethereal: softer gravity
  manifoldIntensity: 4.0, // Accretion disk intensity
  manifoldThickness: 0.8, // Ethereal: thick volumetric disk
  photonShellWidth: 0.1,
  timeScale: 1.0,
  baseColor: '#fff5e6',
  paletteMode: 'diskGradient',
  bloomBoost: 0.8,

  // Lensing - Ethereal preset values
  dimensionEmphasis: 0.8,
  distanceFalloff: 1.6,
  epsilonMul: 0.01,
  bendScale: 0.8, // Ethereal: softer bending
  bendMaxPerStep: 0.25,
  lensingClamp: 10,
  rayBendingMode: 'orbital',

  // Photon shell
  photonShellRadiusMul: 1.3,
  photonShellRadiusDimBias: 0.05, // Reduced - dimension scaling is speculative
  shellGlowStrength: 4.0, // Photon shell glow strength
  shellGlowColor: '#dec82b', // Golden photon shell color
  shellStepMul: 0.15, // Smaller steps near photon sphere for accurate orbits
  shellContrastBoost: 1.0,

  // Manifold - Ethereal preset values
  manifoldType: 'autoByN',
  diskInnerRadiusMul: 4.23, // ISCO - auto-computed from spin=0.3 (prograde Kerr)
  diskOuterRadiusMul: 15.0, // Ethereal: wide disk
  radialSoftnessMul: 0.2,
  thicknessPerDimMax: 4.0,
  highDimWScale: 2.0,
  swirlAmount: 1.2, // Ethereal: more swirl
  noiseScale: 0.2,
  noiseAmount: 0.6, // Noise amount
  multiIntersectionGain: 1.0,

  // Quality
  raymarchQuality: 'balanced',
  maxSteps: 256,
  stepBase: 0.08,
  stepMin: 0.01,
  stepMax: 0.2,
  stepAdaptG: 1.0,
  stepAdaptR: 0.2,
  enableAbsorption: false, // Absorption off by default
  absorption: 0.3, // Low absorption = semi-transparent disk, rays continue for Einstein ring
  transmittanceCutoff: 0.005, // Lower cutoff = rays continue longer
  farRadius: 35.0, // Extended for rays that orbit multiple times

  // Lighting
  lightingMode: 'emissiveOnly',
  roughness: 0.6,
  specular: 0.2,
  ambientTint: 0.1,
  shadowEnabled: false,
  shadowSteps: 16,
  shadowDensity: 2.0,

  // Temporal
  temporalAccumulationEnabled: false,

  // Doppler - Ethereal preset values
  dopplerEnabled: false, // Ethereal: disable Doppler effect
  dopplerStrength: 0.6,

  // Cross-section
  parameterValues: [0, 0, 0, 0, 0, 0, 0, 0],

  // Motion blur
  motionBlurEnabled: false,
  motionBlurStrength: 0.5,
  motionBlurSamples: 4,
  motionBlurRadialFalloff: 2.0,

  // Deferred lensing
  deferredLensingEnabled: false,
  deferredLensingStrength: 1.0,
  deferredLensingRadius: 5.0,
  deferredLensingChromaticAberration: 0.3,
  skyCubemapResolution: 512,

  // Screen-space lensing falloff (used for global gravity lensing)
  lensingFalloff: 1.5,

  // Scene object lensing
  sceneObjectLensingEnabled: true,
  sceneObjectLensingStrength: 1.0,

  // Animation
  pulseEnabled: false,
  pulseSpeed: 0.3,
  pulseAmount: 0.2,
  sliceAnimationEnabled: false,
  sliceSpeed: 0.02,
  sliceAmplitude: 0.3,

  // Keplerian Disk Rotation
  keplerianDifferential: 0.5, // Half Keplerian by default (moderate inner/outer speed difference)

  // Polar Jets
  jetsEnabled: false,
  jetsHeight: 25,
  jetsWidth: 0.2,
  jetsIntensity: 3.0,
  jetsColor: '#4488ff',
  jetsFalloff: 2.0,
  jetsNoiseAmount: 0.3,
  jetsPulsation: 0.5,
  jetsGodRaysEnabled: true,
  jetsGodRaysIntensity: 0.8,
  jetsGodRaysSamples: 64,
  jetsGodRaysDecay: 0.96,
}

// ============================================================================
// Combined Object Parameters
// ============================================================================

/**
 * Combined parameters for all object types (both polytopes and extended objects).
 * Used by the unified geometry generator for consistent configuration.
 *
 * @example
 * ```typescript
 * const params: ExtendedObjectParams = {
 *   polytope: { scale: 1.5 },
 *   rootSystem: { ...DEFAULT_ROOT_SYSTEM_CONFIG, scale: 2.0 },
 *   ...
 * };
 * ```
 */
export interface ExtendedObjectParams {
  /** Configuration for standard polytopes (hypercube, simplex, cross-polytope) */
  polytope: PolytopeConfig
  /** Configuration for Wythoff polytope generation */
  wythoffPolytope: WythoffPolytopeConfig
  /** Configuration for root system generation */
  rootSystem: RootSystemConfig
  /** Configuration for Clifford torus generation */
  cliffordTorus: CliffordTorusConfig
  /** Configuration for Nested torus generation */
  nestedTorus: NestedTorusConfig
  /** Configuration for Mandelbulb set generation */
  mandelbulb: MandelbulbConfig
  /** Configuration for Quaternion Julia fractal generation */
  quaternionJulia: QuaternionJuliaConfig
  /** Configuration for Schroedinger fractal generation */
  schroedinger: SchroedingerConfig
  /** Configuration for Black Hole visualization */
  blackhole: BlackHoleConfig
}

/**
 * Default parameters for all object types
 */
export const DEFAULT_EXTENDED_OBJECT_PARAMS: ExtendedObjectParams = {
  polytope: DEFAULT_POLYTOPE_CONFIG,
  wythoffPolytope: DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  rootSystem: DEFAULT_ROOT_SYSTEM_CONFIG,
  cliffordTorus: DEFAULT_CLIFFORD_TORUS_CONFIG,
  nestedTorus: DEFAULT_NESTED_TORUS_CONFIG,
  mandelbulb: DEFAULT_MANDELBROT_CONFIG,
  quaternionJulia: DEFAULT_QUATERNION_JULIA_CONFIG,
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
  blackhole: DEFAULT_BLACK_HOLE_CONFIG,
}
