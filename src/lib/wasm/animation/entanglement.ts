/**
 * Phase 5 — Coordinate-entanglement WASM bindings.
 *
 * Reduced density matrices (single-axis and joint), Hermitian
 * eigendecomposition (Jacobi), and von Neumann entropy.
 *
 * Bindings are optional (`?:` in {@link ./types#WasmModule}) — the
 * `typeof fn_ === 'function'` guard treats absence as "binding not
 * compiled in", forcing the caller's JS fallback.
 *
 * @module lib/wasm/animation/entanglement
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Compute reduced density matrix for a single dimension via WASM.
 *
 * @param psiRe - Real part of wavefunction (Float32Array from GPU readback)
 * @param psiIm - Imaginary part of wavefunction (Float32Array)
 * @param gridSize - Grid dimensions as Uint32Array
 * @param dimIndex - Which dimension to keep (0-based)
 * @returns Packed Float64Array `[re_flat(M*M), im_flat(M*M)]`, or null if WASM not ready
 */
export function computeRdmWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  dimIndex: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.compute_rdm_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(psiRe, psiIm, gridSize, dimIndex)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_rdm_wasm failed:', err)
    return null
  }
}

/**
 * Compute joint reduced density matrix for multiple dimensions via WASM.
 *
 * @param psiRe - Real part of wavefunction (Float32Array)
 * @param psiIm - Imaginary part of wavefunction (Float32Array)
 * @param gridSize - Grid dimensions as Uint32Array
 * @param keptDims - Indices of dimensions to keep (sorted ascending) as Uint32Array
 * @returns Packed Float64Array `[re_flat(M*M), im_flat(M*M)]`, or null/empty if WASM not ready or M > 1024
 */
export function computeJointRdmWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  keptDims: Uint32Array
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.compute_joint_rdm_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(psiRe, psiIm, gridSize, keptDims)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_joint_rdm_wasm failed:', err)
    return null
  }
}

/**
 * Hermitian eigendecomposition via Jacobi iteration (WASM-accelerated).
 *
 * @param re - Real part of Hermitian matrix (row-major, n×n)
 * @param im - Imaginary part of Hermitian matrix (row-major, n×n)
 * @param n - Matrix dimension
 * @returns Eigenvalues sorted descending as Float64Array, or null if WASM not ready
 */
export function hermitianEigenvaluesWasm(
  re: Float64Array,
  im: Float64Array,
  n: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.hermitian_eigenvalues_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(re, im, n)
  } catch (err) {
    logger.warn('[AnimationWASM] hermitian_eigenvalues_wasm failed:', err)
    return null
  }
}

/**
 * Von Neumann entropy from eigenvalues via WASM.
 *
 * @param eigenvalues - Eigenvalues of a density matrix
 * @returns Entropy value (nats), or null if WASM not ready
 */
export function vonNeumannEntropyWasm(eigenvalues: Float64Array): number | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.von_neumann_entropy_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(eigenvalues)
  } catch (err) {
    logger.warn('[AnimationWASM] von_neumann_entropy_wasm failed:', err)
    return null
  }
}
