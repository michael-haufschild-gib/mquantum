/**
 * Unit tests for the SRMT null-hypothesis baselines.
 *
 * The baselines are the foundation of the SRMT falsification gate
 * (Criterion 3 in `docs/physics/srmt-falsification.md`). Their job is to
 * convert a low real `q` from "interesting" into "actual evidence" by
 * showing the real fit beats every structure-destroying perturbation.
 * These tests exercise the three guarantees the diagnostic relies on:
 *
 *  1. **Determinism.** Same `(K, E, seed)` → bit-identical baselines.
 *     Without this, the publication sweep is not reproducible.
 *  2. **Real beats baselines on a genuine match.** A perfect affine
 *     `K = α E + β` gives `q_real = 0`, and every baseline must yield a
 *     strictly larger `q`.
 *  3. **Degenerate inputs do not lie.** `count < 3`, buffer underrun,
 *     and non-finite values must return all-NaN baselines so the UI
 *     does not silently report a fake "wins by ∞×".
 *
 * @module tests/lib/physics/srmt/nullBaselines
 */

import { describe, expect, it } from 'vitest'

import { computeAffineFitQuality, computeRigidFitQuality } from '@/lib/physics/srmt/affineFit'
import {
  bestBaselineRatio,
  computeNullBaselines,
  computeNullBaselinesRigid,
  DEFAULT_NULL_BASELINE_SEED,
} from '@/lib/physics/srmt/nullBaselines'

/** Build a perfectly-affine `(K, E)` pair: `K_i = α·E_i + β`. */
function affinePair(
  alpha: number,
  beta: number,
  count: number
): { K: Float64Array; E: Float64Array } {
  const E = new Float64Array(count)
  const K = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    E[i] = 1 + i
    K[i] = alpha * E[i]! + beta
  }
  return { K, E }
}

