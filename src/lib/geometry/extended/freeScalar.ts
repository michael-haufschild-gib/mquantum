/**
 * Free scalar field (Klein-Gordon) type definitions.
 *
 * Config interface, k-space visualization types, and default constants
 * for the real scalar field lattice simulation.
 */

// ============================================================================
// Field View & Initial Conditions
// ============================================================================

/**
 * Which field quantity to visualize for the free scalar field mode
 * - phi: Field amplitude
 * - pi: Conjugate momentum (time derivative of phi)
 * - energyDensity: Local energy density (kinetic + gradient + mass)
 * - wallDensity: Self-interaction potential V(phi) — highlights domain walls (zero at vacua)
 */
export type FreeScalarFieldView = 'phi' | 'pi' | 'energyDensity' | 'wallDensity'

/**
 * Initial condition type for the free scalar field
 * - vacuumNoise: Hash-based pseudo-random Gaussian noise
 * - singleMode: Single plane-wave mode A*cos(k.x)
 * - gaussianPacket: Gaussian wave packet A*exp(-|x-x0|^2/(2*sigma^2))*cos(k.x)
 * - kinkProfile: Domain wall kink phi = v*tanh((x-x0)/w) for self-interaction potential
 */
export type FreeScalarInitialCondition =
  | 'vacuumNoise'
  | 'singleMode'
  | 'gaussianPacket'
  | 'kinkProfile'

// ============================================================================
// k-Space Visualization Config
// ============================================================================

/** How k-space data is projected to the 3D display volume. */
export type KSpaceDisplayMode = 'raw3d' | 'radial3d'

/** Exposure transfer function for k-space occupation mapping. */
export type KSpaceExposureMode = 'none' | 'linear' | 'log'

/**
 * Display-only transforms applied to k-space occupation data before GPU upload.
 * These do not affect the underlying physics — only how n_k values are visualized.
 */
export interface KSpaceVizConfig {
  /** Display projection mode */
  displayMode: KSpaceDisplayMode
  /** Whether to apply FFT shift (center low |k| in the volume) */
  fftShiftEnabled: boolean
  /** Exposure transfer function */
  exposureMode: KSpaceExposureMode
  /** Low percentile cutoff for exposure windowing [0, 99] */
  lowPercentile: number
  /** High percentile cutoff for exposure windowing [1, 100] */
  highPercentile: number
  /** Gamma correction exponent [0.1, 3.0] */
  gamma: number
  /** Whether to apply Gaussian broadening (display-only smoothing) */
  broadeningEnabled: boolean
  /** Half-width of broadening kernel in voxels [1, 5] */
  broadeningRadius: number
  /** Sigma of Gaussian broadening kernel [0.5, 3.0] */
  broadeningSigma: number
  /** Number of radial bins for radial3d mode [16, 128] */
  radialBinCount: number
}

/** Default k-space visualization config — log exposure + FFT shift + mild broadening. */
export const DEFAULT_KSPACE_VIZ: KSpaceVizConfig = {
  displayMode: 'raw3d',
  fftShiftEnabled: true,
  exposureMode: 'log',
  lowPercentile: 0,
  highPercentile: 99.5,
  gamma: 1.0,
  broadeningEnabled: true,
  broadeningRadius: 2,
  broadeningSigma: 1.0,
  radialBinCount: 32,
}

/** Passthrough config — no transforms, identical to pre-refactor behavior. */
export const PASSTHROUGH_KSPACE_VIZ: KSpaceVizConfig = {
  displayMode: 'raw3d',
  fftShiftEnabled: false,
  exposureMode: 'none',
  lowPercentile: 0,
  highPercentile: 100,
  gamma: 1.0,
  broadeningEnabled: false,
  broadeningRadius: 1,
  broadeningSigma: 1.0,
  radialBinCount: 32,
}

// ============================================================================
// Free Scalar Config
// ============================================================================

/**
 * Configuration for the free scalar field (Klein-Gordon) lattice simulation.
 * Controls lattice geometry, physics parameters, initial conditions, and visualization.
 */
export interface FreeScalarConfig {
  /** Spatial dimensionality of the lattice (3-11), driven by global dimension selector */
  latticeDim: number
  /** Lattice grid size per dimension — length equals latticeDim */
  gridSize: number[]
  /** Lattice spacing per dimension — length equals latticeDim */
  spacing: number[]
  /** Klein-Gordon mass parameter m */
  mass: number
  /** Leapfrog time step */
  dt: number
  /** Number of leapfrog steps per render frame (1-16) */
  stepsPerFrame: number

  /** Initial condition type */
  initialCondition: FreeScalarInitialCondition
  /** Gaussian packet center position — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian packet width (sigma) */
  packetWidth: number
  /** Gaussian packet / single-mode amplitude */
  packetAmplitude: number
  /** Wave vector indices for single-mode / packet carrier — length equals latticeDim */
  modeK: number[]
  /** Seed for deterministic vacuum state sampling */
  vacuumSeed: number

  /** Which field quantity to render */
  fieldView: FreeScalarFieldView
  /** Auto-scale density normalization from field maximum */
  autoScale: boolean
  /** Runtime flag to trigger field re-initialization (not persisted) */
  needsReset: boolean

  /** Slice positions for extra dimensions (d>3) — length equals max(0, latticeDim - 3) */
  slicePositions: number[]

  /** Display-only transforms for k-space occupation visualization */
  kSpaceViz: KSpaceVizConfig

  // === Self-Interaction Potential (Mexican hat: V(phi) = lambda*(phi^2 - v^2)^2) ===
  /** Enable self-interaction potential V(phi) = lambda*(phi^2 - v^2)^2 */
  selfInteractionEnabled: boolean
  /** Self-interaction coupling constant lambda */
  selfInteractionLambda: number
  /** Vacuum expectation value v (field minima at phi = +/-v) */
  selfInteractionVev: number

  // === Absorber (PML) ===
  /** Enable absorbing boundary (PML) — prevents periodic wrap-around */
  absorberEnabled: boolean
  /** PML layer width (fraction of grid per side) */
  absorberWidth: number
  /** Target round-trip reflection coefficient for PML */
  pmlTargetReflection: number

  // === Diagnostics ===
  /** Enable diagnostic readback (norm, energy, field statistics) */
  diagnosticsEnabled: boolean
  /** Diagnostic computation interval in frames */
  diagnosticsInterval: number
}

/**
 * Default configuration for the free scalar field lattice simulation
 */
export const DEFAULT_FREE_SCALAR_CONFIG: FreeScalarConfig = {
  latticeDim: 3,
  gridSize: [32, 32, 32],
  spacing: [0.1, 0.1, 0.1],
  mass: 1.0,
  dt: 0.01,
  stepsPerFrame: 4,

  initialCondition: 'gaussianPacket',
  packetCenter: [0, 0, 0],
  packetWidth: 0.3,
  packetAmplitude: 1.0,
  modeK: [1, 0, 0],
  vacuumSeed: 42,

  fieldView: 'phi',
  autoScale: true,
  needsReset: false,
  slicePositions: [],
  kSpaceViz: { ...DEFAULT_KSPACE_VIZ },
  selfInteractionEnabled: false,
  selfInteractionLambda: 0.5,
  selfInteractionVev: 1.0,
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  diagnosticsEnabled: false,
  diagnosticsInterval: 10,
}
