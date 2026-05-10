/**
 * CPU-side hydrogen radial probability P(r) = 4πr²|R_nl(r)|²
 *
 * Provides both the 3D radial wavefunction R_nl(r) and the N-dimensional
 * generalization R_nl^(D)(r) with effective angular momentum λ = l + (D-3)/2.
 *
 * Used to precompute 1/max(P(r)) so the GPU overlay maps to [0,1].
 *
 * @module lib/math/hydrogenRadialProbability
 */

import { associatedLaguerre } from '@/lib/math/laguerrePolynomial'
import { factorial, lnFactorial } from '@/lib/math/specialFunctions'

/** Hydrogen radial wavefunction R_nl(r) — mirrors WGSL hydrogenRadial() */
function hydrogenRadial(n: number, l: number, r: number, a0: number): number {
  if (n < 1 || l < 0 || l >= n) return 0.0
  const a0Safe = Number.isFinite(a0) ? Math.max(a0, 0.001) : 0.001
  const nf = n
  const rho = (2.0 * r) / (nf * a0Safe)

  // Normalization: N_nl = sqrt((2/na0)^3 * (n-l-1)! / (2n*(n+l)!))
  const twoOverNa = 2.0 / (nf * a0Safe)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const factNum = factorial(n - l - 1)
  const factDen = 2.0 * nf * factorial(n + l)
  const norm = front * Math.sqrt(factNum / factDen)

  // rho^l
  let rhoL = 1.0
  for (let il = 0; il < l; il++) rhoL *= rho

  // Associated Laguerre L^{2l+1}_{n-l-1}(rho)
  const L = associatedLaguerre(n - l - 1, 2 * l + 1, rho)

  // Exponential decay
  const expPart = Math.exp(-rho * 0.5)

  return norm * rhoL * L * expPart
}

/** N-dimensional hydrogen radial wavefunction R_nl^(D)(r) — mirrors WGSL hydrogenRadialND() */
function hydrogenRadialND(n: number, l: number, r: number, a0: number, dim: number): number {
  if (n < 1 || l < 0 || l >= n) return 0.0
  const a0Safe = Number.isFinite(a0) ? Math.max(a0, 0.001) : 0.001

  const lambda = l + (dim - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1

  const rho = (2.0 * r) / (nEff * a0Safe)

  // Normalization via log-factorial: sqrt((2/(nEff*a0))^3 * nr! / (2*nEff * (nr+2λ+1)!))
  // Both factorial args are always integers: nr and nr + 2l + D - 1
  const twoOverNa = 2.0 / (nEff * a0Safe)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const denomFactArg = Math.round(nr + 2 * lambda + 1)
  const lnNum = lnFactorial(nr)
  const lnDen = Math.log(2 * nEff) + lnFactorial(denomFactArg)
  const norm = front * Math.sqrt(Math.exp(lnNum - lnDen))

  // rho^lambda
  const rhoLambda = Math.pow(Math.max(rho, 1e-20), lambda)

  // Associated Laguerre L^{2λ+1}_{nr}(rho)
  const L = associatedLaguerre(nr, 2 * lambda + 1, rho)

  const expPart = Math.exp(-rho * 0.5)

  return norm * rhoLambda * L * expPart
}

/**
 * Compute 1/max(P(r)) for the radial probability distribution.
 * P(r) = 4πr² |R_nl(r)|²
 *
 * Scans a grid of r values to find the peak, returns the inverse for GPU normalization.
 * When dimension ≠ 3, uses the D-dimensional radial wavefunction.
 *
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param a0 - Bohr radius
 * @param dimension - Spatial dimension D (default 3)
 */
export function computeRadialProbabilityNorm(
  n: number,
  l: number,
  a0: number,
  dimension: number = 3
): number {
  const validN = Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 1
  const validLRaw = Number.isFinite(l) ? Math.floor(l) : 0
  const validL = Math.max(0, Math.min(validLRaw, validN - 1))
  const validA0 = Number.isFinite(a0) ? Math.max(a0, 0.001) : 0.001
  const validDimension = Number.isFinite(dimension)
    ? Math.max(2, Math.min(11, Math.floor(dimension)))
    : 3

  // Use n_eff for scan range when D > 3
  const nEff = validN + (validDimension - 3) / 2
  const rMax = (nEff * nEff + nEff + 2) * validA0 * 2.0
  const steps = 500
  const dr = rMax / steps
  let maxP = 0.0

  for (let i = 1; i <= steps; i++) {
    const r = i * dr
    const R =
      validDimension !== 3
        ? hydrogenRadialND(validN, validL, r, validA0, validDimension)
        : hydrogenRadial(validN, validL, r, validA0)
    const P = 4.0 * Math.PI * r * r * R * R
    if (P > maxP) maxP = P
  }

  return maxP > 1e-30 ? 1.0 / maxP : 1.0
}
