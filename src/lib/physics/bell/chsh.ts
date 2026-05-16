/**
 * CHSH (Clauser-Horne-Shimony-Holt) inequality estimator.
 *
 * Given the four CHSH measurement-setting combinations (a, b), (a, b'),
 * (a', b), (a', b'), this class accumulates per-combination correlation
 * estimates E(a_i, b_j) = ⟨A·B⟩ and forms
 *
 *   S = E(a, b) − E(a, b') + E(a', b) + E(a', b').
 *
 * The local-hidden-variable bound is |S| ≤ 2. Quantum mechanics with a
 * maximally entangled state reaches up to |S| = 2√2 ≈ 2.828 (Tsirelson
 * bound). Werner state at visibility v reaches |S| up to 2√2 · v, which
 * is below 2 (no violation possible) for v ≤ 1/√2.
 *
 * Confidence interval: each E_ij is a sample mean of ±1-valued outcomes,
 * so its variance bound is (1 − E_ij²)/n_ij. S is a linear combination of
 * four sample means, with all coefficients ±1, so the variance bound is
 * Σ_ij (1 − E_ij²)/n_ij. The default CI half-width uses z = 1.96 for a
 * 95 % two-sided confidence band.
 *
 * @module lib/physics/bell/chsh
 */

import type { SettingIndex } from './types'

/** Default normal-distribution z-score for a 95 % two-sided confidence interval. */
export const Z_95 = 1.959963984540054

/** Tsirelson bound — the largest |S| achievable in quantum mechanics with any
 *  two-qubit state and any projective measurements. */
export const TSIRELSON_BOUND = 2 * Math.SQRT2

/** Classical bound — the largest |S| achievable by any local-hidden-variable
 *  theory (Bell, 1964; CHSH, 1969). */
export const CLASSICAL_BOUND = 2

/**
 * Sample mean and count for a single CHSH bin.
 */
export interface BinStats {
  /** Number of trials accumulated in this bin. */
  count: number
  /** Sample-mean correlation E for this bin (NaN when count = 0). */
  mean: number
}

/** Snapshot of the four per-bin correlations indexed (settingA, settingB) ∈ {0,1}². */
export interface CorrelationSnapshot {
  /** E(a, b) — both unprimed. */
  E_ab: BinStats
  /** E(a, b') — Alice unprimed, Bob primed. */
  E_abp: BinStats
  /** E(a', b) — Alice primed, Bob unprimed. */
  E_apb: BinStats
  /** E(a', b') — both primed. */
  E_apbp: BinStats
}

/** Confidence interval on a sample statistic. */
export interface ConfidenceInterval {
  /** Lower bound. */
  lo: number
  /** Upper bound. */
  hi: number
  /** Half-width (hi − lo) / 2. */
  halfWidth: number
}

/**
 * Online running estimator for the CHSH quantity S.
 *
 * Internally maintains four (sum-of-products, count) running totals and
 * computes E_ij and S on demand. Outcome inputs are restricted to ±1 by
 * the type system; non-detection trials are filtered out before recording
 * (see `loopholes.ts`).
 */
export class ChshAccumulator {
  private readonly sums = new Float64Array(4)
  private readonly counts = new Uint32Array(4)

  /**
   * Record one trial.
   *
   * @param settingA - Alice's setting index (0 = a, 1 = a').
   * @param settingB - Bob's setting index (0 = b, 1 = b').
   * @param outcomeA - Alice's outcome (+1 or −1).
   * @param outcomeB - Bob's outcome (+1 or −1).
   */
  recordTrial(
    settingA: SettingIndex,
    settingB: SettingIndex,
    outcomeA: 1 | -1,
    outcomeB: 1 | -1
  ): void {
    const idx = settingA * 2 + settingB
    this.sums[idx] = (this.sums[idx] ?? 0) + outcomeA * outcomeB
    this.counts[idx] = (this.counts[idx] ?? 0) + 1
  }

