/**
 * Branch decomposition tests — spatial partition and coherence metrics.
 *
 * Pattern: follows measurement.test.ts
 * (spatial decomposition, axis coordinate extraction).
 */

import { describe, expect, it } from 'vitest'

import {
  branchEntropy,
  branchPurity,
  fitExponentialDecay,
  spatialBranchPartition,
} from '@/lib/physics/stochastic/branchDecomposition'

describe('spatialBranchPartition', () => {
  it('left/right partition sums to total norm', () => {
    const n = 64
    const psiRe = new Float64Array(n)
    const psiIm = new Float64Array(n)
    // Arbitrary wavefunction
    for (let i = 0; i < n; i++) {
      psiRe[i] = Math.sin(i * 0.3) * 0.1
      psiIm[i] = Math.cos(i * 0.7) * 0.05
    }

    const { populationA, populationB, totalNorm } = spatialBranchPartition(
      psiRe,
      psiIm,
      [n],
      [0.1],
      1,
      0
    )

    // Populations should sum to 1 (within tolerance)
    expect(Math.abs(populationA + populationB - 1)).toBeLessThan(1e-12)
    // Total norm should match manual computation
    let manualNorm = 0
    for (let i = 0; i < n; i++) {
      manualNorm += psiRe[i]! ** 2 + psiIm[i]! ** 2
    }
    expect(Math.abs(totalNorm - manualNorm) / manualNorm).toBeLessThan(1e-12)
  })

  it('symmetric wavefunction gives equal branch populations', () => {
    const n = 64
    const spacing = 0.1
    const psiRe = new Float64Array(n)
    const psiIm = new Float64Array(n)
    const halfExtent = n * spacing * 0.5

    // Symmetric: cos(πx/L) centered at 0
    for (let i = 0; i < n; i++) {
      const x = i * spacing - halfExtent
      psiRe[i] = Math.cos((Math.PI * x) / halfExtent)
    }

    const { populationA, populationB } = spatialBranchPartition(psiRe, psiIm, [n], [spacing], 1, 0)

    expect(Math.abs(populationA - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(populationB - 0.5)).toBeLessThan(0.02)
  })

  it('wavepacket entirely in left well gives branchA ≈ 1, branchB ≈ 0', () => {
    const n = 64
    const spacing = 0.1
    const halfExtent = n * spacing * 0.5
    const psiRe = new Float64Array(n)
    const psiIm = new Float64Array(n)

    // Narrow Gaussian at x = -L/4 (far left)
    const center = -halfExtent * 0.5
    const sigma = 0.2
    for (let i = 0; i < n; i++) {
      const x = i * spacing - halfExtent
      psiRe[i] = Math.exp(-((x - center) ** 2) / (4 * sigma * sigma))
    }

    const { populationA } = spatialBranchPartition(psiRe, psiIm, [n], [spacing], 1, 0)
    expect(populationA).toBeGreaterThan(0.99)
  })

  it('partition plane at non-center position works correctly', () => {
    const n = 64
    const spacing = 0.1
    const psiRe = new Float64Array(n)
    const psiIm = new Float64Array(n)

    // Delta at site 48
    psiRe[48] = 1.0

    const { populationA, populationB } = spatialBranchPartition(
      psiRe,
      psiIm,
      [n],
      [spacing],
      1,
      0 // center partition
    )

    // Site 48 is in the right half (x > 0 for site > 32)
    expect(populationA).toBeLessThan(0.01)
    expect(populationB).toBeGreaterThan(0.99)
  })

  it('classifies branch plane using voxel-centered lattice coordinates', () => {
    const n = 64
    const spacing = 0.1
    const psiRe = new Float64Array(n)
    const psiIm = new Float64Array(n)
    psiRe[31] = 1
    psiRe[32] = 1

    const halfExtent = n * spacing * 0.5
    const planePosition = 0.025 / halfExtent
    const { populationA, populationB } = spatialBranchPartition(
      psiRe,
      psiIm,
      [n],
      [spacing],
      1,
      planePosition
    )

    expect(populationA).toBeCloseTo(0.5, 12)
    expect(populationB).toBeCloseTo(0.5, 12)
  })
})

describe('branchEntropy', () => {
  it('maximum entropy for equal populations', () => {
    const entropy = branchEntropy(0.5, 0.5)
    expect(Math.abs(entropy - Math.log(2))).toBeLessThan(1e-10)
  })

  it('zero entropy for fully localized branch', () => {
    const entropy = branchEntropy(1.0, 0.0)
    expect(entropy).toBe(0)
  })

  it('entropy is symmetric', () => {
    expect(branchEntropy(0.3, 0.7)).toBeCloseTo(branchEntropy(0.7, 0.3), 12)
  })
})

describe('branchPurity', () => {
  it('minimum purity (0.5) for equal populations', () => {
    expect(branchPurity(0.5, 0.5)).toBeCloseTo(0.5, 10)
  })

  it('maximum purity (1.0) for fully localized branch', () => {
    expect(branchPurity(1.0, 0.0)).toBe(1.0)
  })
})

describe('fitExponentialDecay', () => {
  it('fits known exponential: C(t) = 2·exp(-0.5·t)', () => {
    const rate = 0.5
    const amp = 2.0
    const times = Array.from({ length: 50 }, (_, i) => i * 0.2)
    const values = times.map((t) => amp * Math.exp(-rate * t))

    const result = fitExponentialDecay(times, values)
    expect(result?.decayRate).toBeGreaterThan(0)
    expect(Math.abs(result!.decayRate - rate)).toBeLessThan(0.01)
    expect(Math.abs(result!.amplitude - amp)).toBeLessThan(0.01)
    expect(result!.r2).toBeGreaterThan(0.99)
  })

  it('returns null for fewer than 3 points', () => {
    expect(fitExponentialDecay([0, 1], [1, 0.5])).toBeNull()
  })

  it('returns null for non-finite fit samples', () => {
    expect(fitExponentialDecay([0, 1, Number.POSITIVE_INFINITY], [1, 0.5, 0.25])).toBeNull()
    expect(fitExponentialDecay([0, 1, 2], [1, Number.POSITIVE_INFINITY, 0.25])).toBeNull()
    expect(fitExponentialDecay([0, 1, 2], [1, Number.NaN, 0.25])).toBeNull()
  })

  it('handles noisy data with reasonable R²', () => {
    const rate = 1.0
    const times = Array.from({ length: 30 }, (_, i) => i * 0.1)
    // Add 5% noise
    const values = times.map((t, i) => Math.exp(-rate * t) * (1 + Math.sin(i * 1.23) * 0.05))

    const result = fitExponentialDecay(times, values)
    expect(result?.decayRate).toBeGreaterThan(0)
    expect(result!.r2).toBeGreaterThan(0.9)
    expect(Math.abs(result!.decayRate - rate)).toBeLessThan(0.15)
  })
})
