import { describe, expect, it } from 'vitest'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'

describe('computeRadialProbabilityNorm input sanitization', () => {
  it('normalizes fractional quantum numbers to physical integer values', () => {
    const normalized = computeRadialProbabilityNorm(2, 1, 1.0)
    const fractional = computeRadialProbabilityNorm(2.9, 1.2, 1.0)

    expect(fractional).toBeCloseTo(normalized, 10)
  })

  it('clamps azimuthal quantum number to l <= n - 1', () => {
    const clamped = computeRadialProbabilityNorm(3, 2, 1.0)
    const overflowL = computeRadialProbabilityNorm(3, 99, 1.0)

    expect(overflowL).toBeCloseTo(clamped, 10)
  })

  it('treats non-finite bohr radius as the minimum safe radius', () => {
    const safe = computeRadialProbabilityNorm(3, 1, 0.001)
    const nanA0 = computeRadialProbabilityNorm(3, 1, Number.NaN)

    expect(nanA0).toBeCloseTo(safe, 10)
  })
})
