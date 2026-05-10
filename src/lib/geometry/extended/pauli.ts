/**
 * Zeeman-Pauli spinor equation type definitions.
 *
 * Config interface, field/potential/initial-condition types, and default constants
 * for the non-relativistic 2-component spinor solver. This mode models a
 * spinor with scalar kinetic energy and Zeeman coupling only; it does not
 * include gauge-covariant orbital magnetic coupling `(p - qA)^2`.
 */

import type { PmlAbsorberConfig } from './crossMode'

// ============================================================================
// Pauli Types
// ============================================================================

/**
 * Magnetic field configuration type for the Zeeman-Pauli approximation.
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
 * - spinHelicity: Magnitude of local spin-texture helicity |S · curl(S)|
 * - berryCurvature: Magnitude of Berry two-form 0.5*S·(∂iS×∂jS)
 */
export type PauliFieldView =
  | 'spinDensity'
  | 'totalDensity'
  | 'spinExpectation'
  | 'coherence'
  | 'spinHelicity'
  | 'berryCurvature'

/**
 * Initial wavepacket type for the Pauli spinor
 * - gaussianSpinUp: Gaussian packet with pure spin-up
 * - gaussianSpinDown: Gaussian packet with pure spin-down
 * - gaussianSuperposition: Gaussian packet with equal spin-up/down superposition
 * - planeWaveSpinor: Plane wave with specified spin polarization
 */
export type PauliInitialCondition =
  | 'gaussianSpinUp'
  | 'gaussianSpinDown'
  | 'gaussianSuperposition'
  | 'planeWaveSpinor'

/**
 * Scalar potential types available in Pauli mode.
 * Reuses the same spatial potential shapes as TDSE.
 */
export type PauliPotentialType = 'none' | 'harmonicTrap' | 'barrier' | 'doubleWell'

// ============================================================================
// Pauli Config
// ============================================================================

/**
 * Configuration for the Zeeman-Pauli spinor equation.
 * Non-relativistic 2-component spinor in an external effective magnetic field.
 *
 * iℏ ∂ψ/∂t = [p²/(2m) + V(x) + σ·B_eff(x)] ψ
 *
 * Scope: spin precession / Stern-Gerlach / Rabi-style Zeeman dynamics.
 * Out of scope until a vector-potential path is added: charged-particle
 * orbital magnetic effects such as cyclotron motion, Landau levels, and
 * gauge equivalence under A -> A + ∇χ.
 *
 * The spinor is always 2-component regardless of spatial dimension.
 * Magnetic coupling acts on the first 3 spatial dimensions.
 */
export interface PauliConfig extends PmlAbsorberConfig {
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
 * 3D Gaussian wavepacket in a gradient magnetic field (Stern-Gerlach setup):
 * the field gradient along z splits spin-up and spin-down components spatially,
 * producing visible two-lobe structure from the initial equal superposition.
 */
export const DEFAULT_PAULI_CONFIG: PauliConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  dt: 0.005,
  stepsPerFrame: 4,
  hbar: 1.0,
  mass: 1.0,

  fieldType: 'gradient',
  fieldStrength: 2.0,
  fieldDirection: [0, 0],
  gradientStrength: 3.0,
  rotatingFrequency: 1.0,

  initialSpinDirection: [Math.PI / 2, 0],

  initialCondition: 'gaussianSuperposition',
  packetCenter: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  packetWidth: 0.8,
  packetMomentum: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  potentialType: 'none',
  harmonicOmega: 1.0,
  wellDepth: 5.0,
  wellWidth: 1.0,
  showPotential: false,

  fieldView: 'spinDensity',
  spinUpColor: [0.0, 0.8, 1.0],
  spinDownColor: [1.0, 0.2, 0.8],
  autoScale: false,

  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,

  diagnosticsEnabled: true,
  diagnosticsInterval: 5,

  sliceAnimationEnabled: false,
  sliceSpeed: 0.02,
  sliceAmplitude: 0.3,

  needsReset: true,
  // 0-indexed for extra dims (positions[0] drives dim 3). Sized dynamically
  // by initializePauliForDimension to `max(0, latticeDim - 3)` — empty at the
  // default 3D config so there are no unused slots leaking into the uniform.
  slicePositions: [],
}
