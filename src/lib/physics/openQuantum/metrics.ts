/**
 * Open Quantum Systems — Observable metrics
 *
 * All functions operate on a DensityMatrix and return scalar diagnostics.
 * Eigendecomposition reuses the shared scratch buffers from integrator.ts.
 */

import type { DensityMatrix, OpenQuantumMetrics } from './types'
import { hermitianEigendecompose, MAX_K } from './integrator'

// Scratch buffers for eigendecomposition (shared with integrator module)
const eigenvaluesScratch = new Float64Array(MAX_K)
const eigenvectorsScratch = new Float64Array(MAX_K * MAX_K * 2)

/**
 * Tr(ρ) — trace of the density matrix.
 *
 * @param rho - Density matrix
 * @returns Trace (should be ≈1)
 */
export function trace(rho: DensityMatrix): number {
  const K = rho.K
  const el = rho.elements
  let tr = 0
  for (let k = 0; k < K; k++) {
    tr += el[2 * (k * K + k)]!
  }
  return tr
}

/**
 * Tr(ρ²) — purity.
 *
 * For a K×K complex matrix: Tr(ρ²) = Σ_{k,l} |ρ_{kl}|².
 *
 * @param rho - Density matrix
 * @returns Purity ∈ [1/K, 1]
 */
export function purity(rho: DensityMatrix): number {
  const K = rho.K
  const el = rho.elements
  let sum = 0
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const idx = 2 * (k * K + l)
      sum += el[idx]! * el[idx]! + el[idx + 1]! * el[idx + 1]!
    }
  }
  return sum
}

/**
 * S_L = 1 − Tr(ρ²) — linear entropy.
 *
 * @param rho - Density matrix
 * @returns Linear entropy ∈ [0, 1 − 1/K]
 */
export function linearEntropy(rho: DensityMatrix): number {
  return 1 - purity(rho)
}

/**
 * S = −Tr(ρ ln ρ) — von Neumann entropy.
 *
 * Requires eigendecomposition: S = −Σ_k p_k ln(p_k) where p_k are eigenvalues.
 *
 * @param rho - Density matrix
 * @returns Von Neumann entropy ∈ [0, ln(K)]
 */
export function vonNeumannEntropy(rho: DensityMatrix): number {
  hermitianEigendecompose(rho, eigenvaluesScratch, eigenvectorsScratch)
  let S = 0
  for (let k = 0; k < rho.K; k++) {
    const p = eigenvaluesScratch[k]!
    if (p > 1e-15) {
      S -= p * Math.log(p)
    }
  }
  return S
}

/**
 * Σ_{k≠l} |ρ_{kl}| — total off-diagonal coherence magnitude.
 *
 * @param rho - Density matrix
 * @returns Coherence magnitude ≥ 0
 */
export function coherenceMagnitude(rho: DensityMatrix): number {
  const K = rho.K
  const el = rho.elements
  let sum = 0
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      if (k === l) continue
      const idx = 2 * (k * K + l)
      sum += Math.sqrt(el[idx]! * el[idx]! + el[idx + 1]! * el[idx + 1]!)
    }
  }
  return sum
}

/**
 * Re(ρ_{00}) — ground state population.
 *
 * @param rho - Density matrix
 * @returns Ground state probability ∈ [0, 1]
 */
export function groundPopulation(rho: DensityMatrix): number {
  return rho.elements[0]!
}

/**
 * Compute all observable metrics from the density matrix.
 *
 * Von Neumann entropy is computationally expensive (O(K³) eigendecomposition).
 * Call at reduced cadence if needed.
 *
 * @param rho - Density matrix
 * @param includeVonNeumann - Whether to compute von Neumann entropy (set false for reduced cadence)
 * @param previousVonNeumann - Previous von Neumann value to reuse when skipping computation
 * @returns Complete metrics snapshot
 */
export function computeMetrics(
  rho: DensityMatrix,
  includeVonNeumann: boolean = true,
  previousVonNeumann: number = 0,
): OpenQuantumMetrics {
  const p = purity(rho)
  return {
    purity: p,
    linearEntropy: 1 - p,
    vonNeumannEntropy: includeVonNeumann ? vonNeumannEntropy(rho) : previousVonNeumann,
    coherenceMagnitude: coherenceMagnitude(rho),
    groundPopulation: groundPopulation(rho),
    trace: trace(rho),
  }
}
