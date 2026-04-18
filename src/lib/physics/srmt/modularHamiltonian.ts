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

/** Epsilon floor multiplier applied to the dominant squared Schmidt value. */
const EPS_REL_FLOOR = 1e-14

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
  const n = schmidt.length
  if (n === 0) {
    return { spectrum: new Float64Array(0), epsilon: 0, rankThreshold: 0 }
  }

  // Dominant singular value.
  const s0 = schmidt[0]!
  const maxSq = s0 * s0
  const epsilon = maxSq > 0 ? EPS_REL_FLOOR * maxSq : EPS_REL_FLOOR

  const spectrum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const s = schmidt[i]!
    const lam = s * s
    spectrum[i] = -Math.log(lam + epsilon)
  }

  let rankThreshold = n
  if (maxSq > 0) {
    const thresh = truncationRatio * maxSq
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
