/**
 * Free scalar field (Klein-Gordon) type definitions.
 *
 * Config interface, k-space visualization types, and default constants
 * for the real scalar field lattice simulation.
 */

import type { CosmologyPreset } from '@/lib/physics/cosmology/presets'

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
// Cosmological Background (Mukhanov-Sasaki bridge)
// ============================================================================

/**
 * Cosmological FLRW background sub-config for the Mukhanov-Sasaki bridge.
 *
 * When `enabled = true`, the Free Scalar Field pass reinterprets `(phi, pi)`
 * as the conformal Mukhanov-Sasaki variable `v = a^((n-2)/2) * δφ` and its
 * derivative `v' = dv/dη`. The Klein-Gordon update rule picks up a
 * time-dependent effective mass
 *
 *     M²_eff(η) = a²(η) * m² - z''(η)/z(η)
 *
 * driven by the selected `preset` and evaluated on the fly from the current
 * simulation time `eta`. See `docs/plans/cosmological-background-scalar-field.md`
 * and the `src/lib/physics/cosmology/` module for the full derivation.
 *
 * **Mutually exclusive with `selfInteractionEnabled`** in v1: the linear
 * Mukhanov-Sasaki equivalence is exact only for the free field. Enabling
 * cosmology forces `selfInteractionEnabled = false`. This restriction is
 * lifted in v2 via the classical-statistical approximation.
 */
export interface CosmologyConfig {
  /** Master toggle. When false, the FSF pass runs in Minkowski mode. */
  enabled: boolean
  /** Which FLRW background regime to evolve on. */
  preset: CosmologyPreset
  /**
   * Paper's potential steepness `s`. Only consulted for the ekpyrotic preset;
   * must satisfy `s > s_c(n)` where `s_c(n) = √(8(n-1)/(n-2))`.
   */
  steepness: number
  /**
   * Hubble rate `H` for the de Sitter preset. Sets `a(η) = -1/(Hη)`.
   * Must be strictly positive.
   */
  hubble: number
  /**
   * Initial conformal time `η₀` at which the adiabatic Bunch-Davies vacuum
   * is sampled. Use `η < 0` (deep past). Subject to an auto-clamp so that
   * `|η₀|² · k_min² ≥ safety · |z''/z|(η₀)` — the clamped value is what the
   * FSF pass actually uses.
   */
  eta0: number
}

/**
 * Default cosmology sub-config: disabled, with sensible defaults for each
 * preset so that flipping the toggle yields an immediately runnable state.
 */
export const DEFAULT_COSMOLOGY_CONFIG: CosmologyConfig = {
  enabled: false,
  preset: 'deSitter',
  steepness: 5, // > s_c(4) ≈ 3.464 — valid ekpyrotic default
  hubble: 1,
  eta0: -10,
}

// ============================================================================
// Free Scalar Config
// ============================================================================

/**
 * Configuration for the free scalar field (Klein-Gordon) lattice simulation.
 * Controls lattice geometry, physics parameters, initial conditions, and visualization.
 */
export interface FreeScalarConfig {
  /** Spatial dimensionality of the lattice (3-6), enforced by the quantum type registry */
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

  // === Cosmological Background (Mukhanov-Sasaki) ===
  /**
   * FLRW background sub-config. When `cosmology.enabled` is true, the field
   * is evolved on a time-dependent background with effective mass
   * `M²_eff(η) = a²(η)·m² − z''(η)/z(η)`. Mutually exclusive with
   * `selfInteractionEnabled` in v1.
   */
  cosmology: CosmologyConfig
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
  autoScale: false,
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
  cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
}
