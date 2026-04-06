/**
 * Stochastic Localization Operator — CPU Reference Implementation
 *
 * Pure JavaScript implementation of the CSL localization operator,
 * matching the WGSL shader logic. Used for unit testing and as ground
 * truth for GPU shader verification.
 *
 * The operator applies multiplicative Gaussian-weighted noise kicks:
 *   ψ[i] *= (1 + Σ_k √(γ·dt)·G(x_i, c_k, σ)·(ξ_k - ⟨L_k⟩))
 * where ξ_k ~ N(0,1) and ⟨L_k⟩ is the expectation of the localization operator.
 *
 * @module lib/physics/stochastic/localizationOperator
 */

import { computeStrides } from '@/lib/math/ndArray'

import type { CollapseCenter } from './localizationKernel'

/**
 * Apply one localization step to a 1D wavefunction (CPU reference).
 *
 * @param psiRe - Real part of wavefunction (modified in-place)
 * @param psiIm - Imaginary part of wavefunction (modified in-place)
 * @param gridSize - Number of lattice sites
 * @param spacing - Lattice spacing
 * @param centers - Collapse centers for this step
 * @param gamma - Monitoring rate
 * @param sigma - Localization Gaussian width
 * @param dt - Timestep
 */
export function applyLocalizationStep1D(
  psiRe: Float64Array,
  psiIm: Float64Array,
  gridSize: number,
  spacing: number,
  centers: CollapseCenter[],
  gamma: number,
  sigma: number,
  dt: number
): void {
  if (gamma === 0) return

  const invTwoSigmaSq = 1 / (2 * sigma * sigma)
  const sqrtGammaDt = Math.sqrt(gamma * dt)
  const halfExtent = gridSize * spacing * 0.5

  for (let i = 0; i < gridSize; i++) {
    const x = i * spacing - halfExtent
    let totalFactor = 0

    for (const center of centers) {
      const diff = x - center.position[0]!
      const distSq = diff * diff
      const weight = Math.exp(-distSq * invTwoSigmaSq)
      totalFactor += sqrtGammaDt * weight * (center.noise - (center.expectation ?? 0))
    }

    const scale = 1 + totalFactor
    psiRe[i]! *= scale
    psiIm[i]! *= scale
  }
}

/**
 * Apply one localization step to an N-D wavefunction (CPU reference).
 *
 * @param psiRe - Real part (flat array, row-major)
 * @param psiIm - Imaginary part (flat array, row-major)
 * @param gridSize - Grid sizes per dimension
 * @param spacing - Spacings per dimension
 * @param latticeDim - Number of dimensions
 * @param centers - Collapse centers
 * @param gamma - Monitoring rate
 * @param sigma - Localization width
 * @param dt - Timestep
 */
export function applyLocalizationStepND(
  psiRe: Float64Array,
  psiIm: Float64Array,
  gridSize: number[],
  spacing: number[],
  latticeDim: number,
  centers: CollapseCenter[],
  gamma: number,
  sigma: number,
  dt: number
): void {
  if (gamma === 0) return

  const activeGrid = gridSize.slice(0, latticeDim)
  const totalSites = activeGrid.reduce((a, b) => a * b, 1)
  const strides = computeStrides(activeGrid)

  const invTwoSigmaSq = 1 / (2 * sigma * sigma)
  const sqrtGammaDt = Math.sqrt(gamma * dt)
  const halfExtents = gridSize.map((g, d) => g * spacing[d]! * 0.5)

  for (let idx = 0; idx < totalSites; idx++) {
    // Convert flat index to coordinates
    const coords: number[] = []
    let rem = idx
    for (let d = 0; d < latticeDim; d++) {
      const ci = Math.floor(rem / strides[d]!)
      rem = rem % strides[d]!
      coords.push(ci * spacing[d]! - halfExtents[d]!)
    }

    let totalFactor = 0
    for (const center of centers) {
      let distSq = 0
      for (let d = 0; d < latticeDim; d++) {
        // Centers only have visible-dim (≤3) coordinates; higher dims default to origin
        const diff = coords[d]! - (center.position[d] ?? 0)
        distSq += diff * diff
      }
      const weight = Math.exp(-distSq * invTwoSigmaSq)
      totalFactor += sqrtGammaDt * weight * (center.noise - (center.expectation ?? 0))
    }

    const scale = 1 + totalFactor
    psiRe[idx]! *= scale
    psiIm[idx]! *= scale
  }
}

/**
 * Compute the total norm of a wavefunction: Σ |ψ_i|².
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Total norm
 */
export function computeNorm(psiRe: Float64Array, psiIm: Float64Array): number {
  let norm = 0
  for (let i = 0; i < psiRe.length; i++) {
    norm += psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
  }
  return norm
}

/**
 * Compute the Participation Ratio: Σ p_i² where p_i = |ψ_i|²/N_norm.
 *
 * Returns Σ|ψ|⁴ / (Σ|ψ|²)² — the sum of squared probabilities.
 * Goes from 1/N (fully delocalized) to 1 (fully localized).
 * The inverse (IPR = 1/PR) is computed by {@link inverseParticipationRatio} in ipr.ts.
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Participation ratio in (0, 1]
 */
export function computeParticipationRatio(psiRe: Float64Array, psiIm: Float64Array): number {
  let sumPsi2 = 0
  let sumPsi4 = 0
  for (let i = 0; i < psiRe.length; i++) {
    const density = psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
    sumPsi2 += density
    sumPsi4 += density * density
  }
  if (sumPsi2 === 0) return 0
  return sumPsi4 / (sumPsi2 * sumPsi2)
}

/**
 * Renormalize a wavefunction to unit norm.
 *
 * @param psiRe - Real part (modified in-place)
 * @param psiIm - Imaginary part (modified in-place)
 */
export function renormalize(psiRe: Float64Array, psiIm: Float64Array): void {
  const norm = computeNorm(psiRe, psiIm)
  if (norm <= 0) return
  const scale = 1 / Math.sqrt(norm)
  for (let i = 0; i < psiRe.length; i++) {
    psiRe[i]! *= scale
    psiIm[i]! *= scale
  }
}
