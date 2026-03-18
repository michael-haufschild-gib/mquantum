/**
 * Tests for Hermite polynomial correctness and HO wavefunction properties.
 *
 * Hermite polynomials H_n(x) are the mathematical basis of harmonic oscillator
 * wavefunctions. These tests verify the polynomials match known values and
 * satisfy key mathematical identities.
 */

import { describe, expect, it } from 'vitest'

// Reproduce the Hermite polynomial from the WGSL shader implementation
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

describe('Hermite polynomials — known values', () => {
  it('H_0(x) = 1 for all x', () => {
    for (const x of [-2, -1, 0, 0.5, 1, 3]) {
      expect(hermite(0, x)).toBe(1)
    }
  })

  it('H_1(x) = 2x', () => {
    expect(hermite(1, 0)).toBe(0)
    expect(hermite(1, 1)).toBe(2)
    expect(hermite(1, -1)).toBe(-2)
    expect(hermite(1, 0.5)).toBe(1)
  })

  it('H_2(x) = 4x^2 - 2', () => {
    expect(hermite(2, 0)).toBe(-2)
    expect(hermite(2, 1)).toBe(2) // 4 - 2 = 2
    expect(hermite(2, -1)).toBe(2) // symmetric
  })

  it('H_3(x) = 8x^3 - 12x', () => {
    expect(hermite(3, 0)).toBe(0) // odd function
    expect(hermite(3, 1)).toBe(-4) // 8 - 12 = -4
    expect(hermite(3, -1)).toBe(4) // antisymmetric
  })

  it('H_4(0) = 12', () => {
    expect(hermite(4, 0)).toBe(12)
  })

  it('H_5(0) = 0 (odd function)', () => {
    expect(hermite(5, 0)).toBe(0)
  })

  it('H_6(0) = -120', () => {
    expect(hermite(6, 0)).toBe(-120)
  })
})

describe('Hermite polynomials — parity', () => {
  it('even-order Hermite polynomials are even functions: H_n(-x) = H_n(x)', () => {
    for (const n of [0, 2, 4, 6]) {
      for (const x of [0.1, 1.5, 2.7]) {
        expect(hermite(n, -x)).toBeCloseTo(hermite(n, x), 10)
      }
    }
  })

  it('odd-order Hermite polynomials are odd functions: H_n(-x) = -H_n(x)', () => {
    for (const n of [1, 3, 5]) {
      for (const x of [0.1, 1.5, 2.7]) {
        expect(hermite(n, -x)).toBeCloseTo(-hermite(n, x), 10)
      }
    }
  })
})

describe('Hermite polynomials — recurrence relation', () => {
  it('satisfies H_{n+1}(x) = 2x H_n(x) - 2n H_{n-1}(x)', () => {
    for (const x of [0, 0.5, 1, -1.3, 2.5]) {
      for (let n = 1; n <= 5; n++) {
        const expected = 2 * x * hermite(n, x) - 2 * n * hermite(n - 1, x)
        expect(hermite(n + 1, x)).toBeCloseTo(expected, 6)
      }
    }
  })
})

describe('HO wavefunction properties', () => {
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

  it('ground state (n=0) wavefunction is positive everywhere', () => {
    for (let x = -5; x <= 5; x += 0.1) {
      expect(ho1D(0, x, 1.0)).toBeGreaterThanOrEqual(0)
    }
  })

  it('ground state peaks at x=0', () => {
    const peakVal = ho1D(0, 0, 1.0)
    for (const x of [-2, -1, -0.5, 0.5, 1, 2]) {
      expect(ho1D(0, x, 1.0)).toBeLessThan(peakVal)
    }
  })

  it('first excited state (n=1) has one node at x=0', () => {
    expect(ho1D(1, 0, 1.0)).toBeCloseTo(0, 10)
    // Should be positive on one side, negative on other
    expect(ho1D(1, 1, 1.0)).toBeGreaterThan(0)
    expect(ho1D(1, -1, 1.0)).toBeLessThan(0)
  })

  it('n-th excited state has n nodes (sign changes)', () => {
    for (let n = 0; n <= 6; n++) {
      let signChanges = 0
      let prevSign = Math.sign(ho1D(n, -5, 1.0))
      for (let x = -4.99; x <= 5; x += 0.01) {
        const curSign = Math.sign(ho1D(n, x, 1.0))
        if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) {
          signChanges++
        }
        if (curSign !== 0) prevSign = curSign
      }
      expect(signChanges).toBe(n)
    }
  })

  it('wavefunction decays exponentially at large |x|', () => {
    for (const n of [0, 2, 4]) {
      const nearVal = Math.abs(ho1D(n, 3, 1.0))
      const farVal = Math.abs(ho1D(n, 6, 1.0))
      expect(farVal).toBeLessThan(nearVal * 0.01)
    }
  })

  it('higher omega concentrates the wavefunction (narrower Gaussian)', () => {
    const valAt1_lowOmega = Math.abs(ho1D(0, 1, 0.5))
    const valAt1_highOmega = Math.abs(ho1D(0, 1, 4.0))
    // Higher omega → narrower → lower value at x=1
    expect(valAt1_highOmega).toBeLessThan(valAt1_lowOmega)
  })
})
