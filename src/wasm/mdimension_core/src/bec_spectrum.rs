//! BEC incompressible kinetic energy spectrum — compiled residual math.
//!
//! Velocity-field finite differences, N-D FFT (via `fft::fft_nd`),
//! Helmholtz projection, and log-spaced shell binning for the
//! Nore/Bradley superfluid decomposition. The FFT is unnormalized, so
//! energies include the physical Parseval factor `voxel_volume / N`.
//! All four steps run entirely
//! in Rust; the TypeScript caller invokes a single WASM entry point
//! (`compute_incompressible_spectrum_wasm`) and unpacks the result.
//!
//! Input layout: split `psi_re`, `psi_im` (Float32, length = prod(grid_size)).
//! Output layout: packed `Vec<f64>` —
//!   [spectrum[0..N], k_values[0..N], total_incompressible, total_compressible]
//!
//! The TypeScript caller splits the packed buffer back into the two
//! typed arrays + two scalars.

use crate::fft;

/// Standard number of spectrum bins (must match the TS constant).
pub const NUM_SPECTRUM_BINS: usize = 32;

/// Compute the BEC incompressible kinetic-energy spectrum.
///
/// Returns a packed `Vec<f64>` of length `2·NUM_SPECTRUM_BINS + 2`:
///   - `[0..NUM_SPECTRUM_BINS)` = incompressible spectrum E_incomp(k)
///   - `[NUM_SPECTRUM_BINS..2·NUM_SPECTRUM_BINS)` = k_values (bin centers)
///   - `[2N]` = total incompressible kinetic energy
///   - `[2N+1]` = total compressible kinetic energy
///
/// Empty result on invalid input.
pub fn compute_incompressible_spectrum(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[usize],
    spacing: &[f64],
    hbar: f64,
    mass: f64,
) -> Vec<f64> {
    let dim = grid_size.len();
    if dim == 0 || dim != spacing.len() {
        return Vec::new();
    }
    if !hbar.is_finite() || hbar <= 0.0 || !mass.is_finite() || mass <= 0.0 {
        return Vec::new();
    }
    // Reject non-finite or non-positive spacing up front.
    for &s in spacing {
        if !s.is_finite() || s <= 0.0 {
            return Vec::new();
        }
    }
    // Reject non-radix-2 or too-small axes: fft_1d asserts power-of-2 >= 2.
    for &n in grid_size {
        if n < 2 || !n.is_power_of_two() || n.trailing_zeros() >= fft::MAX_LOG2 as u32 {
            return Vec::new();
        }
    }
    let Some(total_sites) = grid_size
        .iter()
        .try_fold(1usize, |acc, &n| acc.checked_mul(n))
    else {
        return Vec::new();
    };
    if total_sites == 0 || psi_re.len() != total_sites || psi_im.len() != total_sites {
        return Vec::new();
    }

    let hbar_over_m = hbar / mass.max(1e-10);

    // Row-major strides (C-order, last axis fastest).
    let mut strides = vec![1usize; dim];
    for d in (0..dim - 1).rev() {
        strides[d] = strides[d + 1] * grid_size[d + 1];
    }

    // Pre-compute 0.5 / spacing per axis to avoid division in the inner loop.
    let inv_dx: Vec<f64> = spacing.iter().map(|s| 0.5 / s).collect();

    // Pre-compute inverse amplitudes: 1/|ψ| per site (for density-weighted
    // velocity u = j/|ψ|). Zero-out below tolerance to avoid 1/0.
    let mut inv_amps = vec![0.0f64; total_sites];
    for idx in 0..total_sites {
        let re0 = psi_re[idx] as f64;
        let im0 = psi_im[idx] as f64;
        let amp = (re0 * re0 + im0 * im0).sqrt();
        inv_amps[idx] = if amp > 1e-12 { 1.0 / amp } else { 0.0 };
    }

    // One Float64 component array per dimension; imaginary part is zero
    // for the density-weighted velocity (velocity is real-valued).
    let mut u_re: Vec<Vec<f64>> = (0..dim).map(|_| vec![0.0; total_sites]).collect();
    let mut u_im: Vec<Vec<f64>> = (0..dim).map(|_| vec![0.0; total_sites]).collect();

    // Step 1: density-weighted velocity via central finite differences.
    // We process each axis independently so all sites are covered with
    // a simple stride-based coordinate extraction (c = (idx / s) % N).
    for d in 0..dim {
        let n_d = grid_size[d];
        if n_d <= 1 {
            continue;
        }
        let s = strides[d];
        let inv_dx_d = inv_dx[d];
        for idx in 0..total_sites {
            let c = (idx / s) % n_d;
            let re0 = psi_re[idx] as f64;
            let im0 = psi_im[idx] as f64;

            let (d_re, d_im) = if c == 0 {
                let fwd = idx + s;
                let bwd = idx + s * (n_d - 1);
                (
                    ((psi_re[fwd] as f64) - (psi_re[bwd] as f64)) * inv_dx_d,
                    ((psi_im[fwd] as f64) - (psi_im[bwd] as f64)) * inv_dx_d,
                )
            } else if c == n_d - 1 {
                let fwd = idx - s * (n_d - 1);
                let bwd = idx - s;
                (
                    ((psi_re[fwd] as f64) - (psi_re[bwd] as f64)) * inv_dx_d,
                    ((psi_im[fwd] as f64) - (psi_im[bwd] as f64)) * inv_dx_d,
                )
            } else {
                (
                    ((psi_re[idx + s] as f64) - (psi_re[idx - s] as f64)) * inv_dx_d,
                    ((psi_im[idx + s] as f64) - (psi_im[idx - s] as f64)) * inv_dx_d,
                )
            };

            let jd = hbar_over_m * (re0 * d_im - im0 * d_re);
            u_re[d][idx] = jd * inv_amps[idx];
            // u_im[d][idx] stays 0 (density-weighted velocity is real).
        }
    }

    // Step 2: FFT each velocity component in place. The data layout expected
    // by `fft::fft_nd` is interleaved complex, so we interleave split arrays
    // for the transform and de-interleave back.
    let mut interleaved = vec![0.0f64; total_sites * 2];
    for d in 0..dim {
        for i in 0..total_sites {
            interleaved[i * 2] = u_re[d][i];
            interleaved[i * 2 + 1] = u_im[d][i];
        }
        fft::fft_nd(&mut interleaved, grid_size);
        for i in 0..total_sites {
            u_re[d][i] = interleaved[i * 2];
            u_im[d][i] = interleaved[i * 2 + 1];
        }
    }

    // Step 3: Helmholtz projection + step 4: log-spaced shell binning, combined.
    // k_grid_scale[d] = 2π / (N_d × a_d). Frequencies are centered: indices > N/2
    // correspond to negative frequencies.
    let k_grid_scale: Vec<f64> = (0..dim)
        .map(|d| 2.0 * std::f64::consts::PI / (grid_size[d] as f64 * spacing[d]))
        .collect();

    // k_min (smallest non-zero |k|) and k_max (Euclidean Nyquist corner).
    let mut k_min_sq = f64::INFINITY;
    let mut k_max_sq = 0.0f64;
    for d in 0..dim {
        let dk = k_grid_scale[d];
        k_min_sq = k_min_sq.min(dk * dk);
        let k_nyquist = std::f64::consts::PI / spacing[d];
        k_max_sq += k_nyquist * k_nyquist;
    }
    let k_min = k_min_sq.sqrt();
    let k_max = k_max_sq.sqrt();

    let log_k_min = k_min.ln();
    let log_k_max = k_max.ln();
    let log_range = log_k_max - log_k_min;
    // Guard degenerate grids where k_max ≤ k_min (e.g. very small sizes).
    if !log_range.is_finite() || log_range <= 0.0 {
        return Vec::new();
    }
    let bin_inv_log_range = NUM_SPECTRUM_BINS as f64 / log_range;

    let mut spectrum = vec![0.0f64; NUM_SPECTRUM_BINS];
    let mut k_values = vec![0.0f64; NUM_SPECTRUM_BINS];
    for b in 0..NUM_SPECTRUM_BINS {
        k_values[b] = (log_k_min + ((b as f64 + 0.5) * log_range) / NUM_SPECTRUM_BINS as f64).exp();
    }

    let half_n: Vec<usize> = grid_size.iter().map(|g| g >> 1).collect();

    let mut total_incomp = 0.0f64;
    let mut total_comp = 0.0f64;
    let mut k_vec = vec![0.0f64; dim];
    let mut coords = vec![0usize; dim];

    for idx in 0..total_sites {
        // Decompose linear idx → N-D coords (last axis fastest for row-major).
        let mut remaining = idx;
        for d in (0..dim).rev() {
            let g = grid_size[d];
            coords[d] = remaining % g;
            remaining /= g;
        }

        // Center frequencies: indices > N/2 become negative.
        let mut k_sq = 0.0f64;
        for d in 0..dim {
            let c = coords[d] as i64;
            let k_idx = if (coords[d]) < half_n[d] {
                c
            } else {
                c - (grid_size[d] as i64)
            };
            let kd = k_grid_scale[d] * (k_idx as f64);
            k_vec[d] = kd;
            k_sq += kd * kd;
        }

        // Skip DC (k=0 is purely compressible by definition).
        if k_sq < 1e-20 {
            continue;
        }

        // k · û = Σ_d k_d û_d(k).
        let mut dot_re = 0.0f64;
        let mut dot_im = 0.0f64;
        for d in 0..dim {
            let kd = k_vec[d];
            dot_re += kd * u_re[d][idx];
            dot_im += kd * u_im[d][idx];
        }

        // Helmholtz projection: û_incomp_d = û_d − k_d(k·û)/|k|².
        let inv_k_sq = 1.0 / k_sq;
        let proj_re = dot_re * inv_k_sq;
        let proj_im = dot_im * inv_k_sq;
        let mut incomp_sq = 0.0f64;
        let mut comp_sq = 0.0f64;
        for d in 0..dim {
            let kd = k_vec[d];
            let c_re = kd * proj_re;
            let c_im = kd * proj_im;
            let i_re = u_re[d][idx] - c_re;
            let i_im = u_im[d][idx] - c_im;
            incomp_sq += i_re * i_re + i_im * i_im;
            comp_sq += c_re * c_re + c_im * c_im;
        }

        total_incomp += incomp_sq;
        total_comp += comp_sq;

        // Log-spaced bin assignment.
        let k_mag = k_sq.sqrt();
        let log_k = k_mag.ln();
        let bin_raw = ((log_k - log_k_min) * bin_inv_log_range) as i64;
        let bin = bin_raw.clamp(0, NUM_SPECTRUM_BINS as i64 - 1) as usize;
        spectrum[bin] += incomp_sq;
    }

    let voxel_volume: f64 = spacing.iter().product();
    if !voxel_volume.is_finite() || voxel_volume <= 0.0 {
        return Vec::new();
    }
    let energy_scale = 0.5 * mass * (voxel_volume / total_sites as f64);
    if !energy_scale.is_finite() {
        return Vec::new();
    }

    // Scale by physical Parseval factor and pack the output.
    let mut result = Vec::with_capacity(2 * NUM_SPECTRUM_BINS + 2);
    for b in 0..NUM_SPECTRUM_BINS {
        result.push(energy_scale * spectrum[b]);
    }
    for b in 0..NUM_SPECTRUM_BINS {
        result.push(k_values[b]);
    }
    result.push(energy_scale * total_incomp);
    result.push(energy_scale * total_comp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Stationary Thomas-Fermi-like density has purely real ψ → velocity
    /// field is zero, both spectrum components should be zero.
    #[test]
    fn stationary_real_wavefunction_has_zero_kinetic_energy() {
        let n: usize = 8;
        let total = n * n * n;
        let mut psi_re = vec![0.0f32; total];
        let psi_im = vec![0.0f32; total];
        // Gaussian blob centered at (4,4,4), σ=2.
        for k in 0..n {
            for j in 0..n {
                for i in 0..n {
                    let idx = i + n * (j + n * k);
                    let dx = (i as f64) - 3.5;
                    let dy = (j as f64) - 3.5;
                    let dz = (k as f64) - 3.5;
                    let r2 = dx * dx + dy * dy + dz * dz;
                    psi_re[idx] = (-r2 / 8.0).exp() as f32;
                }
            }
        }
        let grid = [n, n, n];
        let sp = [0.5f64; 3];
        let out = compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, 1.0);
        assert_eq!(out.len(), 2 * NUM_SPECTRUM_BINS + 2);
        let total_incomp = out[2 * NUM_SPECTRUM_BINS];
        let total_comp = out[2 * NUM_SPECTRUM_BINS + 1];
        assert!(
            total_incomp.abs() < 1e-10,
            "stationary real ψ should have 0 incompressible energy, got {total_incomp}"
        );
        assert!(
            total_comp.abs() < 1e-10,
            "stationary real ψ should have 0 compressible energy, got {total_comp}"
        );
    }

    /// Plane wave ψ = exp(i·k·x) has uniform density and uniform velocity.
    /// Velocity is a constant (pure DC in k-space), which projects to
    /// purely compressible (k=0) and zero incompressible.
    #[test]
    fn plane_wave_has_zero_incompressible_component() {
        let n: usize = 8;
        let total = n * n * n;
        let mut psi_re = vec![0.0f32; total];
        let mut psi_im = vec![0.0f32; total];
        let k0: f64 = 2.0 * std::f64::consts::PI / (n as f64 * 0.5); // one full wavelength across axis-0
        for k in 0..n {
            for j in 0..n {
                for i in 0..n {
                    let idx = i + n * (j + n * k);
                    let x = (i as f64) * 0.5;
                    psi_re[idx] = (k0 * x).cos() as f32;
                    psi_im[idx] = (k0 * x).sin() as f32;
                }
            }
        }
        let grid = [n, n, n];
        let sp = [0.5f64; 3];
        let out = compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, 1.0);
        let total_incomp = out[2 * NUM_SPECTRUM_BINS];
        let total_comp = out[2 * NUM_SPECTRUM_BINS + 1];
        // Plane wave velocity is uniform → entirely at k=0 which is skipped
        // (DC bin). The incompressible component must be near zero because a
        // uniform velocity field has no curl. Allow small numerical noise.
        assert!(total_incomp.is_finite(), "incomp must be finite");
        assert!(total_comp.is_finite(), "comp must be finite");
        let total = total_incomp + total_comp;
        if total > 1e-15 {
            assert!(
                total_incomp / total < 0.01,
                "plane wave incompressible fraction should be <1%, got {:.4}%",
                100.0 * total_incomp / total
            );
        }
    }

    #[test]
    fn rejects_invalid_physical_constants() {
        let n: usize = 8;
        let total = n * n;
        let psi_re = vec![1.0f32; total];
        let psi_im = vec![0.0f32; total];
        let grid = [n, n];
        let sp = [0.5f64; 2];

        assert!(
            compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, f64::NAN, 1.0).is_empty()
        );
        assert!(compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, 0.0).is_empty());
        assert!(
            compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, f64::INFINITY)
                .is_empty()
        );
    }

    #[test]
    fn rejects_overflowed_voxel_volume() {
        let n: usize = 2;
        let total = n * n;
        let psi_re = vec![1.0f32; total];
        let psi_im = vec![0.0f32; total];
        let grid = [n, n];
        let sp = [1.0e308f64, 1.0e308f64];

        assert!(compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, 1.0).is_empty());
    }

    #[test]
    fn anisotropic_bins_use_euclidean_nyquist_corner() {
        let grid = [8usize, 8usize, 8usize];
        let spacing = [0.25f64, 0.5f64, 1.0f64];
        let total = grid.iter().product();
        let psi_re = vec![1.0f32; total];
        let psi_im = vec![0.0f32; total];

        let out = compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &spacing, 1.0, 1.0);
        assert_eq!(out.len(), 2 * NUM_SPECTRUM_BINS + 2);

        let k_min = grid
            .iter()
            .enumerate()
            .map(|(d, n)| 2.0 * std::f64::consts::PI / (*n as f64 * spacing[d]))
            .fold(f64::INFINITY, f64::min);
        let k_max = spacing
            .iter()
            .map(|dx| (std::f64::consts::PI / dx).powi(2))
            .sum::<f64>()
            .sqrt();
        let log_k_min = k_min.ln();
        let log_range = k_max.ln() - log_k_min;
        let expected_last = (log_k_min
            + ((NUM_SPECTRUM_BINS as f64 - 0.5) * log_range) / NUM_SPECTRUM_BINS as f64)
            .exp();
        let actual_last = out[2 * NUM_SPECTRUM_BINS - 1];

        assert!(
            (actual_last - expected_last).abs() < 1e-10,
            "expected last k bin {expected_last}, got {actual_last}"
        );
    }

    /// Vortex ψ = √ρ₀ · exp(i·θ) around z-axis has a phase gradient that is
    /// divergence-free → all kinetic energy must be INCOMPRESSIBLE. We check
    /// that total_incompressible > 0 and exceeds total_compressible.
    #[test]
    fn vortex_produces_nonzero_incompressible_energy() {
        let n: usize = 16;
        let total = n * n * n;
        let mut psi_re = vec![0.0f32; total];
        let mut psi_im = vec![0.0f32; total];
        let center = (n as f64) * 0.5 - 0.5;
        for k in 0..n {
            for j in 0..n {
                for i in 0..n {
                    let idx = i + n * (j + n * k);
                    let x = (i as f64) - center;
                    let y = (j as f64) - center;
                    let r = (x * x + y * y).sqrt();
                    let theta = y.atan2(x);
                    // Soft core: ρ(r) = r²/(r²+ξ²); ξ=1.5.
                    let rho = (r * r) / (r * r + 2.25);
                    let amp = rho.sqrt() as f32;
                    psi_re[idx] = amp * (theta.cos() as f32);
                    psi_im[idx] = amp * (theta.sin() as f32);
                }
            }
        }
        let grid = [n, n, n];
        let sp = [0.5f64; 3];
        let out = compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &sp, 1.0, 1.0);
        let total_incomp = out[2 * NUM_SPECTRUM_BINS];
        let total_comp = out[2 * NUM_SPECTRUM_BINS + 1];
        assert!(
            total_incomp > 0.0,
            "vortex must have nonzero incompressible energy, got {total_incomp}"
        );
        assert!(
            total_incomp > total_comp,
            "vortex should be dominantly incompressible (incomp={total_incomp}, comp={total_comp})"
        );
    }

    #[test]
    fn vortex_energy_uses_parseval_voxel_scaling() {
        let n: usize = 16;
        let total = n * n;
        let mut psi_re = vec![0.0f32; total];
        let mut psi_im = vec![0.0f32; total];
        let center = (n as f64) * 0.5 - 0.5;
        for j in 0..n {
            for i in 0..n {
                let idx = i * n + j;
                let x = (i as f64) - center;
                let y = (j as f64) - center;
                let r = (x * x + y * y).sqrt();
                let theta = y.atan2(x);
                let amp = r / (r * r + 4.0).sqrt();
                psi_re[idx] = (amp * theta.cos()) as f32;
                psi_im[idx] = (amp * theta.sin()) as f32;
            }
        }
        let grid = [n, n];
        let coarse =
            compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &[0.5, 0.5], 1.0, 1.0);
        let fine =
            compute_incompressible_spectrum(&psi_re, &psi_im, &grid, &[0.25, 0.25], 1.0, 1.0);
        let e_coarse = coarse[2 * NUM_SPECTRUM_BINS];
        let e_fine = fine[2 * NUM_SPECTRUM_BINS];
        assert!(e_coarse > 0.0);
        let ratio = e_fine / e_coarse;
        assert!(
            (0.85..1.15).contains(&ratio),
            "2D physical vortex energy should be stable under spacing rescale, got ratio {ratio}"
        );
    }
}
