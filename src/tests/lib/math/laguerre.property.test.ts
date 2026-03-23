/**
 * Property-based tests for Associated Laguerre polynomials.
 *
 * Mirrors the WGSL implementation in laguerre.wgsl.ts.
 * Verifies mathematical identities that must hold regardless of implementation:
 *   - Three-term recurrence relation
 *   - Known exact values at special points
 *   - Consistency with textbook closed-form expressions
 *
 * The Laguerre polynomials are used in hydrogen radial wavefunctions:
 *   R_nl(r) ∝ ρ^l · L^{2l+1}_{n-l-1}(ρ) · e^{-ρ/2}
 *
 * @module tests/lib/math/laguerre.property
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// TS mirror of laguerre.wgsl.ts — same algorithm, same edge cases
// ---------------------------------------------------------------------------

const MAX_LAGUERRE_K = 7

function laguerre(k: number, alpha: number, x: number): number {
  if (k < 0) return 0
  if (k === 0) return 1
  const L1 = 1 + alpha - x
  if (k === 1) return L1
  const kClamped = Math.min(k, MAX_LAGUERRE_K)
  let Lkm1 = 1
  let Lk = L1
  for (let i = 1; i < kClamped; i++) {
    const Lkp1 = ((2 * i + 1 + alpha - x) * Lk - (i + alpha) * Lkm1) / (i + 1)
    Lkm1 = Lk
    Lk = Lkp1
  }
  return Lk
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Associated parameter (typically 2l+1 for hydrogen, so 1..13) */
const arbAlpha = fc.double({ min: 0, max: 13, noNaN: true, noDefaultInfinity: true })

/** Evaluation point in a moderate range */
const arbX = fc.double({ min: -5, max: 30, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// Known exact values
// ---------------------------------------------------------------------------

describe('Laguerre polynomials — known values', () => {
  it('L^α_0(x) = 1 for all α, x', () => {
    fc.assert(
      fc.property(arbAlpha, arbX, (alpha, x) => {
        expect(laguerre(0, alpha, x)).toBe(1)
      }),
      { numRuns: 500 }
    )
  })

  it('L^α_1(x) = 1 + α - x', () => {
    fc.assert(
      fc.property(arbAlpha, arbX, (alpha, x) => {
        const expected = 1 + alpha - x
        expect(laguerre(1, alpha, x)).toBeCloseTo(expected, 10)
      }),
      { numRuns: 500 }
    )
  })

  it('L^0_n(0) = 1 for all n (generating function identity)', () => {
    // L^0_n(0) = C(n, n) = 1 from the explicit formula
    for (let n = 0; n <= MAX_LAGUERRE_K; n++) {
      expect(laguerre(n, 0, 0)).toBeCloseTo(1, 10)
    }
  })

  it('L^α_2(x) = ½[(α+1)(α+2) - 2(α+2)x + x²]', () => {
    fc.assert(
      fc.property(arbAlpha, arbX, (alpha, x) => {
        const expected = 0.5 * ((alpha + 1) * (alpha + 2) - 2 * (alpha + 2) * x + x * x)
        const actual = laguerre(2, alpha, x)
        if (Math.abs(expected) < 1e-10) {
          expect(Math.abs(actual)).toBeLessThan(1e-4)
        } else {
          const relError = Math.abs(actual - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-8)
        }
      }),
      { numRuns: 500 }
    )
  })

  it('returns 0 for k < 0', () => {
    expect(laguerre(-1, 0, 0)).toBe(0)
    expect(laguerre(-5, 3, 2)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Recurrence relation
// ---------------------------------------------------------------------------

describe('Laguerre recurrence relation — property', () => {
  it('(k+1)L^α_{k+1}(x) = (2k+1+α-x)L^α_k(x) - (k+α)L^α_{k-1}(x)', () => {
    const arbRecK = fc.integer({ min: 1, max: MAX_LAGUERRE_K - 1 })
    fc.assert(
      fc.property(arbRecK, arbAlpha, arbX, (k, alpha, x) => {
        const Lkm1 = laguerre(k - 1, alpha, x)
        const Lk = laguerre(k, alpha, x)
        const Lkp1 = laguerre(k + 1, alpha, x)
        const expected = ((2 * k + 1 + alpha - x) * Lk - (k + alpha) * Lkm1) / (k + 1)
        if (Math.abs(expected) < 1e-10) {
          expect(Math.abs(Lkp1)).toBeLessThan(1e-4)
        } else {
          const relError = Math.abs(Lkp1 - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-8)
        }
      }),
      { numRuns: 1000 }
    )
  })
})

// ---------------------------------------------------------------------------
// Ordinary Laguerre (α=0) specific identities
// ---------------------------------------------------------------------------

describe('Ordinary Laguerre L_n(x) — properties', () => {
  it('L_n(0) = 1 for all n', () => {
    for (let n = 0; n <= MAX_LAGUERRE_K; n++) {
      expect(laguerre(n, 0, 0)).toBeCloseTo(1, 10)
    }
  })

  it('L_1(x) = 1 - x', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        expect(laguerre(1, 0, x)).toBeCloseTo(1 - x, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('L_2(x) = 1 - 2x + x²/2', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = 1 - 2 * x + (x * x) / 2
        expect(laguerre(2, 0, x)).toBeCloseTo(expected, 8)
      }),
      { numRuns: 200 }
    )
  })

  it('L_3(x) = 1 - 3x + 3x²/2 - x³/6', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = 1 - 3 * x + (3 * x * x) / 2 - (x * x * x) / 6
        const actual = laguerre(3, 0, x)
        if (Math.abs(expected) < 1e-10) {
          expect(Math.abs(actual)).toBeLessThan(1e-4)
        } else {
          const relError = Math.abs(actual - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-6)
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Hydrogen-relevant α values
// ---------------------------------------------------------------------------

describe('Laguerre with hydrogen α = 2l+1', () => {
  it('L^1_1(x) = 2 - x (hydrogen n=2, l=0: k=1, α=1)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        expect(laguerre(1, 1, x)).toBeCloseTo(2 - x, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('L^3_1(x) = 4 - x (hydrogen n=3, l=1: k=1, α=3)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        expect(laguerre(1, 3, x)).toBeCloseTo(4 - x, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('L^1_2(x) = ½(x² - 6x + 6) (hydrogen n=3, l=0: k=2, α=1)', () => {
    fc.assert(
      fc.property(arbX, (x) => {
        const expected = 0.5 * (x * x - 6 * x + 6)
        const actual = laguerre(2, 1, x)
        if (Math.abs(expected) < 1e-10) {
          expect(Math.abs(actual)).toBeLessThan(1e-4)
        } else {
          const relError = Math.abs(actual - expected) / Math.abs(expected)
          expect(relError).toBeLessThan(1e-8)
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Degree clamping (WGSL guard)
// ---------------------------------------------------------------------------

describe('Laguerre degree clamping', () => {
  it('k > MAX_LAGUERRE_K is clamped (does not diverge or crash)', () => {
    // The WGSL clamps k to MAX_LAGUERRE_K. Verify the TS mirror does the same.
    const result = laguerre(20, 0, 1)
    expect(Number.isFinite(result)).toBe(true)
  })
})
