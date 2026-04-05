/**
 * Computes the discrete Wigner function from a reduced density matrix (RDM).
 *
 * Given ρ_d (the single-coordinate RDM of a multi-dimensional wavefunction),
 * computes the marginal Wigner function on an M×M phase-space grid and the
 * total Wigner negativity N_W — a measure of phase-space nonclassicality.
 *
 * Uses the non-periodic (open-boundary) discretization of the continuous
 * Wigner function:
 *
 *   W[m,n] = (1/M) Σ_{k=kmin}^{kmax} ρ[m+k, m-k] · exp(2πi·n·k/M)
 *
 * where kmin = -min(m, M-1-m), kmax = min(m, M-1-m). Anti-diagonal entries
 * that would wrap around the grid are zero-padded instead. This avoids
 * periodic boundary artifacts that cause spurious negativity for localized
 * states on even-M grids.
 *
 * Properties (verified by unit tests):
 * - Σ_n W[m,n] = ρ[m,m]  (position marginal)
 * - Σ_{m,n} W[m,n] = Tr(ρ) = 1  (normalization)
 * - W is real for Hermitian ρ  (imaginary part vanishes)
 * - N_W = 0 for Gaussian states, N_W > 0 for non-Gaussian states
 *
 * @module
 */

import { ifft } from '@/lib/math/fft'

/** Result of Wigner function computation from an RDM. */
export interface WignerResult {
  /**
   * The M×M discrete Wigner function, stored row-major: W[m * M + n].
   * m indexes position, n indexes momentum.
   */
  wigner: Float64Array
  /**
   * Total Wigner negativity: Σ_{m,n : W<0} |W[m,n]|.
   * Zero for Gaussian (classical) states, positive for non-Gaussian states.
   */
  negativity: number
}

/**
 * Fills the interleaved complex slice with the non-periodic anti-diagonal of ρ
 * centered at row m: ρ[m+k, m-k] for k in [-kmax, kmax], zero-padded to M.
 *
 * The slice is indexed [0..M-1] mapping to offsets [0, 1, ..., M/2-1, -M/2, ..., -1]
 * (standard FFT order), so negative-k entries are placed at slice[M+k].
 */
function fillAntiDiagonalSlice(
  slice: Float64Array,
  rhoRe: Float64Array,
  rhoIm: Float64Array,
  M: number,
  m: number
): void {
  // Zero the entire slice
  slice.fill(0)

  // kmax: how far we can go from (m,m) without leaving [0, M-1]
  const kmax = Math.min(m, M - 1 - m)

  // k = 0: always present
  const diagIdx = m * M + m
  slice[0] = rhoRe[diagIdx]!
  slice[1] = rhoIm[diagIdx]!

  // k > 0: positive offsets go to slice[k], negative offsets to slice[M-k]
  for (let k = 1; k <= kmax; k++) {
    const row_pos = m + k
    const col_pos = m - k
    const idx_pos = row_pos * M + col_pos

    // k: ρ[m+k, m-k]
    slice[k * 2] = rhoRe[idx_pos]!
    slice[k * 2 + 1] = rhoIm[idx_pos]!

    // -k: ρ[m-k, m+k] (Hermitian conjugate of the positive-k entry)
    const idx_neg = col_pos * M + row_pos
    slice[(M - k) * 2] = rhoRe[idx_neg]!
    slice[(M - k) * 2 + 1] = rhoIm[idx_neg]!
  }
}

/**
 * Computes the discrete Wigner function and negativity from a reduced density matrix.
 *
 * @param rhoRe - Real part of the M×M RDM, row-major: ρ[i,j] = rhoRe[i*M + j]
 * @param rhoIm - Imaginary part of the M×M RDM, row-major
 * @param M - Dimension of the RDM (must be a power of 2)
 * @returns Wigner function grid and total negativity
 */
export function wignerFromRDM(rhoRe: Float64Array, rhoIm: Float64Array, M: number): WignerResult {
  if (M <= 0 || !Number.isInteger(M)) {
    throw new RangeError(`wignerFromRDM: M must be a positive integer, got ${M}`)
  }
  const size = M * M
  if (rhoRe.length < size || rhoIm.length < size) {
    throw new RangeError(
      `wignerFromRDM: buffer too small (need ${size}, got re=${rhoRe.length}, im=${rhoIm.length})`
    )
  }
  const W = new Float64Array(size)
  let negSum = 0

  // Interleaved complex buffer for one anti-diagonal slice, reused per row
  const slice = new Float64Array(M * 2)

  for (let m = 0; m < M; m++) {
    fillAntiDiagonalSlice(slice, rhoRe, rhoIm, M, m)

    // IFFT: (1/M) Σ_k slice[k] · exp(2πi·n·k/M) → W[m, n]
    ifft(slice, M)

    // Store real part (imaginary part vanishes for Hermitian ρ) and accumulate negativity
    for (let n = 0; n < M; n++) {
      const val = slice[n * 2]!
      W[m * M + n] = val
      if (val < 0) {
        negSum -= val
      }
    }
  }

  return { wigner: W, negativity: negSum }
}

/**
 * Computes only the Wigner negativity (without storing the full Wigner grid).
 *
 * More memory-efficient than {@link wignerFromRDM} when only the negativity
 * scalar is needed (e.g., during atlas sweeps).
 *
 * @param rhoRe - Real part of the M×M RDM, row-major
 * @param rhoIm - Imaginary part of the M×M RDM, row-major
 * @param M - Dimension of the RDM (must be a power of 2)
 * @returns Total Wigner negativity
 */
export function wignerNegativityFromRDM(
  rhoRe: Float64Array,
  rhoIm: Float64Array,
  M: number
): number {
  let negSum = 0
  const slice = new Float64Array(M * 2)

  for (let m = 0; m < M; m++) {
    fillAntiDiagonalSlice(slice, rhoRe, rhoIm, M, m)
    ifft(slice, M)

    for (let n = 0; n < M; n++) {
      const val = slice[n * 2]!
      if (val < 0) {
        negSum -= val
      }
    }
  }

  return negSum
}
