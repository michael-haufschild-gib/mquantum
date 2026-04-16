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
const TDSE_CURV_SPHERE_POLE_EPS: f32 = 0.05;
const TDSE_CURV_MT_MIN_RADIUS: f32 = 1e-4;

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
  if (kind == 5u) {
    let R = max(params.sphereRadius, 0.1);
    return 2.0 / (R * R);
  }
  if (kind == 3u) {
    let H = max(params.hubbleRate, 0.0);
    let n = f32(dim);
    let _t = time; // de Sitter Ricci is time-independent (spatial slice).
    return n * (n - 1.0) * H * H;
  }
  if (kind == 4u) {
    let L = max(params.adsRadius, 0.1);
    let n = f32(dim);
    return -(n * (n - 1.0)) / (L * L);
  }
  if (kind == 1u) {
    let b0 = max(params.throatRadius, 0.1);
    let l = coords[0];
    let r = sqrt(b0 * b0 + l * l);
    let rPrime = l / r;
    let rDoublePrime = (b0 * b0) / (r * r * r);
    return 2.0 * (1.0 - rPrime * rPrime) / (r * r) - 2.0 * rDoublePrime / r;
  }
  if (kind == 7u) {
    let b0 = max(params.doubleThroatRad, 0.1);
    let s = max(params.doubleThroatSep, 0.2);
    let lLeft = coords[0] - 0.5 * s;
    let lRight = coords[0] + 0.5 * s;
    let rL = sqrt(b0 * b0 + lLeft * lLeft);
    let rR = sqrt(b0 * b0 + lRight * lRight);
    let rpL = lLeft / rL; let rppL = (b0 * b0) / (rL * rL * rL);
    let rpR = lRight / rR; let rppR = (b0 * b0) / (rR * rR * rR);
    let ricciL = 2.0 * (1.0 - rpL * rpL) / (rL * rL) - 2.0 * rppL / rL;
    let ricciR = 2.0 * (1.0 - rpR * rpR) / (rR * rR) - 2.0 * rppR / rR;
    return ricciL + ricciR;
  }
  return 0.0;
}

/**
 * √|g|(x, t) for the active metric kind. Used to convert coordinate-volume
 * density |ψ|² to proper-volume density |ψ|²·√|g| when
 * 'params.densityViewMode == 1u'. For flat / torus the answer is 1.0 so
 * proper mode on flat metrics is a no-op.
 *
 * WARNING: on strongly curved regions (near MT throats, small AdS z, near
 * sphere poles) √|g| can be large; the downstream display path applies
 * 'clamp(displayScalar * perpFalloff, 0, 1)' so saturation is handled, but
 * auto-scale ⟶ proper-volume interaction may wash out the packet. This is
 * a known interaction hazard, not a bug.
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
    let a = exp(H * time);
    var sd: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) { sd = sd * a; }
    return sd;
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
