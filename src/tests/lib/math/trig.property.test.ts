/**
 * Property-based tests for fast trig approximations (fsin, fcos).
 *
 * Verifies mathematical identities hold across arbitrary real angles,
 * catching boundary and wrap-around edge cases the example tests miss.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fcos, fsin } from '@/lib/math/trig'

// The fast trig functions have ~1.2% max error; use 0.06 absolute tolerance
const MAX_ERROR = 0.06

/** Arbitrary angle in a large range to stress normalization */
const arbAngle = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true })

/** Arbitrary angle in [-2π, 2π] for tighter-tolerance tests */
const arbSmallAngle = fc.double({
  min: -2 * Math.PI,
  max: 2 * Math.PI,
  noNaN: true,
  noDefaultInfinity: true,
})

// ---------------------------------------------------------------------------
// Bounded output
// ---------------------------------------------------------------------------

describe('fsin/fcos bounded output — properties', () => {
  it('fsin(x) ∈ [-1, 1] for all x', () => {
    fc.assert(
      fc.property(arbAngle, (x) => {
        const s = fsin(x)
        expect(s).toBeGreaterThanOrEqual(-1)
        expect(s).toBeLessThanOrEqual(1)
      })
    )
  })

  it('fcos(x) ∈ [-1, 1] for all x', () => {
    fc.assert(
      fc.property(arbAngle, (x) => {
        const c = fcos(x)
        expect(c).toBeGreaterThanOrEqual(-1)
        expect(c).toBeLessThanOrEqual(1)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Pythagorean identity
// ---------------------------------------------------------------------------

describe('Pythagorean identity — properties', () => {
  it('fsin²(x) + fcos²(x) ≈ 1', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        const s = fsin(x)
        const c = fcos(x)
        const sum = s * s + c * c
        // Fast trig compounds errors, so allow ~12% deviation
        expect(Math.abs(sum - 1)).toBeLessThan(0.12)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Periodicity
// ---------------------------------------------------------------------------

describe('periodicity — properties', () => {
  it('fsin(x) = fsin(x + 2π)', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        expect(fsin(x)).toBeCloseTo(fsin(x + 2 * Math.PI), 5)
      })
    )
  })

  it('fcos(x) = fcos(x + 2π)', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        expect(fcos(x)).toBeCloseTo(fcos(x + 2 * Math.PI), 5)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Symmetry
// ---------------------------------------------------------------------------

describe('symmetry — properties', () => {
  it('fsin is odd: fsin(-x) ≈ -fsin(x)', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        expect(Math.abs(fsin(-x) + fsin(x))).toBeLessThan(MAX_ERROR)
      })
    )
  })

  it('fcos is even: fcos(-x) ≈ fcos(x)', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        expect(Math.abs(fcos(-x) - fcos(x))).toBeLessThan(MAX_ERROR)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Phase shift identity
// ---------------------------------------------------------------------------

describe('phase shift — properties', () => {
  it('fcos(x) = fsin(x + π/2)', () => {
    fc.assert(
      fc.property(arbSmallAngle, (x) => {
        expect(fcos(x)).toBeCloseTo(fsin(x + Math.PI / 2), 5)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Approximation quality
// ---------------------------------------------------------------------------

describe('approximation quality — properties', () => {
  it('fsin(x) is within MAX_ERROR of Math.sin(x)', () => {
    fc.assert(
      fc.property(arbAngle, (x) => {
        expect(Math.abs(fsin(x) - Math.sin(x))).toBeLessThan(MAX_ERROR)
      })
    )
  })

  it('fcos(x) is within MAX_ERROR of Math.cos(x)', () => {
    fc.assert(
      fc.property(arbAngle, (x) => {
        expect(Math.abs(fcos(x) - Math.cos(x))).toBeLessThan(MAX_ERROR)
      })
    )
  })
})
