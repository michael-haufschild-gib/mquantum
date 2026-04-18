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
 * operator has order `n = Nφ²` and is real symmetric by construction.
 *
 * For clocks `'φ₁'` / `'φ₂'` the slice state space spans `(a, φ_other)`
 * and the natural HJ operator is built by restricting the full WdW
 * operator to that plane. The discretisation is a second-order
 * finite-difference stencil of `−∂²_a + (1/a²) ∂²_{φ_other} + U(a, φ)` at
 * the chosen slice index in the clock axis — again real symmetric. The
 * order is `n = Na · Nφ`.
 *
 * The eigenvalues are returned sorted ascending, matching the convention
 * that K_n (modular) is also reported ascending.
 *
 * ## Sparse representation
 *
 * A dense `n × n` matrix would be prohibitively expensive — clock `'a'`
 * needs `1024² × 4 B` = 4 MB, clock `'φ₁'` needs `4096² × 4 B` = 64 MB
 * per build, and building one per SRMT compute is a measurable memory
 * and GC cost.
 *
 * The stencil is 5-sparse per row (diagonal + 4 neighbours) so we store
 * the operator as:
 *
 * - `diag: Float64Array(n)` — full diagonal (kinetic + potential).
 * - Fixed stencil weights for the `φ₁`, `φ₂` (and for the φ-clock path,
 *   also `a`) directions. The weights are axis-constant for the
 *   clock-`'a'` path; for the φ-clock path they are position-dependent
 *   through the `1/a²` prefactor, so we keep the full per-cell
 *   `1/a²` table and read it inside the mat-vec.
 *
 * Matrix-vector product is then `5 · n` operations — O(n) in time and
 * space — versus the dense `O(n²)` = 16 M flops and 16 MB alloc per
 * call. For Lanczos with `k = 64` eigenvalues that is 64× less work.
 *
 * @module lib/physics/srmt/hjOperator
 */

import { jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'
import { wdwU } from '@/lib/physics/wheelerDeWitt/constants'

import { lanczosTopKOp, type LinearOperator } from './lanczos'
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
   * `'a'` this is an index into the `a` axis; for `'φ₁'` / `'φ₂'` an
   * index into the respective inflaton axis.
   */
  sliceIndex: number
}

/**
 * Sparse operator representation: diagonal + axis-constant stencil
 * weights + an optional per-cell `1/a²` table for axis-variable
 * couplings. Consumed by {@link applySparseOperator} to produce a
 * mat-vec callback.
 */
interface SparseHjOperator {
  n: number
  /**
   * Size of the second axis inside the row-major `(axis0, axis1)` layout
   * of the flattened `n = size0 · size1` index. Used to traverse
   * axis-1 neighbours.
   */
  size1: number
  /** Full diagonal (kinetic contribution + potential U). Length `n`. */
  diag: Float64Array
  /** Stencil coefficient for axis-0 neighbours. For clock `'a'` this is
   * `−1/(a² dφ²)` (constant); for φ-clocks it is `−1/da²` (constant). */
  offAxis0: number
  /**
   * Stencil coefficient for axis-1 neighbours. For clock `'a'` this is
   * `−1/(a² dφ²)` (constant across the slice). For φ-clocks it depends
   * on `1/a²` which varies across axis-0 — `offAxis1Variable` is
   * populated in that case. `offAxis1` is then 0 and callers read from
   * the variable table.
   */
  offAxis1: number
  /**
   * Optional per-cell `1/(a² dφ²)` coefficient for the φ-kinetic term
   * on φ-clock slices. `null` when the coefficient is axis-constant
   * (clock `'a'`). Length `n` — one entry per (axis0, axis1) cell.
   */
  offAxis1Variable: Float64Array | null
  /**
   * Infinity-norm estimate `max_i Σ_j |A_ij|` — used by the callback
   * Lanczos for its β-breakdown threshold. Precomputed once so the
   * Lanczos driver does not need to know the operator structure.
   */
  infNorm: number
}

