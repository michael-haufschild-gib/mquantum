/**
 * Tests for the Lanczos iterative eigensolver used by the SRMT diagnostic.
 *
 * Coverage:
 *   1. Correctness: top-k eigenvalues on random symmetric n = 64 agree
 *      with the dense {@link jacobiEigendecompose} reference to 1e-4.
 *   2. Known spectrum: diagonal matrix with a widely-separated spectrum
 *      [100, 50, 10, 1, 0.1, ...] — top-3 must be exactly {100, 50, 10}
 *      (up to f32 round-off).
 *   3. Convergence: with k = n, all eigenvalues are recovered.
 *   4. Determinism: same seed → bit-identical spectrum.
 *   5. Numerical stability: tightly-clustered eigenvalues do not produce
 *      spurious ghosts (the classical failure mode of unreorthogonalized
 *      Lanczos); all distinct eigenvalues near a cluster are recovered.
 *
 * Timing sanity at n = 1024 was previously asserted here; it lives in
 * `solver.bench.ts` now because the hard millisecond gate flaked under
 * GitHub Actions coverage instrumentation.
 */

import { describe, expect, it } from 'vitest'

import { jacobiEigendecompose } from '@/lib/math/jacobiEigenvalues'
import { lanczosTopK, lanczosTopKOp } from '@/lib/physics/srmt/lanczos'

/** Deterministic LCG used for random test matrices. */
function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Random real symmetric n×n matrix in a `Float32Array`. */
function randomSymmetric(n: number, seed: number): Float32Array {
  const rng = lcgRng(seed)
  const M = new Float32Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const v = 2 * rng() - 1
      M[i * n + j] = v
      M[j * n + i] = v
    }
  }
  return M
}

/**
 * Promote a `Float32Array` matrix to `Float64Array` for the reference
 * dense Jacobi eigendecomposition. Kept local so we do not need a
 * public widen helper.
 */
function toF64(A: Float32Array): Float64Array {
  const out = new Float64Array(A.length)
  for (let i = 0; i < A.length; i++) out[i] = A[i]!
  return out
}

describe('lanczosTopK — correctness at n = 64', () => {
  it('matches the top-k eigenvalues of the dense Jacobi reference within 1e-4', () => {
    const n = 64
    const k = 8
    const A = randomSymmetric(n, 0xabcd_1234)
    const top = lanczosTopK(A, n, k)
    const { values } = jacobiEigendecompose(toF64(A), n)
    // Reference: sort all |λ| descending, take top-k, sort ascending.
    const refAsc = Array.from(values)
      .map((v) => ({ v, a: Math.abs(v) }))
      .sort((x, y) => y.a - x.a)
      .slice(0, k)
      .map((e) => e.v)
      .sort((x, y) => x - y)
    expect(top).toHaveLength(k)
    for (let i = 0; i < k; i++) {
      expect(Math.abs(top[i]! - refAsc[i]!)).toBeLessThan(1e-4)
    }
  })
})

describe('lanczosTopK — known diagonal spectrum', () => {
  it('recovers the 3 largest-magnitude eigenvalues of a diagonal matrix', () => {
    const diag = [100, 50, 10, 1, 0.1, 0.01, 0.001, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8]
    const n = diag.length
    const M = new Float32Array(n * n)
    for (let i = 0; i < n; i++) M[i * n + i] = diag[i]!
    const top = lanczosTopK(M, n, 3)
    // Ascending order of the top-3 |λ|: [10, 50, 100].
    expect(top).toHaveLength(3)
    expect(top[0]!).toBeCloseTo(10, 4)
    expect(top[1]!).toBeCloseTo(50, 4)
    expect(top[2]!).toBeCloseTo(100, 4)
  })

  it('captures both tails when the spectrum has large negative eigenvalues', () => {
    // Diagonal with one huge negative and one huge positive. Top-2 by
    // magnitude should be that pair.
    const diag = [1, 2, 3, 4, 5, -200, 150]
    const n = diag.length
    const M = new Float32Array(n * n)
    for (let i = 0; i < n; i++) M[i * n + i] = diag[i]!
    const top = lanczosTopK(M, n, 2)
    expect(top).toHaveLength(2)
    // Ascending: [-200, 150]
    expect(top[0]!).toBeCloseTo(-200, 3)
    expect(top[1]!).toBeCloseTo(150, 3)
  })
})

describe('lanczosTopK — convergence at k = n', () => {
  it('recovers every eigenvalue when k equals n', () => {
    const n = 24
    const A = randomSymmetric(n, 0x0123_4567)
    const full = lanczosTopK(A, n, n)
    const { values } = jacobiEigendecompose(toF64(A), n)
    const refAsc = Array.from(values).sort((a, b) => a - b)
    expect(full).toHaveLength(n)
    for (let i = 0; i < n; i++) {
      expect(Math.abs(full[i]! - refAsc[i]!)).toBeLessThan(5e-4)
    }
  })
})

