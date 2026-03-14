/**
 * Type definitions for extended n-dimensional objects
 *
 * Configuration interfaces for:
 * - Schrödinger quantum visualization (volumetric wavefunction rendering)
 *
 * @see src/lib/shaders/constants.ts for shared visual constants
 */

import {
  type OpenQuantumConfig,
  DEFAULT_OPEN_QUANTUM_CONFIG,
} from '@/lib/physics/openQuantum/types'

export type { OpenQuantumConfig, OpenQuantumVisualizationMode } from '@/lib/physics/openQuantum/types'
export { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

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
 * - freeScalarField: Real Klein-Gordon scalar field on a 1D-3D spatial lattice with leapfrog evolution
 */
export type SchroedingerQuantumMode = 'harmonicOscillator' | 'hydrogenND' | 'freeScalarField' | 'tdseDynamics' | 'becDynamics' | 'diracEquation'

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
export type FreeScalarInitialCondition = 'vacuumNoise' | 'singleMode' | 'gaussianPacket' | 'kinkProfile'

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

/**
 * Configuration for the free scalar field (Klein-Gordon) lattice simulation.
 * Controls lattice geometry, physics parameters, initial conditions, and visualization.
 */
export interface FreeScalarConfig {
  /** Spatial dimensionality of the lattice (1-11), driven by global dimension selector */
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
  diagnosticsEnabled: false,
  diagnosticsInterval: 10,
}

// ============================================================================
// TDSE (Time-Dependent Schroedinger Equation) Configuration
// ============================================================================

/**
 * Which field quantity to visualize for TDSE mode
 * - density: Probability density |psi|^2
 * - phase: Wavefunction phase arg(psi)
 * - current: Probability current j = Im(psi* grad psi) / m
 * - potential: External potential V(x)
 */
export type TdseFieldView = 'density' | 'phase' | 'current' | 'potential' | 'superfluidVelocity' | 'healingLength'

/**
 * Initial condition type for the TDSE wavepacket
 * - gaussianPacket: Gaussian wavepacket exp(-|x-x0|^2/(4s^2)) * exp(i*k0.x)
 * - planeWave: Plane wave exp(i*k0.x) with Gaussian envelope
 * - superposition: Sum of two Gaussian wavepackets
 */
export type TdseInitialCondition = 'gaussianPacket' | 'planeWave' | 'superposition' | 'thomasFermi' | 'vortexImprint' | 'vortexLattice' | 'darkSoliton'

/**
 * External potential type for the TDSE
 * - free: No potential (V=0)
 * - barrier: Rectangular potential barrier
 * - step: Potential step
 * - finiteWell: Finite square well
 * - harmonicTrap: Harmonic oscillator trapping potential
 * - driven: Time-dependent driven potential
 * - doubleSlit: Two slits in a barrier wall (2D)
 * - periodicLattice: Cosine lattice V₀cos²(πx/a)
 * - doubleWell: Quartic double-well V(x) = λ(x²−a²)² − εx
 * - becTrap: BEC anisotropic harmonic trap (per-dimension ω ratios via trapAnisotropy)
 * - radialDoubleWell: Radial double well V(r) = λ(r−r₁)²(r−r₂)² − εr (bubble nucleation)
 */
export type TdsePotentialType = 'free' | 'barrier' | 'step' | 'finiteWell' | 'harmonicTrap' | 'driven' | 'doubleSlit' | 'periodicLattice' | 'doubleWell' | 'becTrap' | 'radialDoubleWell'

/**
 * Drive waveform type for time-dependent potentials
 * - sine: Sinusoidal drive
 * - pulse: Gaussian pulse envelope
 * - chirp: Linearly chirped sinusoidal drive
 */
export type TdseDriveWaveform = 'sine' | 'pulse' | 'chirp'

/**
 * Configuration for the TDSE (time-dependent Schroedinger equation) solver.
 * Uses split-operator Strang splitting with Stockham FFT on the GPU.
 */
export interface TdseConfig {
  /** Spatial dimensionality of the lattice (1-3 active, up to 11 with slicing) */
  latticeDim: number
  /** Lattice grid size per dimension — length equals latticeDim */
  gridSize: number[]
  /** Lattice spacing per dimension — length equals latticeDim */
  spacing: number[]

  /** Particle mass (atomic units) */
  mass: number
  /** Reduced Planck constant (default 1.0 in atomic units) */
  hbar: number
  /** Time step for split-operator evolution */
  dt: number
  /** Number of Strang splitting substeps per render frame (1-16) */
  stepsPerFrame: number

  /** Initial condition type */
  initialCondition: TdseInitialCondition
  /** Gaussian wavepacket center position — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian wavepacket width (sigma) */
  packetWidth: number
  /** Gaussian wavepacket amplitude */
  packetAmplitude: number
  /** Initial momentum vector k0 — length equals latticeDim */
  packetMomentum: number[]

  /** External potential type */
  potentialType: TdsePotentialType
  /** Barrier height (energy units) */
  barrierHeight: number
  /** Barrier width (spatial units) */
  barrierWidth: number
  /** Barrier center position along first axis */
  barrierCenter: number
  /** Finite well depth */
  wellDepth: number
  /** Finite well width */
  wellWidth: number
  /** Harmonic trap angular frequency */
  harmonicOmega: number
  /** Step potential height */
  stepHeight: number

  // === Double Slit Configuration (when potentialType === 'doubleSlit') ===
  /** Distance between slit centers along axis 1 */
  slitSeparation: number
  /** Width of each slit opening */
  slitWidth: number
  /** Thickness of the barrier wall along axis 0 */
  wallThickness: number
  /** Potential height of the wall */
  wallHeight: number

  // === Periodic Lattice Configuration (when potentialType === 'periodicLattice') ===
  /** Lattice depth V₀ for cosine potential */
  latticeDepth: number
  /** Spatial period of the lattice */
  latticePeriod: number

  // === Double Well Configuration (when potentialType === 'doubleWell') ===
  /** Quartic coupling λ in V(x) = λ(x² − a²)² − εx */
  doubleWellLambda: number
  /** Half-distance between minima (a) */
  doubleWellSeparation: number
  /** Asymmetry tilt ε (0 = symmetric, >0 = right well deeper / false vacuum left) */
  doubleWellAsymmetry: number

  // === Radial Double Well Configuration (when potentialType === 'radialDoubleWell') ===
  /** Inner minimum radius r₁ in V(r) = λ(r−r₁)²(r−r₂)² − εr */
  radialWellInner: number
  /** Outer minimum radius r₂ */
  radialWellOuter: number
  /** Well depth scale λ */
  radialWellDepth: number
  /** Asymmetry tilt ε (>0 = outer well deeper, drives bubble nucleation) */
  radialWellTilt: number

  /** Enable time-dependent drive */
  driveEnabled: boolean
  /** Drive waveform type */
  driveWaveform: TdseDriveWaveform
  /** Drive oscillation frequency */
  driveFrequency: number
  /** Drive oscillation amplitude */
  driveAmplitude: number

  /** Enable complex absorbing potential (CAP) at domain boundaries */
  absorberEnabled: boolean
  /** CAP absorption region width (fraction of domain, 0.05-0.3) */
  absorberWidth: number
  /** CAP absorption strength */
  absorberStrength: number

  /** Which field quantity to render */
  fieldView: TdseFieldView
  /** Auto-scale density normalization from wavefunction maximum */
  autoScale: boolean
  /** Show potential V(x) as a faint overlay in the 3D volume */
  showPotential: boolean

  /** Auto-loop: reinitialize wavefunction when norm decays below threshold */
  autoLoop: boolean

  /** Enable diagnostic readback (norm, current) */
  diagnosticsEnabled: boolean
  /** Diagnostic computation interval in frames */
  diagnosticsInterval: number

  /** Runtime flag to trigger wavefunction re-initialization (not persisted) */
  needsReset: boolean
  /** Slice positions for extra dimensions (d>3) — length equals max(0, latticeDim - 3) */
  slicePositions: number[]

  /** BEC interaction strength g|ψ|² (0 = linear TDSE, >0 = repulsive GPE, <0 = attractive).
   *  Set by the renderer when routing BEC config through the TDSE compute pass. */
  interactionStrength?: number

  /** Per-dimension trap anisotropy ratios for BEC mode (length up to 12).
   *  Each entry scales harmonicOmega along that axis: ω_d = trapAnisotropy[d] * harmonicOmega.
   *  Defaults to 1.0 for all dimensions when not specified. */
  trapAnisotropy?: number[]

  /** Trap omega used ONLY during initialization (quench scenarios).
   *  When set and different from harmonicOmega, the init pass creates the TF profile
   *  for this omega, then the potential is filled with harmonicOmega for evolution.
   *  This enables breathing-mode excitations via trap-frequency quench. */
  harmonicOmegaInit?: number
}

/**
 * Default configuration for the TDSE solver
 */
export const DEFAULT_TDSE_CONFIG: TdseConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.1, 0.1, 0.1],

  mass: 1.0,
  hbar: 1.0,
  dt: 0.005,
  stepsPerFrame: 4,

  initialCondition: 'gaussianPacket',
  packetCenter: [0, 0, 0],
  packetWidth: 0.3,
  packetAmplitude: 1.0,
  packetMomentum: [5.0, 0, 0],

  potentialType: 'barrier',
  barrierHeight: 10.0,
  barrierWidth: 0.2,
  barrierCenter: 1.0,
  wellDepth: 5.0,
  wellWidth: 1.0,
  harmonicOmega: 1.0,
  stepHeight: 5.0,

  slitSeparation: 2.0,
  slitWidth: 0.5,
  wallThickness: 0.3,
  wallHeight: 50.0,

  latticeDepth: 5.0,
  latticePeriod: 1.0,

  doubleWellLambda: 8.0,
  doubleWellSeparation: 1.0,
  doubleWellAsymmetry: 0.0,

  radialWellInner: 0.6,
  radialWellOuter: 1.8,
  radialWellDepth: 50.0,
  radialWellTilt: 0.5,

  driveEnabled: false,
  driveWaveform: 'sine',
  driveFrequency: 1.0,
  driveAmplitude: 1.0,

  absorberEnabled: true,
  absorberWidth: 0.1,
  absorberStrength: 5.0,

  fieldView: 'density',
  autoScale: true,
  showPotential: true,
  autoLoop: false,

  diagnosticsEnabled: false,
  diagnosticsInterval: 5,

  needsReset: false,
  slicePositions: [],
}