/**
 * Build the HJ operator's sparse representation for clock `'a'` — on an
 * `(φ₁, φ₂)` slice at fixed `a`. All stencil weights are axis-constant
 * since `1/a²` is fixed on the slice.
 *
 * Index layout: `idx = i1 · Nphi + i2`, so `size0 = size1 = Nphi`.
 * Axis-0 (i1) and axis-1 (i2) both share the same stencil weight.
 */
function buildSparseOpA(inputs: HjOperatorInputs): SparseHjOperator {
  const { Nphi, aMin, aMax, Na, phiExtent, inflatonMass, cosmologicalConstant, sliceIndex } = inputs
  if (Nphi < 2) {
    throw new Error(`buildSparseOpA: Nphi must be >= 2, got ${Nphi}`)
  }
  if (!(aMax > aMin)) {
    throw new Error(`buildSparseOpA: aMax must be > aMin, got [${aMin}, ${aMax}]`)
  }
  if (!(phiExtent > 0)) {
    throw new Error(`buildSparseOpA: phiExtent must be > 0, got ${phiExtent}`)
  }
  if (!(sliceIndex > 0 && sliceIndex < Na - 1)) {
    throw new Error(
      `buildSparseOpA: sliceIndex must be strictly interior, got ${sliceIndex} (Na=${Na})`
    )
  }
  const da = (aMax - aMin) / (Na - 1)
  const a = aMin + sliceIndex * da
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)
  const kinCoeff = 1 / (a * a)

  const n = Nphi * Nphi
  const diag = new Float64Array(n)

  // Operator H_φ = −(1/a²) Δ_φ + U, discretised with ghost-zero Dirichlet:
  //   −Δ_φ → diag += +4/dφ²,   off-diag (each of 4 neighbours) += −1/dφ²
  // scaled by 1/a²:
  //   diag += +4/(a² dφ²),     off-diag += −1/(a² dφ²)
  // Plus +U on the diagonal.
  const diagKin = 4 * invDphi2 * kinCoeff
  const offKin = -invDphi2 * kinCoeff

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2
      diag[idx] = diagKin + wdwU(a, phi1, phi2, inflatonMass, cosmologicalConstant)
    }
  }

  // infNorm = max_i (|diag_i| + 4·|offKin|) (interior cells have 4
  // neighbours; boundary cells have fewer, so this is an upper bound).
  let maxDiag = 0
  for (let i = 0; i < n; i++) {
    const v = Math.abs(diag[i]!)
    if (v > maxDiag) maxDiag = v
  }
  const infNorm = maxDiag + 4 * Math.abs(offKin)

  return {
    n,
    size1: Nphi,
    diag,
    offAxis0: offKin,
    offAxis1: offKin,
    offAxis1Variable: null,
    infNorm,
  }
}

/**
 * Build the HJ operator's sparse representation for clock `'φ₁'` /
 * `'φ₂'` — on an `(a, φ_other)` slice at fixed `φ_clock`. The `a`-kinetic
 * stencil is axis-constant; the `φ`-kinetic stencil is position-dependent
 * through `1/a²`, stored in `offAxis1Variable`.
 *
 * Index layout: `idx = ia · Nphi + io`, so `size0 = Na`, `size1 = Nphi`.
 */
