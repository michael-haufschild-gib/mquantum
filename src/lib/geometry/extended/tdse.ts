/**
 * TDSE (Time-Dependent Schrödinger Equation) type definitions.
 *
 * Config interface, potential/initial-condition types, and default constants
 * for the split-operator GPU solver.
 */

// ============================================================================
// TDSE Types
// ============================================================================

/**
 * Which field quantity to visualize for TDSE mode
 * - density: Probability density |psi|^2
 * - phase: Wavefunction phase arg(psi)
 * - current: Probability current j = Im(psi* grad psi) / m
 * - potential: External potential V(x)
 */
export type TdseFieldView =
  | 'density'
  | 'phase'
  | 'current'
  | 'potential'
  | 'superfluidVelocity'
  | 'healingLength'
  | 'machNumber'

/**
 * Initial condition type for the TDSE wavepacket
 * - gaussianPacket: Gaussian wavepacket exp(-|x-x0|^2/(4s^2)) * exp(i*k0.x)
 * - planeWave: Plane wave exp(i*k0.x) with Gaussian envelope
 * - superposition: Sum of two Gaussian wavepackets
 */
export type TdseInitialCondition =
  | 'gaussianPacket'
  | 'planeWave'
  | 'superposition'
  | 'thomasFermi'
  | 'vortexImprint'
  | 'vortexLattice'
  | 'darkSoliton'
  | 'ndVortexPair'
  | 'blackHoleAnalog'

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
 * - andersonDisorder: Random on-site disorder V(r) ∈ [-W/2, W/2] for Anderson localization studies
 */
export type TdsePotentialType =
  | 'free'
  | 'barrier'
  | 'step'
  | 'finiteWell'
  | 'harmonicTrap'
  | 'driven'
  | 'doubleSlit'
  | 'periodicLattice'
  | 'doubleWell'
  | 'becTrap'
  | 'radialDoubleWell'
  | 'custom'
  | 'andersonDisorder'
  | 'coupledAnharmonic'
  | 'blackHoleRingdown'

/**
 * Drive waveform type for time-dependent potentials
 * - sine: Sinusoidal drive
 * - pulse: Gaussian pulse envelope
 * - chirp: Linearly chirped sinusoidal drive
 */
export type TdseDriveWaveform = 'sine' | 'pulse' | 'chirp'

/**
 * Distribution type for Anderson disorder potential
 * - uniform: V(r) ∈ [-W/2, W/2] uniform distribution
 * - gaussian: V(r) ~ N(0, W) Gaussian distribution
 */
export type TdseDisorderDistribution = 'uniform' | 'gaussian'

