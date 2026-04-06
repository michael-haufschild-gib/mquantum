import { describe, expect, it } from 'vitest'

import { generateDisorderPotential } from '@/lib/physics/anderson/disorderPotential'
import { mulberry32 } from '@/lib/math/rng'

describe('mulberry32', () => {
  it('produces deterministic sequence from seed', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2())
    }
  })

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(12345)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(1)
    const rng2 = mulberry32(2)
    // At least one of the first 10 values should differ
    let allSame = true
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) allSame = false
    }
    expect(allSame).toBe(false)
  })

  it('has reasonable uniformity (chi-squared on 10 bins)', () => {
    const rng = mulberry32(999)
    const bins = new Uint32Array(10)
    const N = 10000
    for (let i = 0; i < N; i++) {
      const bin = Math.min(9, Math.floor(rng() * 10))
      bins[bin]!++
    }
    // chi-squared: sum of (observed - expected)^2 / expected
    const expected = N / 10
    let chi2 = 0
    for (let b = 0; b < 10; b++) {
      const diff = bins[b]! - expected
      chi2 += (diff * diff) / expected
    }
    // 10 bins, 9 dof, p=0.001 critical value ≈ 27.88
    expect(chi2).toBeLessThan(28)
  })
})

describe('generateDisorderPotential', () => {
  it('returns correct number of lattice sites for 1D', () => {
    const pot = generateDisorderPotential([64], 1, 1.0, 42, 'uniform')
    expect(pot.length).toBe(64)
  })

  it('returns correct number of lattice sites for 3D', () => {
    const pot = generateDisorderPotential([8, 8, 8], 3, 1.0, 42, 'uniform')
    expect(pot.length).toBe(512)
  })

  it('is reproducible with the same seed', () => {
    const pot1 = generateDisorderPotential([16, 16], 2, 2.0, 100, 'uniform')
    const pot2 = generateDisorderPotential([16, 16], 2, 2.0, 100, 'uniform')
    for (let i = 0; i < pot1.length; i++) {
      expect(pot1[i]).toBe(pot2[i])
    }
  })

  it('different seeds produce different potentials', () => {
    const pot1 = generateDisorderPotential([32], 1, 1.0, 1, 'uniform')
    const pot2 = generateDisorderPotential([32], 1, 1.0, 2, 'uniform')
    let allSame = true
    for (let i = 0; i < pot1.length; i++) {
      if (pot1[i] !== pot2[i]) {
        allSame = false
        break
      }
    }
    expect(allSame).toBe(false)
  })

  describe('uniform distribution', () => {
    it('values lie within [-W/2, W/2]', () => {
      const W = 3.0
      const pot = generateDisorderPotential([64, 64], 2, W, 42, 'uniform')
      for (let i = 0; i < pot.length; i++) {
        expect(pot[i]).toBeGreaterThanOrEqual(-W / 2 - 1e-6)
        expect(pot[i]).toBeLessThanOrEqual(W / 2 + 1e-6)
      }
    })

    it('has approximately zero mean for large sample', () => {
      const pot = generateDisorderPotential([64, 64], 2, 2.0, 42, 'uniform')
      let sum = 0
      for (let i = 0; i < pot.length; i++) sum += pot[i]!
      const mean = sum / pot.length
      // Mean of U[-1,1] is 0; for 4096 samples, |mean| < 0.1 is very likely
      expect(Math.abs(mean)).toBeLessThan(0.1)
    })

    it('variance scales with W² (uniform: Var = W²/12)', () => {
      const W = 4.0
      const pot = generateDisorderPotential([64, 64], 2, W, 42, 'uniform')
      let sum = 0
      let sum2 = 0
      for (let i = 0; i < pot.length; i++) {
        sum += pot[i]!
        sum2 += pot[i]! * pot[i]!
      }
      const mean = sum / pot.length
      const variance = sum2 / pot.length - mean * mean
      // Expected variance = W^2/12 = 16/12 ≈ 1.333
      expect(variance).toBeCloseTo((W * W) / 12, 0)
    })
  })

  describe('gaussian distribution', () => {
    it('has approximately zero mean', () => {
      const pot = generateDisorderPotential([64, 64], 2, 1.0, 42, 'gaussian')
      let sum = 0
      for (let i = 0; i < pot.length; i++) sum += pot[i]!
      const mean = sum / pot.length
      expect(Math.abs(mean)).toBeLessThan(0.1)
    })

    it('standard deviation matches disorder strength W', () => {
      const W = 2.5
      const pot = generateDisorderPotential([64, 64], 2, W, 42, 'gaussian')
      let sum = 0
      let sum2 = 0
      for (let i = 0; i < pot.length; i++) {
        sum += pot[i]!
        sum2 += pot[i]! * pot[i]!
      }
      const mean = sum / pot.length
      const variance = sum2 / pot.length - mean * mean
      const stddev = Math.sqrt(variance)
      // σ should be close to W
      expect(stddev).toBeCloseTo(W, 0)
    })

    it('produces values beyond [-W/2, W/2] (Gaussian tails)', () => {
      const W = 1.0
      const pot = generateDisorderPotential([64, 64, 64], 3, W, 42, 'gaussian')
      // With ~260K samples from N(0,1), some should exceed ±0.5
      let hasLargeValue = false
      for (let i = 0; i < pot.length; i++) {
        if (Math.abs(pot[i]!) > W / 2) {
          hasLargeValue = true
          break
        }
      }
      expect(hasLargeValue).toBe(true)
    })
  })

  it('zero disorder strength produces zero potential', () => {
    const pot = generateDisorderPotential([32, 32], 2, 0, 42, 'uniform')
    for (let i = 0; i < pot.length; i++) {
      expect(Math.abs(pot[i]!)).toBe(0)
    }
  })
})
