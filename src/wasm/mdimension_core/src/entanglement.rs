//! Coordinate entanglement — reduced density matrix & Hermitian eigendecomposition.
//!
//! Treats the N spatial dimensions of a single-particle wavefunction as N
//! quantum subsystems. Computes the reduced density matrix (RDM) for each
//! dimension by tracing out all others, then extracts eigenvalues via Jacobi
//! iteration for von Neumann entropy computation.
//!
//! Data layout:
//! - Wavefunction: separate `psi_re[f32]` and `psi_im[f32]` arrays (from GPU readback)
//! - RDM: separate `re[f64]` and `im[f64]` arrays, row-major M×M
//! - Grid: `grid_size[u32]` with dimensions `[M_0, M_1, ..., M_{N-1}]`

// Matrix algorithm variables intentionally use similar short names (aij/akj, idx_ki/idx_kj)
#![allow(clippy::similar_names)]

// ============================================================================
// Constants
// ============================================================================

/// Eigenvalue threshold: values below this are treated as zero in entropy.
const EIGENVALUE_THRESHOLD: f64 = 1e-12;

/// Jacobi convergence tolerance for off-diagonal magnitude.
const JACOBI_TOLERANCE: f64 = 1e-14;

/// Maximum sweeps before giving up.
const MAX_SWEEPS: usize = 100;

/// Maximum allowed RDM size for joint computations.
const MAX_JOINT_RDM: usize = 1024;

// ============================================================================
// Index Arithmetic
// ============================================================================

/// Compute row-major strides for an N-dimensional grid.
#[inline]
fn compute_strides(grid_size: &[u32]) -> Vec<usize> {
    let n = grid_size.len();
    let mut strides = vec![0usize; n];
    if n == 0 {
        return strides;
    }
    strides[n - 1] = 1;
    for d in (0..n - 1).rev() {
        strides[d] = strides[d + 1] * grid_size[d + 1] as usize;
    }
    strides
}

// ============================================================================
// Reduced Density Matrix (single dimension)
// ============================================================================

/// Compute the reduced density matrix for dimension `dim_index` by tracing out
/// all other dimensions.
///
/// Returns packed `[re_flat(M*M), im_flat(M*M)]` as `Vec<f64>`.
///
/// # Arguments
/// * `psi_re` - Real part of wavefunction (f32)
/// * `psi_im` - Imaginary part of wavefunction (f32)
/// * `grid_size` - Grid dimensions
/// * `dim_index` - Which dimension to keep (trace out all others)
pub fn compute_rdm(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[u32],
    dim_index: usize,
) -> Vec<f64> {
    let n = grid_size.len();
    let m = grid_size[dim_index] as usize;
    let total_sites = psi_re.len();

    let mut rho_re = vec![0.0f64; m * m];
    let mut rho_im = vec![0.0f64; m * m];

    let strides = compute_strides(grid_size);
    let target_stride = strides[dim_index];
    let num_fibers = total_sites / m;

    // Build reduced grid (all dims except target)
    let mut reduced_dims = Vec::with_capacity(n - 1);
    let mut reduced_strides = Vec::with_capacity(n - 1);
    for d in 0..n {
        if d != dim_index {
            reduced_dims.push(grid_size[d] as usize);
            reduced_strides.push(strides[d]);
        }
    }

    // Strides within the reduced index space
    let red_n = reduced_dims.len();
    let mut red_strides = vec![0usize; red_n];
    if red_n > 0 {
        red_strides[red_n - 1] = 1;
        for d in (0..red_n - 1).rev() {
            red_strides[d] = red_strides[d + 1] * reduced_dims[d + 1];
        }
    }

    // Temporary buffer for one fiber's psi values
    let mut fiber_re = vec![0.0f64; m];
    let mut fiber_im = vec![0.0f64; m];

    for f in 0..num_fibers {
        // Decompose fiber index into reduced coordinates and compute base index
        let mut base_idx = 0usize;
        let mut remainder = f;
        for rd in 0..red_n {
            let coord = remainder / red_strides[rd];
            remainder -= coord * red_strides[rd];
            base_idx += coord * reduced_strides[rd];
        }

        // Extract fiber values
        for i in 0..m {
            let idx = base_idx + i * target_stride;
            fiber_re[i] = f64::from(psi_re[idx]);
            fiber_im[i] = f64::from(psi_im[idx]);
        }

        // Accumulate outer product: ρ(i,j) += ψ(i) · ψ*(j)
        for i in 0..m {
            let ri = fiber_re[i];
            let ii = fiber_im[i];

            // Diagonal: |ψ_i|²
            rho_re[i * m + i] += ri * ri + ii * ii;

            // Off-diagonal (upper triangle, then mirror)
            for j in (i + 1)..m {
                let rj = fiber_re[j];
                let ij = fiber_im[j];
                // ψ_i · ψ_j* = (ri + i·ii)(rj - i·ij)
                let re_val = ri * rj + ii * ij;
                let im_val = ii * rj - ri * ij;
                let u_idx = i * m + j;
                let l_idx = j * m + i;
                rho_re[u_idx] += re_val;
                rho_im[u_idx] += im_val;
                rho_re[l_idx] += re_val;
                rho_im[l_idx] -= im_val;
            }
        }
    }

    // Pack output: [re_flat..., im_flat...]
    let mut result = Vec::with_capacity(2 * m * m);
    result.extend_from_slice(&rho_re);
    result.extend_from_slice(&rho_im);
    result
}

