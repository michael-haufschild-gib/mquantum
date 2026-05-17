/**
 * Lanczos iteration for extracting the extreme eigenvalues of a real
 * symmetric matrix.
 *
 * The Lanczos algorithm builds an orthonormal basis `Q = [q_0, ..., q_{m-1}]`
 * of the Krylov subspace `K_m(A, q_0) = span{q_0, A q_0, ..., A^{m-1} q_0}`
 * such that `Q^T A Q = T` is a symmetric tridiagonal matrix of order `m`.
 * The eigenvalues of `T` converge to the extreme eigenvalues of `A` as `m`
 * grows — both the algebraically largest and smallest eigenvalues show up
 * first. For `m << n` this gives a practical `O(m·n²)` route to the top
 * few eigenvalues of a matrix too large for dense Jacobi eigendecomposition.
 *
 * This implementation uses **full reorthogonalization**: after each
 * three-term recurrence step, we subtract the projection of the new
 * Lanczos vector onto every previously-stored basis vector. This adds
 * `O(j·n)` work per step (`O(m²·n)` over all `m` steps) and restores the
 * numerical orthogonality that pure three-term Lanczos loses after a few
 * steps due to round-off — without full reorth the extracted spectrum
 * develops spurious duplicated eigenvalues (Paige's ghost phenomenon).
 *
 * Cost breakdown:
 *   - Dense input (`lanczosTopK` path): matvec = O(n²) per step, reorth =
 *     O(m·n) per step. Matvec dominates when `m << n`.
 *   - Callback input (`lanczosTopKOp` path) with a sparse stencil: matvec
 *     can be O(n) per step (5-point Hamilton-Jacobi stencil is the motivating
 *     case). In that regime reorth at O(m·n) per step dominates — expected.
 *
 * The tridiagonal subproblem is diagonalized by the existing cyclic Jacobi
 * eigensolver ({@link jacobiEigendecompose}). At the sizes Lanczos ever
 * calls into here — `m ≤ 256` — the Jacobi cost is negligible.
 *
 * Input shape: the matrix is expected as a row-major `Float32Array` of
 * length `n · n`. All internal accumulators use `Float64Array` so the f32
 * input precision does not cap the orthogonalization quality.
 *
 * @module lib/physics/srmt/lanczos
 */

import { jacobiEigendecompose } from '@/lib/math/jacobiEigenvalues'

/** Convergence tolerance on the Lanczos β coefficient (absolute). */
const LANCZOS_BETA_TOL = 1e-14
/**
 * Default seed for the initial-vector PRNG. Picked arbitrarily
 * ("0x5EED1AB1" ≈ "seed lab 1") so outputs are bit-exactly
 * reproducible across runs — an essential property for the Wheeler–DeWitt
 * physics regression tests that compare Lanczos output to analytic
 * spectra.
 *
 * Lanczos iteration can miss eigenvalues when the random starting
 * vector happens to lie in the orthogonal complement of the target
 * eigenspace — a degeneracy risk on symmetric operators with clustered
 * spectra (e.g. the HJ operator's `1/a²`-induced near-degeneracies in
 * the φ-kinetic term). Users observing pathological convergence on a
 * specific config can override via {@link LanczosOptions.seed} — any
 * fresh seed perturbs the Krylov basis and restores convergence.
 * Practically, the spectra of interest in the SRMT diagnostic are
 * well-separated enough that the fixed seed has not produced a missed
 * eigenvalue in the test suite, and physics-field diversity in the UI
 * exposes any configuration where the fixed seed could go wrong.
 */
const DEFAULT_SEED = 0x5eed_1ab1
/** Minimum extra Krylov steps past `k` for convergence headroom. */
const DEFAULT_HEADROOM = 32

/**
 * Canonicalize a user-supplied Lanczos PRNG seed to the exact uint32
 * state consumed by the internal LCG. Provenance emitters should use
 * this helper too, otherwise a wrapped seed like `-1` can compute with
 * `4294967295` while the manifest records `-1`.
 */
