/* tslint:disable */
/* eslint-disable */

/**
 * Complex matrix multiply: C = A × B for N×N matrices.
 *
 * # Arguments
 * * `a_re`, `a_im` - Left matrix (N×N, row-major)
 * * `b_re`, `b_im` - Right matrix (N×N, row-major)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
 */
export function complex_mat_mul_wasm(a_re: Float64Array, a_im: Float64Array, b_re: Float64Array, b_im: Float64Array, n: number): Float64Array;

/**
 * Composes multiple rotations from flattened plane indices and angles.
 *
 * # Arguments
 * * `dimension` - The dimensionality of the space
 * * `plane_indices` - Flattened plane pairs [i0, j0, i1, j1, ...]
 * * `angles` - Rotation angles in radians
 * * `rotation_count` - Number of active rotations in the buffers
 *
 * # Returns
 * Flat rotation matrix (dimension × dimension) as Float64Array
 */
export function compose_rotations_indexed_wasm(dimension: number, plane_indices: Uint32Array, angles: Float64Array, rotation_count: number): Float64Array;

/**
 * Composes multiple rotations from plane names and angles.
 *
 * # Arguments
 * * `dimension` - The dimensionality of the space
 * * `plane_names` - Array of plane names (e.g., ["XY", "XW", "ZW"])
 * * `angles` - Array of rotation angles in radians (same length as plane_names)
 *
 * # Returns
 * Flat rotation matrix (dimension × dimension) as Float64Array
 */
export function compose_rotations_wasm(dimension: number, plane_names: string[], angles: Float64Array): Float64Array;

/**
 * Full Gaussian measurement collapse.
 *
 * Matches `src/lib/physics/measurement.ts::computeFullCollapse`. Returns a
 * packed `Float32Array` of length `2 · total_sites` where the first half is
 * `ψ_re` and the second is `ψ_im` (which is identically zero for a full
 * collapse — included so the JS caller unpacks symmetrically with the
 * partial-collapse ABI).
 *
 * # Arguments
 * * `grid_size` - Per-axis lattice sizes (`Uint32Array`, length = `latticeDim`)
 * * `spacing` - Per-axis spacing (`Float64Array`, length = `latticeDim`)
 * * `center` - Measurement center in world units (length = `latticeDim`)
 * * `sigma` - Gaussian width
 * * `compact_dims` - Optional per-axis periodicity flags (0/1). Pass empty
 *   slice for fully-open boundaries.
 *
 * # Returns
 * Packed `Float32Array`, or empty on shape mismatch.
 */
export function compute_full_collapse_wasm(grid_size: Uint32Array, spacing: Float64Array, center: Float64Array, sigma: number, compact_dims: Uint8Array): Float32Array;

/**
 * Compute the BEC incompressible kinetic-energy spectrum E_incomp(k).
 *
 * Velocity-field finite differences + N-D FFT (via `fft::fft_nd`) +
 * Helmholtz projection + log-spaced shell binning of the Nore/Bradley
 * superfluid decomposition.  All steps run entirely in Rust; the JS
 * caller invokes this single WASM entry point and unpacks the result.
 *
 * # Arguments
 * * `psi_re` / `psi_im` — split wavefunction components (Float32,
 *   length = product(grid_size)).
 * * `grid_size` — per-axis lattice sizes.
 * * `spacing` — per-axis lattice spacing.
 * * `hbar`, `mass` — physical constants.
 *
 * # Returns
 * Packed `Vec<f64>` of length `2 · NUM_SPECTRUM_BINS + 2`:
 *   - `[0..N)` = spectrum (Float32-precision signal, returned as f64)
 *   - `[N..2N)` = k-value bin centers
 *   - `[2N]` = total incompressible kinetic energy
 *   - `[2N+1]` = total compressible kinetic energy
 * Empty vector on invalid input.
 */
export function compute_incompressible_spectrum_wasm(psi_re: Float32Array, psi_im: Float32Array, grid_size: Uint32Array, spacing: Float64Array, hbar: number, mass: number): Float64Array;

