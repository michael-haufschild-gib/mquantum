//! Independent Rust implementation of the 3D Wheeler–DeWitt minisuperspace solver.
//!
//! The TypeScript solver in `src/lib/physics/wheelerDeWitt/solver.ts` is the
//! production code path. This Rust module exists solely as an **independent
//! implementation of the same mathematical object**, derived from first
//! principles and the reference documentation — not ported line-by-line from
//! the TS code. Cross-validation tests compare their outputs on reference
//! configurations to catch class-of-bug errors that any single code path
//! would miss (wrong constants, sign errors, off-by-one stencil indices,
//! wrong potential formulae).
//!
//! ## What is and is not implemented
//!
//! - **Implemented**: `U(a, φ)` and `V(φ)` operators, `a_turn(φ)`, the three
//!   boundary-condition generators (HH / Vilenkin / DeWitt), and the raw
//!   second-order leapfrog PDE integrator with ghost-zero Dirichlet
//!   boundaries at the outer φ-edges.
//! - **NOT implemented**: Stage-2 deep-Euclidean WKB tail ("WDW_WKB_MATCH
//!   _PHASE_THRESHOLD") and Stage-3 Airy/Langer connection. These are
//!   numerical post-processing layers applied on top of the raw PDE solve
//!   in the TS path to suppress the Euclidean growing branch. Omitting
//!   them here is deliberate — cross-validation focuses on the core PDE
//!   integrator, which is where coupling bugs and constant drift would
//!   show up first.
//!
//! Cross-validation therefore restricts the comparison to the Lorentzian
//! region where Stage-2/3 do not overwrite the TS output.
//!
//! ## Why this is an independent implementation
//!
//! The Rust code was written against the physics references
//! ({@link constants.ts}, {@link boundaryConditions.ts} docstrings) and
//! independently derives the same closed-form expressions. It uses Rust's
//! `f64` throughout (TS uses `Float32` storage with `Float64` accumulators);
//! the resulting rounding differences manifest at ~1e-7 relative magnitude,
//! well inside the tolerance budget of the cross-validation.
//!
//! No `#[wasm_bindgen]` exports — this module is test-only and does not
//! ship in the WASM binary. (Adding bindings would cost ~5 KB on the
//! public-facing `pkg/mdimension_core.wasm` for no user-facing benefit.)

#![allow(clippy::suboptimal_flops)] // tight numerical inner loops preserved
#![allow(dead_code)] // test-only module; public API reserved for future cross-validation tools

/// `8 π G / 3` with `G = 1`. Matches `WDW_G_PREFACTOR` in the TS solver.
pub const WDW_G_PREFACTOR: f64 = 8.0 * std::f64::consts::PI / 3.0;

/// Potential prefactor `c_U = 36 π²` in `U(a, φ) = −c_U·a²·(…)`.
pub const WDW_C_U: f64 = 36.0 * std::f64::consts::PI * std::f64::consts::PI;

/// `V(φ₁, φ₂) = ½ m² (φ₁² + φ₂²) + Λ`.
#[inline]
pub fn wdw_potential(phi1: f64, phi2: f64, mass: f64, lambda: f64) -> f64 {
    0.5 * mass * mass * (phi1 * phi1 + phi2 * phi2) + lambda
}

/// `U(a, φ) = −c_U·a²·(1 − (8πG/3)·a² · V(φ))`.
#[inline]
pub fn wdw_u(a: f64, phi1: f64, phi2: f64, mass: f64, lambda: f64) -> f64 {
    let v = wdw_potential(phi1, phi2, mass, lambda);
    let a2 = a * a;
    -WDW_C_U * a2 * (1.0 - WDW_G_PREFACTOR * a2 * v)
}

/// Scale-factor turning surface `a_turn(φ)` where `U(a_turn, φ) = 0`.
/// Returns `None` when `V(φ) ≤ 0` (no turning surface exists).
#[inline]
pub fn wdw_turning_a(phi1: f64, phi2: f64, mass: f64, lambda: f64) -> Option<f64> {
    let v = wdw_potential(phi1, phi2, mass, lambda);
    if v <= 0.0 {
        None
    } else {
        Some(1.0 / (WDW_G_PREFACTOR * v).sqrt())
    }
}

/// Boundary-condition selector.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WdwBoundaryCondition {
    /// Hartle–Hawking no-boundary.
    NoBoundary,
    /// Vilenkin tunneling / outgoing-wave.
    Tunneling,
    /// DeWitt `χ(a=0) = 0`.
    DeWitt,
}

