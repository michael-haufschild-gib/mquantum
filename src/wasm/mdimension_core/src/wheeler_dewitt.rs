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
//!   second-order leapfrog PDE integrator with Neumann (zero-flux) ghost
//!   boundaries at the outer φ-edges. Ghost cells inherit the value of
//!   the adjacent interior-edge cell, matching the TS solver's updated
//!   φ-boundary rule (see the module docstring of
//!   `src/lib/physics/wheelerDeWitt/solver.ts` for the SRMT sensitivity
//!   sweep that motivated the switch from ghost-zero Dirichlet).
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

use crate::wdw_bessel::{
    bessel_j_quarter, bessel_j_quarter_prime, bessel_y_quarter, bessel_y_quarter_prime,
};
use crate::wdw_implicit_bulk::{
    alloc_implicit_bulk_scratch, solve_adi_laplacian_neumann_2d, ImplicitBulkScratch,
};

/// `8 π G / 3` with `G = 1`. Matches `WDW_G_PREFACTOR` in the TS solver.
pub const WDW_G_PREFACTOR: f64 = 8.0 * std::f64::consts::PI / 3.0;

/// Potential prefactor `c_U = 36 π²` in `U(a, φ) = −c_U·a²·(…)`.
pub const WDW_C_U: f64 = 36.0 * std::f64::consts::PI * std::f64::consts::PI;

/// `|V|` threshold below which a column is treated as the exact-`V = 0`
/// regime (Bessel branch) instead of the `V > 0` Langer-Ai or `V < 0`
/// leading-WKB branch. Matches `WDW_LANGER_V_ZERO_THRESHOLD` in
/// `src/lib/physics/wheelerDeWitt/hhLangerSeed.ts`. `1e-12` discriminates
/// exact-zero (free case `m = Λ = 0`) from small-but-finite V without
/// introducing a visible Gaussian-gauge discontinuity at `V = 0`.
const WDW_LANGER_V_ZERO_THRESHOLD: f64 = 1e-12;

/// `V(φ₁, φ₂) = ½ m² φ₁² + ½ (m·α)² φ₂² + Λ` where `α ≡ mass_asymmetry`
/// (the per-axis effective-mass ratio on the φ₂ axis; `α = 1` recovers
/// the isotropic `V = ½ m² (φ₁² + φ₂²) + Λ`). Must receive the same `α`
/// as the TS solver, otherwise the cross-validator compares solutions
/// of different PDEs.
#[inline]
pub fn wdw_potential(phi1: f64, phi2: f64, mass: f64, lambda: f64, mass_asymmetry: f64) -> f64 {
    let m1_sq = mass * mass;
    let m2 = mass * mass_asymmetry;
    let m2_sq = m2 * m2;
    0.5 * m1_sq * phi1 * phi1 + 0.5 * m2_sq * phi2 * phi2 + lambda
}

/// `U(a, φ) = −c_U·a²·(1 − (8πG/3)·a² · V(φ))` with the anisotropic `V`.
#[inline]
pub fn wdw_u(a: f64, phi1: f64, phi2: f64, mass: f64, lambda: f64, mass_asymmetry: f64) -> f64 {
    let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
    let a2 = a * a;
    -WDW_C_U * a2 * (1.0 - WDW_G_PREFACTOR * a2 * v)
}

/// Scale-factor turning surface `a_turn(φ)` where `U(a_turn, φ) = 0`.
/// Returns `None` when `V(φ) ≤ 0` (no turning surface exists).
#[inline]
pub fn wdw_turning_a(
    phi1: f64,
    phi2: f64,
    mass: f64,
    lambda: f64,
    mass_asymmetry: f64,
) -> Option<f64> {
    let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
    if v <= 0.0 {
        None
    } else {
        Some(1.0 / (WDW_G_PREFACTOR * v).sqrt())
    }
}

/// `Φ_L(a, φ)` — Lorentzian WKB phase `∫_0^a √|U| da'` for the `V < 0`
/// branch. Closed-form antiderivative with `β = K·|V|`:
///
///   `√|U(a')| = √c_U · a' · √(1 + β·a'²)`
///   `Φ_L(a) = (√c_U / (3β)) · ((1 + β·a²)^{3/2} − 1) = (3/(4|V|)) · ((1 + K|V|·a²)^{3/2} − 1)`
///
/// Matches `wdwLorentzianWkbPhase` in
/// `src/lib/physics/wheelerDeWitt/constants.ts`. Only the `V < 0` branch
/// is ported here — the `V = 0` branch uses the Bessel phase `3π·a²`
/// directly and the `V > 0` branch is unused by the boundary seeds that
/// Phase 5 rewrites.
#[inline]
fn wdw_lorentzian_wkb_phase_neg_v(a: f64, abs_v: f64) -> f64 {
    let k_abs_va2 = WDW_G_PREFACTOR * abs_v * a * a;
    (3.0 / (4.0 * abs_v)) * ((1.0 + k_abs_va2).powf(1.5) - 1.0)
}

/// `dU/da` in closed form: `∂_a U = 2·c_U·a·(2·K·V·a² − 1)`.
/// Matches `dUdaAnalytic` in
/// `src/lib/physics/wheelerDeWitt/exactColumnSolution.ts`.
#[inline]
fn wdw_du_da(a: f64, v: f64) -> f64 {
    2.0 * WDW_C_U * a * (2.0 * WDW_G_PREFACTOR * v * a * a - 1.0)
}

/// Signed Langer variable `ζ(a, φ)` — undefined for `V ≤ 0`, `0` returned in
/// that case. Matches `wdwLangerVariable` in
/// `src/lib/physics/wheelerDeWitt/constants.ts`.
///
/// `ζ < 0` on the Lorentzian side (`a < a_turn`), `ζ > 0` past the turning
/// surface, and the mapping `(2/3)·|ζ|^{3/2} = S_L` (resp. `S_E`) pins the
/// Langer-uniform Airy formula `χ = (ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]` to
/// the leading-WKB asymptotic at large `|ζ|`.
#[inline]
fn wdw_langer_variable(a: f64, v: f64) -> f64 {
    if v <= 0.0 {
        return 0.0;
    }
    let k_va2 = WDW_G_PREFACTOR * v * a * a;
    if k_va2 >= 1.0 {
        // Euclidean side: ζ > 0.
        let s_e = (3.0 / (4.0 * v)) * (k_va2 - 1.0).powf(1.5);
        (1.5 * s_e).powf(2.0 / 3.0)
    } else {
        // Lorentzian side: ζ < 0.
        let s_l = (3.0 / (4.0 * v)) * (1.0 - k_va2).powf(1.5);
        -(1.5 * s_l).powf(2.0 / 3.0)
    }
}

/// `ζ'(a)` for V > 0: `ζ' = √|U| / √|ζ|` with `sign(ζ') = +1` (ζ is monotone
/// increasing). Near the turning surface both numerator and denominator go
/// to zero; callers that hit `|ζ| < 1e-6` should use the finite-difference
/// fallback in `column_seed_positive_v`.
#[inline]
fn wdw_dzeta_da(a: f64, phi1: f64, phi2: f64, mass: f64, lambda: f64, mass_asymmetry: f64) -> f64 {
    let u = wdw_u(a, phi1, phi2, mass, lambda, mass_asymmetry);
    let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
    let zeta = wdw_langer_variable(a, v);
    let abs_zeta = zeta.abs().max(1e-30);
    u.abs().sqrt() / abs_zeta.sqrt()
}

