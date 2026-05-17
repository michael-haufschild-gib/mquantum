/**
 * Local-hidden-variable (LHV) baselines.
 *
 * The Bell theorem asserts |S| ≤ 2 for **any** local hidden-variable
 * model, which is more general than any specific algorithm. To make that
 * abstract claim concrete and audience-visible, this module ships three
 * canonical LHV implementations sharing the same sampling interface as
 * the quantum-mechanical sampler. Plotting their S(N) curves next to the
 * QM curve shows the bound is a real envelope, not a fluke of one model.
 *
 * All three strategies respect locality: Alice's outcome depends only on
 * her measurement axis a and a shared hidden variable λ; Bob's depends
 * only on b and λ. λ is drawn fresh per trial. None of the three uses
 * communication between Alice's and Bob's outputs.
 *
 * 1. {@link lhvDeterministicBell} — Bell's deterministic example. λ is a
 *    uniform random unit vector; A(a, λ) = sign(a · λ);
 *    B(b, λ) = −sign(b · λ). Yields ⟨A·B⟩ = 1 − 2·θ/π for angle θ between
 *    a and b — close to QM in shape but never violates CHSH.
 *
 * 2. {@link lhvCos2Probabilistic} — Probabilistic noisy-classical. λ is a
 *    uniform random unit vector; A and B independently output ±1 with
 *    probabilities biased by |a · λ| and |b · λ|. Stays well below 2.
 *
 * 3. {@link lhvDetectionLoophole} — Detection-loophole exploit. Same as
 *    deterministic Bell, but if |a · λ| < cosine of a threshold angle,
 *    Alice records "no detection" (and Bob symmetrically). With
 *    fair-sampling postselection and η < 2/(1+√2) ≈ 0.828 (Eberhard),
 *    the postselected ensemble can mimic quantum violation despite each
 *    output being locally generated. Provides the central physics
 *    teaching point for why detection efficiency matters.
 *
 * Each strategy exposes `name`, `description`, and `sampleOutcome` so the
 * UI can render them in a dropdown and so the trial loop can swap them
 * interchangeably with the quantum sampler.
 *
 * @module lib/physics/bell/lhv
 */

import type { PCG32 } from './pcg32'
import type { JointOutcome, Vec3 } from './types'

/** A local-hidden-variable strategy that maps a setting pair to ±1 outcomes. */
export interface LhvStrategy {
  /** Stable identifier used in URL/preset serialization. */
  readonly id: string
  /** Display name shown in the UI dropdown. */
  readonly name: string
  /** One-sentence description shown in a tooltip. */
  readonly description: string
  /**
   * Draw one (Alice, Bob) outcome pair.
   *
   * @param a - Alice's measurement axis (unit vector).
   * @param b - Bob's measurement axis (unit vector).
   * @param rng - PCG-32 generator. The strategy consumes as many draws as
   *   it needs internally.
   * @returns Outcome pair; either element may be `null` to signal
   *   non-detection (only used by the detection-loophole strategy).
   */
  sampleOutcome(a: Vec3, b: Vec3, rng: PCG32): JointOutcome
}

/** Draw a uniform unit 3-vector via the spherical Box-Muller-like method. */
function sampleUnitVec3(rng: PCG32): Vec3 {
  // Marsaglia (1972): pick z ∈ [−1, 1] uniformly, then φ ∈ [0, 2π).
  // The resulting (cos φ √(1−z²), sin φ √(1−z²), z) is uniformly distributed
  // on S². No rejection step needed — fixed PRNG consumption per call.
  const z = rng.nextFloat() * 2 - 1
  const phi = rng.nextFloat() * 2 * Math.PI
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return [r * Math.cos(phi), r * Math.sin(phi), z]
}

/** Dot product of two 3-vectors. */
function dot3(u: Vec3, v: Vec3): number {
  return (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0)
}

/** Sign with a deterministic tie-break to +1 (zero-set has measure zero). */
function signPlusBias(x: number): 1 | -1 {
  return x >= 0 ? 1 : -1
}

/**
 * Bell's deterministic local-hidden-variable model.
 *
 * A(a, λ) = sign(a · λ); B(b, λ) = −sign(b · λ). The negative sign
 * matches the singlet's anti-correlation: when a = b, ⟨A·B⟩ = −1
 * exactly. Maximum |S| over all angle choices is 2 (the classical
 * bound), so this strategy can never violate CHSH.
 */
