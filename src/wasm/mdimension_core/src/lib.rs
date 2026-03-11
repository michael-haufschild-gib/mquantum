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
