/**
 * Property-based tests for Spherical Harmonics.
 *
 * Mirrors the WGSL implementation in sphericalHarmonics.wgsl.ts.
 * Tests three layers of correctness:
 *
 * 1. CONSTANT VERIFICATION — the hardcoded normalization constants in the WGSL
 *    fast-path functions are verified against computed values.
 * 2. FUNCTION EQUIVALENCE — the cartesian fast-path must match the general
 *    angular implementation for l ≤ 2.
 * 3. MATHEMATICAL IDENTITIES — addition theorem, orthonormality, and known
 *    special values.
 *
 * @module tests/lib/math/sphericalHarmonics.property
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// TS mirrors of WGSL implementations
// ---------------------------------------------------------------------------

const MAX_LEGENDRE_L = 7

/** Associated Legendre P^m_l(x) with Condon-Shortley phase — mirrors legendre.wgsl.ts */
function legendre(l: number, m: number, x: number): number {
  const absM = Math.abs(m)
  if (absM > l) return 0
  const xc = Math.max(-1, Math.min(1, x))
  const somx2 = Math.sqrt((1 - xc) * (1 + xc))
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
  let pmmp1 = xc * (2 * absM + 1) * pmm
  if (l === absM + 1) return pmmp1
  let pll = 0
  for (let ll = absM + 2; ll <= Math.min(l, MAX_LEGENDRE_L); ll++) {
    pll = (xc * (2 * ll - 1) * pmmp1 - (ll + absM - 1) * pmm) / (ll - absM)
    pmm = pmmp1
    pmmp1 = pll
  }
  return pll
}

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600]

/** Spherical harmonic normalization K_l^m — mirrors sphericalHarmonics.wgsl.ts */
function sphericalHarmonicNorm(l: number, m: number): number {
  const absM = Math.abs(m)
  if (l < 0 || absM > l) return 0
  const front = (2 * l + 1) / (4 * Math.PI)
  const factRatio = FACTORIAL[l - absM]! / FACTORIAL[l + absM]!
  return Math.sqrt(front * factRatio)
}

/** Complex spherical harmonic Y_lm(θ,φ) — mirrors sphericalHarmonics.wgsl.ts */
function sphericalHarmonic(l: number, m: number, theta: number, phi: number): [number, number] {
  const K = sphericalHarmonicNorm(l, m)
  let P = legendre(l, m, Math.cos(theta))
  if (m < 0 && (Math.abs(m) & 1) === 1) P = -P
  const mPhi = m * phi
  return [K * P * Math.cos(mPhi), K * P * Math.sin(mPhi)]
}

/** Real spherical harmonic — mirrors sphericalHarmonics.wgsl.ts */
function realSphericalHarmonic(l: number, m: number, theta: number, phi: number): number {
  const K = sphericalHarmonicNorm(l, Math.abs(m))
  let P = legendre(l, Math.abs(m), Math.cos(theta))
  if ((Math.abs(m) & 1) === 1) P = -P // undo CS phase for real harmonics
  if (m === 0) return K * P
  if (m > 0) return Math.SQRT2 * K * P * Math.cos(m * phi)
  return Math.SQRT2 * K * P * Math.sin(-m * phi)
}

/** Fast cartesian real spherical harmonic for l ≤ 2 — mirrors sphericalHarmonics.wgsl.ts */
function fastRealSphericalHarmonicCartesian(
  l: number,
  m: number,
  nx: number,
  ny: number,
  nz: number
): number {
  if (l < 0 || Math.abs(m) > l) return 0
  if (l === 0) return 0.28209479
  if (l === 1) {
    const norm = 0.48860251
    if (m === 0) return norm * nz
    if (m === 1) return norm * nx
    return norm * ny // m === -1
  }
  if (l === 2) {
    if (m === 0) return 0.31539157 * (3 * nz * nz - 1)
    if (m === 1) return 1.09254843 * nx * nz
    if (m === -1) return 1.09254843 * ny * nz
    if (m === 2) return 0.54627422 * (nx * nx - ny * ny)
    return 0.54627422 * 2 * nx * ny // m === -2
  }
  return 0
}

