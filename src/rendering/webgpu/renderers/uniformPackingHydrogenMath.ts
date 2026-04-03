/**
 * CPU-side hydrogen normalization math for coupled ND mode.
 *
 * Mirrors the WGSL LUT-based implementations so that precomputed norms
 * packed into uniforms match the GPU's expectations exactly.
 *
 * @module rendering/webgpu/renderers/uniformPackingHydrogenMath
 */

// Log-factorial: ln(k!) for k = 0..22
const LN_FACTORIAL: number[] = []
;(() => {
  LN_FACTORIAL[0] = 0
  let acc = 0
  for (let k = 1; k <= 22; k++) {
    acc += Math.log(k)
    LN_FACTORIAL[k] = acc
  }
})()

function lnFactorial(k: number): number {
  if (k < 0 || k > 22) return 0
  return LN_FACTORIAL[k]!
}

// ln(Γ(n/2)) for n = 1..30 — matches the WGSL LN_GAMMA_HALF LUT
const LN_GAMMA_HALF: number[] = [
  0.5723649, 0.0, -0.1207822, 0.0, 0.2846829, 0.6931472, 1.2009736, 1.7917595, 2.4537365, 3.1780539,
  3.957814, 4.7874917, 5.6625621, 6.5792512, 7.5343642, 8.5251614, 9.5492673, 10.604602, 11.689333,
  12.801827, 13.940625, 15.104413, 16.291956, 17.502308, 18.734347, 19.987214, 21.260076, 22.552164,
  23.862765, 25.191221,
]

function lnGammaHalf(n: number): number {
  if (n < 1 || n > 30) return 0
  return LN_GAMMA_HALF[n - 1]!
}

/**
 * Compute hydrogenRadialNormND(nr, lambda, nEff, a0) on CPU.
 * Mirrors the WGSL implementation exactly.
 */
export function computeHydrogenRadialNormND(
  nr: number,
  lambda: number,
  nEff: number,
  a0: number
): number {
  const twoOverNa = 2.0 / (nEff * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const denomFactIdx = nr + Math.round(2.0 * lambda + 1.0)
  const lnNum = lnFactorial(nr)
  const lnDen = Math.log(2.0 * nEff) + lnFactorial(denomFactIdx)
  const lnRatio = lnNum - lnDen
  // Use exp(x/2) instead of sqrt(exp(x)) to match WGSL and avoid intermediate overflow
  return front * Math.exp(0.5 * lnRatio)
}

/**
 * Compute exp(lnHypersphericalLayerNorm(lk, lkp1, D, k)) on CPU.
 * Mirrors the WGSL lnHypersphericalLayerNorm exactly.
 */
export function computeHypersphericalLayerNorm(
  lk: number,
  lkp1: number,
  D: number,
  k: number
): number {
  const nk = lk - lkp1
  if (nk < 0) return Math.exp(-20.0)
  const dMinusKMinus1 = D - k - 1
  const prefactor = 2 * lk + dMinusKMinus1
  const lnNkFact = lnFactorial(nk)
  const gammaArgNum = 2 * lkp1 + dMinusKMinus1
  const lnGammaNum = lnGammaHalf(gammaArgNum)
  const gammaArgDen = 2 * lk + dMinusKMinus1 + 2
  const lnGammaDen = lnGammaHalf(gammaArgDen)
  const lnNormSq =
    Math.log(Math.max(prefactor, 1e-20)) + lnNkFact + lnGammaNum - 0.6931472 - lnGammaDen
  return Math.exp(0.5 * lnNormSq)
}