/**
 * BEC initial condition type.
 * - thomasFermi: Ground state in Thomas-Fermi approximation (inverted parabola)
 * - gaussianPacket: Standard Gaussian (same as TDSE)
 * - vortexImprint: Thomas-Fermi with a phase-imprinted vortex at center
 * - vortexLattice: Thomas-Fermi with an array of imprinted vortices
 * - darkSoliton: Thomas-Fermi with a density dip (phase step) along axis 0
 */
export type BecInitialCondition =
  | 'thomasFermi'
  | 'gaussianPacket'
  | 'vortexImprint'
  | 'vortexLattice'
  | 'darkSoliton'

/**
 * BEC field view type.
 * - density: |ψ|²
 * - phase: arg(ψ)
 * - current: Probability current j = Im(ψ* ∇ψ) / m
 * - potential: External potential V(x) (trap shape)
 * - superfluidVelocity: v_s = (ℏ/m) ∇arg(ψ), shows vortex flow
 * - healingLength: local ξ(x) = ℏ/√(2m·g·|ψ|²)
 */
export type BecFieldView = 'density' | 'phase' | 'current' | 'potential' | 'superfluidVelocity' | 'healingLength'

/**
 * Configuration for the BEC (Gross-Pitaevskii) solver.
 */
export interface BecConfig {
  // === Lattice ===
  /** Spatial dimensionality (2-11, synced from global dimension) */
  latticeDim: number
  /** Grid points per dimension (power of 2, shares TDSE FFT requirement) */
  gridSize: number[]
  /** Grid spacing per dimension */
  spacing: number[]

