/**
 * CPU-side hydrogen normalization math for coupled ND mode.
 *
 * Mirrors the WGSL LUT-based implementations so that precomputed norms
 * packed into uniforms match the GPU's expectations exactly.
 *
 * @module rendering/webgpu/renderers/uniformPackingHydrogenMath
 */

import { lnFactorial, lnGammaHalf } from '@/lib/math/specialFunctions'

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
