/**
 * Modular-Hamiltonian spectrum from Schmidt singular values.
 *
 * Given Schmidt coefficients `{s_n}` of a pure bipartite state, the
 * reduced density matrix on either side has eigenvalues `{λ_n = s_n²}`
 * which sum to one if the full state is normalised. The modular
 * Hamiltonian is defined (up to an additive constant) by
 *
 *   `K_n = −log(λ_n) = −log(s_n² + ε)`
 *
 * with a small regularising `ε` so that Schmidt zeros do not map to
 * −∞. Because `s_n` is sorted descending, `K_n` is sorted ascending and
 * monotone non-decreasing. The spectrum is strictly positive whenever the
 * density matrix is sub-unity on every mode, which includes every
 * physically meaningful normalised state.
 *
 * This module also exports a rank-truncation threshold: the smallest
 * index `r` such that `s_r² / s_0² < τ` for a relative cutoff `τ` (the
 * default `τ = 1e-8` keeps only modes whose spectral weight is within
 * eight orders of magnitude of the dominant Schmidt value).
 *
 * @module lib/physics/srmt/modularHamiltonian
 */

/** Default relative rank-truncation cutoff. */
const DEFAULT_RANK_TRUNCATION = 1e-8

/**
 * Epsilon floor multiplier applied to the dominant squared Schmidt value.
 * Exported so downstream diagnostics (e.g. {@link floorFractionFromModular})
 * can reference the same saturation constant the modular spectrum uses.
 * Effective ε = `MODULAR_EPSILON · s_0²`, so on a unit-normalised state
 * (Σ|χ|² = 1 ⇒ s_0 ≤ 1) the floor `−log(ε)` is at least `−log(MODULAR_EPSILON)`.
 */
export const MODULAR_EPSILON = 1e-14

/**
 * Compute the modular-Hamiltonian spectrum from Schmidt singular values.
 *
 * @param schmidt - Schmidt singular values, sorted descending. Assumed
 *                  non-negative.
 * @returns Object bundling:
 *   - `spectrum` — `K_n = −log(s_n² + ε)`, same length as `schmidt`.
 *   - `epsilon` — the regularising offset used (`EPS_REL_FLOOR · s_0²`).
 *   - `rankThreshold` — index `r` such that `s_r²/s_0² < τ` or `schmidt.length`
 *     when no index satisfies the condition.
 */
export function modularSpectrum(
  schmidt: Float64Array,
  truncationRatio: number = DEFAULT_RANK_TRUNCATION
): { spectrum: Float64Array; epsilon: number; rankThreshold: number } {
  // Fall back to the default when the caller passes a garbage value; otherwise
  // a NaN/negative ratio silently produces a surprising `rankThreshold`.
  const safeTruncationRatio =
    Number.isFinite(truncationRatio) && truncationRatio > 0
      ? truncationRatio
      : DEFAULT_RANK_TRUNCATION

  const n = schmidt.length
  if (n === 0) {
    return { spectrum: new Float64Array(0), epsilon: 0, rankThreshold: 0 }
  }

  // Dominant singular value.
  const s0 = schmidt[0]!
  const maxSq = s0 * s0
  const epsilon = maxSq > 0 ? MODULAR_EPSILON * maxSq : MODULAR_EPSILON

  const spectrum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const s = schmidt[i]!
    const lam = s * s
    spectrum[i] = -Math.log(lam + epsilon)
  }

  let rankThreshold = n
  if (maxSq > 0) {
    const thresh = safeTruncationRatio * maxSq
    for (let i = 0; i < n; i++) {
      const s = schmidt[i]!
      if (s * s < thresh) {
        rankThreshold = i
        break
      }
    }
  }

  return { spectrum, epsilon, rankThreshold }
}

/**
 * Fraction of modular-Hamiltonian values pinned at the ε-floor.
 *
 * The modular spectrum saturates at `K_max = −log(ε)` as Schmidt weights
 * go to zero. When a large share of `K_n` sits within `floorTolerance`
 * nats of that ceiling, the spectrum has effectively decayed into the
 * regularisation floor rather than reflecting physical structure — an
 * affine fit over such a K vector is dominated by the constant floor
 * value, producing misleading `β` offsets and degenerate `q_affine`.
 *
 * Returns `|{ n : (−log(ε)) − K_n < floorTolerance }| / K.length`, i.e.
 * the proportion of modes lying within `floorTolerance` of the floor.
 *
 * @param K - Modular spectrum as returned by {@link modularSpectrum}.
 *            Expected to be ascending; the calculation does not require
 *            order, so any permutation still yields a meaningful count.
 * @param epsilon - Same ε used to regularise `K = −log(s² + ε)`. Pass the
 *            value returned from {@link modularSpectrum} so the floor
 *            reference matches the spectrum's own saturation ceiling.
 * @param floorTolerance - Distance from the floor (in nats) below which
 *            a K value counts as "pinned". Default 1.5 corresponds to a
 *            density ratio of `e^1.5 ≈ 4.5`.
 * @returns Fraction in `[0, 1]`. `0` when `K` is empty or when `epsilon`
 *            is non-positive (no well-defined floor).
 */
export function floorFractionFromModular(
  K: Float64Array,
  epsilon: number,
  floorTolerance: number = 1.5
): number {
  if (K.length === 0 || !(epsilon > 0) || !Number.isFinite(floorTolerance)) return 0
  const floor = -Math.log(epsilon)
  const tol = Math.max(0, floorTolerance)
  let hits = 0
  for (let i = 0; i < K.length; i++) {
    // `gap >= 0` excludes K values above the floor (negative gap —
    // numerical overshoot rather than pinning); `gap <= tol` includes
    // exact floor hits when `tol === 0`.
    const gap = floor - K[i]!
    if (gap >= 0 && gap <= tol) hits++
  }
  return hits / K.length
}
