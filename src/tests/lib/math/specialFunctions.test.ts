/**
 * Tests for special mathematical functions used by quantum physics computations.
 *
 * `factorial`, `lnFactorial`, and `lnGammaHalf` are LUT-backed primitives that
 * appear in normalization constants for hydrogen orbitals, Hermite recurrences,
 * Laguerre weights, and AdS-spectrum coefficients. A silently-wrong LUT entry
 * propagates into wavefunction normalization and would not be caught by
 * higher-level integration tests because most normalizations cancel pairs of
 * the same wrong value. These tests pin every constant via independent
 * recurrence checks rather than just spot-checking a few values.
 */

import { describe, expect, it } from 'vitest'

import { factorial, lnFactorial, lnGammaHalf } from '@/lib/math/specialFunctions'

describe('factorial', () => {
  it('returns exact integer values for n in [0, 21] (f64-exact range)', () => {
    // n! is exactly representable in f64 for n ≤ 18; we still expect exact
    // recurrence results for n ≤ 21 because the LUT was built that way.
    let acc = 1
    for (let n = 0; n <= 21; n++) {
      expect(factorial(n)).toBe(acc)
      acc *= n + 1
    }
  })

  it('matches the recurrence n! = n·(n−1)! across the full LUT (n in [1, 170])', () => {
    for (let n = 1; n <= 170; n++) {
      const ratio = factorial(n) / factorial(n - 1)
      // 170! / 169! ≈ 170 — relative error should be sub-ULP for the LUT.
      expect(ratio).toBeCloseTo(n, 5)
    }
  })

  it('returns NaN for negative integers, NaN for non-finite, Infinity above LUT', () => {
    expect(Number.isNaN(factorial(-1))).toBe(true)
    expect(Number.isNaN(factorial(-100))).toBe(true)
    expect(Number.isNaN(factorial(NaN))).toBe(true)
    expect(Number.isNaN(factorial(-Infinity))).toBe(true)
    // factorial(Infinity) returns NaN per the !isFinite guard, not Infinity.
    expect(Number.isNaN(factorial(Infinity))).toBe(true)
    // 171! overflows f64 (~1.24e308 max representable, 171! ≈ 1.24e309).
    expect(factorial(171)).toBe(Infinity)
    expect(factorial(500)).toBe(Infinity)
  })

  it('floors fractional inputs (does not interpolate)', () => {
    expect(factorial(5.9)).toBe(factorial(5))
    expect(factorial(0.999)).toBe(factorial(0))
    expect(factorial(170.1)).toBe(factorial(170))
  })
})

describe('lnFactorial', () => {
  it('returns 0 for n = 0 (ln(1) = 0)', () => {
    expect(lnFactorial(0)).toBe(0)
  })

  it('matches log(factorial(n)) within f64 precision for n in [1, 21]', () => {
    for (let n = 1; n <= 21; n++) {
      // factorial(n) is exact in this range; log of it is the gold standard.
      const direct = Math.log(factorial(n))
      expect(lnFactorial(n)).toBeCloseTo(direct, 12)
    }
  })

  it('matches Stirling approximation for large n within expected slack', () => {
    // Stirling: ln(n!) ≈ n·ln(n) − n + 0.5·ln(2πn). Asymptotic error is O(1/n)
    // so 1e-2 absolute slack at n=170 is generous.
    for (const n of [50, 100, 170]) {
      const stirling = n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n)
      expect(Math.abs(lnFactorial(n) - stirling)).toBeLessThan(1e-2)
    }
  })

  it('extends past the LUT (n > 170) by iterative summation', () => {
    // Independent reference: sum log(i) for i = 1..200 — does not depend on
    // lnFactorial(170), so a corrupted LUT entry at n=170 cannot mask a regression.
    let expected = 0
    for (let i = 1; i <= 200; i++) expected += Math.log(i)
    expect(lnFactorial(200)).toBeCloseTo(expected, 12)
  })

  it('returns 0 for negative or non-finite inputs (silent guard)', () => {
    expect(lnFactorial(-1)).toBe(0)
    expect(lnFactorial(-100)).toBe(0)
    expect(lnFactorial(NaN)).toBe(0)
    expect(lnFactorial(Infinity)).toBe(0)
    expect(lnFactorial(-Infinity)).toBe(0)
  })

  it('floors fractional inputs', () => {
    expect(lnFactorial(5.7)).toBe(lnFactorial(5))
  })
})