export const lhvDeterministicBell: LhvStrategy = {
  id: 'deterministicBell',
  name: 'Bell deterministic',
  description:
    'Local hidden-variable model: shared random unit vector λ; A = sign(a·λ), B = −sign(b·λ). Max |S| = 2.',
  sampleOutcome(a: Vec3, b: Vec3, rng: PCG32): JointOutcome {
    const lambda = sampleUnitVec3(rng)
    return [signPlusBias(dot3(a, lambda)), -signPlusBias(dot3(b, lambda)) as 1 | -1]
  },
}

/**
 * Probabilistic noisy-classical strategy.
 *
 * Each party independently outputs ±1 with probabilities
 *   P(A = +1 | a, λ) = ½ (1 + a · λ · sign(λ_z + ε))
 * where ε is a tiny tie-breaker. This is a "soft" version of the
 * deterministic Bell strategy; the marginals are unbiased but the joint
 * correlation is weaker than the deterministic model — its CHSH ceiling
 * is below 2 as well, but with a more linear angle dependence.
 *
 * @remarks
 * Concretely: draw λ ~ Uniform(S²); compute u_A = a·λ ∈ [−1, 1]; output
 * A = +1 with probability (1 + u_A)/2 and −1 otherwise; symmetrically
 * for Bob but with u_B = −b·λ to match the singlet's anti-correlation.
 */
export const lhvCos2Probabilistic: LhvStrategy = {
  id: 'noisyClassical',
  name: 'Noisy classical',
  description:
    'Probabilistic LHV: shared λ; each party outputs ±1 with probabilities biased by the projection along their axis. Linear angle dependence; |S| < 2.',
  sampleOutcome(a: Vec3, b: Vec3, rng: PCG32): JointOutcome {
    const lambda = sampleUnitVec3(rng)
    const uA = dot3(a, lambda)
    const uB = -dot3(b, lambda)
    const A = rng.nextFloat() < 0.5 * (1 + uA) ? 1 : -1
    const B = rng.nextFloat() < 0.5 * (1 + uB) ? 1 : -1
    return [A as 1 | -1, B as 1 | -1]
  },
}

/**
 * Detection-loophole exploit configuration.
 *
 * The exploit suppresses outcomes when the local projection |a · λ| is
 * below a threshold; if the experimenter then post-selects on detected
 * pairs (fair-sampling assumption), the conditional correlation can
 * exceed the classical bound — illustrating why honest Bell tests need
 * detection efficiency η > 2/(1+√2) ≈ 0.828.
 */
export interface DetectionLoopholeOptions {
  /**
   * Cutoff in units of |a · λ| ∈ [0, 1]. Outcomes with |a · λ| below this
   * are reported as non-detections. Default 0.5 gives a strong but not
   * trivial loophole exploit.
   */
  projectionCutoff: number
}

/**
 * Build a detection-loophole LHV strategy with a configurable suppression
 * threshold.
 *
 * @param opts - Suppression threshold options.
 * @returns LHV strategy that emits `null` outcomes when below threshold.
 */
export function makeDetectionLoopholeLhv(
  opts: DetectionLoopholeOptions = { projectionCutoff: 0.5 }
): LhvStrategy {
  const cutoff = Math.max(0, Math.min(1, opts.projectionCutoff))
  return {
    id: `detectionLoophole_${cutoff.toFixed(3)}`,
    name: 'Detection loophole',
    description: `LHV with detection suppression: outcomes with |axis·λ| < ${cutoff.toFixed(2)} are dropped. Post-selecting on detected pairs can fake CHSH violation.`,
    sampleOutcome(a: Vec3, b: Vec3, rng: PCG32): JointOutcome {
      const lambda = sampleUnitVec3(rng)
      const uA = dot3(a, lambda)
      const uB = dot3(b, lambda)
      const A: 1 | -1 | null = Math.abs(uA) < cutoff ? null : signPlusBias(uA)
      const B: 1 | -1 | null = Math.abs(uB) < cutoff ? null : (-signPlusBias(uB) as 1 | -1)
      return [A, B]
    },
  }
}

/** Registry of all built-in LHV strategies, exposed for UI enumeration. */
export const LHV_STRATEGIES: readonly LhvStrategy[] = Object.freeze([
  lhvDeterministicBell,
  lhvCos2Probabilistic,
  makeDetectionLoopholeLhv(),
])
