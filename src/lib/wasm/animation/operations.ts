/**
 * Phase 1 — Animation hot-path WASM operations.
 *
 * Wraps the rotation-composition and matrix×vector kernels used by the
 * 60 FPS animation loop. Bound checks are intentionally redundant with
 * the Rust-side guards: the JS-side null returns let the caller fall
 * back to the equivalent JS implementation without round-tripping
 * through a WASM exception.
 *
 * @module lib/wasm/animation/operations
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Compose multiple rotations using index pairs and preallocated typed arrays.
 * Falls back to null if the indexed ABI is unavailable.
 *
 * @param dimension - The dimensionality of the space (must be >= 2)
 * @param planeIndices - Flattened plane index pairs [i0, j0, i1, j1, ...]
 * @param angles - Rotation angles in radians (pooled buffer)
 * @param rotationCount - Number of active rotations inside the provided buffers
 * @returns Flat rotation matrix as Float64Array, or null if WASM not ready/invalid/unavailable
 */
export function composeRotationsIndexedWasm(
  dimension: number,
  planeIndices: Uint32Array,
  angles: Float64Array,
  rotationCount: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 2) {
    return null
  }
  if (!Number.isInteger(rotationCount) || rotationCount < 0) {
    return null
  }
  if (planeIndices.length < rotationCount * 2 || angles.length < rotationCount) {
    return null
  }

  const indexedFn = module.compose_rotations_indexed_wasm
  if (typeof indexedFn !== 'function') {
    return null
  }

  try {
    return indexedFn(dimension, planeIndices, angles, rotationCount)
  } catch (err) {
    logger.warn('[AnimationWASM] compose_rotations_indexed_wasm failed:', err)
    return null
  }
}

/**
 * Multiply matrix by vector using WASM if available.
 *
 * @param matrix - Flat n×n matrix (row-major) as Float64Array
 * @param vector - Input vector as Float64Array
 * @param dimension - Matrix/vector dimension (must be > 0)
 * @returns Result vector as Float64Array, or null if WASM not ready or invalid input
 */
export function multiplyMatrixVectorWasm(
  matrix: Float64Array,
  vector: Float64Array,
  dimension: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 1) {
    return null
  }
  if (matrix.length < dimension * dimension) {
    return null
  }
  if (vector.length < dimension) {
    return null
  }

  try {
    return module.multiply_matrix_vector_wasm(matrix, vector, dimension)
  } catch (err) {
    logger.warn('[AnimationWASM] multiply_matrix_vector_wasm failed:', err)
    return null
  }
}
