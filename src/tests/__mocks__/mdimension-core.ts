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

// Phase 5: Coordinate entanglement functions

/**
 * Compute reduced density matrix mock
 * @param _psi_re - Real part of wavefunction
 * @param _psi_im - Imaginary part of wavefunction
 * @param _grid_size - Grid dimensions
 * @param _dim_index - Dimension to keep
 * @returns Empty array
 */
export function compute_rdm_wasm(
  _psi_re: Float32Array,
  _psi_im: Float32Array,
  _grid_size: Uint32Array,
  _dim_index: number
): Float64Array {
  return new Float64Array(0)
}

/**
 * Compute joint reduced density matrix mock
 * @param _psi_re - Real part of wavefunction
 * @param _psi_im - Imaginary part of wavefunction
 * @param _grid_size - Grid dimensions
 * @param _kept_dims - Dimensions to keep
 * @returns Empty array
 */
export function compute_joint_rdm_wasm(
  _psi_re: Float32Array,
  _psi_im: Float32Array,
  _grid_size: Uint32Array,
  _kept_dims: Uint32Array
): Float64Array {
  return new Float64Array(0)
}

/**
 * Hermitian eigendecomposition mock
 * @param _re - Real part of matrix
 * @param _im - Imaginary part of matrix
 * @param _n - Matrix dimension
 * @returns Empty array
 */
export function hermitian_eigenvalues_wasm(
  _re: Float64Array,
  _im: Float64Array,
  _n: number
): Float64Array {
  return new Float64Array(0)
}

/**
 * Von Neumann entropy mock
 * @param _eigenvalues - Eigenvalues
 * @returns Zero
 */
export function von_neumann_entropy_wasm(_eigenvalues: Float64Array): number {
  return 0
}

// Phase 6: Complex matrix exponential functions

/**
 * Matrix exponential via Padé(13,13) mock
 * @param _a_re - Real part of input matrix
 * @param _a_im - Imaginary part of input matrix
 * @param _n - Matrix dimension
 * @returns Empty array
 */
export function matrix_exponential_pade_wasm(
  _a_re: Float64Array,
  _a_im: Float64Array,
  _n: number
): Float64Array {
  return new Float64Array(0)
}

/**
 * Complex matrix multiply mock
 * @param _a_re - Real part of left matrix
 * @param _a_im - Imaginary part of left matrix
 * @param _b_re - Real part of right matrix
 * @param _b_im - Imaginary part of right matrix
 * @param _n - Matrix dimension
 * @returns Empty array
 */
export function complex_mat_mul_wasm(
  _a_re: Float64Array,
  _a_im: Float64Array,
  _b_re: Float64Array,
  _b_im: Float64Array,
  _n: number
): Float64Array {
  return new Float64Array(0)
}

// Phase 7: TDSE diagnostics functions

/**
 * Scar correlation mock
 * @param _density_re - Real part of wavefunction density
 * @param _density_im - Imaginary part of wavefunction density
 * @param _grid_sizes - Grid dimensions
 * @param _spacings - Lattice spacings
 * @param _orbit_points_flat - Flattened orbit positions
 * @param _orbit_lengths - Points per orbit
 * @param _sigma - Gaussian tube width
 * @param _dim - Number of spatial dimensions
 * @returns Empty array
 */
export function compute_scar_correlation_wasm(
  _density_re: Float32Array,
  _density_im: Float32Array,
  _grid_sizes: Uint32Array,
  _spacings: Float64Array,
  _orbit_points_flat: Float64Array,
  _orbit_lengths: Uint32Array,
  _sigma: number,
  _dim: number
): Float64Array {
  return new Float64Array(0)
}

/**
 * Level spacing mock
 * @param _energies - Eigenvalue array
 * @returns Empty array
 */
export function compute_level_spacing_wasm(_energies: Float64Array): Float64Array {
  return new Float64Array(0)
}

// Phase 8: Init-loop kernels — tests force the TS fallback by not loading WASM
// (MODE === 'test' short-circuits `initAnimationWasm`), so these mocks are only
// reached when production code imports the module directly. Empty-returns
// trigger the null path in the bridge, which in turn triggers the TS fallback.

/**
 * Disorder noise mock
 * @param _total_sites - Number of lattice sites
 * @param _seed - Integer seed
 * @returns Empty array
 */
export function generate_disorder_noise_wasm(_total_sites: number, _seed: number): Float32Array {
  return new Float32Array(0)
}

/**
 * Disorder potential mock
 * @param _total_sites - Number of lattice sites
 * @param _disorder_strength - Disorder width W
 * @param _seed - Integer seed
 * @param _distribution_code - 0 = uniform, 1 = gaussian
 * @returns Empty array
 */
export function generate_disorder_potential_wasm(
  _total_sites: number,
  _disorder_strength: number,
  _seed: number,
  _distribution_code: number
): Float32Array {
  return new Float32Array(0)
}

/**
 * Full collapse mock
 * @param _grid_size - Per-axis lattice sizes
 * @param _spacing - Per-axis spacing
 * @param _center - Measurement center
 * @param _sigma - Gaussian width
 * @param _compact_dims - Per-axis periodicity flags
 * @returns Empty array
 */
export function compute_full_collapse_wasm(
  _grid_size: Uint32Array,
  _spacing: Float64Array,
  _center: Float64Array,
  _sigma: number,
  _compact_dims: Uint8Array
): Float32Array {
  return new Float32Array(0)
}

/**
 * Partial collapse mock
 * @param _psi_re - Real part of wavefunction
 * @param _psi_im - Imaginary part of wavefunction
 * @param _grid_size - Per-axis lattice sizes
 * @param _spacing - Per-axis spacing
 * @param _axis - Measured axis index
 * @param _axis_position - Measurement coordinate
 * @param _sigma - Gaussian width
 * @param _axis_compact - Periodicity flag for measured axis
 * @returns Empty array
 */
export function compute_partial_collapse_wasm(
  _psi_re: Float32Array,
  _psi_im: Float32Array,
  _grid_size: Uint32Array,
  _spacing: Float64Array,
  _axis: number,
  _axis_position: number,
  _sigma: number,
  _axis_compact: number
): Float32Array {
  return new Float32Array(0)
}
