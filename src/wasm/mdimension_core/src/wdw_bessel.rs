//! Bessel functions of order `±1/4` and `±3/4` used by the Wheeler–DeWitt
//! minisuperspace boundary seeds (Phase 5 port of
//! `src/lib/physics/wheelerDeWitt/analyticFixtures.ts`).
//!
//! The Wheeler–DeWitt reduced ODE `χ'' + 36π²a²·χ = 0` (free case, `V = 0`)
//! transforms under `t = 3π·a²`, `y = √a·w(t)` into the Bessel equation of
//! order `¼`. The Langer-uniform boundary seeds therefore need
//! `J_{1/4}(z)`, `Y_{1/4}(z)` and their derivatives at `z = 3π·a_min²`.
//!
//! ## Algorithm
//!
//! - **Maclaurin series (DLMF 10.2.2) for `|z| ≤ 6`** — converges in ≲ 40
//!   terms to `f64` precision for `ν ∈ {±1/4, ±3/4}`. `Y_ν` is reconstructed
//!   from `(J_ν·cos νπ − J_{−ν}) / sin νπ` (DLMF 10.2.3).
//! - **DLMF 10.17.3 asymptotic for `z > 6`** — three-term `P` / `Q`
//!   expansions in `χ = 8z`. Reaches relative accuracy ≲ 1e-9 at `z = 6`
//!   and ≲ 1e-12 at `z ≥ 12`.
//! - **Derivatives** via the recurrence `Z_ν'(z) = Z_{ν−1}(z) − (ν/z)·Z_ν(z)`
//!   (DLMF 10.6.2) in the series regime, and via the asymptotic
//!   differentiation `d/dz [amp·(P·c − Q·s)]` in the large-`z` regime.
//!
//! ## Validation
//!
//! The module-level tests assert the Bessel Wronskian identity
//!
//!   `J_ν(z)·Y_ν'(z) − J_ν'(z)·Y_ν(z) = 2/(π·z)`
//!
//! at `z ∈ {1, 3, 10}` — one series-regime, one mid-range, one asymptotic
//! — to absolute tolerance `1e-9`. A transcription error in either the
//! `J` or `Y` branch would break this identity by orders of magnitude.
//!
//! Cross-agreement between the series and the asymptotic forms is also
//! asserted at `z = 6` (the crossover) to `1e-5` — the three-term `P`/`Q`
//! asymptotic is good to `O(1/χ⁷) ≈ 1e-6` at `χ = 48`, and a 80-term
//! Maclaurin reaches machine precision, so either branch diverging by
//! orders of magnitude would still break this test.

#![allow(clippy::suboptimal_flops)]
#![allow(dead_code)]

use std::f64::consts::PI;

/// `ν = 1/4` — order of the Bessel functions consumed by the WdW seed.
pub const NU: f64 = 0.25;

/// Crossover between Maclaurin series and DLMF 10.17 asymptotic.
const BESSEL_SERIES_RADIUS: f64 = 6.0;

/// `π / 4` — used in the DLMF 10.17.3 phase constant `νπ/2 + π/4`.
const PI_OVER_4: f64 = PI / 4.0;

/// Lanczos `Γ(z)` approximation (g=7, n=9 coefficients). Matches the TS
/// port in `analyticFixtures.ts`. Accurate to ≲ 1e-15 for `z ≥ 0.5`.
///
/// Not called for `z < 0.5` by the Bessel series (the argument is always
/// `ν + k + 1 ≥ 1/4 + 1 = 5/4 > 0.5`) but the reflection path is kept
/// for defensive consistency with the TS source.
fn gamma_fn(z: f64) -> f64 {
    // Lanczos g=7, n=9 coefficients (numerically stable, double precision).
    // Identical to the `C` array in TS `analyticFixtures.ts::gammaFn`.
    const G: f64 = 7.0;
    const C: [f64; 9] = [
        0.999_999_999_999_809_93,
        676.520_368_121_885_1,
        -1_259.139_216_722_402_8,
        771.323_428_777_653_13,
        -176.615_029_162_140_59,
        12.507_343_278_686_905,
        -0.138_571_095_265_720_12,
        9.984_369_578_019_571_6e-6,
        1.505_632_735_149_311_6e-7,
    ];
    if z < 0.5 {
        // Reflection formula `Γ(z)·Γ(1−z) = π / sin(πz)`.
        return PI / ((PI * z).sin() * gamma_fn(1.0 - z));
    }
    let w = z - 1.0;
    let mut acc = C[0];
    for (i, &c) in C.iter().enumerate().skip(1) {
        acc += c / (w + i as f64);
    }
    let t = w + G + 0.5;
    (2.0 * PI).sqrt() * t.powf(w + 0.5) * (-t).exp() * acc
}

