import { describe, expect, it } from 'vitest'

import {
  computeHydrogenRadialProbabilityDensity,
  computeHydrogenRadialWavefunction,
  computeRadialProbabilityNorm,
} from '@/lib/math/hydrogenRadialProbability'

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

  it('bounds extreme finite bohr radius before scanning radial probability', () => {
    const bounded = computeRadialProbabilityNorm(3, 1, 1_000_000)
    const extreme = computeRadialProbabilityNorm(3, 1, Number.MAX_VALUE)

    expect(Number.isFinite(extreme)).toBe(true)
    expect(extreme).toBeGreaterThan(0)
    expect(extreme).toBeCloseTo(bounded, 10)
  })

  it('returns finite values for extreme finite chart radii', () => {
    const wavefunction = computeHydrogenRadialWavefunction(2, 0, Number.MAX_VALUE, 1.0, 3)
    const density = computeHydrogenRadialProbabilityDensity(2, 0, Number.MAX_VALUE, 1.0, 3)

    expect(Number.isFinite(wavefunction)).toBe(true)
    expect(Number.isFinite(density)).toBe(true)
    expect(density).toBeGreaterThanOrEqual(0)
  })

  it('sanitizes dimension before using D-dimensional hydrogen math', () => {
    const safe3D = computeRadialProbabilityNorm(2, 1, 1.0, 3)
    const safe2D = computeRadialProbabilityNorm(2, 1, 1.0, 2)
    const safe11D = computeRadialProbabilityNorm(2, 1, 1.0, 11)

    expect(safe2D).not.toBeCloseTo(safe3D, 12)
    expect(safe11D).not.toBeCloseTo(safe3D, 12)

    expect(computeRadialProbabilityNorm(2, 1, 1.0, Number.NaN)).toBeCloseTo(safe3D, 10)
    expect(computeRadialProbabilityNorm(2, 1, 1.0, 1)).toBeCloseTo(safe2D, 10)
    expect(computeRadialProbabilityNorm(2, 1, 1.0, 99)).toBeCloseTo(safe11D, 10)
  })
})
