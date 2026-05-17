/** Result and option types for coordinate entanglement diagnostics. */

/** Result of computing coordinate entanglement for one diagnostic frame. */
export interface CoordinateEntanglementResult {
  /** Per-dimension entanglement entropy, null if the dimension was skipped. */
  entropies: (number | null)[]
  /** Average entropy over computed dimensions only. */
  averageEntropy: number
  /** Maximum possible entropy for each dimension, null if skipped. */
  maxEntropies: (number | null)[]
  /** Normalized average entropy in [0, 1]. */
  normalizedEntropy: number
  /** Bipartition entropies for k=1,...,floor(N/2), null if too expensive. */
  bipartitionEntropies: (number | null)[]
  /** Pairwise mutual information matrix, row-major, or null if skipped. */
  mutualInfo: Float64Array | null
  /** Eigenvalue spectrum of the first dimension's reduced density matrix. */
  spectrum: number[]
  /** Per-dimension Wigner negativity, null if skipped. */
  wignerNegativities: (number | null)[]
  /** Average Wigner negativity across computed dimensions. */
  averageWignerNegativity: number
}

/** Options controlling which coordinate entanglement observables to compute. */
export interface EntanglementOptions {
  /** Compute pairwise mutual information matrix. */
  computePairwiseMI: boolean
  /** Compute k-dimensional bipartition entropies. */
  computeBipartitions: boolean
  /** Compute Wigner negativity from each per-dimension reduced density matrix. */
  computeWignerNegativity: boolean
}
