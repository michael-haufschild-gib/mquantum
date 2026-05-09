/**
 * Cyclic Jacobi eigensolver for real symmetric matrices.
 *
 * Implements the classical Jacobi rotation algorithm: sweeps all off-diagonal
 * pairs `(p, q)` with `p < q`, applies a Givens rotation that zeros the pair,
 * and repeats until the Frobenius norm of the off-diagonal entries drops
 * below a tolerance scaled by the diagonal norm.
 *
 * Convergence is quadratic. For a dense symmetric matrix of order `n ≤ 128`
 * typical sweep counts are 10-15, giving O(n³ log n) total work. Fine for
 * interactive UI use (the entanglement probe) but not for anything performance-
 * critical on the render hot path.
 *
 * Matrices are stored **row-major** in a `Float64Array` of length `n * n`.
 * The input matrix is read once and copied to a scratch buffer, so the caller
 * retains ownership and immutability of the input.
 *
 * The decomposition path returns eigenvectors as **columns** of a row-major
 * `Float64Array`: eigenvector `k` is the column `vectors[i * n + k]` for
 * `i = 0..n-1`. This is the conventional `Q` from `A = Q Λ Qᵀ`.
 *
 * Eigenvalues from both entry points are returned **sorted descending**.
 *
 * @module lib/math/jacobiEigenvalues
 */

/** Convergence tolerance on the Frobenius off-diagonal norm (relative). */
const JACOBI_TOL = 1e-11
/**
 * Default cap on sweeps to guarantee bounded runtime. Quadratic convergence
 * means 10-15 sweeps suffice for well-conditioned matrices of order `n ≤ 256`;
 * 200 leaves a large safety margin before the non-convergence throw fires.
 */
const JACOBI_MAX_SWEEPS = 200

/**
 * Compute the Frobenius norm of the off-diagonal part of a symmetric
 * matrix `M` plus the norm of its diagonal.
 *
 * @param M - Row-major symmetric matrix.
 * @param n - Matrix order.
 * @returns `{ offDiagNorm, diagNorm }`.
 */
function frobeniusSplit(M: Float64Array, n: number): { offDiagNorm: number; diagNorm: number } {
  let offDiagSq = 0
  let diagSq = 0
  for (let i = 0; i < n; i++) {
    diagSq += M[i * n + i]! * M[i * n + i]!
    for (let j = i + 1; j < n; j++) {
      const v = M[i * n + j]!
      offDiagSq += 2 * v * v
    }
  }
  return {
    offDiagNorm: Math.sqrt(offDiagSq),
    diagNorm: Math.sqrt(Math.max(1, diagSq)),
  }
}

/**
 * Apply one 2×2 Givens rotation to rows and columns `p, q` of `M`, zeroing
 * the off-diagonal element `M[p, q]`. Optionally updates the accumulated
 * eigenvector matrix `V` by applying the same column rotation.
 *
 * @param M - Symmetric matrix being diagonalised (row-major, mutated).
 * @param V - Eigenvector accumulator (row-major) or `null` if not tracked.
 * @param n - Matrix order.
 * @param p - Row index (`p < q`).
 * @param q - Column index.
 */
function applyJacobiRotation(
  M: Float64Array,
  V: Float64Array | null,
  n: number,
  p: number,
  q: number
): void {
  const apq = M[p * n + q]!
  if (Math.abs(apq) < 1e-300) return

  const app = M[p * n + p]!
  const aqq = M[q * n + q]!

  // Rutishauser form: compute t = tan(θ) of the rotation that zeros (p, q).
  const tau = (aqq - app) / (2 * apq)
  const tauRoot = Math.sqrt(1 + tau * tau)
  const t = tau >= 0 ? 1 / (tau + tauRoot) : -1 / (-tau + tauRoot)
  const c = 1 / Math.sqrt(1 + t * t)
  const s = t * c

  // Diagonal updates
  M[p * n + p] = app - t * apq
  M[q * n + q] = aqq + t * apq
  M[p * n + q] = 0
  M[q * n + p] = 0

  // Row/column updates for indices ≠ p, q
  for (let i = 0; i < n; i++) {
    if (i === p || i === q) continue
    const aip = M[i * n + p]!
    const aiq = M[i * n + q]!
    const newAip = c * aip - s * aiq
    const newAiq = s * aip + c * aiq
    M[i * n + p] = newAip
    M[p * n + i] = newAip
    M[i * n + q] = newAiq
    M[q * n + i] = newAiq
  }

  if (V === null) return
  for (let i = 0; i < n; i++) {
    const vip = V[i * n + p]!
    const viq = V[i * n + q]!
    V[i * n + p] = c * vip - s * viq
    V[i * n + q] = s * vip + c * viq
  }
}

/**
 * Run one cyclic Jacobi sweep over all `p < q` index pairs.
 *
 * @param M - Matrix being diagonalised.
 * @param V - Eigenvector accumulator or `null`.
 * @param n - Matrix order.
 */