/** Fast direct real spherical harmonic from cos/sin theta — mirrors sphericalHarmonics.wgsl.ts */
function fastRealSphericalHarmonicDirect(
  l: number,
  m: number,
  ct: number,
  st: number,
  phi: number
): number {
  if (l < 0 || Math.abs(m) > l) return 0
  if (l === 0) return 0.28209479
  if (l === 1) {
    const norm = 0.48860251
    if (m === 0) return norm * ct
    if (m === 1) return norm * st * Math.cos(phi)
    return norm * st * Math.sin(phi) // m === -1
  }
  if (l === 2) {
    const ct2 = ct * ct
    const st2 = st * st
    if (m === 0) return 0.31539157 * (3 * ct2 - 1)
    if (m === 1) return 1.09254843 * st * ct * Math.cos(phi)
    if (m === -1) return 1.09254843 * st * ct * Math.sin(phi)
    if (m === 2) return 0.54627422 * st2 * Math.cos(2 * phi)
    return 0.54627422 * st2 * Math.sin(2 * phi) // m === -2
  }
  if (l === 3) {
    // f-orbital fast path — mirrors the SH_Y3* constants and formulas in
    // sphericalHarmonics.wgsl.ts so the equivalence test can cross-verify
    // the WGSL hardcoded constants against the general formula. Before
    // this branch existed the test fell through to `realSphericalHarmonic`
    // for l=3, which hides any bug in the f-orbital fast path.
    const ct2 = ct * ct
    const st2 = st * st
    if (m === 0) return 0.3731763326 * ct * (5 * ct2 - 3) // √(7/(16π))
    if (m === 1) return 0.4570457995 * st * Math.cos(phi) * (5 * ct2 - 1) // √(21/(32π))
    if (m === -1) return 0.4570457995 * st * Math.sin(phi) * (5 * ct2 - 1)
    if (m === 2) return 1.4453057213 * st2 * Math.cos(2 * phi) * ct // √(105/(16π))
    if (m === -2) return 1.4453057213 * st2 * Math.sin(2 * phi) * ct
    if (m === 3) return 0.5900435899 * st * st2 * Math.cos(3 * phi) // √(35/(32π))
    return 0.5900435899 * st * st2 * Math.sin(3 * phi) // m === -3
  }
  // Fallback for l > 3
  const theta = Math.acos(Math.max(-1, Math.min(1, ct)))
  return realSphericalHarmonic(l, m, theta, phi)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbTheta = fc.double({ min: 0.01, max: Math.PI - 0.01, noNaN: true, noDefaultInfinity: true })
const arbPhi = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// 1. CONSTANT VERIFICATION
// ---------------------------------------------------------------------------

describe('spherical harmonic normalization constants — exact verification', () => {
  // These are the hardcoded constants in sphericalHarmonics.wgsl.ts fast paths.
  // A wrong constant silently corrupts the visualization.

  it('Y_00 constant: 1/(2√π) = 0.28209479...', () => {
    const exact = 1 / (2 * Math.sqrt(Math.PI))
    expect(0.28209479).toBeCloseTo(exact, 7)
    expect(sphericalHarmonicNorm(0, 0)).toBeCloseTo(exact, 10)
  })

  it('Y_10 constant: √(3/(4π)) = 0.48860251...', () => {
    const exact = Math.sqrt(3 / (4 * Math.PI))
    expect(0.48860251).toBeCloseTo(exact, 7)
    expect(sphericalHarmonicNorm(1, 0)).toBeCloseTo(exact, 10)
  })

  it('invalid |m| > l returns zero instead of reading factorials out of range', () => {
    expect(sphericalHarmonicNorm(1, 2)).toBe(0)
    expect(sphericalHarmonic(1, 2, Math.PI / 3, Math.PI / 4)).toEqual([0, 0])
    expect(fastRealSphericalHarmonicDirect(1, 2, 0.5, Math.sqrt(0.75), 0.25)).toBe(0)
    expect(fastRealSphericalHarmonicCartesian(1, 2, 0.3, 0.4, 0.5)).toBe(0)
  })

  it('invalid l < 0 returns zero', () => {
    expect(sphericalHarmonicNorm(-1, 0)).toBe(0)
    expect(sphericalHarmonic(-1, 0, Math.PI / 3, Math.PI / 4)).toEqual([0, 0])
    expect(fastRealSphericalHarmonicDirect(-1, 0, 0.5, Math.sqrt(0.75), 0.25)).toBe(0)
    expect(fastRealSphericalHarmonicCartesian(-1, 0, 0.3, 0.4, 0.5)).toBe(0)
  })

  it('Y_20 constant: K_2^0 / 2 = √(5/(16π)) = 0.31539157... (absorbs P_2 factor)', () => {
    // The fast-path computes K_2^0 * P_2(x) = K_2^0 * (3x²-1)/2 as
    // 0.31539157 * (3x²-1), folding the 1/2 into the constant.
    const K20 = sphericalHarmonicNorm(2, 0)
    const exact = K20 / 2 // = √(5/(16π))
    expect(0.31539157).toBeCloseTo(exact, 7)
    expect(exact).toBeCloseTo(Math.sqrt(5 / (16 * Math.PI)), 10)
  })

  it('Y_21 constant: √(15/(4π)) = 1.09254843... (includes √2 for real harmonics)', () => {
    // The WGSL uses 1.09254843 which is sqrt(15/(4π)), the real harmonic
    // normalization sqrt(2) * K_2^1 = sqrt(2) * sqrt(15/(16π)) = sqrt(15/(4π))
    // Wait: sqrt(2) * sqrt(15/(16π)) = sqrt(30/(16π)) = sqrt(15/(8π))
    // Actually: K_2^1 = sqrt(5/(4π) * 1!/3!) = sqrt(5/(4π) * 1/6) = sqrt(5/(24π))
    // sqrt(2) * sqrt(5/(24π)) ≈ 0.546 — that's the ±2 constant.
    // The 1.09254843 is actually sqrt(15/(4π)) which equals 2 * sqrt(2) * K_2^1
    // Let me verify: sqrt(15/(4π)) ≈ 1.0925484...
    const exact = Math.sqrt(15 / (4 * Math.PI))
    expect(1.09254843).toBeCloseTo(exact, 7)
  })

  it('Y_22 constant: √(15/(16π)) = 0.54627422...', () => {
    const exact = Math.sqrt(15 / (16 * Math.PI))
    expect(0.54627422).toBeCloseTo(exact, 7)
  })

  it('all fast-path constants match computed normalizations', () => {
    // For l=0,1: the constant IS K_l^m directly (P_0=1, P_1=x).
    // For l=2, m=0: the constant is K_2^0 / 2 (P_2 has 1/2 factor).
    // For l=2, m≠0: the constant absorbs √2 and Legendre amplitude.
    expect(0.28209479).toBeCloseTo(sphericalHarmonicNorm(0, 0), 7)
    expect(0.48860251).toBeCloseTo(sphericalHarmonicNorm(1, 0), 7)
    expect(0.31539157).toBeCloseTo(sphericalHarmonicNorm(2, 0) / 2, 7)

    // Y_21/Y_2(-1) constant: sqrt(15/(4π)) — this is the full real harmonic
    // prefactor for the dxz/dyz angular form (sin θ cos θ cos/sin φ)
    expect(1.09254843).toBeCloseTo(Math.sqrt(15 / (4 * Math.PI)), 7)

    // Y_22/Y_2(-2) constant: sqrt(15/(16π)) — full prefactor for
    // dx²-y²/dxy angular form (sin²θ cos/sin 2φ)
    expect(0.54627422).toBeCloseTo(Math.sqrt(15 / (16 * Math.PI)), 7)
  })
})

// ---------------------------------------------------------------------------
// 2. FUNCTION EQUIVALENCE: cartesian ↔ angular
// ---------------------------------------------------------------------------

describe('cartesian ↔ angular equivalence for l ≤ 2', () => {
  it('fastCartesian matches fastDirect for all (l,m) at random angles', () => {
    const lmPairs: [number, number][] = [
      [0, 0],
      [1, -1],
      [1, 0],
      [1, 1],
      [2, -2],
      [2, -1],
      [2, 0],
      [2, 1],
      [2, 2],
    ]

    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        const ct = Math.cos(theta)
        const st = Math.sin(theta)
        const nx = st * Math.cos(phi)
        const ny = st * Math.sin(phi)
        const nz = ct

        for (const [l, m] of lmPairs) {
          const fromDirect = fastRealSphericalHarmonicDirect(l, m, ct, st, phi)
          const fromCartesian = fastRealSphericalHarmonicCartesian(l, m, nx, ny, nz)
          expect(fromCartesian).toBeCloseTo(fromDirect, 5)
        }
      }),
      { numRuns: 500 }
    )
  })

  it('fastDirect matches general realSphericalHarmonic for l ≤ 2', () => {
    const lmPairs: [number, number][] = [
      [0, 0],
      [1, -1],
      [1, 0],
      [1, 1],
      [2, -2],
      [2, -1],
      [2, 0],
      [2, 1],
      [2, 2],
    ]

    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        const ct = Math.cos(theta)
        const st = Math.sin(theta)

        for (const [l, m] of lmPairs) {
          const fast = fastRealSphericalHarmonicDirect(l, m, ct, st, phi)
          const general = realSphericalHarmonic(l, m, theta, phi)
          expect(fast).toBeCloseTo(general, 4)
        }
      }),
      { numRuns: 500 }
    )
  })

  // ──────────────────────────────────────────────────────────────────────
  // f-orbital (l = 3) fast-path equivalence — crosses WGSL SH_Y3* constants
  // against the general-formula spherical harmonic. Before the TS mirror
  // was extended to l = 3, the fall-through to `realSphericalHarmonic`
  // masked any bug in the f-orbital constants: the test was effectively
  // asserting `general === general`.
  // ──────────────────────────────────────────────────────────────────────
  it('fastDirect matches general realSphericalHarmonic for l = 3 (all 7 f-orbitals)', () => {
    const lmPairs: [number, number][] = [
      [3, -3],
      [3, -2],
      [3, -1],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
    ]

    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        const ct = Math.cos(theta)
        const st = Math.sin(theta)

        for (const [l, m] of lmPairs) {
          const fast = fastRealSphericalHarmonicDirect(l, m, ct, st, phi)
          const general = realSphericalHarmonic(l, m, theta, phi)
          // Tighter tolerance than the l ≤ 2 test because we're
          // specifically validating the hardcoded constants to at least 5
          // decimal places — loose tolerance here would admit constant
          // drift at the fifth decimal without complaint.
          expect(fast).toBeCloseTo(general, 5)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// 3. MATHEMATICAL IDENTITIES
// ---------------------------------------------------------------------------

describe('addition theorem: Σ_m |Y_lm(θ,φ)|² = (2l+1)/(4π)', () => {
  it('holds for l = 0..6 at random angles', () => {
    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        for (let l = 0; l <= 6; l++) {
          let sumSq = 0
          for (let m = -l; m <= l; m++) {
            const [re, im] = sphericalHarmonic(l, m, theta, phi)
            sumSq += re * re + im * im
          }
          const expected = (2 * l + 1) / (4 * Math.PI)
          expect(sumSq).toBeCloseTo(expected, 4)
        }
      }),
      { numRuns: 200 }
    )
  })
})