describe('lnGammaHalf', () => {
  // Reference values from the Γ(n/2) recurrence:
  //   Γ(1/2)   = √π                 ⇒ ln ≈ 0.5723649
  //   Γ(1)     = 1                  ⇒ ln = 0
  //   Γ(3/2)   = √π / 2             ⇒ ln ≈ -0.1207822
  //   Γ(2)     = 1                  ⇒ ln = 0
  //   Γ(n+1) = n·Γ(n)               ⇒ ln Γ(n+1) = ln(n) + ln Γ(n)

  it('matches ln(Γ(1/2)) = 0.5·ln(π)', () => {
    expect(lnGammaHalf(1)).toBeCloseTo(0.5 * Math.log(Math.PI), 5)
  })

  it('returns 0 for ln(Γ(2/2)) = ln(Γ(1)) = ln(1) = 0', () => {
    expect(lnGammaHalf(2)).toBe(0)
  })

  it('returns 0 for ln(Γ(4/2)) = ln(Γ(2)) = ln(1) = 0', () => {
    expect(lnGammaHalf(4)).toBe(0)
  })

  it('matches ln(Γ(3/2)) = ln(√π / 2)', () => {
    expect(lnGammaHalf(3)).toBeCloseTo(Math.log(Math.sqrt(Math.PI) / 2), 5)
  })

  it('satisfies the recurrence ln Γ((n+2)/2) = ln(n/2) + ln Γ(n/2) for the LUT range', () => {
    // Γ(z+1) = z·Γ(z) ⇒ ln Γ((n+2)/2) − ln Γ(n/2) = ln(n/2)
    for (let n = 1; n <= 28; n++) {
      const diff = lnGammaHalf(n + 2) - lnGammaHalf(n)
      const expected = Math.log(n / 2)
      expect(diff).toBeCloseTo(expected, 4)
    }
  })

  it('matches integer Γ recurrence: ln Γ(k) = ln((k-1)!) for even n in the LUT range', () => {
    // n = 2k ⇒ Γ(n/2) = Γ(k) = (k-1)!
    for (const n of [2, 4, 6, 8, 10, 20, 30]) {
      const k = n / 2
      const direct = lnFactorial(k - 1)
      expect(lnGammaHalf(n)).toBeCloseTo(direct, 4)
    }
  })

  it('returns 0 for out-of-range and non-finite inputs', () => {
    expect(lnGammaHalf(0)).toBe(0)
    expect(lnGammaHalf(31)).toBe(0)
    expect(lnGammaHalf(-1)).toBe(0)
    expect(lnGammaHalf(NaN)).toBe(0)
    expect(lnGammaHalf(Infinity)).toBe(0)
  })

  it('floors fractional inputs', () => {
    expect(lnGammaHalf(5.9)).toBe(lnGammaHalf(5))
  })
})

describe('LUT consistency invariants (catches one-off LUT corruption)', () => {
  it('factorial LUT is monotonically nondecreasing', () => {
    let prev = factorial(0)
    for (let n = 1; n <= 170; n++) {
      const curr = factorial(n)
      expect(curr).toBeGreaterThanOrEqual(prev)
      prev = curr
    }
  })

  it('lnFactorial LUT is monotonically nondecreasing', () => {
    let prev = lnFactorial(0)
    for (let n = 1; n <= 170; n++) {
      const curr = lnFactorial(n)
      expect(curr).toBeGreaterThanOrEqual(prev)
      prev = curr
    }
  })

  it('lnGammaHalf LUT obeys Γ ratio inequality (strictly increasing past n=4)', () => {
    // Γ(z) is strictly increasing for z ≥ 2 (i.e. n ≥ 4 in n/2 indexing).
    // Allow stationary points around n=2..4 where Γ(1) = Γ(2) = 1.
    for (let n = 4; n <= 29; n++) {
      expect(lnGammaHalf(n + 1)).toBeGreaterThan(lnGammaHalf(n))
    }
  })
})