export function normalizeLanczosSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Lanczos seed must be finite, got ${seed}`)
  }
  return seed >>> 0
}

/**
 * Deterministic linear-congruential PRNG matching the convention used
 * elsewhere in this codebase's test fixtures. Produces a stream of doubles
 * in `[0, 1)`.
 */
function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * Fill `vec` with a deterministic pseudo-random vector centred on zero
 * and normalized to unit Euclidean norm. The random values are drawn
 * from `[-1, 1)` so the starting direction has no systematic bias
 * (uniformly-positive entries would align with an all-ones mode of the
 * matrix and slow convergence on matrices whose spectrum is dominated by
 * that direction).
 */
function randomUnitVector(vec: Float64Array, seed: number): void {
  const rng = lcgRng(seed)
  const n = vec.length
  let norm2 = 0
  for (let i = 0; i < n; i++) {
    const v = 2 * rng() - 1
    vec[i] = v
    norm2 += v * v
  }
  const inv = 1 / Math.sqrt(Math.max(norm2, Number.MIN_VALUE))
  for (let i = 0; i < n; i++) vec[i]! *= inv
}

/**
 * Compute `y = A · x` for an `n × n` row-major symmetric f32 matrix.
 *
 * Kept as a dedicated helper so the accumulator type (`Float64Array`)
 * stays decoupled from the matrix storage type (`Float32Array` per the
 * public {@link lanczosTopK} signature).
 */
function matVec(A: Float32Array, x: Float64Array, y: Float64Array, n: number): void {
  for (let i = 0; i < n; i++) {
    let acc = 0
    const row = i * n
    for (let j = 0; j < n; j++) {
      acc += A[row + j]! * x[j]!
    }
    y[i] = acc
  }
}

/**
 * Full reorthogonalization: subtract from `v` its projection onto every
 * stored basis vector `q_0, ..., q_{upto-1}`. The basis is stored as a
 * flat `Float64Array` of length `m·n`, row-major (row `j` holds `q_j`).
 * Modifies `v` in place; the scratch buffer for dot products is internal
 * and local to the call.
 */
function reorthogonalize(v: Float64Array, Q: Float64Array, n: number, upto: number): void {
  for (let j = 0; j < upto; j++) {
    const row = j * n
    let dot = 0
    for (let i = 0; i < n; i++) dot += Q[row + i]! * v[i]!
    if (dot !== 0) {
      for (let i = 0; i < n; i++) v[i]! -= dot * Q[row + i]!
    }
  }
}

/**
 * Apply a linear operator `A` to a vector `x` and store the result in `y`.
 * The callback form decouples Lanczos from the matrix storage — callers
 * can provide a stencil-based or otherwise-sparse matrix-vector product
 * without paying the `O(n²)` memory cost of a dense representation.
 *
 * Used by {@link lanczosTopKOp}. Implementations MUST fully overwrite `y`
 * (`y := A·x`); the caller does not zero `y` before the call.
 */
export type LinearOperator = (x: Float64Array, y: Float64Array) => void

/**
 * Options for {@link lanczosTopK}.
 */
export interface LanczosOptions {
  /**
   * Hard cap on Krylov steps. Defaults to
   * `min(n, max(2·k, k + 32))` — enough headroom past `k` that the top-k
   * eigenvalues of the tridiagonal converge to the top-k eigenvalues of
   * `A` within `~1e-10` for well-separated spectra and `~1e-4` for
   * clustered ones.
   *
   * The effective iteration count is clamped to `[k, n]` regardless of
   * this setting — a user-provided `maxIterations < k` is floored to `k`
   * (otherwise the tridiagonal is too small to deliver `k` top eigenvalues),
   * and any value above `n` is clipped to `n` (no further Krylov basis
   * vectors can exist past dimension `n`).
   */
  maxIterations?: number
  /**
   * Relative convergence tolerance on the Lanczos β coefficient. When
   * `β_j < tolerance · ||A||_∞`, the iteration is considered to have
   * exhausted the Krylov subspace and stops early. Defaults to
   * {@link LANCZOS_BETA_TOL}.
   */
  tolerance?: number
  /**
   * Seed for the initial-vector PRNG. Fixed by default so the output is
   * bit-exactly reproducible across runs. Supply a different seed if
   * spectral coincidence with the fixed seed produces a degenerate start.
   */
  seed?: number
}

/**
 * Compute the top-`k` eigenvalues (by magnitude) of a real symmetric
 * matrix via Lanczos iteration with full reorthogonalization.
 *
 * The matrix is treated as symmetric — only the row-major entries are
 * consulted and the caller is responsible for symmetry (this routine
 * does not symmetrize defensively; callers that hand in slightly
 * asymmetric matrices should pre-process with `M_ij ← (M_ij + M_ji)/2`).
 *
 * The returned eigenvalues are sorted **ascending** (smallest first) to
 * match the convention used by {@link hjSpectrumOnSlice} — the original
 * full-spectrum API that this routine replaces. For `k ≥ n`, the returned
 * spectrum has length `n` and all eigenvalues are recovered (up to
 * Lanczos accuracy — typically machine precision after `n` steps with
 * full reorth).
 *
 * Complexity: `O(m·n²)` matrix-vector products + `O(m²·n)` reorth, with
 * `m = min(n, max(2k, k + 32))`. For `n = 1024`, `k = 64` this is
 * roughly `7·10⁷` f32 multiplies, completing in well under a second in
 * pure JS.
 *
 * @param matrix - Row-major `Float32Array` of length `n · n` holding a
 *                 symmetric matrix. Not mutated.
 * @param n - Matrix order (non-negative integer).
 * @param k - Number of eigenvalues requested. Clipped to `min(k, n)`.
 *            `k ≤ 0` returns an empty array.
 * @param opts - Optional iteration parameters (see {@link LanczosOptions}).
 * @returns Descending-magnitude top-k eigenvalues, returned sorted
 *          **ascending**. Length ≤ `k` — shorter when the iteration
 *          breaks down early via a zero β coefficient (rare for generic
 *          inputs; happens on block-diagonal matrices with small
 *          invariant subspaces).
 * @throws {RangeError} If `n` is negative or non-integer.
 * @throws {Error} If the buffer length is shorter than `n · n`.
 *
 * @example
 * ```ts
 * const A = new Float32Array([2, 1, 0, 1, 2, 1, 0, 1, 2])
 * const top2 = lanczosTopK(A, 3, 2)
 * // top2 ≈ [2, 2 + √2]  (ascending, the two largest |λ|)
 * ```
 */
export function lanczosTopK(
  matrix: Float32Array,
  n: number,
  k: number,
  opts?: LanczosOptions
): Float32Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`lanczosTopK: n must be a non-negative integer, got ${n}`)
  }
  if (matrix.length < n * n) {
    throw new Error(`lanczosTopK: buffer length ${matrix.length} < n² = ${n * n}`)
  }
  // Estimate a reference scale for the β breakdown check. We use the
  // infinity norm of the matrix (max absolute row sum) — stable under f32
  // rounding and a reasonable reference for when β "looks like zero".
  let infNorm = 0
  for (let i = 0; i < n; i++) {
    let rowSum = 0
    const row = i * n
    for (let j = 0; j < n; j++) rowSum += Math.abs(matrix[row + j]!)
    if (rowSum > infNorm) infNorm = rowSum
  }
  const applyA: LinearOperator = (x, y) => matVec(matrix, x, y, n)
  return lanczosTopKOp(applyA, n, k, infNorm, opts)
}

/**
 * Callback-based Lanczos top-k for operators whose matrix-vector product
 * is available but whose dense `n × n` representation is too expensive
 * to store. Used by the Hamilton-Jacobi solver, whose stencil is
 * 5-sparse — the dense form would be `n²` ≈ 16 M entries for the default
 * `n = 4096` slice, while the stencil application is `5 n` = 20 k ops.
 *
 * @param applyA - Linear operator: `y := A · x`.
 * @param n - Operator order (must be a non-negative integer).
 * @param k - Number of top-magnitude eigenvalues to extract.
 * @param infNormEstimate - Scale estimate used in the β-breakdown
 *   check. Pass an upper bound on `||A||_∞` (e.g. `maxDiag + Σ_j |offDiag|`
 *   for a sparse stencil) so the β-convergence threshold scales with the
 *   operator's magnitude. Must be a finite non-negative number; `0` is
 *   legal but collapses the β threshold to the raw tolerance
 *   (`tol * max(1, infNormEstimate)`), which can let the iteration walk
 *   past a true Krylov breakdown on large-norm operators — callers
 *   should supply a real estimate when available.
 * @param opts - Lanczos options (`maxIterations`, `tolerance`, `seed`).
 * @returns Ascending-sorted top-k eigenvalues.
 */
export function lanczosTopKOp(
  applyA: LinearOperator,
  n: number,
  k: number,
  infNormEstimate: number,
  opts?: LanczosOptions
): Float32Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`lanczosTopKOp: n must be a non-negative integer, got ${n}`)
  }
  if (!Number.isInteger(k)) {
    throw new RangeError(`lanczosTopKOp: k must be an integer, got ${k}`)
  }
  if (
    opts?.maxIterations !== undefined &&
    (!Number.isInteger(opts.maxIterations) || opts.maxIterations < 1)
  ) {
    throw new RangeError(
      `lanczosTopKOp: maxIterations must be a positive integer, got ${opts.maxIterations}`
    )
  }
  if (opts?.tolerance !== undefined && (!Number.isFinite(opts.tolerance) || opts.tolerance < 0)) {
    throw new RangeError(
      `lanczosTopKOp: tolerance must be a finite non-negative number, got ${opts.tolerance}`
    )
  }
  if (!Number.isFinite(infNormEstimate) || infNormEstimate < 0) {
    throw new RangeError(
      `lanczosTopKOp: infNormEstimate must be a finite non-negative number, got ${infNormEstimate}`
    )
  }
  if (k <= 0 || n === 0) return new Float32Array(0)

  const kClipped = Math.min(k, n)
  const headroom = Math.max(2 * kClipped, kClipped + DEFAULT_HEADROOM)
  const defaultMaxIters = Math.min(n, headroom)
  const maxIters = Math.max(kClipped, Math.min(n, opts?.maxIterations ?? defaultMaxIters))
  const tol = opts?.tolerance ?? LANCZOS_BETA_TOL
  const seed = opts?.seed === undefined ? DEFAULT_SEED : normalizeLanczosSeed(opts.seed)

  const betaFloor = tol * Math.max(1, infNormEstimate)

  // Q is the basis of Lanczos vectors, row-major (row j holds q_j).
  // α, β are the diagonal and off-diagonal of the tridiagonal T.
  const Q = new Float64Array(maxIters * n)
  const alpha = new Float64Array(maxIters)
  const beta = new Float64Array(maxIters)

  // Scratch workspaces.
  const qCurr = new Float64Array(n)
  const qPrev = new Float64Array(n)
  const w = new Float64Array(n)

  // q_0 ← random unit vector.
  randomUnitVector(qCurr, seed)
  for (let i = 0; i < n; i++) Q[i] = qCurr[i]!

  let betaPrev = 0
  let actualSteps = 0
  for (let j = 0; j < maxIters; j++) {
    // w ← A · q_j
    applyA(qCurr, w)

    // w ← w − β_{j-1} · q_{j-1}
    if (j > 0) {
      for (let i = 0; i < n; i++) w[i]! -= betaPrev * qPrev[i]!
    }

    // α_j ← q_j · w
    let a = 0
    for (let i = 0; i < n; i++) a += qCurr[i]! * w[i]!
    alpha[j] = a

    // w ← w − α_j · q_j
    for (let i = 0; i < n; i++) w[i]! -= a * qCurr[i]!

    // Full reorthogonalization against all prior Q rows (including q_j).
    reorthogonalize(w, Q, n, j + 1)

    // β_j ← ||w||
    let normSq = 0
    for (let i = 0; i < n; i++) normSq += w[i]! * w[i]!
    const b = Math.sqrt(normSq)
    beta[j] = b

    actualSteps = j + 1

    if (b <= betaFloor || j + 1 === maxIters) {
      // Either the Krylov subspace is exhausted (invariant subspace hit)
      // or we've reached the iteration cap. Either way, stop.
      break
    }

    // q_{j+1} ← w / β_j
    const inv = 1 / b
    for (let i = 0; i < n; i++) qPrev[i] = qCurr[i]!
    for (let i = 0; i < n; i++) qCurr[i] = w[i]! * inv

    // Store q_{j+1} into Q.
    const nextRow = (j + 1) * n
    for (let i = 0; i < n; i++) Q[nextRow + i] = qCurr[i]!

    betaPrev = b
  }

  // Build the compact tridiagonal T of order `actualSteps` and diagonalize.
  const m = actualSteps
  if (m === 0) return new Float32Array(0)
  const T = new Float64Array(m * m)
  for (let j = 0; j < m; j++) T[j * m + j] = alpha[j]!
  for (let j = 0; j < m - 1; j++) {
    const offBeta = beta[j]!
    T[j * m + (j + 1)] = offBeta
    T[(j + 1) * m + j] = offBeta
  }

  const { values } = jacobiEigendecompose(T, m)
  // values are sorted descending. Top-k by magnitude is NOT in general a
  // prefix of a descending-by-value list — a large-magnitude negative
  // eigenvalue sits at the tail of `values`. Build a (value, absValue)
  // index list, sort by magnitude descending, take the first `kClipped`.
  const idx = new Array<number>(m)
  for (let i = 0; i < m; i++) idx[i] = i
  idx.sort((a, b) => Math.abs(values[b]!) - Math.abs(values[a]!))
  const take = Math.min(kClipped, m)
  const selected = new Float64Array(take)
  for (let i = 0; i < take; i++) selected[i] = values[idx[i]!]!
  // Sort ascending for the public API contract.
  const ascending = Array.from(selected).sort((a, b) => a - b)

  const out = new Float32Array(take)
  for (let i = 0; i < take; i++) out[i] = ascending[i]!
  return out
}
