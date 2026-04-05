//! WASM core module for mdimension — provides N-dimensional rotation composition,
//! vertex projection, and linear algebra operations for real-time animation.

use wasm_bindgen::prelude::*;

// Import the `window.console.log` function from the Web.
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

/// Initializes the WASM module: installs the panic hook for readable error
/// messages in the browser console.
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    log("WASM Module Initialized (with panic hook)");
}

mod animation;
mod clifford;
mod complex_matrix;
mod entanglement;
mod fft;
mod tdse_diagnostics;

// ============================================================================
// Animation Operations (Hot Path - 60 FPS)
// ============================================================================

/// Composes multiple rotations from plane names and angles.
///
/// # Arguments
/// * `dimension` - The dimensionality of the space
/// * `plane_names` - Array of plane names (e.g., ["XY", "XW", "ZW"])
/// * `angles` - Array of rotation angles in radians (same length as plane_names)
///
/// # Returns
/// Flat rotation matrix (dimension × dimension) as Float64Array
#[wasm_bindgen]
pub fn compose_rotations_wasm(
    dimension: usize,
    plane_names: Vec<String>,
    angles: Vec<f64>,
) -> Vec<f64> {
    animation::compose_rotations(dimension, &plane_names, &angles)
}

/// Composes multiple rotations from flattened plane indices and angles.
///
/// # Arguments
/// * `dimension` - The dimensionality of the space
/// * `plane_indices` - Flattened plane pairs [i0, j0, i1, j1, ...]
/// * `angles` - Rotation angles in radians
/// * `rotation_count` - Number of active rotations in the buffers
///
/// # Returns
/// Flat rotation matrix (dimension × dimension) as Float64Array
#[wasm_bindgen]
pub fn compose_rotations_indexed_wasm(
    dimension: usize,
    plane_indices: &[u32],
    angles: &[f64],
    rotation_count: usize,
) -> Vec<f64> {
    animation::compose_rotations_indexed(dimension, plane_indices, angles, rotation_count)
}

/// Projects n-dimensional vertices to 3D positions using perspective projection.
///
/// # Arguments
/// * `flat_vertices` - Flat array of vertex coordinates
/// * `dimension` - Dimensionality of each vertex
/// * `projection_distance` - Distance from projection plane
///
/// # Returns
/// Flat array of 3D positions as Float32Array [x0, y0, z0, x1, y1, z1, ...]
#[wasm_bindgen]
pub fn project_vertices_wasm(
    flat_vertices: &[f64],
    dimension: usize,
    projection_distance: f64,
) -> Vec<f32> {
    animation::project_vertices_to_positions(flat_vertices, dimension, projection_distance)
}

/// Multiplies a matrix by a vector.
///
/// # Arguments
/// * `matrix` - Flat n×n matrix (row-major)
/// * `vector` - Input vector of length n
/// * `dimension` - Matrix/vector dimension
///
/// # Returns
/// Result vector of length n
#[wasm_bindgen]
pub fn multiply_matrix_vector_wasm(matrix: &[f64], vector: &[f64], dimension: usize) -> Vec<f64> {
    animation::multiply_matrix_vector(matrix, vector, dimension)
}

// ============================================================================
// Phase 2: Matrix and Vector Operations
// ============================================================================

/// Multiplies two square matrices: C = A × B
///
/// # Arguments
/// * `a` - First matrix (n×n, row-major)
/// * `b` - Second matrix (n×n, row-major)
/// * `dimension` - Matrix dimension
///
/// # Returns
/// Result matrix (n×n, row-major)
#[wasm_bindgen]
pub fn multiply_matrices_wasm(a: &[f64], b: &[f64], dimension: usize) -> Vec<f64> {
    animation::multiply_matrices(a, b, dimension)
}

/// Computes the dot product of two vectors
///
/// # Arguments
/// * `a` - First vector
/// * `b` - Second vector
///
/// # Returns
/// The scalar dot product
#[wasm_bindgen]
pub fn dot_product_wasm(a: &[f64], b: &[f64]) -> f64 {
    animation::dot_product(a, b)
}

/// Computes the magnitude (length) of a vector
///
/// # Arguments
/// * `v` - Input vector
///
/// # Returns
/// The magnitude of the vector
#[wasm_bindgen]
pub fn magnitude_wasm(v: &[f64]) -> f64 {
    animation::magnitude(v)
}