/// Langer prefactor `(ζ/U)^{1/4}`. Regular through the turning surface
/// because `ζ/U > 0` (both sides flip sign simultaneously). Returns NaN if
/// `ζ/U < 0` (should not happen for physical `V > 0` columns).
#[inline]
fn langer_prefactor(zeta: f64, u: f64) -> f64 {
    const EPS: f64 = 1e-30;
    let denom = if u == 0.0 {
        if u >= 0.0 {
            EPS
        } else {
            -EPS
        }
    } else {
        u
    };
    let ratio = zeta / denom;
    if ratio < 0.0 {
        f64::NAN
    } else {
        ratio.abs().powf(0.25)
    }
}

/// Evaluate the Langer-uniform χ at a single `a` for the V > 0 regime.
/// Used inside the finite-difference derivative fallback near the turning
/// surface.
fn langer_chi_real(
    a: f64,
    phi1: f64,
    phi2: f64,
    mass: f64,
    lambda: f64,
    mass_asymmetry: f64,
    c1: f64,
    c2: f64,
) -> f64 {
    let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
    let zeta = wdw_langer_variable(a, v);
    let u = wdw_u(a, phi1, phi2, mass, lambda, mass_asymmetry);
    let pref = langer_prefactor(zeta, u);
    let s = crate::wdw_airy::airy_all(zeta);
    pref * (c1 * s.ai + c2 * s.bi)
}

/// V > 0 Langer-uniform column seed with real coefficients `(c1, c2)`.
///
/// Evaluates the Langer-uniform Airy combination and its analytic derivative:
///
///   `χ = (ζ/U)^{1/4}·W(ζ)` with `W(ζ) = c₁·Ai(ζ) + c₂·Bi(ζ)`
///   `χ' = pref·(1/4)·(ζ'/ζ − U'/U)·W + pref·W'·ζ'(a)`
///
/// Near the turning surface the chain-rule formula becomes `0/0` (both `ζ`
/// and `U` vanish at the same rate). We detect `|ζ| < 1e-3` and fall back to
/// a symmetric finite difference of `langer_chi_real`, which keeps the
/// error below the Airy evaluator's own ~1e-9 asymptotic floor.
///
/// Mirrors `columnSolutionPositiveV` in
/// `src/lib/physics/wheelerDeWitt/exactColumnSolution.ts`.
#[allow(clippy::too_many_arguments)]
fn column_seed_positive_v(
    a: f64,
    phi1: f64,
    phi2: f64,
    mass: f64,
    lambda: f64,
    mass_asymmetry: f64,
    c1: f64,
    c2: f64,
) -> (f64, f64) {
    let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
    let zeta = wdw_langer_variable(a, v);
    let u = wdw_u(a, phi1, phi2, mass, lambda, mass_asymmetry);
    let pref = langer_prefactor(zeta, u);
    let s = crate::wdw_airy::airy_all(zeta);
    let chi = pref * (c1 * s.ai + c2 * s.bi);

    let abs_zeta = zeta.abs();
    let dchi = if abs_zeta < 1e-3 {
        // Near the turning surface: symmetric FD over a small step.
        let a_turn = 1.0 / (WDW_G_PREFACTOR * v).sqrt();
        let h = (1e-6 * a_turn).max(1e-8);
        let plus = langer_chi_real(a + h, phi1, phi2, mass, lambda, mass_asymmetry, c1, c2);
        let minus = langer_chi_real(a - h, phi1, phi2, mass, lambda, mass_asymmetry, c1, c2);
        (plus - minus) / (2.0 * h)
    } else {
        let zeta_prime = wdw_dzeta_da(a, phi1, phi2, mass, lambda, mass_asymmetry);
        let u_prime = wdw_du_da(a, v);
        let w_mix = c1 * s.ai + c2 * s.bi;
        let w_mix_prime = c1 * s.ai_prime + c2 * s.bi_prime;
        let pref_rate = 0.25 * (zeta_prime / zeta - u_prime / u);
        pref * pref_rate * w_mix + pref * w_mix_prime * zeta_prime
    };

    (chi, dchi)
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
    /// Per-axis effective-mass ratio `α` on the φ₂ axis
    /// (`V = ½ m² φ₁² + ½ (m·α)² φ₂² + Λ`). `α = 1` ⇒ isotropic potential,
    /// matching the TS `inflatonMassAsymmetry` default.
    pub mass_asymmetry: f64,
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

/// V=0 Hartle–Hawking / Vilenkin column seed helper.
///
/// Evaluates
///
///   `χ(a_min) = √a · (A·J_{1/4}(z) + B·Y_{1/4}(z))`
///   `χ'(a_min) = (1/(2√a))·(A·J + B·Y) + √a·6π·a·(A·J' + B·Y')`  (z = 3π·a²)
///
/// with complex coefficients `A = (A_re, A_im)`, `B = (B_re, B_im)`.
/// Both imaginary-part tracks run through `A.im·J + B.im·Y` independently
/// of the real tracks — the bilinearity of Bessel evaluation.
///
/// Returns `((chi_re, chi_im), (dchi_re, dchi_im))`.
#[inline]
#[allow(clippy::too_many_arguments)]
fn column_seed_zero_v(
    a: f64,
    a_re: f64,
    a_im: f64,
    b_re: f64,
    b_im: f64,
) -> ((f64, f64), (f64, f64)) {
    let z = 3.0 * std::f64::consts::PI * a * a;
    let j = bessel_j_quarter(z);
    let y = bessel_y_quarter(z);
    let jp = bessel_j_quarter_prime(z);
    let yp = bessel_y_quarter_prime(z);
    let sqrt_a = a.sqrt();
    let inv_2_sqrt_a = 1.0 / (2.0 * sqrt_a);
    let six_pi_a = 6.0 * std::f64::consts::PI * a;

    let chi_re = sqrt_a * (a_re * j + b_re * y);
    let chi_im = sqrt_a * (a_im * j + b_im * y);
    let dchi_re =
        inv_2_sqrt_a * (a_re * j + b_re * y) + sqrt_a * six_pi_a * (a_re * jp + b_re * yp);
    let dchi_im =
        inv_2_sqrt_a * (a_im * j + b_im * y) + sqrt_a * six_pi_a * (a_im * jp + b_im * yp);
    ((chi_re, chi_im), (dchi_re, dchi_im))
}

/// V<0 Hartle–Hawking / Vilenkin column seed helper (leading WKB).
///
/// Evaluates
///
///   `χ(a) = |U|^{-1/4} · (A·cos Φ_L + B·sin Φ_L)`
///   `χ'(a) = pref'·(A·cos Φ_L + B·sin Φ_L) + pref·(−A·sin Φ_L + B·cos Φ_L)·√|U|`
///
/// with `pref' = (1/4)·|U|^{-5/4}·dU/da` (since `d|U|/da = −dU/da` for
/// `U < 0`, so `d|U|^{-1/4}/da = (1/4)·|U|^{-5/4}·dU/da`).
///
/// The caller asserts `V < 0` and therefore `U < 0` everywhere; this
/// helper does not validate.
#[inline]
#[allow(clippy::too_many_arguments)]
fn column_seed_negative_v(
    a: f64,
    v: f64,
    u: f64,
    a_re: f64,
    a_im: f64,
    b_re: f64,
    b_im: f64,
) -> ((f64, f64), (f64, f64)) {
    let abs_u = -u;
    let pref = abs_u.powf(-0.25);
    let phase = wdw_lorentzian_wkb_phase_neg_v(a, -v);
    let c = phase.cos();
    let s = phase.sin();

    let chi_re = pref * (a_re * c + b_re * s);
    let chi_im = pref * (a_im * c + b_im * s);

    let u_prime = wdw_du_da(a, v);
    let pref_prime = 0.25 * abs_u.powf(-1.25) * u_prime;
    let phase_prime = abs_u.sqrt();

    let osc_re = a_re * c + b_re * s;
    let osc_im = a_im * c + b_im * s;
    let osc_prime_re = -a_re * s + b_re * c;
    let osc_prime_im = -a_im * s + b_im * c;

    let dchi_re = pref_prime * osc_re + pref * osc_prime_re * phase_prime;
    let dchi_im = pref_prime * osc_im + pref * osc_prime_im * phase_prime;

    ((chi_re, chi_im), (dchi_re, dchi_im))
}

/// Hartle–Hawking no-boundary seed — Langer-uniform Phase 5 port.
///
/// Mirrors `hhLangerSeed` in
/// `src/lib/physics/wheelerDeWitt/hhLangerSeed.ts`. Dispatch by
/// `sign(V(φ))`:
///
///  - `V > 0` : Langer-uniform Ai branch `χ = (ζ/U)^{1/4}·Ai(ζ)` (pure
///    `c₁=1, c₂=0`). Regular at the classical singularity; exponentially
///    decays past the turning surface. Matches
///    `columnSolutionPositiveV(..., 1, 0)` in TS. The HH envelope is carried
///    by the Ai decay, not by the Gaussian `exp(-½|φ|²)`.
///  - `V = 0` : pure Bessel branch `χ = env · √a · J_{1/4}(3π·a²)` — the
///    exact column solution for the reduced WdW equation at `V = 0`.
///    HH selects `A = env, B = 0` (real J-branch only). Matches
///    `columnSolutionZeroV(a, {re: env}, 0)` in TS.
///  - `V < 0` : leading-WKB `χ = env · |U|^{-1/4} · cos Φ_L(a)`.
///    HH selects the real (standing-wave) combination. Matches
///    `columnSolutionNegativeV(..., {re: env}, 0)` in TS.
///
/// Writes `N_phi²` complex entries into each of `chi` and `chi_deriv`.
#[allow(clippy::too_many_arguments)]
fn hartle_hawking_boundary(
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
    mass: f64,
    lambda: f64,
    mass_asymmetry: f64,
) {
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
            let idx = i1 * nphi + i2;

            if v > WDW_LANGER_V_ZERO_THRESHOLD {
                // V > 0: Langer-uniform Ai branch (c1=1, c2=0). No Gaussian
                // envelope — the Ai decay past the turning surface IS the
                // HH amplitude profile.
                let (cre, dre) = column_seed_positive_v(
                    a_min,
                    phi1,
                    phi2,
                    mass,
                    lambda,
                    mass_asymmetry,
                    1.0,
                    0.0,
                );
                chi[2 * idx] = cre;
                chi[2 * idx + 1] = 0.0;
                chi_deriv[2 * idx] = dre;
                chi_deriv[2 * idx + 1] = 0.0;
                continue;
            }

            let env = (-0.5 * (phi1 * phi1 + phi2 * phi2)).exp();
            if v < -WDW_LANGER_V_ZERO_THRESHOLD {
                let u = wdw_u(a_min, phi1, phi2, mass, lambda, mass_asymmetry);
                let ((cre, cim), (dre, dim)) =
                    column_seed_negative_v(a_min, v, u, env, 0.0, 0.0, 0.0);
                chi[2 * idx] = cre;
                chi[2 * idx + 1] = cim;
                chi_deriv[2 * idx] = dre;
                chi_deriv[2 * idx + 1] = dim;
            } else {
                // Exact V = 0: env · √a · J_{1/4}(3π·a²).
                let ((cre, cim), (dre, dim)) = column_seed_zero_v(a_min, env, 0.0, 0.0, 0.0);
                chi[2 * idx] = cre;
                chi[2 * idx + 1] = cim;
                chi_deriv[2 * idx] = dre;
                chi_deriv[2 * idx + 1] = dim;
            }
        }
    }
}