function jacobiSweep(M: Float64Array, V: Float64Array | null, n: number): void {
  for (let p = 0; p < n - 1; p++) {
    for (let q = p + 1; q < n; q++) {
      applyJacobiRotation(M, V, n, p, q)
    }
  }
}

/**
 * Internal helper: diagonalize a real symmetric matrix in-place via cyclic
 * Jacobi rotations, optionally accumulating eigenvectors.
 *
 * @param M - Scratch matrix (will be destructively diagonalized)
 * @param n - Matrix order
 * @param V - Optional row-major scratch eigenvector buffer (n×n). If
 *            provided, initialized to identity and updated in-place; the
 *            columns contain the orthonormal eigenvectors on return.
 * @param maxSweeps - Hard cap on sweeps. Defaults to `JACOBI_MAX_SWEEPS`.
 * @throws {Error} If convergence is not reached within `maxSweeps`. Callers
 *                 must surface this — a silent fall-through would hand back
 *                 a half-diagonalised matrix whose diagonal entries are only
 *                 approximate eigenvalues, and every downstream consumer
 *                 (Peschel entropy, symplectic spectra, modular Hamiltonian
 *                 fits) would quietly emit plausible-looking but wrong
 *                 numbers. Convergence failure signals either a pathological
 *                 input (e.g. ill-conditioned correlator) or a solver bug;
 *                 both cases deserve a loud error, not a corrupted analytics
 *                 readout.
 */
function jacobiDiagonalizeInPlace(
  M: Float64Array,
  n: number,
  V: Float64Array | null,
  maxSweeps: number
): void {
  if (V !== null) {
    for (let i = 0; i < n * n; i++) V[i] = 0
    for (let i = 0; i < n; i++) V[i * n + i] = 1
  }
  if (n <= 1) return

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    const { offDiagNorm, diagNorm } = frobeniusSplit(M, n)
    if (offDiagNorm < JACOBI_TOL * diagNorm) return
    jacobiSweep(M, V, n)
  }

  // Post-loop residual check. `frobeniusSplit` reports the off-diagonal
  // Frobenius norm relative to `max(diagNorm, 1)` — the same yardstick the
  // convergence test uses above — so the final `offDiagNorm / diagNorm`
  // ratio is directly comparable to `JACOBI_TOL` and quantifies how far
  // from diagonal the matrix still is.
  const { offDiagNorm, diagNorm } = frobeniusSplit(M, n)
  const residual = offDiagNorm / diagNorm
  throw new Error(
    `jacobiEigenvalues: failed to converge within ${maxSweeps} sweeps ` +
      `(n=${n}, residual=${residual.toExponential(3)}, tolerance=${JACOBI_TOL.toExponential(3)})`
  )
}

/**
 * Validate that a matrix buffer contains only finite numbers.
 *
 * @param A - Matrix buffer
 * @param size - Number of entries to check
 * @throws {Error} If any entry is NaN or infinite
 */
function assertFiniteMatrix(A: Float64Array, size: number): void {
  for (let i = 0; i < size; i++) {
    if (!Number.isFinite(A[i]!)) {
      throw new Error(`jacobiEigenvalues: non-finite matrix entry at index ${i}: ${A[i]}`)
    }
  }
}

/**
 * Copy an input matrix into a fresh symmetric scratch buffer.
 *
 * Averaging as `a / 2 + b / 2` avoids overflowing when two large finite
 * asymmetric entries have a finite mathematical mean.
 */
function copySymmetrizedMatrix(A: Float64Array, n: number): Float64Array {
  const M = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    M[i * n + i] = A[i * n + i]!
    for (let j = i + 1; j < n; j++) {
      const avg = 0.5 * A[i * n + j]! + 0.5 * A[j * n + i]!
      M[i * n + j] = avg
      M[j * n + i] = avg
    }
  }
  return M
}

/**
 * Sort eigenvalues descending and permute eigenvectors to match.
 *
 * @param values - Eigenvalues to be sorted in place
 * @param vectors - Optional eigenvector matrix (columns permuted in place)
 * @param n - Order
 */
function sortEigenpairsDescending(
  values: Float64Array,
  vectors: Float64Array | null,
  n: number
): void {
  // Selection sort on eigenvalues descending — n ≤ 128, O(n²) is fine.
  for (let i = 0; i < n - 1; i++) {
    let maxIdx = i
    let maxVal = values[i]!
    for (let j = i + 1; j < n; j++) {
      if (values[j]! > maxVal) {
        maxVal = values[j]!
        maxIdx = j
      }
    }
    if (maxIdx !== i) {
      values[maxIdx] = values[i]!
      values[i] = maxVal
      if (vectors !== null) {
        for (let r = 0; r < n; r++) {
          const tmp = vectors[r * n + i]!
          vectors[r * n + i] = vectors[r * n + maxIdx]!
          vectors[r * n + maxIdx] = tmp
        }
      }
    }
  }
}

