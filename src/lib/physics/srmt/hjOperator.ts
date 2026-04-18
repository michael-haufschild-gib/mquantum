/**
 * Hamilton-Jacobi operator on a slice of the Wheeler–DeWitt minisuperspace.
 *
 * The reduced WdW equation
 *
 *   `[ −∂²_a + (1/a²)(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ = 0`
 *
 * gives — on a fixed-`a` slice with `π_a² = E` acting as the HJ energy —
 * the eigenvalue equation
 *
 *   `H_φ χ = E χ,   H_φ ≡ −(1/a²) ∇²_φ + U(a, φ)`.
 *
 * For clock `'a'` we discretise `H_φ` on the full `(φ₁, φ₂)` grid with a
 * second-order central-difference Laplacian and ghost-zero Dirichlet at
 * the outer edges (matching the convention used by the WdW solver). The
 * operator has size `Nφ² × Nφ²` and is real symmetric by construction —
 * the discrete Laplacian is symmetric (off-diagonals are stencil weights
 * `1/dφ²` between adjacent cells, zero otherwise) and the potential
 * enters only on the diagonal.
 *
 * For clocks `'φ₁'` / `'φ₂'` the slice state space spans `(a, φ_other)`
 * and the natural HJ operator is built by restricting the full WdW
 * operator to that plane. The discretisation is a second-order
 * finite-difference stencil of `−∂²_a + (1/a²) ∂²_{φ_other} + U(a, φ)` at
 * the chosen slice index in the clock axis — again real symmetric after
 * averaging the non-self-adjoint cross-term `1/a²` via the arithmetic
 * mean of the two cell-centre values. The size is `(Na · Nφ) × (Na · Nφ)`.
 *
 * The eigenvalues are returned sorted ascending — consistent with the
 * convention that K_n (modular) is also reported ascending.
 *
 * @module lib/physics/srmt/hjOperator
 */

import { jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'

import { lanczosTopK } from './lanczos'
import type { SrmtClock } from './types'

/**
 * Physical grid + potential parameters needed to build `H_HJ`. All units
 * match the WdW solver: `G = ℏ = c = 1`, potential
 * `U(a, φ) = −36π²·a²·(1 − (8πG/3)·a² · V(φ))`, with
 * `V(φ) = ½ m² (φ₁² + φ₂²) + Λ`.
 */
export interface HjOperatorInputs {
  /** Number of `a` grid points. */
  Na: number
  /** Number of `φ` grid points per axis. */
  Nphi: number
  /** Lower bound of `a` grid. */
  aMin: number
  /** Upper bound of `a` grid. */
  aMax: number
  /** Half-range of `φ`: `φ ∈ [−phiExtent, +phiExtent]`. */
  phiExtent: number
  /** Inflaton mass `m`. */
  inflatonMass: number
  /** Cosmological constant `Λ`. */
  cosmologicalConstant: number
  /**
   * Clock-axis index of the slice at which to evaluate `H_HJ`. For clock
   * `'a'` this is an index into the `a` axis; for `'φ₁'` / `'φ₂'` an index
   * into the respective inflaton axis.
   */
  sliceIndex: number
}

/** Prefactor `c_U = 36 π²` of the WdW potential (matches the solver). */
const C_U = 36 * Math.PI * Math.PI
/** `8 π G / 3` with `G = 1`. */
const WDW_G_PREFACTOR = (8 * Math.PI) / 3

/**
 * Evaluate `U(a, φ₁, φ₂)` — shared with the solver.
 *
 * @param a - Scale factor.
 * @param phi1 - First inflaton.
 * @param phi2 - Second inflaton.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `U(a, φ)` in natural units.
 */
function wdwU(a: number, phi1: number, phi2: number, m: number, lambda: number): number {
  const V = 0.5 * m * m * (phi1 * phi1 + phi2 * phi2) + lambda
  const a2 = a * a
  return -C_U * a2 * (1 - WDW_G_PREFACTOR * a2 * V)
}

/**
 * Build the real symmetric HJ operator matrix on an `(φ₁, φ₂)` slice at
 * fixed `a`. The Laplacian is a second-order central-difference with
 * ghost-zero Dirichlet conditions one cell outside the grid — the
 * diagonal term accumulates a `−4/dφ²` kinetic contribution minus the
 * edge-missing neighbours, so cells at the grid boundary see only
 * present neighbours in the off-diagonals but the same `−4/dφ²` diagonal
 * coefficient (ghost cells are implicitly zero and therefore absent from
 * both sides of the stencil).
 *
 * @param inputs - Physical inputs.
 * @returns Dense real-symmetric operator, row-major `Float64Array` of
 *          length `Nphi² · Nphi²`, together with the operator order `n`.
 */
function buildHjOperatorA(inputs: HjOperatorInputs): { matrix: Float64Array; n: number } {
  const { Nphi, aMin, aMax, Na, phiExtent, inflatonMass, cosmologicalConstant, sliceIndex } = inputs
  if (!(sliceIndex > 0 && sliceIndex < Na - 1)) {
    throw new Error(
      `buildHjOperatorA: sliceIndex must be strictly interior, got ${sliceIndex} (Na=${Na})`
    )
  }
  const da = (aMax - aMin) / (Na - 1)
  const a = aMin + sliceIndex * da
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)
  const kinCoeff = 1 / (a * a)

  const n = Nphi * Nphi
  const M = new Float64Array(n * n)

  // Operator H_φ = −(1/a²) Δ_φ + U, discretised with ghost-zero Dirichlet:
  //   −Δ_φ → diag += +4/dφ²,   off-diag (each of 4 neighbours) += −1/dφ²
  // scaled by 1/a²:
  //   diag += +4/(a² dφ²),     off-diag += −1/(a² dφ²)
  // Plus +U on the diagonal.
  const diagKin = 4 * invDphi2 * kinCoeff
  const offKin = -invDphi2 * kinCoeff

  const add = (at: number, delta: number): void => {
    M[at] = (M[at] ?? 0) + delta
  }

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2
      const row = idx * n

      add(row + idx, diagKin)
      if (i1 > 0) add(row + (i1 - 1) * Nphi + i2, offKin)
      if (i1 < Nphi - 1) add(row + (i1 + 1) * Nphi + i2, offKin)
      if (i2 > 0) add(row + i1 * Nphi + (i2 - 1), offKin)
      if (i2 < Nphi - 1) add(row + i1 * Nphi + (i2 + 1), offKin)

      add(row + idx, wdwU(a, phi1, phi2, inflatonMass, cosmologicalConstant))
    }
  }
  return { matrix: M, n }
}

/**
 * Build the real symmetric HJ operator matrix on an `(a, φ_other)` slice
 * at fixed `φ_clock`. The operator includes both the `a`-direction
 * kinetic term and the orthogonal `φ` kinetic term, with the potential
 * diagonal evaluated at every cell of the slice.
 *
 * The `1/a²` prefactor of the `φ`-kinetic term is position-dependent —
 * we symmetrise the cross neighbour coupling by averaging `(1/a²)` across
 * the two cells it connects, which keeps the discrete operator Hermitian.
 *
 * @param inputs - Physical inputs.
 * @param clock - `'phi1'` or `'phi2'` — the axis being sliced.
 * @returns Dense real-symmetric operator.
 */