/**
 * Compute the joint reduced density matrix for a set of dimensions.
 *
 * # Arguments
 * * `psi_re` - Real part of wavefunction (Float32Array)
 * * `psi_im` - Imaginary part of wavefunction (Float32Array)
 * * `grid_size` - Grid dimensions
 * * `kept_dims` - Indices of dimensions to keep (sorted ascending)
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = Π kept dims`.
 * Empty on invalid input or `M > 1024`.
 */
export function compute_joint_rdm_wasm(psi_re: Float32Array, psi_im: Float32Array, grid_size: Uint32Array, kept_dims: Uint32Array): Float64Array;

/**
 * Compute level spacing statistics from energy eigenvalues.
 *
 * # Arguments
 * * `energies` - Eigenvalue array
 *
 * # Returns
 * Packed `Float64Array`: `[spacings..., brody_beta, mean_spacing, classification_code]`
 * Classification codes: 0 = poisson, 1 = intermediate, 2 = wigner-dyson
 */
export function compute_level_spacing_wasm(energies: Float64Array): Float64Array;

/**
 * Partial axis-aligned measurement collapse.
 *
 * Matches `src/lib/physics/measurement.ts::computePartialCollapse`. Returns
 * packed `[re..., im...]` of length `2 · total_sites`.
 *
 * # Arguments
 * * `psi_re`, `psi_im` - Current wavefunction components (length = `total_sites`)
 * * `grid_size`, `spacing` - Lattice geometry
 * * `axis` - Measured axis index
 * * `axis_position` - Measurement coordinate along `axis`
 * * `sigma` - Gaussian width
 * * `axis_compact` - Non-zero to wrap on the measured axis
 *
 * # Returns
 * Packed `Float32Array`, or empty on shape mismatch / invalid axis.
 */
export function compute_partial_collapse_wasm(psi_re: Float32Array, psi_im: Float32Array, grid_size: Uint32Array, spacing: Float64Array, axis: number, axis_position: number, sigma: number, axis_compact: number): Float32Array;

/**
 * Compute the reduced density matrix for a single dimension by tracing out
 * all other dimensions.
 *
 * # Arguments
 * * `psi_re` - Real part of wavefunction (Float32Array from GPU readback)
 * * `psi_im` - Imaginary part of wavefunction (Float32Array)
 * * `grid_size` - Grid dimensions `[M_0, M_1, ..., M_{N-1}]`
 * * `dim_index` - Which dimension to keep (0-based)
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = grid_size[dim_index]`.
 * Empty on invalid input.
 */
export function compute_rdm_wasm(psi_re: Float32Array, psi_im: Float32Array, grid_size: Uint32Array, dim_index: number): Float64Array;

/**
 * Compute scar correlation between eigenstate density and classical orbits.
 *
 * # Arguments
 * * `density_re` - Eigenstate ψ_re on the lattice (f32 from GPU readback)
 * * `density_im` - Eigenstate ψ_im on the lattice (f32)
 * * `grid_sizes` - Per-dimension grid sizes
 * * `spacings` - Per-dimension lattice spacings (f64)
 * * `orbit_points_flat` - Flattened orbit positions `[x0_d0, x0_d1, ..., x1_d0, ...]` (f64)
 * * `orbit_lengths` - Number of points per orbit
 * * `sigma` - Gaussian tube width ε
 * * `dim` - Number of spatial dimensions
 *
 * # Returns
 * Packed `Float64Array`: `[corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]`
 */
export function compute_scar_correlation_wasm(density_re: Float32Array, density_im: Float32Array, grid_sizes: Uint32Array, spacings: Float64Array, orbit_points_flat: Float64Array, orbit_lengths: Uint32Array, sigma: number, dim: number): Float64Array;

/**
 * Returns the spinor size for a given spatial dimension.
 */
export function dirac_spinor_size_wasm(spatial_dim: number): number;

/**
 * Computes the dot product of two vectors
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The scalar dot product
 */
