import { describe, expect, it } from 'vitest'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'

describe('computeRadialProbabilityNorm', () => {
  it('returns a positive finite number for n=1, l=0 (1s orbital)', () => {
    const norm = computeRadialProbabilityNorm(1, 0, 1.0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('returns a positive finite number for n=2, l=0 (2s orbital)', () => {
    const norm = computeRadialProbabilityNorm(2, 0, 1.0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('returns a positive finite number for n=2, l=1 (2p orbital)', () => {
    const norm = computeRadialProbabilityNorm(2, 1, 1.0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('returns a positive finite number for n=3, l=2 (3d orbital)', () => {
    const norm = computeRadialProbabilityNorm(3, 2, 1.0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('returns a finite result for high quantum numbers (n=10, l=5)', () => {
    const norm = computeRadialProbabilityNorm(10, 5, 1.0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('scales with Bohr radius (larger a0 → different normalization)', () => {
    const normSmall = computeRadialProbabilityNorm(1, 0, 0.5)
    const normLarge = computeRadialProbabilityNorm(1, 0, 2.0)
    // Both should be finite and positive, but different
    expect(normSmall).toBeGreaterThan(0)
    expect(normLarge).toBeGreaterThan(0)
    expect(normSmall).not.toBeCloseTo(normLarge, 1)
  })

  it('normalizes 1s orbital peak probability close to 1.0', () => {
    // For the 1s orbital (n=1, l=0) with a0=1:
    // P(r) = 4πr²|R_10(r)|² peaks at r=a0=1
    // R_10(r) = 2*exp(-r), so P(1) = 4π * 1 * 4*exp(-2) = 16π*exp(-2) ≈ 6.78
    // norm should be ~1/6.78 ≈ 0.147
    const norm = computeRadialProbabilityNorm(1, 0, 1.0)
    const peakP = 4 * Math.PI * 1 * 1 * (2 * Math.exp(-1)) ** 2
    expect(norm * peakP).toBeCloseTo(1.0, 1)
  })

  it('clamps degenerate cases where l >= n to the physical maximum l = n - 1', () => {
    const clamped = computeRadialProbabilityNorm(1, 0, 1.0)
    const overflowL = computeRadialProbabilityNorm(1, 1, 1.0)
    expect(overflowL).toBeCloseTo(clamped, 10)
  })
})