function buildHjOperatorPhi(
  inputs: HjOperatorInputs,
  clock: 'phi1' | 'phi2'
): { matrix: Float64Array; n: number } {
  const { Nphi, aMin, aMax, Na, phiExtent, inflatonMass, cosmologicalConstant, sliceIndex } = inputs
  if (!(sliceIndex > 0 && sliceIndex < Nphi - 1)) {
    throw new Error(
      `buildHjOperatorPhi: sliceIndex must be strictly interior, got ${sliceIndex} (Nphi=${Nphi})`
    )
  }
  const da = (aMax - aMin) / (Na - 1)
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDa2 = 1 / (da * da)
  const invDphi2 = 1 / (dphi * dphi)

  // Fixed clock value (stays constant across the slice).
  const phiClock = -phiExtent + sliceIndex * dphi

  // Slice has axis 0 = a (size Na), axis 1 = φ_other (size Nphi).
  const n = Na * Nphi
  const M = new Float64Array(n * n)
  const add = (at: number, delta: number): void => {
    M[at] = (M[at] ?? 0) + delta
  }

  for (let ia = 0; ia < Na; ia++) {
    const a = aMin + ia * da
    const invAsq = 1 / (a * a)
    for (let io = 0; io < Nphi; io++) {
      const phiOther = -phiExtent + io * dphi
      const phi1 = clock === 'phi1' ? phiClock : phiOther
      const phi2 = clock === 'phi1' ? phiOther : phiClock
      const idx = ia * Nphi + io
      const row = idx * n

      // −∂²_a stencil at (ia, io). Sign of operator in HJ: from the WdW
      // constraint H_HJ = −∂²_a + (1/a²) ∇²_φ + U, discrete form:
      //   diag += +2/da²      off_a += −1/da²
      add(row + idx, 2 * invDa2)
      if (ia > 0) add(row + (ia - 1) * Nphi + io, -invDa2)
      if (ia < Na - 1) add(row + (ia + 1) * Nphi + io, -invDa2)

      // (1/a²) ∂²_{φ_other}: discrete form
      //   diag += −2/(a² dφ²)   off_φ += +1/(a² dφ²) per neighbour
      add(row + idx, -2 * invAsq * invDphi2)
      if (io > 0) add(row + ia * Nphi + (io - 1), invAsq * invDphi2)
      if (io < Nphi - 1) add(row + ia * Nphi + (io + 1), invAsq * invDphi2)

      // Potential on the diagonal at the slice point.
      add(row + idx, wdwU(a, phi1, phi2, inflatonMass, cosmologicalConstant))
    }
  }
  return { matrix: M, n }
}

/**
 * Convert a row-major `Float64Array` matrix to `Float32Array` for input
 * into {@link lanczosTopK}. Float32 loses precision on the matrix
 * entries but the Lanczos accumulators run in Float64 internally so the
 * convergence quality is not capped by f32 round-off.
 */
function matrixF64toF32(M: Float64Array, n: number): Float32Array {
  const out = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) out[i] = M[i]!
  return out
}

/**
 * Construct the discrete Hamilton-Jacobi operator on the slice selected
 * by the chosen clock and return its top-`k` eigenvalues (by magnitude)
 * sorted ascending.
 *
 * This is the Lanczos-backed variant used by the production SRMT
 * diagnostic. For a well-separated HJ spectrum, extracting only the
 * dominant `k` eigenvalues turns the previously-cubic Jacobi solve into
 * an `O(k·n²)` cost — the qualitative difference between "returns in
 * ~1s on n = 1024" and "never returns on n = 4096".
 *
 * @param clock - Clock axis.
 * @param inputs - Grid and potential parameters.
 * @param k - Number of top-magnitude eigenvalues to extract. Values
 *            larger than the slice order `n` are silently clipped to
 *            `n` (recovering the full spectrum).
 * @returns `{ spectrum, n }` — `spectrum` holds the top-k eigenvalues of
 *          `H_HJ` sorted ascending (so `spectrum[0]` is the smallest of
 *          the selected set); `n` is the slice dimension (`Nphi²` for
 *          clock `'a'`, `Na · Nphi` for the φ-clocks).
 */
