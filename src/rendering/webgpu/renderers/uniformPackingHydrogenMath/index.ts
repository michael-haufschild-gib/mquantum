/**
 * CPU-side hydrogen normalization math for coupled ND mode.
 *
 * Mirrors the WGSL LUT-based implementations so that precomputed norms
 * packed into uniforms match the GPU's expectations exactly.
 *
 * @module rendering/webgpu/renderers/uniformPackingHydrogenMath
 */

import { lnFactorial, lnGammaHalf } from '@/lib/math/specialFunctions'

const MAX_WGSL_FACTORIAL_INDEX = 22
const MAX_WGSL_GAMMA_HALF_INDEX = 30
const INVALID_HYPERSPHERICAL_NORM = Math.exp(-20.0)

/**
 * Compute hydrogenRadialNormND(nr, lambda, nEff, a0) on CPU.
 * Mirrors the WGSL implementation exactly for shader-valid inputs.
 */
export function computeHydrogenRadialNormND(
  nr: number,
  lambda: number,
  nEff: number,
  a0: number
): number {
  if (
    !Number.isInteger(nr) ||
    !Number.isFinite(lambda) ||
    !Number.isFinite(nEff) ||
    !Number.isFinite(a0) ||
    nr < 0 ||
    nEff <= 0 ||
    a0 <= 0
  ) {
    return 0
  }

  const denomFactIdx = nr + Math.round(2.0 * lambda + 1.0)
  if (
    nr > MAX_WGSL_FACTORIAL_INDEX ||
    denomFactIdx < 0 ||
    denomFactIdx > MAX_WGSL_FACTORIAL_INDEX
  ) {
    return 0
  }

  const twoOverNa = 2.0 / (nEff * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const lnNum = lnFactorial(nr)
  const lnDen = Math.log(2.0 * nEff) + lnFactorial(denomFactIdx)
  const lnRatio = lnNum - lnDen
  // Use exp(x/2) instead of sqrt(exp(x)) to match WGSL and avoid intermediate overflow
  const norm = front * Math.exp(0.5 * lnRatio)
  return Number.isFinite(norm) && norm >= 0 ? norm : 0
}

/**
 * Compute exp(lnHypersphericalLayerNorm(lk, lkp1, D, k)) on CPU.
 * Mirrors the WGSL lnHypersphericalLayerNorm exactly for shader-valid inputs.
 */
export function computeHypersphericalLayerNorm(
  lk: number,
  lkp1: number,
  D: number,
  k: number
): number {
  if (
    !Number.isInteger(lk) ||
    !Number.isInteger(lkp1) ||
    !Number.isInteger(D) ||
    !Number.isInteger(k) ||
    lk < 0 ||
    lkp1 < 0 ||
    D < 3 ||
    k < 0 ||
    k > D - 4
  ) {
    return INVALID_HYPERSPHERICAL_NORM
  }

  const nk = lk - lkp1
  if (nk < 0 || nk > MAX_WGSL_FACTORIAL_INDEX) return INVALID_HYPERSPHERICAL_NORM

  const dMinusKMinus1 = D - k - 1
  const prefactor = 2 * lk + dMinusKMinus1
  const gammaArgNum = 2 * lkp1 + dMinusKMinus1
  const gammaArgDen = 2 * lk + dMinusKMinus1 + 2
  if (
    gammaArgNum < 1 ||
    gammaArgNum > MAX_WGSL_GAMMA_HALF_INDEX ||
    gammaArgDen < 1 ||
    gammaArgDen > MAX_WGSL_GAMMA_HALF_INDEX
  ) {
    return INVALID_HYPERSPHERICAL_NORM
  }

  const lnNkFact = lnFactorial(nk)
  const lnGammaNum = lnGammaHalf(gammaArgNum)
  const lnGammaDen = lnGammaHalf(gammaArgDen)
  const lnNormSq =
    Math.log(Math.max(prefactor, 1e-20)) + lnNkFact + lnGammaNum - 0.6931472 - lnGammaDen
  const norm = Math.exp(0.5 * lnNormSq)
  return Number.isFinite(norm) && norm >= 0 ? norm : INVALID_HYPERSPHERICAL_NORM
}
