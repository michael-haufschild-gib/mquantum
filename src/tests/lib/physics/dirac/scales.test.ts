import { describe, it, expect } from 'vitest'
import {
  comptonWavelength,
  zitterbewegungFrequency,
  kleinThreshold,
  relativisticEnergy,
  maxStableDt,
  spinorSize,
} from '@/lib/physics/dirac/scales'

describe('comptonWavelength', () => {
  it('returns ℏ/(mc) for standard parameters', () => {
    // ℏ=1, m=1, c=1 → λ_C = 1
    expect(comptonWavelength(1, 1, 1)).toBeCloseTo(1, 10)
  })

  it('scales inversely with mass', () => {
    expect(comptonWavelength(1, 2, 1)).toBeCloseTo(0.5, 10)
    expect(comptonWavelength(1, 0.5, 1)).toBeCloseTo(2, 10)
  })

  it('returns Infinity when mass*c = 0', () => {
    expect(comptonWavelength(1, 0, 1)).toBe(Infinity)
    expect(comptonWavelength(1, 1, 0)).toBe(Infinity)
  })
})

describe('zitterbewegungFrequency', () => {
  it('returns 2mc²/ℏ for standard parameters', () => {
    // m=1, c=1, ℏ=1 → ω_Z = 2
    expect(zitterbewegungFrequency(1, 1, 1)).toBeCloseTo(2, 10)
  })

  it('scales linearly with mass', () => {
    expect(zitterbewegungFrequency(3, 1, 1)).toBeCloseTo(6, 10)
  })

  it('scales quadratically with c', () => {
    expect(zitterbewegungFrequency(1, 2, 1)).toBeCloseTo(8, 10)
  })

  it('returns Infinity when ℏ = 0', () => {
    expect(zitterbewegungFrequency(1, 1, 0)).toBe(Infinity)
  })
})

describe('kleinThreshold', () => {
  it('returns 2mc² for standard parameters', () => {
    expect(kleinThreshold(1, 1)).toBeCloseTo(2, 10)
  })

  it('scales with mass and c²', () => {
    expect(kleinThreshold(0.5, 2)).toBeCloseTo(4, 10) // 2 * 0.5 * 4 = 4
    expect(kleinThreshold(3, 1)).toBeCloseTo(6, 10)
  })
})

describe('relativisticEnergy', () => {
  it('returns mc² at rest (p=0)', () => {
    expect(relativisticEnergy(0, 1, 1)).toBeCloseTo(1, 10)
    expect(relativisticEnergy(0, 2, 3)).toBeCloseTo(18, 10) // 2*9 = 18
  })

  it('returns |p|c for massless particles', () => {
    expect(relativisticEnergy(5, 0, 1)).toBeCloseTo(5, 10)
    expect(relativisticEnergy(3, 0, 2)).toBeCloseTo(6, 10)
  })

  it('satisfies E² = (pc)² + (mc²)² for arbitrary inputs', () => {
    const p = 3, m = 4, c = 2
    const E = relativisticEnergy(p, m, c)
    expect(E * E).toBeCloseTo((p * c) ** 2 + (m * c * c) ** 2, 8)
  })
})

describe('maxStableDt', () => {
  it('returns min(Δx) / (c√N) for uniform spacing', () => {
    // 3D, Δx=0.15, c=1 → 0.15 / √3 ≈ 0.08660
    const dt = maxStableDt([0.15, 0.15, 0.15], 1)
    expect(dt).toBeCloseTo(0.15 / Math.sqrt(3), 10)
  })

  it('uses minimum spacing across dimensions', () => {
    const dt = maxStableDt([0.2, 0.1, 0.15], 1)
    expect(dt).toBeCloseTo(0.1 / Math.sqrt(3), 10)
  })

  it('scales inversely with c', () => {
    const dt1 = maxStableDt([0.15], 1)
    const dt2 = maxStableDt([0.15], 2)
    expect(dt2).toBeCloseTo(dt1 / 2, 10)
  })

  it('returns Infinity for empty spacing or c=0', () => {
    expect(maxStableDt([], 1)).toBe(Infinity)
    expect(maxStableDt([0.1], 0)).toBe(Infinity)
  })
})

describe('spinorSize', () => {
  it('matches 2^floor((N+1)/2) formula', () => {
    const expected = [2, 2, 4, 4, 8, 8, 16, 16, 32, 32, 64]
    for (let d = 1; d <= 11; d++) {
      expect(spinorSize(d)).toBe(expected[d - 1])
    }
  })
})