describe('Y_lm normalization at special angles', () => {
  it('Y_00 = 1/(2√π) everywhere', () => {
    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        const [re, im] = sphericalHarmonic(0, 0, theta, phi)
        expect(re).toBeCloseTo(1 / (2 * Math.sqrt(Math.PI)), 7)
        expect(im).toBeCloseTo(0, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('|Y_10(0,0)| = √(3/(4π)) (z-axis, theta=0)', () => {
    const [re, im] = sphericalHarmonic(1, 0, 0, 0)
    expect(re).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)), 7)
    expect(im).toBeCloseTo(0, 10)
  })

  it('|Y_10(π/2,0)| = 0 (equator, m=0, l=1)', () => {
    // P_1(cos(π/2)) = P_1(0) = 0
    const [re, im] = sphericalHarmonic(1, 0, Math.PI / 2, 0)
    expect(Math.abs(re)).toBeLessThan(1e-10)
    expect(Math.abs(im)).toBeLessThan(1e-10)
  })
})

describe('real spherical harmonic orthonormality — extended to l=3..5', () => {
  // Midpoint integration on (θ, φ) grid
  const N_THETA = 200
  const N_PHI = 200

  function integrateRealYlmProduct(l1: number, m1: number, l2: number, m2: number): number {
    let sum = 0
    const dTheta = Math.PI / N_THETA
    const dPhi = (2 * Math.PI) / N_PHI
    for (let iTheta = 0; iTheta < N_THETA; iTheta++) {
      const theta = (iTheta + 0.5) * dTheta
      const sinTheta = Math.sin(theta)
      for (let iPhi = 0; iPhi < N_PHI; iPhi++) {
        const phi = (iPhi + 0.5) * dPhi
        const Y1 = realSphericalHarmonic(l1, m1, theta, phi)
        const Y2 = realSphericalHarmonic(l2, m2, theta, phi)
        sum += Y1 * Y2 * sinTheta * dTheta * dPhi
      }
    }
    return sum
  }

  // Normalization for l = 3..5
  for (let l = 3; l <= 5; l++) {
    for (let m = -l; m <= l; m++) {
      it(`∫|Y_${l},${m}|² dΩ ≈ 1`, () => {
        const result = integrateRealYlmProduct(l, m, l, m)
        expect(result).toBeCloseTo(1.0, 2)
      })
    }
  }

  // Orthogonality between different l
  const orthoPairs: [[number, number], [number, number]][] = [
    [
      [3, 0],
      [4, 0],
    ],
    [
      [3, 1],
      [3, -1],
    ],
    [
      [3, 2],
      [4, 2],
    ],
    [
      [4, -3],
      [4, 3],
    ],
    [
      [5, 0],
      [3, 0],
    ],
  ]
  for (const [[l1, m1], [l2, m2]] of orthoPairs) {
    it(`⟨Y_${l1},${m1}|Y_${l2},${m2}⟩ ≈ 0`, () => {
      const result = integrateRealYlmProduct(l1, m1, l2, m2)
      expect(Math.abs(result)).toBeLessThan(0.05)
    })
  }
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('spherical harmonic edge cases', () => {
  it('theta = 0 (north pole): Y_lm = 0 for m ≠ 0', () => {
    for (let l = 1; l <= 5; l++) {
      for (let m = -l; m <= l; m++) {
        if (m === 0) continue
        const [re, im] = sphericalHarmonic(l, m, 0, 0)
        expect(Math.abs(re)).toBeLessThan(1e-8)
        expect(Math.abs(im)).toBeLessThan(1e-8)
      }
    }
  })

  it('phi = 0 and phi = 2π give same result (continuity)', () => {
    fc.assert(
      fc.property(arbTheta, (theta) => {
        for (let l = 0; l <= 3; l++) {
          for (let m = -l; m <= l; m++) {
            const [re0, im0] = sphericalHarmonic(l, m, theta, 0)
            const [re2pi, im2pi] = sphericalHarmonic(l, m, theta, 2 * Math.PI)
            expect(re0).toBeCloseTo(re2pi, 8)
            expect(im0).toBeCloseTo(im2pi, 8)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('all values are finite for valid (l,m,θ,φ)', () => {
    fc.assert(
      fc.property(arbTheta, arbPhi, (theta, phi) => {
        for (let l = 0; l <= 6; l++) {
          for (let m = -l; m <= l; m++) {
            const [re, im] = sphericalHarmonic(l, m, theta, phi)
            expect(Number.isFinite(re)).toBe(true)
            expect(Number.isFinite(im)).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
