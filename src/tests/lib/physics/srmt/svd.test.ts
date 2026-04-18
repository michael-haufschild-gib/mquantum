/**
 * Unit tests for the complex-matrix SVD used by the SRMT diagnostic.
 *
 * Strategy: build matrices with known singular values (diagonal, block
 * diagonal, scaled orthogonal), recover them via
 * {@link complexSvdSingularValues}, and assert tight agreement on both
 * tall and wide shapes.
 */

import { describe, expect, it } from 'vitest'

import { complexSvdSingularValues } from '@/lib/physics/srmt/svd'

/**
 * Deterministic linear-congruential generator — avoids Math.random for
 * reproducibility. Mulberry-compatible output range `[0, 1)`.
 */
function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('complexSvdSingularValues', () => {
  it('recovers the diagonal of a real-diagonal 4×4 matrix', () => {
    const values = [5.5, 3.0, 1.25, 0.125]
    const re = new Float64Array(16)
    const im = new Float64Array(16)
    for (let i = 0; i < 4; i++) re[i * 4 + i] = values[i]!
    const sv = complexSvdSingularValues({ rows: 4, cols: 4, re, im })
    expect(sv.length).toBe(4)
    for (let i = 0; i < 4; i++) {
      expect(sv[i]!).toBeCloseTo(values[i]!, 8)
    }
  })

  it('recovers the absolute value of a pure-imaginary diagonal matrix', () => {
    // Complex scalars along the diagonal: 2i, 3i, 4i. Singular values are
    // their magnitudes.
    const re = new Float64Array(9)
    const im = new Float64Array(9)
    im[0] = 2
    im[4] = 3
    im[8] = 4
    const sv = complexSvdSingularValues({ rows: 3, cols: 3, re, im })
    expect(sv.length).toBe(3)
    expect(sv[0]!).toBeCloseTo(4, 8)
    expect(sv[1]!).toBeCloseTo(3, 8)
    expect(sv[2]!).toBeCloseTo(2, 8)
  })

  it('handles tall matrices (m > n) — singular values independent of the trivial m − n zeros', () => {
    // Build a tall 6×3 real matrix with singular values 1, 2, 3 by taking
    // an orthogonal U (columns), diag(1,2,3), and any orthonormal V. We
    // construct M = U · diag(1,2,3) with U’s columns orthonormal.
    // Use the obvious basis stack.
    const re = new Float64Array(6 * 3)
    const im = new Float64Array(6 * 3)
    const sigmas = [3, 1, 2]
    // Place an orthonormal column structure: columns are e1, e2, e3 with
    // the first three rows = I, remaining rows = 0.
    for (let j = 0; j < 3; j++) re[j * 3 + j] = sigmas[j]!
    const sv = complexSvdSingularValues({ rows: 6, cols: 3, re, im })
    expect(sv.length).toBe(3)
    expect(sv[0]!).toBeCloseTo(3, 8)
    expect(sv[1]!).toBeCloseTo(2, 8)
    expect(sv[2]!).toBeCloseTo(1, 8)
  })

  it('handles wide matrices (n > m) with identical spectrum on the short side', () => {
    // 3×6 real matrix: first three columns = diag(1,2,4), rest zero.
    const re = new Float64Array(3 * 6)
    const im = new Float64Array(3 * 6)
    re[0] = 1
    re[1 * 6 + 1] = 2
    re[2 * 6 + 2] = 4
    const sv = complexSvdSingularValues({ rows: 3, cols: 6, re, im })
    expect(sv.length).toBe(3)
    expect(sv[0]!).toBeCloseTo(4, 8)
    expect(sv[1]!).toBeCloseTo(2, 8)
    expect(sv[2]!).toBeCloseTo(1, 8)
  })

  it('agrees with the reference Frobenius norm: Σ σ_k² = ||M||_F²', () => {
    // Seeded random complex 8×5 matrix.
    const rng = lcgRng(0xabcd_0123)
    const m = 8
    const n = 5
    const re = new Float64Array(m * n)
    const im = new Float64Array(m * n)
    let fro2 = 0
    for (let i = 0; i < m * n; i++) {
      const r = rng() * 2 - 1
      const im2 = rng() * 2 - 1
      re[i] = r
      im[i] = im2
      fro2 += r * r + im2 * im2
    }
    const sv = complexSvdSingularValues({ rows: m, cols: n, re, im })
    let acc = 0
    for (const s of sv) acc += s * s
    expect(acc).toBeCloseTo(fro2, 8)
  })

  it('returns zeros for a rank-deficient complex matrix', () => {
    // Build a rank-1 complex matrix u·vᴴ with u, v nonzero so Σσ_k² =
    // ||u||² · ||v||². Only the leading singular value is nonzero.
    const m = 5
    const n = 4
    const u = [1, 0.5, -0.25, 0.1, 0.8]
    const vRe = [1, 0.2, -0.3, 0.7]
    const vIm = [0, 0.1, -0.4, 0.0]
    const re = new Float64Array(m * n)
    const im = new Float64Array(m * n)
    let uSq = 0
    let vSq = 0
    for (let i = 0; i < m; i++) uSq += u[i]! * u[i]!
    for (let j = 0; j < n; j++) vSq += vRe[j]! * vRe[j]! + vIm[j]! * vIm[j]!
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        // M[i,j] = u_i · conj(v_j). Real-valued u_i, complex v_j.
        re[i * n + j] = u[i]! * vRe[j]!
        im[i * n + j] = -u[i]! * vIm[j]!
      }
    }
    const sv = complexSvdSingularValues({ rows: m, cols: n, re, im })
    expect(sv.length).toBe(4)
    expect(sv[0]!).toBeCloseTo(Math.sqrt(uSq * vSq), 8)
    for (let k = 1; k < 4; k++) {
      // Leading singular value is of order √(uSq · vSq) ≈ 1; residual
      // noise at √ε ≈ √1e-16 = 1e-8 after one SVD can surface larger
      // after the real-block doubling. The Gram pathway compresses
      // residuals to machine-epsilon of Gram entries, which scale as
      // σ_max² — so leaving 1e-6 is a safe slack against a 10-ULP
      // pile-up.
      expect(sv[k]!).toBeLessThan(1e-6)
    }
  })

  it('returns empty array for an empty matrix', () => {
    const out = complexSvdSingularValues({
      rows: 0,
      cols: 4,
      re: new Float64Array(0),
      im: new Float64Array(0),
    })
    expect(out.length).toBe(0)
  })

  it('rejects inconsistent buffer sizes', () => {
    expect(() =>
      complexSvdSingularValues({
        rows: 3,
        cols: 3,
        re: new Float64Array(4),
        im: new Float64Array(9),
      })
    ).toThrow(/buffer length/)
  })
})
