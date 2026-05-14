/**
 * Tests for the modular-Hamiltonian spectrum derivation.
 *
 * Verifies:
 *   - `K_n = −log(s_n² + ε)` on a hand-checked sequence.
 *   - Monotone non-decreasing when `s_n` is sorted descending.
 *   - ε scales with the dominant Schmidt value² (relative floor).
 *   - Rank-threshold finds the first index where s_r² < τ · s_0².
 *   - Empty input returns empty output.
 */

import { describe, expect, it } from 'vitest'

import {
  floorFractionFromModular,
  MODULAR_EPSILON,
  modularSpectrum,
} from '@/lib/physics/srmt/modularHamiltonian'

describe('modularHamiltonian.modularSpectrum', () => {
  it('computes K_n = −log(s_n² + ε) for a short known sequence', () => {
    // s = [1.0, 0.5, 0.1], s² = [1, 0.25, 0.01].
    // ε = 1e-14 · 1 = 1e-14.
    const schmidt = new Float64Array([1.0, 0.5, 0.1])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    expect(epsilon).toBeCloseTo(1e-14, 20)
    expect(spectrum[0]!).toBeCloseTo(-Math.log(1.0 + 1e-14), 10)
    expect(spectrum[1]!).toBeCloseTo(-Math.log(0.25 + 1e-14), 10)
    expect(spectrum[2]!).toBeCloseTo(-Math.log(0.01 + 1e-14), 10)
  })

  it('produces a monotone non-decreasing spectrum', () => {
    const schmidt = new Float64Array([5, 3, 2, 1, 0.5, 0.1, 0.01, 0.001])
    const { spectrum } = modularSpectrum(schmidt)
    for (let i = 1; i < spectrum.length; i++) {
      expect(spectrum[i]!).toBeGreaterThanOrEqual(spectrum[i - 1]! - 1e-10)
    }
  })

  it('regularises zeros via epsilon — K stays finite', () => {
    const schmidt = new Float64Array([2, 1, 0, 0])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    for (const k of spectrum) expect(Number.isFinite(k)).toBe(true)
    // Leading eigenvalue s² = 4 so ε = 1e-14 · 4 = 4e-14. K for s=0 is
    // −log(4e-14) ≈ 30.85.
    expect(spectrum[2]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(spectrum[3]!).toBeCloseTo(-Math.log(epsilon), 6)
  })

  it('identifies the rank threshold at the first s_n below the relative cutoff', () => {
    const schmidt = new Float64Array([1.0, 0.5, 0.1, 0.01, 0.001])
    // s_n² / s_0² = 1, 0.25, 0.01, 1e-4, 1e-6.
    const { rankThreshold } = modularSpectrum(schmidt, 5e-3)
    expect(rankThreshold).toBe(3) // s_3² = 1e-4 < 5e-3
  })

  it('returns rankThreshold === length when no index falls below the cutoff', () => {
    const schmidt = new Float64Array([1, 0.95, 0.9, 0.85])
    const { rankThreshold } = modularSpectrum(schmidt, 1e-3)
    expect(rankThreshold).toBe(4)
  })

  it('handles empty input', () => {
    const { spectrum, epsilon, rankThreshold } = modularSpectrum(new Float64Array(0))
    expect(spectrum.length).toBe(0)
    expect(epsilon).toBe(0)
    expect(rankThreshold).toBe(0)
  })

  it('floor-pins non-finite Schmidt values instead of emitting NaN spectra', () => {
    const { spectrum, epsilon, rankThreshold } = modularSpectrum(
      new Float64Array([0.5, Number.NaN, Number.POSITIVE_INFINITY, 0])
    )

    expect(epsilon).toBeCloseTo(0.25 * MODULAR_EPSILON, 22)
    for (const k of spectrum) expect(Number.isFinite(k)).toBe(true)
    expect(spectrum[0]!).toBeCloseTo(-Math.log(0.25 + epsilon), 10)
    expect(spectrum[1]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(spectrum[2]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(spectrum[3]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(rankThreshold).toBe(1)
  })

  it('derives epsilon from the largest finite weight when the leading entry is invalid', () => {
    const { spectrum, epsilon } = modularSpectrum(new Float64Array([Number.NaN, 0.5, 0]))

    expect(epsilon).toBeCloseTo(0.25 * MODULAR_EPSILON, 22)
    expect(spectrum[0]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(spectrum[1]!).toBeCloseTo(-Math.log(0.25 + epsilon), 10)
  })
})

describe('modularHamiltonian.MODULAR_EPSILON', () => {
  it('is a positive small constant the spectrum uses to regularise zeros', () => {
    expect(MODULAR_EPSILON).toBeGreaterThan(0)
    expect(MODULAR_EPSILON).toBeLessThan(1e-10)
    // With s_0 = 1 the effective epsilon equals MODULAR_EPSILON; the
    // resulting floor −log(ε) should match the max-K value the spectrum
    // saturates to when s = 0.
    const schmidt = new Float64Array([1, 0])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    expect(epsilon).toBeCloseTo(MODULAR_EPSILON, 20)
    expect(spectrum[1]!).toBeCloseTo(-Math.log(MODULAR_EPSILON), 6)
  })
})

describe('modularHamiltonian.floorFractionFromModular', () => {
  it('returns 1.0 when every K_n sits at the floor', () => {
    // Modular spectrum of an all-zero Schmidt ⇒ every K_n = −log(ε).
    const schmidt = new Float64Array([1, 0, 0, 0, 0])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    // All but the leading mode are exactly at −log(ε); the leading one
    // is K_0 = −log(1 + ε) ≈ 0. Default tolerance 1.5 excludes K_0.
    const frac = floorFractionFromModular(spectrum, epsilon)
    expect(frac).toBeCloseTo(4 / 5, 6)
  })

  it('returns 0 for an identity-style spectrum with no floor-pinned modes', () => {
    // All K values are well below the floor: construct K by shifting
    // −log(ε) downward by 10 nats. Tolerance 1.5 catches nothing.
    const epsilon = MODULAR_EPSILON
    const floor = -Math.log(epsilon)
    const K = new Float64Array([floor - 20, floor - 18, floor - 15, floor - 12])
    expect(floorFractionFromModular(K, epsilon)).toBe(0)
  })

  it('returns 0.5 when half the modes are pinned (all-equal half at floor)', () => {
    // Build K with two values at the floor (distance 0) and two at
    // distance 5 nats. Default tolerance 1.5 counts only the two at 0.
    const epsilon = MODULAR_EPSILON
    const floor = -Math.log(epsilon)
    const K = new Float64Array([floor - 5, floor - 5, floor, floor])
    expect(floorFractionFromModular(K, epsilon)).toBe(0.5)
  })

  it('scales with the tolerance parameter', () => {
    const epsilon = MODULAR_EPSILON
    const floor = -Math.log(epsilon)
    const K = new Float64Array([floor - 10, floor - 3, floor - 1, floor])
    // Predicate is now inclusive on both ends: `0 ≤ gap ≤ tol`.
    // tol=0.5 catches K[3] only (gap=0).
    expect(floorFractionFromModular(K, epsilon, 0.5)).toBe(0.25)
    // tol=2 catches K[2] (gap=1), K[3] (gap=0).
    expect(floorFractionFromModular(K, epsilon, 2)).toBe(0.5)
    // tol=5 catches K[1] (gap=3), K[2] (gap=1), K[3] (gap=0).
    expect(floorFractionFromModular(K, epsilon, 5)).toBe(0.75)
    // tol=10 catches all four (K[0] gap=10 lies on the inclusive upper edge).
    expect(floorFractionFromModular(K, epsilon, 10)).toBe(1)
  })

  it('counts exact floor hits when tolerance is zero', () => {
    // Regression: prior strict `gap < tol` predicate silently excluded
    // the most clearly pinned modes (those sitting exactly at the floor)
    // when `tol === 0`. The inclusive `gap <= tol` guard fixes that and
    // also avoids counting modes above the floor (negative gap — numerical
    // overshoot rather than pinning).
    const epsilon = MODULAR_EPSILON
    const floor = -Math.log(epsilon)
    const K = new Float64Array([floor - 0.5, floor, floor + 0.5, floor])
    // tol=0 keeps only the two K_n === floor (indices 1 and 3).
    expect(floorFractionFromModular(K, epsilon, 0)).toBe(0.5)
  })

  it('returns 0 for empty input or non-positive epsilon', () => {
    expect(floorFractionFromModular(new Float64Array(0), MODULAR_EPSILON)).toBe(0)
    expect(floorFractionFromModular(new Float64Array([1, 2, 3]), 0)).toBe(0)
    expect(floorFractionFromModular(new Float64Array([1, 2, 3]), -1)).toBe(0)
  })
})
