/**
 * Affine-match quality metric comparing a modular-Hamiltonian spectrum
 * against a Hamilton-Jacobi spectrum.
 *
 * Extracted from {@link ./diagnostic} so the sweep driver can call it
 * after a one-time Schmidt cache (cut-independent) without depending on
 * the single-shot diagnostic path. `computeSrmtDiagnostic` delegates to
 * this helper so both paths remain byte-identical.
 *
 * This file exports two residual metrics:
 *
 *  - {@link computeAffineFitQuality} — least-squares over `(α, β)`; tests
 *    the weaker claim `K ≈ α·E + β`. See `docs/physics/srmt-metric.md`.
 *  - {@link computeRigidFitQuality} — `α` pinned to 1, `β` fit only; tests
 *    the strict SRMT conjecture `K ≈ E + const`. See the doc for why the
 *    affine freedom of `α` discards signal the rigid metric preserves.
 *
 * Both ship with a leave-one-out jackknife σ estimator so every published
 * `q` is paired with its spread under rank-truncation perturbation.
 *
 * @module lib/physics/srmt/affineFit
 */

/**
 * Result of the least-squares affine fit `K ≈ α·E + β`.
 *
 * `q` is the normalised residual (see {@link computeAffineFitQuality});
 * `alpha` and `beta` are the fitted linear-regression parameters in the
 * natural unit system of `E` and `K`. Exposing `alpha` and `beta`
 * alongside `q` is what lets downstream analysis diagnose the
 * orders-of-magnitude gap between `q_affine` and `q_rigid`: the affine
 * fit can silently absorb a large unit-conversion factor into `α`,
 * which the `q_affine` scalar hides but `alpha` surfaces directly.
 */
export interface AffineFitResult {
  /** Normalised residual `Σ(K − (αE + β))² / Σ K²` (or `NaN`). */
  q: number
  /** Fitted slope. `NaN` when the fit is degenerate. */
  alpha: number
  /** Fitted intercept. `NaN` when the fit is degenerate. */
  beta: number
}

function invalidAffineFit(): AffineFitResult {
  return { q: Number.NaN, alpha: Number.NaN, beta: Number.NaN }
}

const MIN_AFFINE_FIT_COUNT = 3
const MIN_AFFINE_JACKKNIFE_COUNT = MIN_AFFINE_FIT_COUNT + 1

function hasFiniteWindow(K: Float64Array, E: Float64Array, count: number): boolean {
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(K[i]) || !Number.isFinite(E[i])) return false
  }
  return true
}

/**
 * Least-squares affine fit of `K` onto `E` over the first `count`
 * indices. Returns the quality metric `q` **and** the fitted `α, β`
 * parameters so callers can inspect the fit directly. `q` is identical
 * bit-for-bit to what {@link computeAffineFitQuality} returns — the
 * existing helper is a thin wrapper over this function.
 *
 * Degenerate inputs return `{ q: NaN, alpha: NaN, beta: NaN }` when
 * `count<3`, `count` exceeds buffer length, any value is non-finite,
 * or `Σ(E − mean(E))² ≤ 0`
 * (zero-variance `E`). When the fit succeeds but `Σ K² = 0` (zero-norm
 * `K`), `α` and `β` are finite (they parameterise the `K ≈ αE + β` fit
 * even at `K≡0`) and `q` falls back to `Σ residual² / Σ ΔK²` via `sKK`,
 * or `NaN` when that is also zero.
 *
 * @param K - Modular spectrum `K_n` (ascending).
 * @param E - HJ spectrum `E_n` (ascending).
 * @param count - Number of leading values to include in the fit.
 * @returns `{ q, alpha, beta }` — see {@link AffineFitResult}.
 */
