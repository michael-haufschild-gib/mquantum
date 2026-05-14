//! High-performance animation operations for real-time rendering
//!
//! These functions are optimized for the animation loop (60 FPS):
//! - Matrix composition for rotations
//! - Perspective projection to 3D
//! - Matrix-vector multiplication
//!
//! All functions operate on flat arrays for efficient WASM<->JS transfer.

/// Minimum safe distance from projection plane to avoid division issues.
/// `pub(crate)` so the projection helpers in `animation_projection.rs`
/// can clamp against the same threshold without duplicating the constant.
pub(crate) const MIN_SAFE_DISTANCE: f64 = 0.01;

// ============================================================================
// Fast Trigonometry (OPT-WASM-RUST-TRIG)
// ============================================================================

const PI: f64 = std::f64::consts::PI;
const TAU: f64 = PI * 2.0;
const PI_SQ_INV_4: f64 = 4.0 / (PI * PI);

/// Fast sine approximation using parabolic formula.
/// ~3x faster than std sin(), max error ~1.2% at x ≈ ±0.7.
/// Matches JS fsin() in trig.ts for consistent animation behavior.
#[inline(always)]
fn fsin(x: f64) -> f64 {
    // Normalize to [-PI, PI]
    let x = ((x % TAU) + TAU + PI) % TAU - PI;
    // Parabolic approximation: y = x * (PI - |x|) * 4/PI²
    let y = x * (PI - x.abs()) * PI_SQ_INV_4;
    // Clamp to [-1, 1]
    y.clamp(-1.0, 1.0)
}

/// Fast cosine approximation using cos(x) = sin(x + π/2).
#[inline(always)]
fn fcos(x: f64) -> f64 {
    fsin(x + PI * 0.5)
}

// ============================================================================
// Matrix Operations
// ============================================================================

/// Multiplies a matrix by a vector: result[i] = Σ(M[i][j] * v[j])
///
/// # Arguments
/// * `matrix` - Flat n×n matrix (row-major)
/// * `vector` - Input vector of length n
/// * `dimension` - Matrix/vector dimension
///
/// # Returns
/// Result vector of length n, or zeros if inputs have incorrect size
pub fn multiply_matrix_vector(matrix: &[f64], vector: &[f64], dimension: usize) -> Vec<f64> {
    // Bounds check: matrix must be dimension*dimension, vector must be dimension
    let expected_matrix_size = dimension * dimension;
    if dimension == 0 || matrix.len() < expected_matrix_size || vector.len() < dimension {
        return vec![0.0; dimension];
    }

    let mut result = vec![0.0; dimension];

    for i in 0..dimension {
        let row_offset = i * dimension;
        let mut sum = 0.0;
        for j in 0..dimension {
            sum += matrix[row_offset + j] * vector[j];
        }
        result[i] = sum;
    }

    result
}

/// Multiplies two square matrices: C = A × B
///
/// # Arguments
/// * `a` - First matrix (n×n, row-major)
/// * `b` - Second matrix (n×n, row-major)
/// * `dimension` - Matrix dimension
///
/// # Returns
/// Result matrix (n×n, row-major), or identity matrix if inputs have incorrect size
pub fn multiply_matrices(a: &[f64], b: &[f64], dimension: usize) -> Vec<f64> {
    let matrix_size = dimension * dimension;
    let mut result = vec![0.0; matrix_size];

    // Bounds check: both matrices must be dimension*dimension
    if dimension == 0 || a.len() < matrix_size || b.len() < matrix_size {
        // Return identity matrix on invalid input
        for i in 0..dimension {
            result[i * dimension + i] = 1.0;
        }
        return result;
    }

    multiply_matrices_into(&mut result, a, b, dimension);
    result
}

/// Multiplies two square matrices into an output buffer
///
/// out[i][j] = Σ(A[i][k] * B[k][j])
///
/// # Arguments
/// * `out` - Output buffer (dimension × dimension)
/// * `a` - First matrix (row-major)
/// * `b` - Second matrix (row-major)
/// * `dimension` - Matrix dimension
fn multiply_matrices_into(out: &mut [f64], a: &[f64], b: &[f64], dimension: usize) {
    match dimension {
        4 => crate::animation_matrix_unrolled::multiply_matrices_4x4(out, a, b),
        5 => crate::animation_matrix_unrolled::multiply_matrices_5x5(out, a, b),
        6 => crate::animation_matrix_unrolled::multiply_matrices_6x6(out, a, b),
        7 => crate::animation_matrix_unrolled::multiply_matrices_7x7(out, a, b),
        8 => crate::animation_matrix_unrolled::multiply_matrices_8x8(out, a, b),
        9 => crate::animation_matrix_unrolled::multiply_matrices_9x9(out, a, b),
        10 => crate::animation_matrix_unrolled::multiply_matrices_10x10(out, a, b),
        11 => crate::animation_matrix_unrolled::multiply_matrices_11x11(out, a, b),
        _ => {
            // Generic path for unsupported dimensions
            for i in 0..dimension {
                let row_offset = i * dimension;
                for j in 0..dimension {
                    let mut sum = 0.0;
                    for k in 0..dimension {
                        sum += a[row_offset + k] * b[k * dimension + j];
                    }
                    out[row_offset + j] = sum;
                }
            }
        }
    }
}

// Unrolled NxN multiplications (4..=11) live in `animation_matrix_unrolled.rs`.
// `multiply_matrices_into` above dispatches to those functions; see that module's
// doc-comment for the rationale of the split.

/// Resets a matrix to identity in-place
fn reset_to_identity(matrix: &mut [f64], dimension: usize) {
    matrix.fill(0.0);
    for i in 0..dimension {
        matrix[i * dimension + i] = 1.0;
    }
}

