/**
 * Schmidt decomposition of a Wheeler–DeWitt `χ(a, φ₁, φ₂)` tensor along
 * one axis.
 *
 * ## What this module computes
 *
 * Given the 3-tensor `χ[i_a, i_1, i_2]` (complex, interleaved in the
 * solver output), we form a bipartite matrix by treating one axis — the
 * *clock* axis — as the row index and folding the remaining two axes
 * into a single column index. The matrix singular values are the Schmidt
 * coefficients of the bipartition.
 *
 * For clock `'a'` the matrix is `Na × Nφ²`; for clock `'φ₁'` or `'φ₂'` the
 * matrix is `Nφ × (Na · Nφ)`. There are therefore `min(Na, Nφ²)` Schmidt
 * values in the first case and `min(Nφ, Na · Nφ) = Nφ` in the others.
 *
 * ## Interpretation of `cutIndex`
 *
 * The SRMT configuration carries a `cutIndex`, which **does not** drive
 * the matrix reshape. The task specification proposed a matrix of shape
 * `cut · Nφ² × (Na − cut) · Nφ²` — but the product of those dimensions
 * exceeds the buffer size of `χ` (which has only `Na · Nφ²` complex
 * entries), so there is no direct reshape that yields it. A Schmidt
 * decomposition requires a tensor-product factorisation; a "cut on the
 * a-axis" in the state vector produces a direct-sum, not a tensor-product,
 * split.
 *
 * The physically meaningful Schmidt decomposition of the 3-tensor is the
 * matrix SVD described above. `cutIndex` is consumed downstream by the
 * WKB slice selector and the HJ operator builder, where it does select a
 * specific slab of the clock axis.
 *
 * @module lib/physics/srmt/schmidt
 */

import type { ComplexMatrix } from './svd'
import { complexSvdSingularValues } from './svd'
import type { SrmtClock } from './types'

/**
 * Minimal subset of the Wheeler–DeWitt solver output that this module
 * depends on. Decoupling from the full `WheelerDeWittSolverOutput` keeps
 * this file usable from tests that mock only the tensor.
 */
export interface ChiTensor {
  /**
   * Complex amplitudes as interleaved `(re, im)` pairs. Row-major order
   * `[i_a, i_1, i_2]` with 2 floats per cell. Length must be
   * `2 · Na · Nphi · Nphi`.
   */
  chi: Float32Array
  /** `[Na, Nphi, Nphi]`. */
  gridSize: [number, number, number]
}

/**
 * Assemble a complex matrix view of `χ` according to the chosen clock.
 *
 * @param tensor - Input 3-tensor.
 * @param clock - Clock axis; rows of the returned matrix index this axis.
 * @returns A fresh `ComplexMatrix` whose singular values are the Schmidt
 *          coefficients of the bipartition.
 */
export function reshapeForClock(tensor: ChiTensor, clock: SrmtClock): ComplexMatrix {
  const [Na, Nphi1, Nphi2] = tensor.gridSize
  const phiSq = Nphi1 * Nphi2
  const chi = tensor.chi

  if (chi.length !== 2 * Na * phiSq) {
    throw new Error(
      `reshapeForClock: buffer length ${chi.length} !== 2·Na·Nphi² (2·${Na}·${phiSq})`
    )
  }

  if (clock === 'a') {
    // rows = i_a, cols = (i_1 * Nphi + i_2)
    const rows = Na
    const cols = phiSq
    const re = new Float64Array(rows * cols)
    const im = new Float64Array(rows * cols)
    for (let ia = 0; ia < Na; ia++) {
      for (let p = 0; p < phiSq; p++) {
        const src = 2 * (ia * phiSq + p)
        re[ia * cols + p] = chi[src]!
        im[ia * cols + p] = chi[src + 1]!
      }
    }
    return { rows, cols, re, im }
  }

  if (clock === 'phi1') {
    // rows = i_1, cols = (i_a * Nphi + i_2)
    const rows = Nphi1
    const cols = Na * Nphi2
    const re = new Float64Array(rows * cols)
    const im = new Float64Array(rows * cols)
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi1; i1++) {
        for (let i2 = 0; i2 < Nphi2; i2++) {
          const src = 2 * (ia * phiSq + i1 * Nphi2 + i2)
          const dst = i1 * cols + (ia * Nphi2 + i2)
          re[dst] = chi[src]!
          im[dst] = chi[src + 1]!
        }
      }
    }
    return { rows, cols, re, im }
  }

  if (clock !== 'phi2') {
    throw new Error(`reshapeForClock: unsupported clock "${String(clock)}"`)
  }

  // clock === 'phi2'
  // rows = i_2, cols = (i_a * Nphi + i_1)
  const rows = Nphi2
  const cols = Na * Nphi1
  const re = new Float64Array(rows * cols)
  const im = new Float64Array(rows * cols)
  for (let ia = 0; ia < Na; ia++) {
    for (let i1 = 0; i1 < Nphi1; i1++) {
      for (let i2 = 0; i2 < Nphi2; i2++) {
        const src = 2 * (ia * phiSq + i1 * Nphi2 + i2)
        const dst = i2 * cols + (ia * Nphi1 + i1)
        re[dst] = chi[src]!
        im[dst] = chi[src + 1]!
      }
    }
  }
  return { rows, cols, re, im }
}

