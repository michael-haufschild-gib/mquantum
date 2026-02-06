/**
 * WASM Animation Service
 *
 * Provides high-performance WASM functions for the animation loop.
 * Initializes asynchronously and falls back to JS implementations
 * if WASM is not yet ready.
 *
 * Functions:
 * - composeRotationsWasm: Compose rotation matrices from plane names and angles
 * - projectVerticesWasm: Project nD vertices to 3D positions
 * - projectEdgesWasm: Project nD edges to 3D positions
 * - multiplyMatrixVectorWasm: Matrix-vector multiplication
 * - multiplyMatricesWasm: Matrix-matrix multiplication
 * - dotProductWasm: Vector dot product
 * - magnitudeWasm: Vector magnitude
 * - normalizeVectorWasm: Normalize vector to unit length
 * - subtractVectorsWasm: Vector subtraction
 */

import type { MatrixND, VectorND } from '@/lib/math/types'

// WASM module types
interface WasmModule {
  // Phase 1: Animation operations
  compose_rotations_wasm: (
    dimension: number,
    plane_names: string[],
    angles: Float64Array | number[]
  ) => Float64Array
  project_vertices_wasm: (
    flat_vertices: Float64Array,
    dimension: number,
    projection_distance: number
  ) => Float32Array
  project_edges_wasm: (
    flat_vertices: Float64Array,
    dimension: number,
    flat_edges: Uint32Array,
    projection_distance: number
  ) => Float32Array
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
    // Skip WASM loading in test environment
    if (import.meta.env.MODE === 'test' || import.meta.env.SSR) {
      return
    }

    try {
      // Dynamic import - the module path must be a literal for Vite's analysis
      const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')

      await wasm.default()
      wasm.start()

      // Store the module for synchronous access
      wasmModule = wasm as unknown as WasmModule
      wasmReady = true

      if (import.meta.env.DEV) {
        console.log('[AnimationWASM] Initialized successfully')
      }
    } catch (err) {
      const wasmError = err instanceof Error ? err : new Error(String(err))
      if (import.meta.env.DEV) {
        console.warn('[AnimationWASM] Initialization failed, using JS fallback:', wasmError.message)
      }
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
 * Compose multiple rotations using WASM if available.
 * Falls back to null if WASM is not ready (caller should use JS fallback).
 *
 * @param dimension - The dimensionality of the space (must be >= 2)
 * @param planeNames - Array of plane names (e.g., ["XY", "XW", "ZW"])
 * @param angles - Array of rotation angles in radians (must match planeNames length)
 * @returns Flat rotation matrix as Float64Array, or null if WASM not ready or invalid input
 */
export function composeRotationsWasm(
  dimension: number,
  planeNames: string[],
  angles: number[]
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  // Input validation
  if (!Number.isInteger(dimension) || dimension < 2) {
    return null
  }
  if (planeNames.length !== angles.length) {
    return null
  }
  if (!angles.every(Number.isFinite)) {
    return null
  }

  try {
    return wasmModule.compose_rotations_wasm(dimension, planeNames, angles)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] compose_rotations_wasm failed:', err)
    }
    return null
  }
}

/**
 * Project nD vertices to 3D using WASM if available.
 *
 * @param flatVertices - Flat array of vertex coordinates
 * @param dimension - Dimensionality of each vertex (must be >= 3)
 * @param projectionDistance - Distance from projection plane (must be positive)
 * @returns Float32Array of 3D positions, or null if WASM not ready or invalid input
 */
export function projectVerticesWasm(
  flatVertices: Float64Array,
  dimension: number,
  projectionDistance: number
): Float32Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  // Input validation
  if (!Number.isInteger(dimension) || dimension < 3) {
    return null
  }
  if (flatVertices.length === 0 || flatVertices.length % dimension !== 0) {
    return null
  }
  if (!Number.isFinite(projectionDistance) || projectionDistance <= 0) {
    return null
  }

  try {
    return wasmModule.project_vertices_wasm(flatVertices, dimension, projectionDistance)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] project_vertices_wasm failed:', err)
    }
    return null
  }
}

/**
 * Project edge pairs to 3D positions using WASM if available.
 *
 * @param flatVertices - Flat array of vertex coordinates
 * @param dimension - Dimensionality of each vertex (must be >= 3)
 * @param flatEdges - Flat array of edge indices [start0, end0, start1, end1, ...]
 * @param projectionDistance - Distance from projection plane (must be positive)
 * @returns Float32Array of edge positions, or null if WASM not ready or invalid input
 */