  // === Physics ===
  /** Particle mass */
  mass: number
  /** Reduced Planck constant */
  hbar: number
  /** Time step */
  dt: number
  /** Sub-steps per frame */
  stepsPerFrame: number
  /** Nonlinear interaction strength g̃ = g·N */
  interactionStrength: number

  // === Trap ===
  /** Trap frequency ω (isotropic harmonic trap) */
  trapOmega: number
  /** Anisotropy ratios per dimension (ω_d / ω_0) — length matches latticeDim */
  trapAnisotropy: number[]
  /** Initial trap frequency for quench scenarios (TF init uses this ω, evolution uses trapOmega).
   *  When undefined or equal to trapOmega, no quench — standard equilibrium init. */
  initTrapOmega?: number

  // === Initial condition ===
  initialCondition: BecInitialCondition
  /** Vortex charge for vortexImprint (integer, typically ±1 or ±2) */
  vortexCharge: number
  /** Number of vortices in lattice arrangement for vortexLattice */
  vortexLatticeCount: number
  /** Alternate vortex charge signs for dipole configurations (±charge pattern) */
  vortexAlternateCharge: boolean
  /** Soliton depth for darkSoliton (0-1, fraction of background density) */
  solitonDepth: number
  /** Soliton velocity for darkSoliton (fraction of sound speed) */
  solitonVelocity: number

