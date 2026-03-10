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

  // phi = atan2(y, x) — returns [-π, π], which is fine since
  // downstream cos(m*phi) and sin(m*phi) are 2π-periodic
  let phi = atan2(y, x);

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
    // Complex: |Y_lm| = K * |P|
    // Skip trig (cos/sin of mφ) and sqrt — they cancel out since
    // |K·P·e^{imφ}| = |K·P|·|e^{imφ}| = |K·P|·1
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, cos(theta));
    return K * abs(P);
  }
}

/**
 * PERF: Evaluate angular part from pre-computed cos/sin theta.
 * Eliminates acos + cos round-trip (~50 GPU cycles per sample).
 * Used by the hot-path generated hydrogen ND variants.
 */
fn evalHydrogenNDAngularDirect(l: i32, m: i32, cosTheta: f32, sinTheta: f32, phi: f32, useReal: bool) -> f32 {
  if (useReal) {
    if (l <= 2) {
      return fastRealSphericalHarmonicDirect(l, m, cosTheta, sinTheta, phi);
    } else {
      // General path needs theta for Legendre recurrence
      let theta = acos(clamp(cosTheta, -1.0, 1.0));
      return realSphericalHarmonic(l, m, theta, phi, true);
    }
  } else {
    // Complex: |Y_lm| = K * |P|
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, cosTheta);
    return K * abs(P);
  }
}

/**
 * Evaluate angular part Y_lm from Cartesian unit direction (nx, ny, nz) = (x/r, y/r, z/r).
 * Eliminates the atan2 singularity on the z-axis by using polynomial Cartesian form
 * for l <= 2 and a guarded fallback for l > 2.
 */
fn evalHydrogenNDAngularCartesian(l: i32, m: i32, nx: f32, ny: f32, nz: f32, useReal: bool) -> f32 {
  if (useReal) {
    if (l <= 2) {
      // Cartesian form: no atan2, no singularity
      return fastRealSphericalHarmonicCartesian(l, m, nx, ny, nz);
    } else {
      // General path: recover spherical coords with z-axis guard.
      // For m != 0, Y_lm vanishes on the z-axis (P_l^|m|(±1) = 0 for m != 0),
      // so returning 0 when sin²θ is tiny is mathematically exact.
      let rxy2 = nx * nx + ny * ny;
      if (m != 0 && rxy2 < 1e-8) {
        return 0.0;
      }
      let theta = acos(clamp(nz, -1.0, 1.0));
      let phi = atan2(ny, nx);
      return realSphericalHarmonic(l, m, theta, phi, true);
    }
  } else {
    // Complex: |Y_lm| = K * |P| — no phi dependency, no singularity
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, nz);
    return K * abs(P);
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
  let nf = f32(n);
  let E = -0.5 / (nf * nf);
  let phase = -E * t;
  let timeFactor = vec2f(cos(phase), sin(phase));
  return vec2f(psiReal * timeFactor.x, psiReal * timeFactor.y);
}
`