export function dot_product_wasm(a: Float64Array, b: Float64Array): number;

/**
 * In-place 1D forward FFT on interleaved complex data.
 *
 * Convention: `X[k] = Σ x[n] * exp(-i * 2π * k * n / N)`.
 *
 * # Arguments
 * * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
 * * `n` - Number of complex elements (must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 */
export function fft_1d_wasm(data: Float64Array, n: number): Float64Array;

/**
 * N-dimensional forward FFT on interleaved complex data.
 *
 * Applies 1D forward FFT along each axis sequentially.
 *
 * # Arguments
 * * `data` - Interleaved complex data (length `2 * product(grid_size)`)
 * * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 */
export function fft_nd_wasm(data: Float64Array, grid_size: Uint32Array): Float64Array;

/**
 * Generates Dirac gamma matrices for N spatial dimensions.
 *
 * # Arguments
 * * `spatial_dim` - Number of spatial dimensions (1-11)
 *
 * # Returns
 * Flat f32 buffer containing all matrices packed sequentially:
 *   [spinorSize_as_f32, alpha_1 | alpha_2 | ... | alpha_N | beta]
 * Each matrix is S×S×2 floats (complex, row-major, re/im interleaved).
 */
export function generate_dirac_matrices_wasm(spatial_dim: number): Float32Array;

/**
 * Generate a seeded uniform noise lattice in `[-0.5, 0.5]`.
 *
 * Matches `src/lib/physics/tdse/disorderNoise.ts::generateDisorderNoise`
 * bit-for-bit (mulberry32 PRNG parity).
 *
 * # Arguments
 * * `total_sites` - Length of the output Float32Array
 * * `seed` - Integer seed (wraps to u32 at the boundary)
 *
 * # Returns
 * Float32Array of length `total_sites`.
 */
export function generate_disorder_noise_wasm(total_sites: number, seed: number): Float32Array;

/**
 * Generate an Anderson disorder potential.
 *
 * Matches `src/lib/physics/anderson/disorderPotential.ts` with
 * `distribution_code`: `0 = uniform`, `1 = gaussian`.
 *
 * # Arguments
 * * `total_sites` - Lattice site count (product of grid sizes)
 * * `disorder_strength` - `W` (uniform half-range × 2; Gaussian σ)
 * * `seed` - Integer seed
 * * `distribution_code` - `0` uniform, `1` gaussian
 *
 * # Returns
 * `Float32Array` of length `total_sites`, or empty on invalid distribution.
 */
export function generate_disorder_potential_wasm(total_sites: number, disorder_strength: number, seed: number, distribution_code: number): Float32Array;

/**
 * Hermitian eigendecomposition via Jacobi iteration.
 *
 * # Arguments
 * * `re` - Real part of Hermitian matrix (row-major, n×n)
 * * `im` - Imaginary part of Hermitian matrix (row-major, n×n)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Eigenvalues sorted descending as `Float64Array`
 */
export function hermitian_eigenvalues_wasm(re: Float64Array, im: Float64Array, n: number): Float64Array;

/**
 * In-place 1D inverse FFT with 1/N normalization.
 *
 * Convention: `x[n] = (1/N) Σ X[k] * exp(+i * 2π * k * n / N)`.
 *
 * # Arguments
 * * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
 * * `n` - Number of complex elements (must be a power of 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 */
export function ifft_1d_wasm(data: Float64Array, n: number): Float64Array;

/**
 * N-dimensional inverse FFT on interleaved complex data.
 *
 * Applies 1D inverse FFT along each axis sequentially.
 *
 * # Arguments
 * * `data` - Interleaved complex data (length `2 * product(grid_size)`)
 * * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 */
export function ifft_nd_wasm(data: Float64Array, grid_size: Uint32Array): Float64Array;

/**
 * Computes the magnitude (length) of a vector
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * The magnitude of the vector
 */
export function magnitude_wasm(v: Float64Array): number;