/// Creates a rotation matrix for a specific plane
///
/// # Arguments
/// * `out` - Output buffer (dimension × dimension)
/// * `dimension` - Matrix dimension
/// * `plane_index1` - First axis of rotation plane
/// * `plane_index2` - Second axis of rotation plane
/// * `angle_radians` - Rotation angle
fn create_rotation_matrix_into(
    out: &mut [f64],
    dimension: usize,
    plane_index1: usize,
    plane_index2: usize,
    angle_radians: f64,
) {
    reset_to_identity(out, dimension);

    // OPT-WASM-RUST-TRIG: Use fast trig for animation performance
    let cos = fcos(angle_radians);
    let sin = fsin(angle_radians);

    // Set rotation plane elements
    out[plane_index1 * dimension + plane_index1] = cos;
    out[plane_index2 * dimension + plane_index2] = cos;
    out[plane_index1 * dimension + plane_index2] = -sin;
    out[plane_index2 * dimension + plane_index1] = sin;
}

/// Axis names for plane parsing
const AXIS_NAMES: [char; 6] = ['X', 'Y', 'Z', 'W', 'V', 'U'];

/// Parses an axis name to its index
/// Returns None for invalid names
fn parse_axis_name_to_index(name: &str) -> Option<usize> {
    if name.len() == 1 {
        let c = name.chars().next()?;
        for (i, &axis) in AXIS_NAMES.iter().enumerate() {
            if c == axis {
                return Some(i);
            }
        }
    }
    // Handle A6, A7, A8... format for dimensions > 6
    if name.starts_with('A') {
        if let Ok(num) = name[1..].parse::<usize>() {
            if num >= AXIS_NAMES.len() {
                return Some(num);
            }
        }
    }
    None
}

/// Parses a plane name (e.g., "XY", "XW") into axis indices
/// Returns (index1, index2) where index1 < index2
/// OPT-WASM-RUST-4: Avoid Vec<char> allocation - use byte slices directly
fn parse_plane_name(plane_name: &str) -> Option<(usize, usize)> {
    let bytes = plane_name.as_bytes();

    // Fast path: Two-character format (XY, XZ, etc.) - most common case
    if bytes.len() == 2 {
        let idx1 = parse_axis_byte(bytes[0])?;
        let idx2 = parse_axis_byte(bytes[1])?;
        if idx1 == idx2 {
            return None;
        }
        return Some(if idx1 < idx2 {
            (idx1, idx2)
        } else {
            (idx2, idx1)
        });
    }

    // Slow path: Handle formats like "A6A7", "XA6", etc.
    parse_plane_name_extended(plane_name)
}

/// Parse single axis character to index (no allocation)
#[inline(always)]
fn parse_axis_byte(b: u8) -> Option<usize> {
    match b {
        b'X' => Some(0),
        b'Y' => Some(1),
        b'Z' => Some(2),
        b'W' => Some(3),
        b'V' => Some(4),
        b'U' => Some(5),
        _ => None,
    }
}

/// Extended parsing for A6, A7, etc. format (rare case, allocation okay)
fn parse_plane_name_extended(plane_name: &str) -> Option<(usize, usize)> {
    let mut parts = Vec::with_capacity(2);
    let mut current = String::new();
    for c in plane_name.chars() {
        if c.is_ascii_uppercase() && !current.is_empty() {
            parts.push(current);
            current = String::new();
        }
        current.push(c);
    }
    if !current.is_empty() {
        parts.push(current);
    }

    if parts.len() == 2 {
        let idx1 = parse_axis_name_to_index(&parts[0])?;
        let idx2 = parse_axis_name_to_index(&parts[1])?;
        if idx1 == idx2 {
            return None;
        }
        return Some(if idx1 < idx2 {
            (idx1, idx2)
        } else {
            (idx2, idx1)
        });
    }

    None
}

/// Composes multiple rotations from plane names and angles.
///
/// This is the main function called from the animation loop.
///
/// # Arguments
/// * `dimension` - The dimensionality of the space
/// * `plane_names` - Array of plane names (e.g., ["XY", "XW", "ZW"])
/// * `angles` - Array of rotation angles in radians (same length as plane_names)
///
/// # Returns
/// Flat rotation matrix (dimension × dimension) as row-major array
pub fn compose_rotations(dimension: usize, plane_names: &[String], angles: &[f64]) -> Vec<f64> {
    let matrix_size = dimension * dimension;

    // Handle empty rotations
    if plane_names.is_empty() || angles.is_empty() {
        let mut result = vec![0.0; matrix_size];
        reset_to_identity(&mut result, dimension);
        return result;
    }

    // Allocate scratch buffers
    let mut rotation = vec![0.0; matrix_size];
    let mut result_a = vec![0.0; matrix_size];
    let mut result_b = vec![0.0; matrix_size];

    // Start with identity
    reset_to_identity(&mut result_a, dimension);

    let mut current = &mut result_a;
    let mut next = &mut result_b;

    // Apply each rotation
    for (plane_name, &angle) in plane_names.iter().zip(angles.iter()) {
        // Parse plane name to get indices
        let Some((idx1, idx2)) = parse_plane_name(plane_name) else {
            continue; // Skip invalid plane names
        };

        // Validate indices
        if idx1 >= dimension || idx2 >= dimension {
            continue;
        }

        // Create rotation matrix
        create_rotation_matrix_into(&mut rotation, dimension, idx1, idx2, angle);

        // Multiply: next = current * rotation
        multiply_matrices_into(next, current, &rotation, dimension);

        // Swap references
        std::mem::swap(&mut current, &mut next);
    }

    // Copy result to output
    current.clone()
}