describe('lanczosTopK — determinism', () => {
  it('produces bit-identical results for the same seed', () => {
    const n = 48
    const A = randomSymmetric(n, 0xbadf_00d)
    const r1 = lanczosTopK(A, n, 6, { seed: 0xdead_beef })
    const r2 = lanczosTopK(A, n, 6, { seed: 0xdead_beef })
    expect(Array.from(r1)).toEqual(Array.from(r2))
  })

  it('default seed is stable across calls (reproducible without passing a seed)', () => {
    const n = 48
    const A = randomSymmetric(n, 0xbadf_00d)
    const r1 = lanczosTopK(A, n, 6)
    const r2 = lanczosTopK(A, n, 6)
    expect(Array.from(r1)).toEqual(Array.from(r2))
  })
})

describe('lanczosTopK — tight cluster stability', () => {
  it('does not emit spurious duplicates near a tight cluster', () => {
    // Diagonal with three near-equal entries around 7.0 and distinct
    // others. Without full reorthogonalization Lanczos would emit
    // ghost eigenvalues in this regime.
    const diag = [7.0, 7.000001, 7.000002, 3, 1, 0.5, 0.25, 0.125, 0.0625]
    const n = diag.length
    const M = new Float32Array(n * n)
    for (let i = 0; i < n; i++) M[i * n + i] = diag[i]!
    const top = lanczosTopK(M, n, 4)
    // Sort in ascending order: [3, ~7, ~7, ~7] — all three cluster
    // members should appear.
    expect(top).toHaveLength(4)
    expect(top[0]!).toBeCloseTo(3, 3)
    expect(top[1]!).toBeCloseTo(7, 4)
    expect(top[2]!).toBeCloseTo(7, 4)
    expect(top[3]!).toBeCloseTo(7, 4)
  })
})

describe('lanczosTopK — edge cases', () => {
  it('returns empty array for k = 0', () => {
    const n = 8
    const A = randomSymmetric(n, 1)
    const out = lanczosTopK(A, n, 0)
    expect(out).toHaveLength(0)
  })

  it('returns empty array for n = 0', () => {
    const out = lanczosTopK(new Float32Array(0), 0, 4)
    expect(out).toHaveLength(0)
  })

  it('handles the degenerate n = 1 case (single-element matrix)', () => {
    // Minimal non-empty input. β breaks down on step 0 (the tridiagonal is
    // 1×1), so Lanczos returns the single diagonal entry as the eigenvalue.
    const A = new Float32Array([7.5])
    const out = lanczosTopK(A, 1, 1)
    expect(out).toHaveLength(1)
    expect(out[0]!).toBeCloseTo(7.5, 5)
  })

  it('clamps user-supplied maxIterations below k back up to k', () => {
    // `maxIterations = 1` with `k = 3` is nonsense — you cannot extract 3
    // eigenvalues from a 1-step Krylov basis. The routine's `Math.max(k, ...)`
    // floor promises the returned length is `k`, not `1`. We don't check
    // numerical accuracy here (3 Krylov steps on a 6-dim operator give
    // Ritz approximations, not exact eigenvalues) — only the length
    // contract and finiteness.
    const n = 6
    const k = 3
    const diag = [5, 4, 3, 2, 1, 0.5]
    const M = new Float32Array(n * n)
    for (let i = 0; i < n; i++) M[i * n + i] = diag[i]!
    const clipped = lanczosTopK(M, n, k, { maxIterations: 1 })
    expect(clipped).toHaveLength(k)
    for (let i = 0; i < k; i++) {
      expect(Number.isFinite(clipped[i]!)).toBe(true)
      // Every Ritz value of a real-symmetric matrix lies in the spectral
      // range — here [0.5, 5].
      expect(clipped[i]!).toBeGreaterThanOrEqual(0.5 - 1e-3)
      expect(clipped[i]!).toBeLessThanOrEqual(5 + 1e-3)
    }
  })

  it('stops on exact Krylov breakdown even when tolerance is zero', () => {
    const out = lanczosTopKOp(
      (_x, y) => {
        y.fill(0)
      },
      5,
      3,
      0,
      { tolerance: 0 }
    )
    expect(Array.from(out)).toEqual([0])
  })

  it('clips k to n when k > n', () => {
    const n = 5
    const A = randomSymmetric(n, 42)
    const out = lanczosTopK(A, n, 100)
    expect(out.length).toBeLessThanOrEqual(n)
  })

  it('rejects non-integer n', () => {
    const A = new Float32Array(16)
    expect(() => lanczosTopK(A, 4.5, 2)).toThrow(/non-negative integer/)
  })

  it('rejects buffer shorter than n²', () => {
    const A = new Float32Array(10)
    expect(() => lanczosTopK(A, 4, 2)).toThrow(/buffer length/)
  })
})