  // === Display ===
  fieldView: BecFieldView
  /** Auto-scale density normalization */
  autoScale: boolean

  // === Absorber ===
  absorberEnabled: boolean
  absorberWidth: number
  absorberStrength: number

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number

  // === Runtime ===
  needsReset: boolean
  /** Slice positions for dimensions > 3 */
  slicePositions: number[]
}

export const DEFAULT_BEC_CONFIG: BecConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  mass: 1.0,
  hbar: 1.0,
  dt: 0.002,
  stepsPerFrame: 4,
  interactionStrength: 500.0,
  trapOmega: 1.0,
  trapAnisotropy: [1.0, 1.0, 1.0],
  initialCondition: 'thomasFermi',
  vortexCharge: 1,
  vortexLatticeCount: 4,
  vortexAlternateCharge: false,
  solitonDepth: 1.0,
  solitonVelocity: 0.0,
  fieldView: 'density',
  autoScale: true,
  absorberEnabled: false,
  absorberWidth: 0.1,
  absorberStrength: 5.0,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

// ============================================================================
// Dirac Equation Configuration
// ============================================================================

/**
 * Dirac equation initial condition.
 * - gaussianPacket: Localized Gaussian spinor wavepacket (positive-energy projection)
 * - planeWave: Plane wave with definite momentum and spin
 * - standingWave: Superposition of +k and -k plane waves
 * - zitterbewegung: Superposition of positive and negative energy states to exhibit trembling
 */
export type DiracInitialCondition =
  | 'gaussianPacket'
  | 'planeWave'
  | 'standingWave'
  | 'zitterbewegung'

/**
 * What quantity to render from the Dirac spinor.
 * - totalDensity: ψ†ψ (all components)
 * - particleDensity: upper spinor components only (representation-basis split, not energy projection)
 * - antiparticleDensity: lower spinor components only (representation-basis split, not energy projection)
 * - particleAntiparticleSplit: upper in color A, lower in color B (dual-channel, representation-basis)
 * - spinDensity: magnitude of spin vector |s| = |ψ†Σψ|
 * - currentDensity: magnitude of probability current |j| = |cψ†αψ|
 * - phase: phase of dominant spinor component
 */
export type DiracFieldView =
  | 'totalDensity'
  | 'particleDensity'
  | 'antiparticleDensity'
  | 'particleAntiparticleSplit'
  | 'spinDensity'
  | 'currentDensity'
  | 'phase'

