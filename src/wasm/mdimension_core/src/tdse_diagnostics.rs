//! TDSE Diagnostics — Scar Correlation and Level Spacing Statistics
//!
//! Provides WASM-accelerated implementations of:
//! - Eigenstate–orbit scar correlation (Gaussian tube overlap)
//! - Level spacing statistics (Brody parameter, KS test, classification)
//!
//! These are called periodically (not every frame) for diagnostic overlays.

// Short variable names (d, n, m, s, b) are conventional in numerical code
#![allow(clippy::similar_names)]

use std::f64::consts::PI;

// ============================================================================
// Gamma Function (Lanczos approximation)
// ============================================================================

/// Lanczos g=7 coefficients — MUST match the TypeScript implementation
/// in `levelSpacing.ts` for numerical equivalence.
const LANCZOS_G: f64 = 7.0;
const LANCZOS_COEFFICIENTS: [f64; 9] = [
    0.999_999_999_999_809_93,
    676.520_368_121_885_1,
    -1259.139_216_722_402_8,
    771.323_428_777_653_13,
    -176.615_029_162_140_59,
    12.507_343_278_686_905,
    -0.138_571_095_265_720_12,
    9.984_369_578_019_571_6e-6,
    1.505_632_735_149_311_6e-7,
];

/// Lanczos approximation of the gamma function for positive real arguments.
///
/// Uses the reflection formula for z < 0.5.
/// Coefficients match the TypeScript implementation exactly.
fn gamma_fn(z: f64) -> f64 {
    if z < 0.5 {
        // Reflection formula: Γ(z) = π / (sin(πz) · Γ(1-z))
        return PI / ((PI * z).sin() * gamma_fn(1.0 - z));
    }

    let z = z - 1.0;
    let mut x = LANCZOS_COEFFICIENTS[0];
    for i in 1..=(LANCZOS_G as usize + 1) {
        x += LANCZOS_COEFFICIENTS[i] / (z + i as f64);
    }
    let t = z + LANCZOS_G + 0.5;
    (2.0 * PI).sqrt() * t.powf(z + 0.5) * (-t).exp() * x
}

// ============================================================================
// Level Spacing Statistics
// ============================================================================

/// Golden section search tolerance for Brody parameter fitting.
const GOLDEN_SECTION_TOL: f64 = 1e-6;

/// Maximum golden section search iterations.
const GOLDEN_SECTION_MAX_ITER: usize = 50;

/// Golden ratio conjugate: (√5 - 1) / 2 ≈ 0.618
const PHI: f64 = 0.618_033_988_749_894_85;

/// Kolmogorov-Smirnov statistic between empirical CDF and Brody CDF.
///
/// The Brody CDF is: F(s) = 1 - exp(-b · s^(β+1))
/// where b = Γ((β+2)/(β+1))^(β+1)
fn ks_statistic(sorted_spacings: &[f64], beta: f64) -> f64 {
    let n = sorted_spacings.len();
    if n == 0 {
        return 0.0;
    }

    let bp1 = beta + 1.0;
    let b = gamma_fn((beta + 2.0) / bp1).powf(bp1);

    let mut max_d: f64 = 0.0;
    for i in 0..n {
        let empirical = (i + 1) as f64 / n as f64;
        let theoretical = 1.0 - (-b * sorted_spacings[i].powf(bp1)).exp();
        let d = (empirical - theoretical).abs();
        if d > max_d {
            max_d = d;
        }
    }
    max_d
}

/// Fit the Brody parameter β ∈ [0, 1] to unfolded spacings via golden
/// section search minimizing the KS statistic.
fn fit_brody_parameter(spacings: &mut [f64]) -> f64 {
    if spacings.len() < 2 {
        return 0.0;
    }

    // Sort spacings for CDF comparison
    spacings.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = spacings.len();

    let mut a = 0.0_f64;
    let mut b = 1.0_f64;
    let mut c = b - PHI * (b - a);
    let mut d = a + PHI * (b - a);
    let mut ks_c = ks_statistic(&spacings[..n], c);
    let mut ks_d = ks_statistic(&spacings[..n], d);

    for _ in 0..GOLDEN_SECTION_MAX_ITER {
        if b - a < GOLDEN_SECTION_TOL {
            break;
        }
        if ks_c < ks_d {
            b = d;
            d = c;
            ks_d = ks_c;
            c = b - PHI * (b - a);
            ks_c = ks_statistic(&spacings[..n], c);
        } else {
            a = c;
            c = d;
            ks_c = ks_d;
            d = a + PHI * (b - a);
            ks_d = ks_statistic(&spacings[..n], d);
        }
    }

    (a + b) / 2.0
}