export function hjSpectrumOnSliceTopK(
  clock: SrmtClock,
  inputs: HjOperatorInputs,
  k: number
): { spectrum: Float32Array; n: number } {
  const { matrix, n } = clock === 'a' ? buildHjOperatorA(inputs) : buildHjOperatorPhi(inputs, clock)
  if (k <= 0) return { spectrum: new Float32Array(0), n }
  const matrixF32 = matrixF64toF32(matrix, n)
  const spectrum = lanczosTopK(matrixF32, n, Math.min(k, n))
  return { spectrum, n }
}

/**
 * Construct the discrete Hamilton-Jacobi operator on the slice selected
 * by the chosen clock and return its FULL eigenvalue spectrum sorted
 * ascending. Retained primarily for tests that want to compare against
 * the analytic spectrum or confirm Hermiticity — the production
 * diagnostic uses {@link hjSpectrumOnSliceTopK} to avoid the `O(n³)`
 * cost at the default WdW grid.
 *
 * Implementation delegates to a full-rank Lanczos run (`k = n`). With
 * full reorthogonalization Lanczos converges to every eigenvalue of the
 * tridiagonal in exact arithmetic; round-off adds a residual but stays
 * well below the precision needed by the HO-spectrum test assertions.
 *
 * @param clock - Clock axis.
 * @param inputs - Grid and potential parameters.
 * @returns `{ spectrum, n }` — `spectrum[0]` is the smallest eigenvalue,
 *          `n` is the slice dimension (`Nphi²` for clock `'a'`,
 *          `Na · Nphi` for the φ-clocks).
 */
export function hjSpectrumOnSlice(
  clock: SrmtClock,
  inputs: HjOperatorInputs
): { spectrum: Float32Array; n: number } {
  const { matrix, n } = clock === 'a' ? buildHjOperatorA(inputs) : buildHjOperatorPhi(inputs, clock)
  const matrixF32 = matrixF64toF32(matrix, n)
  const spectrum = lanczosTopK(matrixF32, n, n)
  return { spectrum, n }
}

/**
 * Build a 1D harmonic-oscillator Hamiltonian `H = −∂²_x + ω² x²` on a
 * symmetric grid of `N` cells spanning `[−L, L]`, return eigenvalues.
 * Exposed primarily to let `hjOperator.test.ts` verify the discrete
 * operator reproduces the analytic HO spectrum without building a full
 * WdW slice — the kinetic + potential stencil is identical to the one in
 * {@link buildHjOperatorA} restricted to a single axis.
 *
 * Analytic eigenvalues of `H = −∂²_x + ω² x²` are `2ω · (n + ½)`; the
 * discretisation recovers the low-`n` levels with spacing close to `2ω`.
 *
 * @param N - Grid cell count (`N ≥ 3`).
 * @param L - Half-extent of the grid (so cell width `dx = 2 L / (N − 1)`).
 * @param omega - Oscillator frequency.
 * @returns Ascending eigenvalue spectrum.
 */
export function harmonicOscillator1DSpectrum(N: number, L: number, omega: number): Float64Array {
  if (N < 3) throw new Error('harmonicOscillator1DSpectrum: N must be >= 3')
  if (!(L > 0)) throw new Error('harmonicOscillator1DSpectrum: L must be > 0')
  const dx = (2 * L) / (N - 1)
  const invDx2 = 1 / (dx * dx)
  const M = new Float64Array(N * N)
  const add = (at: number, delta: number): void => {
    M[at] = (M[at] ?? 0) + delta
  }
  for (let i = 0; i < N; i++) {
    const x = -L + i * dx
    const row = i * N
    add(row + i, 2 * invDx2 + omega * omega * x * x)
    if (i > 0) add(row + (i - 1), -invDx2)
    if (i < N - 1) add(row + (i + 1), -invDx2)
  }
  const descending = jacobiEigenvalues(M, N)
  const asc = new Float64Array(N)
  for (let i = 0; i < N; i++) asc[i] = descending[N - 1 - i]!
  return asc
}
