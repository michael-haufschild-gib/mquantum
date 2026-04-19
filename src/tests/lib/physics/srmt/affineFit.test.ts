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
  computeAffineFitQuality,
  computeRigidFitQuality,
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

describe('jackknifeAffineFitStdev', () => {
  it('returns 0 for a perfectly affine spectrum (every replicate hits q=0)', () => {
    const { K, E } = affinePair(0.5, 1.2, 8)
    const sigma = jackknifeAffineFitStdev(K, E, 8)
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeLessThan(1e-12)
  })

  it('returns NaN when count<3 (jackknife undefined for n<3 replicates)', () => {
    const { K, E } = affinePair(1, 0, 5)
    expect(jackknifeAffineFitStdev(K, E, 0)).toBeNaN()
    expect(jackknifeAffineFitStdev(K, E, 1)).toBeNaN()
    expect(jackknifeAffineFitStdev(K, E, 2)).toBeNaN()
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