export function fitAffineParams(K: Float64Array, E: Float64Array, count: number): AffineFitResult {
  if (!Number.isSafeInteger(count) || count < MIN_AFFINE_FIT_COUNT) return invalidAffineFit()
  if (count > K.length || count > E.length) return invalidAffineFit()
  if (!hasFiniteWindow(K, E, count)) return invalidAffineFit()

  let sumE = 0
  let sumK = 0
  for (let i = 0; i < count; i++) {
    sumE += E[i]!
    sumK += K[i]!
  }
  const meanE = sumE / count
  const meanK = sumK / count

  let sEE = 0
  let sEK = 0
  let sKK = 0
  for (let i = 0; i < count; i++) {
    const dE = E[i]! - meanE
    const dK = K[i]! - meanK
    sEE += dE * dE
    sEK += dE * dK
    sKK += dK * dK
  }

  if (!Number.isFinite(sEE) || !Number.isFinite(sEK) || !Number.isFinite(sKK) || sEE <= 0) {
    return invalidAffineFit()
  }
  const alpha = sEK / sEE
  const beta = meanK - alpha * meanE
  if (!Number.isFinite(alpha) || !Number.isFinite(beta)) return invalidAffineFit()

  let num = 0
  let den = 0
  for (let i = 0; i < count; i++) {
    const k = K[i]!
    const predicted = alpha * E[i]! + beta
    const r = k - predicted
    num += r * r
    den += k * k
  }

  if (den <= 0) {
    const q = sKK > 0 ? num / sKK : Number.NaN
    return { q: Number.isFinite(q) ? q : Number.NaN, alpha, beta }
  }
  const q = num / den
  return { q: Number.isFinite(q) ? q : Number.NaN, alpha, beta }
}

/**
 * Affine-match quality `q = Σ_n (K_n − (α E_n + β))² / Σ_n K_n²` after a
 * least-squares fit of `α`, `β` over the first `count` points.
 *
 * The metric is scale-invariant in `E` (the fitted `α` absorbs any
 * scaling of `E`). It is **not** generally shift-invariant in `K`:
 * while `β` removes shifts from the numerator, the final normalization
 * `Σ K_n²` is not shift-invariant, so translating `K` changes `q`
 * whenever the fit is imperfect. `0` = perfect linear tracking;
 * larger = worse.
 *
 * Implemented as a thin projection of {@link fitAffineParams}; see that
 * function when the fitted `α` / `β` are also required (for example to
 * diagnose unit-conversion factors hidden in `q_affine`). The math is
 * bit-identical to the pre-split version — same floating-point ops in
 * the same order.
 *
 * @param K - Modular spectrum `K_n` (ascending).
 * @param E - HJ spectrum `E_n` (ascending).
 * @param count - Number of leading values to include in the fit.
 * @returns Fit quality, or `NaN` for degenerate inputs (fewer than 3
 *          points, non-finite values, zero-variance `E`, or zero-variance `K` with
 *          non-zero residual).
 */
export function computeAffineFitQuality(K: Float64Array, E: Float64Array, count: number): number {
  return fitAffineParams(K, E, count).q
}

/**
 * Leave-one-out jackknife stdev for {@link computeAffineFitQuality}.
 *
 * For each `k ∈ [0, count)` we drop **both** `K[k]` and `E[k]` (so the
 * remaining `count-1` aligned pairs are still index-aligned), recompute
 * `q_k`, and report the jackknife standard deviation of the resulting
 * sample:
 *
 *   `σ_J = √( ((n-1)/n) · Σ (q_k − q̄)² )`
 *
 * The estimator is the standard leave-one-out jackknife under the
 * affine-fit q functional. It is *not* the standard error of the mean —
 * it estimates the σ of `q` itself under perturbation of which spectral
 * index is dropped, which is the "rank truncation sensitivity" the SRMT
 * sweep needs an error bar for.
 *
 * Returns `NaN` when `count < 4` (each dropped subset still needs three
 * points for a non-exact affine fit), when
 * any single replicate yields a non-finite `q_k`, or when the underlying
 * `count` falls outside the K/E buffers.
 *
 * @param K - Modular spectrum aligned with `E` (ascending).
 * @param E - HJ spectrum aligned with `K` (ascending).
 * @param count - Number of leading values used in the full-data affine fit.
 * @returns Jackknife standard deviation of `q`, or `NaN`.
 */
