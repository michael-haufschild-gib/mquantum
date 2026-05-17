/**
 * Coordinate Entanglement — Reduced Density Matrix & Entropy
 *
 * Treats the N spatial dimensions of a single-particle wavefunction as N
 * quantum subsystems. Computes the reduced density matrix for each dimension
 * by tracing out all others, then extracts the von Neumann entropy.
 *
 * The tensor product structure L²(ℝ^N) ≅ ⊗_d L²(ℝ) defines a natural
 * bipartition: dimension d vs all others. For each dimension d with grid
 * size M_d, the RDM ρ_d is M_d × M_d Hermitian positive-semidefinite.
 *
 * Complexity per dimension: O(totalSites × M_d) for RDM + O(M_d³) for eigendecomp.
 *
 * @module lib/physics/coordinateEntanglement
 */

import type { MetricConfig } from '@/lib/physics/tdse/metrics/types'
import { wignerNegativityFromRDM } from '@/lib/physics/wigner/wignerFromRDM'

import { MAX_BIPARTITION_RDM, MAX_PAIRWISE_RDM, MAX_RDM_SIZE } from './coordinateEntanglement/constants'
import {
  computeJointReducedDensityMatrix,
  computeReducedDensityMatrix,
} from './coordinateEntanglement/reducedDensityMatrix'
import { hermitianEigenvalues, vonNeumannEntropy } from './coordinateEntanglement/spectral'
import type {
  CoordinateEntanglementResult,
  EntanglementOptions,
} from './coordinateEntanglement/types'

export { MAX_RDM_SIZE } from './coordinateEntanglement/constants'
export {
  computeJointReducedDensityMatrix,
  computeReducedDensityMatrix,
} from './coordinateEntanglement/reducedDensityMatrix'
export { hermitianEigenvalues, vonNeumannEntropy } from './coordinateEntanglement/spectral'
export type {
  CoordinateEntanglementResult,
  EntanglementOptions,
} from './coordinateEntanglement/types'

/**
 * Coordinate entanglement currently assumes the flat discrete product
 * measure. Flat and torus metrics satisfy that convention; non-flat curved
 * metrics need a weighted RDM definition before the entropy is physical.
 */
export function isCoordinateEntanglementMetricSupported(metric: MetricConfig | undefined): boolean {
  return metric === undefined || metric.kind === 'flat' || metric.kind === 'torus'
}

// ─── Full Coordinate Entanglement Pipeline ──────────────────────────────────

/**
 * Compute coordinate entanglement diagnostics for a wavefunction ψ on an
 * N-dimensional grid.
 *
 * For each dimension d:
 *   1. Compute reduced density matrix ρ_d (M_d × M_d)
 *   2. Eigendecompose ρ_d via Jacobi iteration
 *   3. Compute von Neumann entropy S_d
 *
 * Optionally computes pairwise mutual information and bipartition entropies.
 *
 * @param psiRe - Real part of wavefunction (Float32Array from GPU readback)
 * @param psiIm - Imaginary part of wavefunction (Float32Array from GPU readback)
 * @param gridSize - Grid dimensions [M_0, M_1, ..., M_{N-1}]
 * @param options - Which optional observables to compute
 * @returns Full entanglement diagnostic result
 */
