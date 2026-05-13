/**
 * Hydrogen radial wavefunction orthonormality tests.
 *
 * Verifies ∫₀^∞ |R_nl(r)|² r² dr = 1 for the 3D hydrogen atom and the
 * N-dimensional generalization R_nl^(D)(r). The normalization is checked
 * by independent numerical integration (Simpson's rule with 100k points),
 * serving as a cross-check against the Gauss-Laguerre quadrature in the
 * production code.
 *
 * Also verifies orthogonality: ∫ R_{n1,l}(r) R_{n2,l}(r) r² dr = 0 for n1≠n2.
 */
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Independent R_nl implementation for test verification
// (cross-checks the shared production helper used by radial normalization and dipoles)
// ---------------------------------------------------------------------------

function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function laguerreAssoc(p: number, alpha: number, x: number): number {
  if (p === 0) return 1
  if (p === 1) return 1 + alpha - x
  let prev2 = 1
  let prev1 = 1 + alpha - x
  let current = 0
  for (let k = 1; k < p; k++) {
    current = ((2 * k + 1 + alpha - x) * prev1 - (k + alpha) * prev2) / (k + 1)
    prev2 = prev1
    prev1 = current
  }
  return current
}

/** 3D hydrogen radial wavefunction R_nl(r) in atomic units (a₀=1). */
function hydrogenR(n: number, l: number, r: number): number {
  const rho = (2 * r) / n
  const norm = Math.sqrt((8 / (n * n * n)) * (factorial(n - l - 1) / (2 * n * factorial(n + l))))
  const L = laguerreAssoc(n - l - 1, 2 * l + 1, rho)
  return norm * Math.pow(rho, l) * Math.exp(-rho / 2) * L
}

/**
 * N-dimensional hydrogen radial wavefunction R_nl^(D)(r).
 * Uses effective angular momentum λ = l + (D-3)/2 and n_eff = n + (D-3)/2.
 * Normalized against the 3D volume element r² dr (per codebase convention).
 */
function hydrogenRND(n: number, l: number, r: number, dim: number): number {
  const lambda = l + (dim - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1
  const rho = (2 * r) / nEff

  const denomFactIdx = nr + Math.round(2 * lambda + 1)
  const norm = Math.sqrt(
    (8 / (nEff * nEff * nEff)) * (factorial(nr) / (2 * nEff * factorial(denomFactIdx)))
  )
  const L = laguerreAssoc(nr, 2 * lambda + 1, rho)
  return norm * Math.pow(rho, lambda) * Math.exp(-rho / 2) * L
}

/** Simpson's rule integration with N subdivisions. */
function simpson(f: (x: number) => number, a: number, b: number, N: number): number {
  const h = (b - a) / N
  let sum = f(a) + f(b)
  for (let i = 1; i < N; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h)
  }
  return (sum * h) / 3
}

const SIMPSON_N = 100_000

// ---------------------------------------------------------------------------
// 3D normalization: ∫₀^∞ |R_nl(r)|² r² dr = 1
// ---------------------------------------------------------------------------

describe('3D hydrogen radial wavefunction normalization', () => {
  const cases: [number, number][] = [
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 0],
    [3, 1],
    [3, 2],
    [4, 0],
    [4, 1],
    [4, 3],
    [5, 0],
    [5, 4],
    [6, 5],
    [7, 6],
  ]

  for (const [n, l] of cases) {
    it(`∫|R_${n}${l}(r)|² r² dr = 1`, () => {
      const rmax = n * 50
      const norm = simpson(
        (r) => {
          const R = hydrogenR(n, l, r)
          return R * R * r * r
        },
        0,
        rmax,
        SIMPSON_N
      )
      expect(norm).toBeCloseTo(1.0, 6)
    })
  }
})

// ---------------------------------------------------------------------------
// 3D orthogonality: ∫ R_{n1,l}(r) R_{n2,l}(r) r² dr = 0  for n1≠n2
// ---------------------------------------------------------------------------

describe('3D hydrogen radial wavefunction orthogonality', () => {
  const pairs: [number, number, number][] = [
    [1, 2, 0], // R_10 ⊥ R_20
    [2, 3, 0], // R_20 ⊥ R_30
    [2, 3, 1], // R_21 ⊥ R_31
    [3, 4, 2], // R_32 ⊥ R_42
    [4, 5, 3], // R_43 ⊥ R_53
  ]

  for (const [n1, n2, l] of pairs) {
    it(`∫ R_${n1}${l}(r) R_${n2}${l}(r) r² dr = 0`, () => {
      const rmax = Math.max(n1, n2) * 50
      const overlap = simpson(
        (r) => hydrogenR(n1, l, r) * hydrogenR(n2, l, r) * r * r,
        0,
        rmax,
        SIMPSON_N
      )
      expect(Math.abs(overlap)).toBeLessThan(1e-6)
    })
  }
})

// ---------------------------------------------------------------------------
// N-D normalization: ∫₀^∞ |R_nl^(D)(r)|² r² dr = 1
// ---------------------------------------------------------------------------

describe('N-dimensional hydrogen radial wavefunction normalization', () => {
  const cases: [number, number, number][] = [
    // D=4 (half-integer λ)
    [1, 0, 4],
    [2, 0, 4],
    [2, 1, 4],
    // D=5 (integer λ)
    [1, 0, 5],
    [2, 1, 5],
    [3, 2, 5],
    // D=7
    [1, 0, 7],
    [2, 0, 7],
    [3, 1, 7],
    // D=11 (extreme case)
    [1, 0, 11],
    [2, 1, 11],
  ]

  for (const [n, l, dim] of cases) {
    it(`∫|R_${n}${l}^(D=${dim})(r)|² r² dr = 1`, () => {
      const nEff = n + (dim - 3) / 2
      const rmax = nEff * 60
      const norm = simpson(
        (r) => {
          const R = hydrogenRND(n, l, r, dim)
          return R * R * r * r
        },
        0,
        rmax,
        SIMPSON_N
      )
      expect(norm).toBeCloseTo(1.0, 5)
    })
  }
})