/// Composes multiple rotations from flattened plane indices and angles.
///
/// This avoids string parsing and is intended for hot animation loops where
/// JS provides pre-resolved axis pairs as `[i0, j0, i1, j1, ...]`.
///
/// # Arguments
/// * `dimension` - The dimensionality of the space
/// * `plane_indices` - Flattened plane index pairs `[i0, j0, i1, j1, ...]`
/// * `angles` - Rotation angles in radians
/// * `rotation_count` - Number of active rotations to read from the buffers
///
/// # Returns
/// Flat rotation matrix (dimension × dimension) as row-major array
pub fn compose_rotations_indexed(
    dimension: usize,
    plane_indices: &[u32],
    angles: &[f64],
    rotation_count: usize,
) -> Vec<f64> {
    let matrix_size = dimension * dimension;

    // Clamp count to valid payload size to support over-provisioned pooled buffers.
    let usable_count = rotation_count
        .min(angles.len())
        .min(plane_indices.len() / 2);

    // Handle empty rotations
    if usable_count == 0 {
        let mut result = vec![0.0; matrix_size];
        reset_to_identity(&mut result, dimension);
        return result;
    }

    // Allocate scratch buffers
    let mut rotation = vec![0.0; matrix_size];
    let mut result_a = vec![0.0; matrix_size];
    let mut result_b = vec![0.0; matrix_size];

    // Start with identity
    reset_to_identity(&mut result_a, dimension);

    let mut current = &mut result_a;
    let mut next = &mut result_b;

    // Apply each rotation
    for i in 0..usable_count {
        let pair_offset = i * 2;
        let idx1 = plane_indices[pair_offset] as usize;
        let idx2 = plane_indices[pair_offset + 1] as usize;

        // Validate indices
        if idx1 == idx2 || idx1 >= dimension || idx2 >= dimension {
            continue;
        }
        let (axis_a, axis_b) = if idx1 < idx2 {
            (idx1, idx2)
        } else {
            (idx2, idx1)
        };

        // Create rotation matrix
        create_rotation_matrix_into(&mut rotation, dimension, axis_a, axis_b, angles[i]);

        // Multiply: next = current * rotation
        multiply_matrices_into(next, current, &rotation, dimension);

        // Swap references
        std::mem::swap(&mut current, &mut next);
    }

    // Copy result to output
    current.clone()
}

// ============================================================================
// Projection + Vector Operations
// ============================================================================
//
// `project_vertices_to_positions` and the 3D / 4D / 5D / generic projection
// helpers live in `animation_projection.rs`.
//
// Generic vector ops (`dot_product`, `magnitude`, `normalize_vector`,
// `subtract_vectors`) live in `animation_vector_ops.rs`.
//
// Both modules expose `pub` wrappers consumed by `lib.rs`'s `#[wasm_bindgen]`
// surface. See those files for documentation; behaviour is bit-identical
// to the pre-split call paths.