/// Compute level spacing statistics from energy eigenvalues.
///
/// Returns a packed `Vec<f64>`:
///   `[spacings...(N-1 values), brody_beta, mean_spacing, classification_code]`
///
/// Classification codes: 0 = poisson, 1 = intermediate, 2 = wigner-dyson
///
/// # Arguments
/// * `energies` - Eigenvalue array (at least 3 elements for meaningful results)
pub fn compute_level_spacing(energies: &[f64]) -> Vec<f64> {
    let n = energies.len();
    if n < 2 {
        // Return empty spacings + beta=0, mean=0, classification=0 (poisson)
        return vec![0.0, 0.0, 0.0];
    }

    // Sort energies ascending
    let mut sorted = energies.to_vec();
    sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // Nearest-neighbor spacings
    let num_spacings = n - 1;
    let mut raw_spacings = Vec::with_capacity(num_spacings);
    for i in 1..n {
        raw_spacings.push(sorted[i] - sorted[i - 1]);
    }

    // Unfolding: normalize by mean spacing
    let mean_spacing: f64 = raw_spacings.iter().sum::<f64>() / num_spacings as f64;
    let mut spacings = if mean_spacing > 0.0 {
        raw_spacings.iter().map(|&s| s / mean_spacing).collect::<Vec<f64>>()
    } else {
        raw_spacings.clone()
    };

    // Brody parameter fit (modifies spacings in-place via sort)
    let brody_beta = fit_brody_parameter(&mut spacings);

    // Classification thresholds (match TS exactly)
    let classification_code: f64 = if brody_beta < 0.3 {
        0.0 // poisson
    } else if brody_beta > 0.7 {
        2.0 // wigner-dyson
    } else {
        1.0 // intermediate
    };

    // Pack result: [spacings (unfolded, sorted by fit_brody), brody_beta, mean_spacing, classification]
    // Note: spacings are returned sorted (as the TS version does in its return value — the
    // unfolded spacings are the same values regardless of sort order, and the consumer
    // uses them for distribution analysis where order doesn't matter).
    let mut result = Vec::with_capacity(num_spacings + 3);

    // Return unfolded spacings (re-compute from raw to preserve original order)
    if mean_spacing > 0.0 {
        for s in &raw_spacings {
            result.push(s / mean_spacing);
        }
    } else {
        result.extend_from_slice(&raw_spacings);
    }

    result.push(brody_beta);
    result.push(mean_spacing);
    result.push(classification_code);
    result
}

// ============================================================================
// Scar Correlation
// ============================================================================

/// Gaussian weight threshold — contributions below this are skipped.
/// Matches the TypeScript `if (w > 1e-10)` threshold.
const GAUSSIAN_THRESHOLD: f64 = 1e-10;

