import { describe, expect, it } from 'vitest'

import { gaussianPair, mulberry32 } from '@/lib/math/rng'

describe('mulberry32', () => {
  it('produces deterministic sequences from the same seed', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    const seq1 = Array.from({ length: 100 }, () => rng1())
    const seq2 = Array.from({ length: 100 }, () => rng2())
    expect(seq1).toEqual(seq2)
  })

  it('produces different sequences from different seeds', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(99)
    const seq1 = Array.from({ length: 20 }, () => rng1())
    const seq2 = Array.from({ length: 20 }, () => rng2())
    // Sequences should differ (astronomically unlikely to match)
    expect(seq1).not.toEqual(seq2)
  })

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(12345)
    for (let i = 0; i < 10000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('gaussianPair', () => {
  it('returns two finite numbers', () => {
    const rng = mulberry32(7)
    const [g1, g2] = gaussianPair(rng)
    expect(Number.isFinite(g1)).toBe(true)
    expect(Number.isFinite(g2)).toBe(true)
  })

  it('produces samples with mean near 0 and variance near 1 over many draws', () => {
    const rng = mulberry32(42)
    const N = 10000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < N; i++) {
      const [g1, g2] = gaussianPair(rng)
      sum += g1 + g2
      sumSq += g1 * g1 + g2 * g2
    }
    const count = 2 * N
    const mean = sum / count
    const variance = sumSq / count - mean * mean

    // 5-sigma tolerance for mean: sigma_mean = 1/sqrt(count) ~ 0.007
    expect(Math.abs(mean)).toBeLessThan(0.05)
    // Variance of sample variance for normal: 2/count ~ 0.0001, so 5-sigma ~ 0.07
    expect(Math.abs(variance - 1)).toBeLessThan(0.1)
  })

  it('is deterministic from the same RNG state', () => {
    const rng1 = mulberry32(999)
    const rng2 = mulberry32(999)
    for (let i = 0; i < 50; i++) {
      const pair1 = gaussianPair(rng1)
      const pair2 = gaussianPair(rng2)
      expect(pair1).toEqual(pair2)
    }
  })
})
