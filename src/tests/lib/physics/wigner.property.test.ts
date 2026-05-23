/**
 * Property-based tests for Wigner phase-space functions (Harmonic Oscillator).
 *
 * Mirrors the WGSL implementation in wignerHO.wgsl.ts.
 * Verifies mathematical identities from quantum phase-space theory:
 *
 *   - Marginal properties: ∫W_n(x,p)dp = |ψ_n(x)|²
 *   - Normalization: ∫∫W_n(x,p) dx dp = 1
 *   - Positivity: W_0(x,p) ≥ 0 (unique to ground state)
 *   - Parity: W_n(-x,-p) = W_n(x,p)
 *   - Known values: W_0(0,0) = 1/π
 *   - Cross-Wigner symmetry
 *
 * References:
 *   - Schleich, "Quantum Optics in Phase Space", Ch. 3
 *   - Wigner (1932), Phys. Rev. 40, 749
 *
 * @module tests/lib/physics/wigner.property
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// TS mirrors of WGSL implementations
// ---------------------------------------------------------------------------

const MAX_LAGUERRE_K = 7

/** Associated Laguerre polynomial — mirrors laguerre.wgsl.ts */
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

const WIGNER_FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040]

/** Diagonal Wigner function W_n(x,p) — mirrors wignerHO.wgsl.ts */
function wignerDiagonal(n: number, x: number, p: number, omega: number): number {
  const omegaSafe = Math.max(omega, 1e-20)
  const u2 = omegaSafe * x * x + (p * p) / omegaSafe
  const sign = n % 2 === 0 ? 1 : -1
  return (sign / Math.PI) * laguerre(n, 0, 2 * u2) * Math.exp(-u2)
}

/** Cross-Wigner function W_{m,n}(x,p) — mirrors wignerHO.wgsl.ts */
function wignerCross(m: number, n: number, x: number, p: number, omega: number): [number, number] {
  const mMax = Math.max(m, n)
  const nMin = Math.min(m, n)
  const delta = mMax - nMin

  const u2 = omega * x * x + (p * p) / omega
  const signN = nMin % 2 === 0 ? 1 : -1

  const coeffNM = Math.sqrt(WIGNER_FACTORIAL[nMin]! / WIGNER_FACTORIAL[mMax]!)
  const lagVal = laguerre(nMin, delta, 2 * u2)

  const sqrtOmega = Math.sqrt(omega)
  const zetaRe = sqrtOmega * x
  const zetaIm = p / sqrtOmega

  const scale = Math.SQRT2
  let powRe = 1
  let powIm = 0
  const szetaRe = scale * zetaRe
  const szetaIm = scale * zetaIm
  for (let i = 0; i < delta; i++) {
    const newRe = powRe * szetaRe - powIm * szetaIm
    const newIm = powRe * szetaIm + powIm * szetaRe
    powRe = newRe
    powIm = newIm
  }

  const scalar = (signN / Math.PI) * coeffNM * lagVal * Math.exp(-u2)
  return [scalar * powRe, scalar * powIm]
}

