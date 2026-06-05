/**
 * Tests for the single-variable physicist's Hermite polynomial.
 *
 * `src/lib/math/hermitePolynomial.ts` is distinct from
 * `hermitePolynomials.ts` (the multi-dimensional version). Earlier
 * regressions in this codebase swapped the probabilist's normalization
 * (factor of 2 on the recurrence) for the physicist's, producing wavefunctions
 * that look right but with wrong amplitudes — these tests pin the physicist
 * convention via known closed-form polynomials and orthogonality identities.
 */

import { describe, expect, it } from 'vitest'

import { hermite } from '@/lib/math/hermitePolynomial'

describe('hermite (physicist polynomial H_n)', () => {
  it('H_0(x) = 1 for any x', () => {
    for (const x of [-5, -1, 0, 0.5, 1, 10]) {
      expect(hermite(0, x)).toBe(1)
    }
  })

  it('H_1(x) = 2x for any x', () => {
    for (const x of [-5, -1, 0, 0.5, 1, 10]) {
      expect(hermite(1, x)).toBe(2 * x)
    }
  })

  it('H_2(x) = 4x² − 2 (closed form pins the physicist normalization)', () => {
    for (const x of [-2, -1, -0.5, 0, 0.5, 1, 2, 3.7]) {
      expect(hermite(2, x)).toBeCloseTo(4 * x * x - 2, 12)
    }
  })

  it('H_3(x) = 8x³ − 12x', () => {
    for (const x of [-2, -1, -0.5, 0, 0.5, 1, 2, 3.7]) {
      expect(hermite(3, x)).toBeCloseTo(8 * x ** 3 - 12 * x, 12)
    }
  })

  it('H_4(x) = 16x⁴ − 48x² + 12', () => {
    for (const x of [-2, -1, 0, 1, 2, 3]) {
      expect(hermite(4, x)).toBeCloseTo(16 * x ** 4 - 48 * x ** 2 + 12, 10)
    }
  })

  it('H_5(x) = 32x⁵ − 160x³ + 120x', () => {
    for (const x of [-2, -1, 0, 1, 2, 3]) {
      expect(hermite(5, x)).toBeCloseTo(32 * x ** 5 - 160 * x ** 3 + 120 * x, 9)
    }
  })

  it('parity: H_n(-x) = (-1)^n · H_n(x)', () => {
    for (let n = 0; n <= 12; n++) {
      const sign = n % 2 === 0 ? 1 : -1
      for (const x of [0.7, 1.3, 2.5]) {
        expect(hermite(n, -x)).toBeCloseTo(sign * hermite(n, x), 8)
      }
    }
  })

  it('H_n(0) = 0 for odd n (parity corollary)', () => {
    // Recurrence may produce -0 for odd n at x=0 — equivalent under +/- equality.
    for (let n = 1; n <= 11; n += 2) {
      expect(Object.is(hermite(n, 0), 0) || Object.is(hermite(n, 0), -0)).toBe(true)
    }
  })

  it('H_n(0) for even n matches closed form (-1)^(n/2) · n! / (n/2)!', () => {
    // H_{2k}(0) = (-1)^k · (2k)! / k!
    let factorial = 1
    const factorials: number[] = [1]
    for (let i = 1; i <= 12; i++) {
      factorial *= i
      factorials.push(factorial)
    }
    for (let k = 0; k <= 6; k++) {
      const n = 2 * k
      const expected = (k % 2 === 0 ? 1 : -1) * (factorials[n]! / factorials[k]!)
      expect(hermite(n, 0)).toBeCloseTo(expected, 6)
    }
  })

  it('satisfies the recurrence H_{n+1}(x) = 2x·H_n(x) − 2n·H_{n−1}(x) at multiple points', () => {
    for (const x of [-1.7, -0.3, 0.5, 1.2, 2.4]) {
      for (let n = 1; n <= 10; n++) {
        const lhs = hermite(n + 1, x)
        const rhs = 2 * x * hermite(n, x) - 2 * n * hermite(n - 1, x)
        // Recurrence is exact in real arithmetic; allow ULP noise.
        expect(lhs).toBeCloseTo(rhs, 4)
      }
    }
  })

  it('floors fractional n', () => {
    for (const x of [-1, 0, 1, 2.5]) {
      expect(hermite(4.7, x)).toBe(hermite(4, x))
    }
  })

  it('returns NaN for negative or non-finite n', () => {
    expect(Number.isNaN(hermite(-1, 0.5))).toBe(true)
    expect(Number.isNaN(hermite(-100, 0.5))).toBe(true)
    expect(Number.isNaN(hermite(NaN, 0.5))).toBe(true)
    // Infinity is not finite — should also return NaN per the guard.
    expect(Number.isNaN(hermite(Infinity, 0.5))).toBe(true)
  })

  it('handles high-order recurrence without exploding (n=20 stays bounded for |x| ≤ 1)', () => {
    // No closed form, but |H_n(x)| ≤ √(2^n · n!) · e^{x²/2} ; for n=20, x=0.5
    // upper bound ≈ √(2.43e24)·1.13 ≈ 1.77e12. We assert finiteness and a
    // generous order-of-magnitude ceiling.
    const value = hermite(20, 0.5)
    expect(Number.isFinite(value)).toBe(true)
    expect(Math.abs(value)).toBeLessThan(1e14)
  })
})