export function computeCoordinateEntanglement(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  options: EntanglementOptions
): CoordinateEntanglementResult {
  const N = gridSize.length

  // ── Normalize wavefunction ────────────────────────────────────────────
  // GPU wavefunctions are stored on a spatial grid without volume-element
  // normalization, so ‖ψ‖² ≠ 1. The RDM must have trace 1 for von Neumann
  // entropy to be physically meaningful.
  let norm2 = 0
  for (let i = 0; i < psiRe.length; i++) {
    norm2 += psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
  }
  // Guard against near-zero norm (numerical noise from GPU readback) —
  // amplifying 1e-20 by invNorm ≈ 1e10 would produce nonsensical RDMs.
  if (norm2 > 1e-12 && Math.abs(norm2 - 1) > 1e-6) {
    const invNorm = 1 / Math.sqrt(norm2)
    const normRe = new Float32Array(psiRe.length)
    const normIm = new Float32Array(psiIm.length)
    for (let i = 0; i < psiRe.length; i++) {
      normRe[i] = psiRe[i]! * invNorm
      normIm[i] = psiIm[i]! * invNorm
    }
    psiRe = normRe
    psiIm = normIm
  }

  // ── Per-dimension entropies + Wigner negativity ───────────────────────
  const entropies = new Array<number | null>(N)
  const maxEntropies = new Array<number | null>(N)
  const wignerNegativities = new Array<number | null>(N)
  let firstSpectrum: number[] = []
  let computedSum = 0
  let computedMaxSum = 0
  let computedCount = 0
  let wignerSum = 0
  let wignerCount = 0

  for (let d = 0; d < N; d++) {
    const M = gridSize[d]!
    if (M > MAX_RDM_SIZE) {
      // Dimension too large for RDM — mark as not computed
      entropies[d] = null
      maxEntropies[d] = null
      wignerNegativities[d] = null
      continue
    }
    const rdm = computeReducedDensityMatrix(psiRe, psiIm, gridSize, d)
    const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
    const S = vonNeumannEntropy(eigenvalues)
    const maxS = Math.log(rdm.M)
    entropies[d] = S
    maxEntropies[d] = maxS
    computedSum += S
    computedMaxSum += maxS
    computedCount++
    if (d === 0) {
      firstSpectrum = Array.from(eigenvalues)
    }

    // Wigner negativity from the same ρ_d (negligible cost vs RDM computation)
    if (options.computeWignerNegativity) {
      const neg = wignerNegativityFromRDM(rdm.re, rdm.im, rdm.M)
      wignerNegativities[d] = neg
      wignerSum += neg
      wignerCount++
    } else {
      wignerNegativities[d] = null
    }
  }

  const averageEntropy = computedCount > 0 ? computedSum / computedCount : 0
  const maxAvg = computedCount > 0 ? computedMaxSum / computedCount : 0
  const normalizedEntropy = maxAvg > 0 ? averageEntropy / maxAvg : 0

  // ── Bipartition entropies S_{k|N-k} for k=1,...,⌊N/2⌋ ────────────────
  const bipartitionEntropies: (number | null)[] = []
  if (options.computeBipartitions && N >= 2) {
    const halfN = Math.floor(N / 2)
    for (let k = 1; k <= halfN; k++) {
      // Use the first k dimensions as the kept subsystem
      const dims = Array.from({ length: k }, (_, i) => i)
      let Mjoint = 1
      for (const d of dims) Mjoint *= gridSize[d]!
      if (Mjoint > MAX_BIPARTITION_RDM) {
        bipartitionEntropies.push(null)
        continue
      }
      const rdm = computeJointReducedDensityMatrix(psiRe, psiIm, gridSize, dims)
      if (!rdm) {
        bipartitionEntropies.push(null)
        continue
      }
      const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
      bipartitionEntropies.push(vonNeumannEntropy(eigenvalues))
    }
  }

  // ── Pairwise mutual information ───────────────────────────────────────
  let mutualInfo: Float64Array | null = null
  if (options.computePairwiseMI && N >= 2) {
    mutualInfo = new Float64Array(N * N).fill(NaN)
    // Set diagonal MI to 0 (self-information is not meaningful in this context)
    for (let d = 0; d < N; d++) mutualInfo[d * N + d] = 0
    for (let d1 = 0; d1 < N; d1++) {
      const s1 = entropies[d1]
      if (s1 === null || s1 === undefined) continue
      for (let d2 = d1 + 1; d2 < N; d2++) {
        const s2 = entropies[d2]
        if (s2 === null || s2 === undefined) continue
        const jointSize = gridSize[d1]! * gridSize[d2]!
        if (jointSize > MAX_PAIRWISE_RDM) continue

        const jointRdm = computeJointReducedDensityMatrix(psiRe, psiIm, gridSize, [d1, d2])
        if (!jointRdm) continue

        const jointEigs = hermitianEigenvalues(jointRdm.re, jointRdm.im, jointRdm.M)
        const jointEntropy = vonNeumannEntropy(jointEigs)
        // MI is non-negative by definition; clamp to 0 for float precision artifacts
        const mi = Math.max(s1 + s2 - jointEntropy, 0)
        mutualInfo[d1 * N + d2] = mi
        mutualInfo[d2 * N + d1] = mi
      }
    }
  }

  const averageWignerNegativity = wignerCount > 0 ? wignerSum / wignerCount : 0

  return {
    entropies,
    averageEntropy,
    maxEntropies,
    normalizedEntropy,
    bipartitionEntropies,
    mutualInfo,
    spectrum: firstSpectrum,
    wignerNegativities,
    averageWignerNegativity,
  }
}
