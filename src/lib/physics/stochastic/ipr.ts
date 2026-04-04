/**
 * Inverse Participation Ratio (IPR) Utilities
 *
 * IPR = (Σ|ψ|²)² / Σ|ψ|⁴ = 1 / Σp_i²
 *
 * Goes from 1 (fully localized / delta) to N (fully delocalized / uniform).
 *
 * @module lib/physics/stochastic/ipr
 */

/**
 * Compute IPR from a complex wavefunction.
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns IPR = (Σ|ψ|²)² / Σ|ψ|⁴. Ranges from 1 (localized) to N (delocalized).
 */
export function inverseParticipationRatio(psiRe: Float64Array, psiIm: Float64Array): number {
  let sumPsi2 = 0
  let sumPsi4 = 0
  for (let i = 0; i < psiRe.length; i++) {
    const d = psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
    sumPsi2 += d
    sumPsi4 += d * d
  }
  if (sumPsi4 === 0) return 0
  return (sumPsi2 * sumPsi2) / sumPsi4
}

/**
 * Compute normalized IPR: IPR_norm = IPR / N.
 *
 * Maps to [0, 1]: 1/N for fully localized (delta), 1 for fully delocalized (uniform).
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Normalized IPR ∈ [1/N, 1]
 */
export function normalizedIPR(psiRe: Float64Array, psiIm: Float64Array): number {
  return inverseParticipationRatio(psiRe, psiIm) / psiRe.length
}

/**
 * Compute IPR from real-valued density array (|ψ|² already computed).
 *
 * @param density - Array of |ψ_i|² values
 * @returns IPR = (Σd)² / Σd². Ranges from 1 (localized) to N (delocalized).
 */
export function iprFromDensity(density: Float64Array | number[]): number {
  let sum2 = 0
  let sum4 = 0
  for (let i = 0; i < density.length; i++) {
    const d = density[i]!
    sum2 += d
    sum4 += d * d
  }
  if (sum4 === 0) return 0
  return (sum2 * sum2) / sum4
}
