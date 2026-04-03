/**
 * Inverse Participation Ratio (IPR) Utilities
 *
 * Standalone IPR computation for analytical benchmarking.
 * Follows the existing codebase convention: returns Σ|ψ|⁴ / (Σ|ψ|²)²,
 * which goes from 1/N (delocalized) to 1 (fully localized).
 *
 * @module lib/physics/stochastic/ipr
 */

/**
 * Compute IPR from a complex wavefunction.
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Participation ratio Σ|ψ|⁴/(Σ|ψ|²)² ∈ (0, 1]
 */
export function inverseParticipationRatio(psiRe: Float64Array, psiIm: Float64Array): number {
  let sumPsi2 = 0
  let sumPsi4 = 0
  for (let i = 0; i < psiRe.length; i++) {
    const d = psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
    sumPsi2 += d
    sumPsi4 += d * d
  }
  if (sumPsi2 === 0) return 0
  return sumPsi4 / (sumPsi2 * sumPsi2)
}

/**
 * Compute normalized IPR: IPR_norm = IPR * N.
 *
 * Maps to [IPR_raw * N] which gives 1 for fully delocalized (uniform)
 * and N for fully localized (delta). This is the conventional "effective
 * number of occupied sites".
 *
 * Note: with our convention IPR_raw = Σp², IPR_raw * N goes from 1 (delocalized) to N (localized).
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Normalized IPR (1 = delocalized, N = localized)
 */
export function normalizedIPR(psiRe: Float64Array, psiIm: Float64Array): number {
  return inverseParticipationRatio(psiRe, psiIm) * psiRe.length
}

/**
 * Compute IPR from real-valued density array (|ψ|² already computed).
 *
 * @param density - Array of |ψ_i|² values
 * @returns Participation ratio
 */
export function iprFromDensity(density: Float64Array | number[]): number {
  let sum2 = 0
  let sum4 = 0
  for (let i = 0; i < density.length; i++) {
    const d = density[i]!
    sum2 += d
    sum4 += d * d
  }
  if (sum2 === 0) return 0
  return sum4 / (sum2 * sum2)
}