/// Compute scar correlation between eigenstate density and classical orbits.
///
/// Returns a packed `Vec<f64>`:
///   `[corr_0, corr_1, ..., corr_N, max_corr, mean_corr, orbit_correlation, strongest_idx]`
///
/// # Arguments
/// * `density_re` - Eigenstate ψ_re on the lattice (f32 from GPU readback)
/// * `density_im` - Eigenstate ψ_im on the lattice (f32)
/// * `grid_sizes` - Per-dimension grid sizes (u32)
/// * `spacings` - Per-dimension lattice spacings (f64)
/// * `orbit_points_flat` - Flattened orbit positions `[x0_d0, x0_d1, ..., x0_dN, x1_d0, ...]` (f64)
/// * `orbit_lengths` - Number of points per orbit (u32)
/// * `sigma` - Gaussian tube width ε
/// * `dim` - Number of spatial dimensions
pub fn compute_scar_correlation(
    density_re: &[f32],
    density_im: &[f32],
    grid_sizes: &[u32],
    spacings: &[f64],
    orbit_points_flat: &[f64],
    orbit_lengths: &[u32],
    sigma: f64,
    dim: u32,
) -> Vec<f64> {
    let dim = dim as usize;
    let num_orbits = orbit_lengths.len();

    // Compute total grid sites
    let mut total_sites: usize = 1;
    for d in 0..dim {
        total_sites *= grid_sizes[d] as usize;
    }

    // Precompute probability density |ψ|²
    let mut density = vec![0.0f64; total_sites];
    let mut total_density: f64 = 0.0;
    for i in 0..total_sites {
        let re = density_re[i] as f64;
        let im = density_im[i] as f64;
        let rho = re * re + im * im;
        density[i] = rho;
        total_density += rho;
    }

    // Early exit: zero wavefunction
    if total_density <= 0.0 {
        let mut result = vec![0.0f64; num_orbits + 4];
        // All correlations = 0, max = 0, mean = 0, orbit_correlation = 0, strongest = 0
        result[num_orbits + 3] = 0.0; // strongest index
        return result;
    }

    // Precompute grid helpers
    let mut half_grid = vec![0.0f64; dim];
    for d in 0..dim {
        half_grid[d] = grid_sizes[d] as f64 * 0.5 - 0.5;
    }

    // Compute strides (C-order, last-axis-fastest)
    let mut strides = vec![0usize; dim];
    if dim > 0 {
        strides[dim - 1] = 1;
        for d in (0..dim - 1).rev() {
            strides[d] = strides[d + 1] * grid_sizes[d + 1] as usize;
        }
    }

    let inv_two_eps_sq = 1.0 / (2.0 * sigma * sigma);

    // Kernel radius: 3σ in grid cells
    let min_spacing = spacings.iter().copied().fold(f64::INFINITY, f64::min);
    let kernel_radius = if min_spacing > 0.0 {
        (3.0 * sigma / min_spacing).ceil().max(1.0) as i32
    } else {
        1
    };

    // Per-orbit correlation computation
    let mut orbit_correlations = Vec::with_capacity(num_orbits);
    let mut orbit_offset: usize = 0;

    for orbit_idx in 0..num_orbits {
        let orbit_len = orbit_lengths[orbit_idx] as usize;

        // Build weight function W on the grid
        let mut weight = vec![0.0f64; total_sites];

        for pt in 0..orbit_len {
            let pt_base = (orbit_offset + pt) * dim;

            // Convert orbit position to grid coordinates
            let mut center_grid = vec![0.0f64; dim];
            for d in 0..dim {
                center_grid[d] = orbit_points_flat[pt_base + d] / spacings[d] + half_grid[d];
            }

            // Add Gaussian kernel in N-D box around center
            add_gaussian_kernel(
                &mut weight,
                &center_grid,
                grid_sizes,
                &strides,
                spacings,
                &half_grid,
                &orbit_points_flat[pt_base..pt_base + dim],
                kernel_radius,
                inv_two_eps_sq,
                dim,
            );
        }

        // Compute scar correlation: C = (Σ ρ·W) / (totalDensity · meanW)
        let mut dot_product: f64 = 0.0;
        let mut total_weight: f64 = 0.0;
        for i in 0..total_sites {
            dot_product += density[i] * weight[i];
            total_weight += weight[i];
        }

        let mean_weight = total_weight / total_sites as f64;
        let denominator = total_density * mean_weight;

        let c = if denominator > 0.0 {
            dot_product / denominator
        } else {
            0.0
        };
        orbit_correlations.push(c);

        orbit_offset += orbit_len;
    }

    // Summary statistics
    let mut max_correlation: f64 = 0.0;
    let mut strongest_orbit_index: usize = 0;
    let mut sum_correlation: f64 = 0.0;

    for (i, &c) in orbit_correlations.iter().enumerate() {
        sum_correlation += c;
        if c > max_correlation {
            max_correlation = c;
            strongest_orbit_index = i;
        }
    }

    let mean_correlation = if !orbit_correlations.is_empty() {
        sum_correlation / orbit_correlations.len() as f64
    } else {
        0.0
    };

    let orbit_correlation = if mean_correlation > 0.0 {
        max_correlation / mean_correlation
    } else {
        0.0
    };

    // Pack result: [per_orbit_correlations..., max, mean, orbit_correlation, strongest_idx]
    let mut result = Vec::with_capacity(num_orbits + 4);
    result.extend_from_slice(&orbit_correlations);
    result.push(max_correlation);
    result.push(mean_correlation);
    result.push(orbit_correlation);
    result.push(strongest_orbit_index as f64);
    result
}