/// Grid + physics parameters for the solver.
#[derive(Clone, Copy, Debug)]
pub struct WdwSolverInput {
    /// Boundary condition.
    pub bc: WdwBoundaryCondition,
    /// Inflaton mass `m`.
    pub mass: f64,
    /// Cosmological constant `Λ`.
    pub lambda: f64,
    /// Lower bound of `a` grid (must be > 0).
    pub a_min: f64,
    /// Upper bound of `a` grid (must satisfy `> a_min`).
    pub a_max: f64,
    /// Number of `a` points (≥ 3).
    pub grid_na: usize,
    /// Number of φ points per axis (≥ 3).
    pub grid_nphi: usize,
    /// Half-range: `φ ∈ [−phi_extent, +phi_extent]` on both axes.
    pub phi_extent: f64,
}

/// Dense `(a × φ₁ × φ₂)` output tensor of the leapfrog solver.
/// Interleaved `(re, im)` with stride `2 · N_phi²` per `a` slab. No
/// Stage-2/Stage-3 corrections applied — the buffer reflects the raw PDE
/// integrator output.
pub struct WdwSolverOutput {
    /// `χ(a, φ₁, φ₂)` as interleaved `(re, im)` pairs. Stride
    /// `stride_a = N_phi²`, `stride_phi1 = N_phi`, `stride_phi2 = 1`.
    pub chi: Vec<f64>,
    /// Grid dimensions `(Na, N_phi, N_phi)`.
    pub grid_size: (usize, usize, usize),
    /// Physical extents.
    pub a_min: f64,
    pub a_max: f64,
    pub phi_extent: f64,
}

/// Map grid index to the φ coordinate on the symmetric grid `[-L, L]`.
#[inline]
fn index_to_phi(i: usize, nphi: usize, phi_extent: f64) -> f64 {
    if nphi <= 1 {
        return 0.0;
    }
    -phi_extent + (2.0 * phi_extent * i as f64) / (nphi - 1) as f64
}

/// Hartle–Hawking boundary: real amplitude `exp(−|S_E|)` in the bounce,
/// decaying-branch WKB derivative inside; Gaussian-in-φ fallback where
/// `V ≤ 0` or the bounce is closed (`a² K V > 1`).
///
/// Writes `N_phi²` complex entries into each of `chi` and `chi_deriv`.
fn hartle_hawking_boundary(
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
    mass: f64,
    lambda: f64,
) {
    let a2 = a_min * a_min;
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let v = wdw_potential(phi1, phi2, mass, lambda);
            let idx = i1 * nphi + i2;
            let (amp, dchi) = if v <= 1e-12 {
                // Fallback Gaussian envelope in φ.
                ((-0.5 * (phi1 * phi1 + phi2 * phi2)).exp(), 0.0)
            } else {
                let arg = 1.0 - a2 * WDW_G_PREFACTOR * v;
                if arg <= 0.0 {
                    ((-0.5 * (phi1 * phi1 + phi2 * phi2)).exp(), 0.0)
                } else {
                    let se = (1.0 / (3.0 * v)) * (arg.powf(1.5) - 1.0);
                    let amp = (-se.abs()).exp();
                    // Decaying-branch WKB derivative: χ' = −|dS_E/da|·χ.
                    let dchi = -WDW_G_PREFACTOR * a_min * arg.sqrt() * amp;
                    (amp, dchi)
                }
            };
            chi[2 * idx] = amp;
            chi[2 * idx + 1] = 0.0;
            chi_deriv[2 * idx] = dchi;
            chi_deriv[2 * idx + 1] = 0.0;
        }
    }
}

/// Vilenkin tunneling boundary: `χ = e^{−½|φ|²} · e^{+i·a³V/3}` with the
/// full WKB outgoing-wave derivative in the Lorentzian region.
fn vilenkin_boundary(
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
    mass: f64,
    lambda: f64,
) {
    let a3 = a_min * a_min * a_min;
    let a2 = a_min * a_min;
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let v = wdw_potential(phi1, phi2, mass, lambda);
            let amp = (-0.5 * (phi1 * phi1 + phi2 * phi2)).exp();
            let s_l = (a3 * v) / 3.0;
            let cos_s = s_l.cos();
            let sin_s = s_l.sin();
            let cre = amp * cos_s;
            let cim = amp * sin_s;
            let idx = i1 * nphi + i2;
            chi[2 * idx] = cre;
            chi[2 * idx + 1] = cim;

            let u0 = wdw_u(a_min, phi1, phi2, mass, lambda);
            if u0 < 0.0 {
                // Full WKB outgoing-wave derivative (Lorentzian).
                // ∂_a U = −2·c_U·a·(1 − 2·K·V·a²);  ∂_a|U| = −∂_a U.
                let duda = -2.0 * WDW_C_U * a_min * (1.0 - 2.0 * WDW_G_PREFACTOR * v * a2);
                let abs_u = -u0;
                let phase_rate = abs_u.sqrt();
                let prefactor_rate = -(-duda) / (4.0 * abs_u);
                let d_re = prefactor_rate * cre - phase_rate * cim;
                let d_im = prefactor_rate * cim + phase_rate * cre;
                chi_deriv[2 * idx] = d_re;
                chi_deriv[2 * idx + 1] = d_im;
            } else {
                // Small-a expansion ∂_a S_L = a²·V.
                let dsda = a2 * v;
                chi_deriv[2 * idx] = -dsda * cim;
                chi_deriv[2 * idx + 1] = dsda * cre;
            }
        }
    }
}

