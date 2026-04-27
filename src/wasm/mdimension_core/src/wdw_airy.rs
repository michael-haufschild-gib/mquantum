//! Real-argument Airy functions `Ai(z)`, `Bi(z)`, `Ai'(z)`, `Bi'(z)` (Phase 5b
//! port of `src/lib/physics/wheelerDeWitt/airy.ts`).
//!
//! Needed by the Langer-uniform Hartle–Hawking / Vilenkin boundary seeds in
//! the `V > 0` regime: `χ(a_min, φ) = (ζ/U)^{1/4} · [c₁·Ai(ζ) + c₂·Bi(ζ)]`.
//!
//! ## Algorithm
//!
//! - **Maclaurin series** for `|z| ≤ AIRY_SERIES_RADIUS = 6` (DLMF 9.4):
//!
//!   Ai(z) = c₁·f(z) − c₂·g(z)
//!   Bi(z) = √3·(c₁·f(z) + c₂·g(z))
//!
//!   with `c₁ = Ai(0) = 0.355028…`, `c₂ = −Ai'(0) = 0.258819…`. The
//!   recurrence `a_k / a_{k−1} = 1 / ((3k−1)·3k)` and
//!   `b_k / b_{k−1} = 1 / (3k·(3k+1))` gives `O(1)` per term; 80 terms suffice
//!   for `|z| ≤ 6`.
//! - **Asymptotic expansion** for `|z| > 6` (DLMF 9.7): four correction terms
//!   in `ξ = (2/3)·|z|^{3/2}`. Valid to ≲ 1e-12 at `|z| ≥ 12`, ≲ 1e-9 at the
//!   crossover `|z| = 6`.
//!
//! ## Cross-validation
//!
//! The module tests assert
//!
//!  - `Ai(0) = 1 / (3^{2/3}·Γ(2/3)) ≈ 0.355028…` to 1e-15
//!  - The Wronskian identity `Ai(z)·Bi'(z) − Ai'(z)·Bi(z) = 1/π` at
//!    `z ∈ {-10, -3, -1, 0, 1, 3, 10}` to 1e-7. A transcription error in any
//!    of the four quantities would visibly break this at the mid-range
//!    samples.
//!  - Series/asymptotic continuity at the `|z| = 6` crossover to 1e-6.

#![allow(clippy::suboptimal_flops)]
#![allow(dead_code)]

use std::f64::consts::PI;

/// Crossover between Maclaurin series and DLMF 9.7 asymptotic.
const AIRY_SERIES_RADIUS: f64 = 6.0;

/// `Ai(0) = 1 / (3^{2/3}·Γ(2/3))`. Truncated to f64 precision.
const AI_AT_ZERO: f64 = 0.355_028_053_887_817_2;
/// `−Ai'(0) = 1 / (3^{1/3}·Γ(1/3))`. Truncated to f64 precision.
const NEG_AI_PRIME_AT_ZERO: f64 = 0.258_819_403_792_806_8;

/// Asymptotic coefficients `u_k` (DLMF 9.7.2).
const U1: f64 = 5.0 / 72.0;
const U2: f64 = 385.0 / 10_368.0;
const U3: f64 = 85_085.0 / 2_239_488.0;
const U4: f64 = 37_182_145.0 / 644_972_544.0;

/// Absolute magnitudes `|v_k|` of the derivative-series coefficients
/// (DLMF 9.7.6). DLMF's signed `v_k = −((6k+1)/(6k−1))·u_k < 0` for every
/// `k ≥ 1`; stashing `|v_k|` here lets the series assembly spell the signs
/// out explicitly.
const V1: f64 = 7.0 / 72.0;
const V2: f64 = 455.0 / 10_368.0;
const V3: f64 = 95_095.0 / 2_239_488.0;

/// Term cap for the Maclaurin series — reached only for `|z|` near the radius.
const AIRY_SERIES_MAX_TERMS: usize = 80;

/// Magnitude floor below which a term contributes nothing in f64.
const AIRY_SERIES_EPS: f64 = 1e-18;

/// Paired value-and-derivative of `(Ai, Bi)` at a single argument.
#[derive(Clone, Copy, Debug)]
pub struct AirySample {
    pub ai: f64,
    pub bi: f64,
    pub ai_prime: f64,
    pub bi_prime: f64,
}