// ============================================================================
// TDSE Config
// ============================================================================

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

  // === Coupled Anharmonic Configuration (when potentialType === 'coupledAnharmonic') ===
  /** Coupling strength λ in V = ½Σω²x² + λΣ_{i<j} x_i²x_j² */
  anharmonicLambda: number

  // === Black-Hole Ringdown Configuration (when potentialType === 'blackHoleRingdown') ===
  /** Schwarzschild mass M in geometrized units — sets the barrier scale */
  bhMass: number
  /** Multipole index ℓ ∈ {0,1,2,3,4,5,6} — ℓ=2 is the dominant gravitational mode */
  bhMultipoleL: number
  /** Perturbation spin s ∈ {0, 1, 2} — scalar / electromagnetic / gravitational */
  bhSpin: 0 | 1 | 2

  // === Disorder Configuration (andersonDisorder type + generic overlay) ===
  /** Disorder strength W: V_disorder ∈ [-W/2, +W/2] (uniform) or σ = W (gaussian) */
  disorderStrength: number
  /** Deterministic PRNG seed for disorder realization reproducibility */
  disorderSeed: number
  /** Statistical distribution of on-site disorder energies */
  disorderDistribution: TdseDisorderDistribution

  // === Custom Potential Expression (when potentialType === 'custom') ===
  /** Mathematical expression for V(x,y,z,...) evaluated on the JS side */
  customPotentialExpression: string

  /** Enable time-dependent drive */
  driveEnabled: boolean
  /** Drive waveform type */
  driveWaveform: TdseDriveWaveform
  /** Drive oscillation frequency */
  driveFrequency: number
  /** Drive oscillation amplitude */
  driveAmplitude: number

  /** Enable absorbing boundary (PML) at domain boundaries */
  absorberEnabled: boolean
  /** PML absorption region width (fraction of domain per side, 0.05-0.5) */
  absorberWidth: number
  /** Target round-trip reflection coefficient for PML (e.g. 1e-6) */
  pmlTargetReflection: number

  /** Which field quantity to render */
  fieldView: TdseFieldView
  /** Auto-scale density normalization from wavefunction maximum */
  autoScale: boolean
  /** Maximum auto-scale amplification factor (1-100). Prevents negligible residuals from being amplified to full brightness. */
  autoScaleMaxGain: number
  /** Show potential V(x) as a faint overlay in the 3D volume */
  showPotential: boolean

  /** Auto-loop: reinitialize wavefunction when norm decays below threshold */
  autoLoop: boolean

  /** Enable diagnostic readback (norm, current) */
  diagnosticsEnabled: boolean
  /** Diagnostic computation interval in frames */
  diagnosticsInterval: number

  /** Enable observable expectation value computation (⟨x⟩, ⟨p⟩, ΔxΔp) */
  observablesEnabled: boolean

  /** Imaginary-time propagation mode (Wick rotation for ground state search) */
  imaginaryTimeEnabled: boolean

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

  /** Analog Hawking (waterfall) — asymptotic flow v_max. */
  hawkingVmax?: number
  /** Analog Hawking (waterfall) — horizon length scale L_h. */
  hawkingLh?: number
  /** Analog Hawking (waterfall) — density dip Δn at the horizon. */
  hawkingDeltaN?: number
  /** Analog Hawking — deterministic (seeded) pair-injection enabled flag. */
  hawkingPairInjection?: boolean
  /** Analog Hawking — injection strength per substep. */
  hawkingInjectRate?: number
  /** Analog Hawking — deterministic noise seed. */
  hawkingSeed?: number

  /** Trap omega used ONLY during initialization (quench scenarios).
   *  When set and different from harmonicOmega, the init pass creates the TF profile
   *  for this omega, then the potential is filled with harmonicOmega for evolution.
   *  This enables breathing-mode excitations via trap-frequency quench. */
  harmonicOmegaInit?: number

  // === Kaluza-Klein Compactification ===
  /** Per-dimension flag: true = compact (periodic with radius R), false = extended */
  compactDims: boolean[]
  /** Per-dimension compactification radius R (L = 2πR). Only used when compactDims[d] = true */
  compactRadii: number[]

  // === N-D Vortex Reconnection (when initialCondition === 'ndVortexPair') ===
  /** First vortex winding plane axis indices [axisA, axisB] (0-indexed) */
  vortexPlane1?: [number, number]
  /** Second vortex winding plane axis indices [axisA, axisB] (0-indexed) */
  vortexPlane2?: [number, number]
  /** Spatial separation between vortex cores (in lattice units) */
  vortexSeparation?: number
  /** Number of vortices to seed (1 = single configurable-plane vortex, 2 = reconnection pair) */
  vortexPairCount?: number

  // === Stochastic Decoherence (CSL localization) ===
  /** Enable stochastic localization (CSL) applied each Strang step */
  stochasticEnabled: boolean
  /** Monitoring/decoherence rate γ — strength of environment coupling (0–10) */
  stochasticGamma: number
  /** Localization Gaussian width σ in world units (0.5–5.0 grid spacings) */
  stochasticSigma: number
  /** Number of random collapse sites per step (1–32) */
  stochasticNumSites: number
  /** Deterministic PRNG seed for noise reproducibility */
  stochasticSeed: number

  // === Decoherent Branching Visualization ===
  /** Enable dual-color branch visualization in the density texture alpha channel */
  branchingEnabled: boolean
  /** Normalized branch plane position along axis 0 (-1.0 to 1.0, 0 = center) */
  branchPlanePosition: number
  /** Branch A color as [r, g, b] in 0–1 range */
  branchColorA: [number, number, number]
  /** Branch B color as [r, g, b] in 0–1 range */
  branchColorB: [number, number, number]
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

  anharmonicLambda: 1.0,

  bhMass: 1.0,
  bhMultipoleL: 2,
  bhSpin: 2,

  hawkingVmax: 2.0,
  hawkingLh: 0.6,
  hawkingDeltaN: 0.0,
  hawkingPairInjection: false,
  hawkingInjectRate: 0.05,
  hawkingSeed: 1337,

  disorderStrength: 0,
  disorderSeed: 42,
  disorderDistribution: 'uniform',

  customPotentialExpression: '0.5 * (x^2 + y^2)',

  driveEnabled: false,
  driveWaveform: 'sine',
  driveFrequency: 1.0,
  driveAmplitude: 1.0,

  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,

  fieldView: 'density',
  autoScale: false,
  autoScaleMaxGain: 20,
  showPotential: true,
  autoLoop: false,

  diagnosticsEnabled: false,
  diagnosticsInterval: 5,
  observablesEnabled: false,
  imaginaryTimeEnabled: false,

  compactDims: [false, false, false],
  compactRadii: [0.15, 0.15, 0.15],

  stochasticEnabled: false,
  stochasticGamma: 0.5,
  stochasticSigma: 2.0,
  stochasticNumSites: 16,
  stochasticSeed: 42,

  branchingEnabled: false,
  branchPlanePosition: 0.0,
  branchColorA: [0.0, 1.0, 1.0],
  branchColorB: [1.0, 0.0, 1.0],

  needsReset: false,
  slicePositions: [],
}