/**
 * Compute the eigenvalues of a real symmetric matrix via cyclic Jacobi
 * rotations, returned **sorted descending**.
 *
 * The input is copied internally; the caller's buffer is not mutated.
 *
 * @param A - Row-major `Float64Array` of length `n * n` holding the symmetric
 *            matrix. Only the upper triangle is consulted conceptually, but
 *            for numerical robustness the lower triangle is also read and
 *            averaged with the upper so slight asymmetries in the input do
 *            not bias the result.
 * @param n - Matrix order (`n ≥ 0`). `n = 0` returns an empty array; `n = 1`
 *            returns `[A[0]]`.
 * @param maxSweeps - Optional override for the hard sweep cap (defaults to
 *            `JACOBI_MAX_SWEEPS = 200`). Throws on convergence failure —
 *            see {@link jacobiDiagonalizeInPlace}. Exposed primarily so
 *            tests can deterministically trigger the non-convergence path.
 * @returns Eigenvalues as a fresh `Float64Array` of length `n`, sorted
 *          descending.
 * @throws {RangeError} If `n` is negative or not an integer.
 * @throws {Error} If the input buffer length is < `n * n`, contains
 *                  non-finite entries, or the solver fails to converge
 *                  within `maxSweeps`.
 *
 * @example
 * ```ts
 * const A = new Float64Array([2, 1, 0, 1, 2, 1, 0, 1, 2])
 * const eig = jacobiEigenvalues(A, 3)
 * // eig ≈ [2 + √2, 2, 2 − √2]
 * ```
 */
export function jacobiEigenvalues(
  A: Float64Array,
  n: number,
  maxSweeps: number = JACOBI_MAX_SWEEPS
): Float64Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`jacobiEigenvalues: n must be a non-negative integer, got ${n}`)
  }
  if (n === 0) return new Float64Array(0)
  if (A.length < n * n) {
    throw new Error(`jacobiEigenvalues: buffer length ${A.length} < n² = ${n * n}`)
  }
  assertFiniteMatrix(A, n * n)

  if (n === 1) {
    const out = new Float64Array(1)
    out[0] = A[0]!
    return out
  }

  const M = copySymmetrizedMatrix(A, n)

  jacobiDiagonalizeInPlace(M, n, null, maxSweeps)

  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = M[i * n + i]!
  sortEigenpairsDescending(values, null, n)
  return values
}

/**
 * Compute the full eigendecomposition of a real symmetric matrix via cyclic
 * Jacobi rotations.
 *
 * Returns both the eigenvalues (sorted descending) and the orthonormal
 * eigenvector matrix `Q` such that `A ≈ Q · diag(values) · Qᵀ`. Eigenvectors
 * are stored as the **columns** of `vectors` (row-major buffer of length
 * `n * n`): the `k`th eigenvector is `vectors[i * n + k]` for `i = 0..n-1`.
 *
 * @param A - Row-major `Float64Array` of length `n * n` holding the symmetric
 *            matrix. Input is symmetrized defensively; the caller's buffer
 *            is not mutated.
 * @param n - Matrix order (`n ≥ 0`).
 * @param maxSweeps - Optional override for the hard sweep cap (defaults to
 *            `JACOBI_MAX_SWEEPS = 200`). Throws on convergence failure —
 *            see {@link jacobiDiagonalizeInPlace}. Exposed primarily so
 *            tests can deterministically trigger the non-convergence path.
 * @returns `{ values, vectors }` — eigenvalues sorted descending and the
 *          matching orthonormal eigenvector matrix.
 * @throws {RangeError} If `n` is negative or not an integer.
 * @throws {Error} If the buffer is too short, contains non-finite entries,
 *                  or the solver fails to converge within `maxSweeps`.
 *
 * @example
 * ```ts
 * const A = new Float64Array([4, 1, 1, 3])
 * const { values, vectors } = jacobiEigendecompose(A, 2)
 * // values[0] is the larger eigenvalue; vectors[0*2+0], vectors[1*2+0]
 * // are the components of the corresponding eigenvector.
 * ```
 */
export function jacobiEigendecompose(
  A: Float64Array,
  n: number,
  maxSweeps: number = JACOBI_MAX_SWEEPS
): { values: Float64Array; vectors: Float64Array } {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`jacobiEigendecompose: n must be a non-negative integer, got ${n}`)
  }
  if (n === 0) {
    return { values: new Float64Array(0), vectors: new Float64Array(0) }
  }
  if (A.length < n * n) {
    throw new Error(`jacobiEigendecompose: buffer length ${A.length} < n² = ${n * n}`)
  }
  assertFiniteMatrix(A, n * n)

  if (n === 1) {
    const values = new Float64Array(1)
    values[0] = A[0]!
    const vectors = new Float64Array(1)
    vectors[0] = 1
    return { values, vectors }
  }

  const M = copySymmetrizedMatrix(A, n)
  const V = new Float64Array(n * n)

  jacobiDiagonalizeInPlace(M, n, V, maxSweeps)

  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = M[i * n + i]!
  sortEigenpairsDescending(values, V, n)

  return { values, vectors: V }
}