export function projectEdgesWasm(
  flatVertices: Float64Array,
  dimension: number,
  flatEdges: Uint32Array,
  projectionDistance: number
): Float32Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  // Input validation
  if (!Number.isInteger(dimension) || dimension < 3) {
    return null
  }
  if (flatVertices.length === 0 || flatVertices.length % dimension !== 0) {
    return null
  }
  if (flatEdges.length === 0 || flatEdges.length % 2 !== 0) {
    return null
  }
  if (!Number.isFinite(projectionDistance) || projectionDistance <= 0) {
    return null
  }

  try {
    return wasmModule.project_edges_wasm(flatVertices, dimension, flatEdges, projectionDistance)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] project_edges_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] multiply_matrix_vector_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] multiply_matrices_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] dot_product_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] magnitude_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] normalize_vector_wasm failed:', err)
    }
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
    if (import.meta.env.DEV) {
      console.warn('[AnimationWASM] subtract_vectors_wasm failed:', err)
    }
    return null
  }
}

// ============================================================================
// Helper Functions for Data Conversion
// ============================================================================

// OPT-WASM-1: Pool Float64Array instances to avoid per-call allocations
// Key: size, Value: pooled array (simple single-item pool per size)
const float64Pool = new Map<number, Float64Array>()
const uint32Pool = new Map<number, Uint32Array>()

/** Maximum pooled buffer size (64KB of float64s = 8KB) */
const MAX_POOL_SIZE = 8192

/**
 * Get or create a pooled Float64Array of the requested size.
 * The returned array may contain stale data - caller must fill it.
 * @param size - Requested array size
 * @returns Float64Array of the requested size
 */
function getPooledFloat64(size: number): Float64Array {
  if (size > MAX_POOL_SIZE) {
    return new Float64Array(size)
  }
  const pooled = float64Pool.get(size)
  if (pooled) {
    return pooled
  }
  const fresh = new Float64Array(size)
  float64Pool.set(size, fresh)
  return fresh
}

/**
 * Get or create a pooled Uint32Array of the requested size.
 * @param size - Requested array size
 * @returns Uint32Array of the requested size
 */
function getPooledUint32(size: number): Uint32Array {
  if (size > MAX_POOL_SIZE) {
    return new Uint32Array(size)
  }
  const pooled = uint32Pool.get(size)
  if (pooled) {
    return pooled
  }
  const fresh = new Uint32Array(size)
  uint32Pool.set(size, fresh)
  return fresh
}

/**
 * Convert a MatrixND (Float32Array) to Float64Array for WASM input.
 * @param matrix - Input matrix as Float32Array
 * @returns Matrix as Float64Array
 */
export function matrixToFloat64(matrix: MatrixND): Float64Array {
  return new Float64Array(matrix)
}

/**
 * Convert a VectorND (number[]) to Float64Array for WASM input.
 * @param vector - Input vector as number[]
 * @returns Vector as Float64Array
 */
export function vectorToFloat64(vector: VectorND): Float64Array {
  return new Float64Array(vector)
}

/**
 * Convert Float64Array result back to VectorND (number[]).
 * @param vector - Input vector as Float64Array
 * @returns Vector as number[]
 */
export function float64ToVector(vector: Float64Array): VectorND {
  return Array.from(vector)
}

/**
 * Flatten 2D vertices array to Float64Array.
 * OPT-WASM-1: Uses pooled arrays to avoid per-call allocations.
 * @param vertices - Array of vertex arrays
 * @returns Flat Float64Array (may be pooled - do not store reference long-term)
 */
export function flattenVertices(vertices: VectorND[]): Float64Array {
  if (vertices.length === 0) return new Float64Array(0)
  const dimension = vertices[0]!.length
  const size = vertices.length * dimension
  const flat = getPooledFloat64(size)
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!
    const offset = i * dimension
    for (let j = 0; j < dimension; j++) {
      flat[offset + j] = v[j]!
    }
  }
  return flat
}

/**
 * Flatten edge pairs to Uint32Array.
 * OPT-WASM-1: Uses pooled arrays to avoid per-call allocations.
 * @param edges - Array of edge pairs
 * @returns Flat Uint32Array (may be pooled - do not store reference long-term)
 */
export function flattenEdges(edges: [number, number][]): Uint32Array {
  const size = edges.length * 2
  const flat = getPooledUint32(size)
  for (let i = 0; i < edges.length; i++) {
    flat[i * 2] = edges[i]![0]
    flat[i * 2 + 1] = edges[i]![1]
  }
  return flat
}