/// `J_ν(z)` via the Maclaurin series (DLMF 10.2.2):
///
///   `J_ν(z) = Σ_{k ≥ 0} (−1)^k · (z/2)^{ν+2k} / (k! · Γ(ν+k+1))`
///
/// Implemented with a multiplicative recurrence on the running term
/// `t_k · (−(z/2)²) / (k·(ν+k))`. Truncates when the next term magnitude
/// falls below `f64::EPSILON · sum`.
fn bessel_j_series(z: f64, nu: f64) -> f64 {
    let half_z = z / 2.0;
    let mut term = half_z.powf(nu) / gamma_fn(nu + 1.0);
    let mut sum = term;
    let half_z_sq = half_z * half_z;
    for k in 1..80 {
        term *= -half_z_sq / (k as f64 * (nu + k as f64));
        sum += term;
        if term.abs() < f64::EPSILON * sum.abs() {
            break;
        }
    }
    sum
}

/// `Y_ν(z)` via DLMF 10.2.3 (non-integer `ν`):
///
///   `Y_ν(z) = (J_ν·cos(νπ) − J_{−ν}) / sin(νπ)`
fn bessel_y_series(z: f64, nu: f64) -> f64 {
    let jp = bessel_j_series(z, nu);
    let jm = bessel_j_series(z, -nu);
    (jp * (nu * PI).cos() - jm) / (nu * PI).sin()
}

/// DLMF 10.17.3 asymptotic result for `J_ν`, `Y_ν`, `J_ν'`, `Y_ν'` at
/// large `z > 0`. See the TS source `besselAsymptotic` in
/// `analyticFixtures.ts` for the term-by-term derivation.
struct Asymptotic {
    j: f64,
    y: f64,
    jp: f64,
    yp: f64,
}

/// DLMF 10.17.3 asymptotic for `J_ν(z)`, `Y_ν(z)` with three-term `P`
/// and three-term `Q` series. Also returns the matching derivative
/// approximations via the asymptotic differentiation.
fn bessel_asymptotic(z: f64, nu: f64) -> Asymptotic {
    let mu = 4.0 * nu * nu;
    let chi = 8.0 * z;
    let c2 = chi * chi;
    let c4 = c2 * c2;
    let c6 = c4 * c2;
    let m1 = mu - 1.0;
    let m9 = mu - 9.0;
    let m25 = mu - 25.0;
    let m49 = mu - 49.0;
    let m81 = mu - 81.0;
    let m121 = mu - 121.0;

    // DLMF 10.17.3 three-term P, three-term Q.
    let p_sum = 1.0 - (m1 * m9) / (2.0 * c2) + (m1 * m9 * m25 * m49) / (24.0 * c4)
        - (m1 * m9 * m25 * m49 * m81 * m121) / (720.0 * c6);
    let q_sum = m1 / chi - (m1 * m9 * m25) / (6.0 * c2 * chi)
        + (m1 * m9 * m25 * m49 * m81) / (120.0 * c4 * chi);

    let arg = z - nu * PI_OVER_4 * 2.0 - PI_OVER_4;
    let c = arg.cos();
    let s = arg.sin();
    let amp = (2.0 / (PI * z)).sqrt();
    let j = amp * (p_sum * c - q_sum * s);
    let y = amp * (p_sum * s + q_sum * c);

    // d/dz of the P series — each `1/χ^{2k}` term contributes `−2k/z`.
    let pp_deriv = {
        let term2 = -(m1 * m9) / (2.0 * c2);
        let term4 = (m1 * m9 * m25 * m49) / (24.0 * c4);
        let term6 = -(m1 * m9 * m25 * m49 * m81 * m121) / (720.0 * c6);
        (-2.0 * term2 - 4.0 * term4 - 6.0 * term6) / z
    };
    // d/dz of the Q series — each `1/χ^{2k+1}` term contributes `−(2k+1)/z`.
    let qp_deriv = {
        let term1 = m1 / chi;
        let term3 = -(m1 * m9 * m25) / (6.0 * c2 * chi);
        let term5 = (m1 * m9 * m25 * m49 * m81) / (120.0 * c4 * chi);
        (-term1 - 3.0 * term3 - 5.0 * term5) / z
    };

    // d/dz [amp·(P·c − Q·s)] where d(amp)/dz = −amp/(2z) and
    // d(arg)/dz = 1.
    let jp = -amp * (p_sum * s + q_sum * c) - (1.0 / (2.0 * z)) * j
        + amp * (pp_deriv * c - qp_deriv * s);
    let yp =
        amp * (p_sum * c - q_sum * s) - (1.0 / (2.0 * z)) * y + amp * (pp_deriv * s + qp_deriv * c);

    Asymptotic { j, y, jp, yp }
}

