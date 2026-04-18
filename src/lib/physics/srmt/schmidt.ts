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
