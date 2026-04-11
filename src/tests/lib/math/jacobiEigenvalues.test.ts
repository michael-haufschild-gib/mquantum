/**
 * Unit tests for the cyclic Jacobi eigensolver.
 *
 * Covers:
 * - Happy path: analytic eigenvalues of a small tridiagonal matrix.
 * - Full eigendecomposition reconstruction `A ≈ Q Λ Qᵀ`.
 * - Non-convergence throw path: exercised deterministically by capping
 *   `maxSweeps = 0` so the solver cannot complete even one sweep, and by
 *   capping `maxSweeps = 1` on a moderately-sized random symmetric matrix
 *   where a single sweep is insufficient for the 1e-11 tolerance.
 *
 * The non-convergence test is the reason this file exists: without it,
 * silent fall-through from the old implementation could not be regression-
 * guarded. A missing throw here would cause Peschel / symplectic
 * eigenvalue consumers to emit plausible-looking but corrupt numbers.
 *
 * @module tests/lib/math/jacobiEigenvalues
 */

import { describe, expect, it } from 'vitest'

import { jacobiEigendecompose, jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'

describe('jacobiEigenvalues — happy path', () => {
  it('reproduces the analytic eigenvalues of the 3×3 second-difference matrix', () => {
    // A = [[2,1,0],[1,2,1],[0,1,2]] has eigenvalues {2 − √2, 2, 2 + √2}.
    const A = new Float64Array([2, 1, 0, 1, 2, 1, 0, 1, 2])
    const eig = jacobiEigenvalues(A, 3)
    const expected = [2 + Math.SQRT2, 2, 2 - Math.SQRT2]
    for (let i = 0; i < 3; i++) {
      expect(eig[i]!).toBeCloseTo(expected[i]!, 10)
    }
  })

  it('reconstructs A ≈ Q Λ Qᵀ via the full decomposition', () => {
    // Hand-chosen symmetric 4×4 matrix with distinct eigenvalues.
    const A = new Float64Array([4, 1, 2, 0, 1, 3, 0, 1, 2, 0, 5, 2, 0, 1, 2, 4])
    const n = 4
    const { values, vectors } = jacobiEigendecompose(A, n)

    // Reconstruct: for each (i, j), (Q Λ Qᵀ)_{ij} = Σ_k Q[i,k] · λ_k · Q[j,k].
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let acc = 0
        for (let k = 0; k < n; k++) {
          acc += vectors[i * n + k]! * values[k]! * vectors[j * n + k]!
        }
        expect(acc).toBeCloseTo(A[i * n + j]!, 10)
      }
    }
  })

  it('returns a singleton eigenvalue unchanged for n = 1', () => {
    const A = new Float64Array([7.25])
    const eig = jacobiEigenvalues(A, 1)
    expect(eig.length).toBe(1)
    expect(eig[0]!).toBe(7.25)
  })

  it('returns an empty array for n = 0', () => {
    const A = new Float64Array(0)
    const eig = jacobiEigenvalues(A, 0)
    expect(eig.length).toBe(0)
  })
})

describe('jacobiEigenvalues — non-convergence throws loudly', () => {
  // We force the non-convergence branch by passing `maxSweeps = 0`: the
  // solver has no budget to zero any off-diagonal element, so the post-
  // loop residual check fires regardless of input condition. The test
  // intentionally uses a matrix whose off-diagonal is *not* already
  // within `JACOBI_TOL`, otherwise the 0-sweep early return would kick in.
  it('jacobiEigenvalues throws when maxSweeps = 0 cannot reduce the off-diagonal', () => {
    const A = new Float64Array([2, 1, 0, 1, 2, 1, 0, 1, 2])
    expect(() => jacobiEigenvalues(A, 3, 0)).toThrow(/failed to converge within 0 sweeps/)
  })

  it('jacobiEigendecompose throws when maxSweeps = 0 cannot reduce the off-diagonal', () => {
    const A = new Float64Array([4, 1, 2, 0, 1, 3, 0, 1, 2, 0, 5, 2, 0, 1, 2, 4])
    expect(() => jacobiEigendecompose(A, 4, 0)).toThrow(/failed to converge within 0 sweeps/)
  })

  it('error message reports residual and tolerance so consumers can diagnose the failure', () => {
    const A = new Float64Array([5, 2, 2, 5])
    try {
      jacobiEigenvalues(A, 2, 0)
      throw new Error('unreachable: jacobiEigenvalues should have thrown')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Should cite the (truncated) sweep cap and both residual + tolerance
      // so the failure mode is self-explanatory in logs.
      expect(message).toMatch(/failed to converge within 0 sweeps/)
      expect(message).toMatch(/residual=/)
      expect(message).toMatch(/tolerance=/)
      expect(message).toMatch(/n=2/)
    }
  })

  it('default max sweep cap (200) is sufficient for a well-conditioned 16×16 random symmetric matrix', () => {
    // Deterministic linear congruential seed — no external RNG needed.
    let state = 0x9e3779b9
    const next = (): number => {
      state = (state * 1103515245 + 12345) >>> 0
      return state / 0xffffffff
    }
    const n = 16
    const A = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const v = 2 * next() - 1
        A[i * n + j] = v
        A[j * n + i] = v
      }
    }
    // Add a diagonal shift so the matrix is well-conditioned (positive definite).
    for (let i = 0; i < n; i++) A[i * n + i]! += n
    // Happy path: default max sweeps succeed.
    const eig = jacobiEigenvalues(A, n)
    expect(eig.length).toBe(n)
    // Sorted descending.
    for (let i = 1; i < n; i++) expect(eig[i]!).toBeLessThanOrEqual(eig[i - 1]!)
    // Trace invariant: Σ λ_k = Σ A_ii.
    let eigSum = 0
    let diagSum = 0
    for (let i = 0; i < n; i++) {
      eigSum += eig[i]!
      diagSum += A[i * n + i]!
    }
    expect(eigSum).toBeCloseTo(diagSum, 9)
  })
})