export function jackknifeAffineFitStdev(K: Float64Array, E: Float64Array, count: number): number {
  if (!Number.isSafeInteger(count) || count < MIN_AFFINE_JACKKNIFE_COUNT) return Number.NaN
  if (count > K.length || count > E.length) return Number.NaN
  if (!hasFiniteWindow(K, E, count)) return Number.NaN

  const n = count
  const reduced = n - 1
  const Kdrop = new Float64Array(reduced)
  const Edrop = new Float64Array(reduced)
  const samples = new Float64Array(n)

  for (let drop = 0; drop < n; drop++) {
    let w = 0
    for (let i = 0; i < n; i++) {
      if (i === drop) continue
      Kdrop[w] = K[i]!
      Edrop[w] = E[i]!
      w++
    }
    const q = computeAffineFitQuality(Kdrop, Edrop, reduced)
    if (!Number.isFinite(q)) return Number.NaN
    samples[drop] = q
  }

  let mean = 0
  for (let i = 0; i < n; i++) mean += samples[i]!
  mean /= n

  let acc = 0
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean
    acc += d * d
  }
  return Math.sqrt(((n - 1) / n) * acc)
}

/**
 * Strict (α = 1) match quality `q_rigid = Σ (K_n − E_n − β*)² / Σ K_n²`
 * where `β* = mean(K) − mean(E)` is the unique minimiser over β.
 *
 * This is the direct test of the SRMT conjecture `K_n = E_n + c`: β
 * absorbs the zero-of-energy convention, and α is **not** free. By
 * construction `q_rigid ≥ q_affine`; the gap
 * `q_rigid − q_affine` is the share of the affine-fit residual that
 * comes from the α-degree-of-freedom (a unit / scale mismatch, not a
 * physical match). See `docs/physics/srmt-metric.md`.
 *
 * @param K - Modular spectrum `K_n` (ascending).
 * @param E - HJ spectrum `E_n` (ascending).
 * @param count - Number of leading values to include.
 * @returns Fit quality, or `NaN` for degenerate inputs (fewer than 2
 *          points, or zero-denominator `Σ K²`).
 */
export function computeRigidFitQuality(K: Float64Array, E: Float64Array, count: number): number {
  if (!Number.isSafeInteger(count) || count < 2) return Number.NaN
  if (count > K.length || count > E.length) return Number.NaN
  if (!hasFiniteWindow(K, E, count)) return Number.NaN

  let sumK = 0
  let sumE = 0
  for (let i = 0; i < count; i++) {
    sumK += K[i]!
    sumE += E[i]!
  }
  const beta = (sumK - sumE) / count
  if (!Number.isFinite(beta)) return Number.NaN

  let num = 0
  let den = 0
  for (let i = 0; i < count; i++) {
    const r = K[i]! - E[i]! - beta
    num += r * r
    den += K[i]! * K[i]!
  }
  if (den <= 0) return Number.NaN
  const q = num / den
  return Number.isFinite(q) ? q : Number.NaN
}

/**
 * Leave-one-out jackknife stdev for {@link computeRigidFitQuality}. Same
 * semantics as {@link jackknifeAffineFitStdev} — drops `(K[k], E[k])`
 * pairs, recomputes `q_rigid_k`, returns the jackknife standard
 * deviation.
 *
 * @param K - Modular spectrum aligned with `E` (ascending).
 * @param E - HJ spectrum aligned with `K` (ascending).
 * @param count - Number of leading values used in the full-data fit.
 * @returns Jackknife standard deviation of `q_rigid`, or `NaN`.
 */
export function jackknifeRigidFitStdev(K: Float64Array, E: Float64Array, count: number): number {
  if (!Number.isSafeInteger(count) || count < 3) return Number.NaN
  if (count > K.length || count > E.length) return Number.NaN
  if (!hasFiniteWindow(K, E, count)) return Number.NaN

  const n = count
  const reduced = n - 1
  const Kdrop = new Float64Array(reduced)
  const Edrop = new Float64Array(reduced)
  const samples = new Float64Array(n)

  for (let drop = 0; drop < n; drop++) {
    let w = 0
    for (let i = 0; i < n; i++) {
      if (i === drop) continue
      Kdrop[w] = K[i]!
      Edrop[w] = E[i]!
      w++
    }
    const q = computeRigidFitQuality(Kdrop, Edrop, reduced)
    if (!Number.isFinite(q)) return Number.NaN
    samples[drop] = q
  }

  let mean = 0
  for (let i = 0; i < n; i++) mean += samples[i]!
  mean /= n

  let acc = 0
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean
    acc += d * d
  }
  return Math.sqrt(((n - 1) / n) * acc)
}
