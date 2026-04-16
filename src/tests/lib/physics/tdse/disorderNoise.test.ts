import { describe, expect, it } from 'vitest'

import { generateDisorderNoise } from '@/lib/physics/tdse/disorderNoise'

describe('generateDisorderNoise', () => {
  it('generates correct number of samples', () => {
    const noise = generateDisorderNoise(1000, 42)
    expect(noise).toHaveLength(1000)
  })

  it('values are in [-0.5, +0.5]', () => {
    const noise = generateDisorderNoise(10000, 42)
    for (let i = 0; i < noise.length; i++) {
      expect(noise[i]).toBeGreaterThanOrEqual(-0.5)
      expect(noise[i]).toBeLessThan(0.5)
    }
  })

  it('is reproducible with same seed', () => {
    const a = generateDisorderNoise(100, 42)
    const b = generateDisorderNoise(100, 42)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i])
    }
  })

  it('different seeds produce different noise', () => {
    const a = generateDisorderNoise(100, 42)
    const b = generateDisorderNoise(100, 43)
    let sameCount = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(10)
  })

  it('has approximately zero mean (uniform [-0.5, 0.5])', () => {
    const noise = generateDisorderNoise(100000, 42)
    let sum = 0
    for (let i = 0; i < noise.length; i++) sum += noise[i]!
    const mean = sum / noise.length
    expect(Math.abs(mean)).toBeLessThan(0.01)
  })

  it('has approximately correct variance (1/12 for uniform [-0.5, 0.5])', () => {
    const noise = generateDisorderNoise(100000, 42)
    let sum = 0
    let sum2 = 0
    for (let i = 0; i < noise.length; i++) {
      sum += noise[i]!
      sum2 += noise[i]! * noise[i]!
    }
    const mean = sum / noise.length
    const variance = sum2 / noise.length - mean * mean
    // Theoretical variance = 1/12 ≈ 0.0833
    expect(variance).toBeCloseTo(1 / 12, 2)
  })

  it('gaussian distribution differs from uniform for the same seed', () => {
    const uniform = generateDisorderNoise(4096, 42, 'uniform')
    const gaussian = generateDisorderNoise(4096, 42, 'gaussian')
    let sameCount = 0
    for (let i = 0; i < uniform.length; i++) {
      if (uniform[i] === gaussian[i]) sameCount++
    }
    // The samplers emit completely different values for the same seed.
    expect(sameCount).toBeLessThan(10)
  })

  it('gaussian has ~unit variance and zero mean', () => {
    const noise = generateDisorderNoise(100000, 7, 'gaussian')
    let sum = 0
    let sum2 = 0
    for (let i = 0; i < noise.length; i++) {
      sum += noise[i]!
      sum2 += noise[i]! * noise[i]!
    }
    const mean = sum / noise.length
    const variance = sum2 / noise.length - mean * mean
    expect(Math.abs(mean)).toBeLessThan(0.02)
    expect(variance).toBeCloseTo(1, 1)
  })

  it('gaussian is reproducible with same seed', () => {
    const a = generateDisorderNoise(256, 99, 'gaussian')
    const b = generateDisorderNoise(256, 99, 'gaussian')
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i])
    }
  })
})
