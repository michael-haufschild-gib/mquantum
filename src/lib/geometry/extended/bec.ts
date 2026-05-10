/**
 * BEC (Bose-Einstein Condensate / Gross-Pitaevskii) type definitions.
 *
 * Config interface, initial-condition/field-view types, and default constants.
 */

import type { DisorderDistribution, PmlAbsorberConfig } from './crossMode'

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
 * - blackHoleAnalog: Waterfall flow profile v_s = v_max·tanh(x/L_h) with density dip,
 *   creates a sonic horizon at |v_s| = c_s — analog black hole (Unruh 1981).
 */
export type BecInitialCondition =
  | 'thomasFermi'
  | 'gaussianPacket'
  | 'vortexImprint'
  | 'vortexLattice'
  | 'darkSoliton'
  | 'vortexReconnection'
  | 'blackHoleAnalog'

/**
 * BEC field view type.
 * - density: |ψ|²
 * - phase: arg(ψ)
 * - current: Probability current j = Im(ψ* ∇ψ) / m
 * - potential: External potential V(x) (trap shape)
 * - superfluidVelocity: v_s = (ℏ/m) ∇arg(ψ), shows vortex flow
 * - healingLength: local ξ(x) = ℏ/√(2m·g·|ψ|²)
 * - machNumber: M = |v_s|/c_s (analog black-hole Mach-number field; horizon at M=1)
 * - hawkingFlux: horizon-local κ/2π proxy gated to M≈1 sonic-horizon voxels
 * - vorticity: Quantized plaquette phase circulation two-form
 */
export type BecFieldView =
  | 'density'
  | 'phase'
  | 'current'
  | 'potential'
  | 'superfluidVelocity'
  | 'healingLength'
  | 'machNumber'
  | 'hawkingFlux'
  | 'vorticity'

// ============================================================================
// BEC Config
// ============================================================================

/**
 * Configuration for the BEC (Gross-Pitaevskii) solver.
 */
export interface BecConfig extends PmlAbsorberConfig {
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

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number
  /** Enable observable expectation value computation (⟨x⟩, ⟨p⟩, ΔxΔp) */
  observablesEnabled: boolean

  // === Disorder overlay (Anderson-style on-site disorder on the trap) ===
  /**
   * On-site disorder strength W (tight-binding units — measured relative
   * to the nearest-neighbor hopping `t_eff = ℏ²/(2m·dx²)`). Added to the
   * trap potential as `V(x) += W · η(x)`. The statistical shape of `η(x)`
   * depends on {@link disorderDistribution}:
   *
   * - `uniform`: `η(x)` is deterministic seeded noise in [−0.5, +0.5].
   * - `gaussian`: `η(x) ~ N(0, 1)` (unbounded standard normal).
   *
   * 0 disables the overlay (fast path in the dispatcher).
   *
   * Scientific context: disordered BEC is the canonical route to the
   * Bose-glass phase (Fisher et al., Phys. Rev. B 40, 546 (1989)) — the
   * combination of repulsive interactions and on-site disorder produces
   * a gapless, compressible, insulating phase distinct from both the
   * superfluid and the Mott insulator. Sweeping `disorderStrength` at
   * fixed `interactionStrength` traces the SF↔BG phase boundary.
   */
  disorderStrength: number
  /** Deterministic PRNG seed for disorder realization reproducibility. */
  disorderSeed: number
  /**
   * Statistical distribution of on-site disorder energies. `uniform` gives
   * `η(x) ∈ [−0.5, +0.5]`; `gaussian` gives `η(x) ~ N(0, 1)` (unbounded).
   */
  disorderDistribution: DisorderDistribution

  // === Analog Hawking (waterfall sonic horizon) ===
  /** Waterfall asymptotic flow speed v_max (supersonic side). */
  hawkingVmax: number
  /** Horizon profile length L_h (smaller → steeper gradient → larger κ). */
  hawkingLh: number
  /** Fractional density dip Δn ∈ [0, 0.6] at the horizon (n(x₀) = n₀(1 − Δn·sech²)). */
  hawkingDeltaN: number
  /** Enable horizon-localized stochastic pair injection (phonon bath seed). */
  hawkingPairInjection: boolean
  /** Injection strength per substep applied as δφ = rate·w·η (w Gaussian in M, η ∈ (-1,1)). */
  hawkingInjectRate: number
  /** Deterministic integer seed for the pair-injection noise. */
  hawkingSeed: number

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
  autoScale: false,
  absorberEnabled: false,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  observablesEnabled: false,
  disorderStrength: 0,
  disorderSeed: 42,
  disorderDistribution: 'uniform',
  // 3.5 (not 2.0): with the canonical interactionStrength g = 500 and mass = 1
  // the simulator's true background density is n0 = max(g·0.01, 1)/g = 0.01,
  // giving asymptotic sound speed c_s0 = √(g·n0/m) = √5 ≈ 2.236. v_max = 2.0
  // sat below c_s0, leaving the user with a no-horizon default that produced
  // a flat Page-curve HUD and silent sliders. v_max = 3.5 matches the
  // "Sonic Horizon (Waterfall)" preset and gives a clean horizon at the
  // default 64³ grid (x_horizon ≈ 0.56, well inside the PML-free interior).
  hawkingVmax: 3.5,
  hawkingLh: 0.6,
  hawkingDeltaN: 0.0,
  hawkingPairInjection: false,
  hawkingInjectRate: 0.05,
  hawkingSeed: 1337,
  needsReset: true,
  // Empty by convention: BEC uses the TDSE pipeline, and TDSE's dimension
  // setter builds `slicePositions` as `Array.from({ length: max(0, latticeDim - 3) })`.
  // For default `latticeDim: 3` this is 0 entries. Seeding with 12 zeros
  // mismatched the setter convention AND would overflow the 12-slot WGSL
  // slicePositions region on the first writeTdseUniforms call (the write
  // loop maps store[i] → f32[88+3+i], so store[9..11] land in the basisX
  // region at f32[100..102]). Enforcement now lives in the uniform writer
  // via `MAX_SLICE_POSITIONS_WRITE_COUNT`, but consistent defaults prevent
  // the transient mismatch on app startup.
  slicePositions: [],
}