// ============================================================================
// Joint Reduced Density Matrix (multiple dimensions)
// ============================================================================

/// Compute the joint reduced density matrix for a set of dimensions.
///
/// Returns packed `[re_flat(M*M), im_flat(M*M)]` as `Vec<f64>`,
/// where M = product of kept dimensions' sizes.
/// Returns empty Vec if M > `MAX_JOINT_RDM`.
///
/// # Arguments
/// * `psi_re` - Real part of wavefunction (f32)
/// * `psi_im` - Imaginary part of wavefunction (f32)
/// * `grid_size` - Grid dimensions
/// * `kept_dims` - Indices of dimensions to keep (sorted ascending)
pub fn compute_joint_rdm(
    psi_re: &[f32],
    psi_im: &[f32],
    grid_size: &[u32],
    kept_dims: &[u32],
) -> Vec<f64> {
    // Compute joint dimension size
    let mut m_joint: usize = 1;
    for &d in kept_dims {
        m_joint *= grid_size[d as usize] as usize;
    }
    if m_joint > MAX_JOINT_RDM {
        return Vec::new();
    }

    let n = grid_size.len();
    let total_sites = psi_re.len();
    let strides = compute_strides(grid_size);

    let mut rho_re = vec![0.0f64; m_joint * m_joint];
    let mut rho_im = vec![0.0f64; m_joint * m_joint];

    // Build joint strides (strides within the kept-dimensions sub-grid)
    let k_len = kept_dims.len();
    let mut joint_strides = vec![0usize; k_len];
    if k_len > 0 {
        joint_strides[k_len - 1] = 1;
        for k in (0..k_len - 1).rev() {
            joint_strides[k] = joint_strides[k + 1] * grid_size[kept_dims[k + 1] as usize] as usize;
        }
    }

    // Build traced dimensions (all dims NOT in kept_dims)
    let mut dim_in_kept = vec![false; n];
    for &d in kept_dims {
        dim_in_kept[d as usize] = true;
    }
    let mut traced_dims = Vec::with_capacity(n - k_len);
    for d in 0..n {
        if !dim_in_kept[d] {
            traced_dims.push(d);
        }
    }

    let num_fibers = total_sites / m_joint;
    let t_n = traced_dims.len();

    // Build reduced strides for traced dimensions
    let traced_grid_sizes: Vec<usize> =
        traced_dims.iter().map(|&d| grid_size[d] as usize).collect();
    let traced_full_strides: Vec<usize> = traced_dims.iter().map(|&d| strides[d]).collect();
    let mut traced_red_strides = vec![0usize; t_n];
    if t_n > 0 {
        traced_red_strides[t_n - 1] = 1;
        for k in (0..t_n - 1).rev() {
            traced_red_strides[k] = traced_red_strides[k + 1] * traced_grid_sizes[k + 1];
        }
    }

    // Temporary fiber buffer
    let mut fiber_re = vec![0.0f64; m_joint];
    let mut fiber_im = vec![0.0f64; m_joint];

    for f in 0..num_fibers {
        // Compute base index for this fiber
        let mut base_idx = 0usize;
        let mut remainder = f;
        for k in 0..t_n {
            let coord = remainder / traced_red_strides[k];
            remainder -= coord * traced_red_strides[k];
            base_idx += coord * traced_full_strides[k];
        }

        // Extract fiber: iterate over all joint indices
        for ji in 0..m_joint {
            let mut idx = base_idx;
            let mut rem = ji;
            for k in 0..k_len {
                let coord = rem / joint_strides[k];
                rem -= coord * joint_strides[k];
                idx += coord * strides[kept_dims[k] as usize];
            }
            fiber_re[ji] = f64::from(psi_re[idx]);
            fiber_im[ji] = f64::from(psi_im[idx]);
        }

        // Accumulate outer product
        for i in 0..m_joint {
            let ri = fiber_re[i];
            let ii = fiber_im[i];
            rho_re[i * m_joint + i] += ri * ri + ii * ii;
            for j in (i + 1)..m_joint {
                let rj = fiber_re[j];
                let ij = fiber_im[j];
                let re_val = ri * rj + ii * ij;
                let im_val = ii * rj - ri * ij;
                let u_idx = i * m_joint + j;
                let l_idx = j * m_joint + i;
                rho_re[u_idx] += re_val;
                rho_im[u_idx] += im_val;
                rho_re[l_idx] += re_val;
                rho_im[l_idx] -= im_val;
            }
        }
    }

    // Pack output
    let mut result = Vec::with_capacity(2 * m_joint * m_joint);
    result.extend_from_slice(&rho_re);
    result.extend_from_slice(&rho_im);
    result
}