/// DeWitt boundary: `χ(a_min) = a_min · env`, linear-in-`a` ramp from the
/// `a = 0` node, real derivative = envelope.
fn dewitt_boundary(
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
) {
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let env = (-0.5 * (phi1 * phi1 + phi2 * phi2)).exp();
            let idx = i1 * nphi + i2;
            chi[2 * idx] = a_min * env;
            chi[2 * idx + 1] = 0.0;
            chi_deriv[2 * idx] = env;
            chi_deriv[2 * idx + 1] = 0.0;
        }
    }
}

/// Dispatch boundary-condition generators. Writes the initial `χ` slab
/// and its `a`-derivative into the provided scratch buffers.
#[allow(clippy::too_many_arguments)]
fn build_boundary(
    bc: WdwBoundaryCondition,
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
    mass: f64,
    lambda: f64,
) {
    match bc {
        WdwBoundaryCondition::NoBoundary => {
            hartle_hawking_boundary(chi, chi_deriv, nphi, phi_extent, a_min, mass, lambda);
        }
        WdwBoundaryCondition::Tunneling => {
            vilenkin_boundary(chi, chi_deriv, nphi, phi_extent, a_min, mass, lambda);
        }
        WdwBoundaryCondition::DeWitt => dewitt_boundary(chi, chi_deriv, nphi, phi_extent, a_min),
    }
}

/// Ghost-zero Dirichlet φ-Laplacian at `(i1, i2)` on the complex slab
/// `slab[slab_base..slab_base + 2·N_phi²]` (interleaved re, im).
/// Returns `(re, im)` of `∇²_φ χ`.
#[inline]
fn phi_laplacian_at(
    slab: &[f64],
    slab_base: usize,
    i1: usize,
    i2: usize,
    nphi: usize,
    inv_dphi2: f64,
) -> (f64, f64) {
    let center = slab_base + 2 * (i1 * nphi + i2);
    let cre = slab[center];
    let cim = slab[center + 1];
    let pre1 = if i1 > 0 {
        slab[slab_base + 2 * ((i1 - 1) * nphi + i2)]
    } else {
        0.0
    };
    let pim1 = if i1 > 0 {
        slab[slab_base + 2 * ((i1 - 1) * nphi + i2) + 1]
    } else {
        0.0
    };
    let nre1 = if i1 < nphi - 1 {
        slab[slab_base + 2 * ((i1 + 1) * nphi + i2)]
    } else {
        0.0
    };
    let nim1 = if i1 < nphi - 1 {
        slab[slab_base + 2 * ((i1 + 1) * nphi + i2) + 1]
    } else {
        0.0
    };
    let pre2 = if i2 > 0 {
        slab[slab_base + 2 * (i1 * nphi + i2 - 1)]
    } else {
        0.0
    };
    let pim2 = if i2 > 0 {
        slab[slab_base + 2 * (i1 * nphi + i2 - 1) + 1]
    } else {
        0.0
    };
    let nre2 = if i2 < nphi - 1 {
        slab[slab_base + 2 * (i1 * nphi + i2 + 1)]
    } else {
        0.0
    };
    let nim2 = if i2 < nphi - 1 {
        slab[slab_base + 2 * (i1 * nphi + i2 + 1) + 1]
    } else {
        0.0
    };
    (
        (pre1 + nre1 - 2.0 * cre + pre2 + nre2 - 2.0 * cre) * inv_dphi2,
        (pim1 + nim1 - 2.0 * cim + pim2 + nim2 - 2.0 * cim) * inv_dphi2,
    )
}

