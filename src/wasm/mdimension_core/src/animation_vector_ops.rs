//! Generic N-dimensional vector helpers for the animation pipeline.
//!
//! Pure-data ops (dot product, magnitude, normalisation, subtraction) used
//! by the rotation composer + projection pipeline. Extracted from
//! `animation.rs` to keep the orchestrator file focused on rotation /
//! matrix dispatch.
//!
//! Output is bit-identical to the pre-split call paths.

// ============================================================================

/// Computes the dot product of two vectors: a · b = Σ(a[i] * b[i])
///
/// # Arguments
/// * `a` - First vector
/// * `b` - Second vector (must have same length as a)
///
/// # Returns
/// The scalar dot product
pub fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len().min(b.len());
    let mut sum = 0.0;
    for i in 0..len {
        sum += a[i] * b[i];
    }
    sum
}

/// Computes the magnitude (length) of a vector: ||v|| = √(Σ(v[i]²))
///
/// # Arguments
/// * `v` - Input vector
///
/// # Returns
/// The magnitude of the vector
pub fn magnitude(v: &[f64]) -> f64 {
    let mut sum_squares = 0.0;
    for val in v {
        sum_squares += val * val;
    }
    sum_squares.sqrt()
}

/// Normalizes a vector to unit length: v̂ = v / ||v||
///
/// # Arguments
/// * `v` - Input vector
///
/// # Returns
/// Unit vector in the same direction (or zeros if input has zero magnitude)
pub fn normalize_vector(v: &[f64]) -> Vec<f64> {
    let mag = magnitude(v);
    if mag < 1e-10 {
        return vec![0.0; v.len()];
    }
    let scale = 1.0 / mag;
    v.iter().map(|x| x * scale).collect()
}

/// Subtracts two vectors element-wise: c[i] = a[i] - b[i]
///
/// # Arguments
/// * `a` - First vector
/// * `b` - Second vector
///
/// # Returns
/// The difference vector
pub fn subtract_vectors(a: &[f64], b: &[f64]) -> Vec<f64> {
    let len = a.len().min(b.len());
    let mut result = vec![0.0; len];
    for i in 0..len {
        result[i] = a[i] - b[i];
    }
    result
}
