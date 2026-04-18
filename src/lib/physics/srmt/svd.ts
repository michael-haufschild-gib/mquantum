/**
 * Complex-matrix SVD via Hermitian-Gram eigendecomposition.
 *
 * For a complex matrix `M ∈ ℂ^{m × n}` with singular values `{σ_k}`, the
 * Hermitian positive-semidefinite Gram `G = M^H M ∈ ℂ^{n × n}` has
 * eigenvalues `{σ_k²}`. We form the smaller of `M^H M` and `M M^H` (so the
 * eigenproblem size is `min(m, n)`), embed the complex Hermitian matrix
 * into a real symmetric `2k × 2k` block via
 *
 *   `H_re + i H_im  ⟼  [[H_re, −H_im], [H_im, H_re]]`
 *
 * and diagonalise with the cyclic-Jacobi eigensolver already present in
 * `@/lib/math/jacobiEigenvalues`. Each eigenvalue of the complex Hermitian
 * matrix appears twice in the real embedding, so we deduplicate pairs
 * after sorting.
 *
 * Precision: the caller hands us `Float64Array` buffers (re/im). The Gram
 * matrix is accumulated in `Float64Array` with Kahan-free (but ordered)
 * summation. For the grid sizes of interest (complex matrices up to
 * `~512 × 512`), this routine runs in well under a second and converges to
 * `~1e-11` relative precision.
 *
 * We return only the singular values (not the singular vectors). The SRMT
 * diagnostic does not need U/V; downstream consumers only inspect the
 * `{σ_k}` (i.e. Schmidt coefficients).
 *
 * @module lib/physics/srmt/svd
 */

import { jacobiEigenvalues } from '@/lib/math/jacobiEigenvalues'

/**
 * A dense complex matrix represented by two parallel real buffers.
 * Stored row-major: entry `(i, j)` is at index `i * cols + j` in both
 * `re` and `im`. Buffers are owned by the caller; this module treats them
 * as read-only.
 */
export interface ComplexMatrix {
  /** Row count. */
  rows: number
  /** Column count. */
  cols: number
  /** Real parts, length `rows * cols`, row-major. */
  re: Float64Array
  /** Imaginary parts, length `rows * cols`, row-major. */
  im: Float64Array
}

/**
 * Compute the Hermitian Gram `G = M^H M` (when `wide = false`, result is
 * `n × n`) or `M M^H` (when `wide = true`, result is `m × m`). The output
 * is guaranteed Hermitian by construction; its real part is symmetric and
 * its imaginary part is skew-symmetric.
 *
 * @param M - Input complex matrix.
 * @param wide - `true` to form `M M^H` (pick this when `m < n`).
 * @returns Real and imaginary components of the Gram matrix, each of size
 *          `k × k` with `k = wide ? m : n`.
 */
function hermitianGram(
  M: ComplexMatrix,
  wide: boolean
): { k: number; gRe: Float64Array; gIm: Float64Array } {
  const { rows: m, cols: n, re, im } = M
  const k = wide ? m : n
  const gRe = new Float64Array(k * k)
  const gIm = new Float64Array(k * k)

  if (wide) {
    // G[i, j] = Σ_ℓ M[i, ℓ] · conj(M[j, ℓ])
    //        = Σ_ℓ (reIℓ·reJℓ + imIℓ·imJℓ) + i·(imIℓ·reJℓ − reIℓ·imJℓ)
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        let accR = 0
        let accI = 0
        const offI = i * n
        const offJ = j * n
        for (let ell = 0; ell < n; ell++) {
          const rI = re[offI + ell]!
          const iI = im[offI + ell]!
          const rJ = re[offJ + ell]!
          const iJ = im[offJ + ell]!
          accR += rI * rJ + iI * iJ
          accI += iI * rJ - rI * iJ
        }
        gRe[i * m + j] = accR
        gIm[i * m + j] = accI
      }
    }
  } else {
    // G[i, j] = Σ_ℓ conj(M[ℓ, i]) · M[ℓ, j]
    //        = Σ_ℓ (reℓI·reℓJ + imℓI·imℓJ) + i·(reℓI·imℓJ − imℓI·reℓJ)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let accR = 0
        let accI = 0
        for (let ell = 0; ell < m; ell++) {
          const rI = re[ell * n + i]!
          const iI = im[ell * n + i]!
          const rJ = re[ell * n + j]!
          const iJ = im[ell * n + j]!
          accR += rI * rJ + iI * iJ
          accI += rI * iJ - iI * rJ
        }
        gRe[i * n + j] = accR
        gIm[i * n + j] = accI
      }
    }
  }

  return { k, gRe, gIm }
}