/// Vilenkin tunneling seed — Langer-uniform Phase 5 port.
///
/// Mirrors `vilenkinLangerSeed` in
/// `src/lib/physics/wheelerDeWitt/hhLangerSeed.ts`. Dispatch by
/// `sign(V(φ))`:
///
///  - `V > 0` : Langer-uniform outgoing combination
///    `χ = (ζ/U)^{1/4}·(Ai(ζ) + i·Bi(ζ))`. The asymptotic form
///    `Ai + i·Bi → (1/√π)·|ζ|^{-1/4}·exp(-i|S_L| + iπ/4)` gives
///    `χ'/χ → +i·√|U|` — the +a-direction outgoing phase that Vilenkin's
///    tunneling proposal selects. Matches `columnSolutionPositiveV(c1=1, c2=0)
///    + i · columnSolutionPositiveV(c1=0, c2=1)` combined per branch in
///    `vilenkinLangerSeed` (TS).
///  - `V = 0` : outgoing Hankel `χ = env · √a · (J_{1/4}(3π·a²) +
///    i·Y_{1/4}(3π·a²))`. Selects `A = env (real)`, `B = i·env` in the
///    `χ = √a·(A·J + B·Y)` form.
///  - `V < 0` : leading-WKB outgoing wave `χ = env · |U|^{-1/4} ·
///    exp(+i·Φ_L)`. Selects `A = env, B = i·env` in the
///    `χ = pref·(A·cos + B·sin)` form so that
///    `A·cos + B·sin = env·(cos + i·sin) = env·exp(+i·Φ_L)`.
#[allow(clippy::too_many_arguments)]
fn vilenkin_boundary(
    chi: &mut [f64],
    chi_deriv: &mut [f64],
    nphi: usize,
    phi_extent: f64,
    a_min: f64,
    mass: f64,
    lambda: f64,
    mass_asymmetry: f64,
) {
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let v = wdw_potential(phi1, phi2, mass, lambda, mass_asymmetry);
            let idx = i1 * nphi + i2;

            if v > WDW_LANGER_V_ZERO_THRESHOLD {
                // V > 0: Ai + i·Bi Langer combination. Linearity of the
                // Langer prefactor and the Airy evaluator lets us evaluate
                // Re(χ) and Im(χ) by calling the real-coefficient seed
                // twice with `(c1=1, c2=0)` and `(c1=0, c2=1)` and
                // stitching.
                let (re_chi, re_dchi) = column_seed_positive_v(
                    a_min,
                    phi1,
                    phi2,
                    mass,
                    lambda,
                    mass_asymmetry,
                    1.0,
                    0.0,
                );
                let (im_chi, im_dchi) = column_seed_positive_v(
                    a_min,
                    phi1,
                    phi2,
                    mass,
                    lambda,
                    mass_asymmetry,
                    0.0,
                    1.0,
                );
                chi[2 * idx] = re_chi;
                chi[2 * idx + 1] = im_chi;
                chi_deriv[2 * idx] = re_dchi;
                chi_deriv[2 * idx + 1] = im_dchi;
                continue;
            }

            let env = (-0.5 * (phi1 * phi1 + phi2 * phi2)).exp();
            if v < -WDW_LANGER_V_ZERO_THRESHOLD {
                // V < 0: env·|U|^{-1/4}·exp(+i·Φ_L). A = env, B = i·env.
                let u = wdw_u(a_min, phi1, phi2, mass, lambda, mass_asymmetry);
                let ((cre, cim), (dre, dim)) =
                    column_seed_negative_v(a_min, v, u, env, 0.0, 0.0, env);
                chi[2 * idx] = cre;
                chi[2 * idx + 1] = cim;
                chi_deriv[2 * idx] = dre;
                chi_deriv[2 * idx + 1] = dim;
            } else {
                // V = 0: env·√a·(J + i·Y). A = env, B = i·env.
                let ((cre, cim), (dre, dim)) = column_seed_zero_v(a_min, env, 0.0, 0.0, env);
                chi[2 * idx] = cre;
                chi[2 * idx + 1] = cim;
                chi_deriv[2 * idx] = dre;
                chi_deriv[2 * idx + 1] = dim;
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
    mass_asymmetry: f64,
) {
    match bc {
        WdwBoundaryCondition::NoBoundary => {
            hartle_hawking_boundary(
                chi,
                chi_deriv,
                nphi,
                phi_extent,
                a_min,
                mass,
                lambda,
                mass_asymmetry,
            );
        }
        WdwBoundaryCondition::Tunneling => {
            vilenkin_boundary(
                chi,
                chi_deriv,
                nphi,
                phi_extent,
                a_min,
                mass,
                lambda,
                mass_asymmetry,
            );
        }
        WdwBoundaryCondition::DeWitt => dewitt_boundary(chi, chi_deriv, nphi, phi_extent, a_min),
    }
}

/// Neumann-ghost φ-Laplacian at `(i1, i2)` on the complex slab
/// `slab[slab_base..slab_base + 2·N_phi²]` (interleaved re, im).
/// Returns `(re, im)` of `∇²_φ χ`.
///
/// Ghost rule (zero-flux): cells one step past the outer `φ`-edge
/// inherit the value of the adjacent interior-edge cell. This matches
/// the TS production solver's updated boundary treatment — the
/// previous ghost-zero Dirichlet rule clipped the χ tail at the edge
/// and produced non-monotone `q_a(phiExtent)` in SRMT sensitivity
/// sweeps. Under Neumann, a constant-in-φ seed is an exact
/// eigenfunction of this stencil with eigenvalue `0` at every cell
/// including the edges.
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
    // Neumann ghost: fall back to the centre-cell value when the
    // neighbour would sit outside the grid (so that side's stencil
    // contribution is `(c + c − 2c) = 0`).
    let pre1 = if i1 > 0 {
        slab[slab_base + 2 * ((i1 - 1) * nphi + i2)]
    } else {
        cre
    };
    let pim1 = if i1 > 0 {
        slab[slab_base + 2 * ((i1 - 1) * nphi + i2) + 1]
    } else {
        cim
    };
    let nre1 = if i1 < nphi - 1 {
        slab[slab_base + 2 * ((i1 + 1) * nphi + i2)]
    } else {
        cre
    };
    let nim1 = if i1 < nphi - 1 {
        slab[slab_base + 2 * ((i1 + 1) * nphi + i2) + 1]
    } else {
        cim
    };
    let pre2 = if i2 > 0 {
        slab[slab_base + 2 * (i1 * nphi + i2 - 1)]
    } else {
        cre
    };
    let pim2 = if i2 > 0 {
        slab[slab_base + 2 * (i1 * nphi + i2 - 1) + 1]
    } else {
        cim
    };
    let nre2 = if i2 < nphi - 1 {
        slab[slab_base + 2 * (i1 * nphi + i2 + 1)]
    } else {
        cre
    };
    let nim2 = if i2 < nphi - 1 {
        slab[slab_base + 2 * (i1 * nphi + i2 + 1) + 1]
    } else {
        cim
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
/// with Neumann (zero-flux) ghost on the φ-edges and the chosen
/// boundary condition at `a = a_min`. Returns the full `(a, φ₁, φ₂)`
/// tensor. No clamping, no absorber, no Airy overwrite — the raw PDE
/// output.
///
/// # Panics
///
/// Panics on invalid grid sizes or non-monotonic `a` range.
pub fn solve_leapfrog(input: WdwSolverInput) -> WdwSolverOutput {
    let WdwSolverInput {
        bc,
        mass,
        mass_asymmetry,
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
        build_boundary(
            bc,
            slab0,
            &mut bc_deriv,
            nphi,
            phi_extent,
            a_min,
            mass,
            lambda,
            mass_asymmetry,
        );
    }

    // The JS production solver stores `chi` as a `Float32Array`, so
    // every inter-slab read is preceded by an f32 truncation. To reach
    // `1e-5` pointwise parity with `solverWasmComparison.test.ts`, the
    // Rust validator must replicate this quantisation at every slab
    // write — otherwise an oscillatory ~7-wavelength AdS solution drifts
    // by `~sqrt(Na)·2⁻²³ ≈ 1·10⁻⁶` per component, just visible at the
    // 1e-5 tolerance. The helper applies the `f64 → f32 → f64`
    // round-trip.
    let f32_roundtrip = |x: f64| (x as f32) as f64;

    // Quantise slab 0 to f32 up-front — JS quantises on
    // `chi.set(initial.chi, 0)` into its Float32Array, so the slab-1
    // Taylor expansion reads f32-quantised values.
    for slot in chi.iter_mut().take(complex_slab) {
        *slot = f32_roundtrip(*slot);
    }
    // The JS boundary-condition generator returns `initial.chiDeriv` as
    // a `Float32Array` (see `src/lib/physics/wheelerDeWitt/boundaryConditions.ts`
    // `WdwBoundaryField`), so slab-1 reads of the derivative also receive
    // f32-quantised values. Match that here.
    for slot in &mut bc_deriv {
        *slot = f32_roundtrip(*slot);
    }

    // Slab 1 from Taylor expansion: χ(a_min + da) = χ + da·χ' + ½·da²·χ''.
    let a0 = a_min;
    let inv_a0sq = 1.0 / (a0 * a0);
    for i1 in 0..nphi {
        let phi1 = index_to_phi(i1, nphi, phi_extent);
        for i2 in 0..nphi {
            let phi2 = index_to_phi(i2, nphi, phi_extent);
            let idx = i1 * nphi + i2;
            let u0 = wdw_u(a0, phi1, phi2, mass, lambda, mass_asymmetry);
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
            chi[complex_slab + 2 * idx] = f32_roundtrip(next_re);
            chi[complex_slab + 2 * idx + 1] = f32_roundtrip(next_im);
        }
    }

    // Main loop for slabs `ia = 2 .. Na-1`. The JS production solver at
    // `src/lib/physics/wheelerDeWitt/solver.ts` (the Crank–Nicolson ADI
    // update at line ~807) uses the semi-implicit scheme for Lorentzian
    // cells:
    //
    //   χ_next − (da²/2)·L_next·χ_next =
    //     2·χ_cur − χ_prev + (da²/2)·L_prev·χ_prev + da²·U_cur·χ_cur
    //
    // with `L = (1/a²)·∇²_φ`. This Rust port ports the Lorentzian branch
    // only (the `EuclideanTransition` and `EuclideanDeep` bands are
    // deliberately omitted — they activate only for `V(φ) > 0` on some
    // column, and `solverWasmComparison.test.ts` specifically restricts
    // to `Λ ≤ 0` at `m = 0` so `U < 0` everywhere and every cell is
    // Lorentzian).
    let mut adi_scratch: ImplicitBulkScratch = alloc_implicit_bulk_scratch(nphi);
    let mut adi_rhs = vec![0.0f64; complex_slab];
    let mut adi_out = vec![0.0f64; complex_slab];
    let da2 = da * da;
    let half_da2 = 0.5 * da2;

    for ia in 2..na {
        let a_next = a_min + ia as f64 * da;
        let a_cur = a_min + (ia - 1) as f64 * da;
        let a_prev = a_min + (ia - 2) as f64 * da;
        let inv_aprev_sq = 1.0 / (a_prev * a_prev);
        let prev_slab_base = (ia - 2) * complex_slab;
        let cur_slab_base = (ia - 1) * complex_slab;
        let next_slab_base = ia * complex_slab;

        // Same `κ̂ = (da²/2)·(1/a_next²)·(1/dphi²)` for every (i1, i2).
        let kappa_next = (half_da2 * (1.0 / (a_next * a_next))) / (dphi * dphi);
        let lap_prev_scale = half_da2 * inv_aprev_sq;

        // Step A — Assemble RHS on every (i1, i2). JS writes the RHS
        // into `Float32Array adiRhs` before the ADI solve reads it, so
        // apply the f32 round-trip here as well for bitwise-parity
        // round-off accumulation.
        for i1 in 0..nphi {
            let phi1 = index_to_phi(i1, nphi, phi_extent);
            for i2 in 0..nphi {
                let phi2 = index_to_phi(i2, nphi, phi_extent);
                let idx = i1 * nphi + i2;

                let u_cur = wdw_u(a_cur, phi1, phi2, mass, lambda, mass_asymmetry);
                let cur_re = chi[cur_slab_base + 2 * idx];
                let cur_im = chi[cur_slab_base + 2 * idx + 1];
                let prev_re = chi[prev_slab_base + 2 * idx];
                let prev_im = chi[prev_slab_base + 2 * idx + 1];

                let (lap_prev_re, lap_prev_im) =
                    phi_laplacian_at(&chi, prev_slab_base, i1, i2, nphi, inv_dphi2);

                adi_rhs[2 * idx] = f32_roundtrip(
                    2.0 * cur_re - prev_re + lap_prev_scale * lap_prev_re + da2 * u_cur * cur_re,
                );
                adi_rhs[2 * idx + 1] = f32_roundtrip(
                    2.0 * cur_im - prev_im + lap_prev_scale * lap_prev_im + da2 * u_cur * cur_im,
                );
            }
        }

        // Step B — ADI solve.
        solve_adi_laplacian_neumann_2d(&adi_rhs, &mut adi_out, nphi, kappa_next, &mut adi_scratch);

        // Step C — Lorentzian branch: copy ADI output into the slab
        // with per-cell f32 quantisation.
        for i in 0..complex_slab {
            chi[next_slab_base + i] = f32_roundtrip(adi_out[i]);
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
        let u = wdw_u(0.1, 0.0, 0.0, 0.0, 0.0, 1.0);
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
        let u2 = wdw_u(0.5, 0.0, 0.0, 0.0, 0.3, 1.0);
        assert!(
            (u2 - expected).abs() < 1e-12,
            "wdw_u ds case: got {u2}, expected {expected}"
        );
    }

    #[test]
    fn wdw_turning_a_matches_closed_form() {
        // a_turn = 1/√(K·V). For V=0.3, K=8π/3: a_turn = 1/√(8π/3·0.3) ≈ 0.631.
        let at = wdw_turning_a(0.0, 0.0, 0.0, 0.3, 1.0).expect("turning surface exists for V>0");
        let expected = 1.0 / (WDW_G_PREFACTOR * 0.3).sqrt();
        assert!((at - expected).abs() < 1e-12);

        // No turning surface when V ≤ 0.
        assert!(wdw_turning_a(0.0, 0.0, 0.0, -0.5, 1.0).is_none());
        assert!(wdw_turning_a(0.0, 0.0, 0.0, 0.0, 1.0).is_none());
    }

    /// **Phase 5b rebaseline**: the pre-Phase-5 test pinned the leading-WKB
    /// form `χ = exp(+i·a³V/3)`. Phase 5b replaces the V > 0 branch with the
    /// Langer-uniform Ai + i·Bi Airy combination. The new physics gate here
    /// is the Langer-uniform form's self-consistency at the central cell:
    ///
    ///   `Re(χ) = (ζ/U)^{1/4}·Ai(ζ)`, `Im(χ) = (ζ/U)^{1/4}·Bi(ζ)`
    ///
    /// computed independently of the boundary generator via the underlying
    /// Airy evaluator. A transcription error in the generator would break
    /// this at the f64-precision floor (1e-14).
    #[test]
    fn vilenkin_boundary_matches_langer_airy_at_origin() {
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
            1.0,
        );
        let c = 1 * nphi + 1;
        // At φ=(0,0) and V = λ > 0, the new seed is
        //   Re(χ) = (ζ/U)^{1/4}·Ai(ζ)
        //   Im(χ) = (ζ/U)^{1/4}·Bi(ζ)
        // Reference computed here via the Airy evaluator directly.
        let v = lambda;
        let zeta = wdw_langer_variable(a_min, v);
        let u0 = wdw_u(a_min, 0.0, 0.0, mass, lambda, 1.0);
        let pref = langer_prefactor(zeta, u0);
        let s = crate::wdw_airy::airy_all(zeta);
        let expected_re = pref * s.ai;
        let expected_im = pref * s.bi;
        assert!(
            (chi[2 * c] - expected_re).abs() < 1e-14,
            "vilenkin V>0 re: got {}, expected {expected_re}",
            chi[2 * c]
        );
        assert!(
            (chi[2 * c + 1] - expected_im).abs() < 1e-14,
            "vilenkin V>0 im: got {}, expected {expected_im}",
            chi[2 * c + 1]
        );

        // Outgoing-wave physics: at |ζ| ≳ 1 (here |ζ| ≈ 2.35, a_min well
        // below the turning surface) the phase rate approaches +√|U|. We
        // only require the sign to be correct (outgoing) and the magnitude
        // to be within a factor of 2 of the asymptotic prediction — Langer
        // deviates from leading-WKB by O(1/|ζ|^{3/2}) ≈ 30% at this
        // |ζ|, which is the whole reason we ported the full form.
        let dre = chi_deriv[2 * c];
        let dim = chi_deriv[2 * c + 1];
        let chi_re = chi[2 * c];
        let chi_im = chi[2 * c + 1];
        let chi_mag = (chi_re * chi_re + chi_im * chi_im).sqrt();
        // χ'/χ = (χ'·conj(χ)) / |χ|²
        let dchi_over_chi_im = (dim * chi_re - dre * chi_im) / (chi_mag * chi_mag);
        let abs_u = -u0;
        let wkb_phase_rate = abs_u.sqrt();
        assert!(
            dchi_over_chi_im > 0.5 * wkb_phase_rate && dchi_over_chi_im < 2.0 * wkb_phase_rate,
            "Im(χ'/χ) at φ=0: got {dchi_over_chi_im}, expected ≈ +√|U| = {wkb_phase_rate}"
        );
    }

    /// **Rebaselined for Phase 5**: this test exercises the
    /// `V > 0` HH branch (`mass = 0, lambda = 0.5` → `V = 0.5 > 0`
    /// everywhere) which Phase 5 deliberately kept in pre-Phase-5
    /// leading-WKB form. The resulting `χ` is real-valued and the
    /// imaginary-part assertion is unchanged. The new `V = 0` and
    /// `V < 0` HH seeds introduced by Phase 5 are real-valued as well
    /// (HH selects the `J_{1/4}` / `cos Φ_L` branch only); those
    /// branches are covered by `hh_boundary_v_equals_zero_matches_bessel`
    /// and `hh_boundary_v_less_than_zero_matches_wkb_standing_wave`
    /// below.
    #[test]
    fn hartle_hawking_boundary_is_real_valued() {
        let nphi = 5;
        let phi_extent = 1.5;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        hartle_hawking_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            0.05,
            0.0,
            0.5,
            1.0,
        );
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

    /// Phase 5 — `V = 0` HH seed pins the exact Bessel form
    /// `χ(a) = env · √a · J_{1/4}(3π·a²)` at the `φ = 0` centre cell,
    /// with `env(0, 0) = 1`. The assertion is hand-computed against the
    /// formula (not against the solver's own output) using the same
    /// `bessel_j_quarter` helper — any sign or prefactor error in the
    /// seed would break the hand-computed expectation.
    #[test]
    fn hh_boundary_v_equals_zero_matches_bessel() {
        let nphi = 3;
        let phi_extent = 1.0;
        let a_min = 0.05_f64;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        hartle_hawking_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            a_min,
            0.0, // mass
            0.0, // lambda  → V = 0 everywhere
            1.0,
        );
        let c = 1 * nphi + 1;
        let z = 3.0 * std::f64::consts::PI * a_min * a_min;
        let expected_chi_re = a_min.sqrt() * bessel_j_quarter(z);
        let expected_dchi_re = (1.0 / (2.0 * a_min.sqrt())) * bessel_j_quarter(z)
            + a_min.sqrt() * 6.0 * std::f64::consts::PI * a_min * bessel_j_quarter_prime(z);

        assert!(
            (chi[2 * c] - expected_chi_re).abs() < 1e-12,
            "HH V=0 chi.re: got {}, expected {expected_chi_re}",
            chi[2 * c]
        );
        assert!(chi[2 * c + 1].abs() < 1e-15, "HH V=0 chi.im must be zero");
        assert!(
            (chi_deriv[2 * c] - expected_dchi_re).abs() < 1e-10,
            "HH V=0 dchi.re: got {}, expected {expected_dchi_re}",
            chi_deriv[2 * c]
        );
        assert!(
            chi_deriv[2 * c + 1].abs() < 1e-15,
            "HH V=0 dchi.im must be zero"
        );
    }

    /// Phase 5 — `V < 0` HH seed pins the leading-WKB standing-wave
    /// form `χ = env · |U|^{-1/4} · cos Φ_L` with the full closed-form
    /// derivative at the `φ = 0` cell.
    #[test]
    fn hh_boundary_v_less_than_zero_matches_wkb_standing_wave() {
        let nphi = 3;
        let phi_extent = 1.0;
        let a_min = 0.05_f64;
        let lambda = -0.5_f64;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        hartle_hawking_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            a_min,
            0.0,
            lambda,
            1.0,
        );
        let c = 1 * nphi + 1;
        let u = wdw_u(a_min, 0.0, 0.0, 0.0, lambda, 1.0);
        assert!(u < 0.0, "AdS column must be Lorentzian");
        let abs_u = -u;
        let pref = abs_u.powf(-0.25);
        let phase = wdw_lorentzian_wkb_phase_neg_v(a_min, -lambda);
        let c_phase = phase.cos();
        let s_phase = phase.sin();
        let env: f64 = 1.0; // φ = (0, 0)
        let expected_chi_re = pref * env * c_phase;

        let u_prime = wdw_du_da(a_min, lambda);
        let pref_prime = 0.25 * abs_u.powf(-1.25) * u_prime;
        let phase_prime = abs_u.sqrt();
        let expected_dchi_re = pref_prime * env * c_phase + pref * (-env * s_phase) * phase_prime;

        assert!(
            (chi[2 * c] - expected_chi_re).abs() < 1e-12,
            "HH V<0 chi.re: got {}, expected {expected_chi_re}",
            chi[2 * c]
        );
        assert!(chi[2 * c + 1].abs() < 1e-15, "HH V<0 chi.im must be zero");
        assert!(
            (chi_deriv[2 * c] - expected_dchi_re).abs() < 1e-10,
            "HH V<0 dchi.re: got {}, expected {expected_dchi_re}",
            chi_deriv[2 * c]
        );
        assert!(
            chi_deriv[2 * c + 1].abs() < 1e-15,
            "HH V<0 dchi.im must be zero"
        );
    }

    /// Phase 5 — `V = 0` Vilenkin seed pins the outgoing Hankel form
    /// `χ = env · √a · (J_{1/4}(3π·a²) + i·Y_{1/4}(3π·a²))`. Outgoing
    /// phase `χ'/χ → +√|U|` as `a → ∞` is a consequence of the Hankel
    /// asymptotic, not checked directly here (the point is the seed
    /// agrees with the closed-form at `a_min`).
    #[test]
    fn vilenkin_boundary_v_equals_zero_matches_bessel_hankel() {
        let nphi = 3;
        let phi_extent = 1.0;
        let a_min = 0.05_f64;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        vilenkin_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            a_min,
            0.0,
            0.0,
            1.0,
        );
        let c = 1 * nphi + 1;
        let z = 3.0 * std::f64::consts::PI * a_min * a_min;
        let sqrt_a = a_min.sqrt();
        let j = bessel_j_quarter(z);
        let y = bessel_y_quarter(z);
        let jp = bessel_j_quarter_prime(z);
        let yp = bessel_y_quarter_prime(z);
        let expected_chi_re = sqrt_a * j;
        let expected_chi_im = sqrt_a * y;
        let six_pi_a = 6.0 * std::f64::consts::PI * a_min;
        let expected_dchi_re = (1.0 / (2.0 * sqrt_a)) * j + sqrt_a * six_pi_a * jp;
        let expected_dchi_im = (1.0 / (2.0 * sqrt_a)) * y + sqrt_a * six_pi_a * yp;

        assert!((chi[2 * c] - expected_chi_re).abs() < 1e-12);
        assert!((chi[2 * c + 1] - expected_chi_im).abs() < 1e-12);
        assert!((chi_deriv[2 * c] - expected_dchi_re).abs() < 1e-10);
        assert!((chi_deriv[2 * c + 1] - expected_dchi_im).abs() < 1e-10);
    }

    /// Phase 5 — `V < 0` Vilenkin seed pins the outgoing-wave form
    /// `χ = env · |U|^{-1/4} · exp(+i·Φ_L) = pref·(cos + i·sin)` with
    /// `A = env, B = i·env`.
    #[test]
    fn vilenkin_boundary_v_less_than_zero_matches_wkb_outgoing() {
        let nphi = 3;
        let phi_extent = 1.0;
        let a_min = 0.05_f64;
        let lambda = -0.5_f64;
        let mut chi = vec![0.0f64; 2 * nphi * nphi];
        let mut chi_deriv = vec![0.0f64; 2 * nphi * nphi];
        vilenkin_boundary(
            &mut chi,
            &mut chi_deriv,
            nphi,
            phi_extent,
            a_min,
            0.0,
            lambda,
            1.0,
        );
        let c = 1 * nphi + 1;
        let u = wdw_u(a_min, 0.0, 0.0, 0.0, lambda, 1.0);
        let abs_u = -u;
        let pref = abs_u.powf(-0.25);
        let phase = wdw_lorentzian_wkb_phase_neg_v(a_min, -lambda);
        let c_phase = phase.cos();
        let s_phase = phase.sin();
        let env: f64 = 1.0;

        // χ = pref · (env·cos + i·env·sin) → re = pref·env·cos, im = pref·env·sin.
        let expected_chi_re = pref * env * c_phase;
        let expected_chi_im = pref * env * s_phase;

        let u_prime = wdw_du_da(a_min, lambda);
        let pref_prime = 0.25 * abs_u.powf(-1.25) * u_prime;
        let phase_prime = abs_u.sqrt();
        // A=env (real), B=i·env → A.re=env, A.im=0, B.re=0, B.im=env.
        //   osc_re = env·cos + 0·sin = env·cos
        //   osc_im = 0·cos + env·sin = env·sin
        //   osc'_re = −env·sin + 0·cos = −env·sin
        //   osc'_im = 0·sin + env·cos = env·cos
        let expected_dchi_re = pref_prime * env * c_phase + pref * (-env * s_phase) * phase_prime;
        let expected_dchi_im = pref_prime * env * s_phase + pref * (env * c_phase) * phase_prime;

        assert!(
            (chi[2 * c] - expected_chi_re).abs() < 1e-12,
            "Vilenkin V<0 chi.re: got {}, expected {expected_chi_re}",
            chi[2 * c]
        );
        assert!(
            (chi[2 * c + 1] - expected_chi_im).abs() < 1e-12,
            "Vilenkin V<0 chi.im: got {}, expected {expected_chi_im}",
            chi[2 * c + 1]
        );
        assert!(
            (chi_deriv[2 * c] - expected_dchi_re).abs() < 1e-10,
            "Vilenkin V<0 dchi.re: got {}, expected {expected_dchi_re}",
            chi_deriv[2 * c]
        );
        assert!(
            (chi_deriv[2 * c + 1] - expected_dchi_im).abs() < 1e-10,
            "Vilenkin V<0 dchi.im: got {}, expected {expected_dchi_im}",
            chi_deriv[2 * c + 1]
        );
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
            mass_asymmetry: 1.0,
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
        let u0 = wdw_u(a0, 0.0, 0.0, input.mass, input.lambda, input.mass_asymmetry);
        // Edge-adjacent cells drive the laplacian; reconstruct the stencil.
        // For the 3×3 central cell all 4 neighbours exist, so the Neumann /
        // Dirichlet distinction does not affect this assertion.
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
            input.mass_asymmetry,
        );
        // Phase 5: the solver applies the JS `Float32Array` per-slab
        // quantisation to match `solverWasmComparison.test.ts` at 1e-5
        // parity. The BC output and slab-1 write both f32-round, so the
        // expected value must receive the same truncation for bit-exact
        // agreement.
        let dre = (bc_deriv[2 * c] as f32) as f64;
        let dim = (bc_deriv[2 * c + 1] as f32) as f64;
        // Slab 0 is also f32-rounded before slab-1 reads it.
        let cre_q = (cre as f32) as f64;
        let cim_q = (cim as f32) as f64;
        let (lap_re_q, lap_im_q) = {
            // Re-quantise slab 0 and recompute the laplacian on the
            // quantised values.
            let mut q_slab = vec![0.0f64; 2 * nphi * nphi];
            for i in 0..(2 * nphi * nphi) {
                q_slab[i] = (out.chi[i] as f32) as f64;
            }
            phi_laplacian_at(&q_slab, 0, 1, 1, nphi, inv_dphi2)
        };
        let ddot_re_q = inv_a0sq * lap_re_q + u0 * cre_q;
        let ddot_im_q = inv_a0sq * lap_im_q + u0 * cim_q;
        let expected_next_re = (cre_q + da * dre + 0.5 * da * da * ddot_re_q) as f32 as f64;
        let expected_next_im = (cim_q + da * dim + 0.5 * da * da * ddot_im_q) as f32 as f64;
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
            mass_asymmetry: 1.0,
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
            mass_asymmetry: 1.0,
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
            mass_asymmetry: 1.0,
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
        // Interior loop — skip outer boundaries where the Neumann ghost
        // substitution differs from the bulk central-difference stencil.
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
                    let u = wdw_u(
                        a,
                        phi1,
                        phi2,
                        input.mass,
                        input.lambda,
                        input.mass_asymmetry,
                    );
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
    // -- Section 6: wasm-bindgen validator binding parity --

    #[cfg(feature = "wdw-validator")]
    #[test]
    #[should_panic(expected = "invalid bc_code 99")]
    fn validator_binding_rejects_unknown_bc_code() {
        // An out-of-range `bc_code` must panic rather than silently fall
        // back to `NoBoundary`. A silent fallback would mask a JS↔Rust
        // ABI drift (e.g. a new BC enum variant on one side only) and
        // turn the cross-validator into a false-positive oracle.
        use super::bindings::solve_leapfrog_validator_native;
        let _ = solve_leapfrog_validator_native(99, 0.0, 1.0, -0.5, 0.05, 1.2, 4, 3, 2.5);
    }

    #[cfg(feature = "wdw-validator")]
    #[test]
    fn validator_binding_packs_match_solve_leapfrog() {
        // Confirms the wasm-bindgen wrapper packs the chi tensor in the
        // exact (ia, i1, i2) row-major interleaved-(re, im) layout that
        // solve_leapfrog produces, with no transformation. A regression
        // here would silently mis-align the JS↔Rust comparison test.
        use super::bindings::solve_leapfrog_validator_native;
        let na = 8usize;
        let nphi = 5usize;
        let packed = solve_leapfrog_validator_native(0, 0.0, 1.0, -0.5, 0.05, 1.2, na, nphi, 2.5);
        let expected_len = 2 * na * nphi * nphi;
        assert_eq!(packed.len(), expected_len);
        let direct = solve_leapfrog(WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            mass_asymmetry: 1.0,
            lambda: -0.5,
            a_min: 0.05,
            a_max: 1.2,
            grid_na: na,
            grid_nphi: nphi,
            phi_extent: 2.5,
        });
        for i in 0..expected_len {
            let p = packed[i] as f64;
            let d = direct.chi[i];
            // Pack does an f64 -> f32 -> f64 round-trip; tolerance ~1 ULP at f32.
            let tol = 1e-5 * d.abs().max(1.0);
            assert!(
                (p - d).abs() <= tol,
                "binding mismatch at i={i}: packed={p}, direct={d}"
            );
        }
    }

    #[test]
    fn mass_asymmetry_threads_into_rust_solver() {
        // With α ≠ 1 the potential `V = ½ m² φ₁² + ½ (m·α)² φ₂² + Λ`
        // breaks the exchange symmetry `χ(a, φ₁, φ₂) = χ(a, φ₂, φ₁)`
        // that holds under α = 1. This test locks the Rust validator's
        // wiring of the parameter: if `mass_asymmetry` is silently
        // dropped anywhere (potential, U, boundary), the swap χ − χ^T
        // would stay at round-off magnitude and the assertion fails.
        let input = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.3,
            mass_asymmetry: 2.0,
            lambda: 0.05,
            a_min: 0.1,
            a_max: 1.2,
            grid_na: 48,
            grid_nphi: 11,
            phi_extent: 1.5,
        };
        let out = solve_leapfrog(input);
        let (na, nphi, _) = out.grid_size;
        let slab = nphi * nphi;
        let ia = na / 2; // interior slab
        let mut max_diff = 0.0f64;
        for i1 in 0..nphi {
            for i2 in (i1 + 1)..nphi {
                let a_off = 2 * (ia * slab + i1 * nphi + i2);
                let b_off = 2 * (ia * slab + i2 * nphi + i1);
                let a_re = out.chi[a_off];
                let a_im = out.chi[a_off + 1];
                let b_re = out.chi[b_off];
                let b_im = out.chi[b_off + 1];
                let d = ((a_re - b_re).powi(2) + (a_im - b_im).powi(2)).sqrt();
                if d > max_diff {
                    max_diff = d;
                }
            }
        }
        assert!(
            max_diff > 1e-4,
            "α = 2 must break φ₁↔φ₂ symmetry but max swap diff was {max_diff:e} (≤ 1e-4)"
        );
    }

    #[test]
    fn leapfrog_second_order_convergence() {
        let base = WdwSolverInput {
            bc: WdwBoundaryCondition::NoBoundary,
            mass: 0.0,
            mass_asymmetry: 1.0,
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
        // Phase 5: the Rust leapfrog now uses the semi-implicit
        // Crank–Nicolson ADI scheme for Lorentzian cells (matching the
        // JS production solver). CN is 2nd-order convergent like the
        // explicit leapfrog, but with a different `O(da²)` constant; at
        // `Na = 129 → 257` the cross-refinement residual sits around
        // `2·10⁻⁴` for the Λ=0.3 column versus `1·10⁻⁵` under the old
        // explicit leapfrog. The threshold is loosened to `1·10⁻³` —
        // a wrong-stencil regression would still deviate by `O(1)` and
        // fail trivially, but the scheme's legitimate O(da²) residual
        // passes.
        let diff_re = (base_re - refined_re).abs();
        let diff_im = (base_im - refined_im).abs();
        assert!(
            diff_re < 1e-3,
            "re diverges across refinement: {base_re} vs {refined_re} (|Δ|={diff_re})"
        );
        assert!(
            diff_im < 1e-3,
            "im diverges across refinement: {base_im} vs {refined_im} (|Δ|={diff_im})"
        );
    }
}

