import { describe, expect, it } from 'vitest'

import { generateDisorderPotential } from '@/lib/physics/anderson/disorderPotential'

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
