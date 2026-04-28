/**
 * Tests for the semi-implicit ADI bulk propagator.
 *
 * Two routines, both essential to Wheeler–DeWitt symmetry preservation:
 *   - `solveNeumannTridiag1D` — Thomas algorithm for the implicit operator
 *     `(I − κ̂·L_1d_Neumann)·x = b`.
 *   - `solveADILaplacianNeumann2D` — ADI factorization of
 *     `(I − κ̂·D_x)(I − κ̂·D_y)·χ = RHS` on a Nphi×Nphi slab.
 *
 * The contract that matters most: the discrete Neumann Laplacian
 * annihilates the constant-in-φ eigenspace, so any constant-in-φ RHS
 * must produce a constant-in-φ output (`(I − κL)·c = c`). A regression
 * that breaks this immediately violates the Phase 1 symmetry test the
 * source docstring calls out by name.
 */

import { describe, expect, it } from 'vitest'

import {
  allocImplicitBulkScratch,
  solveADILaplacianNeumann2D,
  solveNeumannTridiag1D,
} from '@/lib/physics/wheelerDeWitt/implicitBulk'

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  let m = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!)
    if (d > m) m = d
  }
  return m
}

describe('solveNeumannTridiag1D', () => {
  function setup(N: number) {
    return {
      rhs: new Float64Array(N),
      out: new Float64Array(N),
      cPrime: new Float64Array(N),
      work: new Float64Array(N),
    }
  }

  it('with kappa=0 the operator is identity (out = rhs)', () => {
    const N = 8
    const { rhs, out, cPrime, work } = setup(N)
    for (let i = 0; i < N; i++) rhs[i] = (i + 1) * 0.7
    solveNeumannTridiag1D(rhs, out, N, 0, cPrime, work)
    expect(maxAbsDiff(out, rhs)).toBeLessThan(1e-15)
  })

  it('preserves a constant RHS exactly (Neumann Laplacian annihilates constants)', () => {
    const N = 16
    const { rhs, out, cPrime, work } = setup(N)
    rhs.fill(3.14159)
    for (const kappa of [0.001, 0.1, 1.0, 100.0]) {
      solveNeumannTridiag1D(rhs, out, N, kappa, cPrime, work)
      // (I − κL)·c = c since L·c = 0; expect bit-exact within FP rounding.
      for (let i = 0; i < N; i++) expect(out[i]).toBeCloseTo(3.14159, 12)
    }
  })

  it('round-trip: applying (I − κL) to the solution recovers the RHS', () => {
    // Construct a non-trivial RHS, solve, then apply the operator manually.
    const N = 12
    const { rhs, out, cPrime, work } = setup(N)
    for (let i = 0; i < N; i++) rhs[i] = Math.sin((i * Math.PI) / N) + 0.1 * i
    const kappa = 0.5

    solveNeumannTridiag1D(rhs, out, N, kappa, cPrime, work)

    // Apply (I − κL) to `out` — Neumann ghost makes χ_{-1}=χ_0, χ_N=χ_{N-1}.
    // L[i] = (χ_{i-1} − 2χ_i + χ_{i+1}) / dφ²; here κ̂ already absorbs dφ².
    const recon = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const left = i === 0 ? out[0]! : out[i - 1]!
      const right = i === N - 1 ? out[N - 1]! : out[i + 1]!
      // (I − κ·L)[i] = out[i] − κ·(left − 2·out[i] + right)
      recon[i] = out[i]! - kappa * (left - 2 * out[i]! + right)
    }
    expect(maxAbsDiff(recon, rhs)).toBeLessThan(1e-10)
  })

  it('handles N=1 (single cell, identity)', () => {
    const N = 1
    const { rhs, out, cPrime, work } = setup(N)
    rhs[0] = 7.5
    solveNeumannTridiag1D(rhs, out, N, 1.0, cPrime, work)
    expect(out[0]).toBe(7.5)
  })

  it('handles N=0 (degenerate, no-op)', () => {
    const N = 0
    const rhs = new Float64Array(0)
    const out = new Float64Array(0)
    const cPrime = new Float64Array(0)
    const work = new Float64Array(0)
    expect(() => solveNeumannTridiag1D(rhs, out, N, 1.0, cPrime, work)).not.toThrow()
  })

  it('handles N=2 (smallest non-trivial Neumann problem)', () => {
    const N = 2
    const { rhs, out, cPrime, work } = setup(N)
    rhs[0] = 1
    rhs[1] = 2
    const kappa = 0.5
    solveNeumannTridiag1D(rhs, out, N, kappa, cPrime, work)
    // Recover RHS by applying operator:
    const left = out[0]!
    const right = out[1]!
    // For N=2: row 0 has b=1+κ, c=−κ; row 1 has a=−κ, b=1+κ.
    const r0 = (1 + kappa) * left + -kappa * right
    const r1 = -kappa * left + (1 + kappa) * right
    expect(r0).toBeCloseTo(1, 10)
    expect(r1).toBeCloseTo(2, 10)
  })

  it('does NOT preserve linear ramps — Neumann ghost breaks endpoint linearity', () => {
    // The Neumann ghost rule (χ_{-1} = χ_0, χ_N = χ_{N-1}) extends a linear
    // ramp non-linearly at the boundary, so L·ramp ≠ 0 there even though
    // L·ramp = 0 in the bulk. A pure linear-in-φ mode is therefore *not*
    // an eigenvector of (I − κL) under Neumann BCs, and the implicit solve
    // does not return the ramp unchanged. We assert a small but non-zero
    // endpoint error to lock in this contract — a regression that re-uses
    // periodic ghost rules would silently make this assertion fail.
    const N = 24
    const { rhs, out, cPrime, work } = setup(N)
    for (let i = 0; i < N; i++) rhs[i] = 5 - 0.7 * i
    solveNeumannTridiag1D(rhs, out, N, 0.42, cPrime, work)
    expect(maxAbsDiff(out, rhs)).toBeGreaterThan(1e-9)
  })
})