  /**
   * Bulk-record a batch of trials with the same (settingA, settingB).
   * Useful when the simulation pre-batches trials per-setting (4-bin
   * round-robin) for cache and PRNG-call efficiency.
   *
   * @param settingA - Alice's setting index.
   * @param settingB - Bob's setting index.
   * @param outcomes - Int8Array of pairs `[A0, B0, A1, B1, ...]`. Length
   *   must be even.
   */
  recordBatch(settingA: SettingIndex, settingB: SettingIndex, outcomes: Int8Array): void {
    const idx = settingA * 2 + settingB
    const half = outcomes.length >>> 1
    let sum = 0
    for (let k = 0; k < half; k++) {
      sum += (outcomes[2 * k] ?? 0) * (outcomes[2 * k + 1] ?? 0)
    }
    this.sums[idx] = (this.sums[idx] ?? 0) + sum
    this.counts[idx] = (this.counts[idx] ?? 0) + half
  }

  /** Total number of trials across all four bins. */
  get totalCount(): number {
    return (
      (this.counts[0] ?? 0) + (this.counts[1] ?? 0) + (this.counts[2] ?? 0) + (this.counts[3] ?? 0)
    )
  }

  /**
   * Current four-bin correlation snapshot.
   *
   * @returns Snapshot with each bin's count and sample-mean correlation
   *   (NaN where count = 0).
   */
  getCorrelations(): CorrelationSnapshot {
    const bin = (idx: number): BinStats => {
      const count = this.counts[idx] ?? 0
      const sum = this.sums[idx] ?? 0
      return { count, mean: count > 0 ? sum / count : Number.NaN }
    }
    return {
      E_ab: bin(0),
      E_abp: bin(1),
      E_apb: bin(2),
      E_apbp: bin(3),
    }
  }

  /**
   * Current point estimate of S.
   *
   * Returns NaN if any of the four bins has zero count — without samples
   * in a bin, S is undefined.
   *
   * @returns Estimated S, or NaN if any bin is empty.
   */
  getS(): number {
    const c = this.getCorrelations()
    if (c.E_ab.count === 0 || c.E_abp.count === 0 || c.E_apb.count === 0 || c.E_apbp.count === 0) {
      return Number.NaN
    }
    return c.E_ab.mean - c.E_abp.mean + c.E_apb.mean + c.E_apbp.mean
  }

  /**
   * Two-sided confidence interval on S using the conservative Wald
   * approximation under the bound Var(E_ij) ≤ (1 − E_ij²)/n_ij. Treats S
   * as a sum of four uncorrelated bin means with unit coefficients
   * (valid because each trial only contributes to one bin).
   *
   * @param z - z-score of the desired confidence level. Defaults to 1.96
   *   (95 %). Other useful values: Z_99 = 2.5758 (99 %).
   * @returns Confidence interval on S, or NaN-valued interval if any bin
   *   is empty.
   */
  getSConfidenceInterval(z: number = Z_95): ConfidenceInterval {
    const c = this.getCorrelations()
    if (c.E_ab.count === 0 || c.E_abp.count === 0 || c.E_apb.count === 0 || c.E_apbp.count === 0) {
      return { lo: Number.NaN, hi: Number.NaN, halfWidth: Number.NaN }
    }
    const s = c.E_ab.mean - c.E_abp.mean + c.E_apb.mean + c.E_apbp.mean
    const varSum =
      (1 - c.E_ab.mean ** 2) / c.E_ab.count +
      (1 - c.E_abp.mean ** 2) / c.E_abp.count +
      (1 - c.E_apb.mean ** 2) / c.E_apb.count +
      (1 - c.E_apbp.mean ** 2) / c.E_apbp.count
    const halfWidth = z * Math.sqrt(Math.max(varSum, 0))
    return { lo: s - halfWidth, hi: s + halfWidth, halfWidth }
  }

  /** Reset all accumulators to zero. */
  reset(): void {
    this.sums.fill(0)
    this.counts.fill(0)
  }
}
