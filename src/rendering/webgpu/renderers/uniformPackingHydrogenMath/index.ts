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
 * Mirrors the WGSL lnHypersphericalLayerNorm for shader-valid inputs.
 *
 * Layer k carries sin^{l_{k+1}}(θ) · C_n^α(cos θ) against the S^{D-1} weight
 * sin^{D-k-2}(θ), so with n = l_k − l_{k+1} and α = l_{k+1} + (D−k−2)/2 the
 * unit-norm constant follows from the Gegenbauer orthogonality integral
 *   ∫₀^π [C_n^α(cos θ)]² sin^{2α}(θ) dθ = π 2^{1−2α} Γ(n+2α) / (n! (n+α) Γ(α)²):
 *   N² = n! (n+α) Γ(α)² 2^{2α−1} / (π Γ(n+2α)).
 * (The earlier closed form (2l_k+D−k−1)·n!·Γ(α+½)/(2Γ(n+α+3/2)) left each
 * layer's integral anywhere in ≈[0.7, 1.7], so D ≥ 4 coupled states were
 * not unit-normalized and their brightness varied with the angular chain.)
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

  // 2α is an integer ≥ 2 for every emitted layer (k ≤ D−4), so Γ(α) is a
  // half-integer LUT entry and Γ(n+2α) = (n+2α−1)!.
  const twoAlpha = 2 * lkp1 + D - k - 2
  const gammaFactIdx = nk + twoAlpha - 1
  if (
    twoAlpha < 1 ||
    twoAlpha > MAX_WGSL_GAMMA_HALF_INDEX ||
    gammaFactIdx < 0 ||
    gammaFactIdx > MAX_WGSL_FACTORIAL_INDEX
  ) {
    return INVALID_HYPERSPHERICAL_NORM
  }

  const lnNormSq =
    lnFactorial(nk) +
    Math.log(0.5 * (2 * nk + twoAlpha)) +
    2 * lnGammaHalf(twoAlpha) +
    (twoAlpha - 1) * Math.LN2 -
    Math.log(Math.PI) -
    lnFactorial(gammaFactIdx)
  const norm = Math.exp(0.5 * lnNormSq)
  return Number.isFinite(norm) && norm >= 0 ? norm : INVALID_HYPERSPHERICAL_NORM
}
