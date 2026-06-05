/**
 * Bisognano–Wichmann sanity check on the Schmidt + modular-spectrum
 * pipeline.
 *
 * The BW theorem states that for a Minkowski-vacuum restricted to a
 * Rindler wedge, the modular Hamiltonian is `2π · K` (boost generator),
 * so the reduced-density-matrix eigenvalues follow `λ_n ∝ e^{−2π n}` in
 * the continuum limit. On a finite lattice with a product-of-Gaussians
 * vacuum state the exact `2π` slope is not reached, but the spectrum is
 * still exponential in the mode index.
 *
 * The task specification interprets the test as:
 *   "1D free-particle ψ_0(x) on a finite interval with Minkowski-vacuum-
 *    like initial data (Gaussian of width σ), bipartition at x=0, assert
 *    exponential decay s_n² ~ e^{−2π n}".
 *
 * A single-variable wavefunction ψ(x) has no tensor-product structure —
 * a "bipartition at x = 0" of a single-variable state is a direct-sum
 * split, not a Schmidt decomposition. The physically meaningful
 * analogue is a **two-mode correlated Gaussian** ψ(x, y) and a Schmidt
 * decomposition of the matrix `M[i, j] = ψ(x_i, y_j)` with x indexing
 * rows and y columns. For a correlated Gaussian
 *   `ψ(x, y) ∝ exp(−α(x² + y²) − β x y)`
 * the Schmidt coefficients decay geometrically, so
 *   `K_n = −log s_n² ∝ n` (up to an additive constant).
 *
 * This test therefore asserts exponential decay (linear `K_n` in `n`)
 * with a positive slope and a high coefficient of determination from the
 * linear fit. We do **not** demand the slope equal `2π`: the exact
 * Bisognano–Wichmann rate is only reached in the continuum Rindler-wedge
 * limit; a two-mode Gaussian produces a slope that depends on the
 * squeezing parameter. The structural claim — that the full Schmidt +
 * modular-Hamiltonian pipeline yields an exponential modular spectrum —
 * is the non-negotiable part and is what the test enforces.
 */

import { describe, expect, it } from 'vitest'

import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'
import { complexSvdSingularValues } from '@/lib/physics/srmt/svd'

describe('Bisognano-Wichmann pipeline sanity', () => {
  it('produces an exponential Schmidt decay for a two-mode correlated Gaussian', () => {
    // Grid: x ∈ [−L, L] with N cells per axis.
    const N = 64
    const L = 4.0
    const dx = (2 * L) / (N - 1)
    const alpha = 0.5
    const beta = 0.4 // correlation strength; |β| < α to keep the Gaussian normalisable
    const re = new Float64Array(N * N)
    const im = new Float64Array(N * N)
    for (let i = 0; i < N; i++) {
      const x = -L + i * dx
      for (let j = 0; j < N; j++) {
        const y = -L + j * dx
        const psi = Math.exp(-(alpha * (x * x + y * y) + beta * x * y))
        re[i * N + j] = psi
      }
    }
    const sv = complexSvdSingularValues({ rows: N, cols: N, re, im })
    const { spectrum: K } = modularSpectrum(sv)
    // Fit `K_n = a·n + b` over the first 8 values. Expect positive slope
    // and R² > 0.95 — this is the BW-structural assertion.
    const count = 8
    let sumN = 0
    let sumK = 0
    for (let i = 0; i < count; i++) {
      sumN += i
      sumK += K[i]!
    }
    const meanN = sumN / count
    const meanK = sumK / count
    let sNN = 0
    let sNK = 0
    let sKK = 0
    for (let i = 0; i < count; i++) {
      const dN = i - meanN
      const dK = K[i]! - meanK
      sNN += dN * dN
      sNK += dN * dK
      sKK += dK * dK
    }
    const slope = sNK / sNN
    const r2 = sKK > 0 ? (sNK * sNK) / (sNN * sKK) : 0
    expect(slope).toBeGreaterThan(0.5) // positive exponential decay
    expect(r2).toBeGreaterThan(0.95) // linear trend well-fit
  })

  it('yields s_0² + s_1² + ... ≈ ||ψ||² (consistency check)', () => {
    const N = 32
    const L = 3.0
    const dx = (2 * L) / (N - 1)
    const re = new Float64Array(N * N)
    const im = new Float64Array(N * N)
    let fro2 = 0
    for (let i = 0; i < N; i++) {
      const x = -L + i * dx
      for (let j = 0; j < N; j++) {
        const y = -L + j * dx
        const psi = Math.exp(-0.5 * (x * x + y * y) - 0.3 * x * y)
        re[i * N + j] = psi
        fro2 += psi * psi
      }
    }
    const sv = complexSvdSingularValues({ rows: N, cols: N, re, im })
    let sq = 0
    for (const s of sv) sq += s * s
    expect(sq).toBeCloseTo(fro2, 6)
  })

  it('uncorrelated Gaussian (β = 0) is rank-1 — single nontrivial Schmidt value', () => {
    const N = 24
    const L = 3.0
    const dx = (2 * L) / (N - 1)
    const re = new Float64Array(N * N)
    const im = new Float64Array(N * N)
    for (let i = 0; i < N; i++) {
      const x = -L + i * dx
      for (let j = 0; j < N; j++) {
        const y = -L + j * dx
        re[i * N + j] = Math.exp(-0.5 * (x * x + y * y))
      }
    }
    const sv = complexSvdSingularValues({ rows: N, cols: N, re, im })
    expect(sv[0]!).toBeGreaterThan(0.1)
    // Rank-1 — subsequent singular values tiny relative to the leading.
    expect(sv[1]! / sv[0]!).toBeLessThan(1e-6)
  })
})
