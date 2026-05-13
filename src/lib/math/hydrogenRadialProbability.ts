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

interface HydrogenRadialParams {
  n: number
  l: number
  a0: number
  dimension: number
}

function sanitizeHydrogenRadialParams(
  n: number,
  l: number,
  a0: number,
  dimension: number = 3
): HydrogenRadialParams {
  const validN = Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 1
  const validLRaw = Number.isFinite(l) ? Math.floor(l) : 0
  const validL = Math.max(0, Math.min(validLRaw, validN - 1))
  const validA0 = Number.isFinite(a0) ? Math.max(a0, 0.001) : 0.001
  const validDimension = Number.isFinite(dimension)
    ? Math.max(2, Math.min(11, Math.floor(dimension)))
    : 3

  return { n: validN, l: validL, a0: validA0, dimension: validDimension }
}

function sanitizeRadius(r: number): number {
  return Number.isFinite(r) ? Math.max(0, r) : 0
}

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

  // rho^lambda — mirrors WGSL hydrogenRadialND integer/half-integer branches.
  const rhoLambda = computeRhoLambda(rho, lambda)

  // Associated Laguerre L^{2λ+1}_{nr}(rho)
  const L = associatedLaguerre(nr, 2 * lambda + 1, rho)

  const expPart = Math.exp(-rho * 0.5)

  return norm * rhoLambda * L * expPart
}

function computeRhoLambda(rho: number, lambda: number): number {
  const lambdaInt = Math.trunc(lambda)
  const lambdaFrac = lambda - lambdaInt
  if (Math.abs(lambdaFrac) < 1e-6) {
    let rhoLambda = 1.0
    for (let il = 0; il < lambdaInt; il++) rhoLambda *= rho
    return rhoLambda
  }

  if (Math.abs(lambdaFrac - 0.5) < 1e-6) {
    let rhoK = 1.0
    for (let il = 0; il < lambdaInt; il++) rhoK *= rho
    return rhoK * Math.sqrt(Math.max(rho, 0.0))
  }

  return Math.pow(Math.max(rho, 1e-20), lambda)
}

function evaluateHydrogenRadial(params: HydrogenRadialParams, r: number): number {
  return params.dimension !== 3
    ? hydrogenRadialND(params.n, params.l, r, params.a0, params.dimension)
    : hydrogenRadial(params.n, params.l, r, params.a0)
}

/**
 * Dimension-aware hydrogen radial wavefunction R_nl(r).
 *
 * This is the CPU mirror of WGSL hydrogenRadial()/hydrogenRadialND() used by
 * analysis UI and radial-probability normalization. Inputs are sanitized to
 * finite radial domains; store/GPU packing applies the stricter UI limits.
 */
export function computeHydrogenRadialWavefunction(
  n: number,
  l: number,
  r: number,
  a0: number = 1,
  dimension: number = 3
): number {
  const params = sanitizeHydrogenRadialParams(n, l, a0, dimension)
  return evaluateHydrogenRadial(params, sanitizeRadius(r))
}

/**
 * Dimension-aware radial probability density without the constant 4π factor.
 *
 * Returns r² |R_nl(r)|² for charting. GPU overlay normalization multiplies the
 * same wavefunction by 4π separately, where the constant matters.
 */
export function computeHydrogenRadialProbabilityDensity(
  n: number,
  l: number,
  r: number,
  a0: number = 1,
  dimension: number = 3
): number {
  const radius = sanitizeRadius(r)
  const R = computeHydrogenRadialWavefunction(n, l, radius, a0, dimension)
  return radius * radius * R * R
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
  const params = sanitizeHydrogenRadialParams(n, l, a0, dimension)

  // Use n_eff for scan range when D > 3
  const nEff = params.n + (params.dimension - 3) / 2
  const rMax = (nEff * nEff + nEff + 2) * params.a0 * 2.0
  const steps = 500
  const dr = rMax / steps
  let maxP = 0.0

  for (let i = 1; i <= steps; i++) {
    const r = i * dr
    const R = evaluateHydrogenRadial(params, r)
    const P = 4.0 * Math.PI * r * r * R * R
    if (P > maxP) maxP = P
  }

  return maxP > 1e-30 ? 1.0 / maxP : 1.0
}
