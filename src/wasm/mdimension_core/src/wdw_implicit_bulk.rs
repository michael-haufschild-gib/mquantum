//! Semi-implicit Crank–Nicolson ADI bulk propagator for the
//! Wheeler–DeWitt minisuperspace solver (Phase 3 / Phase 5 port).
//!
//! Mirrors `src/lib/physics/wheelerDeWitt/implicitBulk.ts` line-for-line
//! so that `solverWasmComparison.test.ts` achieves pointwise parity at
//! `1e-5` relative magnitude between the JS solver and this Rust
//! validator. A transcription-level divergence here would show up as an
//! order-of-magnitude tolerance failure on the parity test.
//!
//! ## Scheme
//!
//! Treat the `(1/a²)·∇²_φ χ` term with the trapezoidal rule (evaluated at
//! `a_next` and `a_prev`) and keep `U·χ` explicit at `a_cur`:
//!
//!   `χ_next − (da²/2)·L_next·χ_next = 2·χ_cur − χ_prev + (da²/2)·L_prev·χ_prev + da²·U_cur·χ_cur`
//!
//! with `L = (1/a²)·∇²_φ`. The 2D elliptic operator is factorised by
//! ADI into two 1D Neumann-Laplacian Thomas tridiagonal solves. See the
//! TS module docstring for the derivation of the `O(da⁴)` splitting
//! residual.

#![allow(clippy::suboptimal_flops)]
#![allow(dead_code)]

/// Thomas algorithm for `(I − κ̂·L_1d_Neumann)·x = b` on a node-centred
/// grid of length `N` with Neumann ghost `χ_{-1} = χ_0, χ_N = χ_{N-1}`.
///
/// Tridiagonal rows:
///
///   Row 0:   `b_0 = 1 + κ̂, c_0 = −κ̂`
///   Row i:   `a_i = −κ̂, b_i = 1 + 2κ̂, c_i = −κ̂`   (1 ≤ i ≤ N-2)
///   Row N-1: `a_{N-1} = −κ̂, b_{N-1} = 1 + κ̂`
///
/// Diagonally dominant for `κ̂ ≥ 0`, so Thomas is stable.
pub fn solve_neumann_tridiag_1d(
    rhs: &[f64],
    out: &mut [f64],
    n: usize,
    kappa: f64,
    c_prime: &mut [f64],
    work: &mut [f64],
) {
    if n < 2 {
        if n == 1 {
            out[0] = rhs[0];
        }
        return;
    }
    let a_sub = -kappa;
    let c_super = -kappa;

    // Row 0: b = 1 + κ̂.
    let mut denom = 1.0 + kappa;
    c_prime[0] = c_super / denom;
    work[0] = rhs[0] / denom;

    // Rows 1..N-2: b = 1 + 2κ̂.
    for i in 1..(n - 1) {
        denom = 1.0 + 2.0 * kappa - a_sub * c_prime[i - 1];
        c_prime[i] = c_super / denom;
        work[i] = (rhs[i] - a_sub * work[i - 1]) / denom;
    }

    // Row N-1: b = 1 + κ̂.
    denom = 1.0 + kappa - a_sub * c_prime[n - 2];
    work[n - 1] = (rhs[n - 1] - a_sub * work[n - 2]) / denom;

    // Back-substitute.
    out[n - 1] = work[n - 1];
    for i in (0..(n - 1)).rev() {
        out[i] = work[i] - c_prime[i] * out[i + 1];
    }
}

/// ADI scratch buffers — allocate once at solver entry, reuse across
/// every `a`-step. All buffers are `f64` so the x-sweep and y-sweep
/// accumulate round-off identically across axes (avoiding a spurious
/// `~2·10⁻³` exchange-symmetry violation the JS path guards against
/// with the same choice).
pub struct ImplicitBulkScratch {
    pub inter_re: Vec<f64>,
    pub inter_im: Vec<f64>,
    pub row_in: Vec<f64>,
    pub row_out: Vec<f64>,
    pub c_prime: Vec<f64>,
    pub work: Vec<f64>,
}

/// Allocate scratch for an `Nphi × Nphi` φ-slab.
pub fn alloc_implicit_bulk_scratch(nphi: usize) -> ImplicitBulkScratch {
    ImplicitBulkScratch {
        inter_re: vec![0.0f64; nphi * nphi],
        inter_im: vec![0.0f64; nphi * nphi],
        row_in: vec![0.0f64; nphi],
        row_out: vec![0.0f64; nphi],
        c_prime: vec![0.0f64; nphi],
        work: vec![0.0f64; nphi],
    }
}

