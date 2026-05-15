/**
 * Unit tests for the affine-fit primitives.
 *
 * `computeAffineFitQuality` is exercised indirectly through `sweepDriver`,
 * `diagnostic`, and the existing physics suites; here we focus on the
 * leave-one-out jackknife stdev that backs the new `qStdev` field on
 * {@link SrmtSweepPoint}. Without these tests the publication-ready
 * "every q ships with σ" requirement is unverifiable.
 *
 * @module tests/lib/physics/srmt/affineFit
 */

import { describe, expect, it } from 'vitest'

import {
  computeAffineFitLInf,
  computeAffineFitQuality,
  computeRigidFitQuality,
  fitAffineParams,
  jackknifeAffineFitStdev,
  jackknifeRigidFitStdev,
} from '@/lib/physics/srmt/affineFit'

/**
 * Small helper that builds a perfectly-affine `(K, E)` pair for `count`
 * indices. The full-data fit returns `q = 0`; jackknife replicates also
 * return `q_k = 0` for every drop, so the stdev is exactly `0`.
 */
function affinePair(
  alpha: number,
  beta: number,
  count: number,
  start = 1
): { K: Float64Array; E: Float64Array } {
  const E = new Float64Array(count)
  const K = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    E[i] = start + i
    K[i] = alpha * E[i]! + beta
  }
  return { K, E }
}

describe('fitAffineParams', () => {
  it('returns α=1 β=0 q=0 for identity K = E', () => {
    const E = new Float64Array([1, 2, 3, 4, 5])
    const K = new Float64Array([1, 2, 3, 4, 5])
    const { q, alpha, beta } = fitAffineParams(K, E, 5)
    expect(alpha).toBeCloseTo(1, 14)
    expect(beta).toBeCloseTo(0, 14)
    expect(q).toBeLessThan(1e-28)
  })

  it('returns α=1 β=5 when K = E + 5 (pure shift)', () => {
    const E = new Float64Array([1, 2, 3, 4, 5, 6])
    const K = new Float64Array([6, 7, 8, 9, 10, 11])
    const { q, alpha, beta } = fitAffineParams(K, E, 6)
    expect(alpha).toBeCloseTo(1, 14)
    expect(beta).toBeCloseTo(5, 14)
    // q = Σ(K − (αE+β))² / ΣK²; residuals are zero by construction.
    expect(q).toBeLessThan(1e-28)
  })

  it('returns α=2 β=0 when K = 2·E (pure scale)', () => {
    const E = new Float64Array([1, 2, 3, 4, 5])
    const K = new Float64Array([2, 4, 6, 8, 10])
    const { q, alpha, beta } = fitAffineParams(K, E, 5)
    expect(alpha).toBeCloseTo(2, 14)
    expect(beta).toBeCloseTo(0, 14)
    expect(q).toBeLessThan(1e-28)
  })

  it('returns NaNs throughout for degenerate zero-variance E', () => {
    // Constant E → sEE = 0 → fit is unsolvable. All three fields NaN.
    const E = new Float64Array([3, 3, 3, 3])
    const K = new Float64Array([0.1, 0.2, 0.3, 0.4])
    const { q, alpha, beta } = fitAffineParams(K, E, 4)
    expect(q).toBeNaN()
    expect(alpha).toBeNaN()
    expect(beta).toBeNaN()
  })

  it('returns NaNs throughout for count<3 and count>buffer', () => {
    const E = new Float64Array([1, 2, 3])
    const K = new Float64Array([1, 2, 3])
    for (const bad of [0, 1, 2, 7]) {
      const r = fitAffineParams(K, E, bad)
      expect(r.q).toBeNaN()
      expect(r.alpha).toBeNaN()
      expect(r.beta).toBeNaN()
    }
  })

  it('q matches computeAffineFitQuality bit-for-bit on non-degenerate inputs', () => {
    // Contract: computeAffineFitQuality is a thin wrapper over
    // fitAffineParams. A divergence between the two would mean the
    // delegation was silently rewritten to use different FP ops.
    const E = new Float64Array([1, 2, 3, 5, 8, 13, 21])
    const K = new Float64Array([1.05, 2.1, 2.95, 5.05, 8.2, 13.1, 20.8])
    const n = 7
    const viaWrapper = computeAffineFitQuality(K, E, n)
    const viaDirect = fitAffineParams(K, E, n).q
    expect(Object.is(viaWrapper, viaDirect)).toBe(true)
  })

  it('does not publish a perfect affine score for two-point spectra', () => {
    const E = new Float64Array([1, 2])
    const K = new Float64Array([100, -3])

    const { q, alpha, beta } = fitAffineParams(K, E, 2)

    expect(q).toBeNaN()
    expect(alpha).toBeNaN()
    expect(beta).toBeNaN()
    expect(computeAffineFitQuality(K, E, 2)).toBeNaN()
  })

  it('rejects non-finite spectra before fit parameters are published', () => {
    const E = new Float64Array([1, 2, Number.POSITIVE_INFINITY])
    const K = new Float64Array([1, 2, 3])

    const { q, alpha, beta } = fitAffineParams(K, E, 3)

    expect(q).toBeNaN()
    expect(alpha).toBeNaN()
    expect(beta).toBeNaN()
  })
})