function buildSparseOpPhi(inputs: HjOperatorInputs, clock: 'phi1' | 'phi2'): SparseHjOperator {
  const { Nphi, aMin, aMax, Na, phiExtent, inflatonMass, cosmologicalConstant, sliceIndex } = inputs
  if (Na < 2) {
    throw new Error(`buildSparseOpPhi: Na must be >= 2, got ${Na}`)
  }
  if (Nphi < 2) {
    throw new Error(`buildSparseOpPhi: Nphi must be >= 2, got ${Nphi}`)
  }
  if (!(aMax > aMin)) {
    throw new Error(`buildSparseOpPhi: aMax must be > aMin, got [${aMin}, ${aMax}]`)
  }
  if (!(phiExtent > 0)) {
    throw new Error(`buildSparseOpPhi: phiExtent must be > 0, got ${phiExtent}`)
  }
  if (!(aMin > 0)) {
    // 1/(a·a) below would feed Infinity into Lanczos at ia=0 if a=0 were in the grid.
    throw new Error(
      `buildSparseOpPhi: aMin must be > 0 for phi-clock spectra (1/a^2 kinetic term), got ${aMin}`
    )
  }
  if (!(sliceIndex > 0 && sliceIndex < Nphi - 1)) {
    throw new Error(
      `buildSparseOpPhi: sliceIndex must be strictly interior, got ${sliceIndex} (Nphi=${Nphi})`
    )
  }
  const da = (aMax - aMin) / (Na - 1)
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDa2 = 1 / (da * da)
  const invDphi2 = 1 / (dphi * dphi)
  const phiClock = -phiExtent + sliceIndex * dphi

  const n = Na * Nphi
  const diag = new Float64Array(n)
  const offAxis1Variable = new Float64Array(n)

  for (let ia = 0; ia < Na; ia++) {
    const a = aMin + ia * da
    const invAsq = 1 / (a * a)
    // Off-diagonal φ coupling for this row of (ia, *): +1/(a² dφ²).
    // Sign: from +(1/a²) ∂²_φ with discrete stencil (−2 diagonal, +1
    // neighbour), scaled by 1/a².
    const offPhi = invAsq * invDphi2
    for (let io = 0; io < Nphi; io++) {
      const phiOther = -phiExtent + io * dphi
      const phi1 = clock === 'phi1' ? phiClock : phiOther
      const phi2 = clock === 'phi1' ? phiOther : phiClock
      const idx = ia * Nphi + io

      // Diagonal:
      //   from −∂²_a:    +2/da²
      //   from (1/a²) ∂²_φ: −2/(a² dφ²)
      //   plus U(a, φ)
      diag[idx] =
        2 * invDa2 - 2 * invAsq * invDphi2 + wdwU(a, phi1, phi2, inflatonMass, cosmologicalConstant)

      // Per-cell φ-kinetic off-diagonal. Positive (see sign note above).
      offAxis1Variable[idx] = offPhi
    }
  }

  // infNorm estimate — worst-case absolute row sum. The a-neighbours
  // contribute `2·invDa2` (two present for interior, one for edge); the
  // φ-neighbours contribute `2·offPhi(a)` varying with `a`. Upper-bound
  // by using the maximum invAsq on the grid.
  let maxOffPhi = 0
  for (let i = 0; i < n; i++) {
    const v = Math.abs(offAxis1Variable[i]!)
    if (v > maxOffPhi) maxOffPhi = v
  }
  let maxDiag = 0
  for (let i = 0; i < n; i++) {
    const v = Math.abs(diag[i]!)
    if (v > maxDiag) maxDiag = v
  }
  const infNorm = maxDiag + 2 * invDa2 + 2 * maxOffPhi

  return {
    n,
    size1: Nphi,
    diag,
    offAxis0: -invDa2,
    offAxis1: 0,
    offAxis1Variable,
    infNorm,
  }
}

/**
 * Given a sparse operator, return a {@link LinearOperator} that computes
 * `y = A · x` by iterating over the stencil. Ghost-zero Dirichlet is
 * implicit — out-of-bound neighbour contributions are skipped.
 */
