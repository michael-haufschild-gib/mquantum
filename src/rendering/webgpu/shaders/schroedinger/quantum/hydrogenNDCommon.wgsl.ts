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
 * Evaluate angular part Y_lm for hydrogen ND as complex vec2f(re, im).
 *
 * Real orbitals: returns (realY, 0).
 * Complex orbitals: returns full Y_lm = K·P·(cos(mφ), sin(mφ)).
 *
 * @param l - Azimuthal quantum number
 * @param m - Magnetic quantum number
 * @param theta - Polar angle
 * @param phi - Azimuthal angle
 * @param useReal - Use real orbital representation
 * @return vec2f(re, im) of angular factor
 */
fn evalHydrogenNDAngular(l: i32, m: i32, theta: f32, phi: f32, useReal: bool) -> vec2f {
  if (useReal) {
    if (l <= 2) {
      return vec2f(fastRealSphericalHarmonic(l, m, theta, phi), 0.0);
    } else {
      return vec2f(realSphericalHarmonic(l, m, theta, phi, true), 0.0);
    }
  } else {
    // Full complex Y_lm = K · P_l^|m|(cosθ) · e^{imφ}
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, cos(theta));
    let KP = K * P;
    let mf = f32(m);
    return vec2f(KP * cos(mf * phi), KP * sin(mf * phi));
  }
}

/**
 * PERF: Evaluate angular part from pre-computed cos/sin theta.
 * Eliminates acos + cos round-trip (~50 GPU cycles per sample).
 * Returns vec2f(re, im).
 */
fn evalHydrogenNDAngularDirect(l: i32, m: i32, cosTheta: f32, sinTheta: f32, phi: f32, useReal: bool) -> vec2f {
  if (useReal) {
    if (l <= 2) {
      return vec2f(fastRealSphericalHarmonicDirect(l, m, cosTheta, sinTheta, phi), 0.0);
    } else {
      let theta = acos(clamp(cosTheta, -1.0, 1.0));
      return vec2f(realSphericalHarmonic(l, m, theta, phi, true), 0.0);
    }
  } else {
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, cosTheta);
    let KP = K * P;
    let mf = f32(m);
    return vec2f(KP * cos(mf * phi), KP * sin(mf * phi));
  }
}

/**
 * Evaluate angular part Y_lm from Cartesian unit direction (nx, ny, nz) = (x/r, y/r, z/r).
 * Returns vec2f(re, im). Eliminates atan2 singularity for real orbitals at l <= 2.
 */
fn evalHydrogenNDAngularCartesian(l: i32, m: i32, nx: f32, ny: f32, nz: f32, useReal: bool) -> vec2f {
  if (useReal) {
    if (l <= 2) {
      return vec2f(fastRealSphericalHarmonicCartesian(l, m, nx, ny, nz), 0.0);
    } else {
      let rxy2 = nx * nx + ny * ny;
      if (m != 0 && rxy2 < 1e-8) {
        return vec2f(0.0, 0.0);
      }
      let theta = acos(clamp(nz, -1.0, 1.0));
      let phi = atan2(ny, nx);
      return vec2f(realSphericalHarmonic(l, m, theta, phi, true), 0.0);
    }
  } else {
    // Complex: Y_lm = K·P·e^{imφ}; recover phi from Cartesian direction
    let rxy2 = nx * nx + ny * ny;
    if (m != 0 && rxy2 < 1e-8) {
      return vec2f(0.0, 0.0);
    }
    let K = sphericalHarmonicNorm(l, m);
    let P = legendre(l, m, nz);
    let KP = K * P;
    let phi = atan2(ny, nx);
    let mf = f32(m);
    return vec2f(KP * cos(mf * phi), KP * sin(mf * phi));
  }
}

/**
 * Apply time evolution to hydrogen ND wavefunction (complex input).
 *
 * ψ(t) = ψ(0) · exp(-i · E_total · t)
 *
 * E_total = E_3D + E_extra where:
 *   E_3D = -0.5 / n² (Hartree atomic units)
 *   E_extra = Σ ω_j(n_j + 0.5) for extra dimensions
 *
 * @param psi0 - Complex wavefunction at t=0 as vec2f(re, im)
 * @param n - Principal quantum number
 * @param extraEnergy - Extra-dimensional HO energy contribution
 * @param t - Time
 * @return vec2f(re, im) of time-evolved wavefunction
 */
fn hydrogenNDTimeEvolution(psi0: vec2f, n: i32, extraEnergy: f32, t: f32) -> vec2f {
  // Guard: n must be >= 1 (principal quantum number)
  if (n < 1) {
    return psi0;
  }
  let nf = f32(n);
  let E = -0.5 / (nf * nf) + extraEnergy;
  let phase = -E * t;
  // Complex multiplication: psi0 * exp(-iEt) = psi0 * (cos(phase) + i·sin(phase))
  let c = cos(phase);
  let s = sin(phase);
  return vec2f(psi0.x * c - psi0.y * s, psi0.x * s + psi0.y * c);
}
`
