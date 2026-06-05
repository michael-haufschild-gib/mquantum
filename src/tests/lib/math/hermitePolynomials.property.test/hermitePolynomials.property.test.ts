/**
 * Property-based tests for Hermite polynomials and HO wavefunctions.
 *
 * Uses fast-check to verify mathematical identities across continuous ranges
 * of x and all supported quantum numbers n=0..6, catching numerical edge
 * cases that hand-picked test points miss.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Mirror of WGSL Hermite polynomial (same as shader implementation)
// ---------------------------------------------------------------------------

function hermite(n: number, u: number): number {
  switch (n) {
    case 0:
      return 1
    case 1:
      return 2 * u
    case 2:
      return 4 * u * u - 2
    case 3:
      return 8 * u * u * u - 12 * u
    case 4: {
      const u2 = u * u
      return 16 * u2 * u2 - 48 * u2 + 12
    }
    case 5: {
      const u2 = u * u
      return 32 * u2 * u2 * u - 160 * u2 * u + 120 * u
    }
    case 6: {
      const u2 = u * u
      return 64 * u2 * u2 * u2 - 480 * u2 * u2 + 720 * u2 - 120
    }
    default:
      return 0
  }
}

// ---------------------------------------------------------------------------
// HO wavefunction mirror
// ---------------------------------------------------------------------------

const INV_PI = 1 / Math.PI
const HO_NORM = [
  1.0, 0.707106781187, 0.353553390593, 0.144337567297, 0.051031036308, 0.0161374306092,
  0.00465847495312,
]

function ho1D(n: number, x: number, omega: number): number {
  const alpha = Math.sqrt(Math.max(omega, 0.01))
  const u = alpha * x
  const gauss = Math.exp(-0.5 * u * u)
  const H = hermite(n, u)
  const alphaNorm = Math.sqrt(Math.sqrt(alpha * alpha * INV_PI))
  return alphaNorm * HO_NORM[n]! * H * gauss
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Quantum number n in supported range */
const arbN = fc.integer({ min: 0, max: 6 })

/** x in a moderate range where polynomials don't overflow */
const arbX = fc.double({ min: -8, max: 8, noNaN: true, noDefaultInfinity: true })

/** Positive omega */
const arbOmega = fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// Hermite polynomial identities
// ---------------------------------------------------------------------------

describe('Hermite recurrence relation — property', () => {
  it('H_{n+1}(x) = 2x H_n(x) - 2n H_{n-1}(x) for n=1..5, all x', () => {
    const arbRecurrenceN = fc.integer({ min: 1, max: 5 })
    fc.assert(
      fc.property(arbRecurrenceN, arbX, (n, x) => {
        const expected = 2 * x * hermite(n, x) - 2 * n * hermite(n - 1, x)
        const actual = hermite(n + 1, x)
        if (Math.abs(expected) < 1e-10) {
          expect(Math.abs(actual)).toBeLessThan(1e-4)
        } else {
          const relError = Math.abs(actual - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-6)
        }
      }),
      { numRuns: 1000 }
    )
  })
})

describe('Hermite parity — property', () => {
  it('even n: H_n(-x) = H_n(x)', () => {
    const arbEvenN = fc.constantFrom(0, 2, 4, 6)
    fc.assert(
      fc.property(arbEvenN, arbX, (n, x) => {
        expect(hermite(n, -x)).toBeCloseTo(hermite(n, x), 8)
      }),
      { numRuns: 500 }
    )
  })

  it('odd n: H_n(-x) = -H_n(x)', () => {
    const arbOddN = fc.constantFrom(1, 3, 5)
    fc.assert(
      fc.property(arbOddN, arbX, (n, x) => {
        expect(hermite(n, -x)).toBeCloseTo(-hermite(n, x), 8)
      }),
      { numRuns: 500 }
    )
  })
})

describe('Hermite derivative relation — property', () => {
  it("H_n'(x) = 2n H_{n-1}(x) via numerical differentiation", () => {
    const arbDerivN = fc.integer({ min: 1, max: 6 })
    // Avoid large |x| where h-step error dominates
    const arbMidX = fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true })
    fc.assert(
      fc.property(arbDerivN, arbMidX, (n, x) => {
        const h = 1e-5
        const numericalDeriv = (hermite(n, x + h) - hermite(n, x - h)) / (2 * h)
        const exactDeriv = 2 * n * hermite(n - 1, x)
        if (Math.abs(exactDeriv) < 1e-6) {
          expect(Math.abs(numericalDeriv)).toBeLessThan(0.1)
        } else {
          const relError = Math.abs(numericalDeriv - exactDeriv) / Math.abs(exactDeriv)
          expect(relError).toBeLessThan(0.01)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// HO wavefunction properties
// ---------------------------------------------------------------------------

describe('HO wavefunction — properties', () => {
  it('decays exponentially: |ψ(far)| < 0.01 * |ψ(near)| for ground state', () => {
    fc.assert(
      fc.property(arbOmega, (omega) => {
        // Use omega-dependent positions: characteristic length ~ 1/√omega
        const charLen = 1 / Math.sqrt(omega)
        const nearX = 2 * charLen
        const farX = 5 * charLen
        const nearVal = Math.abs(ho1D(0, nearX, omega))
        const farVal = Math.abs(ho1D(0, farX, omega))
        if (nearVal < 1e-15) return
        expect(farVal).toBeLessThan(nearVal * 0.01)
      }),
      { numRuns: 200 }
    )
  })

  it('ground state (n=0) is positive for all x', () => {
    fc.assert(
      fc.property(arbX, arbOmega, (x, omega) => {
        expect(ho1D(0, x, omega)).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 500 }
    )
  })

  it('parity: ψ_n(-x) = (-1)^n ψ_n(x)', () => {
    fc.assert(
      fc.property(arbN, arbX, arbOmega, (n, x, omega) => {
        const sign = n % 2 === 0 ? 1 : -1
        const lhs = ho1D(n, -x, omega)
        const rhs = sign * ho1D(n, x, omega)
        if (Math.abs(rhs) < 1e-12) {
          expect(Math.abs(lhs)).toBeLessThan(1e-8)
        } else {
          expect(lhs).toBeCloseTo(rhs, 5)
        }
      }),
      { numRuns: 500 }
    )
  })

  it('higher omega narrows the wavefunction (ground state)', () => {
    // Test at x values well beyond the characteristic width of the high-omega gaussian
    // ψ_0(x,ω) ∝ ω^{1/4} exp(-ωx²/2), so for high ω the gaussian is narrower.
    // At x > 1/√(ω_low) the ordering is guaranteed.
    const arbXFar = fc.double({ min: 2, max: 6, noNaN: true, noDefaultInfinity: true })
    fc.assert(
      fc.property(arbXFar, (x) => {
        const lowOmega = Math.abs(ho1D(0, x, 0.5))
        const highOmega = Math.abs(ho1D(0, x, 4.0))
        expect(highOmega).toBeLessThanOrEqual(lowOmega + 1e-10)
      }),
      { numRuns: 200 }
    )
  })
})
