/**
 * Dirac equation type definitions.
 *
 * Config interface, initial-condition/field-view/potential types,
 * and default constants for the relativistic spinor solver.
 */

import type { PmlAbsorberConfig } from './crossMode'

// ============================================================================
// Dirac Types
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
 * - axialCharge: normalized axial/chiral charge magnitude |ψ†γ5ψ|/ρ
 */
export type DiracFieldView =
  | 'totalDensity'
  | 'particleDensity'
  | 'antiparticleDensity'
  | 'particleAntiparticleSplit'
  | 'spinDensity'
  | 'currentDensity'
  | 'phase'
  | 'axialCharge'

/**
 * Potential type for the Dirac equation.
 * - none: Free particle (V=0)
 * - step: Step potential (Klein paradox)
 * - barrier: Rectangular barrier
 * - well: Finite square well (bound states)
 * - harmonicTrap: Harmonic oscillator potential (Dirac oscillator)
 * - coulomb: Coulomb 1/r potential (relativistic hydrogen-like)
 */
export type DiracPotentialType = 'none' | 'step' | 'barrier' | 'well' | 'harmonicTrap' | 'coulomb'

export const DIRAC_INITIAL_CONDITIONS: readonly DiracInitialCondition[] = [
  'gaussianPacket',
  'planeWave',
  'standingWave',
  'zitterbewegung',
]

export const DIRAC_FIELD_VIEWS: readonly DiracFieldView[] = [
  'totalDensity',
  'particleDensity',
  'antiparticleDensity',
  'particleAntiparticleSplit',
  'spinDensity',
  'currentDensity',
  'phase',
  'axialCharge',
]

export const DIRAC_POTENTIAL_TYPES: readonly DiracPotentialType[] = [
  'none',
  'step',
  'barrier',
  'well',
  'harmonicTrap',
  'coulomb',
]

const DIRAC_INITIAL_CONDITION_SET = new Set<string>(DIRAC_INITIAL_CONDITIONS)
const DIRAC_FIELD_VIEW_SET = new Set<string>(DIRAC_FIELD_VIEWS)
const DIRAC_POTENTIAL_TYPE_SET = new Set<string>(DIRAC_POTENTIAL_TYPES)

/** Return true when a value is a supported Dirac initial condition. */
export function isDiracInitialCondition(value: unknown): value is DiracInitialCondition {
  return typeof value === 'string' && DIRAC_INITIAL_CONDITION_SET.has(value)
}

/** Return true when a value is a supported Dirac field-view mode. */
export function isDiracFieldView(value: unknown): value is DiracFieldView {
  return typeof value === 'string' && DIRAC_FIELD_VIEW_SET.has(value)
}

/** Return true when a value is a supported Dirac potential type. */
export function isDiracPotentialType(value: unknown): value is DiracPotentialType {
  return typeof value === 'string' && DIRAC_POTENTIAL_TYPE_SET.has(value)
}

// ============================================================================
// Dirac Config
// ============================================================================

/**
 * Configuration for the Dirac equation solver.
 *
 * The Dirac equation operates on multi-component spinors — S = 2^(⌊(N+1)/2⌋)
 * components in N spatial dimensions. Uses split-operator method with
 * matrix exponentials exploiting the Clifford algebra identity H² = E²·I.
 */
export interface DiracConfig extends PmlAbsorberConfig {
  // === Lattice ===
  /** Spatial dimensionality (1-11, synced from global dimension).
   *  S = 2^(⌊(N+1)/2⌋) spinor components are allocated. */
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
  /** Color for upper-spinor particle component [r, g, b] 0-1 */
  particleColor: [number, number, number]
  /** Color for lower-spinor antiparticle component [r, g, b] 0-1 */
  antiparticleColor: [number, number, number]
  /** Auto-scale density normalization */
  autoScale: boolean
  /** Show potential V(x) as a faint overlay in the 3D volume */
  showPotential: boolean

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
  packetCenter: [-1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  packetWidth: 0.5,
  packetMomentum: [5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  spinDirection: [0, 0],
  positiveEnergyFraction: 1.0,
  fieldView: 'totalDensity',
  particleColor: [0.2, 0.6, 1.0],
  antiparticleColor: [1.0, 0.3, 0.2],
  autoScale: false,
  showPotential: false,
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  needsReset: true,
  // Empty by convention: the store's dimension setter builds this as
  // `Array.from({ length: max(0, latticeDim - 3) })`, so for the default
  // `latticeDim: 3` the correct starting length is 0. Previously seeded
  // with 12 entries, which mismatched the setter convention AND would
  // overflow the 12-slot `array<f32, 12>` slicePositions uniform region
  // when fed to `writeDiracUniforms` — the guard is now enforced by
  // `MAX_SLICE_POSITIONS_WRITE_COUNT` in the writer, but keeping the
  // default consistent prevents surprise on the next `diracSetters`
  // dimension-change call.
  slicePositions: [],
}
