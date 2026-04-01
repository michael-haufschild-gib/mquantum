/**
 * Property-based tests for Hydrogen Wigner phase-space function.
 *
 * Mirrors the WGSL implementation in wignerHydrogen.wgsl.ts.
 * Verifies the radial Wigner function W(r, p_r) computed via numerical
 * Fourier-cosine quadrature of the reduced radial wavefunction u_nl(r) = r·R_nl(r).
 *
 * Key identities tested:
 *   - W_nl(0, 0) = (-1)^{l+1} · 2/π  (exact, from normalization of u_nl)
 *   - Momentum symmetry: W(r, -p_r) = W(r, p_r)  (integrand has cos, which is even)
 *   - Position marginal: ∫W(r, p_r) dp_r = |u_nl(r)|²  (Wigner marginal property)
 *
 * Derivation of W(0,0):
 *   At r=0, all quadrature points have s > r = 0, so rms = -s < 0.
 *   Sign correction = signL = (-1)^{l+1}.
 *   u(0+s) = u(s), u(|0-s|) = u(s), cos(2·0·s) = 1.
 *   W(0,0) = (2/π) · signL · ∫₀^∞ u²(s) ds = signL · 2/π
 *   since ∫₀^∞ u²(s) ds = 1 (normalization of reduced wavefunction).
 *
 * References:
 *   - Dahl & Springborg (1988), "The Morse oscillator in position space,
 *     momentum space, and phase space", J. Chem. Phys. 88, 4535
 *
 * @module tests/lib/physics/wignerHydrogen.property
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// TS mirrors of WGSL implementations
// ---------------------------------------------------------------------------

const MAX_LAGUERRE_K = 7
const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600]

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

/** Hydrogen radial normalization constant — mirrors hydrogenRadial.wgsl.ts */
function hydrogenRadialNorm(n: number, l: number, a0: number): number {
  const nf = n
  const twoOverNa = 2 / (nf * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const factRatio = FACTORIAL[n - l - 1]! / (2 * nf * FACTORIAL[n + l]!)
  return front * Math.sqrt(factRatio)
}

/** Hydrogen radial wavefunction R_nl(r) — mirrors hydrogenRadial.wgsl.ts */
function hydrogenRadial(n: number, l: number, r: number, a0: number): number {
  if (n < 1 || l < 0 || l >= n) return 0
  const a0Safe = Math.max(a0, 0.001)
  const nf = n
  const rho = (2 * r) / (nf * a0Safe)
  const norm = hydrogenRadialNorm(n, l, a0Safe)
  let rhoL = 1
  for (let il = 0; il < l; il++) rhoL *= rho
  const lagK = n - l - 1
  const alpha = 2 * l + 1
  const L = laguerre(lagK, alpha, rho)
  return norm * rhoL * L * Math.exp(-rho / 2)
}

/** Reduced radial wavefunction u_nl(r) = r · R_nl(r) — mirrors wignerHydrogen.wgsl.ts */
function hydrogenReducedRadial(n: number, l: number, r: number, a0: number): number {
  if (r <= 0) return 0
  return r * hydrogenRadial(n, l, r, a0)
}

/**
 * Radial Wigner function W(r, p_r) — mirrors wignerHydrogen.wgsl.ts.
 *
 * W(r, p_r) = (2/π) ∫₀^sMax u(r+s) · u(|r-s|) · sign(r,s,l) · cos(2·p_r·s) ds
 */
function wignerHydrogenRadial(
  r: number,
  pr: number,
  n: number,
  l: number,
  a0: number,
  nPts: number
): number {
  const nf = n
  const sMax = 2.5 * nf * nf * a0

  // Auto-scale quadrature for Nyquist satisfaction
  const nyquistPts = Math.ceil((4 * Math.abs(pr) * sMax) / Math.PI)
  const effectiveNPts = Math.max(1, Math.min(Math.max(nPts, nyquistPts), 256))

  const ds = sMax / effectiveNPts
  // (-1)^{l+1}: for l=0 → -1, l=1 → +1, l=2 → -1, ...
  const signL = l % 2 !== 0 ? 1 : -1

  let integral = 0
  for (let i = 0; i < effectiveNPts; i++) {
    const s = (i + 0.5) * ds

    const uPlus = hydrogenReducedRadial(n, l, r + s, a0)
    const rms = r - s
    const absRms = Math.abs(rms)
    const uMinus = hydrogenReducedRadial(n, l, absRms, a0)
    const sign = rms < 0 ? signL : 1

    integral += uPlus * uMinus * sign * Math.cos(2 * pr * s)
  }

  return (2 / Math.PI) * integral * ds
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbR = fc.double({ min: 0.01, max: 8, noNaN: true, noDefaultInfinity: true })
const arbPr = fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// Exact values at origin
// ---------------------------------------------------------------------------

describe('hydrogen Wigner — exact values at origin', () => {
  // W_nl(0, 0) = signL · (2/π) where signL = (-1)^{l+1}
  // This follows from: at r=0, all s > 0, sign = signL, cos(0) = 1,
  // integral = ∫u²(s)ds = 1 (normalization). So W = signL · 2/π.

  // Note: The WGSL uses sMax = 2.5·n²·a₀. For n=1 this is only 2.5 Bohr radii,
  // truncating ~12% of the 1s tail. For n≥2, sMax captures >99%.
  // We compute the expected truncated integral explicitly.

  /** Fraction of ∫u²ds captured within [0, sMax] */
  function capturedFraction(n: number, l: number, a0: number): number {
    const sMax = 2.5 * n * n * a0
    const ds = 0.005
    let integral = 0
    for (let s = ds / 2; s < sMax; s += ds) {
      const u = hydrogenReducedRadial(n, l, s, a0)
      integral += u * u * ds
    }
    return integral // should be ≤ 1.0
  }

  it('W_1s(0,0) ≈ -captured_fraction · 2/π (n=1, l=0)', () => {
    const frac = capturedFraction(1, 0, 1.0)
    const expected = -(2 / Math.PI) * frac
    const W = wignerHydrogenRadial(0, 0, 1, 0, 1.0, 128)
    expect(W).toBeCloseTo(expected, 1)
    // Also verify sign is correct (negative for l=0)
    expect(W).toBeLessThan(0)
  })

  it('W_2s(0,0) ≈ -2/π (n=2, l=0, sMax captures >99%)', () => {
    const W = wignerHydrogenRadial(0, 0, 2, 0, 1.0, 128)
    expect(W).toBeCloseTo(-2 / Math.PI, 1)
    expect(W).toBeLessThan(0)
  })

  it('W_2p(0,0) ≈ +2/π (n=2, l=1)', () => {
    const W = wignerHydrogenRadial(0, 0, 2, 1, 1.0, 128)
    expect(W).toBeCloseTo(2 / Math.PI, 1)
    expect(W).toBeGreaterThan(0)
  })

  it('W_3s(0,0) sign is negative (l=0)', () => {
    const W = wignerHydrogenRadial(0, 0, 3, 0, 1.0, 128)
    expect(W).toBeLessThan(0)
    expect(W).toBeCloseTo(-2 / Math.PI, 1)
  })

  it('W_3p(0,0) sign is positive (l=1)', () => {
    const W = wignerHydrogenRadial(0, 0, 3, 1, 1.0, 128)
    expect(W).toBeGreaterThan(0)
    expect(W).toBeCloseTo(2 / Math.PI, 1)
  })

  it('W_3d(0,0) sign is negative (l=2)', () => {
    const W = wignerHydrogenRadial(0, 0, 3, 2, 1.0, 128)
    expect(W).toBeLessThan(0)
  })

  it('sign alternates correctly: W(0,0) has sign (-1)^{l+1} for n=1..4', () => {
    for (let n = 1; n <= 4; n++) {
      for (let l = 0; l < n; l++) {
        const expectedSign = l % 2 !== 0 ? 1 : -1
        const W = wignerHydrogenRadial(0, 0, n, l, 1.0, 128)
        expect(Math.sign(W)).toBe(expectedSign)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Momentum symmetry: W(r, -pr) = W(r, pr)
// ---------------------------------------------------------------------------

describe('hydrogen Wigner — momentum symmetry', () => {
  it('W(r, -pr) = W(r, pr) for real wavefunctions', () => {
    fc.assert(
      fc.property(arbR, arbPr, (r, pr) => {
        const nPts = 64
        const Wpos = wignerHydrogenRadial(r, pr, 1, 0, 1.0, nPts)
        const Wneg = wignerHydrogenRadial(r, -pr, 1, 0, 1.0, nPts)
        if (Math.abs(Wpos) < 1e-15) {
          expect(Math.abs(Wneg)).toBeLessThan(1e-10)
        } else {
          expect(Wneg).toBeCloseTo(Wpos, 8)
        }
      }),
      { numRuns: 300 }
    )
  })

  it('symmetry holds for l=1 state (n=2, l=1)', () => {
    fc.assert(
      fc.property(arbR, arbPr, (r, pr) => {
        const Wpos = wignerHydrogenRadial(r, pr, 2, 1, 1.0, 64)
        const Wneg = wignerHydrogenRadial(r, -pr, 2, 1, 1.0, 64)
        if (Math.abs(Wpos) < 1e-15) {
          expect(Math.abs(Wneg)).toBeLessThan(1e-10)
        } else {
          expect(Wneg).toBeCloseTo(Wpos, 8)
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Position marginal: ∫ W(r, pr) dpr = |u_nl(r)|²
// ---------------------------------------------------------------------------

describe('hydrogen Wigner — position marginal', () => {
  it('∫W_1s(r, pr) dpr ≈ u_1s(r)² at selected r values', () => {
    const a0 = 1.0
    const n = 1
    const l = 0
    const dpr = 0.1
    const prMax = 8

    for (const r of [0.5, 1.0, 1.5, 2.0, 3.0]) {
      let marginal = 0
      for (let pr = -prMax; pr <= prMax; pr += dpr) {
        marginal += wignerHydrogenRadial(r, pr, n, l, a0, 64) * dpr
      }
      const expected = hydrogenReducedRadial(n, l, r, a0) ** 2
      if (expected > 1e-6) {
        const relError = Math.abs(marginal - expected) / expected
        expect(relError).toBeLessThan(0.1) // 10% from double numerical integration
      }
    }
  })

  it('∫W_2p(r, pr) dpr ≈ u_2p(r)² at selected r values', () => {
    const a0 = 1.0
    const n = 2
    const l = 1
    const dpr = 0.08
    const prMax = 6

    for (const r of [1.0, 2.0, 4.0, 6.0]) {
      let marginal = 0
      for (let pr = -prMax; pr <= prMax; pr += dpr) {
        marginal += wignerHydrogenRadial(r, pr, n, l, a0, 64) * dpr
      }
      const expected = hydrogenReducedRadial(n, l, r, a0) ** 2
      if (expected > 1e-6) {
        const relError = Math.abs(marginal - expected) / expected
        expect(relError).toBeLessThan(0.15)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Ground state Gaussian form verification
// ---------------------------------------------------------------------------

describe('hydrogen Wigner — 1s ground state properties', () => {
  it('W_1s is peaked at r≈1 (Bohr radius), pr=0', () => {
    // The 1s Wigner function should peak near r = a₀ = 1 in phase space
    const Wcenter = Math.abs(wignerHydrogenRadial(1, 0, 1, 0, 1.0, 64))
    const Wfar = Math.abs(wignerHydrogenRadial(5, 0, 1, 0, 1.0, 64))
    expect(Wcenter).toBeGreaterThan(Wfar * 5)
  })

  it('W_1s decays for large |pr|', () => {
    const W0 = Math.abs(wignerHydrogenRadial(1, 0, 1, 0, 1.0, 64))
    const WlargeP = Math.abs(wignerHydrogenRadial(1, 5, 1, 0, 1.0, 96))
    expect(WlargeP).toBeLessThan(W0 * 0.1)
  })
})

// ---------------------------------------------------------------------------
// Finiteness
// ---------------------------------------------------------------------------

describe('hydrogen Wigner — finiteness', () => {
  it('all values are finite for physical inputs', () => {
    fc.assert(
      fc.property(arbR, arbPr, (r, pr) => {
        for (let n = 1; n <= 3; n++) {
          for (let l = 0; l < n; l++) {
            const W = wignerHydrogenRadial(r, pr, n, l, 1.0, 48)
            expect(Number.isFinite(W)).toBe(true)
          }
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Reduced radial wavefunction properties
// ---------------------------------------------------------------------------

describe('reduced radial wavefunction u_nl', () => {
  it('u(r) = 0 for r ≤ 0', () => {
    expect(hydrogenReducedRadial(1, 0, 0, 1)).toBe(0)
    expect(hydrogenReducedRadial(1, 0, -1, 1)).toBe(0)
  })

  it('∫|u_1s(r)|² dr ≈ 1 (normalization)', () => {
    const dr = 0.01
    let integral = 0
    for (let r = dr / 2; r < 20; r += dr) {
      const u = hydrogenReducedRadial(1, 0, r, 1.0)
      integral += u * u * dr
    }
    expect(integral).toBeCloseTo(1.0, 2)
  })

  it('∫|u_2p(r)|² dr ≈ 1 (normalization)', () => {
    const dr = 0.01
    let integral = 0
    for (let r = dr / 2; r < 40; r += dr) {
      const u = hydrogenReducedRadial(2, 1, r, 1.0)
      integral += u * u * dr
    }
    expect(integral).toBeCloseTo(1.0, 2)
  })

  it('u_1s peaks at r = a₀ (Bohr radius)', () => {
    // u_1s(r) = 2r·e^{-r}, peaks at r = 1 where u'(r) = 0
    const uPeak = hydrogenReducedRadial(1, 0, 1, 1.0)
    const uBefore = hydrogenReducedRadial(1, 0, 0.5, 1.0)
    const uAfter = hydrogenReducedRadial(1, 0, 1.5, 1.0)
    expect(uPeak).toBeGreaterThan(uBefore)
    expect(uPeak).toBeGreaterThan(uAfter)
  })
})