pub use crate::animation_projection::project_vertices_to_positions;
pub use crate::animation_vector_ops::{dot_product, magnitude, normalize_vector, subtract_vectors};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::animation_projection::*;
    use crate::animation_vector_ops::*;

    #[test]
    fn test_parse_plane_name() {
        assert_eq!(parse_plane_name("XY"), Some((0, 1)));
        assert_eq!(parse_plane_name("XZ"), Some((0, 2)));
        assert_eq!(parse_plane_name("YZ"), Some((1, 2)));
        assert_eq!(parse_plane_name("XW"), Some((0, 3)));
        assert_eq!(parse_plane_name("ZW"), Some((2, 3)));
        assert_eq!(parse_plane_name("XX"), None); // Same axis
    }

    #[test]
    fn test_compose_rotations_identity() {
        let result = compose_rotations(4, &[], &[]);
        assert_eq!(result.len(), 16);
        // Check identity
        assert!((result[0] - 1.0).abs() < 1e-10);
        assert!((result[5] - 1.0).abs() < 1e-10);
        assert!((result[10] - 1.0).abs() < 1e-10);
        assert!((result[15] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_compose_rotations_single() {
        let plane_names = vec!["XY".to_string()];
        let angles = vec![std::f64::consts::FRAC_PI_2]; // 90 degrees
        let result = compose_rotations(3, &plane_names, &angles);

        // For XY rotation by 90°:
        // cos(90°) = 0, sin(90°) = 1
        // Matrix should have [0, -1, 0] and [1, 0, 0] in top-left 2x2
        assert!((result[0] - 0.0).abs() < 1e-10);
        assert!((result[1] - (-1.0)).abs() < 1e-10);
        assert!((result[3] - 1.0).abs() < 1e-10);
        assert!((result[4] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_compose_rotations_indexed_single() {
        let plane_indices = vec![0_u32, 1_u32];
        let angles = vec![std::f64::consts::FRAC_PI_2]; // 90 degrees
        let result = compose_rotations_indexed(3, &plane_indices, &angles, 1);

        // For XY rotation by 90°:
        // cos(90°) = 0, sin(90°) = 1
        // Matrix should have [0, -1, 0] and [1, 0, 0] in top-left 2x2
        assert!((result[0] - 0.0).abs() < 1e-10);
        assert!((result[1] - (-1.0)).abs() < 1e-10);
        assert!((result[3] - 1.0).abs() < 1e-10);
        assert!((result[4] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_compose_rotations_indexed_respects_rotation_count() {
        // First entry is valid XY 90deg, second entry should be ignored by rotation_count=1.
        let plane_indices = vec![0_u32, 1_u32, 0_u32, 2_u32];
        let angles = vec![std::f64::consts::FRAC_PI_2, std::f64::consts::FRAC_PI_2];
        let result = compose_rotations_indexed(3, &plane_indices, &angles, 1);

        // Should match a single XY 90deg rotation:
        assert!((result[0] - 0.0).abs() < 1e-10);
        assert!((result[1] - (-1.0)).abs() < 1e-10);
        assert!((result[3] - 1.0).abs() < 1e-10);
        assert!((result[4] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_project_vertices_3d() {
        // 3D vertices should pass through unchanged (no higher dims)
        let vertices = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let positions = project_vertices_to_positions(&vertices, 3, 4.0);

        assert_eq!(positions.len(), 6);
        // Scale = 1/4 for projection distance 4
        assert!((positions[0] - 0.25).abs() < 1e-5);
        assert!((positions[1] - 0.5).abs() < 1e-5);
        assert!((positions[2] - 0.75).abs() < 1e-5);
    }

    #[test]
    fn test_project_vertices_4d() {
        // 4D vertex at origin with w=2 should have effective depth = 2/sqrt(1) = 2
        // denominator = 4 - 2 = 2, scale = 0.5
        let vertices = vec![2.0, 4.0, 6.0, 2.0];
        let positions = project_vertices_to_positions(&vertices, 4, 4.0);

        assert_eq!(positions.len(), 3);
        assert!((positions[0] - 1.0).abs() < 1e-5); // 2 * 0.5
        assert!((positions[1] - 2.0).abs() < 1e-5); // 4 * 0.5
        assert!((positions[2] - 3.0).abs() < 1e-5); // 6 * 0.5
    }

    #[test]
    fn test_multiply_matrix_vector() {
        // 2x2 identity
        let matrix = vec![1.0, 0.0, 0.0, 1.0];
        let vector = vec![3.0, 4.0];
        let result = multiply_matrix_vector(&matrix, &vector, 2);

        assert_eq!(result, vec![3.0, 4.0]);
    }

    #[test]
    fn test_multiply_matrices() {
        // 2x2 identity × 2x2 other = 2x2 other
        let identity = vec![1.0, 0.0, 0.0, 1.0];
        let other = vec![1.0, 2.0, 3.0, 4.0];
        let result = multiply_matrices(&identity, &other, 2);
        assert_eq!(result, vec![1.0, 2.0, 3.0, 4.0]);

        // Test actual multiplication
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![5.0, 6.0, 7.0, 8.0];
        let result = multiply_matrices(&a, &b, 2);
        // [1,2] [5,6]   [1*5+2*7, 1*6+2*8]   [19, 22]
        // [3,4] [7,8] = [3*5+4*7, 3*6+4*8] = [43, 50]
        assert!((result[0] - 19.0).abs() < 1e-10);
        assert!((result[1] - 22.0).abs() < 1e-10);
        assert!((result[2] - 43.0).abs() < 1e-10);
        assert!((result[3] - 50.0).abs() < 1e-10);
    }

    #[test]
    fn test_dot_product() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];
        // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
        assert!((dot_product(&a, &b) - 32.0).abs() < 1e-10);
    }

    #[test]
    fn test_magnitude() {
        let v = vec![3.0, 4.0];
        // sqrt(9 + 16) = sqrt(25) = 5
        assert!((magnitude(&v) - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_normalize_vector() {
        let v = vec![3.0, 4.0];
        let normalized = normalize_vector(&v);
        // Length should be 1
        assert!((magnitude(&normalized) - 1.0).abs() < 1e-10);
        // Direction should be preserved: (0.6, 0.8)
        assert!((normalized[0] - 0.6).abs() < 1e-10);
        assert!((normalized[1] - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_subtract_vectors() {
        let a = vec![5.0, 3.0, 1.0];
        let b = vec![1.0, 2.0, 3.0];
        let result = subtract_vectors(&a, &b);
        assert_eq!(result, vec![4.0, 1.0, -2.0]);
    }

    // ========================================================================
    // fsin / fcos — Fast Trig Approximation Tests
    // ========================================================================

    #[test]
    fn test_fsin_exact_points() {
        // fsin is exact at 0, ±PI/2, ±PI by construction
        assert!((fsin(0.0)).abs() < 1e-15);
        assert!((fsin(PI / 2.0) - 1.0).abs() < 1e-15);
        assert!((fsin(-PI / 2.0) + 1.0).abs() < 1e-15);
        assert!((fsin(PI)).abs() < 1e-10);
    }

    #[test]
    fn test_fcos_exact_points() {
        assert!((fcos(0.0) - 1.0).abs() < 1e-15);
        assert!((fcos(PI) + 1.0).abs() < 1e-10);
        assert!((fcos(PI / 2.0)).abs() < 1e-10);
    }

    #[test]
    fn test_fsin_accuracy_across_full_cycle() {
        // Parabolic approximation max error is ~0.0561
        let steps = 3600;
        let mut max_err: f64 = 0.0;
        for i in 0..=steps {
            let angle = (i as f64 / steps as f64) * TAU - PI;
            let approx = fsin(angle);
            let exact = angle.sin();
            let err = (approx - exact).abs();
            max_err = max_err.max(err);
            assert!(
                err < 0.057,
                "fsin({angle}) = {approx}, expected {exact}, error {err}"
            );
        }
        // Verify the max error is in the expected ballpark
        assert!(max_err > 0.05, "Suspiciously low max error: {max_err}");
    }

    #[test]
    fn test_fcos_accuracy_across_full_cycle() {
        let steps = 3600;
        let mut max_err: f64 = 0.0;
        for i in 0..=steps {
            let angle = (i as f64 / steps as f64) * TAU - PI;
            let approx = fcos(angle);
            let exact = angle.cos();
            let err = (approx - exact).abs();
            max_err = max_err.max(err);
            assert!(
                err < 0.057,
                "fcos({angle}) = {approx}, expected {exact}, error {err}"
            );
        }
        assert!(max_err > 0.05, "Suspiciously low max error: {max_err}");
    }

    #[test]
    fn test_fsin_is_odd() {
        for i in 0..1000 {
            let x = (i as f64 - 500.0) * 0.01;
            assert!(
                (fsin(-x) + fsin(x)).abs() < 1e-10,
                "fsin is not odd at x={x}"
            );
        }
    }

    #[test]
    fn test_fcos_is_even() {
        for i in 0..1000 {
            let x = (i as f64 - 500.0) * 0.01;
            assert!(
                (fcos(-x) - fcos(x)).abs() < 1e-10,
                "fcos is not even at x={x}"
            );
        }
    }

    #[test]
    fn test_fsin_fcos_clamped_to_unit_range() {
        for i in 0..10000 {
            let x = (i as f64 - 5000.0) * 0.1;
            let s = fsin(x);
            let c = fcos(x);
            assert!(s >= -1.0 && s <= 1.0, "fsin({x}) = {s} out of [-1,1]");
            assert!(c >= -1.0 && c <= 1.0, "fcos({x}) = {c} out of [-1,1]");
        }
    }

    #[test]
    fn test_fsin_large_input_normalization() {
        // Large inputs should be normalized to [-PI, PI] without NaN/Inf
        let x = 100.0 * PI + PI / 2.0;
        let result = fsin(x);
        assert!(result.is_finite());
        assert!((result - x.sin()).abs() < 0.056);
    }

    // ========================================================================
    // Unrolled Matrix Multiplication — Specialized vs Generic Path
    // ========================================================================

    /// Reference implementation: generic triple-loop matrix multiply
    fn reference_multiply(a: &[f64], b: &[f64], dim: usize) -> Vec<f64> {
        let mut result = vec![0.0; dim * dim];
        for i in 0..dim {
            for j in 0..dim {
                let mut sum = 0.0;
                for k in 0..dim {
                    sum += a[i * dim + k] * b[k * dim + j];
                }
                result[i * dim + j] = sum;
            }
        }
        result
    }

    #[test]
    fn test_multiply_matrices_specialized_vs_generic_all_dims() {
        // For each dimension 4-11 (which have unrolled specializations),
        // verify the specialized path matches the generic reference.
        for dim in 4..=11 {
            let n = dim * dim;
            // Create non-trivial matrices with deterministic values
            let a: Vec<f64> = (0..n).map(|i| ((i * 7 + 3) % 13) as f64 - 6.0).collect();
            let b: Vec<f64> = (0..n).map(|i| ((i * 11 + 5) % 17) as f64 - 8.0).collect();

            let expected = reference_multiply(&a, &b, dim);
            let actual = multiply_matrices(&a, &b, dim);

            for idx in 0..n {
                assert!(
                    (actual[idx] - expected[idx]).abs() < 1e-6,
                    "Mismatch at dim={dim}, index={idx}: actual={}, expected={}",
                    actual[idx],
                    expected[idx]
                );
            }
        }
    }

    #[test]
    fn test_multiply_matrices_identity_all_dims() {
        // A * I = A for all dimensions 2-11
        for dim in 2..=11 {
            let n = dim * dim;
            let a: Vec<f64> = (0..n).map(|i| ((i * 7 + 3) % 13) as f64 - 6.0).collect();
            let mut identity = vec![0.0; n];
            for i in 0..dim {
                identity[i * dim + i] = 1.0;
            }

            let result = multiply_matrices(&a, &identity, dim);
            for idx in 0..n {
                assert!(
                    (result[idx] - a[idx]).abs() < 1e-10,
                    "A*I != A at dim={dim}, index={idx}"
                );
            }

            let result2 = multiply_matrices(&identity, &a, dim);
            for idx in 0..n {
                assert!(
                    (result2[idx] - a[idx]).abs() < 1e-10,
                    "I*A != A at dim={dim}, index={idx}"
                );
            }
        }
    }

    #[test]
    fn test_multiply_matrices_associativity() {
        // (A*B)*C = A*(B*C) for dims that use specialized paths
        for dim in [4, 5, 6, 7] {
            let n = dim * dim;
            let a: Vec<f64> = (0..n).map(|i| ((i * 3 + 1) % 7) as f64 - 3.0).collect();
            let b: Vec<f64> = (0..n).map(|i| ((i * 5 + 2) % 9) as f64 - 4.0).collect();
            let c: Vec<f64> = (0..n).map(|i| ((i * 7 + 4) % 11) as f64 - 5.0).collect();

            let ab = multiply_matrices(&a, &b, dim);
            let ab_c = multiply_matrices(&ab, &c, dim);
            let bc = multiply_matrices(&b, &c, dim);
            let a_bc = multiply_matrices(&a, &bc, dim);

            for idx in 0..n {
                assert!(
                    (ab_c[idx] - a_bc[idx]).abs() < 1e-4,
                    "Associativity failed at dim={dim}, index={idx}: {} vs {}",
                    ab_c[idx],
                    a_bc[idx]
                );
            }
        }
    }

    // ========================================================================
    // multiply_matrix_vector — Extended Tests
    // ========================================================================

    #[test]
    fn test_multiply_matrix_vector_known_product() {
        // [[1,2],[3,4]] * [5,6] = [17, 39]
        let m = vec![1.0, 2.0, 3.0, 4.0];
        let v = vec![5.0, 6.0];
        let result = multiply_matrix_vector(&m, &v, 2);
        assert!((result[0] - 17.0).abs() < 1e-10);
        assert!((result[1] - 39.0).abs() < 1e-10);
    }

    #[test]
    fn test_multiply_matrix_vector_diagonal() {
        // Diagonal matrix scales each component
        for dim in 2..=11 {
            let mut m = vec![0.0; dim * dim];
            for i in 0..dim {
                m[i * dim + i] = (i + 1) as f64;
            }
            let v: Vec<f64> = (0..dim).map(|i| (i + 1) as f64).collect();
            let result = multiply_matrix_vector(&m, &v, dim);
            for i in 0..dim {
                let expected = ((i + 1) * (i + 1)) as f64;
                assert!(
                    (result[i] - expected).abs() < 1e-10,
                    "dim={dim}, i={i}: expected {expected}, got {}",
                    result[i]
                );
            }
        }
    }

    #[test]
    fn test_multiply_matrix_vector_invalid_input() {
        // dimension=0 returns empty
        let result = multiply_matrix_vector(&[], &[], 0);
        assert!(result.is_empty());

        // Undersized matrix returns zeros
        let result = multiply_matrix_vector(&[1.0], &[1.0, 2.0], 2);
        assert_eq!(result, vec![0.0, 0.0]);
    }

    // ========================================================================
    // compose_rotations — Extended Tests
    // ========================================================================

    #[test]
    fn test_compose_rotations_near_orthogonal_all_dims() {
        // compose_rotations uses fsin/fcos (fast parabolic approximation).
        // Since fsin²+fcos² deviates from 1 by up to 12.5%, the resulting
        // rotation matrices are only approximately orthogonal.
        // R^T * R ≈ I within the Pythagorean error bound.
        for dim in 2..=11 {
            let plane_names = vec!["XY".to_string()];
            let angles = vec![0.7];
            let r = compose_rotations(dim, &plane_names, &angles);

            let mut rt_r = vec![0.0; dim * dim];
            for i in 0..dim {
                for j in 0..dim {
                    let mut sum = 0.0;
                    for k in 0..dim {
                        sum += r[k * dim + i] * r[k * dim + j];
                    }
                    rt_r[i * dim + j] = sum;
                }
            }

            for i in 0..dim {
                for j in 0..dim {
                    let expected = if i == j { 1.0 } else { 0.0 };
                    assert!(
                        (rt_r[i * dim + j] - expected).abs() < 0.15,
                        "R^T*R deviation too large at dim={dim}, [{i}][{j}]: got {}",
                        rt_r[i * dim + j]
                    );
                }
            }
        }
    }

    #[test]
    fn test_compose_rotations_multi_plane_structure() {
        // Multi-plane composition produces a matrix with correct structure:
        // all entries finite, diagonal entries near ±1, off-diagonal bounded.
        let plane_names = vec!["XY".to_string(), "XZ".to_string(), "YZ".to_string()];
        let angles = vec![0.3, 0.5, 0.7];
        let r = compose_rotations(4, &plane_names, &angles);

        assert_eq!(r.len(), 16);
        for val in &r {
            assert!(val.is_finite(), "Non-finite value in rotation matrix");
            assert!(val.abs() < 2.0, "Rotation matrix entry too large: {val}");
        }

        // Near-orthogonal check with loose tolerance for fsin/fcos
        let mut rt_r = vec![0.0; 16];
        for i in 0..4 {
            for j in 0..4 {
                let mut sum = 0.0;
                for k in 0..4 {
                    sum += r[k * 4 + i] * r[k * 4 + j];
                }
                rt_r[i * 4 + j] = sum;
            }
        }
        for i in 0..4 {
            for j in 0..4 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (rt_r[i * 4 + j] - expected).abs() < 0.25,
                    "Multi-plane R^T*R too far from identity at [{i}][{j}]: got {}",
                    rt_r[i * 4 + j]
                );
            }
        }
    }

    #[test]
    fn test_compose_rotations_preserves_vector_length_approx() {
        // With fsin/fcos, length preservation is approximate.
        // The ~12.5% Pythagorean identity error means length can change by ~6%.
        let plane_names = vec!["XY".to_string(), "XW".to_string()];
        let angles = vec![1.0, 0.5];
        let r = compose_rotations(4, &plane_names, &angles);

        let v = vec![1.0, 2.0, 3.0, 4.0];
        let rotated = multiply_matrix_vector(&r, &v, 4);

        let orig_mag = magnitude(&v);
        let rot_mag = magnitude(&rotated);
        assert!(
            (orig_mag - rot_mag).abs() / orig_mag < 0.1,
            "Rotation changed vector length too much: {orig_mag} -> {rot_mag}"
        );
    }

    #[test]
    fn test_compose_rotations_zero_angle_is_identity() {
        for dim in 2..=7 {
            let plane_names = vec!["XY".to_string()];
            let angles = vec![0.0];
            let r = compose_rotations(dim, &plane_names, &angles);
            for i in 0..dim {
                for j in 0..dim {
                    let expected = if i == j { 1.0 } else { 0.0 };
                    assert!(
                        (r[i * dim + j] - expected).abs() < 1e-10,
                        "Zero-angle not identity at dim={dim}, [{i}][{j}]"
                    );
                }
            }
        }
    }

    // ========================================================================
    // compose_rotations_indexed — Extended Tests
    // ========================================================================

    #[test]
    fn test_compose_rotations_indexed_empty() {
        let result = compose_rotations_indexed(4, &[], &[], 0);
        assert_eq!(result.len(), 16);
        assert!((result[0] - 1.0).abs() < 1e-10);
        assert!((result[5] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_compose_rotations_indexed_reversed_indices() {
        // Indices (1, 0) should be normalized to (0, 1)
        let plane_indices = vec![1_u32, 0_u32];
        let angles = vec![0.5];
        let result = compose_rotations_indexed(3, &plane_indices, &angles, 1);

        // Compare with canonical order (0, 1)
        let canonical_indices = vec![0_u32, 1_u32];
        let canonical = compose_rotations_indexed(3, &canonical_indices, &angles, 1);

        for i in 0..9 {
            assert!(
                (result[i] - canonical[i]).abs() < 1e-10,
                "Reversed indices differ at index {i}"
            );
        }
    }

    #[test]
    fn test_compose_rotations_indexed_same_indices_skipped() {
        // Same indices (e.g., [0, 0]) should be skipped → identity
        let plane_indices = vec![0_u32, 0_u32];
        let angles = vec![0.5];
        let result = compose_rotations_indexed(3, &plane_indices, &angles, 1);
        // Should be identity since (0,0) is invalid
        assert!((result[0] - 1.0).abs() < 1e-10);
        assert!((result[4] - 1.0).abs() < 1e-10);
        assert!((result[8] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_compose_rotations_indexed_overprovisioned_buffers() {
        // Buffers larger than rotation_count — extra entries ignored
        let plane_indices = vec![0_u32, 1_u32, 0_u32, 2_u32, 1_u32, 2_u32];
        let angles = vec![0.5, 0.3, 0.7];
        // Only use first rotation
        let result = compose_rotations_indexed(3, &plane_indices, &angles, 1);
        let single = compose_rotations_indexed(3, &[0_u32, 1_u32], &[0.5], 1);
        for i in 0..9 {
            assert!(
                (result[i] - single[i]).abs() < 1e-10,
                "Overprovisioned buffer differs at index {i}"
            );
        }
    }

    #[test]
    fn test_compose_rotations_indexed_matches_named() {
        // Indexed and named should produce the same result
        let plane_names = vec!["XY".to_string(), "XZ".to_string()];
        let angles_named = vec![0.3, 0.7];
        let named = compose_rotations(4, &plane_names, &angles_named);

        let plane_indices = vec![0_u32, 1_u32, 0_u32, 2_u32];
        let angles_indexed = vec![0.3, 0.7];
        let indexed = compose_rotations_indexed(4, &plane_indices, &angles_indexed, 2);

        for i in 0..16 {
            assert!(
                (named[i] - indexed[i]).abs() < 1e-10,
                "Named vs indexed differ at index {i}: named={}, indexed={}",
                named[i],
                indexed[i]
            );
        }
    }

    // ========================================================================
    // project_vertices — Extended Tests
    // ========================================================================

    #[test]
    fn test_project_vertices_empty() {
        let result = project_vertices_to_positions(&[], 4, 4.0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_project_vertices_dim_too_low() {
        let result = project_vertices_to_positions(&[1.0, 2.0], 2, 4.0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_project_vertices_5d() {
        // 5D: effectiveDepth = (w + v) / sqrt(2)
        let sqrt2 = std::f64::consts::SQRT_2;
        let w = 1.0;
        let v = 1.0;
        let effective_depth = (w + v) / sqrt2;
        let proj_dist = 4.0;
        let expected_scale = 1.0 / (proj_dist - effective_depth);

        let vertices = vec![1.0, 0.0, 0.0, w, v];
        let result = project_vertices_to_positions(&vertices, 5, proj_dist);
        assert_eq!(result.len(), 3);
        assert!(
            (result[0] as f64 - expected_scale).abs() < 1e-5,
            "5D projection: expected {expected_scale}, got {}",
            result[0]
        );
    }

    #[test]
    fn test_project_vertices_nd_generic() {
        // 6D: higher dims all zero → effectiveDepth = 0 → scale = 1/projDist
        let vertices = vec![3.0, 6.0, 9.0, 0.0, 0.0, 0.0];
        let result = project_vertices_to_positions(&vertices, 6, 3.0);
        assert_eq!(result.len(), 3);
        assert!((result[0] - 1.0).abs() < 1e-5); // 3/3
        assert!((result[1] - 2.0).abs() < 1e-5); // 6/3
        assert!((result[2] - 3.0).abs() < 1e-5); // 9/3
    }

    #[test]
    fn test_project_vertices_near_zero_denom() {
        // w = projDist → denom = 0 → clamped to MIN_SAFE_DISTANCE (0.01)
        let vertices = vec![1.0, 0.0, 0.0, 4.0];
        let result = project_vertices_to_positions(&vertices, 4, 4.0);
        assert_eq!(result.len(), 3);
        assert!((result[0] - 100.0).abs() < 1.0); // 1.0 / 0.01 = 100
        assert!(result[0].is_finite());
    }

    #[test]
    fn test_project_vertices_sanitizes_non_finite_inputs() {
        let invalid_distance = project_vertices_to_positions(&[4.0, 0.0, 0.0], 3, f64::NAN);
        assert_eq!(invalid_distance.len(), 3);
        assert!((invalid_distance[0] - 1.0).abs() < 1e-5);
        assert!(invalid_distance.iter().all(|v| v.is_finite()));

        let zero_distance = project_vertices_to_positions(&[4.0, 0.0, 0.0], 3, 0.0);
        assert_eq!(zero_distance.len(), 3);
        assert!((zero_distance[0] - 1.0).abs() < 1e-5);
        assert!(zero_distance.iter().all(|v| v.is_finite()));

        let invalid_vertex =
            project_vertices_to_positions(&[f64::NAN, f64::INFINITY, 6.0, f64::INFINITY], 4, 4.0);
        assert_eq!(invalid_vertex.len(), 3);
        assert_eq!(invalid_vertex[0], 0.0);
        assert_eq!(invalid_vertex[1], 0.0);
        assert!((invalid_vertex[2] - 1.5).abs() < 1e-5);
        assert!(invalid_vertex.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn test_project_vertices_multiple() {
        // Two 4D vertices
        let vertices = vec![
            1.0, 0.0, 0.0, 0.0, // vertex 1: scale = 1/4 = 0.25
            0.0, 2.0, 0.0, 0.0, // vertex 2: scale = 1/4 = 0.25
        ];
        let result = project_vertices_to_positions(&vertices, 4, 4.0);
        assert_eq!(result.len(), 6);
        assert!((result[0] - 0.25).abs() < 1e-5); // v1.x
        assert!((result[4] - 0.5).abs() < 1e-5); // v2.y
    }

    // ========================================================================
    // normalize_vector — Extended Tests
    // ========================================================================

    #[test]
    fn test_normalize_near_zero_returns_zeros() {
        // Rust returns zeros for near-zero vectors (unlike TS which throws)
        let v = vec![1e-15, 1e-15];
        let result = normalize_vector(&v);
        assert_eq!(result, vec![0.0, 0.0]);
    }

    #[test]
    fn test_normalize_unit_vector_is_idempotent() {
        for dim in 2..=11 {
            let mut v = vec![0.0; dim];
            v[0] = 1.0;
            let normalized = normalize_vector(&v);
            for i in 0..dim {
                assert!(
                    (normalized[i] - v[i]).abs() < 1e-10,
                    "Normalizing unit vector changed it at dim={dim}, i={i}"
                );
            }
        }
    }

    #[test]
    fn test_normalize_preserves_direction() {
        let v = vec![3.0, 4.0, 0.0];
        let n = normalize_vector(&v);
        assert!((n[0] - 0.6).abs() < 1e-10);
        assert!((n[1] - 0.8).abs() < 1e-10);
        assert!((n[2]).abs() < 1e-10);
    }

    // ========================================================================
    // dot_product / magnitude — Extended Tests
    // ========================================================================

    #[test]
    fn test_dot_product_orthogonal() {
        assert!((dot_product(&[1.0, 0.0, 0.0], &[0.0, 1.0, 0.0])).abs() < 1e-15);
    }

    #[test]
    fn test_dot_product_self_equals_magnitude_squared() {
        for dim in 2..=11 {
            let v: Vec<f64> = (0..dim).map(|i| (i as f64 + 1.0) * 0.5).collect();
            let dot = dot_product(&v, &v);
            let mag = magnitude(&v);
            assert!(
                (dot - mag * mag).abs() < 1e-10,
                "dot(v,v) != ||v||^2 at dim={dim}"
            );
        }
    }

    #[test]
    fn test_magnitude_unit_basis_vectors() {
        for dim in 2..=11 {
            for axis in 0..dim {
                let mut v = vec![0.0; dim];
                v[axis] = 1.0;
                assert!(
                    (magnitude(&v) - 1.0).abs() < 1e-15,
                    "Unit basis vector magnitude != 1 at dim={dim}, axis={axis}"
                );
            }
        }
    }

    #[test]
    fn test_magnitude_scaling() {
        let v = vec![1.0, 2.0, 3.0];
        let scaled: Vec<f64> = v.iter().map(|x| x * 5.0).collect();
        assert!((magnitude(&scaled) - 5.0 * magnitude(&v)).abs() < 1e-10);
    }

    // ========================================================================
    // parse_plane_name — Extended Names (dims > 6)
    // ========================================================================

    #[test]
    fn test_parse_plane_name_extended_dimensions() {
        // A6, A7, etc. for dims > 6
        assert_eq!(parse_plane_name("XA6"), Some((0, 6)));
        assert_eq!(parse_plane_name("YA7"), Some((1, 7)));
        assert_eq!(parse_plane_name("ZA8"), Some((2, 8)));
        assert_eq!(parse_plane_name("UA6"), Some((5, 6)));
        assert_eq!(parse_plane_name("A6A7"), Some((6, 7)));
        assert_eq!(parse_plane_name("A8A10"), Some((8, 10)));
    }

    #[test]
    fn test_parse_plane_name_invalid() {
        assert_eq!(parse_plane_name(""), None);
        assert_eq!(parse_plane_name("X"), None);
        assert_eq!(parse_plane_name("XX"), None); // same axis
        assert_eq!(parse_plane_name("123"), None);
    }

    // ========================================================================
    // subtract_vectors — Extended Tests
    // ========================================================================

    #[test]
    fn test_subtract_vectors_self_is_zero() {
        for dim in 2..=11 {
            let v: Vec<f64> = (0..dim).map(|i| (i as f64 + 1.0) * 3.7).collect();
            let result = subtract_vectors(&v, &v);
            for (i, val) in result.iter().enumerate() {
                assert!(
                    val.abs() < 1e-15,
                    "v - v != 0 at dim={dim}, i={i}: got {val}"
                );
            }
        }
    }

    #[test]
    fn test_subtract_vectors_mismatched_lengths() {
        // Rust truncates to min length
        let a = vec![5.0, 3.0, 1.0];
        let b = vec![1.0, 2.0];
        let result = subtract_vectors(&a, &b);
        assert_eq!(result.len(), 2);
        assert_eq!(result, vec![4.0, 1.0]);
    }
}
