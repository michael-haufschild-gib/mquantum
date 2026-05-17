//! N-dimensional vertex projection (perspective N→3D).
//!
//! Reads a flat vertex buffer in `f64` N-D coordinates and writes a flat
//! `f32` 3D position buffer for downstream upload. Specialised paths for
//! 3D / 4D / 5D dimensions; generic loop for 6D-11D.
//!
//! Extracted from `animation.rs` as part of the file-size split.
//! Bit-identical to the pre-split call paths.

use crate::animation::MIN_SAFE_DISTANCE;

// ============================================================================

const DEFAULT_PROJECTION_DISTANCE: f64 = 4.0;

#[inline(always)]
fn finite_or_zero(value: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}

#[inline(always)]
fn sanitize_projection_distance(value: f64) -> f64 {
    if value.is_finite() && value >= MIN_SAFE_DISTANCE {
        value
    } else {
        DEFAULT_PROJECTION_DISTANCE
    }
}

#[inline(always)]
fn project_component(value: f64, scale: f64) -> f32 {
    let projected = value * scale;
    if projected.is_finite() && projected.abs() <= f32::MAX as f64 {
        projected as f32
    } else {
        0.0
    }
}

/// Projects n-dimensional vertices to 3D positions using perspective projection.
///
/// This writes directly into a Float32Array for Three.js buffer updates.
///
/// # Arguments
/// * `flat_vertices` - Flat array of vertex coordinates [v0_x, v0_y, v0_z, v0_w, ..., v1_x, ...]
/// * `dimension` - Dimensionality of each vertex
/// * `projection_distance` - Distance from projection plane (default: 4.0)
///
/// # Returns
/// Flat array of 3D positions [x0, y0, z0, x1, y1, z1, ...]
pub fn project_vertices_to_positions(
    flat_vertices: &[f64],
    dimension: usize,
    projection_distance: f64,
) -> Vec<f32> {
    if dimension < 3 || flat_vertices.is_empty() {
        return vec![];
    }

    let projection_distance = sanitize_projection_distance(projection_distance);
    let vertex_count = flat_vertices.len() / dimension;
    let mut positions = vec![0.0f32; vertex_count * 3];

    // OPT-WASM-RUST-6: Specialized paths for common dimensions
    match dimension {
        3 => project_vertices_3d(
            &mut positions,
            flat_vertices,
            vertex_count,
            projection_distance,
        ),
        4 => project_vertices_4d(
            &mut positions,
            flat_vertices,
            vertex_count,
            projection_distance,
        ),
        5 => project_vertices_5d(
            &mut positions,
            flat_vertices,
            vertex_count,
            projection_distance,
        ),
        _ => project_vertices_nd(
            &mut positions,
            flat_vertices,
            vertex_count,
            dimension,
            projection_distance,
        ),
    }

    positions
}

/// 3D projection (no higher dims, just perspective divide)
#[inline(always)]
fn project_vertices_3d(positions: &mut [f32], verts: &[f64], count: usize, proj_dist: f64) {
    for i in 0..count {
        let offset = i * 3;
        let x = finite_or_zero(verts[offset]);
        let y = finite_or_zero(verts[offset + 1]);
        let z = finite_or_zero(verts[offset + 2]);
        let scale = 1.0 / proj_dist;
        let out_idx = i * 3;
        positions[out_idx] = project_component(x, scale);
        positions[out_idx + 1] = project_component(y, scale);
        positions[out_idx + 2] = project_component(z, scale);
    }
}

/// 4D projection (unrolled, single higher dim)
#[inline(always)]
fn project_vertices_4d(positions: &mut [f32], verts: &[f64], count: usize, proj_dist: f64) {
    for i in 0..count {
        let offset = i * 4;
        let x = finite_or_zero(verts[offset]);
        let y = finite_or_zero(verts[offset + 1]);
        let z = finite_or_zero(verts[offset + 2]);
        let w = finite_or_zero(verts[offset + 3]);
        // num_higher_dims = 1, normalization_factor = 1.0
        let effective_depth = w;
        let mut denom = proj_dist - effective_depth;
        if denom.abs() < MIN_SAFE_DISTANCE {
            denom = if denom >= 0.0 {
                MIN_SAFE_DISTANCE
            } else {
                -MIN_SAFE_DISTANCE
            };
        }
        let scale = 1.0 / denom;
        let out_idx = i * 3;
        positions[out_idx] = project_component(x, scale);
        positions[out_idx + 1] = project_component(y, scale);
        positions[out_idx + 2] = project_component(z, scale);
    }
}

/// 5D projection (unrolled, two higher dims)
#[inline(always)]
fn project_vertices_5d(positions: &mut [f32], verts: &[f64], count: usize, proj_dist: f64) {
    const NORM_FACTOR: f64 = std::f64::consts::SQRT_2;
    for i in 0..count {
        let offset = i * 5;
        let x = finite_or_zero(verts[offset]);
        let y = finite_or_zero(verts[offset + 1]);
        let z = finite_or_zero(verts[offset + 2]);
        let w = finite_or_zero(verts[offset + 3]);
        let v = finite_or_zero(verts[offset + 4]);
        let effective_depth = finite_or_zero((w + v) / NORM_FACTOR);
        let mut denom = proj_dist - effective_depth;
        if denom.abs() < MIN_SAFE_DISTANCE {
            denom = if denom >= 0.0 {
                MIN_SAFE_DISTANCE
            } else {
                -MIN_SAFE_DISTANCE
            };
        }
        let scale = 1.0 / denom;
        let out_idx = i * 3;
        positions[out_idx] = project_component(x, scale);
        positions[out_idx + 1] = project_component(y, scale);
        positions[out_idx + 2] = project_component(z, scale);
    }
}

/// Generic N-D projection (fallback)
fn project_vertices_nd(
    positions: &mut [f32],
    verts: &[f64],
    count: usize,
    dim: usize,
    proj_dist: f64,
) {
    let num_higher_dims = dim - 3;
    let normalization_factor = (num_higher_dims as f64).sqrt();

    for i in 0..count {
        let offset = i * dim;
        let x = finite_or_zero(verts[offset]);
        let y = finite_or_zero(verts[offset + 1]);
        let z = finite_or_zero(verts[offset + 2]);

        let mut effective_depth = 0.0;
        for d in 3..dim {
            effective_depth += finite_or_zero(verts[offset + d]);
        }
        effective_depth = finite_or_zero(effective_depth / normalization_factor);

        let mut denom = proj_dist - effective_depth;
        if denom.abs() < MIN_SAFE_DISTANCE {
            denom = if denom >= 0.0 {
                MIN_SAFE_DISTANCE
            } else {
                -MIN_SAFE_DISTANCE
            };
        }
        let scale = 1.0 / denom;
        let out_idx = i * 3;
        positions[out_idx] = project_component(x, scale);
        positions[out_idx + 1] = project_component(y, scale);
        positions[out_idx + 2] = project_component(z, scale);
    }
}