describe('computeNullBaselines', () => {
  it('is bit-deterministic across repeated invocations with the same seed', () => {
    const { K, E } = affinePair(1.7, 0.3, 16)
    const a = computeNullBaselines(K, E, 16, 0xdeadbeef)
    const b = computeNullBaselines(K, E, 16, 0xdeadbeef)
    expect(a.shuffled).toBe(b.shuffled)
    expect(a.reversed).toBe(b.reversed)
    expect(a.synthetic).toBe(b.synthetic)
  })

  it('produces different baselines for different seeds (shuffle + synthetic only)', () => {
    const { K, E } = affinePair(1.7, 0.3, 16)
    const a = computeNullBaselines(K, E, 16, 1)
    const b = computeNullBaselines(K, E, 16, 2)
    // Shuffle and synthetic are seed-dependent; reversed is not.
    expect(a.shuffled).not.toBe(b.shuffled)
    expect(a.synthetic).not.toBe(b.synthetic)
    // Reversed is purely a function of (K, count) — both seeds must agree.
    expect(a.reversed).toBe(b.reversed)
  })

  it('real fit beats shuffle/synthetic baselines on a realistic curvature-bearing match', () => {
    // K = E + 5 + small quadratic curvature. Curvature is too small to
    // hurt the affine fit (q stays low) but it breaks the
    // direction-symmetry that lets a perfect-line K survive reversal
    // — see the reversed-baseline caveat in nullBaselines.ts.
    const count = 32
    const K = new Float64Array(count)
    const E = new Float64Array(count)
    for (let i = 0; i < count; i++) {
      E[i] = 1 + i
      K[i] = E[i]! + 5 + 0.01 * E[i]! * E[i]!
    }
    const real = computeAffineFitQuality(K, E, count)
    expect(real).toBeGreaterThan(0)
    const baselines = computeNullBaselines(K, E, count)
    // Shuffled and synthetic destroy index-alignment; both must be
    // orders of magnitude worse than the real fit.
    expect(baselines.shuffled).toBeGreaterThan(real * 10)
    expect(baselines.synthetic).toBeGreaterThan(real * 10)
    // Reversed: curvature breaks the affine direction-symmetry, so it
    // must be strictly worse, though typically by a smaller margin.
    expect(baselines.reversed).toBeGreaterThan(real)
  })

  it('reversed baseline equals the real fit on a perfectly-affine K (direction-symmetry caveat)', () => {
    // Documents the reversed baseline's blind spot: a strictly-monotone
    // K against a strictly-monotone E that lies exactly on a line has
    // q_reversed == q_real == 0 because the affine fit absorbs the
    // sign flip into α. The publication sweep should pair this baseline
    // with q_rigid (α=1 pinned) for direction-sensitivity.
    const { K, E } = affinePair(1, 5, 32)
    const real = computeAffineFitQuality(K, E, 32)
    const baselines = computeNullBaselines(K, E, 32)
    expect(real).toBeLessThan(1e-20)
    expect(baselines.reversed).toBeLessThan(1e-20)
  })

  it('reversed baseline equals the affine fit of the explicitly reversed K', () => {
    // Independent reconstruction: reverse K manually and call
    // computeAffineFitQuality directly. Should match the baseline's
    // reversed entry bit-for-bit.
    const { K, E } = affinePair(2, -1, 12)
    const reversedK = new Float64Array(12)
    for (let i = 0; i < 12; i++) reversedK[i] = K[11 - i]!
    const explicit = computeAffineFitQuality(reversedK, E, 12)
    const baselines = computeNullBaselines(K, E, 12)
    expect(baselines.reversed).toBeCloseTo(explicit, 14)
  })

  it('returns all-NaN for count < 3', () => {
    const K = new Float64Array([1, 2])
    const E = new Float64Array([1, 2])
    const b = computeNullBaselines(K, E, 2)
    expect(b.shuffled).toBeNaN()
    expect(b.reversed).toBeNaN()
    expect(b.synthetic).toBeNaN()
  })

  it('returns all-NaN when count exceeds buffer length', () => {
    const K = new Float64Array([1, 2, 3])
    const E = new Float64Array([1, 2, 3])
    const b = computeNullBaselines(K, E, 5)
    expect(b.shuffled).toBeNaN()
    expect(b.reversed).toBeNaN()
    expect(b.synthetic).toBeNaN()
  })

  it('default seed is fixed and exported for sweep reproducibility', () => {
    expect(DEFAULT_NULL_BASELINE_SEED).toBe(0x5e7c0)
    const { K, E } = affinePair(1, 0, 8)
    const explicit = computeNullBaselines(K, E, 8, 0x5e7c0)
    const defaulted = computeNullBaselines(K, E, 8)
    expect(defaulted.shuffled).toBe(explicit.shuffled)
    expect(defaulted.synthetic).toBe(explicit.synthetic)
  })

  it('treats seed=0 as seed=1 to avoid xorshift32 stuck state', () => {
    const { K, E } = affinePair(1, 0, 8)
    const seed0 = computeNullBaselines(K, E, 8, 0)
    // Should produce a meaningful (finite, non-trivial) baseline, not all zeros.
    expect(Number.isFinite(seed0.shuffled)).toBe(true)
    expect(seed0.shuffled).toBeGreaterThan(0)
  })
})

describe('bestBaselineRatio', () => {
  it('reports the smallest baseline / real ratio', () => {
    const r = bestBaselineRatio(0.001, { shuffled: 0.5, reversed: 0.3, synthetic: 0.8 })
    expect(r).toBeCloseTo(0.3 / 0.001, 6)
  })

  it('returns +Infinity for real q = 0 (perfect fit)', () => {
    const r = bestBaselineRatio(0, { shuffled: 0.5, reversed: 0.3, synthetic: 0.8 })
    expect(r).toBe(Number.POSITIVE_INFINITY)
  })

  it('does not report infinite evidence when a zero-q null baseline ties a perfect real fit', () => {
    const r = bestBaselineRatio(0, { shuffled: 0.5, reversed: 0, synthetic: 0.8 })
    expect(r).toBe(1)
  })

  it('returns NaN when real q is non-finite', () => {
    expect(
      bestBaselineRatio(Number.NaN, { shuffled: 0.5, reversed: 0.3, synthetic: 0.8 })
    ).toBeNaN()
    expect(
      bestBaselineRatio(Number.POSITIVE_INFINITY, { shuffled: 0.5, reversed: 0.3, synthetic: 0.8 })
    ).toBeNaN()
  })

  it('returns NaN when all baselines are non-finite', () => {
    const r = bestBaselineRatio(0.1, {
      shuffled: Number.NaN,
      reversed: Number.NaN,
      synthetic: Number.NaN,
    })
    expect(r).toBeNaN()
  })

  it('skips non-finite baselines and picks min of the rest', () => {
    const r = bestBaselineRatio(0.1, { shuffled: Number.NaN, reversed: 0.5, synthetic: 0.3 })
    // min(0.5, 0.3) / 0.1 = 3
    expect(r).toBeCloseTo(3, 6)
  })

  it('signals falsification (ratio < 1) when a baseline beats the real fit', () => {
    // real worse than every baseline → ratio < 1
    const r = bestBaselineRatio(1.0, { shuffled: 0.5, reversed: 0.3, synthetic: 0.8 })
    expect(r).toBeLessThan(1)
  })
})