// ============================================================================
// Jacobi Eigendecomposition
// ============================================================================

/// 2×2 analytical Hermitian eigenvalues (sorted descending).
///
/// For [[a, b+ci], [b-ci, d]], eigenvalues = ((a+d) ± sqrt((a-d)² + 4(b²+c²))) / 2.
#[inline]
fn eigenvalues_2x2(re: &[f64], im: &[f64]) -> Vec<f64> {
    let a = re[0];
    let d = re[3];
    let b_re = re[1];
    let b_im = im[1];
    let trace = a + d;
    let diff = a - d;
    let disc = (diff * diff + 4.0 * (b_re * b_re + b_im * b_im)).sqrt();
    let l1 = (trace + disc) * 0.5;
    let l2 = (trace - disc) * 0.5;
    if l1 >= l2 {
        vec![l1, l2]
    } else {
        vec![l2, l1]
    }
}

/// Jacobi eigendecomposition for an M×M Hermitian matrix.
///
/// Uses the factored approach: for each off-diagonal element a_{pq},
///   1. Phase rotation D to make a_{pq} real
///   2. Real Jacobi rotation R to zero it out
///
/// Returns eigenvalues sorted descending.
///
/// # Arguments
/// * `re` - Real part of Hermitian matrix (row-major, M×M)
/// * `im` - Imaginary part of Hermitian matrix (row-major, M×M)
/// * `n` - Matrix dimension
///
/// # Panics
/// Panics if the Jacobi iteration fails to converge within `MAX_SWEEPS`
/// sweeps. Non-converged diagonal entries are not eigenvalues; returning
/// them silently would feed downstream consumers (von Neumann entropy,
/// coordinate entanglement) plausible-looking but incorrect numbers.
/// Under WASM the panic surfaces as a JavaScript exception via
/// `console_error_panic_hook` installed in the module `start` fn.
pub fn hermitian_eigenvalues(re: &[f64], im: &[f64], n: usize) -> Vec<f64> {
    hermitian_eigenvalues_bounded(re, im, n, MAX_SWEEPS)
}

