/**
 * BEC (Bose-Einstein Condensate / Gross-Pitaevskii) type definitions.
 *
 * Config interface, initial-condition/field-view types, and default constants.
 */

// ============================================================================
// BEC Types
// ============================================================================

/**
 * BEC initial condition type.
 * - thomasFermi: Ground state in Thomas-Fermi approximation (inverted parabola)
 * - gaussianPacket: Standard Gaussian (same as TDSE)
 * - vortexImprint: Thomas-Fermi with a phase-imprinted vortex at center
 * - vortexLattice: Thomas-Fermi with an array of imprinted vortices
 * - darkSoliton: Thomas-Fermi with a density dip (phase step) along axis 0
 * - vortexReconnection: Two vortices in configurable N-D planes for reconnection studies (D≥4)
 */
export type BecInitialCondition =
  | 'thomasFermi'
  | 'gaussianPacket'
  | 'vortexImprint'
  | 'vortexLattice'
  | 'darkSoliton'
  | 'vortexReconnection'

/**
 * BEC field view type.
 * - density: |ψ|²
 * - phase: arg(ψ)
 * - current: Probability current j = Im(ψ* ∇ψ) / m
 * - potential: External potential V(x) (trap shape)
 * - superfluidVelocity: v_s = (ℏ/m) ∇arg(ψ), shows vortex flow
 * - healingLength: local ξ(x) = ℏ/√(2m·g·|ψ|²)
 */
export type BecFieldView =
  | 'density'
  | 'phase'
  | 'current'
  | 'potential'
  | 'superfluidVelocity'
  | 'healingLength'

// ============================================================================
// BEC Config
// ============================================================================

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

  // === N-D Vortex Reconnection (when initialCondition === 'vortexReconnection') ===
  /** First vortex winding plane axes [axisA, axisB] (0-indexed, must be < latticeDim) */
  vortexPlane1: [number, number]
  /** Second vortex winding plane axes [axisA, axisB] (0-indexed, must be < latticeDim) */
  vortexPlane2: [number, number]
  /** Spatial separation between vortex cores (lattice units, 0 = coincident) */
  vortexSeparation: number
  /** Number of vortices: 1 = single configurable-plane vortex, 2 = reconnection pair */
  vortexPairCount: number

  // === Kaluza-Klein Compactification ===
  /** Per-dimension flag: true = compact (periodic with radius R), false = extended */
  compactDims: boolean[]
  /** Per-dimension compactification radius R (L = 2πR). Only used when compactDims[d] = true */
  compactRadii: number[]

  // === Display ===
  fieldView: BecFieldView
  /** Auto-scale density normalization */
  autoScale: boolean

  // === Absorber (PML) ===
  absorberEnabled: boolean
  absorberWidth: number
  /** Target round-trip reflection coefficient for PML */
  pmlTargetReflection: number

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number
  /** Enable observable expectation value computation (⟨x⟩, ⟨p⟩, ΔxΔp) */
  observablesEnabled: boolean

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
  vortexPlane1: [0, 1],
  vortexPlane2: [2, 3],
  vortexSeparation: 0.5,
  vortexPairCount: 2,
  compactDims: [false, false, false],
  compactRadii: [0.15, 0.15, 0.15],
  fieldView: 'density',
  autoScale: true,
  absorberEnabled: false,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  observablesEnabled: false,
  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