/**
 * Compute the Schmidt singular values of `χ` under the selected clock
 * bipartition. Values are returned sorted descending.
 *
 * @param tensor - `χ` tensor.
 * @param clock - Clock axis used as the row index of the reshaped matrix.
 * @returns Descending singular values. Length is `min(N_clock, N_rest)`.
 */
export function schmidtValues(tensor: ChiTensor, clock: SrmtClock): Float64Array {
  const M = reshapeForClock(tensor, clock)
  return complexSvdSingularValues(M)
}

/**
 * Sum of squared magnitudes of a complex interleaved tensor `χ`. Uses
 * the raw `(re, im)` layout defined on {@link ChiTensor}.
 *
 * @param chi - Complex amplitudes as interleaved real/imaginary floats.
 * @returns `Σ (re² + im²)`. Equals zero when the buffer is empty or all
 *          amplitudes are zero.
 */
export function chiFrobeniusNormSq(chi: Float32Array): number {
  let acc = 0
  for (let i = 0; i < chi.length; i++) {
    const v = chi[i]!
    acc += v * v
  }
  return acc
}

/**
 * Grid metadata sufficient to compute the per-cell volume element
 * `dVol = da · dφ²`. Matches the subset of
 * {@link WheelerDeWittSolverOutput} used downstream for HJ/Schmidt
 * analysis — keeping the type local avoids a module cycle with the
 * solver output contract.
 */
export interface ChiGridSpec {
  /** `[Na, Nphi, Nphi]`. */
  gridSize: readonly [number, number, number]
  /** Lower bound of the `a` axis. */
  aMin: number
  /** Upper bound of the `a` axis. */
  aMax: number
  /** Half-width of the symmetric φ windows `[−phiExtent, +phiExtent]`. */
  phiExtent: number
}

/**
 * Compute the uniform-grid volume element
 * `dVol = da · dφ² = (aMax − aMin)/(Na − 1) · (2·phiExtent/(Nphi − 1))²`.
 *
 * Degenerate grids (`Na < 2` or `Nphi < 2`) yield `dVol = 0`; callers
 * that pass `dVol = 0` into {@link normalizedSchmidtValues} fall back to
 * the Frobenius-only rescale, preserving the unit-volume contract used
 * by tests that do not set up a physical grid.
 *
 * @param spec - Grid metadata as exported by the WdW solver.
 * @returns Per-cell 3D volume element.
 */
export function computeVolumeElement(spec: ChiGridSpec): number {
  const [Na, Nphi] = spec.gridSize
  if (Na < 2 || Nphi < 2) return 0
  const da = (spec.aMax - spec.aMin) / (Na - 1)
  const dphi = (2 * spec.phiExtent) / (Nphi - 1)
  return da * dphi * dphi
}

