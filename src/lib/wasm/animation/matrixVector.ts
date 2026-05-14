/**
 * Phase 2 — Matrix and vector WASM operations.
 *
 * Square-matrix multiply, dot product, magnitude, normalize, and
 * subtraction. Used by the camera projection / animation pipeline.
 *
 * @module lib/wasm/animation/matrixVector
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Multiply two matrices using WASM if available.
 *
 * @param a - First matrix (n×n, row-major) as Float64Array
 * @param b - Second matrix (n×n, row-major) as Float64Array
 * @param dimension - Matrix dimension (must be > 0)
 * @returns Result matrix as Float64Array, or null if WASM not ready or invalid input
 */
export function multiplyMatricesWasm(
  a: Float64Array,
  b: Float64Array,
  dimension: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 1) {
    return null
  }
  const expectedSize = dimension * dimension
  if (a.length < expectedSize || b.length < expectedSize) {
    return null
  }

  try {
    return module.multiply_matrices_wasm(a, b, dimension)
  } catch (err) {
    logger.warn('[AnimationWASM] multiply_matrices_wasm failed:', err)
    return null
  }
}

/**
 * Compute dot product using WASM if available.
 *
 * @param a - First vector as Float64Array
 * @param b - Second vector as Float64Array
 * @returns Dot product value, or null if WASM not ready
 */
export function dotProductWasm(a: Float64Array, b: Float64Array): number | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }
  if (a.length !== b.length) {
    return null
  }

  try {
    return module.dot_product_wasm(a, b)
  } catch (err) {
    logger.warn('[AnimationWASM] dot_product_wasm failed:', err)
    return null
  }
}

/**
 * Compute magnitude using WASM if available.
 *
 * @param v - Input vector as Float64Array
 * @returns Magnitude value, or null if WASM not ready
 */
export function magnitudeWasm(v: Float64Array): number | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.magnitude_wasm(v)
  } catch (err) {
    logger.warn('[AnimationWASM] magnitude_wasm failed:', err)
    return null
  }
}

/**
 * Normalize vector using WASM if available.
 *
 * @param v - Input vector as Float64Array
 * @returns Normalized vector as Float64Array, or null if WASM not ready
 */
export function normalizeVectorWasm(v: Float64Array): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.normalize_vector_wasm(v)
  } catch (err) {
    logger.warn('[AnimationWASM] normalize_vector_wasm failed:', err)
    return null
  }
}

/**
 * Subtract vectors using WASM if available.
 *
 * @param a - First vector as Float64Array
 * @param b - Second vector as Float64Array
 * @returns Difference vector as Float64Array, or null if WASM not ready
 */
export function subtractVectorsWasm(a: Float64Array, b: Float64Array): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }
  if (a.length !== b.length) {
    return null
  }

  try {
    return module.subtract_vectors_wasm(a, b)
  } catch (err) {
    logger.warn('[AnimationWASM] subtract_vectors_wasm failed:', err)
    return null
  }
}