// ============================================================================
// Validator wasm-bindgen bindings (feature-gated).
//
// Compiled only when the crate is built with `--features wdw-validator`.
// Production builds (default features) exclude this entire module so the
// public-facing pkg/mdimension_core.wasm stays byte-identical.
// ============================================================================

#[cfg(feature = "wdw-validator")]
pub mod bindings {
    //! wasm-bindgen exports for the independent Wheeler–DeWitt leapfrog
    //! cross-validator. Consumed by `solverWasmComparison.test.ts` via
    //! the separate pkg-validator/ output of `pnpm wasm:build:validator`.

    use super::{solve_leapfrog, WdwBoundaryCondition, WdwSolverInput};
    use wasm_bindgen::prelude::*;

    /// Run the f64 leapfrog Wheeler–DeWitt solver and return the dense
    /// `χ(a, φ₁, φ₂)` tensor as interleaved `(re, im)` `f32` pairs.
    ///
    /// Layout: `chi[2·(ia·N_phi² + i1·N_phi + i2) + (0=re, 1=im)]`.
    /// This matches the TypeScript solver's `Float32Array` layout for
    /// pointwise comparison.
    ///
    /// `bc_code`: 0=NoBoundary (Hartle–Hawking), 1=Tunneling (Vilenkin),
    /// 2=DeWitt. Any other value panics to fail fast on JS↔Rust ABI
    /// drift — the underlying `solve_leapfrog_validator_native` rejects
    /// unknown codes rather than defaulting to NoBoundary.
    ///
    /// No Stage-2 / Stage-3 corrections — this is the raw PDE integrator
    /// output. See the module-level docstring on `wheeler_dewitt.rs` for
    /// scope rationale.
    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub fn solve_leapfrog_validator_wasm(
        bc_code: u32,
        mass: f64,
        mass_asymmetry: f64,
        lambda: f64,
        a_min: f64,
        a_max: f64,
        grid_na: u32,
        grid_nphi: u32,
        phi_extent: f64,
    ) -> Vec<f32> {
        solve_leapfrog_validator_native(
            bc_code,
            mass,
            mass_asymmetry,
            lambda,
            a_min,
            a_max,
            grid_na as usize,
            grid_nphi as usize,
            phi_extent,
        )
    }

