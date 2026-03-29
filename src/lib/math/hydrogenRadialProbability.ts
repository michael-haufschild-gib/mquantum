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

/** Associated Laguerre polynomial L^alpha_k(x) via 3-term recurrence */
function laguerre(k: number, alpha: number, x: number): number {
  if (k <= 0) return 1.0
  if (k === 1) return 1.0 + alpha - x

  let lNm2 = 1.0
  let lNm1 = 1.0 + alpha - x
  let lN = lNm1
  for (let i = 2; i <= k; i++) {
    lN = ((2.0 * i - 1.0 + alpha - x) * lNm1 - (i - 1.0 + alpha) * lNm2) / i
    lNm2 = lNm1
    lNm1 = lN
  }
  return lN
}

/** Factorial for small n (n <= 20 sufficient for quantum numbers up to 7) */
function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

/** Log-factorial: ln(k!) — exact, mirrors WGSL lnFactorial() */
function lnFactorial(k: number): number {
  let sum = 0
  for (let i = 2; i <= k; i++) sum += Math.log(i)
  return sum
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
  const L = laguerre(n - l - 1, 2 * l + 1, rho)

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
  const L = laguerre(nr, 2 * lambda + 1, rho)

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

  // Use n_eff for scan range when D > 3
  const nEff = validN + (dimension - 3) / 2
  const rMax = (nEff * nEff + nEff + 2) * validA0 * 2.0
  const steps = 500
  const dr = rMax / steps
  let maxP = 0.0

  for (let i = 1; i <= steps; i++) {
    const r = i * dr
    const R =
      dimension !== 3
        ? hydrogenRadialND(validN, validL, r, validA0, dimension)
        : hydrogenRadial(validN, validL, r, validA0)
    const P = 4.0 * Math.PI * r * r * R * R
    if (P > maxP) maxP = P
  }

  return maxP > 1e-30 ? 1.0 / maxP : 1.0
}