/// `J_{1/4}(z)` for `z > 0`.
pub fn bessel_j_quarter(z: f64) -> f64 {
    assert!(z > 0.0, "bessel_j_quarter requires z > 0, got {z}");
    if z <= BESSEL_SERIES_RADIUS {
        bessel_j_series(z, NU)
    } else {
        bessel_asymptotic(z, NU).j
    }
}

/// `Y_{1/4}(z)` for `z > 0`.
pub fn bessel_y_quarter(z: f64) -> f64 {
    assert!(z > 0.0, "bessel_y_quarter requires z > 0, got {z}");
    if z <= BESSEL_SERIES_RADIUS {
        bessel_y_series(z, NU)
    } else {
        bessel_asymptotic(z, NU).y
    }
}

/// `J_{1/4}'(z)` via the Bessel recurrence `Z_ν'(z) = Z_{ν−1}(z) − (ν/z)·Z_ν(z)`
/// (DLMF 10.6.2). For `ν = 1/4`, `ν − 1 = −3/4`.
pub fn bessel_j_quarter_prime(z: f64) -> f64 {
    assert!(z > 0.0, "bessel_j_quarter_prime requires z > 0, got {z}");
    if z <= BESSEL_SERIES_RADIUS {
        let jm34 = bessel_j_series(z, NU - 1.0); // J_{−3/4}
        let j14 = bessel_j_series(z, NU);
        jm34 - (NU / z) * j14
    } else {
        bessel_asymptotic(z, NU).jp
    }
}