describe('solveADILaplacianNeumann2D', () => {
  function setup(Nphi: number) {
    return {
      rhs: new Float32Array(2 * Nphi * Nphi),
      out: new Float32Array(2 * Nphi * Nphi),
      scratch: allocImplicitBulkScratch(Nphi),
    }
  }

  it('with kappa=0 is exactly identity on both real and imag components', () => {
    const Nphi = 8
    const { rhs, out, scratch } = setup(Nphi)
    for (let i = 0; i < rhs.length; i++) rhs[i] = (i % 17) * 0.3 - 1
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0, scratch)
    for (let i = 0; i < rhs.length; i++) {
      expect(out[i]).toBeCloseTo(rhs[i]!, 6)
    }
  })

  it('preserves a constant-in-φ RHS exactly (the Phase 1 symmetry contract)', () => {
    const Nphi = 12
    const { rhs, out, scratch } = setup(Nphi)
    // Real = 1.7, imag = -0.3, constant across all (i1, i2).
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        rhs[2 * (i1 * Nphi + i2)] = 1.7
        rhs[2 * (i1 * Nphi + i2) + 1] = -0.3
      }
    }
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0.42, scratch)
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        expect(out[2 * (i1 * Nphi + i2)]).toBeCloseTo(1.7, 5)
        expect(out[2 * (i1 * Nphi + i2) + 1]).toBeCloseTo(-0.3, 5)
      }
    }
  })

  it('exchange symmetry: solving an i1↔i2 symmetric RHS produces a symmetric output', () => {
    // The ADI factorization order is (I − κD_x)(I − κD_y); that's NOT the
    // same operator as (I − κD_y)(I − κD_x), but for a symmetric RHS
    // (χ(i1,i2) = χ(i2,i1)) both factorizations agree to splitting-error
    // O(κ²). Verify the output stays symmetric to within that bound.
    const Nphi = 10
    const { rhs, out, scratch } = setup(Nphi)
    // Symmetric pattern: ⟨φ_1·φ_2⟩-style.
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const idx = 2 * (i1 * Nphi + i2)
        rhs[idx] = (i1 + 1) * (i2 + 1)
        rhs[idx + 1] = 0
      }
    }
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0.05, scratch)
    let maxAsym = 0
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = i1 + 1; i2 < Nphi; i2++) {
        const a = out[2 * (i1 * Nphi + i2)]!
        const b = out[2 * (i2 * Nphi + i1)]!
        const d = Math.abs(a - b)
        if (d > maxAsym) maxAsym = d
      }
    }
    // Splitting-error bound at κ=0.05, Nphi=10 is ~κ² = 2.5e-3; allow 1e-3.
    expect(maxAsym).toBeLessThan(1e-3)
  })

  it('decouples real and imaginary components (independent solves)', () => {
    const Nphi = 8
    const { rhs, out, scratch } = setup(Nphi)
    // Set imag = 0 everywhere; output imag must remain ≈ 0.
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        rhs[2 * (i1 * Nphi + i2)] = (i1 + i2) * 0.5
        rhs[2 * (i1 * Nphi + i2) + 1] = 0
      }
    }
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0.1, scratch)
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        expect(out[2 * (i1 * Nphi + i2) + 1]!).toBeCloseTo(0, 5)
      }
    }
  })

  it('produces finite output for a Gaussian bump RHS at typical solver κ', () => {
    const Nphi = 16
    const { rhs, out, scratch } = setup(Nphi)
    const center = (Nphi - 1) / 2
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const r2 = (i1 - center) ** 2 + (i2 - center) ** 2
        rhs[2 * (i1 * Nphi + i2)] = Math.exp(-r2 / 4)
        rhs[2 * (i1 * Nphi + i2) + 1] = 0
      }
    }
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0.01, scratch)
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i]!)).toBe(true)
    }
  })

  it('does not mutate the input RHS', () => {
    const Nphi = 8
    const { rhs, out, scratch } = setup(Nphi)
    for (let i = 0; i < rhs.length; i++) rhs[i] = Math.cos(i)
    const snapshot = Float32Array.from(rhs)
    solveADILaplacianNeumann2D(rhs, out, Nphi, 0.2, scratch)
    expect(rhs).toEqual(snapshot)
  })
})