/// Normalizes a vector to unit length
///
/// # Arguments
/// * `v` - Input vector
///
/// # Returns
/// Unit vector in the same direction
#[wasm_bindgen]
pub fn normalize_vector_wasm(v: &[f64]) -> Vec<f64> {
    animation::normalize_vector(v)
}

/// Subtracts two vectors element-wise: c = a - b
///
/// # Arguments
/// * `a` - First vector
/// * `b` - Second vector
///
/// # Returns
/// The difference vector
#[wasm_bindgen]
pub fn subtract_vectors_wasm(a: &[f64], b: &[f64]) -> Vec<f64> {
    animation::subtract_vectors(a, b)
}

// ============================================================================
// Phase 3: Dirac Equation — Clifford Algebra
// ============================================================================

/// Generates Dirac gamma matrices for N spatial dimensions.
///
/// # Arguments
/// * `spatial_dim` - Number of spatial dimensions (1-11)
///
/// # Returns
/// Flat f32 buffer containing all matrices packed sequentially:
///   [spinorSize_as_f32, alpha_1 | alpha_2 | ... | alpha_N | beta]
/// Each matrix is S×S×2 floats (complex, row-major, re/im interleaved).
#[wasm_bindgen]
pub fn generate_dirac_matrices_wasm(spatial_dim: usize) -> Vec<f32> {
    let s = clifford::spinor_size(spatial_dim);
    let (alphas, beta) = clifford::generate_dirac_matrices(spatial_dim);
    let matrix_size = s * s * 2; // complex entries per matrix

    // Pack: [spinor_size_bits, alpha_1..., alpha_N..., beta...]
    let total = 1 + spatial_dim * matrix_size + matrix_size;
    let mut result = Vec::with_capacity(total);
    result.push(f32::from_bits(s as u32));
    for alpha in &alphas {
        result.extend_from_slice(alpha);
    }
    result.extend_from_slice(&beta);

    #[cfg(debug_assertions)]
    {
        assert!(clifford::verify_clifford_algebra(&alphas, &beta, s));
    }

    result
}

/// Returns the spinor size for a given spatial dimension.
#[wasm_bindgen]
pub fn dirac_spinor_size_wasm(spatial_dim: usize) -> usize {
    clifford::spinor_size(spatial_dim)
}

// ============================================================================
// Phase 4: FFT Operations
// ============================================================================

/// Validate 1D FFT inputs. Returns false if invalid.
#[inline]
fn validate_fft_1d(data_len: usize, n: usize) -> bool {
    n >= 2 && n.is_power_of_two() && data_len >= 2 * n
}

/// Validate N-D FFT inputs. Returns false if invalid.
#[inline]
fn validate_fft_nd(data_len: usize, grid_size: &[u32]) -> bool {
    if grid_size.is_empty() {
        return false;
    }
    let mut total: usize = 1;
    for &s in grid_size {
        let s = s as usize;
        if s < 2 || !s.is_power_of_two() {
            return false;
        }
        total = match total.checked_mul(s) {
            Some(t) => t,
            None => return false,
        };
    }
    data_len >= 2 * total
}

/// In-place 1D forward FFT on interleaved complex data.
///
/// Convention: `X[k] = Σ x[n] * exp(-i * 2π * k * n / N)`.
///
/// # Arguments
/// * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
/// * `n` - Number of complex elements (must be a power of 2, >= 2)
///
/// # Returns
/// Transformed data as a new `Float64Array`, or empty on invalid input
#[wasm_bindgen]
pub fn fft_1d_wasm(data: &[f64], n: u32) -> Vec<f64> {
    let n = n as usize;
    if !validate_fft_1d(data.len(), n) {
        return Vec::new();
    }
    let mut result = data.to_vec();
    fft::fft_1d(&mut result, n);
    result
}

/// In-place 1D inverse FFT with 1/N normalization.
///
/// Convention: `x[n] = (1/N) Σ X[k] * exp(+i * 2π * k * n / N)`.
///
/// # Arguments
/// * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
/// * `n` - Number of complex elements (must be a power of 2)
///
/// # Returns
/// Transformed data as a new `Float64Array`, or empty on invalid input
#[wasm_bindgen]
pub fn ifft_1d_wasm(data: &[f64], n: u32) -> Vec<f64> {
    let n = n as usize;
    if !validate_fft_1d(data.len(), n) {
        return Vec::new();
    }
    let mut result = data.to_vec();
    fft::ifft_1d(&mut result, n);
    result
}

