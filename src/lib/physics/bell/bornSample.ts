/**
 * Born-rule outcome sampler for joint two-qubit measurements.
 *
 * Given the four joint probabilities P(+,+), P(+,−), P(−,+), P(−,−)
 * (computed once per (ρ, a, b) by {@link jointOutcomeProbabilities}), draws
 * one of the four outcomes proportional to its probability using a
 * deterministic PCG-32 source. Negative probabilities arising from
 * round-off are clamped to zero before sampling.
 *
 * Throughput: the inner loop is a 4-entry CDF scan with a single
 * floating-point draw — about 10⁸ trials/sec on a modern desktop CPU even
 * without GPU acceleration.
 *
 * @module lib/physics/bell/bornSample
 */

import type { PCG32 } from './pcg32'
import type { JointOutcome, JointProbabilities } from './types'

/**
 * Sample a (Alice, Bob) outcome pair from the joint distribution.
 *
 * The four probabilities are interpreted as a piecewise-constant CDF in
 * the order {(+,+), (+,−), (−,+), (−,−)}. A single uniform draw u ∈ [0,1)
 * picks the corresponding bin. If the four probabilities sum to less than
 * 1 (e.g. after round-off), the residual mass is assigned to the last bin
 * to keep the sampler total-mass-preserving.
 *
 * @param probs - Joint outcome probabilities.
 * @param rng - PCG-32 generator (consumed: one float draw per call).
 * @returns Outcome pair where each element is +1 or −1 (never null —
 *   non-detection is handled separately in {@link loopholes}).
 */
export function sampleJointOutcome(probs: JointProbabilities, rng: PCG32): JointOutcome {
  const p1 = Math.max(0, probs.pPP)
  const p2 = Math.max(0, probs.pPM)
  const p3 = Math.max(0, probs.pMP)
  // p4 is implicit: 1 − (p1+p2+p3). Sampling on [0,1) keeps the partition exact.

  const u = rng.nextFloat()
  if (u < p1) return [+1, +1]
  if (u < p1 + p2) return [+1, -1]
  if (u < p1 + p2 + p3) return [-1, +1]
  return [-1, -1]
}

/**
 * Sample N joint outcomes for the same (ρ, a, b). Convenience wrapper that
 * avoids reallocating the JointProbabilities object inside hot loops.
 *
 * @param probs - Joint outcome probabilities (treated as immutable).
 * @param rng - PCG-32 generator.
 * @param n - Number of trials.
 * @param out - Optional pre-allocated Int8Array of length 2·n to fill with
 *   the outcome pairs (out[2k] = Alice, out[2k+1] = Bob). If omitted, a
 *   fresh array is allocated.
 * @returns The filled outcome buffer.
 */
export function sampleJointOutcomesBatch(
  probs: JointProbabilities,
  rng: PCG32,
  n: number,
  out?: Int8Array
): Int8Array {
  const buf = out ?? new Int8Array(n * 2)
  const p1 = Math.max(0, probs.pPP)
  const p2 = p1 + Math.max(0, probs.pPM)
  const p3 = p2 + Math.max(0, probs.pMP)
  for (let k = 0; k < n; k++) {
    const u = rng.nextFloat()
    const base = k * 2
    if (u < p1) {
      buf[base] = +1
      buf[base + 1] = +1
    } else if (u < p2) {
      buf[base] = +1
      buf[base + 1] = -1
    } else if (u < p3) {
      buf[base] = -1
      buf[base + 1] = +1
    } else {
      buf[base] = -1
      buf[base + 1] = -1
    }
  }
  return buf
}