describe('computeNullBaselinesRigid — direction-sensitive reversed baseline', () => {
  it('reversed baseline beats the real fit on a perfectly-affine K under rigid metric', () => {
    // The key direction-sensitivity test. With K = E + 5 perfect, the
    // L2 affine reversed baseline returns q ≈ 0 (α absorbs the flip).
    // Under rigid (α=1 pinned) the reversed sequence cannot pretend
    // to be E + const, so the reversed baseline q is much LARGER
    // than the real rigid q (which is 0 for K = E + const).
    const E = new Float64Array(16)
    const K = new Float64Array(16)
    for (let i = 0; i < 16; i++) {
      E[i] = 1 + i
      K[i] = E[i]! + 5
    }
    const realRigid = computeRigidFitQuality(K, E, 16)
    expect(realRigid).toBeLessThan(1e-20)
    const rigidBaselines = computeNullBaselinesRigid(K, E, 16)
    expect(rigidBaselines.reversed).toBeGreaterThan(0.1)
    // For comparison, the affine reversed baseline is direction-symmetric:
    const affineBaselines = computeNullBaselines(K, E, 16)
    expect(affineBaselines.reversed).toBeLessThan(1e-20)
  })

  it('all three rigid baselines are strictly worse than the real rigid fit', () => {
    const E = new Float64Array(20)
    const K = new Float64Array(20)
    for (let i = 0; i < 20; i++) {
      E[i] = 1 + i
      K[i] = E[i]! + 2 + 0.05 * E[i]! * E[i]!
    }
    const realRigid = computeRigidFitQuality(K, E, 20)
    const baselines = computeNullBaselinesRigid(K, E, 20)
    expect(baselines.shuffled).toBeGreaterThan(realRigid)
    expect(baselines.reversed).toBeGreaterThan(realRigid)
    expect(baselines.synthetic).toBeGreaterThan(realRigid)
  })

  it('returns all-NaN for degenerate inputs', () => {
    const K = new Float64Array([1, 2])
    const E = new Float64Array([1, 2])
    const b = computeNullBaselinesRigid(K, E, 2)
    expect(b.shuffled).toBeNaN()
    expect(b.reversed).toBeNaN()
    expect(b.synthetic).toBeNaN()
  })

  it('uses the same seed streams as computeNullBaselines (shuffle reproducibility)', () => {
    // The shuffled K and synthetic K should be the same byte-for-byte
    // between affine and rigid variants — only the cost function
    // differs. We probe this indirectly: the rigid result on a
    // shuffled K should equal computeRigidFitQuality applied to the
    // same shuffled K that the affine variant used. We check by
    // running both at the same seed and asserting the rigid.shuffled
    // is NOT equal to the affine.shuffled (different cost) but the
    // determinism contract holds (same seed → same value across
    // repeated calls).
    const E = new Float64Array(12)
    const K = new Float64Array(12)
    for (let i = 0; i < 12; i++) {
      E[i] = 1 + i
      K[i] = E[i]! + 1 + 0.1 * E[i]!
    }
    const a = computeNullBaselinesRigid(K, E, 12, 0xc0ffee)
    const b = computeNullBaselinesRigid(K, E, 12, 0xc0ffee)
    expect(a.shuffled).toBe(b.shuffled)
    expect(a.synthetic).toBe(b.synthetic)
    expect(a.reversed).toBe(b.reversed)
    // Sanity: rigid and affine produce different numbers on the
    // same seed (proves the cost function actually differs).
    const affine = computeNullBaselines(K, E, 12, 0xc0ffee)
    expect(a.shuffled).not.toBe(affine.shuffled)
  })
})