/**
 * Potential type for the Dirac equation.
 * - none: Free particle (V=0)
 * - step: Step potential (Klein paradox)
 * - barrier: Rectangular barrier
 * - well: Finite square well (bound states)
 * - harmonicTrap: Harmonic oscillator potential (Dirac oscillator)
 * - coulomb: Coulomb 1/r potential (relativistic hydrogen-like)
 */
export type DiracPotentialType =
  | 'none'
  | 'step'
  | 'barrier'
  | 'well'
  | 'harmonicTrap'
  | 'coulomb'

/**
 * Configuration for the Dirac equation solver.
 *
 * The Dirac equation operates on multi-component spinors — S = 2^(⌊N/2⌋)
 * components in N spatial dimensions. Uses split-operator method with
 * matrix exponentials exploiting the Clifford algebra identity H² = E²·I.
 */
export interface DiracConfig {
  // === Lattice ===
  /** Spatial dimensionality (1-11, synced from global dimension).
   *  S = 2^(⌊N/2⌋) spinor components are allocated. */
  latticeDim: number
  /** Grid points per dimension (power of 2, FFT requirement) */
  gridSize: number[]
  /** Grid spacing per dimension */
  spacing: number[]

  // === Physics ===
  /** Particle rest mass (natural units, default 1.0) */
  mass: number
  /** Speed of light (natural units, default 1.0; reduce for pedagogical slow-light) */
  speedOfLight: number
  /** Reduced Planck constant (natural units, default 1.0) */
  hbar: number
  /** Time step */
  dt: number
  /** Sub-steps per frame */
  stepsPerFrame: number

  // === Potential ===
  potentialType: DiracPotentialType
  /** Potential height/depth V₀ (energy units) */
  potentialStrength: number
  /** Potential width (spatial units, for barrier/well) */
  potentialWidth: number
  /** Potential center position along axis 0 */
  potentialCenter: number
  /** Harmonic trap frequency (for harmonicTrap type) */
  harmonicOmega: number
  /** Coulomb charge Z (for coulomb type) */
  coulombZ: number

  // === Initial Condition ===
  initialCondition: DiracInitialCondition
  /** Wavepacket center position — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian width (sigma) */
  packetWidth: number
  /** Initial momentum vector k₀ — length equals latticeDim */
  packetMomentum: number[]
  /** Initial spin direction (for spin-polarized packets).
   *  For S=2: single angle θ. For S=4: (θ, φ) on Bloch sphere.
   *  For S>4: first two entries used as (θ, φ), rest default to 0. */
  spinDirection: number[]
  /** Positive-energy projection strength (0-1).
   *  1.0 = pure positive energy (no Zitterbewegung).
   *  0.5 = equal positive/negative (maximum Zitterbewegung). */
  positiveEnergyFraction: number

  // === Display ===
  fieldView: DiracFieldView
  /** Color for particle (positive-energy) component [r, g, b] 0-1 */
  particleColor: [number, number, number]
  /** Color for antiparticle (negative-energy) component [r, g, b] 0-1 */
  antiparticleColor: [number, number, number]
  /** Auto-scale density normalization */
  autoScale: boolean
  /** Show potential V(x) as a faint overlay in the 3D volume */
  showPotential: boolean

  // === Absorber ===
  absorberEnabled: boolean
  absorberWidth: number
  absorberStrength: number

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number

  // === Runtime ===
  needsReset: boolean
  /** Slice positions for dimensions > 3 */
  slicePositions: number[]
}