describe('allocImplicitBulkScratch', () => {
  it('allocates buffers sized for a Nphi×Nphi grid', () => {
    const s = allocImplicitBulkScratch(20)
    expect(s.interRe).toHaveLength(20 * 20)
    expect(s.interIm).toHaveLength(20 * 20)
    expect(s.rowIn).toHaveLength(20)
    expect(s.rowOut).toHaveLength(20)
    expect(s.cPrime).toHaveLength(20)
    expect(s.work).toHaveLength(20)
  })

  it('all buffers are Float64Array (precision parity between sweeps)', () => {
    const s = allocImplicitBulkScratch(8)
    expect(s.interRe).toBeInstanceOf(Float64Array)
    expect(s.interIm).toBeInstanceOf(Float64Array)
    expect(s.rowIn).toBeInstanceOf(Float64Array)
    expect(s.rowOut).toBeInstanceOf(Float64Array)
    expect(s.cPrime).toBeInstanceOf(Float64Array)
    expect(s.work).toBeInstanceOf(Float64Array)
  })

  it('scratch buffers start at zero', () => {
    const s = allocImplicitBulkScratch(4)
    for (const buf of [s.interRe, s.interIm, s.rowIn, s.rowOut, s.cPrime, s.work]) {
      for (let i = 0; i < buf.length; i++) expect(buf[i]).toBe(0)
    }
  })
})
