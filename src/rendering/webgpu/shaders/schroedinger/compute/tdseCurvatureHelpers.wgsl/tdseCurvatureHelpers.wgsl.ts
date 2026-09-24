/**
 * TDSE Curvature Helpers — Scalar Ricci and √|g| for the Density Write-Grid
 *
 * Wave 6 Curved-Space TDSE v2 visualization support. Provides two narrow,
 * self-contained scalar helpers over `params: TDSEUniforms` (bound at
 * group0/binding0 in the write-grid pipeline) so the density-volume write
 * shader can overlay curvature information and honor the proper-volume
 * display mode without duplicating the full `evalMetric` / `mtRadius` /
 * `dtRadius` machinery from `tdseCurvedKinetic.wgsl.ts`.
 *
 * Both functions return scalar results only — no tensor machinery. Formulas
 * must stay in sync with:
 *   - `lib/physics/tdse/metrics/evaluator.ts` (CPU reference)
 *   - the `evalMetric` and `ricciScalarWGSL` blocks in
 *     `tdseCurvedKinetic.wgsl.ts` (kinetic path reference).
 *
 * Function names are uniquely prefixed `tdseCurvature*` so this block is
 * safe to compose alongside any other helper block that happens to import
 * the same TDSEUniforms struct — no symbol collisions.
 *
 * @module
 */