/// Same as [`hermitian_eigenvalues`] but with an explicit sweep cap.
///
/// Exposed separately so tests can deterministically force the
/// non-convergence path (e.g. `max_sweeps = 0` on a non-diagonal input).
/// Internal callers and the WASM binding should continue to use
/// [`hermitian_eigenvalues`] with the module-level `MAX_SWEEPS`.
///
/// # Panics
/// Panics if the off-diagonal Frobenius norm is not brought below
/// `JACOBI_TOLERANCE` within `max_sweeps`. The panic message carries
/// the residual and the tolerance for diagnostics.
pub fn hermitian_eigenvalues_bounded(
    re: &[f64],
    im: &[f64],
    n: usize,
    max_sweeps: usize,
) -> Vec<f64> {
    // Trivial cases
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![re[0]];
    }
    if n == 2 {
        return eigenvalues_2x2(re, im);
    }

    // Work on copies since we mutate during rotation
    let mut work_re = re.to_vec();
    let mut work_im = im.to_vec();

    let mut converged = false;
    for _sweep in 0..max_sweeps {
        let mut sweep_max_off_diag: f64 = 0.0;

        for pi in 0..n - 1 {
            for pj in (pi + 1)..n {
                let idx = pi * n + pj;
                let aij_re = work_re[idx];
                let aij_im = work_im[idx];
                let aij_mag = (aij_re * aij_re + aij_im * aij_im).sqrt();

                if aij_mag > sweep_max_off_diag {
                    sweep_max_off_diag = aij_mag;
                }
                if aij_mag < JACOBI_TOLERANCE {
                    continue;
                }

                // Step 1: Phase rotation to make a_{pi,pj} real
                if aij_im.abs() > 1e-30 * aij_mag {
                    let e_minus_alpha_re = aij_re / aij_mag;
                    let e_minus_alpha_im = -aij_im / aij_mag;
                    let e_alpha_re = aij_re / aij_mag;
                    let e_alpha_im = aij_im / aij_mag;

                    // Multiply column pj by e^{-iα}
                    for k in 0..n {
                        let cidx = k * n + pj;
                        let r = work_re[cidx];
                        let i = work_im[cidx];
                        work_re[cidx] = r * e_minus_alpha_re - i * e_minus_alpha_im;
                        work_im[cidx] = r * e_minus_alpha_im + i * e_minus_alpha_re;
                    }

                    // Multiply row pj by e^{iα}
                    for k in 0..n {
                        let ridx = pj * n + k;
                        let r = work_re[ridx];
                        let i = work_im[ridx];
                        work_re[ridx] = r * e_alpha_re - i * e_alpha_im;
                        work_im[ridx] = r * e_alpha_im + i * e_alpha_re;
                    }
                }

                // After phase rotation, off-diagonal is real
                let aij_real = work_re[pi * n + pj];
                if aij_real.abs() < JACOBI_TOLERANCE {
                    continue;
                }

                // Step 2: Real Jacobi rotation
                let aii = work_re[pi * n + pi];
                let ajj = work_re[pj * n + pj];

                let tau = (aii - ajj) / (2.0 * aij_real);
                let t = if tau >= 0.0 {
                    1.0 / (tau + (1.0 + tau * tau).sqrt())
                } else {
                    -1.0 / (-tau + (1.0 + tau * tau).sqrt())
                };
                let c = 1.0 / (1.0 + t * t).sqrt();
                let s = t * c;

                // Column rotation: B = A · R
                for k in 0..n {
                    let idx_ki = k * n + pi;
                    let idx_kj = k * n + pj;
                    let aki_re = work_re[idx_ki];
                    let aki_im = work_im[idx_ki];
                    let akj_re = work_re[idx_kj];
                    let akj_im = work_im[idx_kj];

                    work_re[idx_ki] = c * aki_re + s * akj_re;
                    work_im[idx_ki] = c * aki_im + s * akj_im;
                    work_re[idx_kj] = -s * aki_re + c * akj_re;
                    work_im[idx_kj] = -s * aki_im + c * akj_im;
                }

                // Row rotation: A' = R^T · B
                for k in 0..n {
                    let idx_ik = pi * n + k;
                    let idx_jk = pj * n + k;
                    let aik_re = work_re[idx_ik];
                    let aik_im = work_im[idx_ik];
                    let ajk_re = work_re[idx_jk];
                    let ajk_im = work_im[idx_jk];

                    work_re[idx_ik] = c * aik_re + s * ajk_re;
                    work_im[idx_ik] = c * aik_im + s * ajk_im;
                    work_re[idx_jk] = -s * aik_re + c * ajk_re;
                    work_im[idx_jk] = -s * aik_im + c * ajk_im;
                }

                // Force exact zero to prevent drift
                work_re[pi * n + pj] = 0.0;
                work_im[pi * n + pj] = 0.0;
                work_re[pj * n + pi] = 0.0;
                work_im[pj * n + pi] = 0.0;

                // Force diagonal to be real
                work_im[pi * n + pi] = 0.0;
                work_im[pj * n + pj] = 0.0;
            }
        }

        if sweep_max_off_diag < JACOBI_TOLERANCE {
            converged = true;
            break;
        }
    }

    // Post-loop residual check. Scan the current off-diagonal max directly
    // rather than trusting the last `sweep_max_off_diag` — this also gives
    // a correct residual when `max_sweeps == 0` and the sweep loop never
    // executed. A matrix that was already within tolerance on entry is
    // accepted as converged regardless of the sweep budget.
    if !converged {
        let mut residual: f64 = 0.0;
        for i in 0..n - 1 {
            for j in (i + 1)..n {
                let r = work_re[i * n + j];
                let im_val = work_im[i * n + j];
                let mag = (r * r + im_val * im_val).sqrt();
                if mag > residual {
                    residual = mag;
                }
            }
        }
        assert!(
            residual < JACOBI_TOLERANCE,
            "hermitian_eigenvalues: failed to converge within {max_sweeps} sweeps \
             (n={n}, residual={residual:.3e}, tolerance={JACOBI_TOLERANCE:.3e})"
        );
    }

    // Extract eigenvalues from diagonal
    let mut eigenvalues = Vec::with_capacity(n);
    for i in 0..n {
        eigenvalues.push(work_re[i * n + i]);
    }

    // Sort descending
    eigenvalues.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

    eigenvalues
}

// ============================================================================
// Von Neumann Entropy
// ============================================================================

