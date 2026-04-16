//! Measurement collapse kernels on N-D lattices.
//!
//! Mirrors the TS implementations in `src/lib/physics/measurement.ts`. Both
//! full and partial collapses use C-order linear indexing (last-axis-fastest)
//! matching the WGSL shaders so the post-collapse wavefunction uploads
//! byte-compatibly to GPU storage.

/// Full Gaussian collapse: `ψ_re[i] = exp(-|x - center|² / (2σ²))`, `ψ_im = 0`.
///
/// Returns a packed `Vec<f32>` of length `2 * total_sites` layered as
/// `[re_0..re_{N-1}, im_0..im_{N-1}]`. The caller unpacks into two slices —
/// mirrors the JS contract that returns `[psiRe, psiIm]`.
///
/// Per-dimension compact (periodic) axes wrap the displacement to the
/// shortest path on the torus: `δ ← δ - L · round(δ / L)`.
pub fn compute_full_collapse(
    grid_size: &[u32],
    spacing: &[f64],
    center: &[f64],
    sigma: f64,
    compact_dims: Option<&[u8]>,
) -> Vec<f32> {
    let lattice_dim = grid_size.len();
    if lattice_dim == 0 || spacing.len() < lattice_dim || center.len() < lattice_dim {
        return Vec::new();
    }
    let mut total_sites: usize = 1;
    for &g in grid_size {
        total_sites = match total_sites.checked_mul(g as usize) {
            Some(t) if t > 0 => t,
            _ => return Vec::new(),
        };
    }

    let sigma2 = (sigma * sigma).max(1e-8);

    let mut packed = vec![0.0_f32; total_sites * 2];
    let mut coord_ints = vec![0_u32; lattice_dim];

    for (i, slot) in packed.iter_mut().take(total_sites).enumerate() {
        let mut remaining = i;
        for d in (0..lattice_dim).rev() {
            let size = grid_size[d] as usize;
            let c = remaining % size;
            remaining = (remaining - c) / size;
            coord_ints[d] = c as u32;
        }

        let mut dist2 = 0.0_f64;
        for (d, &c) in coord_ints.iter().enumerate() {
            let size = f64::from(grid_size[d]);
            let pos = (f64::from(c) - size * 0.5 + 0.5) * spacing[d];
            let mut delta = pos - center[d];
            if compact_dims.is_some_and(|cd| cd.get(d).copied().unwrap_or(0) != 0) {
                let l = size * spacing[d];
                delta -= l * (delta / l).round();
            }
            dist2 += delta * delta;
        }

        *slot = (-dist2 / (2.0 * sigma2)).exp() as f32;
    }

    packed
}

