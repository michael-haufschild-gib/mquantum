/**
 * Type interface for the dynamically-loaded `mdimension_core` WASM module.
 *
 * The module is initialized lazily by {@link ../runtime#initAnimationWasm} and
 * accessed only through the per-phase wrappers in this directory. Optional
 * (`?:`) properties guard against partial WASM builds where a binding may
 * not have been compiled in (validator vs. release builds, future
 * additions). Every wrapper inspects the `typeof fn_ === 'function'` shape
 * before invoking the binding so that absence is treated as "not
 * available" rather than a runtime crash.
 *
 * Phase numbering reflects the historical rollout order documented in the
 * Rust crate; it has no functional meaning beyond grouping related
 * bindings.
 *
 * @module lib/wasm/animation/types
 */
export interface WasmModule {
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
  // Phase 4: FFT operations
  fft_1d_wasm: (data: Float64Array, n: number) => Float64Array
  ifft_1d_wasm: (data: Float64Array, n: number) => Float64Array
  fft_nd_wasm: (data: Float64Array, grid_size: Uint32Array) => Float64Array
  ifft_nd_wasm: (data: Float64Array, grid_size: Uint32Array) => Float64Array
  // Phase 5: Coordinate entanglement operations
  compute_rdm_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    dim_index: number
  ) => Float64Array
  compute_joint_rdm_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    kept_dims: Uint32Array
  ) => Float64Array
  hermitian_eigenvalues_wasm?: (re: Float64Array, im: Float64Array, n: number) => Float64Array
  von_neumann_entropy_wasm?: (eigenvalues: Float64Array) => number
  // Phase 6: Complex matrix exponential operations
  matrix_exponential_pade_wasm?: (a_re: Float64Array, a_im: Float64Array, n: number) => Float64Array
  complex_mat_mul_wasm?: (
    a_re: Float64Array,
    a_im: Float64Array,
    b_re: Float64Array,
    b_im: Float64Array,
    n: number
  ) => Float64Array
  // Phase 7: TDSE diagnostics operations
  compute_scar_correlation_wasm?: (
    density_re: Float32Array,
    density_im: Float32Array,
    grid_sizes: Uint32Array,
    spacings: Float64Array,
    orbit_points_flat: Float64Array,
    orbit_lengths: Uint32Array,
    sigma: number,
    dim: number
  ) => Float64Array
  compute_level_spacing_wasm?: (energies: Float64Array) => Float64Array
  // BEC: incompressible kinetic-energy spectrum residual math (velocity field
  // + Helmholtz projection + log-spaced shell binning). Returns a packed
  // Float64Array of length `2·NUM_SPECTRUM_BINS + 2` = 66.
  compute_incompressible_spectrum_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    spacing: Float64Array,
    hbar: number,
    mass: number
  ) => Float64Array
  // Phase 8: Init-loop kernels
  generate_disorder_noise_wasm?: (total_sites: number, seed: number) => Float32Array
  generate_disorder_potential_wasm?: (
    total_sites: number,
    disorder_strength: number,
    seed: number,
    distribution_code: number
  ) => Float32Array
  compute_full_collapse_wasm?: (
    grid_size: Uint32Array,
    spacing: Float64Array,
    center: Float64Array,
    sigma: number,
    compact_dims: Uint8Array
  ) => Float32Array
  compute_partial_collapse_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    spacing: Float64Array,
    axis: number,
    axis_position: number,
    sigma: number,
    axis_compact: number
  ) => Float32Array
}
