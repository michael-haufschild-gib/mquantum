/**
 * Phase 6 — Complex matrix exponential WASM bindings.
 *
 * Padé(13,13) with scaling-and-squaring, plus complex matrix multiply.
 * Used by the Pauli / Dirac evolution kernels for time-step propagators.
 *
 * @module lib/wasm/animation/complexMatrix
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Matrix exponential via Padé(13,13) with scaling-and-squaring (WASM-accelerated).
 *
 * @param aRe - Real part of input matrix (N×N, row-major)
 * @param aIm - Imaginary part of input matrix (N×N, row-major)
 * @param n - Matrix dimension
 * @returns Packed Float64Array `[re_flat(N*N), im_flat(N*N)]`, or null if WASM not ready
 */
export function matrixExponentialPadeWasm(
  aRe: Float64Array,
  aIm: Float64Array,
  n: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.matrix_exponential_pade_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(aRe, aIm, n)
  } catch (err) {
    logger.warn('[AnimationWASM] matrix_exponential_pade_wasm failed:', err)
    return null
  }
}

/**
 * Complex matrix multiply C = A × B via WASM.
 *
 * @param aRe - Real part of left matrix (N×N, row-major)
 * @param aIm - Imaginary part of left matrix (N×N, row-major)
 * @param bRe - Real part of right matrix (N×N, row-major)
 * @param bIm - Imaginary part of right matrix (N×N, row-major)
 * @param n - Matrix dimension
 * @returns Packed Float64Array `[re_flat(N*N), im_flat(N*N)]`, or null if WASM not ready
 */
export function complexMatMulWasm(
  aRe: Float64Array,
  aIm: Float64Array,
  bRe: Float64Array,
  bIm: Float64Array,
  n: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.complex_mat_mul_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(aRe, aIm, bRe, bIm, n)
  } catch (err) {
    logger.warn('[AnimationWASM] complex_mat_mul_wasm failed:', err)
    return null
  }
}