/// Partial collapse along a single axis: multiply the current ψ by a 1D
/// Gaussian envelope `exp(-(x_d - x_meas)² / (2σ²))` along axis `axis`.
///
/// Returns packed `[re_0..re_{N-1}, im_0..im_{N-1}]`.
#[allow(clippy::too_many_arguments)]
pub fn compute_partial_collapse(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[u32],
    spacing: &[f64],
    axis: u32,
    axis_position: f64,
    sigma: f64,
    axis_compact: bool,
) -> Vec<f32> {
    let lattice_dim = grid_size.len();
    let axis_idx = axis as usize;
    if lattice_dim == 0 || axis_idx >= lattice_dim || spacing.len() < lattice_dim {
        return Vec::new();
    }
    let mut total_sites: usize = 1;
    for &g in grid_size {
        total_sites = match total_sites.checked_mul(g as usize) {
            Some(t) if t > 0 => t,
            _ => return Vec::new(),
        };
    }
    if psi_re.len() != total_sites || psi_im.len() != total_sites {
        return Vec::new();
    }

    let axis_size = grid_size[axis_idx] as usize;
    let axis_spacing = spacing[axis_idx];
    let sigma2 = (sigma * sigma).max(1e-8);
    let axis_l = axis_size as f64 * axis_spacing;

    // Precompute the 1D envelope along the measured axis — mirrors the JS
    // optimization that avoids recomputing the Gaussian per voxel.
    let mut envelope = vec![0.0_f32; axis_size];
    for (k, slot) in envelope.iter_mut().enumerate() {
        let pos = (k as f64 - axis_size as f64 * 0.5 + 0.5) * axis_spacing;
        let mut delta = pos - axis_position;
        if axis_compact {
            delta -= axis_l * (delta / axis_l).round();
        }
        *slot = (-(delta * delta) / (2.0 * sigma2)).exp() as f32;
    }

    // Stride for the measured axis under C-order linearisation: product of
    // grid sizes strictly after `axis`.
    let axis_stride: usize = grid_size
        .iter()
        .skip(axis_idx + 1)
        .map(|&g| g as usize)
        .product();

    let mut packed = vec![0.0_f32; total_sites * 2];
    for i in 0..total_sites {
        // Extract coord along `axis`: strip the lower (faster) axes, then
        // modulo by `axis_size`. Matches the generic `extractAxisCoord` in
        // `measurement.ts` without allocating per-voxel arrays.
        let axis_coord = (i / axis_stride) % axis_size;
        let g = envelope[axis_coord];
        packed[i] = psi_re[i] * g;
        packed[total_sites + i] = psi_im[i] * g;
    }

    packed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_collapse_peaks_at_center() {
        // 2D 16×16 lattice, spacing 0.1, center at origin.
        let grid = [16_u32, 16_u32];
        let spc = [0.1_f64, 0.1_f64];
        let center = [0.0, 0.0];
        let packed = compute_full_collapse(&grid, &spc, &center, 1.0, None);
        assert_eq!(packed.len(), 16 * 16 * 2);
        // Peak value should be ≈ 1.0 at the site nearest (0,0). With even
        // grid, the nearest sites are the four around origin — each has
        // |x|=0.05 so e^{-0.0025} ≈ 0.9975.
        let mut max_re = 0.0_f32;
        for i in 0..(16 * 16) {
            if packed[i] > max_re {
                max_re = packed[i];
            }
        }
        assert!(max_re > 0.99 && max_re <= 1.0);
    }

    #[test]
    fn full_collapse_imag_is_zero() {
        let grid = [8_u32, 8_u32];
        let spc = [0.1_f64, 0.1_f64];
        let packed = compute_full_collapse(&grid, &spc, &[0.0, 0.0], 0.5, None);
        let total = 8 * 8;
        for i in 0..total {
            assert_eq!(packed[total + i], 0.0);
        }
    }

    #[test]
    fn partial_collapse_preserves_shape_and_envelope() {
        // 2D 8×8: axis 0 (x). Psi uniform = (1, 0). Check envelope applied
        // along axis 0, independent of y.
        let grid = [8_u32, 8_u32];
        let spc = [0.1_f64, 0.1_f64];
        let total: usize = 8 * 8;
        let psi_re = vec![1.0_f32; total];
        let psi_im = vec![0.0_f32; total];
        let packed = compute_partial_collapse(&psi_re, &psi_im, &grid, &spc, 0, 0.0, 1.0, false);
        assert_eq!(packed.len(), total * 2);

        // Reshape: axis 0 is the outer (slower) axis in C-order for 2D with
        // last-axis-fastest. i = x0 * 8 + x1. Values across x1 for fixed x0
        // should be identical.
        for x0 in 0..8 {
            let base = x0 * 8;
            let first = packed[base];
            for x1 in 1..8 {
                assert_eq!(packed[base + x1], first, "x0={x0} x1={x1}");
            }
        }
    }

    #[test]
    fn partial_collapse_rejects_bad_axis() {
        let grid = [4_u32, 4_u32];
        let spc = [0.1_f64, 0.1_f64];
        let psi = vec![0.0_f32; 16];
        let packed = compute_partial_collapse(&psi, &psi, &grid, &spc, 5, 0.0, 1.0, false);
        assert!(packed.is_empty());
    }

    #[test]
    fn full_collapse_respects_compact_axis_wrap() {
        // 1D 8-site periodic lattice, spacing 1.0 → L = 8. Measurement at
        // x = -3.9. The site at x = +3.5 is distance 0.6 on the torus
        // (wrap), 7.4 on the open line. The Gaussian value at the wrapped
        // distance should be much larger than at the open distance.
        let grid = [8_u32];
        let spc = [1.0_f64];
        let compact = [1_u8];
        let packed = compute_full_collapse(&grid, &spc, &[-3.9], 1.0, Some(&compact));
        let open = compute_full_collapse(&grid, &spc, &[-3.9], 1.0, None);
        // Site index 7 → x = 3.5. Periodic path: 0.6. Open path: 7.4.
        let periodic_val = packed[7];
        let open_val = open[7];
        assert!(
            periodic_val > open_val * 1e6,
            "expected periodic wrap to dominate: periodic={periodic_val}, open={open_val}"
        );
    }
}
