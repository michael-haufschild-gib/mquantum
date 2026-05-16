/**
 * Closed-form analytical curves for the Bell-experiment overlay.
 *
 * These functions provide the "expected behaviour" curves drawn next to
 * the Monte Carlo running estimate so the audience can compare measured
 * to predicted. None of the formulas here perform sampling — they are
 * exact expressions for the textbook quantities.
 *
 * References:
 *  - Bell, J. S. (1964), "On the Einstein-Podolsky-Rosen paradox."
 *  - Tsirelson, B. S. (1980), "Quantum generalizations of Bell's
 *    inequality." Lett. Math. Phys. 4, 93–100.
 *  - Werner, R. F. (1989), Phys. Rev. A 40, 4277.
 *
 * @module lib/physics/bell/analytic
 */

import { CLASSICAL_BOUND, TSIRELSON_BOUND } from './chsh'
import { EBERHARD_THRESHOLD } from './loopholes'

export { CLASSICAL_BOUND, TSIRELSON_BOUND }
export { EBERHARD_THRESHOLD }

/**
 * Singlet two-qubit correlation as a function of the angle between
 * measurement axes:
 *
 *   E_QM(θ) = ⟨Ψ⁻| σ_a ⊗ σ_b |Ψ⁻⟩ = −a · b = −cos θ.
 *
 * @param thetaBetween - Angle in radians between Alice's and Bob's axes.
 * @returns The QM-predicted correlation, in [−1, 1].
 */
export function singletCorrelation(thetaBetween: number): number {
  return -Math.cos(thetaBetween)
}

/**
 * Werner-state two-qubit correlation: a noisy singlet with visibility v.
 *
 *   E(θ; v) = −v · cos θ.
 *
 * @param thetaBetween - Angle between axes (radians).
 * @param visibility - Werner mixing parameter v ∈ [0, 1].
 * @returns The noisy-singlet correlation in [−1, 1].
 */
export function wernerCorrelation(thetaBetween: number, visibility: number): number {
  return visibility * singletCorrelation(thetaBetween)
}

/**
 * Maximum |S| achievable by the singlet at the canonical CHSH angles for a
 * Werner state with visibility v: 2√2 · v.
 *
 * The visibility threshold for CHSH violation is v > 1/√2 ≈ 0.7071; below
 * that, the state admits a local-hidden-variable model.
 *
 * @param visibility - Werner v ∈ [0, 1].
 * @returns Maximum |S|.
 */
export function maxChshForWerner(visibility: number): number {
  return clampUnit(visibility) * TSIRELSON_BOUND
}

/** Visibility threshold below which Werner state cannot violate CHSH. */
export const WERNER_VIOLATION_THRESHOLD = Math.SQRT1_2 // 1/√2 ≈ 0.7071

/**
 * The classic four CHSH measurement angles (Alice: 0, π/2; Bob: π/4, 3π/4),
 * given here as readable constants. The signed S returned by the
 * estimator at these angles for the singlet is −2√2, so |S| = 2√2.
 *
 * Axes lie in the xy-plane (θ = π/2 in spherical) so `phi` alone selects
 * each axis via {@link projectors.azimuthalVec}.
 */
export const CANONICAL_CHSH_PHI = Object.freeze({
  /** Alice unprimed: φ = 0. */
  a: 0,
  /** Alice primed: φ = π/2. */
  aPrime: Math.PI / 2,
  /** Bob unprimed: φ = π/4. */
  b: Math.PI / 4,
  /** Bob primed: φ = 3π/4. */
  bPrime: (3 * Math.PI) / 4,
})

function clampUnit(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x
}