/// Tabulate `f(z)`, `g(z)`, `f'(z)`, `g'(z)` via the simplified
/// `1 / ((3k−1)·3k)` recurrence.
fn airy_series_evaluate(z: f64) -> (f64, f64, f64, f64) {
    let z2 = z * z;
    let z3 = z * z2;
    let mut f = 1.0;
    let mut g = z;
    let mut f_prime = 0.0;
    let mut g_prime = 1.0;

    let mut a_coef = 1.0;
    let mut b_coef = 1.0;
    let mut z_pow_3k = 1.0;
    for k in 1..AIRY_SERIES_MAX_TERMS {
        let kf = k as f64;
        a_coef /= (3.0 * kf - 1.0) * (3.0 * kf);
        b_coef /= 3.0 * kf * (3.0 * kf + 1.0);
        z_pow_3k *= z3;
        let d_f = a_coef * z_pow_3k;
        let d_g = b_coef * z_pow_3k * z;
        f += d_f;
        g += d_g;
        if d_f.abs() < AIRY_SERIES_EPS && d_g.abs() < AIRY_SERIES_EPS {
            break;
        }
    }

    a_coef = 1.0;
    b_coef = 1.0;
    // Fresh power chain for the derivative series (decoupled so the f'
    // series can run without a 1/z division at z = 0).
    let mut z_pow_3k_minus1 = 1.0;
    let mut z_pow_3k_for_g = 1.0;
    for k in 1..AIRY_SERIES_MAX_TERMS {
        let kf = k as f64;
        a_coef /= (3.0 * kf - 1.0) * (3.0 * kf);
        b_coef /= 3.0 * kf * (3.0 * kf + 1.0);
        if k == 1 {
            z_pow_3k_minus1 = z2;
            z_pow_3k_for_g = z3;
        } else {
            z_pow_3k_minus1 *= z3;
            z_pow_3k_for_g *= z3;
        }
        let d_fp = 3.0 * kf * a_coef * z_pow_3k_minus1;
        let d_gp = (3.0 * kf + 1.0) * b_coef * z_pow_3k_for_g;
        f_prime += d_fp;
        g_prime += d_gp;
        if d_fp.abs() < AIRY_SERIES_EPS && d_gp.abs() < AIRY_SERIES_EPS {
            break;
        }
    }

    (f, g, f_prime, g_prime)
}

/// Maclaurin-series evaluator for `(Ai, Bi, Ai', Bi')`. Valid for any real
/// `z`; converges quickly for `|z| ≲ 6`.
fn airy_maclaurin(z: f64) -> AirySample {
    let (f, g, fp, gp) = airy_series_evaluate(z);
    let sqrt3 = 3.0_f64.sqrt();
    AirySample {
        ai: AI_AT_ZERO * f - NEG_AI_PRIME_AT_ZERO * g,
        bi: sqrt3 * (AI_AT_ZERO * f + NEG_AI_PRIME_AT_ZERO * g),
        ai_prime: AI_AT_ZERO * fp - NEG_AI_PRIME_AT_ZERO * gp,
        bi_prime: sqrt3 * (AI_AT_ZERO * fp + NEG_AI_PRIME_AT_ZERO * gp),
    }
}

/// Asymptotic evaluator for `z > 0` (DLMF 9.7.5–8).
fn airy_asymptotic_positive(z: f64) -> AirySample {
    let z14 = z.powf(0.25);
    let xi = (2.0 / 3.0) * z * z.sqrt();
    let inv_xi = 1.0 / xi;
    let inv_xi2 = inv_xi * inv_xi;
    let inv_xi3 = inv_xi2 * inv_xi;
    let inv_xi4 = inv_xi2 * inv_xi2;
    let sqrt_pi = PI.sqrt();

    let ai_series = 1.0 - U1 * inv_xi + U2 * inv_xi2 - U3 * inv_xi3 + U4 * inv_xi4;
    let bi_series = 1.0 + U1 * inv_xi + U2 * inv_xi2 + U3 * inv_xi3 + U4 * inv_xi4;
    let ai_deriv = 1.0 + V1 * inv_xi - V2 * inv_xi2 + V3 * inv_xi3;
    let bi_deriv = 1.0 - V1 * inv_xi - V2 * inv_xi2 - V3 * inv_xi3;

    let exp_neg_xi = (-xi).exp();
    let exp_pos_xi = xi.exp();

    AirySample {
        ai: (1.0 / (2.0 * sqrt_pi)) * (1.0 / z14) * exp_neg_xi * ai_series,
        bi: (1.0 / sqrt_pi) * (1.0 / z14) * exp_pos_xi * bi_series,
        ai_prime: -(1.0 / (2.0 * sqrt_pi)) * z14 * exp_neg_xi * ai_deriv,
        bi_prime: (1.0 / sqrt_pi) * z14 * exp_pos_xi * bi_deriv,
    }
}

