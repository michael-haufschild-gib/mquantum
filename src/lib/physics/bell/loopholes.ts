/**
 * Detection efficiency and the Eberhard bound.
 *
 * A real Bell test is constrained by detection efficiency η ∈ [0, 1]: a
 * fraction (1 − η) of would-be detection events at each detector are
 * lost. If the experimenter then conditions ("post-selects") on
 * coincidence pairs in which both detectors fired — the fair-sampling
 * assumption — the apparent correlations can exceed the classical bound
 * even when the underlying physics is local. Closing this loophole
 * requires either η above a threshold or analysis that does not condition
 * on detection.
 *
 * Eberhard's result (Eberhard, 1993): for symmetric detection efficiency
 * η, the maximum CHSH-style inequality violation in QM survives
 * post-selection on coincidence only when
 *
 *   η ≥ 2 / (1 + √2) ≈ 0.8284.
 *
 * Below that, no quantum state — including the optimal non-maximally
 * entangled state — can produce a true violation. The Eberhard threshold
 * is part of why the loophole-free Bell tests (Hensen 2015, Giustina
 * 2015, Shalm 2015) were such a milestone — they finally cleared 0.83.
 *
 * @module lib/physics/bell/loopholes
 */

import type { PCG32 } from './pcg32'
import type { JointOutcome, Outcome } from './types'

/**
 * Symmetric Eberhard threshold for detection efficiency η at which CHSH
 * violation becomes impossible under the fair-sampling assumption.
 *
 * η_E = 2/(1+√2) ≈ 0.8284 for symmetric efficiencies and the maximally
 * entangled state. The asymmetric / non-maximally-entangled bound is
 * lower (~0.6667) but harder to teach with one number; we use the
 * symmetric value as the simulator's "watch this line" landmark.
 */
export const EBERHARD_THRESHOLD = 2 / (1 + Math.SQRT2)

/** Configuration for applying detection-loss to outcomes. */
export interface DetectionConfig {
  /** Alice's detection efficiency η_A ∈ [0, 1]. */
  etaA: number
  /** Bob's detection efficiency η_B ∈ [0, 1]. */
  etaB: number
}

/**
 * Apply Bernoulli detection losses independently to Alice and Bob.
 *
 * @param outcome - The pre-detection outcome pair.
 * @param config - Per-party detection efficiencies.
 * @param rng - PCG-32 generator. Always consumes exactly two floats per
 *   call, regardless of the outcome — keeps the PRNG stream deterministic
 *   independent of η.
 * @returns Outcome pair with `null` in any slot whose detector "missed".
 */
export function applyDetectionEfficiency(
  outcome: JointOutcome,
  config: DetectionConfig,
  rng: PCG32
): JointOutcome {
  const aLost = rng.nextFloat() >= clampUnit(config.etaA)
  const bLost = rng.nextFloat() >= clampUnit(config.etaB)
  return [aLost ? null : outcome[0], bLost ? null : outcome[1]]
}

/**
 * Classify an outcome pair into one of four post-selection regimes.
 */
export interface OutcomeClassification {
  /** Both detectors fired (the pair contributes to fair-sampling analysis). */
  coincidence: boolean
  /** At least one detector missed (the pair is invisible under fair-sampling). */
  anyLoss: boolean
  /** Both detectors missed (the pair is invisible under any analysis). */
  doubleLoss: boolean
}

/**
 * Inspect a (post-detection) outcome pair.
 *
 * @param outcome - Outcome pair with `null`s for missed detections.
 * @returns Classification flags.
 */
export function classifyOutcome(outcome: JointOutcome): OutcomeClassification {
  const aOk = outcome[0] !== null
  const bOk = outcome[1] !== null
  return {
    coincidence: aOk && bOk,
    anyLoss: !aOk || !bOk,
    doubleLoss: !aOk && !bOk,
  }
}

/**
 * Whether an outcome pair survives the chosen analysis policy.
 *
 * Two modes:
 *  - "fairSampling" — keep only coincidences (both detectors fired).
 *    This is the standard analysis in efficiency-limited experiments.
 *  - "assignNonDetection" — assign +1 to any missed detection and keep
 *    every trial. This is Clauser-Horne-style analysis and produces a
 *    valid Bell inequality without the fair-sampling loophole.
 *
 * @param outcome - Outcome pair.
 * @param mode - Analysis policy.
 * @returns Outcome pair with both elements ±1, or `null` if the trial is
 *   discarded under the chosen policy.
 */