/** Hermite polynomial — mirrors hermite.wgsl.ts */
function hermite(n: number, u: number): number {
  switch (n) {
    case 0:
      return 1
    case 1:
      return 2 * u
    case 2:
      return 4 * u * u - 2
    case 3:
      return 8 * u ** 3 - 12 * u
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

const HO_NORM = [
  1.0, 0.707106781187, 0.353553390593, 0.144337567297, 0.051031036308, 0.0161374306092,
  0.00465847495312,
]

/** 1D HO wavefunction |ψ_n(x)|² — used to verify marginals */
function ho1DProbDensity(n: number, x: number, omega: number): number {
  const alpha = Math.sqrt(Math.max(omega, 0.01))
  const u = alpha * x
  const gauss = Math.exp(-u * u)
  const H = hermite(n, u)
  const alphaNorm2 = alpha * alpha * (1 / Math.PI)
  return Math.sqrt(alphaNorm2) * HO_NORM[n]! * HO_NORM[n]! * H * H * gauss
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbN = fc.integer({ min: 0, max: 6 })
const arbX = fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })
const arbP = fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })
const arbOmega = fc.double({ min: 0.3, max: 3.0, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// Known exact values
// ---------------------------------------------------------------------------

describe('Wigner function — known values', () => {
  it('W_0(0,0) = 1/π (ground state at phase-space origin)', () => {
    const W = wignerDiagonal(0, 0, 0, 1.0)
    expect(W).toBeCloseTo(1 / Math.PI, 10)
  })

  it('W_1(0,0) = -1/π (first excited state at origin)', () => {
    // L_1(0) = 1, sign = -1: W_1 = -1/π * 1 * 1 = -1/π
    const W = wignerDiagonal(1, 0, 0, 1.0)
    expect(W).toBeCloseTo(-1 / Math.PI, 10)
  })

  it('W_n(0,0) = (-1)^n / π (alternating signs at origin)', () => {
    for (let n = 0; n <= 6; n++) {
      const W = wignerDiagonal(n, 0, 0, 1.0)
      const expected = (n % 2 === 0 ? 1 : -1) / Math.PI
      expect(W).toBeCloseTo(expected, 8)
    }
  })
})

// ---------------------------------------------------------------------------
// Ground state positivity
// ---------------------------------------------------------------------------

describe('Wigner ground state positivity — W_0(x,p) ≥ 0', () => {
  it('W_0(x,p) ≥ 0 for all (x,p) (Hudson theorem)', () => {
    // The ground state (Gaussian) is the ONLY pure state with a
    // non-negative Wigner function (Hudson, 1974).
    fc.assert(
      fc.property(arbX, arbP, arbOmega, (x, p, omega) => {
        const W = wignerDiagonal(0, x, p, omega)
        expect(W).toBeGreaterThanOrEqual(-1e-15)
      }),
      { numRuns: 1000 }
    )
  })

  it('W_0(x,p) is a 2D Gaussian: W_0 = (1/π) exp(-ωx² - p²/ω)', () => {
    fc.assert(
      fc.property(arbX, arbP, arbOmega, (x, p, omega) => {
        const W = wignerDiagonal(0, x, p, omega)
        const expected = (1 / Math.PI) * Math.exp(-omega * x * x - (p * p) / omega)
        expect(W).toBeCloseTo(expected, 8)
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------------

describe('Wigner parity — W_n(-x,-p) = W_n(x,p)', () => {
  it('diagonal Wigner is symmetric under (x,p) → (-x,-p)', () => {
    fc.assert(
      fc.property(arbN, arbX, arbP, arbOmega, (n, x, p, omega) => {
        const W1 = wignerDiagonal(n, x, p, omega)
        const W2 = wignerDiagonal(n, -x, -p, omega)
        if (Math.abs(W1) < 1e-15) {
          expect(Math.abs(W2)).toBeLessThan(1e-10)
        } else {
          expect(W2).toBeCloseTo(W1, 8)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Normalization: ∫∫ W_n(x,p) dx dp = 1
// ---------------------------------------------------------------------------

describe('Wigner normalization — ∫∫ W_n(x,p) dx dp = 1', () => {
  it('normalizes to 1 for n=0..4 (numerical integration)', () => {
    const omega = 1.0
    const dx = 0.1
    const dp = 0.1
    const xMax = 6
    const pMax = 6

    for (let n = 0; n <= 4; n++) {
      let integral = 0
      for (let x = -xMax; x <= xMax; x += dx) {
        for (let p = -pMax; p <= pMax; p += dp) {
          integral += wignerDiagonal(n, x, p, omega) * dx * dp
        }
      }
      // Tolerance: ~1% from trapezoidal rule on coarse grid
      expect(integral).toBeCloseTo(1.0, 1)
    }
  })
})

// ---------------------------------------------------------------------------
// Position marginal: ∫ W_n(x,p) dp = |ψ_n(x)|²
// ---------------------------------------------------------------------------

describe('Wigner position marginal — ∫ W_n(x,p) dp = |ψ_n(x)|²', () => {
  it('matches |ψ_n(x)|² for n=0..4 at multiple x values', () => {
    const omega = 1.0
    const dp = 0.05
    const pMax = 8

    for (let n = 0; n <= 4; n++) {
      // Test at several x positions
      for (const x of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
        let marginal = 0
        for (let p = -pMax; p <= pMax; p += dp) {
          marginal += wignerDiagonal(n, x, p, omega) * dp
        }
        const expected = ho1DProbDensity(n, x, omega)
        // Tolerance: trapezoidal rule on moderate grid
        if (expected > 1e-6) {
          const relError = Math.abs(marginal - expected) / expected
          expect(relError).toBeLessThan(0.02) // 2% tolerance
        } else {
          expect(Math.abs(marginal)).toBeLessThan(0.01)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Momentum marginal: ∫ W_n(x,p) dx = |ψ̃_n(p)|²
// ---------------------------------------------------------------------------

describe('Wigner momentum marginal — ∫ W_n(x,p) dx = |ψ̃_n(p)|²', () => {
  it('matches momentum-space probability for n=0 (Gaussian)', () => {
    // For n=0, ω=1: ψ̃_0(p) = π^{-1/4} exp(-p²/2)
    // |ψ̃_0(p)|² = (1/√π) exp(-p²)
    const omega = 1.0
    const dx = 0.05
    const xMax = 8

    for (const p of [-2, -1, 0, 0.5, 1, 2]) {
      let marginal = 0
      for (let x = -xMax; x <= xMax; x += dx) {
        marginal += wignerDiagonal(0, x, p, omega) * dx
      }
      const expected = (1 / Math.sqrt(Math.PI)) * Math.exp(-p * p)
      if (expected > 1e-6) {
        const relError = Math.abs(marginal - expected) / expected
        expect(relError).toBeLessThan(0.02)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Cross-Wigner properties
// ---------------------------------------------------------------------------

describe('cross-Wigner symmetry', () => {
  it('W_{n,n} = diagonal W_n (self-cross equals diagonal)', () => {
    fc.assert(
      fc.property(arbN, arbX, arbP, arbOmega, (n, x, p, omega) => {
        if (n > 6) return // factorial LUT limit
        const diag = wignerDiagonal(n, x, p, omega)
        const [crossRe, crossIm] = wignerCross(n, n, x, p, omega)
        expect(crossRe).toBeCloseTo(diag, 6)
        expect(Math.abs(crossIm)).toBeLessThan(1e-10)
      }),
      { numRuns: 500 }
    )
  })

  it('wignerCross(m,n) == wignerCross(n,m) (internal max/min normalization)', () => {
    // The WGSL always computes W_{max,min} regardless of argument order.
    // Conjugate symmetry is applied at the call site (evaluateWignerMarginalHO)
    // by negating the imaginary part when nj < nk.
    const arbSmallN = fc.integer({ min: 0, max: 5 })
    fc.assert(
      fc.property(arbSmallN, arbSmallN, arbX, arbP, arbOmega, (m, n, x, p, omega) => {
        const [reMN, imMN] = wignerCross(m, n, x, p, omega)
        const [reNM, imNM] = wignerCross(n, m, x, p, omega)
        expect(reNM).toBeCloseTo(reMN, 10)
        expect(imNM).toBeCloseTo(imMN, 10)
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Cross-Wigner parity
// ---------------------------------------------------------------------------

describe('cross-Wigner parity', () => {
  it('|W_{m,n}(-x,-p)| = |W_{m,n}(x,p)| for all m,n', () => {
    const arbSmallN = fc.integer({ min: 0, max: 5 })
    fc.assert(
      fc.property(arbSmallN, arbSmallN, arbX, arbP, (m, n, x, p) => {
        const omega = 1.0
        const [re1, im1] = wignerCross(m, n, x, p, omega)
        const [re2, im2] = wignerCross(m, n, -x, -p, omega)
        const mag1 = Math.sqrt(re1 * re1 + im1 * im1)
        const mag2 = Math.sqrt(re2 * re2 + im2 * im2)
        if (mag1 < 1e-15) {
          expect(mag2).toBeLessThan(1e-10)
        } else {
          expect(mag2).toBeCloseTo(mag1, 6)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Finite values
// ---------------------------------------------------------------------------

describe('Wigner finiteness', () => {
  it('all diagonal Wigner values are finite', () => {
    fc.assert(
      fc.property(arbN, arbX, arbP, arbOmega, (n, x, p, omega) => {
        const W = wignerDiagonal(n, x, p, omega)
        expect(Number.isFinite(W)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  it('all cross-Wigner values are finite', () => {
    const arbSmallN = fc.integer({ min: 0, max: 6 })
    fc.assert(
      fc.property(arbSmallN, arbSmallN, arbX, arbP, arbOmega, (m, n, x, p, omega) => {
        const [re, im] = wignerCross(m, n, x, p, omega)
        expect(Number.isFinite(re)).toBe(true)
        expect(Number.isFinite(im)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })
})