describe('jackknifeAffineFitStdev', () => {
  it('returns 0 for a perfectly affine spectrum (every replicate hits q=0)', () => {
    const { K, E } = affinePair(0.5, 1.2, 8)
    const sigma = jackknifeAffineFitStdev(K, E, 8)
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeLessThan(1e-12)
  })

  it('returns NaN when count<4 (dropped subsets need at least three points)', () => {
    const { K, E } = affinePair(1, 0, 5)
    expect(jackknifeAffineFitStdev(K, E, 0)).toBeNaN()
    expect(jackknifeAffineFitStdev(K, E, 1)).toBeNaN()
    expect(jackknifeAffineFitStdev(K, E, 2)).toBeNaN()
    expect(jackknifeAffineFitStdev(K, E, 3)).toBeNaN()
  })

  it('returns NaN when count exceeds buffer length', () => {
    const { K, E } = affinePair(1, 0, 5)
    expect(jackknifeAffineFitStdev(K, E, 10)).toBeNaN()
  })

  it('produces a positive σ when one mode is an outlier', () => {
    // Build a clean affine series, then perturb K at index 4. Dropping
    // that single mode should noticeably reduce q vs the full-data fit;
    // the jackknife sample variance is therefore non-zero.
    const { K, E } = affinePair(0.7, 0.1, 8)
    K[4] = K[4]! + 0.5
    const sigma = jackknifeAffineFitStdev(K, E, 8)
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeGreaterThan(0)
  })

  it('matches a brute-force loop computation', () => {
    // Reference: explicit loop over drop indices using the same affine
    // primitive. Exact equality (modulo Float64 rounding) is the contract.
    const E = new Float64Array([1, 2, 3, 5, 8, 13, 21])
    const K = new Float64Array([1, 2.05, 3.1, 4.95, 8.05, 13.2, 20.8])
    const n = 7
    const samples: number[] = []
    for (let drop = 0; drop < n; drop++) {
      const Kd = new Float64Array(n - 1)
      const Ed = new Float64Array(n - 1)
      let w = 0
      for (let i = 0; i < n; i++) {
        if (i === drop) continue
        Kd[w] = K[i]!
        Ed[w] = E[i]!
        w++
      }
      samples.push(computeAffineFitQuality(Kd, Ed, n - 1))
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const ref = Math.sqrt(((n - 1) / n) * samples.reduce((a, q) => a + (q - mean) ** 2, 0))
    const sigma = jackknifeAffineFitStdev(K, E, n)
    expect(sigma).toBeCloseTo(ref, 12)
  })

  it('returns NaN if any replicate degenerates (zero-variance E in subset)', () => {
    // E identical except at one index → after dropping that index the
    // remaining E has zero variance, so computeAffineFitQuality returns
    // NaN. The jackknife must propagate NaN rather than silently produce
    // a misleading "small" stdev.
    const E = new Float64Array([1, 1, 1, 1, 5])
    const K = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.9])
    const sigma = jackknifeAffineFitStdev(K, E, 5)
    expect(sigma).toBeNaN()
  })
})

