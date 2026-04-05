//! Complex matrix operations for open quantum systems.
//!
//! Dense complex matrix arithmetic, Gaussian elimination, and Padé(13,13)
//! matrix exponential with scaling-and-squaring.
//!
//! Data layout: separate `re[f64]` and `im[f64]` arrays, row-major N×N.
//! Matches the TypeScript `ComplexMatrix = { real: Float64Array, imag: Float64Array }`.

// Matrix algorithms use short names (aRe/aIm, fRe/fIm, pivRe/pivIm) intentionally.
#![allow(clippy::similar_names)]
// Many internal helpers have obvious bool/float params that don't need doc.
#![allow(clippy::doc_markdown)]

use std::cell::RefCell;

// ============================================================================
// Constants
// ============================================================================

/// Maximum N for pre-allocated scratch pools. Covers K=14 → N=196.
const MAX_PADE_N: usize = 196;

/// Padé(13,13) coefficients b_k. Identical to the TypeScript `PADE_COEFFS_13`.
const PADE_COEFFS_13: [f64; 14] = [
    64_764_752_532_480_000.0,
    32_382_376_266_240_000.0,
    7_771_770_303_897_600.0,
    1_187_353_796_428_800.0,
    129_060_195_264_000.0,
    10_559_470_521_600.0,
    670_442_572_800.0,
    33_522_128_640.0,
    1_323_241_920.0,
    40_840_800.0,
    960_960.0,
    16_380.0,
    182.0,
    1.0,
];

/// θ₁₃ threshold for Padé(13,13) approximation (Al-Mohy & Higham 2009).
const THETA_13: f64 = 5.371_920_351_148_152;

/// Pivot magnitude² threshold for singular detection in Gaussian elimination.
const SINGULAR_THRESHOLD: f64 = 1e-30;

// ============================================================================
// Scratch Buffers (thread_local — WASM is single-threaded)
// ============================================================================

/// Pre-allocated scratch pool for the Padé algorithm.
/// Each buffer is sized for MAX_PADE_N × MAX_PADE_N = 38,416 f64 elements.
struct PadeScratch {
    // Matrix powers
    a_scaled_re: Vec<f64>,
    a_scaled_im: Vec<f64>,
    a2_re: Vec<f64>,
    a2_im: Vec<f64>,
    a4_re: Vec<f64>,
    a4_im: Vec<f64>,
    a6_re: Vec<f64>,
    a6_im: Vec<f64>,
    // Temporaries
    temp1_re: Vec<f64>,
    temp1_im: Vec<f64>,
    temp2_re: Vec<f64>,
    temp2_im: Vec<f64>,
    // U and V
    u_re: Vec<f64>,
    u_im: Vec<f64>,
    v_re: Vec<f64>,
    v_im: Vec<f64>,
    // Squaring scratch
    sq_re: Vec<f64>,
    sq_im: Vec<f64>,
    // Solve scratch
    solve_a_re: Vec<f64>,
    solve_a_im: Vec<f64>,
    solve_b_re: Vec<f64>,
    solve_b_im: Vec<f64>,
}

impl PadeScratch {
    fn new() -> Self {
        let cap = MAX_PADE_N * MAX_PADE_N;
        Self {
            a_scaled_re: vec![0.0; cap],
            a_scaled_im: vec![0.0; cap],
            a2_re: vec![0.0; cap],
            a2_im: vec![0.0; cap],
            a4_re: vec![0.0; cap],
            a4_im: vec![0.0; cap],
            a6_re: vec![0.0; cap],
            a6_im: vec![0.0; cap],
            temp1_re: vec![0.0; cap],
            temp1_im: vec![0.0; cap],
            temp2_re: vec![0.0; cap],
            temp2_im: vec![0.0; cap],
            u_re: vec![0.0; cap],
            u_im: vec![0.0; cap],
            v_re: vec![0.0; cap],
            v_im: vec![0.0; cap],
            sq_re: vec![0.0; cap],
            sq_im: vec![0.0; cap],
            solve_a_re: vec![0.0; cap],
            solve_a_im: vec![0.0; cap],
            solve_b_re: vec![0.0; cap],
            solve_b_im: vec![0.0; cap],
        }
    }
}

thread_local! {
    static SCRATCH: RefCell<PadeScratch> = RefCell::new(PadeScratch::new());
}

// ============================================================================
// Core Operations
// ============================================================================

/// Zero the first `size` elements of a slice.
#[inline]
fn zero_slice(s: &mut [f64], size: usize) {
    s[..size].fill(0.0);
}