    /// Pure-Rust entry exposed to the in-crate test that asserts the
    /// wasm-bindgen pack/unpack contract. Identical to the wasm export
    /// minus the integer-width conversion at the JS boundary.
    #[allow(clippy::too_many_arguments)]
    pub fn solve_leapfrog_validator_native(
        bc_code: u32,
        mass: f64,
        mass_asymmetry: f64,
        lambda: f64,
        a_min: f64,
        a_max: f64,
        grid_na: usize,
        grid_nphi: usize,
        phi_extent: f64,
    ) -> Vec<f32> {
        // Exhaustive match with a hard panic on unknown codes so a JS↔Rust
        // ABI drift (e.g. a new BC added on one side only) fails loudly at
        // the first cross-validation invocation instead of silently
        // masquerading as `NoBoundary` and producing a wrong-state
        // comparison.
        let bc = match bc_code {
            0 => WdwBoundaryCondition::NoBoundary,
            1 => WdwBoundaryCondition::Tunneling,
            2 => WdwBoundaryCondition::DeWitt,
            other => panic!(
                "invalid bc_code {other}; expected 0 (noBoundary), 1 (tunneling), or 2 (deWitt)"
            ),
        };
        let out = solve_leapfrog(WdwSolverInput {
            bc,
            mass,
            mass_asymmetry,
            lambda,
            a_min,
            a_max,
            grid_na,
            grid_nphi,
            phi_extent,
        });
        out.chi.into_iter().map(|v| v as f32).collect()
    }
}