export const DEFAULT_DIRAC_CONFIG: DiracConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  mass: 1.0,
  speedOfLight: 1.0,
  hbar: 1.0,
  dt: 0.005,
  stepsPerFrame: 2,
  potentialType: 'step',
  potentialStrength: 3.0,
  potentialWidth: 0.5,
  potentialCenter: 0.0,
  harmonicOmega: 1.0,
  coulombZ: 1.0,
  initialCondition: 'gaussianPacket',
  packetCenter: [-2.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  packetWidth: 0.5,
  packetMomentum: [5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  spinDirection: [0, 0],
  positiveEnergyFraction: 1.0,
  fieldView: 'totalDensity',
  particleColor: [0.2, 0.6, 1.0],
  antiparticleColor: [1.0, 0.3, 0.2],
  autoScale: true,
  showPotential: false,
  absorberEnabled: true,
  absorberWidth: 0.1,
  absorberStrength: 5.0,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

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
  /** Show classical trajectory ellipse overlay */
  wignerClassicalOverlay: boolean
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

  // Raymarching Quality
  raymarchQuality: 'balanced',

  // SSS
  sssEnabled: false,
  sssIntensity: 1.0,
  sssColor: '#ff8844', // Warm orange default
  sssThickness: 1.0,
  sssJitter: 0.2,

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
  wignerClassicalOverlay: false,
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

  // N-D Basis Vectors
  basisX: new Float32Array([1, 0, 0]),
  basisY: new Float32Array([0, 1, 0]),
  basisZ: new Float32Array([0, 0, 1]),
  origin: new Float32Array([0, 0, 0]),

  // Open Quantum System
  openQuantum: DEFAULT_OPEN_QUANTUM_CONFIG,
}

// ============================================================================
// Pauli Spinor Configuration
// ============================================================================

/**
 * Magnetic field configuration type for the Pauli equation.
 * - uniform: Constant B = B₀ n̂ — Larmor precession
 * - gradient: B = (B₀ + b'z) ẑ — Stern-Gerlach splitting
 * - rotating: B = B₀(cos(ωt), sin(ωt), 0) — Rabi oscillations
 * - quadrupole: B = b(x ẑ + z x̂) — quadrupole magnetic trap
 */
export type PauliFieldType = 'uniform' | 'gradient' | 'rotating' | 'quadrupole'

/**
 * Which field quantity to visualize for the Pauli spinor
 * - spinDensity: Separate cyan (↑) / magenta (↓) clouds
 * - totalDensity: Combined |ψ↑|² + |ψ↓|²
 * - spinExpectation: Color-mapped by local ⟨σ_z⟩
 * - coherence: Off-diagonal |ψ↑* ψ↓| density matrix element
 */
export type PauliFieldView = 'spinDensity' | 'totalDensity' | 'spinExpectation' | 'coherence'

/**
 * Initial wavepacket type for the Pauli spinor
 * - gaussianSpinUp: Gaussian packet with pure spin-up
 * - gaussianSpinDown: Gaussian packet with pure spin-down
 * - gaussianSuperposition: Gaussian packet with equal spin-up/down superposition
 * - planeWaveSpinor: Plane wave with specified spin polarization
 */
export type PauliInitialCondition = 'gaussianSpinUp' | 'gaussianSpinDown' | 'gaussianSuperposition' | 'planeWaveSpinor'

/**
 * Scalar potential types available in Pauli mode.
 * Reuses the same spatial potential shapes as TDSE.
 */
export type PauliPotentialType = 'none' | 'harmonicTrap' | 'barrier' | 'doubleWell'

/**
 * Configuration for the Pauli spinor equation.
 * Non-relativistic 2-component spinor in an external magnetic field.
 *
 * iℏ ∂ψ/∂t = [p²/(2m) + V(x) + μ_B σ·B(x)] ψ
 *
 * The spinor is always 2-component regardless of spatial dimension.
 * Magnetic coupling acts on the first 3 spatial dimensions.
 */
export interface PauliConfig {
  // === Lattice ===
  /** Spatial dimensionality (synced from global dimension) */
  latticeDim: number
  /** Grid points per dimension (power of 2 for FFT) */
  gridSize: number[]
  /** Grid spacing per dimension */
  spacing: number[]

  // === Physics ===
  /** Time step */
  dt: number
  /** Number of split-step iterations per render frame */
  stepsPerFrame: number
  /** Reduced Planck constant */
  hbar: number
  /** Particle mass */
  mass: number

  // === Magnetic Field ===
  /** Field configuration type */
  fieldType: PauliFieldType
  /** Magnetic field strength B₀ */
  fieldStrength: number
  /** Field direction (θ, φ) in spherical coordinates */
  fieldDirection: [number, number]
  /** Field gradient strength b' (for Stern-Gerlach) */
  gradientStrength: number
  /** Rotating field angular frequency ω */
  rotatingFrequency: number

  // === Initial Spin State ===
  /** Initial spin direction (θ, φ) on Bloch sphere */
  initialSpinDirection: [number, number]

  // === Initial Wavepacket ===
  /** Initial condition type */
  initialCondition: PauliInitialCondition
  /** Wavepacket center — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian width (sigma) */
  packetWidth: number
  /** Initial momentum k₀ — length equals latticeDim */
  packetMomentum: number[]

  // === Scalar Potential ===
  /** Potential type */
  potentialType: PauliPotentialType
  /** Harmonic trap frequency */
  harmonicOmega: number
  /** Barrier/well depth */
  wellDepth: number
  /** Barrier/well width */
  wellWidth: number
  /** Show potential overlay in 3D volume */
  showPotential: boolean

  // === Visualization ===
  /** Field quantity to render */
  fieldView: PauliFieldView
  /** Spin-up color [r, g, b] 0-1 */
  spinUpColor: [number, number, number]
  /** Spin-down color [r, g, b] 0-1 */
  spinDownColor: [number, number, number]
  /** Auto-scale density normalization */
  autoScale: boolean

  // === Absorber ===
  /** Enable absorbing boundary */
  absorberEnabled: boolean
  /** Absorber layer width (fraction of grid) */
  absorberWidth: number
  /** Absorber damping strength */
  absorberStrength: number

  // === Diagnostics ===
  /** Enable diagnostic readback */
  diagnosticsEnabled: boolean
  /** Diagnostic computation interval in frames */
  diagnosticsInterval: number

  // === Slice Animation (4D+ only) ===
  /** Enable slice animation through extra dimensions */
  sliceAnimationEnabled: boolean
  /** Slice animation speed (0.01-0.1) */
  sliceSpeed: number
  /** Slice animation amplitude (0.1-1.0) */
  sliceAmplitude: number

  // === Runtime ===
  /** Flag to trigger re-initialization */
  needsReset: boolean
  /** Slice positions for dimensions > 3 */
  slicePositions: number[]
}

/**
 * Default configuration for Pauli spinor simulation.
 * 3D Gaussian wavepacket in a uniform magnetic field.
 */
export const DEFAULT_PAULI_CONFIG: PauliConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  dt: 0.005,
  stepsPerFrame: 4,
  hbar: 1.0,
  mass: 1.0,

  fieldType: 'uniform',
  fieldStrength: 2.0,
  fieldDirection: [0, 0],
  gradientStrength: 1.0,
  rotatingFrequency: 1.0,

  initialSpinDirection: [Math.PI / 2, 0],

  initialCondition: 'gaussianSuperposition',
  packetCenter: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  packetWidth: 0.8,
  packetMomentum: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  potentialType: 'harmonicTrap',
  harmonicOmega: 1.0,
  wellDepth: 5.0,
  wellWidth: 1.0,
  showPotential: false,

  fieldView: 'spinDensity',
  spinUpColor: [0.0, 0.8, 1.0],
  spinDownColor: [1.0, 0.2, 0.8],
  autoScale: true,

  absorberEnabled: true,
  absorberWidth: 0.15,
  absorberStrength: 10.0,

  diagnosticsEnabled: true,
  diagnosticsInterval: 5,

  sliceAnimationEnabled: false,
  sliceSpeed: 0.02,
  sliceAmplitude: 0.3,

  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
  /** Configuration for Pauli spinor simulation */
  pauliSpinor: PauliConfig
}

/**
 * Default parameters for all object types
 */
export const DEFAULT_EXTENDED_OBJECT_PARAMS: ExtendedObjectParams = {
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
  pauliSpinor: DEFAULT_PAULI_CONFIG,
}
