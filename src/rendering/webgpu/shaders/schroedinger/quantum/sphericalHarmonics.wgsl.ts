/**
 * WGSL Spherical Harmonics Y_lm(θ, φ)
 *
 * Spherical harmonics form the angular part of hydrogen atom wavefunctions.
 * They describe how electron probability density varies with direction.
 *
 * Port of GLSL quantum/sphericalHarmonics.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/sphericalHarmonics.wgsl
 */

export const sphericalHarmonicsBlock = /* wgsl */ `
// ============================================
// Spherical Harmonics Y_lm(θ, φ)
// OPT-SH-1: Factorial lookup table instead of loop
// ============================================

// OPT-SH-1: Precomputed factorial lookup table (0! to 12!)
// Eliminates loop overhead in hot path
// 12! = 479001600 is the largest integer factorial that fits in float32
const FACTORIAL_LUT: array<f32, 13> = array<f32, 13>(
  1.0,           // 0!
  1.0,           // 1!
  2.0,           // 2!
  6.0,           // 3!
  24.0,          // 4!
  120.0,         // 5!
  720.0,         // 6!
  5040.0,        // 7!
  40320.0,       // 8!
  362880.0,      // 9!
  3628800.0,     // 10!
  39916800.0,    // 11!
  479001600.0    // 12!
);

/**
 * Compute normalization constant K_l^m for spherical harmonics
 *
 * K_l^m = sqrt((2l+1)/(4π) · (l-|m|)!/(l+|m|)!)
 *
 * This ensures ∫|Y_lm|² dΩ = 1
 */
fn sphericalHarmonicNorm(l: i32, m: i32) -> f32 {
  let absM = abs(m);

  // (2l+1) / (4π)
  let front = f32(2 * l + 1) / (4.0 * PI);

  // (l-|m|)! / (l+|m|)!
  let lMinusM = l - absM;
  let lPlusM = l + absM;

  var factRatio: f32;
  if (lPlusM <= 12) {
    // Direct LUT lookup - O(1) instead of O(2*|m|) loop
    factRatio = FACTORIAL_LUT[lMinusM] / FACTORIAL_LUT[lPlusM];
  } else {
    // Fallback for large l+|m| (rare: l ≤ 6 means lPlusM ≤ 12)
    factRatio = 1.0;
    for (var i = lMinusM + 1; i <= lPlusM; i++) {
      factRatio *= f32(i);
    }
    factRatio = 1.0 / factRatio;
  }

  return sqrt(front * factRatio);
}

/**
 * Compute complex spherical harmonic Y_lm(θ, φ)
 *
 * Returns vec2f(Re, Im) representing the complex value.
 */
fn sphericalHarmonic(l: i32, m: i32, theta: f32, phi: f32) -> vec2f {
  // Normalization constant
  let K = sphericalHarmonicNorm(l, m);

  // Associated Legendre polynomial P^{|m|}_l(cos θ)
  let P = legendre(l, m, cos(theta));

  // Phase factor e^{imφ}
  let mPhi = f32(m) * phi;
  let phase = vec2f(cos(mPhi), sin(mPhi));

  // Y_lm = K · P · e^{imφ}
  return K * P * phase;
}

/**
 * Compute real spherical harmonic for orbital visualization
 *
 * Real spherical harmonics are linear combinations of Y_lm and Y_l(-m)
 * that produce real-valued functions. These correspond to the familiar
 * orbital shapes: px, py, pz, dxy, dxz, etc.
 */
fn realSphericalHarmonic(l: i32, m: i32, theta: f32, phi: f32, useReal: bool) -> f32 {
  if (!useReal) {
    // Return magnitude of complex spherical harmonic
    let Y = sphericalHarmonic(l, m, theta, phi);
    return length(Y);
  }

  // Real spherical harmonic
  let K = sphericalHarmonicNorm(l, abs(m));
  let P = legendre(l, abs(m), cos(theta));

  if (m == 0) {
    // m = 0: Y_l0 is already real
    return K * P;
  } else if (m > 0) {
    // m > 0: proportional to cos(mφ)
    return sqrt(2.0) * K * P * cos(f32(m) * phi);
  } else {
    // m < 0: proportional to sin(|m|φ)
    return sqrt(2.0) * K * P * sin(f32(-m) * phi);
  }
}

/**
 * Fast evaluation for common orbital shapes
 *
 * Direct computation without Legendre recursion for l <= 2.
 * These are the most commonly visualized orbitals.
 */
fn fastRealSphericalHarmonic(l: i32, m: i32, theta: f32, phi: f32) -> f32 {
  let ct = cos(theta);
  let st = sin(theta);

  // s orbital (l=0)
  if (l == 0) {
    // Y_00 = 1/(2√π)
    return 0.28209479; // 1/(2*sqrt(PI))
  }

  // p orbitals (l=1)
  if (l == 1) {
    let norm = 0.48860251; // sqrt(3/(4*PI))
    if (m == 0) {
      // pz: ∝ cos(θ)
      return norm * ct;
    } else if (m == 1) {
      // px: ∝ sin(θ)cos(φ)
      return norm * st * cos(phi);
    } else { // m == -1
      // py: ∝ sin(θ)sin(φ)
      return norm * st * sin(phi);
    }
  }

  // d orbitals (l=2)
  if (l == 2) {
    let ct2 = ct * ct;
    let st2 = st * st;

    if (m == 0) {
      // dz2: ∝ (3cos²θ - 1)
      let norm = 0.31539157; // sqrt(5/(16*PI))
      return norm * (3.0 * ct2 - 1.0);
    } else if (m == 1) {
      // dxz: ∝ sin(θ)cos(θ)cos(φ)
      let norm = 1.09254843; // sqrt(15/(4*PI)) — includes √2 factor for real harmonics
      return norm * st * ct * cos(phi);
    } else if (m == -1) {
      // dyz: ∝ sin(θ)cos(θ)sin(φ)
      let norm = 1.09254843;
      return norm * st * ct * sin(phi);
    } else if (m == 2) {
      // dx2-y2: ∝ sin²(θ)cos(2φ)
      let norm = 0.54627422; // sqrt(15/(16*PI))
      return norm * st2 * cos(2.0 * phi);
    } else { // m == -2
      // dxy: ∝ sin²(θ)sin(2φ)
      let norm = 0.54627422;
      return norm * st2 * sin(2.0 * phi);
    }
  }

  // Fall back to general computation for l > 2
  return realSphericalHarmonic(l, m, theta, phi, true);
}
`
