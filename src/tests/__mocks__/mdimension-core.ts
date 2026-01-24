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

// Geometry worker functions (matching lib.rs exports)

/**
 * Mock for generate_wythoff_wasm - takes config object, returns polytope result
 * @param _config - Configuration object
 * @returns Mock polytope result
 */
export function generate_wythoff_wasm(_config: Record<string, unknown>): {
  vertices: number[]
  edges: number[]
  faces: number[]
  dimension: number
  warnings: string[]
} {
  return { vertices: [], edges: [], faces: [], dimension: 0, warnings: [] }
}

/**
 * Mock for generate_root_system_wasm - generates root system with vertices and edges
 * @param _root_type - Root system type
 * @param _dimension - Dimension
 * @param _scale - Scale factor
 * @returns Mock root system result
 */
export function generate_root_system_wasm(
  _root_type: string,
  _dimension: number,
  _scale: number
): {
  vertices: number[]
  edges: number[]
  dimension: number
  vertex_count: number
  edge_count: number
} {
  return { vertices: [], edges: [], dimension: 0, vertex_count: 0, edge_count: 0 }
}

/**
 * Mock for detect_faces_wasm - detects faces using specified method
 * @param _flat_vertices - Flat vertex array
 * @param _flat_edges - Flat edge array
 * @param _dimension - Dimension
 * @param _method - Detection method
 * @returns Empty array
 */
export function detect_faces_wasm(
  _flat_vertices: Float64Array,
  _flat_edges: Uint32Array,
  _dimension: number,
  _method: string
): Uint32Array {
  return new Uint32Array(0)
}

/**
 * Mock for compute_convex_hull_wasm - computes convex hull of points
 * @param _flat_vertices - Flat vertex array
 * @param _dimension - Dimension
 * @returns Empty array
 */
export function compute_convex_hull_wasm(
  _flat_vertices: Float64Array,
  _dimension: number
): Uint32Array {
  return new Uint32Array(0)
}

/**
 * Mock for build_knn_edges_wasm - builds k-nearest-neighbor edges
 * @param _flat_points - Flat point array
 * @param _dimension - Dimension
 * @param _k - Number of neighbors
 * @returns Empty array
 */
export function build_knn_edges_wasm(
  _flat_points: Float64Array,
  _dimension: number,
  _k: number
): Uint32Array {
  return new Uint32Array(0)
}

/**
 * Mock for build_short_edges_wasm - builds edges at minimum distance
 * @param _flat_vertices - Flat vertex array
 * @param _dimension - Dimension
 * @param _epsilon_factor - Epsilon factor
 * @returns Empty array
 */
export function build_short_edges_wasm(
  _flat_vertices: Float64Array,
  _dimension: number,
  _epsilon_factor: number
): Uint32Array {
  return new Uint32Array(0)
}
