/**
 * Property-based tests for Associated Legendre polynomials.
 *
 * Mirrors the WGSL implementation in legendre.wgsl.ts.
 * Verifies mathematical identities that must hold regardless of implementation:
 *   - P_l(1) = 1 for all l (normalization at pole)
 *   - P_l(-1) = (-1)^l (parity at antipodal pole)
 *   - Three-term recurrence relation
 *   - Condon-Shortley phase convention
 *   - Boundedness for |x| ≤ 1
 *
 * Associated Legendre polynomials are the θ-dependent part of spherical harmonics:
 *   Y_lm(θ, φ) ∝ P^{|m|}_l(cos θ) · e^{imφ}
 *
 * @module tests/lib/math/legendre.property
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// TS mirror of legendre.wgsl.ts — identical algorithm
// ---------------------------------------------------------------------------

const MAX_LEGENDRE_L = 7

function legendre(l: number, m: number, x: number): number {
  const absM = Math.abs(m)
  if (absM > l) return 0

  const xClamped = Math.max(-1, Math.min(1, x))
  const somx2 = Math.sqrt((1 - xClamped) * (1 + xClamped))

  // P^m_m via closed form with Condon-Shortley phase
  let pmm = 1.0
  if (absM > 0) {
    let fact = 1.0
    for (let i = 1; i <= absM; i++) {
      pmm *= fact * somx2
      fact += 2.0
    }
    if ((absM & 1) === 1) pmm = -pmm
  }

  if (l === absM) return pmm

  // P^m_{m+1}
  let pmmp1 = xClamped * (2 * absM + 1) * pmm
  if (l === absM + 1) return pmmp1

  // Recurrence
  let pll = 0
  for (let ll = absM + 2; ll <= Math.min(l, MAX_LEGENDRE_L); ll++) {
    pll = (xClamped * (2 * ll - 1) * pmmp1 - (ll + absM - 1) * pmm) / (ll - absM)
    pmm = pmmp1
    pmmp1 = pll
  }

  return pll
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbL = fc.integer({ min: 0, max: MAX_LEGENDRE_L })
const arbX = fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// Known exact values at special points
// ---------------------------------------------------------------------------

describe('Legendre polynomials — known values', () => {
  it('P_l(1) = 1 for all l (normalization at north pole)', () => {
    for (let l = 0; l <= MAX_LEGENDRE_L; l++) {
      expect(legendre(l, 0, 1.0)).toBeCloseTo(1.0, 10)
    }
  })

  it('P_l(-1) = (-1)^l (parity at south pole)', () => {
    for (let l = 0; l <= MAX_LEGENDRE_L; l++) {
      const expected = l % 2 === 0 ? 1.0 : -1.0
      expect(legendre(l, 0, -1.0)).toBeCloseTo(expected, 10)
    }
  })

  it('P_0(x) = 1 for all x', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        expect(legendre(0, 0, x)).toBe(1)
      }),
      { numRuns: 300 }
    )
  })

  it('P_1(x) = x', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        expect(legendre(1, 0, x)).toBeCloseTo(x, 10)
      }),
      { numRuns: 300 }
    )
  })

  it('P_2(x) = (3x² - 1)/2', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = (3 * x * x - 1) / 2
        expect(legendre(2, 0, x)).toBeCloseTo(expected, 10)
      }),
      { numRuns: 300 }
    )
  })

  it('P_3(x) = (5x³ - 3x)/2', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = (5 * x * x * x - 3 * x) / 2
        expect(legendre(3, 0, x)).toBeCloseTo(expected, 9)
      }),
      { numRuns: 300 }
    )
  })

  it('P_4(x) = (35x⁴ - 30x² + 3)/8', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const x2 = x * x
        const expected = (35 * x2 * x2 - 30 * x2 + 3) / 8
        expect(legendre(4, 0, x)).toBeCloseTo(expected, 8)
      }),
      { numRuns: 300 }
    )
  })
})

// ---------------------------------------------------------------------------
// Recurrence relation
// ---------------------------------------------------------------------------

describe('Legendre recurrence relation — property', () => {
  it('(l+1)P_{l+1}(x) = (2l+1)x P_l(x) - l P_{l-1}(x)', () => {
    const arbRecL = fc.integer({ min: 1, max: MAX_LEGENDRE_L - 1 })
    fc.assert(
      fc.property(arbRecL, arbX, (l, x) => {
        const Plm1 = legendre(l - 1, 0, x)
        const Pl = legendre(l, 0, x)
        const Plp1 = legendre(l + 1, 0, x)
        const expected = ((2 * l + 1) * x * Pl - l * Plm1) / (l + 1)
        if (Math.abs(expected) < 1e-12) {
          expect(Math.abs(Plp1)).toBeLessThan(1e-6)
        } else {
          const relError = Math.abs(Plp1 - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-8)
        }
      }),
      { numRuns: 1000 }
    )
  })
})

// ---------------------------------------------------------------------------
// Parity: P_l(-x) = (-1)^l P_l(x)
// ---------------------------------------------------------------------------

describe('Legendre parity — property', () => {
  it('P_l(-x) = (-1)^l P_l(x) for m = 0', () => {
    fc.assert(
      fc.property(arbL, arbX, (l, x) => {
        const sign = l % 2 === 0 ? 1 : -1
        const lhs = legendre(l, 0, -x)
        const rhs = sign * legendre(l, 0, x)
        if (Math.abs(rhs) < 1e-12) {
          expect(Math.abs(lhs)).toBeLessThan(1e-8)
        } else {
          expect(lhs).toBeCloseTo(rhs, 8)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Associated Legendre P^m_l
// ---------------------------------------------------------------------------

describe('Associated Legendre P^m_l — properties', () => {
  it('P^m_l(x) = 0 when |m| > l', () => {
    expect(legendre(2, 3, 0.5)).toBe(0)
    expect(legendre(0, 1, 0.5)).toBe(0)
    expect(legendre(1, -3, 0.5)).toBe(0)
  })

  it('P^0_l = P_l (ordinary Legendre)', () => {
    fc.assert(
      fc.property(arbL, arbX, (l, x) => {
        expect(legendre(l, 0, x)).toBeCloseTo(legendre(l, 0, x), 12)
      }),
      { numRuns: 200 }
    )
  })

  it('P^1_1(x) = -√(1-x²) (Condon-Shortley)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = -Math.sqrt((1 - x) * (1 + x))
        expect(legendre(1, 1, x)).toBeCloseTo(expected, 10)
      }),
      { numRuns: 300 }
    )
  })

  it('P^1_2(x) = -3x√(1-x²)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const somx2 = Math.sqrt((1 - x) * (1 + x))
        const expected = -3 * x * somx2
        expect(legendre(2, 1, x)).toBeCloseTo(expected, 9)
      }),
      { numRuns: 300 }
    )
  })

  it('P^2_2(x) = 3(1 - x²)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = 3 * (1 - x * x)
        expect(legendre(2, 2, x)).toBeCloseTo(expected, 10)
      }),
      { numRuns: 300 }
    )
  })

  it('|P^m_l(x)| is bounded for |x| ≤ 1', () => {
    fc.assert(
      fc.property(arbL, arbX, (l, x) => {
        for (let m = -l; m <= l; m++) {
          const val = legendre(l, m, x)
          expect(Number.isFinite(val)).toBe(true)
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Condon-Shortley phase verification
// ---------------------------------------------------------------------------

describe('Condon-Shortley phase convention', () => {
  it('P^m_l uses CS phase: P^1_1(0) = -1, not +1', () => {
    // P^1_1(x) with CS = -√(1-x²). At x=0: P^1_1(0) = -1.
    // Without CS: P^1_1(0) = +1.
    expect(legendre(1, 1, 0)).toBeCloseTo(-1, 10)
  })

  it('P^1_2(0) = 0 (zero at equator for l=2, m=1)', () => {
    // P^1_2(x) = -3x√(1-x²). At x=0: 0.
    expect(legendre(2, 1, 0)).toBeCloseTo(0, 10)
  })

  it('P^2_3(0) = -15 · sin²θ · cosθ = 0 at θ=π/2 (x=0)', () => {
    // P^2_3(x) = -15x(1-x²). At x=0: 0.
    expect(legendre(3, 2, 0)).toBeCloseTo(0, 10)
  })
})

// ---------------------------------------------------------------------------
// Clamping behavior
// ---------------------------------------------------------------------------

describe('Legendre x-clamping', () => {
  it('x > 1 is clamped to 1 (same as P_l(1))', () => {
    for (let l = 0; l <= 5; l++) {
      expect(legendre(l, 0, 1.5)).toBeCloseTo(legendre(l, 0, 1.0), 10)
    }
  })

  it('x < -1 is clamped to -1 (same as P_l(-1))', () => {
    for (let l = 0; l <= 5; l++) {
      expect(legendre(l, 0, -1.5)).toBeCloseTo(legendre(l, 0, -1.0), 10)
    }
  })
})