/**
 * Matrix exponential via Padé(13,13) with scaling-and-squaring.
 *
 * Computes exp(A) for an N×N complex matrix stored as separate real/imag arrays.
 *
 * # Arguments
 * * `a_re` - Real part of input matrix (N×N, row-major)
 * * `a_im` - Imaginary part of input matrix (N×N, row-major)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
 */
export function matrix_exponential_pade_wasm(a_re: Float64Array, a_im: Float64Array, n: number): Float64Array;

/**
 * Multiplies two square matrices: C = A × B
 *
 * # Arguments
 * * `a` - First matrix (n×n, row-major)
 * * `b` - Second matrix (n×n, row-major)
 * * `dimension` - Matrix dimension
 *
 * # Returns
 * Result matrix (n×n, row-major)
 */
export function multiply_matrices_wasm(a: Float64Array, b: Float64Array, dimension: number): Float64Array;

/**
 * Multiplies a matrix by a vector.
 *
 * # Arguments
 * * `matrix` - Flat n×n matrix (row-major)
 * * `vector` - Input vector of length n
 * * `dimension` - Matrix/vector dimension
 *
 * # Returns
 * Result vector of length n
 */
export function multiply_matrix_vector_wasm(matrix: Float64Array, vector: Float64Array, dimension: number): Float64Array;

/**
 * Normalizes a vector to unit length
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * Unit vector in the same direction
 */
export function normalize_vector_wasm(v: Float64Array): Float64Array;

/**
 * Projects n-dimensional vertices to 3D positions using perspective projection.
 *
 * # Arguments
 * * `flat_vertices` - Flat array of vertex coordinates
 * * `dimension` - Dimensionality of each vertex
 * * `projection_distance` - Distance from projection plane
 *
 * # Returns
 * Flat array of 3D positions as Float32Array [x0, y0, z0, x1, y1, z1, ...]
 */
export function project_vertices_wasm(flat_vertices: Float64Array, dimension: number, projection_distance: number): Float32Array;

/**
 * Initializes the WASM module: installs the panic hook for readable error
 * messages in the browser console.
 */
export function start(): void;

/**
 * Subtracts two vectors element-wise: c = a - b
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The difference vector
 */
export function subtract_vectors_wasm(a: Float64Array, b: Float64Array): Float64Array;

/**
 * Von Neumann entropy from eigenvalues: S = -Σ λ_k ln(λ_k).
 *
 * # Arguments
 * * `eigenvalues` - Eigenvalues of a density matrix
 *
 * # Returns
 * Entropy value (natural log, nats), clamped to >= 0
 */
export function von_neumann_entropy_wasm(eigenvalues: Float64Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly complex_mat_mul_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
  readonly compose_rotations_indexed_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly compose_rotations_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly compute_full_collapse_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
  readonly compute_incompressible_spectrum_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
  readonly compute_joint_rdm_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly compute_level_spacing_wasm: (a: number, b: number, c: number) => void;
  readonly compute_partial_collapse_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
  readonly compute_rdm_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly compute_scar_correlation_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
  readonly dirac_spinor_size_wasm: (a: number) => number;
  readonly dot_product_wasm: (a: number, b: number, c: number, d: number) => number;
  readonly fft_1d_wasm: (a: number, b: number, c: number, d: number) => void;
  readonly fft_nd_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly generate_dirac_matrices_wasm: (a: number, b: number) => void;
  readonly generate_disorder_noise_wasm: (a: number, b: number, c: number) => void;
  readonly generate_disorder_potential_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly hermitian_eigenvalues_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly ifft_1d_wasm: (a: number, b: number, c: number, d: number) => void;
  readonly ifft_nd_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly magnitude_wasm: (a: number, b: number) => number;
  readonly matrix_exponential_pade_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly multiply_matrices_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly multiply_matrix_vector_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly normalize_vector_wasm: (a: number, b: number, c: number) => void;
  readonly project_vertices_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly subtract_vectors_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly von_neumann_entropy_wasm: (a: number, b: number) => number;
  readonly start: () => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
