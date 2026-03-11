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

// Phase 1: Animation functions

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

// Phase 3: Dirac Clifford algebra functions

/**
 * Generate Dirac gamma matrices mock
 * @param spatial_dim - Number of spatial dimensions
 * @returns Packed gamma matrix data with leading spinor size
 */
export function generate_dirac_matrices_wasm(spatial_dim: number): Float32Array {
  const s = dirac_spinor_size_wasm(spatial_dim)
  const matrixSize = s * s * 2
  const total = 1 + spatial_dim * matrixSize + matrixSize
  const result = new Float32Array(total)
  // Pack spinor size as f32 bits in first element
  const view = new DataView(result.buffer)
  view.setUint32(0, s, true)
  return result
}

/**
 * Dirac spinor size mock
 * @param spatial_dim - Number of spatial dimensions
 * @returns Spinor component count
 */
export function dirac_spinor_size_wasm(spatial_dim: number): number {
  return Math.max(2, 1 << Math.floor((spatial_dim + 1) / 2))
}