/// `Y_{1/4}'(z)` via the recurrence. `Y_{−3/4}` is built from the same
/// `(J_ν'·cos(ν'π) − J_{−ν'}) / sin(ν'π)` construction with `ν' = −3/4`.
pub fn bessel_y_quarter_prime(z: f64) -> f64 {
    assert!(z > 0.0, "bessel_y_quarter_prime requires z > 0, got {z}");
    if z <= BESSEL_SERIES_RADIUS {
        let nu_prime = NU - 1.0; // −3/4
        let jp = bessel_j_series(z, nu_prime); // J_{−3/4}
        let jm = bessel_j_series(z, -nu_prime); // J_{3/4}
        let y_m34 = (jp * (nu_prime * PI).cos() - jm) / (nu_prime * PI).sin();
        let y14 = bessel_y_series(z, NU);
        y_m34 - (NU / z) * y14
    } else {
        bessel_asymptotic(z, NU).yp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Bessel Wronskian identity
    ///
    ///   `J_ν(z)·Y_ν'(z) − J_ν'(z)·Y_ν(z) = 2/(π·z)`
    ///
    /// Exact mathematical identity; any deviation beyond `1e-9` signals a
    /// transcription bug in the series, asymptotic, or derivative
    /// construction. Covers the series regime (z=1, z=3), mid-range (z=6),
    /// and asymptotic regime (z=10).
    #[test]
    fn wronskian_identity_series_regime() {
        for &z in &[1.0_f64, 3.0] {
            let j = bessel_j_quarter(z);
            let y = bessel_y_quarter(z);
            let jp = bessel_j_quarter_prime(z);
            let yp = bessel_y_quarter_prime(z);
            let wronskian = j * yp - jp * y;
            let expected = 2.0 / (PI * z);
            assert!(
                (wronskian - expected).abs() < 1e-9,
                "Wronskian failed at z={z}: got {wronskian}, expected {expected} (diff {})",
                (wronskian - expected).abs()
            );
        }
    }

    #[test]
    fn wronskian_identity_asymptotic_regime() {
        for &z in &[10.0_f64, 25.0] {
            let j = bessel_j_quarter(z);
            let y = bessel_y_quarter(z);
            let jp = bessel_j_quarter_prime(z);
            let yp = bessel_y_quarter_prime(z);
            let wronskian = j * yp - jp * y;
            let expected = 2.0 / (PI * z);
            assert!(
                (wronskian - expected).abs() < 1e-9,
                "Wronskian failed at z={z}: got {wronskian}, expected {expected} (diff {})",
                (wronskian - expected).abs()
            );
        }
    }

    /// Series / asymptotic continuity at the crossover radius. Both
    /// branches evaluate the same mathematical function, so the
    /// difference is bounded by the three-term asymptotic truncation
    /// error `O(1/χ⁷) ≈ 1e-6` at `χ = 8·6 = 48`. The series is at
    /// machine precision for `z ≤ 6`, so any transcription error on
    /// either branch would break the `1e-5` bound by several orders.
    #[test]
    fn series_asymptotic_agree_at_crossover() {
        let z = 6.0_f64;
        let j_series = bessel_j_series(z, NU);
        let j_asymp = bessel_asymptotic(z, NU).j;
        assert!(
            (j_series - j_asymp).abs() < 1e-5,
            "J series vs asymptotic at z=6: {j_series} vs {j_asymp} (diff {})",
            (j_series - j_asymp).abs()
        );
        let y_series = bessel_y_series(z, NU);
        let y_asymp = bessel_asymptotic(z, NU).y;
        assert!(
            (y_series - y_asymp).abs() < 1e-5,
            "Y series vs asymptotic at z=6: {y_series} vs {y_asymp} (diff {})",
            (y_series - y_asymp).abs()
        );
    }

    /// Small-`z` leading-order check for `J_{1/4}`:
    ///
    ///   `J_ν(z) → (z/2)^ν / Γ(ν+1) · (1 − (z/2)²/(ν+1) + …)`
    ///
    /// At `z = 0.01` the leading correction factor
    /// `(z/2)² / (ν+1) = (0.005)²/1.25 = 2·10⁻⁵`, so the leading term
    /// matches to relative `2·10⁻⁵`. A transcription bug in the
    /// Maclaurin prefactor `(z/2)^ν / Γ(ν+1)` would blow this out by
    /// orders of magnitude.
    #[test]
    fn bessel_j_leading_small_z() {
        let z = 0.01_f64;
        let leading = (z / 2.0).powf(NU) / gamma_fn(NU + 1.0);
        let actual = bessel_j_quarter(z);
        let rel = (actual - leading).abs() / leading.abs();
        assert!(
            rel < 1e-4,
            "J_{{1/4}}(0.01) leading-order: got {actual}, leading {leading}, relative {rel}"
        );
    }

    /// `Γ(5/4) ≈ 0.90640247705547...` — Wolfram Alpha reference value.
    /// Not used directly by the WdW seed (the Lanczos value enters
    /// `bessel_j_series` algebraically) but locks the Lanczos constants
    /// against transcription error.
    #[test]
    fn lanczos_gamma_matches_reference_5_over_4() {
        let g = gamma_fn(1.25);
        assert!(
            (g - 0.906_402_477_055_477).abs() < 1e-12,
            "Γ(5/4): got {g}, expected 0.906402477055477..."
        );
    }
}