/// N-dimensional forward FFT on interleaved complex data.
///
/// Applies 1D forward FFT along each axis sequentially.
///
/// # Arguments
/// * `data` - Interleaved complex data (length `2 * product(grid_size)`)
/// * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
///
/// # Returns
/// Transformed data as a new `Float64Array`, or empty on invalid input
#[wasm_bindgen]
pub fn fft_nd_wasm(data: &[f64], grid_size: &[u32]) -> Vec<f64> {
    if !validate_fft_nd(data.len(), grid_size) {
        return Vec::new();
    }
    let gs: Vec<usize> = grid_size.iter().map(|&s| s as usize).collect();
    let mut result = data.to_vec();
    fft::fft_nd(&mut result, &gs);
    result
}

/// N-dimensional inverse FFT on interleaved complex data.
///
/// Applies 1D inverse FFT along each axis sequentially.
///
/// # Arguments
/// * `data` - Interleaved complex data (length `2 * product(grid_size)`)
/// * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
///
/// # Returns
/// Transformed data as a new `Float64Array`, or empty on invalid input
#[wasm_bindgen]
pub fn ifft_nd_wasm(data: &[f64], grid_size: &[u32]) -> Vec<f64> {
    if !validate_fft_nd(data.len(), grid_size) {
        return Vec::new();
    }
    let gs: Vec<usize> = grid_size.iter().map(|&s| s as usize).collect();
    let mut result = data.to_vec();
    fft::ifft_nd(&mut result, &gs);
    result
}

// ============================================================================
// Phase 5: Coordinate Entanglement
// ============================================================================

/// Validate RDM inputs: matching psi lengths, dim_index in bounds, total sites match grid.
#[inline]
fn validate_rdm_inputs(psi_re_len: usize, psi_im_len: usize, grid_size: &[u32]) -> bool {
    if psi_re_len != psi_im_len || grid_size.is_empty() {
        return false;
    }
    let total: usize = grid_size.iter().map(|&s| s as usize).product();
    total > 0 && psi_re_len == total
}

/// Compute the reduced density matrix for a single dimension by tracing out
/// all other dimensions.
///
/// # Arguments
/// * `psi_re` - Real part of wavefunction (Float32Array from GPU readback)
/// * `psi_im` - Imaginary part of wavefunction (Float32Array)
/// * `grid_size` - Grid dimensions `[M_0, M_1, ..., M_{N-1}]`
/// * `dim_index` - Which dimension to keep (0-based)
///
/// # Returns
/// Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = grid_size[dim_index]`.
/// Empty on invalid input.
#[wasm_bindgen]
pub fn compute_rdm_wasm(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[u32],
    dim_index: u32,
) -> Vec<f64> {
    let di = dim_index as usize;
    if !validate_rdm_inputs(psi_re.len(), psi_im.len(), grid_size) || di >= grid_size.len() {
        return Vec::new();
    }
    entanglement::compute_rdm(psi_re, psi_im, grid_size, di)
}

/// Compute the joint reduced density matrix for a set of dimensions.
///
/// # Arguments
/// * `psi_re` - Real part of wavefunction (Float32Array)
/// * `psi_im` - Imaginary part of wavefunction (Float32Array)
/// * `grid_size` - Grid dimensions
/// * `kept_dims` - Indices of dimensions to keep (sorted ascending)
///
/// # Returns
/// Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = Π kept dims`.
/// Empty on invalid input or `M > 1024`.
#[wasm_bindgen]
pub fn compute_joint_rdm_wasm(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[u32],
    kept_dims: &[u32],
) -> Vec<f64> {
    if !validate_rdm_inputs(psi_re.len(), psi_im.len(), grid_size)
        || kept_dims.is_empty()
        || kept_dims.iter().any(|&d| (d as usize) >= grid_size.len())
    {
        return Vec::new();
    }
    entanglement::compute_joint_rdm(psi_re, psi_im, grid_size, kept_dims)
}

/// Hermitian eigendecomposition via Jacobi iteration.
///
/// # Arguments
/// * `re` - Real part of Hermitian matrix (row-major, n×n)
/// * `im` - Imaginary part of Hermitian matrix (row-major, n×n)
/// * `n` - Matrix dimension
///
/// # Returns
/// Eigenvalues sorted descending as `Float64Array`
#[wasm_bindgen]
pub fn hermitian_eigenvalues_wasm(re: &[f64], im: &[f64], n: u32) -> Vec<f64> {
    entanglement::hermitian_eigenvalues(re, im, n as usize)
}