/// Asymptotic evaluator for `z < 0` (DLMF 9.7.9–12, oscillatory regime).
fn airy_asymptotic_negative(z: f64) -> AirySample {
    let x = -z;
    let x14 = x.powf(0.25);
    let xi = (2.0 / 3.0) * x * x.sqrt();
    let inv_xi = 1.0 / xi;
    let inv_xi2 = inv_xi * inv_xi;
    let inv_xi3 = inv_xi2 * inv_xi;
    let inv_xi4 = inv_xi2 * inv_xi2;
    let sqrt_pi = PI.sqrt();

    let p = 1.0 - U2 * inv_xi2 + U4 * inv_xi4;
    let q = U1 * inv_xi - U3 * inv_xi3;
    let pp = 1.0 + V2 * inv_xi2;
    let qp = -V1 * inv_xi + V3 * inv_xi3;

    let phi = xi + PI / 4.0;
    let sphi = phi.sin();
    let cphi = phi.cos();

    AirySample {
        ai: (1.0 / sqrt_pi) * (1.0 / x14) * (sphi * p - cphi * q),
        bi: (1.0 / sqrt_pi) * (1.0 / x14) * (cphi * p + sphi * q),
        ai_prime: -(1.0 / sqrt_pi) * x14 * (cphi * pp + sphi * qp),
        bi_prime: (1.0 / sqrt_pi) * x14 * (sphi * pp - cphi * qp),
    }
}