/**
 * L²-normalised Schmidt singular values under a volume-weighted or
 * unit-volume convention.
 *
 * Runs the raw {@link schmidtValues} and rescales by
 * `1 / sqrt(Σ|χ|² · dVol)` so the resulting singular values satisfy the
 * volume-weighted normalisation `Σ s_n² · dVol = 1` — the Riemann-sum
 * approximation of the continuum identity `∫|χ|² d³x = 1`. Passing
 * `volumeElement = 1` (the default) reduces the rescale to the pure
 * discrete Frobenius norm `Σ s_n² = 1`, preserving the prior API
 * contract for callers that do not set up a physical grid.
 *
 * Physical interpretation: the modular Hamiltonian
 * `K_n = −log(s_n² + ε)` is defined against a probability density — not
 * a raw sum of lattice amplitudes. Discretising the continuum via
 * Riemann sum requires `|χ|² · dVol` for the density reading, which
 * introduces a `log(dVol)` additive term into `K_n`. Under a
 * fixed-physics, fixed-`(aMin, aMax, phiExtent)`, variable-`(Na, Nphi)`
 * sweep (`gridNa`, `gridNphi`, `phiExtent`) the Frobenius-only convention
 * leaves that term as a residual drift in the affine fit's `β`; the
 * volume-weighted convention absorbs it into the lattice density
 * normalisation so `β` tracks only the genuine `K ≈ α·E + β`
 * zero-of-energy offset the SRMT conjecture is probing.
 *
 * See {@link computeVolumeElement} for the `dVol` formula.
 *
 * @param tensor - `χ` tensor (raw, unnormalised).
 * @param clock - Clock axis used as the row index of the reshaped matrix.
 * @param volumeElement - Per-cell volume element
 *                        `dVol = da · dφ²`. Defaults to `1`
 *                        (unit-volume Frobenius, backward-compatible).
 *                        Must be non-negative; `dVol = 0` falls back to
 *                        the Frobenius-only rescale.
 * @returns Descending singular values of the (volume-weighted) unit-norm
 *          state. When `χ` is identically zero the raw singular values
 *          are returned unchanged (all zeros).
 */
export function normalizedSchmidtValues(
  tensor: ChiTensor,
  clock: SrmtClock,
  volumeElement: number = 1
): Float64Array {
  const sv = schmidtValues(tensor, clock)
  const fro2 = chiFrobeniusNormSq(tensor.chi)
  if (fro2 <= 0) return sv
  const dVol = volumeElement > 0 ? volumeElement : 1
  const scale = 1 / Math.sqrt(fro2 * dVol)
  for (let i = 0; i < sv.length; i++) sv[i] = sv[i]! * scale
  return sv
}

/**
 * Effective Schmidt rank — count of modes whose squared weight relative
 * to the dominant mode exceeds `thresholdSqRatio`.
 *
 * Returns `|{ n : (s_n / s_0)² > thresholdSqRatio }|`. A pure pure
 * state has `rEff = 1`; a maximally-mixed rank-`r` state has
 * `rEff ≈ r`. The metric is insensitive to an overall rescale of `s`,
 * so it can be computed on raw or L²-normalised Schmidt arrays
 * interchangeably.
 *
 * Publication guideline: affine / rigid fits run over fewer than ~8
 * non-trivial modes are dominated by noise — callers should suppress
 * champion-clock selection when `rEff < 8` (see
 * {@link SrmtSweepPoint.rEffByClock}).
 *
 * @param schmidt - Descending singular values.
 * @param thresholdSqRatio - Relative squared-weight cutoff. Default
 *          `1e-6` matches the effective-rank diagnostic in
 *          `_oneshotTunnelingBcAnalysis.test.ts`.
 * @returns Count in `[0, schmidt.length]`. Returns 0 when the input is
 *          empty or the dominant Schmidt value is zero.
 */
export function effectiveRankFromSchmidt(
  schmidt: Float64Array,
  thresholdSqRatio: number = 1e-6
): number {
  if (schmidt.length === 0) return 0
  const s0 = schmidt[0]!
  if (!(s0 > 0)) return 0
  const thresh = thresholdSqRatio * s0 * s0
  let n = 0
  for (let i = 0; i < schmidt.length; i++) {
    const s = schmidt[i]!
    if (s * s > thresh) n++
  }
  return n
}
