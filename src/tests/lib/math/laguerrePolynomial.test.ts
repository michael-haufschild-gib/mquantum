/**
 * Tests for associated Laguerre polynomial L_p^α(x).
 *
 * Verifies the three-term recurrence implementation against:
 * - Known closed-form values for low orders
 * - L_n^α(0) = C(n+α, n) identity
 * - Hydrogen orbital quantum number cases
 * - Edge cases (negative p, non-finite input)
 */

import { describe, expect, it } from 'vitest'

import { associatedLaguerre } from '@/lib/math/laguerrePolynomial'

describe('associatedLaguerre', () => {
  // ── Base cases ──
  it('L_0^α(x) = 1 for any α and x', () => {
    expect(associatedLaguerre(0, 0, 0)).toBe(1)
    expect(associatedLaguerre(0, 5, 10)).toBe(1)
    expect(associatedLaguerre(0, 2.5, -3)).toBe(1)
  })

  it('L_1^α(x) = 1 + α - x', () => {
    expect(associatedLaguerre(1, 0, 0)).toBe(1) // 1 + 0 - 0
    expect(associatedLaguerre(1, 0, 1)).toBe(0) // 1 + 0 - 1
    expect(associatedLaguerre(1, 3, 2)).toBe(2) // 1 + 3 - 2
    expect(associatedLaguerre(1, 1, 5)).toBe(-3) // 1 + 1 - 5
  })

  // ── Known closed-form values ──
  it('L_2^0(x) = 1 - 2x + x²/2', () => {
    // L_2^0(0) = 1
    expect(associatedLaguerre(2, 0, 0)).toBeCloseTo(1)
    // L_2^0(2) = 1 - 4 + 2 = -1
    expect(associatedLaguerre(2, 0, 2)).toBeCloseTo(-1)
    // L_2^0(4) = 1 - 8 + 8 = 1
    expect(associatedLaguerre(2, 0, 4)).toBeCloseTo(1)
  })

  it('L_2^1(x) = (x² - 6x + 6) / 2', () => {
    // L_2^1(0) = 3
    expect(associatedLaguerre(2, 1, 0)).toBeCloseTo(3)
    // L_2^1(2) = (4 - 12 + 6) / 2 = -1
    expect(associatedLaguerre(2, 1, 2)).toBeCloseTo(-1)
    // L_2^1(6) = (36 - 36 + 6) / 2 = 3
    expect(associatedLaguerre(2, 1, 6)).toBeCloseTo(3)
  })

  it('L_3^0(x) = 1 - 3x + 3x²/2 - x³/6', () => {
    // L_3^0(0) = 1
    expect(associatedLaguerre(3, 0, 0)).toBeCloseTo(1)
    // L_3^0(3) = 1 - 9 + 13.5 - 4.5 = 1
    expect(associatedLaguerre(3, 0, 3)).toBeCloseTo(1)
  })

  // ── Identity: L_n^α(0) = C(n+α, n) = (n+α)! / (n! α!) for integer α ──
  it('L_n^α(0) = binomial(n+α, n) for integer α', () => {
    // L_3^0(0) = C(3,3) = 1
    expect(associatedLaguerre(3, 0, 0)).toBeCloseTo(1)
    // L_2^3(0) = C(5,2) = 10
    expect(associatedLaguerre(2, 3, 0)).toBeCloseTo(10)
    // L_3^2(0) = C(5,3) = 10
    expect(associatedLaguerre(3, 2, 0)).toBeCloseTo(10)
    // L_4^1(0) = C(5,4) = 5
    expect(associatedLaguerre(4, 1, 0)).toBeCloseTo(5)
  })

  // ── Hydrogen orbital cases: L_{n-l-1}^{2l+1}(ρ) ──
  it('hydrogen 1s: L_0^1(ρ) = 1', () => {
    // n=1, l=0: p=0, α=1
    expect(associatedLaguerre(0, 1, 0.5)).toBe(1)
  })

  it('hydrogen 2s: L_1^1(ρ) = 2 - ρ', () => {
    // n=2, l=0: p=1, α=1
    expect(associatedLaguerre(1, 1, 0)).toBeCloseTo(2)
    expect(associatedLaguerre(1, 1, 1)).toBeCloseTo(1)
    expect(associatedLaguerre(1, 1, 2)).toBeCloseTo(0)
  })

  it('hydrogen 2p: L_0^3(ρ) = 1', () => {
    // n=2, l=1: p=0, α=3
    expect(associatedLaguerre(0, 3, 1.5)).toBe(1)
  })

  it('hydrogen 3p: L_1^3(ρ) = 4 - ρ', () => {
    // n=3, l=1: p=1, α=3
    expect(associatedLaguerre(1, 3, 0)).toBeCloseTo(4)
    expect(associatedLaguerre(1, 3, 4)).toBeCloseTo(0)
  })

  it('hydrogen 3d: L_0^5(ρ) = 1', () => {
    // n=3, l=2: p=0, α=5
    expect(associatedLaguerre(0, 5, 2)).toBe(1)
  })

  // ── Edge cases ──
  it('returns 0 for negative p', () => {
    expect(associatedLaguerre(-1, 0, 1)).toBe(0)
    expect(associatedLaguerre(-5, 3, 2)).toBe(0)
  })

  it('returns NaN for non-finite p', () => {
    expect(associatedLaguerre(NaN, 0, 1)).toBeNaN()
    expect(associatedLaguerre(Infinity, 0, 1)).toBeNaN()
  })

  it('floors non-integer p', () => {
    // L_2.7^0(x) should behave as L_2^0(x)
    expect(associatedLaguerre(2.7, 0, 0)).toBeCloseTo(associatedLaguerre(2, 0, 0))
    expect(associatedLaguerre(2.7, 0, 2)).toBeCloseTo(associatedLaguerre(2, 0, 2))
  })

  // ── Higher-order accuracy ──
  it('computes L_10^0(x) accurately at x=5', () => {
    // L_10^0(5) = sum_{k=0}^{10} (-1)^k C(10,k) 5^k / k! ≈ 1.7563
    const val = associatedLaguerre(10, 0, 5)
    expect(Number.isFinite(val)).toBe(true)
    expect(val).toBeCloseTo(1.7563, 2)
  })
})