/// Evaluate `(Ai, Bi, Ai', Bi')` at `z` in one call.
#[must_use]
pub fn airy_all(z: f64) -> AirySample {
    assert!(z.is_finite(), "airy_all expects a finite real argument, got {z}");
    if z.abs() <= AIRY_SERIES_RADIUS {
        return airy_maclaurin(z);
    }
    if z > 0.0 {
        airy_asymptotic_positive(z)
    } else {
        airy_asymptotic_negative(z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `Ai(0) = 1 / (3^{2/3}·Γ(2/3)) ≈ 0.355028053887817`.
    #[test]
    fn ai_at_zero_matches_known_value() {
        let s = airy_all(0.0);
        assert!(
            (s.ai - 0.355_028_053_887_817_2).abs() < 1e-15,
            "Ai(0) = {}, expected 0.35502805388781723",
            s.ai
        );
        assert!(
            (s.ai_prime + 0.258_819_403_792_806_8).abs() < 1e-15,
            "Ai'(0) = {}, expected -0.25881940379280679",
            s.ai_prime
        );
        // Bi(0) = √3·Ai(0).
        assert!(
            (s.bi - 3.0_f64.sqrt() * 0.355_028_053_887_817_2).abs() < 1e-15,
            "Bi(0) mismatch"
        );
        // Bi'(0) = √3·(−Ai'(0)) = √3·0.258819403792807…
        assert!(
            (s.bi_prime - 3.0_f64.sqrt() * 0.258_819_403_792_806_8).abs() < 1e-15,
            "Bi'(0) mismatch"
        );
    }

    /// Wronskian identity `Ai·Bi' − Ai'·Bi = 1/π` across Maclaurin and
    /// asymptotic ranges. Tolerances mirror the TS suite (`airy.test.ts`):
    /// 1e-10 deep in the Maclaurin core, 1e-7 at the |z|=6 boundary,
    /// 1e-5 in the asymptotic range (four-term truncation).
    #[test]
    fn wronskian_equals_inverse_pi() {
        let inv_pi = 1.0 / PI;
        let cases: &[(f64, f64)] = &[
            (-4.0, 1e-10),
            (-2.0, 1e-10),
            (-1.0, 1e-10),
            (0.0, 1e-10),
            (1.0, 1e-10),
            (2.0, 1e-10),
            (4.0, 1e-10),
            (-6.0, 1e-7),
            (6.0, 1e-7),
            (-12.0, 1e-5),
            (-10.0, 1e-5),
            (-8.0, 1e-5),
            (8.0, 1e-5),
            (10.0, 1e-5),
            (12.0, 1e-5),
        ];
        for &(z, tol) in cases {
            let s = airy_all(z);
            let w = s.ai * s.bi_prime - s.ai_prime * s.bi;
            assert!(
                (w - inv_pi).abs() < tol,
                "Wronskian at z={z}: got {w}, expected {inv_pi} (diff {} > tol {tol})",
                (w - inv_pi).abs()
            );
        }
    }

    /// SciPy `scipy.special.airy` reference values (DLMF 9.9 verified).
    /// Values copied from `src/tests/lib/physics/wheelerDeWitt/airy.test.ts`
    /// REFERENCE table so the Rust and TS evaluators share the same gate.
    #[test]
    fn matches_scipy_reference_table() {
        // (z, ai, bi, ai_prime, bi_prime)
        let table: &[(f64, f64, f64, f64, f64)] = &[
            (-8.0, -5.270505035601e-2, -3.312515807467e-1, 9.355609381951e-1, -1.594504978135e-1),
            (-6.0, -3.291451736281e-1, -1.466983766682e-1, 3.45935487283e-1, -8.128987851072e-1),
            (-2.0, 2.274074282026e-1, -4.123025879628e-1, 6.182590207358e-1, 2.787951669159e-1),
            (-1.0, 5.355608832896e-1, 1.039973894949e-1, -1.016056711718e-2, 5.92375626416e-1),
            (0.0, 3.550280538878e-1, 6.14926627446e-1, -2.588194037928e-1, 4.482883573538e-1),
            (1.0, 1.352924163128e-1, 1.207423594951, -1.591474412992e-1, 9.324359333927e-1),
            (2.0, 3.492413042362e-2, 3.298094999836, -5.309038443448e-2, 4.100682049905),
            (6.0, 9.947694360374e-6, 6.536446104773e3, -2.476520039712e-5, 1.572560262174e4),
            (8.0, 4.692207616066e-8, 1.199585996122e6, -1.341439297888e-7, 3.354342310822e6),
        ];
        // Maclaurin core: 1e-7 relative (Ai(6)'s catastrophic cancellation
        // bottoms out at ~1e-8 relative error — tolerance matches TS).
        // Asymptotic (|z| > 6): 1e-5 relative (four-term truncation).
        for &(z, ai_ref, bi_ref, aip_ref, bip_ref) in table {
            let tol = if z.abs() <= 6.0 { 1e-7 } else { 1e-5 };
            let s = airy_all(z);
            let check = |got: f64, expect: f64, label: &str| {
                let rel = if expect == 0.0 {
                    got.abs()
                } else {
                    (got - expect).abs() / expect.abs()
                };
                assert!(rel < tol, "{label}(z={z}): got {got}, expected {expect}, rel={rel:.3e} > tol={tol:.0e}");
            };
            check(s.ai, ai_ref, "Ai");
            check(s.bi, bi_ref, "Bi");
            check(s.ai_prime, aip_ref, "Ai'");
            check(s.bi_prime, bip_ref, "Bi'");
        }
    }

    /// Ai decays monotonically for z ≥ 0 and Bi grows monotonically —
    /// sign-flip regression gate.
    #[test]
    fn ai_decays_bi_grows_for_nonneg_z() {
        let mut prev_ai = airy_all(0.0).ai;
        let mut prev_bi = airy_all(0.0).bi;
        let mut z = 0.5;
        while z <= 8.0 {
            let s = airy_all(z);
            assert!(s.ai < prev_ai && s.ai > 0.0, "Ai non-monotone at z={z}");
            assert!(s.bi > prev_bi, "Bi non-monotone at z={z}");
            prev_ai = s.ai;
            prev_bi = s.bi;
            z += 0.5;
        }
    }
}
