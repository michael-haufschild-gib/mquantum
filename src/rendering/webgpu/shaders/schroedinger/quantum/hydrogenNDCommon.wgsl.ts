/**
 * WGSL Common utilities for Hydrogen ND wavefunction evaluation
 *
 * Provides shared functions for computing:
 * - 3D spherical angles from first 3 dimensions
 * - Angular factor evaluation (Y_lm)
 * - Time evolution
 *
 * Port of GLSL quantum/hydrogenND/hydrogenNDCommon.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDCommon.wgsl
 */

export const hydrogenNDCommonBlock = /* wgsl */ `
// ============================================
// Hydrogen ND Common Functions
// ============================================

/**
 * Compute spherical angles from first 3 dimensions
 *
 * Returns vec2f(theta, phi) where:
 * - theta: polar angle from z-axis [0, π]
 * - phi: azimuthal angle from x-axis [0, 2π]
 *
 * @param x, y, z - Cartesian coordinates
 * @param r3d - 3D radius (precomputed for efficiency)
 * @return vec2f(theta, phi)
 */
fn sphericalAngles3D(x: f32, y: f32, z: f32, r3d: f32) -> vec2f {
  if (r3d < 1e-10) {
    return vec2f(0.0, 0.0);
  }

  // theta = arccos(z/r)
  let theta = acos(clamp(z / r3d, -1.0, 1.0));

  // phi = atan2(y, x)
  var phi = atan2(y, x);
  if (phi < 0.0) {
    phi += 2.0 * PI;
  }

  return vec2f(theta, phi);
}

/**
 * Evaluate angular part Y_lm for hydrogen ND
 *
 * Uses the existing spherical harmonic functions.
 *
 * @param l - Azimuthal quantum number
 * @param m - Magnetic quantum number
 * @param theta - Polar angle
 * @param phi - Azimuthal angle
 * @param useReal - Use real orbital representation
 * @return Angular factor value
 */
fn evalHydrogenNDAngular(l: i32, m: i32, theta: f32, phi: f32, useReal: bool) -> f32 {
  if (useReal) {
    // Use fast path for l <= 2, general path otherwise
    if (l <= 2) {
      return fastRealSphericalHarmonic(l, m, theta, phi);
    } else {
      return realSphericalHarmonic(l, m, theta, phi, true);
    }
  } else {
    // Complex: return magnitude
    let Yc = sphericalHarmonic(l, m, theta, phi);
    return length(Yc);
  }
}

/**
 * Apply time evolution to hydrogen ND wavefunction
 *
 * ψ(t) = ψ(0) * exp(-i * E * t)
 *
 * Energy E_n = -1/(2n²) in atomic units (Hartree).
 *
 * @param psiReal - Real part of wavefunction at t=0
 * @param n - Principal quantum number
 * @param t - Time
 * @return vec2f(re, im) of time-evolved wavefunction
 */
fn hydrogenNDTimeEvolution(psiReal: f32, n: i32, t: f32) -> vec2f {
  // Guard: n must be >= 1 (principal quantum number)
  if (n < 1) {
    return vec2f(psiReal, 0.0);
  }
  let fn = f32(n);
  let E = -0.5 / (fn * fn);
  let phase = -E * t;
  let timeFactor = vec2f(cos(phase), sin(phase));
  return vec2f(psiReal * timeFactor.x, psiReal * timeFactor.y);
}
`
