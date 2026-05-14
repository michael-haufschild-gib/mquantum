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
 * @returns IPR = (Σ|ψ|²)² / Σ|ψ|⁴. Ranges from 1 (localized) to N (delocalized). Returns 0 for invalid input.
 */
export function inverseParticipationRatio(psiRe: Float64Array, psiIm: Float64Array): number {
  if (psiRe.length === 0 || psiRe.length !== psiIm.length) return 0

  let maxAbs = 0
  for (let i = 0; i < psiRe.length; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    if (!Number.isFinite(re) || !Number.isFinite(im)) return 0
    maxAbs = Math.max(maxAbs, Math.abs(re), Math.abs(im))
  }
  if (maxAbs === 0) return 0

  let sumPsi2 = 0
  let sumPsi4 = 0
  for (let i = 0; i < psiRe.length; i++) {
    const re = psiRe[i]! / maxAbs
    const im = psiIm[i]! / maxAbs
    const d = re * re + im * im
    sumPsi2 += d
    sumPsi4 += d * d
  }
  if (sumPsi4 === 0) return 0
  const ipr = (sumPsi2 * sumPsi2) / sumPsi4
  return Number.isFinite(ipr) ? ipr : 0
}

/**
 * Compute normalized IPR: IPR_norm = IPR / N.
 *
 * Maps to [0, 1]: 1/N for fully localized (delta), 1 for fully delocalized (uniform).
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Normalized IPR ∈ [1/N, 1] for valid nonzero wavefunctions; 0 for invalid input.
 */
export function normalizedIPR(psiRe: Float64Array, psiIm: Float64Array): number {
  if (psiRe.length === 0 || psiRe.length !== psiIm.length) return 0
  return inverseParticipationRatio(psiRe, psiIm) / psiRe.length
}

/**
 * Compute IPR from real-valued density array (|ψ|² already computed).
 *
 * @param density - Array of |ψ_i|² values
 * @returns IPR = (Σd)² / Σd². Ranges from 1 (localized) to N (delocalized). Returns 0 for invalid input.
 */
export function iprFromDensity(density: Float64Array | number[]): number {
  if (density.length === 0) return 0

  let maxDensity = 0
  for (let i = 0; i < density.length; i++) {
    const d = density[i]!
    if (!Number.isFinite(d) || d < 0) return 0
    maxDensity = Math.max(maxDensity, d)
  }
  if (maxDensity === 0) return 0

  let sum2 = 0
  let sum4 = 0
  for (let i = 0; i < density.length; i++) {
    const d = density[i]! / maxDensity
    sum2 += d
    sum4 += d * d
  }
  if (sum4 === 0) return 0
  const ipr = (sum2 * sum2) / sum4
  return Number.isFinite(ipr) ? ipr : 0
}
