/**
 * Mock for mdimension-core WASM module
 * Used in test environment to avoid WASM loading issues
 */

// Mock initialization function (returns a resolved promise)
/**
 * Initialize WASM mock
 * @returns Resolved promise
 */
export default function init(): Promise<void> {
  return Promise.resolve()
}

// Mock start function
/**
 * Start mock (no-op)
 */
export function start(): void {
  // no-op in tests
}

// Phase 1: Animation functions
/**
 * Compose rotation matrices mock
 * @param _dimension - Dimension
 * @param _plane_names - Plane names
 * @param _angles - Rotation angles
 * @returns Identity matrix
 */
export function compose_rotations_wasm(
  _dimension: number,
  _plane_names: string[],
  _angles: number[]
): Float64Array {
  // Return identity matrix for 4D case (most common)
  return new Float64Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0))
}

/**
 * Compose rotation matrices from index pairs mock
 * @param _dimension - Dimension
 * @param _plane_indices - Flattened index pairs
 * @param _angles - Rotation angles
 * @param _rotation_count - Number of active rotations
 * @returns Identity matrix
 */
export function compose_rotations_indexed_wasm(
  _dimension: number,
  _plane_indices: Uint32Array,
  _angles: Float64Array,
  _rotation_count: number
): Float64Array {
  // Return identity matrix for 4D case (most common)
  return new Float64Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0))
}

/**
 * Project vertices mock
 * @param _flat_vertices - Flat vertex array
 * @param _dimension - Dimension
 * @param _projection_distance - Projection distance
 * @returns Empty array
 */
export function project_vertices_wasm(
  _flat_vertices: Float64Array,
  _dimension: number,
  _projection_distance: number
): Float32Array {
  return new Float32Array(0)
}

/**
 * Project edges mock
 * @param _flat_vertices - Flat vertex array
 * @param _dimension - Dimension
 * @param _flat_edges - Flat edge array
 * @param _projection_distance - Projection distance
 * @returns Empty array
 */
export function project_edges_wasm(
  _flat_vertices: Float64Array,
  _dimension: number,
  _flat_edges: Uint32Array,
  _projection_distance: number
): Float32Array {
  return new Float32Array(0)
}

/**
 * Multiply matrix by vector mock
 * @param _matrix - Input matrix
 * @param _vector - Input vector
 * @param _dimension - Dimension
 * @returns Empty array
 */
export function multiply_matrix_vector_wasm(
  _matrix: Float64Array,
  _vector: Float64Array,
  _dimension: number
): Float64Array {
  return new Float64Array(0)
}

// Phase 2: Matrix and vector functions
/**
 * Multiply matrices mock
 * @param _a - First matrix
 * @param _b - Second matrix
 * @param _dimension - Dimension
 * @returns Empty array
 */
export function multiply_matrices_wasm(
  _a: Float64Array,
  _b: Float64Array,
  _dimension: number
): Float64Array {
  return new Float64Array(0)
}

/**
 * Dot product mock
 * @param _a - First vector
 * @param _b - Second vector
 * @returns Zero
 */
export function dot_product_wasm(_a: Float64Array, _b: Float64Array): number {
  return 0
}

/**
 * Magnitude mock
 * @param _v - Input vector
 * @returns Zero
 */
export function magnitude_wasm(_v: Float64Array): number {
  return 0
}

/**
 * Normalize vector mock
 * @param _v - Input vector
 * @returns Empty array
 */
export function normalize_vector_wasm(_v: Float64Array): Float64Array {
  return new Float64Array(0)
}

/**
 * Subtract vectors mock
 * @param _a - First vector
 * @param _b - Second vector
 * @returns Empty array
 */
export function subtract_vectors_wasm(_a: Float64Array, _b: Float64Array): Float64Array {
  return new Float64Array(0)
}