/// Von Neumann entropy from eigenvalues: S = -Σ λ_k ln(λ_k).
///
/// # Arguments
/// * `eigenvalues` - Eigenvalues of a density matrix
///
/// # Returns
/// Entropy value (natural log, nats), clamped to >= 0
#[wasm_bindgen]
pub fn von_neumann_entropy_wasm(eigenvalues: &[f64]) -> f64 {
    entanglement::von_neumann_entropy(eigenvalues)
}

// ============================================================================
// Phase 6: Complex Matrix Exponential (Open Quantum Systems)
// ============================================================================

/// Matrix exponential via Padé(13,13) with scaling-and-squaring.
///
/// Computes exp(A) for an N×N complex matrix stored as separate real/imag arrays.
///
/// # Arguments
/// * `a_re` - Real part of input matrix (N×N, row-major)
/// * `a_im` - Imaginary part of input matrix (N×N, row-major)
/// * `n` - Matrix dimension
///
/// # Returns
/// Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
#[wasm_bindgen]
pub fn matrix_exponential_pade_wasm(a_re: &[f64], a_im: &[f64], n: u32) -> Vec<f64> {
    let n = n as usize;
    let (res_re, res_im) = complex_matrix::matrix_exponential_pade(a_re, a_im, n);
    let size = n * n;
    let mut packed = Vec::with_capacity(2 * size);
    packed.extend_from_slice(&res_re[..size]);
    packed.extend_from_slice(&res_im[..size]);
    packed
}

/// Complex matrix multiply: C = A × B for N×N matrices.
///
/// # Arguments
/// * `a_re`, `a_im` - Left matrix (N×N, row-major)
/// * `b_re`, `b_im` - Right matrix (N×N, row-major)
/// * `n` - Matrix dimension
///
/// # Returns
/// Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
#[wasm_bindgen]
pub fn complex_mat_mul_wasm(
    a_re: &[f64],
    a_im: &[f64],
    b_re: &[f64],
    b_im: &[f64],
    n: u32,
) -> Vec<f64> {
    let n = n as usize;
    let size = n * n;
    let mut out_re = vec![0.0; size];
    let mut out_im = vec![0.0; size];
    complex_matrix::complex_mat_mul(a_re, a_im, b_re, b_im, &mut out_re, &mut out_im, n);
    let mut packed = Vec::with_capacity(2 * size);
    packed.extend_from_slice(&out_re);
    packed.extend_from_slice(&out_im);
    packed
}

// ============================================================================
// Phase 7: TDSE Diagnostics (Scar Correlation + Level Spacing)
// ============================================================================

/// Compute scar correlation between eigenstate density and classical orbits.
///
/// # Arguments
/// * `density_re` - Eigenstate ψ_re on the lattice (f32 from GPU readback)
/// * `density_im` - Eigenstate ψ_im on the lattice (f32)
/// * `grid_sizes` - Per-dimension grid sizes
/// * `spacings` - Per-dimension lattice spacings (f64)
/// * `orbit_points_flat` - Flattened orbit positions `[x0_d0, x0_d1, ..., x1_d0, ...]` (f64)
/// * `orbit_lengths` - Number of points per orbit
/// * `sigma` - Gaussian tube width ε
/// * `dim` - Number of spatial dimensions
///
/// # Returns
/// Packed `Float64Array`: `[corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]`
#[wasm_bindgen]
pub fn compute_scar_correlation_wasm(
    density_re: &[f32],
    density_im: &[f32],
    grid_sizes: &[u32],
    spacings: &[f64],
    orbit_points_flat: &[f64],
    orbit_lengths: &[u32],
    sigma: f64,
    dim: u32,
) -> Vec<f64> {
    tdse_diagnostics::compute_scar_correlation(
        density_re,
        density_im,
        grid_sizes,
        spacings,
        orbit_points_flat,
        orbit_lengths,
        sigma,
        dim,
    )
}

/// Compute level spacing statistics from energy eigenvalues.
///
/// # Arguments
/// * `energies` - Eigenvalue array
///
/// # Returns
/// Packed `Float64Array`: `[spacings..., brody_beta, mean_spacing, classification_code]`
/// Classification codes: 0 = poisson, 1 = intermediate, 2 = wigner-dyson
#[wasm_bindgen]
pub fn compute_level_spacing_wasm(energies: &[f64]) -> Vec<f64> {
    tdse_diagnostics::compute_level_spacing(energies)
}