export function postSelectOutcome(
  outcome: JointOutcome,
  mode: 'fairSampling' | 'assignNonDetection'
): readonly [1 | -1, 1 | -1] | null {
  if (mode === 'fairSampling') {
    if (outcome[0] === null || outcome[1] === null) return null
    return [outcome[0], outcome[1]]
  }
  // assignNonDetection: replace nulls with +1 (any deterministic choice works;
  // +1 matches the common convention in the literature).
  const a: 1 | -1 = (outcome[0] ?? 1) as 1 | -1
  const b: 1 | -1 = (outcome[1] ?? 1) as 1 | -1
  return [a, b]
}

/**
 * Closed-form upper bound on the conditional |S| achievable under
 * fair-sampling post-selection with symmetric detection efficiency η,
 * for the singlet at the canonical CHSH angles.
 *
 * Under fair-sampling the post-selected joint probabilities equal the
 * underlying conditional probabilities (i.i.d. detection loss factors
 * cancel), so for any η > 0 the conditional |S| can reach the Tsirelson
 * value 2√2. The loophole is *interpretational* (an LHV with detection
 * conspiracy could mimic the same correlations under post-selection),
 * not a reduction of the QM ceiling. At η = 0 no coincidences exist and
 * |S| is undefined; we return 0 so the UI's "loophole budget" reads as
 * "no signal" rather than "max violation".
 *
 * @param eta - Detection efficiency (symmetric).
 * @returns Conservative upper bound on the post-selected |S|.
 */
export function maxChshUnderFairSampling(eta: number): number {
  const x = clampUnit(eta)
  return x > 0 ? 2 * Math.SQRT2 : 0
}

/**
 * Closed-form upper bound on |S| achievable under Clauser-Horne
 * (`assignNonDetection`) analysis with symmetric detection efficiency
 * η, for the singlet at the canonical CHSH angles.
 *
 * Non-detections are assigned +1, which mixes the underlying
 * correlations with a constant +1 background, giving
 *
 *   S(η) = η²·2√2 + 2·(1 − η)².
 *
 * This crosses the classical bound exactly at η = η_E = 2/(1+√2), the
 * Eberhard threshold, and reaches 2√2 only in the limit η = 1. It is
 * non-monotone: the ceiling drops from 2 (η = 0, all-`+1` baseline)
 * to ≈ 1.17 at η = √2 − 1 ≈ 0.414, then rises through 2 at η_E up to
 * 2√2 at η = 1.
 *
 * @param eta - Detection efficiency (symmetric).
 * @returns Upper bound on |S| under assign-non-detection analysis.
 */
export function maxChshUnderAssignNonDetection(eta: number): number {
  const x = clampUnit(eta)
  return x * x * 2 * Math.SQRT2 + 2 * (1 - x) * (1 - x)
}

/**
 * Dispatch helper: returns the η-dependent |S| ceiling appropriate for
 * the active analysis policy. Used by the loophole-budget UI so the
 * displayed ceiling tracks the user's analysisMode toggle.
 *
 * @param eta - Detection efficiency (symmetric).
 * @param mode - Active analysis policy.
 * @returns Upper bound on |S| under the given analysis.
 */
export function maxChshGivenEta(eta: number, mode: 'fairSampling' | 'assignNonDetection'): number {
  return mode === 'fairSampling'
    ? maxChshUnderFairSampling(eta)
    : maxChshUnderAssignNonDetection(eta)
}

function clampUnit(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x
}

/** Convenience: detect whether either slot in an outcome pair is `null`. */
export function hasNonDetection(outcome: JointOutcome): boolean {
  return outcome[0] === null || outcome[1] === null
}

/** Convenience: total non-detection count for a pre-filled detection-side outcome buffer. */
export function countNonDetections(outcomes: readonly Outcome[]): number {
  let n = 0
  for (const o of outcomes) if (o === null) n++
  return n
}
