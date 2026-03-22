/**
 * WASM Animation Service
 *
 * Provides high-performance WASM functions for the animation loop.
 * Initializes asynchronously and falls back to JS implementations
 * if WASM is not yet ready.
 *
 * Functions:
 * - composeRotationsIndexedWasm: Compose rotation matrices from precomputed axis index pairs
 * - multiplyMatrixVectorWasm: Matrix-vector multiplication
 * - multiplyMatricesWasm: Matrix-matrix multiplication
 * - dotProductWasm: Vector dot product
 * - magnitudeWasm: Vector magnitude
 * - normalizeVectorWasm: Normalize vector to unit length
 * - subtractVectorsWasm: Vector subtraction
 */

import { logger } from '@/lib/logger'
import type { VectorND } from '@/lib/math/types'

// WASM module types
interface WasmModule {
  // Phase 1: Animation operations
  compose_rotations_indexed_wasm?: (
    dimension: number,
    plane_indices: Uint32Array,
    angles: Float64Array,
    rotation_count: number
  ) => Float64Array
  multiply_matrix_vector_wasm: (
    matrix: Float64Array,
    vector: Float64Array,
    dimension: number
  ) => Float64Array
  // Phase 2: Matrix and vector operations
  multiply_matrices_wasm: (a: Float64Array, b: Float64Array, dimension: number) => Float64Array
  dot_product_wasm: (a: Float64Array, b: Float64Array) => number
  magnitude_wasm: (v: Float64Array) => number
  normalize_vector_wasm: (v: Float64Array) => Float64Array
  subtract_vectors_wasm: (a: Float64Array, b: Float64Array) => Float64Array
}

// ============================================================================
// WASM Service State
// ============================================================================

let wasmModule: WasmModule | null = null
let wasmInitPromise: Promise<void> | null = null
let wasmReady = false

/**
 * Initialize the WASM module for animation operations.
 * Call this once at app startup to enable WASM acceleration.
 * Safe to call multiple times - subsequent calls are no-ops.
 *
 * @returns Promise that resolves when WASM is ready
 */
export async function initAnimationWasm(): Promise<void> {
  // Already initialized
  if (wasmReady) {
    return
  }

  // Already initializing
  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Skip WASM loading in test or non-browser environments
    if (import.meta.env.MODE === 'test' || typeof window === 'undefined') {
      return
    }

    try {
      // Dynamic import - the module path must be a literal for Vite's analysis
      const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')

      await wasm.default()

      // Store the module for synchronous access
      wasmModule = wasm as unknown as WasmModule
      wasmReady = true

      logger.log('[AnimationWASM] Initialized successfully')
    } catch (err) {
      const wasmError = err instanceof Error ? err : new Error(String(err))
      logger.warn('[AnimationWASM] Initialization failed, using JS fallback:', wasmError.message)
    }
  })()

  return wasmInitPromise
}

/**
 * Check if WASM is ready for use.
 * @returns true if WASM is initialized and ready
 */
export function isAnimationWasmReady(): boolean {
  return wasmReady
}

// ============================================================================
// WASM-Accelerated Functions
// ============================================================================

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
  if (!wasmReady || !wasmModule) {
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

  const indexedFn = wasmModule.compose_rotations_indexed_wasm
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
  if (!wasmReady || !wasmModule) {
    return null
  }

  // Input validation
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
    return wasmModule.multiply_matrix_vector_wasm(matrix, vector, dimension)
  } catch (err) {
    logger.warn('[AnimationWASM] multiply_matrix_vector_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 2: Matrix and Vector WASM Functions
// ============================================================================

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
  if (!wasmReady || !wasmModule) {
    return null
  }

  // Input validation
  if (!Number.isInteger(dimension) || dimension < 1) {
    return null
  }
  const expectedSize = dimension * dimension
  if (a.length < expectedSize || b.length < expectedSize) {
    return null
  }

  try {
    return wasmModule.multiply_matrices_wasm(a, b, dimension)
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
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.dot_product_wasm(a, b)
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
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.magnitude_wasm(v)
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
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.normalize_vector_wasm(v)
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
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.subtract_vectors_wasm(a, b)
  } catch (err) {
    logger.warn('[AnimationWASM] subtract_vectors_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Helper Functions for Data Conversion
// ============================================================================

/**
 * Convert Float64Array result back to VectorND (number[]).
 * @param vector - Input vector as Float64Array
 * @returns Vector as number[]
 */
export function float64ToVector(vector: Float64Array): VectorND {
  return Array.from(vector)
}