/// Complex matrix multiply: C = A × B for N×N matrices.
///
/// Uses i-k-j loop order for optimal row-major cache access.
/// Skips zero elements in A (sparsity optimization matching TypeScript).
///
/// # Arguments
/// * `a_re`, `a_im` — Left matrix (N×N, row-major)
/// * `b_re`, `b_im` — Right matrix (N×N, row-major)
/// * `out_re`, `out_im` — Output matrix (N×N, row-major), must not alias A or B
/// * `n` — Matrix dimension
pub fn complex_mat_mul(
    a_re: &[f64],
    a_im: &[f64],
    b_re: &[f64],
    b_im: &[f64],
    out_re: &mut [f64],
    out_im: &mut [f64],
    n: usize,
) {
    let size = n * n;
    debug_assert!(a_re.len() >= size);
    debug_assert!(a_im.len() >= size);
    debug_assert!(b_re.len() >= size);
    debug_assert!(b_im.len() >= size);
    debug_assert!(out_re.len() >= size);
    debug_assert!(out_im.len() >= size);

    zero_slice(out_re, size);
    zero_slice(out_im, size);

    for i in 0..n {
        let i_n = i * n;
        for k in 0..n {
            let ar = a_re[i_n + k];
            let ai = a_im[i_n + k];
            // Sparsity skip — matches TypeScript complexMatMul
            if ar == 0.0 && ai == 0.0 {
                continue;
            }
            let k_n = k * n;
            for j in 0..n {
                let br = b_re[k_n + j];
                let bi = b_im[k_n + j];
                out_re[i_n + j] += ar * br - ai * bi;
                out_im[i_n + j] += ar * bi + ai * br;
            }
        }
    }
}

/// Compute the 1-norm of a complex matrix: max column sum of |a_{ij}|.
fn complex_mat_norm1(a_re: &[f64], a_im: &[f64], n: usize) -> f64 {
    let mut max_col = 0.0_f64;
    for j in 0..n {
        let mut col_sum = 0.0_f64;
        for i in 0..n {
            let idx = i * n + j;
            col_sum += (a_re[idx] * a_re[idx] + a_im[idx] * a_im[idx]).sqrt();
        }
        if col_sum > max_col {
            max_col = col_sum;
        }
    }
    max_col
}

/// Scale a complex matrix: out = scalar_re * A (scalar_im = 0 for real scaling).
fn complex_mat_scale(
    a_re: &[f64],
    a_im: &[f64],
    scalar_re: f64,
    scalar_im: f64,
    out_re: &mut [f64],
    out_im: &mut [f64],
    n: usize,
) {
    let size = n * n;
    for i in 0..size {
        let re = a_re[i];
        let im = a_im[i];
        out_re[i] = re * scalar_re - im * scalar_im;
        out_im[i] = re * scalar_im + im * scalar_re;
    }
}

// ============================================================================
// Linear System Solver
// ============================================================================

/// Solve Q · X = P via Gaussian elimination with partial pivoting.
///
/// Works on pre-allocated scratch buffers (caller provides them).
/// Result is written into `result_re` and `result_im`.
#[allow(clippy::too_many_arguments)]
fn solve_linear_system_into(
    q_re: &[f64],
    q_im: &[f64],
    p_re: &[f64],
    p_im: &[f64],
    n: usize,
    // Scratch buffers (must be >= n*n each)
    ar: &mut [f64],
    ai: &mut [f64],
    br: &mut [f64],
    bi: &mut [f64],
    // Output
    result_re: &mut [f64],
    result_im: &mut [f64],
) {
    let size = n * n;

    // Copy inputs to scratch
    ar[..size].copy_from_slice(&q_re[..size]);
    ai[..size].copy_from_slice(&q_im[..size]);
    br[..size].copy_from_slice(&p_re[..size]);
    bi[..size].copy_from_slice(&p_im[..size]);

    // Forward elimination with partial pivoting
    for col in 0..n {
        // Find pivot row
        let mut max_mag = 0.0_f64;
        let mut max_row = col;
        for row in col..n {
            let idx = row * n + col;
            let mag = ar[idx] * ar[idx] + ai[idx] * ai[idx];
            if mag > max_mag {
                max_mag = mag;
                max_row = row;
            }
        }

        // Swap rows col and max_row in both A and B
        if max_row != col {
            for j in 0..n {
                let c = col * n + j;
                let m = max_row * n + j;
                ar.swap(c, m);
                ai.swap(c, m);
                br.swap(c, m);
                bi.swap(c, m);
            }
        }

        let piv_re = ar[col * n + col];
        let piv_im = ai[col * n + col];
        let piv_mag2 = piv_re * piv_re + piv_im * piv_im;
        if piv_mag2 < SINGULAR_THRESHOLD {
            continue;
        }

        // Eliminate rows below
        for row in (col + 1)..n {
            let idx = row * n + col;
            let a_re_val = ar[idx];
            let a_im_val = ai[idx];

            // factor = A[row][col] / A[col][col]
            let f_re = (a_re_val * piv_re + a_im_val * piv_im) / piv_mag2;
            let f_im = (a_im_val * piv_re - a_re_val * piv_im) / piv_mag2;

            for j in col..n {
                let pj = col * n + j;
                let rj = row * n + j;
                ar[rj] -= f_re * ar[pj] - f_im * ai[pj];
                ai[rj] -= f_re * ai[pj] + f_im * ar[pj];
            }

            for j in 0..n {
                let pj = col * n + j;
                let rj = row * n + j;
                br[rj] -= f_re * br[pj] - f_im * bi[pj];
                bi[rj] -= f_re * bi[pj] + f_im * br[pj];
            }
        }
    }

    // Back substitution
    zero_slice(result_re, size);
    zero_slice(result_im, size);

    for j in 0..n {
        for row in (0..n).rev() {
            let mut sum_re = br[row * n + j];
            let mut sum_im = bi[row * n + j];

            for k in (row + 1)..n {
                let a_re_val = ar[row * n + k];
                let a_im_val = ai[row * n + k];
                let x_re = result_re[k * n + j];
                let x_im = result_im[k * n + j];
                sum_re -= a_re_val * x_re - a_im_val * x_im;
                sum_im -= a_re_val * x_im + a_im_val * x_re;
            }

            let piv_re = ar[row * n + row];
            let piv_im = ai[row * n + row];
            let piv_mag2 = piv_re * piv_re + piv_im * piv_im;
            if piv_mag2 < SINGULAR_THRESHOLD {
                continue;
            }

            result_re[row * n + j] = (sum_re * piv_re + sum_im * piv_im) / piv_mag2;
            result_im[row * n + j] = (sum_im * piv_re - sum_re * piv_im) / piv_mag2;
        }
    }
}