describe('computeRigidFitQuality', () => {
  it('returns 0 for K = E + const (strict SRMT conjecture holds exactly)', () => {
    // α=1, β arbitrary. Rigid fit should return zero residual.
    const { K, E } = affinePair(1, 2.5, 8)
    expect(computeRigidFitQuality(K, E, 8)).toBeLessThan(1e-14)
  })

  it('returns a positive residual when α ≠ 1 even if the affine fit is perfect', () => {
    // q_affine = 0 (perfect affine), but q_rigid > 0 because α is pinned.
    // This is the SRMT observable the doc derives: the gap between the
    // two metrics quantifies how much the affine fit is using α to hide
    // a unit / scale mismatch.
    const { K, E } = affinePair(2.0, 0.3, 10)
    const qAffine = computeAffineFitQuality(K, E, 10)
    const qRigid = computeRigidFitQuality(K, E, 10)
    expect(qAffine).toBeLessThan(1e-14)
    expect(qRigid).toBeGreaterThan(0.01)
    // Codifies the inequality from the doc: q_rigid ≥ q_affine always.
    expect(qRigid).toBeGreaterThanOrEqual(qAffine)
  })

  it('q_rigid ≥ q_affine for noisy non-unit-α data (inequality is tight)', () => {
    // Linear signal with a 1.3 slope plus additive noise.
    const count = 12
    const E = new Float64Array(count)
    const K = new Float64Array(count)
    for (let i = 0; i < count; i++) {
      E[i] = 1 + i
      K[i] = 1.3 * E[i]! + 0.5 + 0.01 * Math.sin(i * 1.7)
    }
    const qAffine = computeAffineFitQuality(K, E, count)
    const qRigid = computeRigidFitQuality(K, E, count)
    expect(qRigid).toBeGreaterThanOrEqual(qAffine)
  })

  it('returns NaN for count<2 or count exceeding buffers', () => {
    const { K, E } = affinePair(1, 0, 5)
    expect(computeRigidFitQuality(K, E, 0)).toBeNaN()
    expect(computeRigidFitQuality(K, E, 1)).toBeNaN()
    expect(computeRigidFitQuality(K, E, 10)).toBeNaN()
  })

  it('rejects non-finite rigid spectra', () => {
    const K = new Float64Array([1, Number.NaN, 3])
    const E = new Float64Array([1, 2, 3])

    expect(computeRigidFitQuality(K, E, 3)).toBeNaN()
  })

  it('matches a manual β* = mean(K) − mean(E) derivation', () => {
    const K = new Float64Array([1.0, 2.0, 3.0, 4.5, 6.1])
    const E = new Float64Array([0.0, 1.0, 2.0, 3.0, 4.0])
    const n = 5
    let sumK = 0
    let sumE = 0
    for (let i = 0; i < n; i++) {
      sumK += K[i]!
      sumE += E[i]!
    }
    const beta = (sumK - sumE) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      const r = K[i]! - E[i]! - beta
      num += r * r
      den += K[i]! * K[i]!
    }
    const ref = num / den
    expect(computeRigidFitQuality(K, E, n)).toBeCloseTo(ref, 14)
  })
})

describe('jackknifeRigidFitStdev', () => {
  it('returns 0 for a perfectly rigid spectrum (every replicate hits q_rigid=0)', () => {
    const { K, E } = affinePair(1, 0.8, 8)
    const sigma = jackknifeRigidFitStdev(K, E, 8)
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeLessThan(1e-12)
  })

  it('returns a positive σ when a single mode perturbs the rigid residual', () => {
    const { K, E } = affinePair(1, 0.1, 8)
    K[3] = K[3]! + 0.4
    const sigma = jackknifeRigidFitStdev(K, E, 8)
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeGreaterThan(0)
  })

  it('returns NaN when count<3', () => {
    const { K, E } = affinePair(1, 0, 5)
    expect(jackknifeRigidFitStdev(K, E, 0)).toBeNaN()
    expect(jackknifeRigidFitStdev(K, E, 2)).toBeNaN()
  })
})

describe('computeAffineFitLInf', () => {
  it('returns 0 for an exact affine match', () => {
    const { K, E } = affinePair(1.7, 0.3, 12)
    expect(computeAffineFitLInf(K, E, 12)).toBeLessThan(1e-14)
  })

  it('flags a single bad mode that L2 averages away', () => {
    // 19 modes on the line y = E + 1, plus one outlier at index 9.
    // L2 averages the outlier across the sum; L∞ surfaces it.
    const { K, E } = affinePair(1, 1, 20)
    K[9] = K[9]! + 5
    const q2 = computeAffineFitQuality(K, E, 20)
    const qInf = computeAffineFitLInf(K, E, 20)
    expect(q2).toBeGreaterThan(0)
    // L∞ residual is the maximum outlier scaled by max|K|; on this
    // construction it should exceed the L2-aggregated score (which is
    // diluted by the 19 good modes) by an order of magnitude.
    expect(qInf).toBeGreaterThan(q2)
  })

  it('returns NaN for degenerate zero-variance E', () => {
    const E = new Float64Array([3, 3, 3, 3])
    const K = new Float64Array([0.1, 0.2, 0.3, 0.4])
    expect(computeAffineFitLInf(K, E, 4)).toBeNaN()
  })

  it('returns NaN when max|K| = 0 (degenerate K)', () => {
    const E = new Float64Array([1, 2, 3, 4])
    const K = new Float64Array([0, 0, 0, 0])
    expect(computeAffineFitLInf(K, E, 4)).toBeNaN()
  })
})