export const tdseCurvatureHelpersBlock = /* wgsl */ `
// Minimum safety radii mirror the CPU evaluator; duplicated locally so this
// block stays self-contained (does not depend on the curved-kinetic helpers).
const TDSE_CURV_SCHW_MIN_RADIUS: f32 = 0.01;
const TDSE_CURV_ADS_MIN_Z: f32 = 0.05;
const TDSE_CURV_SPHERE_POLE_EPS: f32 = 0.2;
const TDSE_CURV_MT_MIN_RADIUS: f32 = 1e-4;
// exp(80) is below f32::MAX while still far above any display/norm scale this
// path can use meaningfully. Prevents deSitter proper-volume diagnostics from
// overflowing to inf during long high-H runs.
const TDSE_CURV_EXP_LIMIT: f32 = 80.0;

fn tdseCurvatureExpClamped(exponent: f32) -> f32 {
  return exp(clamp(exponent, -TDSE_CURV_EXP_LIMIT, TDSE_CURV_EXP_LIMIT));
}

fn tdseCurvatureWarpedRicci(r: f32, rPrime: f32, rDoublePrime: f32, dim: u32) -> f32 {
  let d1 = f32(dim - 1u);
  let d2 = f32(dim) - 2.0;
  return -2.0 * d1 * rDoublePrime / r - d1 * d2 * rPrime * rPrime / (r * r);
}

/**
 * Ricci-scalar R(x, t) for the active metric kind. Returns 0 on flat /
 * torus / Schwarzschild (vacuum Ricci) so the overlay self-disables on
 * metrics with no intrinsic curvature signal. Sign conveys the diverging
 * colormap direction (positive red, negative blue).
 */
fn tdseCurvatureRicci(coords: array<f32, 12>, dim: u32, time: f32) -> f32 {
  let kind = params.metricKind;
  // flat / torus / schwarzschild → 0 (vacuum Ricci).
  if (kind == 0u || kind == 6u || kind == 2u) { return 0.0; }
  if (kind == 5u && dim >= 3u) {
    let R = max(params.sphereRadius, 0.1);
    return 2.0 / (R * R);
  }
  // deSitter: g_ij = a(t)^2 δ_ij → conformally flat, spatial Ricci = 0.
  if (kind == 3u) { return 0.0; }
  if (kind == 4u) {
    let L = max(params.adsRadius, 0.1);
    let n = f32(dim);
    return -(n * (n - 1.0)) / (L * L);
  }
  // Morris–Thorne / double throat: scalar curvature of the simulated slice
  // dl² + r(l)²·δ_ab dx^a dx^b (Cartesian transverse axes, flat cross-section),
  // R = −2(d−1)·r''/r − (d−1)(d−2)·r'²/r². Mirrors evaluator.ts.
  if (kind == 1u) {
    let b0 = max(params.throatRadius, 0.1);
    let l = coords[0];
    let r = sqrt(b0 * b0 + l * l);
    return tdseCurvatureWarpedRicci(r, l / r, (b0 * b0) / (r * r * r), dim);
  }
  if (kind == 7u) {
    let b0 = max(params.doubleThroatRad, 0.1);
    let s = max(params.doubleThroatSep, 0.2);
    let l = coords[0];
    let h = 0.5 * s;
    let a = sqrt(h * h + (l - h) * (l - h));
    let b = sqrt(h * h + (l + h) * (l + h));
    let r = b0 + 0.5 * (a + b - s);
    let rPrime = 0.5 * ((l - h) / a + (l + h) / b);
    let rDoublePrime = 0.5 * (h * h / (a * a * a) + h * h / (b * b * b));
    return tdseCurvatureWarpedRicci(r, rPrime, rDoublePrime, dim);
  }
  return 0.0;
}

/**
 * √|g|(x, t) for the active metric kind. Used to convert coordinate-volume
 * density |ψ|² to proper-volume density |ψ|²·√|g| when
 * 'params.densityViewMode == 1u'. For flat / torus the answer is 1.0 so
 * proper mode on flat metrics is a no-op.
 *
 * On strongly curved regions (near MT throats, small AdS z, near sphere
 * poles) √|g| can be large; the display path normalizes proper-density mode
 * against the GPU-reduced max(|ψ|²√|g|) before the final clamp.
 */
fn tdseCurvatureSqrtDet(coords: array<f32, 12>, dim: u32, time: f32) -> f32 {
  let kind = params.metricKind;
  // flat / torus → trivial.
  if (kind == 0u || kind == 6u) { return 1.0; }

  // Morris–Thorne: √|g| = r(l)^(dim-1).
  if (kind == 1u && dim >= 2u) {
    let b0 = max(params.throatRadius, 0.1);
    let r = max(sqrt(b0 * b0 + coords[0] * coords[0]), TDSE_CURV_MT_MIN_RADIUS);
    var sd: f32 = 1.0;
    for (var d: u32 = 1u; d < dim; d++) { sd = sd * r; }
    return sd;
  }

  // Schwarzschild isotropic: √|g| = ψ^(2·dim) with ψ = 1 + M/(2r).
  if (kind == 2u) {
    let M = max(params.schwarzschildMass, 0.01);
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < dim; d++) { r2 = r2 + coords[d] * coords[d]; }
    let rMin = max(M * 0.5, TDSE_CURV_SCHW_MIN_RADIUS);
    let r = max(sqrt(r2), rMin);
    let psi = 1.0 + M / (2.0 * r);
    let psi2 = psi * psi;
    var sd: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) { sd = sd * psi2; }
    return sd;
  }

  // de Sitter: √|g| = a(t)^dim, a(t) = exp(H·t).
  if (kind == 3u) {
    let H = max(params.hubbleRate, 0.0);
    return tdseCurvatureExpClamped(H * time * f32(dim));
  }

  // AdS Poincaré half-space: √|g| = (L/z)^dim.
  if (kind == 4u) {
    let L = max(params.adsRadius, 0.1);
    let z = max(abs(coords[0]), TDSE_CURV_ADS_MIN_Z);
    let LoverZ = L / z;
    var sd: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) { sd = sd * LoverZ; }
    return sd;
  }

  // 2-sphere chart on axes (θ, φ) = (1, 2): √|g| = R² sinθ.
  if (kind == 5u && dim >= 3u) {
    let R = max(params.sphereRadius, 0.1);
    let thetaRaw = coords[1];
    let theta = min(max(thetaRaw, TDSE_CURV_SPHERE_POLE_EPS), 3.141592653589793 - TDSE_CURV_SPHERE_POLE_EPS);
    return R * R * sin(theta);
  }

  // Double-throat: √|g| = r_dt(l)^(dim-1) with r_dt = b0 + 0.5·(√(s²/4+(l-s/2)²)+√(s²/4+(l+s/2)²) - s).
  if (kind == 7u && dim >= 2u) {
    let b0 = max(params.doubleThroatRad, 0.1);
    let s = max(params.doubleThroatSep, 0.2);
    let half = 0.5 * s;
    let left = sqrt(half * half + (coords[0] - half) * (coords[0] - half));
    let right = sqrt(half * half + (coords[0] + half) * (coords[0] + half));
    let r = max(b0 + 0.5 * (left + right - s), TDSE_CURV_MT_MIN_RADIUS);
    var sd: f32 = 1.0;
    for (var d: u32 = 1u; d < dim; d++) { sd = sd * r; }
    return sd;
  }

  return 1.0;
}
`