/// Solve Q · X = P via Gaussian elimination with partial pivoting.
/// Allocating version for standalone use and testing.
///
/// Returns `(result_re, result_im)` as separate `Vec<f64>`.
#[cfg(test)]
pub fn solve_linear_system(
    q_re: &[f64],
    q_im: &[f64],
    p_re: &[f64],
    p_im: &[f64],
    n: usize,
) -> (Vec<f64>, Vec<f64>) {
    let size = n * n;
    let mut ar = vec![0.0; size];
    let mut ai = vec![0.0; size];
    let mut br = vec![0.0; size];
    let mut bi = vec![0.0; size];
    let mut result_re = vec![0.0; size];
    let mut result_im = vec![0.0; size];

    solve_linear_system_into(
        q_re, q_im, p_re, p_im, n, &mut ar, &mut ai, &mut br, &mut bi, &mut result_re,
        &mut result_im,
    );

    (result_re, result_im)
}

// ============================================================================
// Matrix Exponential — Padé(13,13) with Scaling and Squaring
// ============================================================================

/// Matrix exponential via scaling-and-squaring with Padé(13,13) approximation.
///
/// Computes exp(A) for an N×N complex matrix. Standard algorithm from
/// Al-Mohy & Higham (2009), same as MATLAB's expm / scipy's expm.
///
/// Returns `(result_re, result_im)` packed as separate `Vec<f64>`.
pub fn matrix_exponential_pade(a_re: &[f64], a_im: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let size = n * n;
    let norm = complex_mat_norm1(a_re, a_im, n);

    // Zero matrix → identity
    if norm < SINGULAR_THRESHOLD {
        let mut result_re = vec![0.0; size];
        let result_im = vec![0.0; size];
        for i in 0..n {
            result_re[i * n + i] = 1.0;
        }
        return (result_re, result_im);
    }

    // Scaling: s = max(0, ceil(log2(||A||_1 / θ_13)))
    let s = 0i32.max((norm / THETA_13).log2().ceil() as i32);

    // Use thread_local scratch for N ≤ MAX_PADE_N, otherwise allocate
    if n <= MAX_PADE_N {
        SCRATCH.with(|cell| {
            let mut scratch = cell.borrow_mut();
            pade_impl(a_re, a_im, n, s, &mut scratch)
        })
    } else {
        let mut scratch = PadeScratch {
            a_scaled_re: vec![0.0; size],
            a_scaled_im: vec![0.0; size],
            a2_re: vec![0.0; size],
            a2_im: vec![0.0; size],
            a4_re: vec![0.0; size],
            a4_im: vec![0.0; size],
            a6_re: vec![0.0; size],
            a6_im: vec![0.0; size],
            temp1_re: vec![0.0; size],
            temp1_im: vec![0.0; size],
            temp2_re: vec![0.0; size],
            temp2_im: vec![0.0; size],
            u_re: vec![0.0; size],
            u_im: vec![0.0; size],
            v_re: vec![0.0; size],
            v_im: vec![0.0; size],
            sq_re: vec![0.0; size],
            sq_im: vec![0.0; size],
            solve_a_re: vec![0.0; size],
            solve_a_im: vec![0.0; size],
            solve_b_re: vec![0.0; size],
            solve_b_im: vec![0.0; size],
        };
        pade_impl(a_re, a_im, n, s, &mut scratch)
    }
}