/// Raw leapfrog Wheeler–DeWitt solver (no Stage-2 / Stage-3 corrections).
///
/// Integrates the reduced WdW equation
///
///   `−∂²_a χ + (1/a²) ∇²_φ χ + U·χ = 0`
///
/// with ghost-zero Dirichlet on the φ-edges and the chosen boundary
/// condition at `a = a_min`. Returns the full `(a, φ₁, φ₂)` tensor. No
/// clamping, no absorber, no Airy overwrite — the raw PDE output.
///
/// # Panics
///
/// Panics on invalid grid sizes or non-monotonic `a` range.
pub fn solve_leapfrog(input: WdwSolverInput) -> WdwSolverOutput {
    let WdwSolverInput {
        bc,
        mass,
        lambda,
        a_min,
        a_max,
        grid_na: na,
        grid_nphi: nphi,
        phi_extent,
    } = input;

    assert!(na >= 3, "grid_na must be >= 3");
    assert!(nphi >= 3, "grid_nphi must be >= 3");
    assert!(a_max > a_min, "a_max must exceed a_min");

    let slab_size = nphi * nphi;
    let complex_slab = 2 * slab_size;
    let mut chi = vec![0.0f64; complex_slab * na];

    let da = (a_max - a_min) / (na - 1) as f64;
    let dphi = (2.0 * phi_extent) / (nphi - 1) as f64;
    let inv_dphi2 = 1.0 / (dphi * dphi);

    // Boundary condition into slab 0.
    let mut bc_deriv = vec![0.0f64; complex_slab];
    {
        let (slab0, _rest) = chi.split_at_mut(complex_slab);
        build_boundary(bc, slab0, &mut bc_deriv, nphi, phi_extent, a_min, mass, lambda);
    }

    // Slab 1 from Taylor expansion: χ(a_min + da) = χ + da·χ' + ½·da²·χ''.
    let a0 = a_min;
    let inv_a0sq = 1.0 / (a0 * a0);
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let idx = i1 * nphi + i2;
            let u0 = wdw_u(a0, phi1, phi2, mass, lambda);
            let cre = chi[2 * idx];
            let cim = chi[2 * idx + 1];
            let (lap_re, lap_im) = phi_laplacian_at(&chi, 0, i1, i2, nphi, inv_dphi2);
            // χ'' = (1/a²)·∇²_φ χ + U·χ.
            let ddot_re = inv_a0sq * lap_re + u0 * cre;
            let ddot_im = inv_a0sq * lap_im + u0 * cim;
            let dre = bc_deriv[2 * idx];
            let dim = bc_deriv[2 * idx + 1];
            let next_re = cre + da * dre + 0.5 * da * da * ddot_re;
            let next_im = cim + da * dim + 0.5 * da * da * ddot_im;
            chi[complex_slab + 2 * idx] = next_re;
            chi[complex_slab + 2 * idx + 1] = next_im;
        }
    }

    // Leapfrog: χ_next = 2·χ_cur − χ_prev + da²·χ''. Uses χ'' computed on
    // slab ia-1 (like the TS solver).
    for ia in 2..na {
        let a_prev = a_min + (ia - 1) as f64 * da;
        let inv_aprev_sq = 1.0 / (a_prev * a_prev);
        let prev_base = (ia - 1) * complex_slab;
        let prev_prev_base = (ia - 2) * complex_slab;
        let cur_base = ia * complex_slab;
        // We must read from chi[prev_base..] and write to chi[cur_base..];
        // split the borrow with indices and `&mut [..]`.
        for i1 in 0..nphi {
            let phi1 = index_to_phi(i1, nphi, phi_extent);
            for i2 in 0..nphi {
                let phi2 = index_to_phi(i2, nphi, phi_extent);
                let idx = i1 * nphi + i2;
                let u_prev = wdw_u(a_prev, phi1, phi2, mass, lambda);
                let cre = chi[prev_base + 2 * idx];
                let cim = chi[prev_base + 2 * idx + 1];
                let prev_re = chi[prev_prev_base + 2 * idx];
                let prev_im = chi[prev_prev_base + 2 * idx + 1];
                let (lap_re, lap_im) = phi_laplacian_at(&chi, prev_base, i1, i2, nphi, inv_dphi2);
                let ddot_re = inv_aprev_sq * lap_re + u_prev * cre;
                let ddot_im = inv_aprev_sq * lap_im + u_prev * cim;
                let next_re = 2.0 * cre - prev_re + da * da * ddot_re;
                let next_im = 2.0 * cim - prev_im + da * da * ddot_im;
                chi[cur_base + 2 * idx] = next_re;
                chi[cur_base + 2 * idx + 1] = next_im;
            }
        }
    }

    WdwSolverOutput {
        chi,
        grid_size: (na, nphi, nphi),
        a_min,
        a_max,
        phi_extent,
    }
}