/// Compute von Neumann entropy S = -Σ λ_k log(λ_k) from eigenvalues.
///
/// Eigenvalues below threshold are treated as zero.
/// Result is clamped to >= 0.
pub fn von_neumann_entropy(eigenvalues: &[f64]) -> f64 {
    let mut s = 0.0f64;
    for &lam in eigenvalues {
        if lam > EIGENVALUE_THRESHOLD {
            s -= lam * lam.ln();
        }
    }
    s.max(0.0)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TOL: f64 = 1e-10;
    const TOL_F32: f64 = 1e-5; // Looser tolerance for f32 input round-trips

    // ── Helpers ──────────────────────────────────────────────────────────

    /// Create a normalized product state ψ(x₁,...,x_N) = Π_d φ_d(x_d).
    fn make_product_state(factors: &[&[f32]], grid_size: &[u32]) -> (Vec<f32>, Vec<f32>) {
        let n = grid_size.len();
        let total: usize = grid_size.iter().map(|&s| s as usize).product();

        let strides = compute_strides(grid_size);

        let mut re = vec![0.0f32; total];
        let im = vec![0.0f32; total];

        for idx in 0..total {
            let mut val = 1.0f64;
            let mut remainder = idx;
            for d in 0..n {
                let coord = remainder / strides[d];
                remainder -= coord * strides[d];
                val *= f64::from(factors[d][coord]);
            }
            re[idx] = val as f32;
        }

        (re, im)
    }

    /// Create a normalized Gaussian factor.
    fn gaussian_factor(m: usize, center: f64, sigma: f64) -> Vec<f32> {
        let mut f = vec![0.0f32; m];
        let mut norm_sq = 0.0f64;
        for i in 0..m {
            let x = i as f64 - center;
            let val = (-x * x / (2.0 * sigma * sigma)).exp();
            f[i] = val as f32;
            norm_sq += val * val;
        }
        let inv_sqrt = 1.0 / norm_sq.sqrt();
        for v in &mut f {
            *v = (*v as f64 * inv_sqrt) as f32;
        }
        f
    }

    /// Normalize psi arrays in place.
    fn normalize(re: &mut [f32], im: &mut [f32]) {
        let mut norm_sq = 0.0f64;
        for i in 0..re.len() {
            norm_sq += f64::from(re[i]) * f64::from(re[i]) + f64::from(im[i]) * f64::from(im[i]);
        }
        let inv = 1.0 / norm_sq.sqrt();
        for v in re.iter_mut() {
            *v = (*v as f64 * inv) as f32;
        }
        for v in im.iter_mut() {
            *v = (*v as f64 * inv) as f32;
        }
    }

    // ── RDM tests ───────────────────────────────────────────────────────

    #[test]
    fn test_rdm_product_state_gives_pure_rdm() {
        let m = 8u32;
        let mut phi1 = vec![0.0f32; m as usize];
        phi1[0] = 1.0 / 2.0f32.sqrt();
        phi1[1] = 1.0 / 2.0f32.sqrt();
        let mut phi2 = vec![0.0f32; m as usize];
        phi2[0] = 1.0;

        let (re, im) = make_product_state(&[&phi1, &phi2], &[m, m]);
        let packed = compute_rdm(&re, &im, &[m, m], 0);

        let m_sz = m as usize;
        let rho_re = &packed[..m_sz * m_sz];

        // ρ₁ should be |φ₁⟩⟨φ₁| = diag(0.5, 0.5, 0,...) with off-diag (0,1)=0.5
        assert!((rho_re[0 * m_sz + 0] - 0.5).abs() < TOL_F32);
        assert!((rho_re[1 * m_sz + 1] - 0.5).abs() < TOL_F32);
        assert!((rho_re[0 * m_sz + 1] - 0.5).abs() < TOL_F32);
        for i in 2..m_sz {
            assert!(rho_re[i * m_sz + i].abs() < TOL_F32);
        }
    }

    #[test]
    fn test_rdm_maximally_entangled_gives_uniform() {
        let m = 4u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let im = vec![0.0f32; total];
        for i in 0..m_sz {
            re[i * m_sz + i] = 1.0 / (m_sz as f32).sqrt();
        }

        let packed = compute_rdm(&re, &im, &[m, m], 0);
        let rho_re = &packed[..m_sz * m_sz];
        let rho_im = &packed[m_sz * m_sz..];

        // ρ₁ = I/M
        for i in 0..m_sz {
            assert!(
                (rho_re[i * m_sz + i] - 1.0 / m_sz as f64).abs() < TOL,
                "diagonal {i}: expected {}, got {}",
                1.0 / m_sz as f64,
                rho_re[i * m_sz + i]
            );
            for j in (i + 1)..m_sz {
                assert!(rho_re[i * m_sz + j].abs() < TOL);
                assert!(rho_im[i * m_sz + j].abs() < TOL);
            }
        }
    }

    #[test]
    fn test_rdm_unit_trace() {
        let m = 16u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let mut im = vec![0.0f32; total];
        for i in 0..total {
            re[i] = (i as f64 * 3.7 + 0.5).sin() as f32;
            im[i] = (i as f64 * 2.3 + 1.1).cos() as f32;
        }
        normalize(&mut re, &mut im);

        let packed = compute_rdm(&re, &im, &[m, m], 0);
        let rho_re = &packed[..m_sz * m_sz];

        let mut trace = 0.0f64;
        for i in 0..m_sz {
            trace += rho_re[i * m_sz + i];
        }
        assert!((trace - 1.0).abs() < 1e-5, "trace = {trace}, expected 1.0");
    }

    #[test]
    fn test_rdm_hermitian() {
        let m = 16u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let mut im = vec![0.0f32; total];
        for i in 0..total {
            re[i] = (i as f64 * 7.3 + 0.1).sin() as f32;
            im[i] = (i as f64 * 5.1 + 0.3).cos() as f32;
        }
        normalize(&mut re, &mut im);

        let packed = compute_rdm(&re, &im, &[m, m], 0);
        let rho_re = &packed[..m_sz * m_sz];
        let rho_im = &packed[m_sz * m_sz..];

        for i in 0..m_sz {
            for j in (i + 1)..m_sz {
                assert!(
                    (rho_re[i * m_sz + j] - rho_re[j * m_sz + i]).abs() < 1e-10,
                    "re[{i},{j}] != re[{j},{i}]"
                );
                assert!(
                    (rho_im[i * m_sz + j] + rho_im[j * m_sz + i]).abs() < 1e-10,
                    "im[{i},{j}] != -im[{j},{i}]"
                );
            }
        }
    }

    #[test]
    fn test_rdm_product_state_3d_zero_entropy() {
        let m = 8u32;
        let m_sz = m as usize;
        let g1 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 1.5);
        let g2 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 2.0);
        let g3 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 1.0);

        let (re, im) = make_product_state(&[&g1, &g2, &g3], &[m, m, m]);

        for d in 0..3 {
            let packed = compute_rdm(&re, &im, &[m, m, m], d);
            let rho_re = &packed[..m_sz * m_sz];
            let rho_im = &packed[m_sz * m_sz..];
            let eigs = hermitian_eigenvalues(rho_re, rho_im, m_sz);
            let s = von_neumann_entropy(&eigs);
            assert!(s < 1e-4, "dim {d}: entropy = {s}, expected ~0");
        }
    }

    // ── Joint RDM tests ─────────────────────────────────────────────────

    #[test]
    fn test_joint_rdm_all_dims_is_pure() {
        let m = 4u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let mut im = vec![0.0f32; total];
        for i in 0..total {
            re[i] = (i as f64 * 2.1).sin() as f32;
            im[i] = (i as f64 * 3.5).cos() as f32;
        }
        normalize(&mut re, &mut im);

        let packed = compute_joint_rdm(&re, &im, &[m, m], &[0, 1]);
        let m_joint = m_sz * m_sz;
        assert_eq!(packed.len(), 2 * m_joint * m_joint);

        let rho_re = &packed[..m_joint * m_joint];
        let rho_im = &packed[m_joint * m_joint..];

        let eigs = hermitian_eigenvalues(rho_re, rho_im, m_joint);
        // Should have rank 1: one eigenvalue ≈ 1, rest ≈ 0
        assert!(
            (eigs[0] - 1.0).abs() < 1e-4,
            "largest eigenvalue = {}, expected 1.0",
            eigs[0]
        );
        let rest_sum: f64 = eigs[1..].iter().map(|&x| x.abs()).sum();
        assert!(rest_sum < 1e-4, "rest sum = {rest_sum}, expected ~0");
    }

    #[test]
    fn test_joint_rdm_exceeds_limit_returns_empty() {
        let m = 64u32;
        let total = (m * m) as usize;
        let re = vec![0.0f32; total];
        let im = vec![0.0f32; total];
        // M_joint = 64*64 = 4096 > 1024
        let packed = compute_joint_rdm(&re, &im, &[m, m], &[0, 1]);
        assert!(packed.is_empty());
    }

    // ── Eigenvalue tests ────────────────────────────────────────────────

    #[test]
    fn test_eigenvalues_diagonal_matrix() {
        let m = 4;
        let mut re = vec![0.0f64; m * m];
        let im = vec![0.0f64; m * m];
        re[0] = 0.5;
        re[5] = 0.3;
        re[10] = 0.15;
        re[15] = 0.05;

        let eigs = hermitian_eigenvalues(&re, &im, m);
        assert!((eigs[0] - 0.5).abs() < TOL);
        assert!((eigs[1] - 0.3).abs() < TOL);
        assert!((eigs[2] - 0.15).abs() < TOL);
        assert!((eigs[3] - 0.05).abs() < TOL);
    }

    #[test]
    fn test_eigenvalues_known_2x2_hermitian() {
        // [[0.7, 0.1+0.2i], [0.1-0.2i, 0.3]]
        // Eigenvalues: 0.8, 0.2
        let re = vec![0.7, 0.1, 0.1, 0.3];
        let im = vec![0.0, 0.2, -0.2, 0.0];

        let eigs = hermitian_eigenvalues(&re, &im, 2);
        assert!(
            (eigs[0] - 0.8).abs() < TOL,
            "λ₁ = {}, expected 0.8",
            eigs[0]
        );
        assert!(
            (eigs[1] - 0.2).abs() < TOL,
            "λ₂ = {}, expected 0.2",
            eigs[1]
        );
    }

    #[test]
    fn test_eigenvalues_identity() {
        let m = 4;
        let mut re = vec![0.0f64; m * m];
        let im = vec![0.0f64; m * m];
        for i in 0..m {
            re[i * m + i] = 1.0;
        }

        let eigs = hermitian_eigenvalues(&re, &im, m);
        for &e in &eigs {
            assert!((e - 1.0).abs() < TOL, "eigenvalue = {e}, expected 1.0");
        }
    }

    #[test]
    fn test_eigenvalues_sum_to_trace() {
        let m = 8;
        // Build a random Hermitian matrix
        let mut re = vec![0.0f64; m * m];
        let mut im = vec![0.0f64; m * m];
        for i in 0..m {
            re[i * m + i] = (i as f64 * 1.3 + 0.5).sin();
            for j in (i + 1)..m {
                let rv = (i as f64 * 3.7 + j as f64 * 2.1).sin();
                let iv = (i as f64 * 5.3 + j as f64 * 1.7).cos();
                re[i * m + j] = rv;
                im[i * m + j] = iv;
                re[j * m + i] = rv;
                im[j * m + i] = -iv;
            }
        }

        let mut trace = 0.0f64;
        for i in 0..m {
            trace += re[i * m + i];
        }

        let eigs = hermitian_eigenvalues(&re, &im, m);
        let eig_sum: f64 = eigs.iter().sum();
        assert!(
            (eig_sum - trace).abs() < 1e-8,
            "eigenvalue sum = {eig_sum}, trace = {trace}"
        );
    }

    #[test]
    fn test_eigenvalues_positive_semidefinite_rdm() {
        let m = 8u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let mut im = vec![0.0f32; total];
        for i in 0..total {
            re[i] = (i as f64 * 11.7).sin() as f32;
            im[i] = (i as f64 * 7.3).cos() as f32;
        }
        normalize(&mut re, &mut im);

        let packed = compute_rdm(&re, &im, &[m, m], 0);
        let rho_re = &packed[..m_sz * m_sz];
        let rho_im = &packed[m_sz * m_sz..];

        let eigs = hermitian_eigenvalues(rho_re, rho_im, m_sz);
        for (k, &e) in eigs.iter().enumerate() {
            assert!(e >= -1e-10, "eigenvalue[{k}] = {e}, expected >= 0");
        }
    }

    #[test]
    fn test_eigenvalues_1x1() {
        let eigs = hermitian_eigenvalues(&[3.14], &[0.0], 1);
        assert_eq!(eigs.len(), 1);
        assert!((eigs[0] - 3.14).abs() < TOL);
    }

    #[test]
    #[should_panic(expected = "failed to converge within 0 sweeps")]
    fn test_hermitian_eigenvalues_bounded_panics_on_non_convergence() {
        // A non-diagonal 4×4 Hermitian matrix with zero sweep budget —
        // the solver cannot zero any off-diagonal and must therefore
        // panic in the post-loop residual check. This is the regression
        // guard for the silent-fallthrough bug: the old implementation
        // would have returned `[0.5, 0.3, 0.15, 0.05]` as "eigenvalues"
        // even though the matrix is nowhere close to diagonal.
        let m = 4;
        let mut re = vec![0.0f64; m * m];
        let im = vec![0.0f64; m * m];
        // Diagonal + a strong off-diagonal pair — far from diagonal.
        re[0] = 0.5;
        re[5] = 0.3;
        re[10] = 0.15;
        re[15] = 0.05;
        re[1] = 0.4;
        re[4] = 0.4;
        re[11] = 0.2;
        re[14] = 0.2;
        let _ = hermitian_eigenvalues_bounded(&re, &im, m, 0);
    }

    #[test]
    fn test_hermitian_eigenvalues_bounded_accepts_diagonal_with_zero_budget() {
        // A matrix that is already diagonal on entry has residual 0 and
        // must be accepted even with `max_sweeps = 0`. This confirms the
        // residual-check branch distinguishes "never ran" from "ran but
        // failed to converge".
        let m = 4;
        let mut re = vec![0.0f64; m * m];
        let im = vec![0.0f64; m * m];
        re[0] = 0.7;
        re[5] = 0.2;
        re[10] = 0.08;
        re[15] = 0.02;
        let eigs = hermitian_eigenvalues_bounded(&re, &im, m, 0);
        assert_eq!(eigs.len(), m);
        assert!((eigs[0] - 0.7).abs() < TOL);
        assert!((eigs[1] - 0.2).abs() < TOL);
        assert!((eigs[2] - 0.08).abs() < TOL);
        assert!((eigs[3] - 0.02).abs() < TOL);
    }

    // ── Von Neumann entropy tests ───────────────────────────────────────

    #[test]
    fn test_entropy_pure_state() {
        let eigs = vec![1.0, 0.0, 0.0, 0.0];
        assert!(von_neumann_entropy(&eigs).abs() < TOL);
    }

    #[test]
    fn test_entropy_maximally_mixed() {
        let m = 8;
        let eigs: Vec<f64> = vec![1.0 / m as f64; m];
        let s = von_neumann_entropy(&eigs);
        let expected = (m as f64).ln();
        assert!((s - expected).abs() < TOL, "S = {s}, expected {expected}");
    }

    #[test]
    fn test_entropy_two_equal() {
        let eigs = vec![0.5, 0.5, 0.0, 0.0];
        let s = von_neumann_entropy(&eigs);
        assert!(
            (s - 2.0f64.ln()).abs() < TOL,
            "S = {s}, expected {}",
            2.0f64.ln()
        );
    }

    #[test]
    fn test_entropy_non_negative() {
        // Even with slightly imprecise eigenvalues, entropy should be >= 0
        let eigs = vec![1.0 + 1e-14, -1e-14];
        let s = von_neumann_entropy(&eigs);
        assert!(s >= 0.0, "entropy = {s}, expected >= 0");
    }

    // ── Full pipeline test ──────────────────────────────────────────────

    #[test]
    fn test_full_pipeline_product_state() {
        let m = 8u32;
        let m_sz = m as usize;
        let g1 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 1.5);
        let g2 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 2.0);

        let (re, im) = make_product_state(&[&g1, &g2], &[m, m]);

        // For each dimension, compute RDM -> eigenvalues -> entropy
        for d in 0..2 {
            let packed = compute_rdm(&re, &im, &[m, m], d);
            let rho_re = &packed[..m_sz * m_sz];
            let rho_im = &packed[m_sz * m_sz..];
            let eigs = hermitian_eigenvalues(rho_re, rho_im, m_sz);
            let s = von_neumann_entropy(&eigs);
            assert!(s < 1e-4, "dim {d}: entropy = {s}, expected ~0");

            // Eigenvalues sum to 1
            let eig_sum: f64 = eigs.iter().sum();
            assert!(
                (eig_sum - 1.0).abs() < 1e-4,
                "dim {d}: eigenvalue sum = {eig_sum}"
            );
        }
    }

    #[test]
    fn test_full_pipeline_maximally_entangled() {
        let m = 4u32;
        let m_sz = m as usize;
        let total = m_sz * m_sz;
        let mut re = vec![0.0f32; total];
        let im = vec![0.0f32; total];
        for i in 0..m_sz {
            re[i * m_sz + i] = 1.0 / (m_sz as f32).sqrt();
        }

        let packed = compute_rdm(&re, &im, &[m, m], 0);
        let rho_re = &packed[..m_sz * m_sz];
        let rho_im = &packed[m_sz * m_sz..];
        let eigs = hermitian_eigenvalues(rho_re, rho_im, m_sz);
        let s = von_neumann_entropy(&eigs);
        let expected = (m_sz as f64).ln();
        assert!(
            (s - expected).abs() < 1e-6,
            "entropy = {s}, expected {expected}"
        );
    }

    #[test]
    fn test_mutual_information_product_state() {
        let m = 8u32;
        let m_sz = m as usize;
        let g1 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 1.5);
        let g2 = gaussian_factor(m_sz, m_sz as f64 / 2.0, 2.0);

        let (re, im) = make_product_state(&[&g1, &g2], &[m, m]);

        // Individual entropies
        let packed1 = compute_rdm(&re, &im, &[m, m], 0);
        let s1 = von_neumann_entropy(&hermitian_eigenvalues(
            &packed1[..m_sz * m_sz],
            &packed1[m_sz * m_sz..],
            m_sz,
        ));

        let packed2 = compute_rdm(&re, &im, &[m, m], 1);
        let s2 = von_neumann_entropy(&hermitian_eigenvalues(
            &packed2[..m_sz * m_sz],
            &packed2[m_sz * m_sz..],
            m_sz,
        ));

        // Joint entropy
        let joint_packed = compute_joint_rdm(&re, &im, &[m, m], &[0, 1]);
        let mj = m_sz * m_sz;
        let s12 = von_neumann_entropy(&hermitian_eigenvalues(
            &joint_packed[..mj * mj],
            &joint_packed[mj * mj..],
            mj,
        ));

        let mi = (s1 + s2 - s12).max(0.0);
        assert!(mi < 1e-4, "mutual information = {mi}, expected ~0");
    }
}