/// Compute U and V polynomials for Padé(13,13) approximation.
///
/// Requires matrix powers A², A⁴, A⁶ already computed in scratch.
/// Writes U into `scratch.u_{re,im}` and V into `scratch.v_{re,im}`.
fn compute_pade_uv(n: usize, scratch: &mut PadeScratch) {
    let size = n * n;
    let b = &PADE_COEFFS_13;

    // Wu = b13·A6 + b11·A4 + b9·A2  (stored in temp1)
    for i in 0..size {
        scratch.temp1_re[i] =
            b[13] * scratch.a6_re[i] + b[11] * scratch.a4_re[i] + b[9] * scratch.a2_re[i];
        scratch.temp1_im[i] =
            b[13] * scratch.a6_im[i] + b[11] * scratch.a4_im[i] + b[9] * scratch.a2_im[i];
    }

    // A6Wu = A6 · Wu  (stored in temp2)
    complex_mat_mul(
        &scratch.a6_re,
        &scratch.a6_im,
        &scratch.temp1_re,
        &scratch.temp1_im,
        &mut scratch.temp2_re,
        &mut scratch.temp2_im,
        n,
    );

    // Uinner = A6Wu + b7·A6 + b5·A4 + b3·A2 + b1·I  (stored in temp1)
    for i in 0..size {
        scratch.temp1_re[i] = scratch.temp2_re[i]
            + b[7] * scratch.a6_re[i]
            + b[5] * scratch.a4_re[i]
            + b[3] * scratch.a2_re[i];
        scratch.temp1_im[i] = scratch.temp2_im[i]
            + b[7] * scratch.a6_im[i]
            + b[5] * scratch.a4_im[i]
            + b[3] * scratch.a2_im[i];
    }
    // Add b1·I (diagonal only)
    for i in 0..n {
        scratch.temp1_re[i * n + i] += b[1];
    }

    // U = As · Uinner
    complex_mat_mul(
        &scratch.a_scaled_re,
        &scratch.a_scaled_im,
        &scratch.temp1_re,
        &scratch.temp1_im,
        &mut scratch.u_re,
        &mut scratch.u_im,
        n,
    );

    // Wv = b12·A6 + b10·A4 + b8·A2  (stored in temp1)
    for i in 0..size {
        scratch.temp1_re[i] =
            b[12] * scratch.a6_re[i] + b[10] * scratch.a4_re[i] + b[8] * scratch.a2_re[i];
        scratch.temp1_im[i] =
            b[12] * scratch.a6_im[i] + b[10] * scratch.a4_im[i] + b[8] * scratch.a2_im[i];
    }

    // A6Wv = A6 · Wv  (stored in temp2)
    complex_mat_mul(
        &scratch.a6_re,
        &scratch.a6_im,
        &scratch.temp1_re,
        &scratch.temp1_im,
        &mut scratch.temp2_re,
        &mut scratch.temp2_im,
        n,
    );

    // V = A6Wv + b6·A6 + b4·A4 + b2·A2 + b0·I
    for i in 0..size {
        scratch.v_re[i] = scratch.temp2_re[i]
            + b[6] * scratch.a6_re[i]
            + b[4] * scratch.a4_re[i]
            + b[2] * scratch.a2_re[i];
        scratch.v_im[i] = scratch.temp2_im[i]
            + b[6] * scratch.a6_im[i]
            + b[4] * scratch.a4_im[i]
            + b[2] * scratch.a2_im[i];
    }
    // Add b0·I (diagonal only)
    for i in 0..n {
        scratch.v_re[i * n + i] += b[0];
    }
}

/// Zero all Padé scratch buffers for the first `size` elements.
fn zero_pade_scratch(scratch: &mut PadeScratch, size: usize) {
    zero_slice(&mut scratch.a_scaled_re, size);
    zero_slice(&mut scratch.a_scaled_im, size);
    zero_slice(&mut scratch.a2_re, size);
    zero_slice(&mut scratch.a2_im, size);
    zero_slice(&mut scratch.a4_re, size);
    zero_slice(&mut scratch.a4_im, size);
    zero_slice(&mut scratch.a6_re, size);
    zero_slice(&mut scratch.a6_im, size);
    zero_slice(&mut scratch.temp1_re, size);
    zero_slice(&mut scratch.temp1_im, size);
    zero_slice(&mut scratch.temp2_re, size);
    zero_slice(&mut scratch.temp2_im, size);
    zero_slice(&mut scratch.u_re, size);
    zero_slice(&mut scratch.u_im, size);
    zero_slice(&mut scratch.v_re, size);
    zero_slice(&mut scratch.v_im, size);
}