/// ADI solve `(I − κ̂·D_x)(I − κ̂·D_y)·χ = RHS` on the full `Nphi × Nphi`
/// φ-slab. Input `rhs` and output `out` are interleaved `(re, im)`
/// pairs of length `2·Nphi²` with row-major indexing `i1 · Nphi + i2`.
/// Re/Im components decouple (the matrix is real).
pub fn solve_adi_laplacian_neumann_2d(
    rhs: &[f64],
    out: &mut [f64],
    nphi: usize,
    kappa: f64,
    scratch: &mut ImplicitBulkScratch,
) {
    // ----- Sweep 1: (I − κ̂·D_x)·ψ = RHS along the i1 axis. -----
    for i2 in 0..nphi {
        // Real component.
        for i1 in 0..nphi {
            scratch.row_in[i1] = rhs[2 * (i1 * nphi + i2)];
        }
        solve_neumann_tridiag_1d(
            &scratch.row_in,
            &mut scratch.row_out,
            nphi,
            kappa,
            &mut scratch.c_prime,
            &mut scratch.work,
        );
        for i1 in 0..nphi {
            scratch.inter_re[i1 * nphi + i2] = scratch.row_out[i1];
        }

        // Imaginary component.
        for i1 in 0..nphi {
            scratch.row_in[i1] = rhs[2 * (i1 * nphi + i2) + 1];
        }
        solve_neumann_tridiag_1d(
            &scratch.row_in,
            &mut scratch.row_out,
            nphi,
            kappa,
            &mut scratch.c_prime,
            &mut scratch.work,
        );
        for i1 in 0..nphi {
            scratch.inter_im[i1 * nphi + i2] = scratch.row_out[i1];
        }
    }

    // ----- Sweep 2: (I − κ̂·D_y)·χ_next = ψ along the i2 axis. -----
    for i1 in 0..nphi {
        // Real component.
        for i2 in 0..nphi {
            scratch.row_in[i2] = scratch.inter_re[i1 * nphi + i2];
        }
        solve_neumann_tridiag_1d(
            &scratch.row_in,
            &mut scratch.row_out,
            nphi,
            kappa,
            &mut scratch.c_prime,
            &mut scratch.work,
        );
        for i2 in 0..nphi {
            out[2 * (i1 * nphi + i2)] = scratch.row_out[i2];
        }

        // Imaginary component.
        for i2 in 0..nphi {
            scratch.row_in[i2] = scratch.inter_im[i1 * nphi + i2];
        }
        solve_neumann_tridiag_1d(
            &scratch.row_in,
            &mut scratch.row_out,
            nphi,
            kappa,
            &mut scratch.c_prime,
            &mut scratch.work,
        );
        for i2 in 0..nphi {
            out[2 * (i1 * nphi + i2) + 1] = scratch.row_out[i2];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A constant-in-φ RHS must produce a constant-in-φ solution
    /// (Neumann-Laplacian annihilates the constant eigenspace). Any
    /// violation indicates a stencil or boundary bug.
    #[test]
    fn adi_preserves_constant_input() {
        let nphi = 5;
        let rhs: Vec<f64> = (0..2 * nphi * nphi)
            .map(|i| if i % 2 == 0 { 3.7 } else { -1.2 })
            .collect();
        let mut out = vec![0.0f64; 2 * nphi * nphi];
        let mut scratch = alloc_implicit_bulk_scratch(nphi);
        solve_adi_laplacian_neumann_2d(&rhs, &mut out, nphi, 0.1, &mut scratch);
        // Solution is constant-in-φ: every real cell = 3.7, every im cell = -1.2
        // (since (I − κ̂·∇²_φ)⁻¹ leaves constants unchanged).
        for i in 0..(nphi * nphi) {
            assert!(
                (out[2 * i] - 3.7).abs() < 1e-12,
                "constant-in-φ re preserved at {i}: got {}",
                out[2 * i]
            );
            assert!(
                (out[2 * i + 1] - (-1.2)).abs() < 1e-12,
                "constant-in-φ im preserved at {i}: got {}",
                out[2 * i + 1]
            );
        }
    }

    /// The ADI solve at `κ̂ = 0` reduces to the identity: `I·χ = RHS`.
    /// Any non-identity output indicates a spurious stencil.
    #[test]
    fn adi_at_zero_kappa_is_identity() {
        let nphi = 4;
        let rhs: Vec<f64> = (0..2 * nphi * nphi).map(|i| (i as f64).sin()).collect();
        let mut out = vec![0.0f64; 2 * nphi * nphi];
        let mut scratch = alloc_implicit_bulk_scratch(nphi);
        solve_adi_laplacian_neumann_2d(&rhs, &mut out, nphi, 0.0, &mut scratch);
        for i in 0..(2 * nphi * nphi) {
            assert!(
                (out[i] - rhs[i]).abs() < 1e-14,
                "κ=0 identity at {i}: got {}, expected {}",
                out[i],
                rhs[i]
            );
        }
    }
}