function applySparseOperator(op: SparseHjOperator): LinearOperator {
  const { n, size1, diag, offAxis0, offAxis1, offAxis1Variable } = op
  const size0 = n / size1
  return (x, y) => {
    for (let i0 = 0; i0 < size0; i0++) {
      const rowBase = i0 * size1
      for (let i1 = 0; i1 < size1; i1++) {
        const idx = rowBase + i1
        let acc = diag[idx]! * x[idx]!
        if (i0 > 0) acc += offAxis0 * x[idx - size1]!
        if (i0 < size0 - 1) acc += offAxis0 * x[idx + size1]!
        if (offAxis1Variable !== null) {
          const c = offAxis1Variable[idx]!
          if (i1 > 0) acc += c * x[idx - 1]!
          if (i1 < size1 - 1) acc += c * x[idx + 1]!
        } else {
          if (i1 > 0) acc += offAxis1 * x[idx - 1]!
          if (i1 < size1 - 1) acc += offAxis1 * x[idx + 1]!
        }
        y[idx] = acc
      }
    }
  }
}

/**
 * Construct the discrete Hamilton-Jacobi operator on the slice selected
 * by the chosen clock and return its top-`k` eigenvalues (by magnitude)
 * sorted ascending.
 *
 * This is the production SRMT path. The operator is stored as a
 * 5-sparse stencil (see module docstring) and Lanczos calls a
 * stencil-based mat-vec callback instead of a dense row-major product.
 * Memory usage drops from `n²` floats to `O(n)` floats; mat-vec time
 * drops from `O(n²)` to `O(5 n)` per iteration.
 *
 * @param clock - Clock axis.
 * @param inputs - Grid and potential parameters.
 * @param k - Number of top-magnitude eigenvalues to extract. Values
 *   larger than the slice order `n` are silently clipped to `n`
 *   (recovering the full spectrum).
 * @returns `{ spectrum, n }` — `spectrum` holds the top-k eigenvalues of
 *   `H_HJ` sorted ascending; `n` is the slice dimension (`Nphi²` for
 *   clock `'a'`, `Na · Nphi` for the φ-clocks).
 */
export function hjSpectrumOnSliceTopK(
  clock: SrmtClock,
  inputs: HjOperatorInputs,
  k: number
): { spectrum: Float32Array; n: number } {
  const op = clock === 'a' ? buildSparseOpA(inputs) : buildSparseOpPhi(inputs, clock)
  if (k <= 0) return { spectrum: new Float32Array(0), n: op.n }
  const apply = applySparseOperator(op)
  const spectrum = lanczosTopKOp(apply, op.n, Math.min(k, op.n), op.infNorm)
  return { spectrum, n: op.n }
}

/**
 * Same as {@link hjSpectrumOnSliceTopK} but returns the FULL eigenvalue
 * spectrum sorted ascending. Retained primarily for tests that want to
 * compare against an analytic spectrum or confirm Hermiticity — the
 * production diagnostic uses the top-`k` variant to avoid the `O(n³)`
 * cost at the default WdW grid.
 *
 * Implementation delegates to a full-rank Lanczos run (`k = n`). With
 * full reorthogonalization Lanczos converges to every eigenvalue of the
 * tridiagonal in exact arithmetic; round-off adds a residual but stays
 * well below the precision needed by the HO-spectrum test assertions.
 */
export function hjSpectrumOnSlice(
  clock: SrmtClock,
  inputs: HjOperatorInputs
): { spectrum: Float32Array; n: number } {
  const op = clock === 'a' ? buildSparseOpA(inputs) : buildSparseOpPhi(inputs, clock)
  const apply = applySparseOperator(op)
  const spectrum = lanczosTopKOp(apply, op.n, op.n, op.infNorm)
  return { spectrum, n: op.n }
}

/**
 * Build a 1D harmonic-oscillator Hamiltonian `H = −∂²_x + ω² x²` on a
 * symmetric grid of `N` cells spanning `[−L, L]`, return eigenvalues.
 * Exposed primarily to let `hjOperator.test.ts` verify the discrete
 * operator reproduces the analytic HO spectrum — the kinetic + potential
 * stencil is identical to the one inside the clock-`'a'` operator,
 * restricted to a single axis. Uses the dense Jacobi eigensolver for
 * exact convergence because this helper runs only in tests.
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