/// Core Padé implementation using provided scratch buffers.
fn pade_impl(
    a_re: &[f64],
    a_im: &[f64],
    n: usize,
    s: i32,
    scratch: &mut PadeScratch,
) -> (Vec<f64>, Vec<f64>) {
    let size = n * n;
    zero_pade_scratch(scratch, size);

    // Scale: A_s = A / 2^s
    let scale_factor = (2.0_f64).powi(-s);
    complex_mat_scale(
        a_re,
        a_im,
        scale_factor,
        0.0,
        &mut scratch.a_scaled_re,
        &mut scratch.a_scaled_im,
        n,
    );

    // Matrix powers: A², A⁴, A⁶
    complex_mat_mul(
        &scratch.a_scaled_re,
        &scratch.a_scaled_im,
        &scratch.a_scaled_re,
        &scratch.a_scaled_im,
        &mut scratch.a2_re,
        &mut scratch.a2_im,
        n,
    );
    complex_mat_mul(
        &scratch.a2_re,
        &scratch.a2_im,
        &scratch.a2_re,
        &scratch.a2_im,
        &mut scratch.a4_re,
        &mut scratch.a4_im,
        n,
    );
    complex_mat_mul(
        &scratch.a2_re,
        &scratch.a2_im,
        &scratch.a4_re,
        &scratch.a4_im,
        &mut scratch.a6_re,
        &mut scratch.a6_im,
        n,
    );

    // Compute Padé numerator U and denominator V
    compute_pade_uv(n, scratch);

    // Form P = V + U and Q = V - U (reuse temp1 for P, temp2 for Q)
    for i in 0..size {
        scratch.temp1_re[i] = scratch.v_re[i] + scratch.u_re[i]; // P
        scratch.temp1_im[i] = scratch.v_im[i] + scratch.u_im[i];
        scratch.temp2_re[i] = scratch.v_re[i] - scratch.u_re[i]; // Q
        scratch.temp2_im[i] = scratch.v_im[i] - scratch.u_im[i];
    }

    // Solve Q * X = P, result goes into u_re/u_im (reusing as output buffer)
    solve_linear_system_into(
        &scratch.temp2_re,
        &scratch.temp2_im,
        &scratch.temp1_re,
        &scratch.temp1_im,
        n,
        &mut scratch.solve_a_re,
        &mut scratch.solve_a_im,
        &mut scratch.solve_b_re,
        &mut scratch.solve_b_im,
        &mut scratch.u_re,
        &mut scratch.u_im,
    );

    // X is now in u_re/u_im. Squaring phase: exp(A) = X^{2^s}
    if s > 0 {
        zero_slice(&mut scratch.sq_re, size);
        zero_slice(&mut scratch.sq_im, size);

        for i in 0..s {
            if i % 2 == 0 {
                // X → sq
                complex_mat_mul(
                    &scratch.u_re,
                    &scratch.u_im,
                    &scratch.u_re,
                    &scratch.u_im,
                    &mut scratch.sq_re,
                    &mut scratch.sq_im,
                    n,
                );
            } else {
                // sq → X (u)
                complex_mat_mul(
                    &scratch.sq_re,
                    &scratch.sq_im,
                    &scratch.sq_re,
                    &scratch.sq_im,
                    &mut scratch.u_re,
                    &mut scratch.u_im,
                    n,
                );
            }
        }

        if s % 2 == 1 {
            // Result is in sq — copy out
            let result_re = scratch.sq_re[..size].to_vec();
            let result_im = scratch.sq_im[..size].to_vec();
            return (result_re, result_im);
        }
    }

    // Result is in u_re/u_im — copy out
    let result_re = scratch.u_re[..size].to_vec();
    let result_im = scratch.u_im[..size].to_vec();
    (result_re, result_im)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TOL: f64 = 1e-10;

    /// Check two arrays are approximately equal element-wise.
    fn assert_close(a: &[f64], b: &[f64], tol: f64) {
        assert_eq!(a.len(), b.len(), "arrays differ in length");
        for i in 0..a.len() {
            assert!(
                (a[i] - b[i]).abs() < tol,
                "mismatch at index {i}: {} vs {} (diff {})",
                a[i],
                b[i],
                (a[i] - b[i]).abs()
            );
        }
    }

    /// Create N×N identity matrix (re only, im all zeros).
    fn identity(n: usize) -> (Vec<f64>, Vec<f64>) {
        let mut re = vec![0.0; n * n];
        let im = vec![0.0; n * n];
        for i in 0..n {
            re[i * n + i] = 1.0;
        }
        (re, im)
    }

    // ── Complex Matrix Multiply ──

    #[test]
    fn test_matmul_identity() {
        let n = 4;
        let (i_re, i_im) = identity(n);

        // Random-ish matrix
        let a_re = vec![
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
            16.0,
        ];
        let a_im = vec![
            0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6,
        ];

        let mut out_re = vec![0.0; n * n];
        let mut out_im = vec![0.0; n * n];

        complex_mat_mul(&i_re, &i_im, &a_re, &a_im, &mut out_re, &mut out_im, n);
        assert_close(&out_re, &a_re, TOL);
        assert_close(&out_im, &a_im, TOL);
    }

    #[test]
    fn test_matmul_2x2_known() {
        // A = [[1+i, 2], [0, 3-i]]
        // B = [[1, 0], [0, 1]] = I
        // A*I = A
        let n = 2;
        let a_re = vec![1.0, 2.0, 0.0, 3.0];
        let a_im = vec![1.0, 0.0, 0.0, -1.0];
        let (b_re, b_im) = identity(n);
        let mut out_re = vec![0.0; 4];
        let mut out_im = vec![0.0; 4];

        complex_mat_mul(&a_re, &a_im, &b_re, &b_im, &mut out_re, &mut out_im, n);
        assert_close(&out_re, &a_re, TOL);
        assert_close(&out_im, &a_im, TOL);
    }

    #[test]
    fn test_matmul_complex_product() {
        // A = [[1+i, 0], [0, 1-i]]
        // B = [[1+i, 0], [0, 1-i]]
        // A*B = [[(1+i)^2, 0], [0, (1-i)^2]] = [[2i, 0], [0, -2i]]
        let n = 2;
        let a_re = vec![1.0, 0.0, 0.0, 1.0];
        let a_im = vec![1.0, 0.0, 0.0, -1.0];
        let mut out_re = vec![0.0; 4];
        let mut out_im = vec![0.0; 4];

        complex_mat_mul(&a_re, &a_im, &a_re, &a_im, &mut out_re, &mut out_im, n);

        let exp_re = vec![0.0, 0.0, 0.0, 0.0];
        let exp_im = vec![2.0, 0.0, 0.0, -2.0];
        assert_close(&out_re, &exp_re, TOL);
        assert_close(&out_im, &exp_im, TOL);
    }

    // ── Gaussian Elimination ──

    #[test]
    fn test_solve_identity_system() {
        // I * X = B → X = B
        let n = 3;
        let (q_re, q_im) = identity(n);
        let p_re = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let p_im = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

        let (res_re, res_im) = solve_linear_system(&q_re, &q_im, &p_re, &p_im, n);

        assert_close(&res_re, &p_re, TOL);
        assert_close(&res_im, &p_im, TOL);
    }

    #[test]
    fn test_solve_2x2_real() {
        // [2, 1; 1, 3] * X = [1, 0; 0, 1]
        // X = inv([2,1;1,3]) = [3/5, -1/5; -1/5, 2/5]
        let n = 2;
        let q_re = vec![2.0, 1.0, 1.0, 3.0];
        let q_im = vec![0.0, 0.0, 0.0, 0.0];
        let (p_re, p_im) = identity(n);

        let (res_re, res_im) = solve_linear_system(&q_re, &q_im, &p_re, &p_im, n);

        let exp_re = vec![0.6, -0.2, -0.2, 0.4];
        let exp_im = vec![0.0, 0.0, 0.0, 0.0];
        assert_close(&res_re, &exp_re, TOL);
        assert_close(&res_im, &exp_im, TOL);
    }

    #[test]
    fn test_solve_complex() {
        // Q = [[i, 0], [0, 1]]
        // P = [[1, 0], [0, 1]]
        // X = Q^{-1} P = [[-i, 0], [0, 1]]
        let n = 2;
        let q_re = vec![0.0, 0.0, 0.0, 1.0];
        let q_im = vec![1.0, 0.0, 0.0, 0.0];
        let (p_re, p_im) = identity(n);

        let (res_re, res_im) = solve_linear_system(&q_re, &q_im, &p_re, &p_im, n);

        let exp_re = vec![0.0, 0.0, 0.0, 1.0];
        let exp_im = vec![-1.0, 0.0, 0.0, 0.0];
        assert_close(&res_re, &exp_re, TOL);
        assert_close(&res_im, &exp_im, TOL);
    }

    // ── Matrix Exponential ──

    #[test]
    fn test_expm_zero_matrix() {
        // exp(0) = I
        let n = 4;
        let a_re = vec![0.0; n * n];
        let a_im = vec![0.0; n * n];

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);
        let (exp_re, exp_im) = identity(n);

        assert_close(&res_re, &exp_re, TOL);
        assert_close(&res_im, &exp_im, TOL);
    }

    #[test]
    fn test_expm_diagonal_real() {
        // exp(diag(λ)) = diag(exp(λ))
        let n = 3;
        let lambdas = [1.0, -0.5, 2.0];
        let mut a_re = vec![0.0; n * n];
        let a_im = vec![0.0; n * n];
        for i in 0..n {
            a_re[i * n + i] = lambdas[i];
        }

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        for i in 0..n {
            for j in 0..n {
                let idx = i * n + j;
                if i == j {
                    assert!(
                        (res_re[idx] - lambdas[i].exp()).abs() < 1e-8,
                        "diagonal ({i},{j}): {} vs {}",
                        res_re[idx],
                        lambdas[i].exp()
                    );
                } else {
                    assert!(
                        res_re[idx].abs() < 1e-8,
                        "off-diagonal ({i},{j}) real: {}",
                        res_re[idx]
                    );
                }
                if i != j {
                    assert!(
                        res_im[idx].abs() < 1e-8,
                        "off-diagonal ({i},{j}) imag: {}",
                        res_im[idx]
                    );
                }
            }
        }
    }

    #[test]
    fn test_expm_diagonal_complex() {
        // exp(diag(iθ)) = diag(cos(θ) + i·sin(θ))
        let n = 2;
        let thetas = [std::f64::consts::PI / 4.0, std::f64::consts::PI / 3.0];
        let a_re = vec![0.0; n * n];
        let mut a_im = vec![0.0; n * n];
        for i in 0..n {
            a_im[i * n + i] = thetas[i];
        }

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        for i in 0..n {
            let idx = i * n + i;
            assert!(
                (res_re[idx] - thetas[i].cos()).abs() < 1e-8,
                "diag({i}) real: {} vs {}",
                res_re[idx],
                thetas[i].cos()
            );
            assert!(
                (res_im[idx] - thetas[i].sin()).abs() < 1e-8,
                "diag({i}) imag: {} vs {}",
                res_im[idx],
                thetas[i].sin()
            );
        }

        // Off-diagonal should be zero
        for i in 0..n {
            for j in 0..n {
                if i != j {
                    let idx = i * n + j;
                    assert!(res_re[idx].abs() < 1e-8);
                    assert!(res_im[idx].abs() < 1e-8);
                }
            }
        }
    }

    #[test]
    fn test_expm_inverse_property() {
        // exp(A) · exp(-A) ≈ I
        let n = 4;
        let mut a_re = vec![0.0; n * n];
        let mut a_im = vec![0.0; n * n];
        // Fill with non-trivial values
        for i in 0..n {
            for j in 0..n {
                let idx = i * n + j;
                a_re[idx] = 0.1 * ((i * 3 + j * 7) % 11) as f64 - 0.5;
                a_im[idx] = 0.1 * ((i * 5 + j * 2) % 9) as f64 - 0.4;
            }
        }

        let (exp_re, exp_im) = matrix_exponential_pade(&a_re, &a_im, n);

        // Compute -A
        let neg_a_re: Vec<f64> = a_re.iter().map(|x| -x).collect();
        let neg_a_im: Vec<f64> = a_im.iter().map(|x| -x).collect();
        let (exp_neg_re, exp_neg_im) = matrix_exponential_pade(&neg_a_re, &neg_a_im, n);

        // Multiply: exp(A) · exp(-A)
        let mut prod_re = vec![0.0; n * n];
        let mut prod_im = vec![0.0; n * n];
        complex_mat_mul(
            &exp_re,
            &exp_im,
            &exp_neg_re,
            &exp_neg_im,
            &mut prod_re,
            &mut prod_im,
            n,
        );

        // Should be close to identity
        let (id_re, id_im) = identity(n);
        assert_close(&prod_re, &id_re, 1e-6);
        assert_close(&prod_im, &id_im, 1e-6);
    }

    #[test]
    fn test_expm_known_2x2() {
        // A = [[0, 1], [-1, 0]] → exp(A) = [[cos(1), sin(1)], [-sin(1), cos(1)]]
        let n = 2;
        let a_re = vec![0.0, 1.0, -1.0, 0.0];
        let a_im = vec![0.0, 0.0, 0.0, 0.0];

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        let c = 1.0_f64.cos();
        let s = 1.0_f64.sin();
        let exp_re = vec![c, s, -s, c];
        let exp_im = vec![0.0, 0.0, 0.0, 0.0];

        assert_close(&res_re, &exp_re, 1e-10);
        assert_close(&res_im, &exp_im, 1e-10);
    }

    #[test]
    fn test_expm_nilpotent() {
        // A = [[0, 1], [0, 0]] → A² = 0 → exp(A) = I + A = [[1, 1], [0, 1]]
        let n = 2;
        let a_re = vec![0.0, 1.0, 0.0, 0.0];
        let a_im = vec![0.0, 0.0, 0.0, 0.0];

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        let exp_re = vec![1.0, 1.0, 0.0, 1.0];
        let exp_im = vec![0.0, 0.0, 0.0, 0.0];

        assert_close(&res_re, &exp_re, 1e-10);
        assert_close(&res_im, &exp_im, 1e-10);
    }

    #[test]
    fn test_expm_larger_matrix() {
        // 8×8 diagonal matrix — verifies larger size works
        let n = 8;
        let mut a_re = vec![0.0; n * n];
        let a_im = vec![0.0; n * n];
        for i in 0..n {
            a_re[i * n + i] = -0.5 * (i as f64) + 0.1;
        }

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        for i in 0..n {
            let expected = (-0.5 * (i as f64) + 0.1).exp();
            assert!(
                (res_re[i * n + i] - expected).abs() < 1e-10,
                "diag({i}): {} vs {expected}",
                res_re[i * n + i]
            );
        }

        // Off-diagonal should be zero
        for i in 0..n {
            for j in 0..n {
                if i != j {
                    assert!(res_re[i * n + j].abs() < 1e-10);
                    assert!(res_im[i * n + j].abs() < 1e-10);
                }
            }
        }
    }

    #[test]
    fn test_expm_hermitian_unitarity() {
        // exp(i·H) should be unitary when H is Hermitian
        // H = [[1, 0.5+0.3i], [0.5-0.3i, 2]]
        let n = 2;
        let a_re = vec![0.0, -0.3, 0.3, 0.0]; // i·H real part
        let a_im = vec![1.0, 0.5, 0.5, 2.0]; // i·H imag part

        let (u_re, u_im) = matrix_exponential_pade(&a_re, &a_im, n);

        // U†·U should equal I
        // U† = conjugate transpose
        let mut uh_re = vec![0.0; n * n];
        let mut uh_im = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                uh_re[i * n + j] = u_re[j * n + i];
                uh_im[i * n + j] = -u_im[j * n + i]; // conjugate
            }
        }

        let mut prod_re = vec![0.0; n * n];
        let mut prod_im = vec![0.0; n * n];
        complex_mat_mul(&uh_re, &uh_im, &u_re, &u_im, &mut prod_re, &mut prod_im, n);

        let (id_re, id_im) = identity(n);
        assert_close(&prod_re, &id_re, 1e-8);
        assert_close(&prod_im, &id_im, 1e-8);
    }

    #[test]
    fn test_expm_scaling_triggers() {
        // Large-norm matrix that forces s > 0 (scaling phase)
        let n = 3;
        let mut a_re = vec![0.0; n * n];
        let a_im = vec![0.0; n * n];

        // Diagonal with large values → norm >> θ₁₃
        a_re[0] = 20.0;
        a_re[4] = -15.0;
        a_re[8] = 10.0;

        let (res_re, res_im) = matrix_exponential_pade(&a_re, &a_im, n);

        // Should still produce correct diagonal exponentials
        assert!((res_re[0] - 20.0_f64.exp()).abs() < 1e-4);
        assert!((res_re[4] - (-15.0_f64).exp()).abs() < 1e-10);
        assert!((res_re[8] - 10.0_f64.exp()).abs() < 1e-2);

        // Off-diagonal should be zero
        for i in 0..n {
            for j in 0..n {
                if i != j {
                    assert!(res_re[i * n + j].abs() < 1e-6);
                    assert!(res_im[i * n + j].abs() < 1e-6);
                }
            }
        }
    }

    #[test]
    fn test_norm1() {
        // [[1+i, 0], [0, 2-3i]]
        // col 0 sum: |1+i| = sqrt(2) ≈ 1.414
        // col 1 sum: |2-3i| = sqrt(13) ≈ 3.606
        // norm = 3.606
        let n = 2;
        let a_re = vec![1.0, 0.0, 0.0, 2.0];
        let a_im = vec![1.0, 0.0, 0.0, -3.0];

        let norm = complex_mat_norm1(&a_re, &a_im, n);
        let expected = (13.0_f64).sqrt();
        assert!((norm - expected).abs() < TOL);
    }
}