/// Add Gaussian kernel centered at an orbit point to the weight grid.
///
/// Iterates over all grid cells within `radius` of the center in each dimension,
/// computing exp(-|x_grid - x_orbit|² / (2ε²)) and accumulating into `weight`.
fn add_gaussian_kernel(
    weight: &mut [f64],
    center_grid: &[f64],
    grid_sizes: &[u32],
    strides: &[usize],
    spacings: &[f64],
    half_grid: &[f64],
    orbit_pos: &[f64],
    radius: i32,
    inv_two_eps_sq: f64,
    dim: usize,
) {
    // Compute bounds per dimension
    let mut lo = vec![0i32; dim];
    let mut hi = vec![0i32; dim];
    let mut coords = vec![0i32; dim];

    for d in 0..dim {
        let center = center_grid[d].round() as i32;
        lo[d] = 0i32.max(center - radius);
        hi[d] = ((grid_sizes[d] as i32) - 1).min(center + radius);
        coords[d] = lo[d];
    }

    // Iterate through all cells in the N-D box [lo, hi]
    loop {
        // Compute distance² and linear index
        let mut dist2: f64 = 0.0;
        let mut linear_idx: usize = 0;
        for d in 0..dim {
            let pos_grid = (coords[d] as f64 - half_grid[d]) * spacings[d];
            let dx = pos_grid - orbit_pos[d];
            dist2 += dx * dx;
            linear_idx += coords[d] as usize * strides[d];
        }

        // Add Gaussian contribution
        let w = (-dist2 * inv_two_eps_sq).exp();
        if w > GAUSSIAN_THRESHOLD {
            weight[linear_idx] += w;
        }

        // Increment N-D counter (last dimension fastest)
        let mut carry = true;
        for d in (0..dim).rev() {
            if carry {
                coords[d] += 1;
                if coords[d] <= hi[d] {
                    carry = false;
                } else {
                    coords[d] = lo[d];
                    if d == 0 {
                        return; // All cells enumerated
                    }
                }
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TOL: f64 = 1e-10;

    // ── Gamma function tests ──

    #[test]
    fn test_gamma_1() {
        // Γ(1) = 0! = 1
        assert!((gamma_fn(1.0) - 1.0).abs() < TOL, "Γ(1) = {}", gamma_fn(1.0));
    }

    #[test]
    fn test_gamma_half() {
        // Γ(0.5) = √π
        let expected = PI.sqrt();
        let result = gamma_fn(0.5);
        assert!(
            (result - expected).abs() < 1e-8,
            "Γ(0.5) = {} (expected {})",
            result,
            expected
        );
    }

    #[test]
    fn test_gamma_5() {
        // Γ(5) = 4! = 24
        let result = gamma_fn(5.0);
        assert!(
            (result - 24.0).abs() < 1e-6,
            "Γ(5) = {} (expected 24)",
            result
        );
    }

    #[test]
    fn test_gamma_integer_sequence() {
        // Γ(n) = (n-1)! for positive integers
        // Γ(1)=1, Γ(2)=1, Γ(3)=2, Γ(4)=6, Γ(5)=24, Γ(6)=120, Γ(7)=720
        let expected_values: [(usize, f64); 7] = [
            (1, 1.0),
            (2, 1.0),
            (3, 2.0),
            (4, 6.0),
            (5, 24.0),
            (6, 120.0),
            (7, 720.0),
        ];
        for (n, expected) in expected_values {
            let result = gamma_fn(n as f64);
            assert!(
                (result - expected).abs() < 1e-6,
                "Γ({}) = {} (expected {})",
                n,
                result,
                expected
            );
        }
    }

    #[test]
    fn test_gamma_1_5() {
        // Γ(1.5) = √π / 2 ≈ 0.886226925...
        let expected = PI.sqrt() / 2.0;
        let result = gamma_fn(1.5);
        assert!(
            (result - expected).abs() < 1e-8,
            "Γ(1.5) = {} (expected {})",
            result,
            expected
        );
    }

    // ── KS statistic tests ──

    #[test]
    fn test_ks_perfect_poisson() {
        // For β=0, Brody CDF = 1 - exp(-s), which is the exponential CDF.
        // If spacings are drawn from exponential(1), KS should be small.
        // Use the exact CDF quantiles: s_i = -ln(1 - (i+0.5)/n)
        let n = 100;
        let mut spacings: Vec<f64> = (0..n)
            .map(|i| -(1.0 - (i as f64 + 0.5) / n as f64).ln())
            .collect();
        spacings.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let ks = ks_statistic(&spacings, 0.0);
        assert!(
            ks < 0.02,
            "KS statistic for perfect Poisson quantiles should be near 0, got {}",
            ks
        );
    }

    #[test]
    fn test_ks_mismatch() {
        // Uniform spacings [0.5, 1.0, 1.5, 2.0] tested against β=1 should give non-trivial KS
        let spacings = vec![0.5, 1.0, 1.5, 2.0];
        let ks = ks_statistic(&spacings, 1.0);
        assert!(ks > 0.0, "KS statistic should be positive");
        assert!(ks <= 1.0, "KS statistic should be at most 1.0");
    }

    // ── Level spacing tests ──

    #[test]
    fn test_level_spacing_uniform() {
        // Equally spaced energies: spacings are all 1/meanSpacing = 1 after unfolding
        let energies: Vec<f64> = (0..20).map(|i| i as f64).collect();
        let result = compute_level_spacing(&energies);

        let num_spacings = energies.len() - 1;
        assert_eq!(result.len(), num_spacings + 3);

        // All unfolded spacings should be 1.0
        for i in 0..num_spacings {
            assert!(
                (result[i] - 1.0).abs() < 1e-10,
                "spacing[{}] = {} (expected 1.0)",
                i,
                result[i]
            );
        }

        let mean_spacing = result[num_spacings + 1];
        assert!(
            (mean_spacing - 1.0).abs() < 1e-10,
            "mean spacing = {} (expected 1.0)",
            mean_spacing
        );
    }

    #[test]
    fn test_level_spacing_poisson_like() {
        // Exponentially distributed spacings → β ≈ 0 (Poisson)
        // Use cumulative sums of exponential variates
        let mut energies = vec![0.0f64];
        let spacings_exp = [
            0.12, 0.45, 0.03, 1.2, 0.67, 0.02, 0.89, 0.34, 0.56, 0.01, 0.78, 0.23, 0.91, 0.05,
            1.45, 0.11, 0.67, 0.03, 0.98, 0.42, 0.15, 0.73, 0.08, 0.54, 1.1, 0.22, 0.04, 0.88,
            0.31, 0.65,
        ];
        let mut cumsum = 0.0;
        for &s in &spacings_exp {
            cumsum += s;
            energies.push(cumsum);
        }

        let result = compute_level_spacing(&energies);
        let num_spacings = energies.len() - 1;
        let brody_beta = result[num_spacings];
        let classification = result[num_spacings + 2];

        assert!(
            brody_beta < 0.5,
            "Poisson-like spacings should give β < 0.5, got {}",
            brody_beta
        );
        assert!(
            (classification - 0.0).abs() < 0.5,
            "Should classify as poisson (0) or intermediate (1), got {}",
            classification
        );
    }

    #[test]
    fn test_level_spacing_small_input() {
        // Fewer than 2 eigenvalues → minimal result
        let result = compute_level_spacing(&[1.0]);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn test_level_spacing_two_eigenvalues() {
        let result = compute_level_spacing(&[1.0, 3.0]);
        assert_eq!(result.len(), 4); // 1 spacing + 3 metadata
        assert!((result[0] - 1.0).abs() < 1e-10); // single unfolded spacing = 1.0
    }

    // ── Scar correlation tests ──

    #[test]
    fn test_scar_zero_density() {
        // All-zero wavefunction → all correlations = 0
        let density_re = vec![0.0f32; 64];
        let density_im = vec![0.0f32; 64];
        let grid_sizes = vec![4u32, 4, 4];
        let spacings = vec![1.0f64; 3];

        // One orbit with 2 points at origin
        let orbit_points = vec![0.0f64; 6]; // 2 points × 3 dims
        let orbit_lengths = vec![2u32];

        let result =
            compute_scar_correlation(&density_re, &density_im, &grid_sizes, &spacings, &orbit_points, &orbit_lengths, 1.0, 3);

        // Should have 1 correlation + 4 summary values
        assert_eq!(result.len(), 5);
        assert!((result[0]).abs() < 1e-10, "correlation should be 0");
        assert!((result[1]).abs() < 1e-10, "max should be 0");
    }

    #[test]
    fn test_scar_uniform_density() {
        // Uniform density with orbit at center → correlation ≈ 1
        let n = 8;
        let total = n * n; // 2D grid
        let density_re: Vec<f32> = vec![1.0; total];
        let density_im: Vec<f32> = vec![0.0; total];
        let grid_sizes = vec![n as u32, n as u32];
        let spacing = 1.0;
        let spacings = vec![spacing; 2];

        // Single orbit with one point at grid center
        let center = 0.0; // Center of grid in physical coords
        let orbit_points = vec![center, center];
        let orbit_lengths = vec![1u32];

        let result = compute_scar_correlation(
            &density_re,
            &density_im,
            &grid_sizes,
            &spacings,
            &orbit_points,
            &orbit_lengths,
            2.0, // sigma
            2,   // dim
        );

        assert_eq!(result.len(), 5); // 1 orbit + 4 summary
        // For uniform density, correlation should be ≈ 1.0
        let correlation = result[0];
        assert!(
            (correlation - 1.0).abs() < 0.15,
            "Uniform density should give correlation ≈ 1.0, got {}",
            correlation
        );
    }

    #[test]
    fn test_scar_localized_density() {
        // Localized density at center with orbit through center → high correlation
        // Localized density away from orbit → low correlation
        let n = 16;
        let total = n * n;
        let spacing = 1.0;
        let half = n as f64 * 0.5 - 0.5;

        // Create density localized near grid center
        let mut density_re = vec![0.0f32; total];
        for iy in 0..n {
            for ix in 0..n {
                let x = (ix as f64 - half) * spacing;
                let y = (iy as f64 - half) * spacing;
                let r2 = x * x + y * y;
                density_re[iy * n + ix] = (-r2 / 4.0).exp() as f32;
            }
        }
        let density_im = vec![0.0f32; total];
        let grid_sizes = vec![n as u32, n as u32];
        let spacings = vec![spacing; 2];

        // Orbit 1: through center → should have high correlation
        let orbit_center = vec![0.0, 0.0, 0.5, 0.5, -0.5, -0.5];
        // Orbit 2: far from center → should have lower correlation
        let orbit_edge = vec![6.0, 6.0, 6.5, 6.5, 5.5, 5.5];
        let mut orbit_points = orbit_center;
        orbit_points.extend_from_slice(&orbit_edge);
        let orbit_lengths = vec![3u32, 3u32];

        let result = compute_scar_correlation(
            &density_re,
            &density_im,
            &grid_sizes,
            &spacings,
            &orbit_points,
            &orbit_lengths,
            2.0,
            2,
        );

        assert_eq!(result.len(), 6); // 2 orbits + 4 summary
        let corr_center = result[0];
        let corr_edge = result[1];

        // Center orbit should have higher correlation than edge orbit
        assert!(
            corr_center > corr_edge,
            "Center orbit correlation ({}) should exceed edge orbit ({})",
            corr_center,
            corr_edge
        );

        // Strongest orbit should be index 0 (center)
        let strongest_idx = result[5];
        assert!(
            (strongest_idx - 0.0).abs() < 0.5,
            "Strongest orbit should be index 0, got {}",
            strongest_idx
        );
    }

    #[test]
    fn test_scar_no_orbits() {
        // No orbits → empty correlations + zero summary
        let density_re = vec![1.0f32; 8];
        let density_im = vec![0.0f32; 8];
        let grid_sizes = vec![8u32];
        let spacings = vec![1.0f64];
        let orbit_points: Vec<f64> = vec![];
        let orbit_lengths: Vec<u32> = vec![];

        let result = compute_scar_correlation(
            &density_re,
            &density_im,
            &grid_sizes,
            &spacings,
            &orbit_points,
            &orbit_lengths,
            1.0,
            1,
        );

        // 0 orbits + 4 summary values
        assert_eq!(result.len(), 4);
        assert!((result[0]).abs() < 1e-10); // max = 0
        assert!((result[1]).abs() < 1e-10); // mean = 0
    }
}