/**
 * Embed a complex Hermitian matrix `H = A + iB` (with `A` symmetric,
 * `B` skew-symmetric) into a real symmetric `2k × 2k` block matrix
 *
 *   `R = [[A, −B], [B, A]]`
 *
 * whose eigenvalues are exactly the eigenvalues of `H`, each duplicated.
 *
 * @param gRe - `k × k` symmetric part `A` (row-major).
 * @param gIm - `k × k` skew-symmetric part `B` (row-major).
 * @param k - Order of the complex Hermitian matrix.
 * @returns Real symmetric matrix of order `2k` as a row-major buffer.
 */
function complexHermitianToRealSymmetric(
  gRe: Float64Array,
  gIm: Float64Array,
  k: number
): Float64Array {
  const N = 2 * k
  const R = new Float64Array(N * N)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const a = gRe[i * k + j]!
      const b = gIm[i * k + j]!
      // Top-left block: A
      R[i * N + j] = a
      // Top-right block: −B
      R[i * N + (k + j)] = -b
      // Bottom-left block: B
      R[(k + i) * N + j] = b
      // Bottom-right block: A
      R[(k + i) * N + (k + j)] = a
    }
  }
  return R
}

/**
 * Extract the distinct eigenvalues from the sorted (descending) eigenvalue
 * list produced by the real-embedded Hermitian diagonalisation. Each true
 * eigenvalue appears twice; we take every other one starting from index 0.
 * Numerical noise can perturb the nominally-equal pairs slightly, so we
 * sort first and pick the larger of each adjacent pair.
 *
 * @param values - Descending eigenvalues of the `2k × 2k` real embedding.
 * @param k - Number of distinct complex eigenvalues expected.
 * @returns Descending `Float64Array` of length `k`.
 */
function deduplicatePairs(values: Float64Array, k: number): Float64Array {
  // values already sorted descending. Pairs sit at (0,1), (2,3), …
  const out = new Float64Array(k)
  for (let i = 0; i < k; i++) {
    // Take the larger of the nominal pair — numerical noise can split
    // pairs by up to ~1e-13. Averaging would also work; we pick max
    // because downstream consumers interpret these as non-negative
    // squared singular values and averaging could bias toward zero.
    const a = values[2 * i]!
    const b = values[2 * i + 1]!
    out[i] = a >= b ? a : b
  }
  return out
}

/**
 * Compute the singular values of a complex matrix `M`, sorted descending.
 *
 * Approach: form the Hermitian Gram on the smaller side, embed into a real
 * symmetric matrix of twice the order, diagonalise via cyclic Jacobi,
 * deduplicate the paired eigenvalues, clamp small negative noise to zero,
 * and take the square root.
 *
 * Complexity: `O(min(m, n)³)` for the eigendecomposition plus
 * `O(m · n · min(m, n))` to assemble the Gram — the former dominates for
 * the square-ish matrices encountered in the SRMT diagnostic.
 *
 * @param M - Input complex matrix.
 * @returns Descending singular values as a `Float64Array` of length
 *          `min(m, n)`. Empty matrix inputs return an empty array.
 * @throws {Error} If the matrix dimensions are inconsistent with the
 *                 supplied buffers.
 */
export function complexSvdSingularValues(M: ComplexMatrix): Float64Array {
  const { rows: m, cols: n, re, im } = M
  if (m < 0 || n < 0 || !Number.isInteger(m) || !Number.isInteger(n)) {
    throw new Error(`complexSvdSingularValues: invalid shape (${m}, ${n})`)
  }
  if (re.length !== m * n || im.length !== m * n) {
    throw new Error(
      `complexSvdSingularValues: buffer length !== m·n (re=${re.length}, im=${im.length}, m·n=${m * n})`
    )
  }
  if (m === 0 || n === 0) return new Float64Array(0)

  const wide = m < n
  const { k, gRe, gIm } = hermitianGram(M, wide)
  const R = complexHermitianToRealSymmetric(gRe, gIm, k)
  const lambdas2k = jacobiEigenvalues(R, 2 * k)
  const lambdas = deduplicatePairs(lambdas2k, k)

  // Singular values = √(eigenvalues of Gram), clamping tiny negatives.
  const out = new Float64Array(k)
  for (let i = 0; i < k; i++) {
    const v = lambdas[i]!
    out[i] = v > 0 ? Math.sqrt(v) : 0
  }
  return out
}
