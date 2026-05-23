/**
 * Stochastic PRNG and collapse center generation tests.
 *
 * Pattern: follows anderson/disorderPotential.test.ts
 * (deterministic PRNG, statistical quality).
 */

import { describe, expect, it } from 'vitest'

import {
  createStochasticRng,
  generateCollapseCenters,
} from '@/lib/physics/stochastic/localizationKernel'

describe('stochasticPRNG', () => {
  it('produces deterministic sequence from seed', () => {
    const rng1 = createStochasticRng(42, 0)
    const rng2 = createStochasticRng(42, 0)
    const seq1 = Array.from({ length: 100 }, () => rng1())
    const seq2 = Array.from({ length: 100 }, () => rng2())
    expect(seq1).toEqual(seq2)
  })

  it('different seeds produce different sequences', () => {
    const rng1 = createStochasticRng(1, 0)
    const rng2 = createStochasticRng(2, 0)
    const seq1 = Array.from({ length: 10 }, () => rng1())
    const seq2 = Array.from({ length: 10 }, () => rng2())
    const anyDifferent = seq1.some((v, i) => v !== seq2[i])
    expect(anyDifferent).toBe(true)
  })

  it('values are in [0, 1) range', () => {
    const rng = createStochasticRng(42, 0)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('passes chi-squared uniformity test (10 bins, p=0.001)', () => {
    const rng = createStochasticRng(42, 0)
    const bins = new Array(10).fill(0) as number[]
    const N = 10000

    for (let i = 0; i < N; i++) {
      const bin = Math.min(9, Math.floor(rng() * 10))
      bins[bin]!++
    }

    const expected = N / 10
    let chiSq = 0
    for (const count of bins) {
      chiSq += (count - expected) ** 2 / expected
    }

    // Critical value for 9 dof at p=0.001 is 27.88
    expect(chiSq).toBeLessThan(27.88)
  })

  it('different step indices produce different sequences', () => {
    const rng1 = createStochasticRng(42, 0)
    const rng2 = createStochasticRng(42, 1)
    const seq1 = Array.from({ length: 10 }, () => rng1())
    const seq2 = Array.from({ length: 10 }, () => rng2())
    const anyDifferent = seq1.some((v, i) => v !== seq2[i])
    expect(anyDifferent).toBe(true)
  })
})

describe('generateCollapseCenters', () => {
  it('returns N_loc centers within lattice bounds', () => {
    const gridSize = [64, 64, 64]
    const spacing = [0.1, 0.1, 0.1]
    const centers = generateCollapseCenters(8, gridSize, spacing, 3, 42, 0)

    expect(centers).toHaveLength(8)
    for (const center of centers) {
      expect(center.position).toHaveLength(3)
      for (let d = 0; d < 3; d++) {
        const halfExtent = gridSize[d]! * spacing[d]! * 0.5
        expect(center.position[d]).toBeGreaterThanOrEqual(-halfExtent)
        expect(center.position[d]).toBeLessThan(halfExtent)
      }
    }
  })

  it('centers are reproducible with same seed and step index', () => {
    const gridSize = [64, 64, 64]
    const spacing = [0.1, 0.1, 0.1]
    const c1 = generateCollapseCenters(4, gridSize, spacing, 3, 42, 5)
    const c2 = generateCollapseCenters(4, gridSize, spacing, 3, 42, 5)

    expect(c1).toEqual(c2)
  })

  it('different step indices produce different centers', () => {
    const gridSize = [64, 64, 64]
    const spacing = [0.1, 0.1, 0.1]
    const c1 = generateCollapseCenters(4, gridSize, spacing, 3, 42, 0)
    const c2 = generateCollapseCenters(4, gridSize, spacing, 3, 42, 1)

    const anyDifferent = c1.some(
      (center, k) => center.position[0] !== c2[k]!.position[0] || center.noise !== c2[k]!.noise
    )
    expect(anyDifferent).toBe(true)
  })

  it('generates coordinates for every active lattice dimension', () => {
    const gridSize = [4, 8, 16, 32]
    const spacing = [1, 0.5, 0.25, 0.125]
    const centers = generateCollapseCenters(3, gridSize, spacing, 4, 42, 0)

    expect(centers).toHaveLength(3)
    for (const center of centers) {
      expect(center.position).toHaveLength(4)
      for (let d = 0; d < 4; d++) {
        const halfExtent = gridSize[d]! * spacing[d]! * 0.5
        expect(center.position[d]).toBeGreaterThanOrEqual(-halfExtent)
        expect(center.position[d]).toBeLessThan(halfExtent)
      }
    }
  })

  it('Gaussian noise values have correct statistics (N=10000, seed=42)', () => {
    const gridSize = [64]
    const spacing = [0.1]
    // Generate many centers across many steps
    const noises: number[] = []
    for (let step = 0; step < 2500; step++) {
      const centers = generateCollapseCenters(4, gridSize, spacing, 1, 42, step)
      for (const c of centers) noises.push(c.noise)
    }
    expect(noises.length).toBe(10000)

    const mean = noises.reduce((a, b) => a + b, 0) / noises.length
    const variance = noises.reduce((a, b) => a + (b - mean) ** 2, 0) / (noises.length - 1)
    const std = Math.sqrt(variance)

    // Mean ≈ 0 (|mean| < 0.05)
    expect(Math.abs(mean)).toBeLessThan(0.05)
    // Std ≈ 1 (|std - 1| < 0.05)
    expect(Math.abs(std - 1)).toBeLessThan(0.05)
  })
})
