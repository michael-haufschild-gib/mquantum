/**
 * Types for the Superspace-Relational Modular Time (SRMT) diagnostic.
 *
 * SRMT is a framework candidate for the "problem of time" in quantum
 * cosmology: the claim under test is that the DeWitt-supermetric-selected
 * clock (the scale factor `a`) uniquely generates a modular Hamiltonian
 * whose spectrum tracks the Hamilton-Jacobi generator of a WKB slice.
 * Alternative clocks (φ₁, φ₂) should yield POORER affine alignment
 * between the modular spectrum and the HJ operator spectrum.
 *
 * The diagnostic consumes a {@link WheelerDeWittSolverOutput} produced
 * elsewhere, computes a Schmidt decomposition of `χ(a, φ₁, φ₂)` under
 * the chosen clock axis, extracts the resulting modular spectrum
 * `K_n = −log(s_n² + ε)`, constructs a Hamilton-Jacobi operator on a
 * fixed clock slice, and returns an affine-match quality metric together
 * with the two spectra side-by-side and a `sliceK` array used downstream
 * by the render overlay.
 *
 * Scope: pure functions only. No store access, no WebGPU, no UI.
 *
 * @module lib/physics/srmt/types
 */

/**
 * Identifier for the clock axis selected by the SRMT diagnostic.
 *
 * `'a'` — scale factor, the DeWitt-timelike coordinate (negative
 *   supermetric signature). The SRMT conjecture predicts this clock yields
 *   the best affine match between modular and HJ spectra.
 * `'phi1'` / `'phi2'` — inflaton axes, spacelike in the DeWitt supermetric.
 *   Expected to show poorer alignment per the SRMT hypothesis.
 */
export type SrmtClock = 'a' | 'phi1' | 'phi2'

/**
 * Slice plane orientation corresponding to a given {@link SrmtClock}.
 *
 * - `'phi-phi'` when the clock is `'a'` — the slice spans `(φ₁, φ₂)`.
 * - `'a-phi2'` when the clock is `'phi1'` — the slice spans `(a, φ₂)`.
 * - `'a-phi1'` when the clock is `'phi2'` — the slice spans `(a, φ₁)`.
 */
export type SrmtSlicePlane = 'phi-phi' | 'a-phi2' | 'a-phi1'

/**
 * Configuration input to {@link computeSrmtDiagnostic}.
 */
export interface SrmtConfig {
  /** Clock axis along which χ is partitioned. */
  clock: SrmtClock
  /**
   * Grid index of the slice through the clock axis. Used as:
   *   1. The location at which the Hamilton-Jacobi operator is evaluated.
   *   2. The index consulted when populating {@link SrmtResult.sliceK}.
   * Must lie strictly inside the axis: `0 < cutIndex < N_clock - 1`.
   * This parameter does **not** define a density-matrix bipartition —
   * the Schmidt decomposition operates on the full tensor `χ` reshaped
   * as a matrix with the clock axis as the row index. See the module
   * docstring of `schmidt.ts` for the dimensional argument.
   */
  cutIndex: number
  /**
   * Upper bound on the number of Schmidt singular values retained. Values
   * beyond `rankCap` are dropped from {@link SrmtResult.schmidtValues},
   * {@link SrmtResult.kSpectrum}, and the affine fit. Must be ≥ 1.
   */
  rankCap: number
}

/**
 * Output of {@link computeSrmtDiagnostic}.
 *
 * Arrays are all `Float32Array` by specification; internal computation
 * uses `Float64Array` accumulators and the final cast is performed at
 * return time to keep downstream renderer formats stable.
 */
export interface SrmtResult {
  /** Schmidt singular values sorted descending. Length ≤ `rankCap`. */
  schmidtValues: Float32Array
  /**
   * Modular-Hamiltonian spectrum `K_n = −log(s_n² + ε)` aligned with
   * `schmidtValues`. Monotonically non-decreasing.
   */
  kSpectrum: Float32Array
  /**
   * Eigenvalues of the discretised Hamilton-Jacobi operator on the clock
   * slice, sorted ascending. Length equals the slice dimension (e.g.
   * `Nphi²` for clock `'a'`).
   */
  hjSpectrum: Float32Array
  /**
   * Affine-match quality score. Smaller is better (0 = perfect fit).
   * Defined as `Σ_n (K_n − (α E_n + β))² / Σ_n K_n²` after a least-squares
   * fit of `α`, `β` over the first `min(kSpectrum.length, hjSpectrum.length,
   * rankCap)` points.
   */
  affineMatchQuality: number
  /** Orientation of the clock slice for render-time consumers. */
  slicePlane: SrmtSlicePlane
  /**
   * `K_A` eigenvalue density on the slice. Exactly `Nphi²` entries.
   * Populated by projecting the Schmidt `K` spectrum onto the slice
   * axis count and zero-padding if the rank is lower than `Nphi²`. Used
   * downstream by the render overlay.
   */
  sliceK: Float32Array
}