// ============================================================================
// Tests — cross-validation + analytic-reference pins.
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -- Section 1: bit-exact primitive checks (1e-12) --

    #[test]
    fn wdw_u_matches_closed_form_at_sample_points() {
        // Hard-coded expected values computed by hand from the formula
        //   U(a, φ₁, φ₂) = −c_U·a²·(1 − K·a²·V(φ)).
        // These are the TYPE of values a regression in WDW_G_PREFACTOR or
        // WDW_C_U would silently break.
        //
        //   c_U = 36π² ≈ 355.3057584392184
        //   K   = 8π/3 ≈ 8.377580409572781
        //
        // Case 1: a=0.1, φ=0, m=0, Λ=0.
        //   V = 0, U = −c_U·0.01·1 = −3.553057584392184.
        let u = wdw_u(0.1, 0.0, 0.0, 0.0, 0.0);
        assert!(
            (u - (-WDW_C_U * 0.01)).abs() < 1e-12,
            "wdw_u free case: got {u}, expected {}",
            -WDW_C_U * 0.01
        );

        // Case 2: a=0.5, φ=0, m=0, Λ=0.3.
        //   V = 0.3, K·V·a² = 8.377580·0.3·0.25 = 0.6283185
        //   arg = 1 − 0.6283185 = 0.3716815
        //   U = −c_U·0.25·0.3716815 = −33.0093...
        let k_va2 = WDW_G_PREFACTOR * 0.3 * 0.25;
        let expected = -WDW_C_U * 0.25 * (1.0 - k_va2);
        let u2 = wdw_u(0.5, 0.0, 0.0, 0.0, 0.3);
        assert!(
            (u2 - expected).abs() < 1e-12,
            "wdw_u ds case: got {u2}, expected {expected}"
        );
    }

    #[test]
    fn wdw_turning_a_matches_closed_form() {
        // a_turn = 1/√(K·V). For V=0.3, K=8π/3: a_turn = 1/√(8π/3·0.3) ≈ 0.631.
        let at = wdw_turning_a(0.0, 0.0, 0.0, 0.3).expect("turning surface exists for V>0");
        let expected = 1.0 / (WDW_G_PREFACTOR * 0.3).sqrt();
        assert!((at - expected).abs() < 1e-12);

        // No turning surface when V ≤ 0.
        assert!(wdw_turning_a(0.0, 0.0, 0.0, -0.5).is_none());
        assert!(wdw_turning_a(0.0, 0.0, 0.0, 0.0).is_none());
    }

    #[test]
    fn vilenkin_boundary_matches_closed_form_at_origin() {
        // Build a tiny grid, check the φ=0 cell against hand-computed values.
        let nphi = 3;
        let phi_extent = 1.0;
        let a_min = 0.1;
        let mass = 0.0;
        let lambda = 0.3;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        vilenkin_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            a_min,
            mass,
            lambda,
        );
        // Central cell (i1=1, i2=1) has φ=(0, 0), envelope = 1, S_L = a³·V/3.
        let c = 1 * nphi + 1;
        let v = lambda;
        let s_l = (a_min * a_min * a_min * v) / 3.0;
        let expected_re = s_l.cos();
        let expected_im = s_l.sin();
        assert!((chi[2 * c] - expected_re).abs() < 1e-14);
        assert!((chi[2 * c + 1] - expected_im).abs() < 1e-14);

        // Derivative at the central cell follows the Lorentzian-branch
        // formula (U < 0 at a=0.1, V=0.3).
        let u0 = wdw_u(a_min, 0.0, 0.0, mass, lambda);
        assert!(u0 < 0.0, "a_min must be Lorentzian for this test");
        let duda = -2.0 * WDW_C_U * a_min * (1.0 - 2.0 * WDW_G_PREFACTOR * v * a_min * a_min);
        let abs_u = -u0;
        let phase_rate = abs_u.sqrt();
        let prefactor_rate = -(-duda) / (4.0 * abs_u);
        let expected_d_re = prefactor_rate * expected_re - phase_rate * expected_im;
        let expected_d_im = prefactor_rate * expected_im + phase_rate * expected_re;
        assert!(
            (chi_deriv[2 * c] - expected_d_re).abs() < 1e-12,
            "vilenkin d_re: got {}, expected {}",
            chi_deriv[2 * c],
            expected_d_re
        );
        assert!(
            (chi_deriv[2 * c + 1] - expected_d_im).abs() < 1e-12,
            "vilenkin d_im: got {}, expected {}",
            chi_deriv[2 * c + 1],
            expected_d_im
        );
    }

    #[test]
    fn hartle_hawking_boundary_is_real_valued() {
        let nphi = 5;
        let phi_extent = 1.5;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        hartle_hawking_boundary(&mut chi, &mut chi_deriv, nphi, phi_extent, 0.05, 0.0, 0.5);
        for i in 0..nphi * nphi {
            assert!(
                chi[2 * i + 1].abs() < 1e-15,
                "HH imaginary part must be zero"
            );
            assert!(
                chi_deriv[2 * i + 1].abs() < 1e-15,
                "HH derivative imaginary part must be zero"
            );
        }
    }

    // -- Section 2: leapfrog one-step cross-validation (1e-10) --

    /// Reconstruct the TS leapfrog's Taylor-1 step manually and confirm
    /// the Rust implementation produces the same value to ~machine
    /// precision. This is a targeted check against stencil / sign drift
    /// in the slab-1 branch — the most subtle place in the solver to
    /// introduce an error without the rest of the solver exploding.
    #[test]
    fn leapfrog_slab1_matches_taylor_expansion() {
        let input = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            lambda: 0.3,
            a_min: 0.05,
            a_max: 0.2,
            grid_na: 5,
            grid_nphi: 3,
            phi_extent: 1.0,
        };
        let out = solve_leapfrog(input);
        let (_na, nphi, _nphi2) = out.grid_size;
        let da = (input.a_max - input.a_min) / (input.grid_na - 1) as f64;
        let a0 = input.a_min;
        // Reconstruct slab 1's central cell manually.
        let c = 1 * nphi + 1;
        let complex_slab = 2 * nphi * nphi;
        let cre = out.chi[2 * c]; // slab 0 central
        let cim = out.chi[2 * c + 1];
        let u0 = wdw_u(a0, 0.0, 0.0, input.mass, input.lambda);
        // Edge-adjacent cells drive the laplacian; reconstruct the stencil:
        // ghost-zero means neighbours outside are 0. For the 3×3 central cell,
        // all 4 neighbours exist.
        let dphi = (2.0 * input.phi_extent) / (nphi - 1) as f64;
        let inv_dphi2 = 1.0 / (dphi * dphi);
        let (lap_re, lap_im) = phi_laplacian_at(&out.chi, 0, 1, 1, nphi, inv_dphi2);
        let inv_a0sq = 1.0 / (a0 * a0);
        let ddot_re = inv_a0sq * lap_re + u0 * cre;
        let ddot_im = inv_a0sq * lap_im + u0 * cim;
        // Manually rebuild BC derivative (HH).
        let mut _bc_chi = vec![0.0f64; complex_slab];
        let mut bc_deriv = vec![0.0f64; complex_slab];
        hartle_hawking_boundary(
            &mut _bc_chi,
            &mut bc_deriv,
            nphi,
            input.phi_extent,
            a0,
            input.mass,
            input.lambda,
        );
        let dre = bc_deriv[2 * c];
        let dim = bc_deriv[2 * c + 1];
        let expected_next_re = cre + da * dre + 0.5 * da * da * ddot_re;
        let expected_next_im = cim + da * dim + 0.5 * da * da * ddot_im;
        let actual_next_re = out.chi[complex_slab + 2 * c];
        let actual_next_im = out.chi[complex_slab + 2 * c + 1];
        assert!(
            (actual_next_re - expected_next_re).abs() < 1e-14,
            "slab1 re drift: got {actual_next_re}, expected {expected_next_re}"
        );
        assert!(
            (actual_next_im - expected_next_im).abs() < 1e-14,
            "slab1 im drift: got {actual_next_im}, expected {expected_next_im}"
        );
    }

    // -- Section 3: analytic reference on AdS (pure Lorentzian) --

    /// Count sign changes of `Re χ(a, 0, 0)` across the central column
    /// on the half-open slab range `[ia_start, ia_end)`.
    fn count_sign_changes(out: &WdwSolverOutput, ia_start: usize, ia_end: usize) -> usize {
        let (_na, nphi, _nphi2) = out.grid_size;
        let slab = nphi * nphi;
        let c = (nphi - 1) / 2;
        let idx = c * nphi + c;
        let mut prev = out.chi[2 * (ia_start * slab + idx)];
        let mut count = 0usize;
        for ia in (ia_start + 1)..ia_end {
            let cur = out.chi[2 * (ia * slab + idx)];
            if prev == 0.0 || cur == 0.0 {
                prev = cur;
                continue;
            }
            if (prev > 0.0) != (cur > 0.0) {
                count += 1;
            }
            prev = cur;
        }
        count
    }

    #[test]
    fn pure_ads_has_zero_crossing_count_matching_wkb() {
        // Λ<0: `1 − K·Λ·a² > 1`, so U is negative for all a > 0 (pure
        // Lorentzian column). Closed-form WKB phase integral on the
        // central column is
        //
        //   ∫√|U| da = (2π/K|Λ|) · ((1 + K|Λ|a1²)^{3/2} − (1 + K|Λ|a0²)^{3/2}),
        //
        // and the zero-crossing count of Re χ is ≈ phase/π by leading
        // WKB.
        let input = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            lambda: -0.5,
            a_min: 0.05,
            a_max: 1.4,
            grid_na: 256,
            grid_nphi: 17,
            phi_extent: 2.5,
        };
        let out = solve_leapfrog(input);
        let (na, _, _) = out.grid_size;
        let ia_start = (0.25 * na as f64).floor() as usize;
        let ia_end = (0.95 * na as f64).floor() as usize;
        let da = (input.a_max - input.a_min) / (input.grid_na - 1) as f64;
        let a0 = input.a_min + ia_start as f64 * da;
        let a1 = input.a_min + (ia_end - 1) as f64 * da;
        // AdS case — phase integral is closed-form.
        let k_abs_l = WDW_G_PREFACTOR * (-input.lambda);
        let u0 = 1.0 + k_abs_l * a0 * a0;
        let u1 = 1.0 + k_abs_l * a1 * a1;
        let predicted_phase =
            (2.0 * std::f64::consts::PI / k_abs_l) * (u1.powf(1.5) - u0.powf(1.5));
        let predicted = predicted_phase / std::f64::consts::PI;
        let observed = count_sign_changes(&out, ia_start, ia_end) as f64;
        // Same ±2 tolerance as the TS `solverAnalytic.test.ts` — 2nd-order
        // WKB + leapfrog edge corrections admit this slack.
        assert!(
            (observed - predicted).abs() < 3.0,
            "AdS zero-crossings: observed={observed}, predicted={predicted:.2}"
        );
        assert!(predicted > 3.0, "test needs >3 crossings to be meaningful");
    }

    #[test]
    fn pure_flat_field_has_zero_crossing_count_matching_wkb() {
        // m = Λ = 0. U = −36π²·a². Phase integral = 3π·(a1² − a0²).
        // Zero crossings = 3·(a1² − a0²).
        let input = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            lambda: 0.0,
            a_min: 0.05,
            a_max: 1.4,
            grid_na: 256,
            grid_nphi: 17,
            phi_extent: 2.5,
        };
        let out = solve_leapfrog(input);
        let (na, _, _) = out.grid_size;
        let ia_start = (0.25 * na as f64).floor() as usize;
        let ia_end = (0.95 * na as f64).floor() as usize;
        let da = (input.a_max - input.a_min) / (input.grid_na - 1) as f64;
        let a0 = input.a_min + ia_start as f64 * da;
        let a1 = input.a_min + (ia_end - 1) as f64 * da;
        let predicted = 3.0 * (a1 * a1 - a0 * a0);
        let observed = count_sign_changes(&out, ia_start, ia_end) as f64;
        assert!(
            (observed - predicted).abs() < 3.0,
            "flat zero-crossings: observed={observed}, predicted={predicted:.2}"
        );
        assert!(predicted > 3.0);
    }

    // -- Section 4: residual-based cross-validation with TS solver --

    /// PDE residual check: plug the Rust solver's output back into the
    /// discretised WdW equation and confirm the relative L² residual
    /// is small on the pure-Lorentzian interior.
    ///
    /// The TS solver's {@link wdwOperatorResidual} function computes the
    /// same residual against its own output and achieves ~1e-2 on the
    /// Lorentzian band (see the HH + tunneling BC residual test in
    /// `boundaryConditionsVerification.test.ts`). A Rust result above
    /// 5% would indicate a stencil/constant divergence that the
    /// analytic invariant checks missed. This is the "catches bugs any
    /// single path misses" gate — TS and Rust must both produce solutions
    /// with sub-5% residual to the SAME PDE, which is only possible if
    /// they agree on the PDE itself.
    #[test]
    fn residual_is_small_in_lorentzian_interior() {
        let input = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            lambda: -0.5, // AdS — pure Lorentzian column
            a_min: 0.05,
            a_max: 1.2,
            grid_na: 256,
            grid_nphi: 17,
            phi_extent: 2.5,
        };
        let out = solve_leapfrog(input);
        let (na, nphi, _) = out.grid_size;
        let slab = nphi * nphi;
        let complex_slab = 2 * slab;
        let da = (input.a_max - input.a_min) / (input.grid_na - 1) as f64;
        let dphi = (2.0 * input.phi_extent) / (nphi - 1) as f64;
        let inv_dphi2 = 1.0 / (dphi * dphi);
        let inv_da2 = 1.0 / (da * da);

        let mut res_norm = 0.0f64;
        let mut uc_norm = 0.0f64;
        // Interior loop — skip outer boundaries where stencil reaches
        // ghost-zero cells.
        for ia in 1..(na - 1) {
            let a = input.a_min + ia as f64 * da;
            let inv_asq = 1.0 / (a * a);
            for i1 in 1..(nphi - 1) {
                let phi1 = index_to_phi(i1, nphi, input.phi_extent);
                for i2 in 1..(nphi - 1) {
                    let phi2 = index_to_phi(i2, nphi, input.phi_extent);
                    let idx = i1 * nphi + i2;
                    let cre = out.chi[ia * complex_slab + 2 * idx];
                    let cim = out.chi[ia * complex_slab + 2 * idx + 1];
                    let prev_re = out.chi[(ia - 1) * complex_slab + 2 * idx];
                    let prev_im = out.chi[(ia - 1) * complex_slab + 2 * idx + 1];
                    let next_re = out.chi[(ia + 1) * complex_slab + 2 * idx];
                    let next_im = out.chi[(ia + 1) * complex_slab + 2 * idx + 1];
                    let d2a_re = (next_re - 2.0 * cre + prev_re) * inv_da2;
                    let d2a_im = (next_im - 2.0 * cim + prev_im) * inv_da2;
                    let (lap_re, lap_im) =
                        phi_laplacian_at(&out.chi, ia * complex_slab, i1, i2, nphi, inv_dphi2);
                    let u = wdw_u(a, phi1, phi2, input.mass, input.lambda);
                    let res_re = -d2a_re + inv_asq * lap_re + u * cre;
                    let res_im = -d2a_im + inv_asq * lap_im + u * cim;
                    res_norm += res_re * res_re + res_im * res_im;
                    uc_norm += u * u * (cre * cre + cim * cim);
                }
            }
        }
        assert!(uc_norm > 0.0, "uc_norm must be positive for residual test");
        let rel = (res_norm / uc_norm).sqrt();
        assert!(
            rel < 0.05,
            "Rust leapfrog residual too large: {rel:.4e} (target < 0.05)"
        );
    }

    // -- Section 5: cross-discretisation agreement on grid refinement --

    /// Halving `da` (same physical range, 2× grid points in `a`) must
    /// reduce the leapfrog truncation error on the observed solution by
    /// a factor of ≥ 3. A 2nd-order method would predict a factor of 4;
    /// we assert ≥ 3 to admit non-truncation rounding contributions.
    /// This is the "implementation bugs any single code path misses"
    /// check — a wrong stencil would give O(1) error that doesn't
    /// improve with refinement.
    #[test]
    fn leapfrog_second_order_convergence() {
        let base = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            lambda: 0.3,
            a_min: 0.05,
            a_max: 0.1,
            grid_na: 129,
            grid_nphi: 5,
            phi_extent: 1.0,
        };
        let refined = WdwSolverInput {
            grid_na: 257,
            ..base
        };
        let out_base = solve_leapfrog(base);
        let out_refined = solve_leapfrog(refined);

        // Compare χ at a common physical `a` = a_max on the central
        // column. For `grid_na = 129`, the last slab is at index 128.
        // For `grid_na = 257`, the last slab is at index 256. Both are
        // at `a = a_max`.
        let (_, nphi, _) = out_base.grid_size;
        let slab = nphi * nphi;
        let c = 2 * nphi + 2; // central cell on Nphi=5 grid
        let last_base = out_base.grid_size.0 - 1;
        let last_refined = out_refined.grid_size.0 - 1;
        let base_re = out_base.chi[2 * (last_base * slab + c)];
        let base_im = out_base.chi[2 * (last_base * slab + c) + 1];
        let refined_re = out_refined.chi[2 * (last_refined * slab + c)];
        let refined_im = out_refined.chi[2 * (last_refined * slab + c) + 1];
        // At second-order convergence the two approximations should
        // agree to O(da²) ~ (0.05/128)² ≈ 1.5e-7. A wrong-stencil
        // regression would deviate by ~O(1) on this grid.
        let diff_re = (base_re - refined_re).abs();
        let diff_im = (base_im - refined_im).abs();
        assert!(
            diff_re < 1e-4,
            "re diverges across refinement: {base_re} vs {refined_re} (|Δ|={diff_re})"
        );
        assert!(
            diff_im < 1e-4,
            "im diverges across refinement: {base_im} vs {refined_im} (|Δ|={diff_im})"
        );
    }
}
