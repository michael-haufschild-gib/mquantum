/**
 * WGSL Common utilities for Hydrogen ND wavefunction evaluation
 *
 * Provides shared functions for computing:
 * - 3D spherical angles from first 3 dimensions
 * - Angular factor evaluation (Y_lm)
 * - Time evolution
 *
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
    if (l <= 3) {
      return vec2f(fastRealSphericalHarmonic(l, m, theta, phi), 0.0);
    } else {
      return vec2f(realSphericalHarmonic(l, m, theta, phi, true), 0.0);
    }
  } else {
    // Full complex Y_lm = K · P_l^|m|(cosθ) · e^{imφ}
    let K = sphericalHarmonicNorm(l, m);
    var P = legendre(l, m, cos(theta));
    // legendre() includes Condon-Shortley phase (-1)^|m|. For m >= 0 this gives
    // the standard Y_l^m directly. For m < 0, Y_l^{-|m|} = K·P_bare·e^{-i|m|φ}
    // (no CS), so undo the phase for odd |m|.
    if (m < 0 && (abs(m) & 1) == 1) { P = -P; }
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
    if (l <= 3) {
      return vec2f(fastRealSphericalHarmonicDirect(l, m, cosTheta, sinTheta, phi), 0.0);
    } else {
      let theta = acos(clamp(cosTheta, -1.0, 1.0));
      return vec2f(realSphericalHarmonic(l, m, theta, phi, true), 0.0);
    }
  } else {
    let K = sphericalHarmonicNorm(l, m);
    var P = legendre(l, m, cosTheta);
    // Undo Condon-Shortley phase for m < 0 (see evalHydrogenNDAngular)
    if (m < 0 && (abs(m) & 1) == 1) { P = -P; }
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
    if (l <= 3) {
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
    var P = legendre(l, m, nz);
    // Undo Condon-Shortley phase for m < 0 (see evalHydrogenNDAngular)
    if (m < 0 && (abs(m) & 1) == 1) { P = -P; }
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

/**
 * Apply time evolution using D-dimensional hydrogen energy.
 *
 * E_total = E_D + E_extra where:
 *   E_D = -0.5 / n_eff² with n_eff = n + (D-3)/2
 *   E_extra = Σ ω_j(n_j + 0.5) for extra dimensions
 *
 * At D=3, n_eff = n and this is identical to hydrogenNDTimeEvolution.
 *
 * @param psi0 - Complex wavefunction at t=0 as vec2f(re, im)
 * @param n - Principal quantum number
 * @param extraEnergy - Extra-dimensional HO energy contribution
 * @param t - Time
 * @param dim - Spatial dimension D (3-11)
 * @return vec2f(re, im) of time-evolved wavefunction
 */
fn hydrogenNDTimeEvolutionND(psi0: vec2f, n: i32, extraEnergy: f32, t: f32, dim: i32) -> vec2f {
  if (n < 1) {
    return psi0;
  }
  let nEff = f32(n) + f32(dim - 3) * 0.5;
  let E = -0.5 / (nEff * nEff) + extraEnergy;
  let phase = -E * t;
  let c = cos(phase);
  let s = sin(phase);
  return vec2f(psi0.x * c - psi0.y * s, psi0.x * s + psi0.y * c);
}

// ============================================
// 2D Circular Harmonics Φ_m(φ)
// ============================================
// In 2D, the angular part is e^{imφ}/√(2π) (complex) or
// cos(mφ)·√(2/2π), sin(|m|φ)·√(2/2π) (real).
// Replaces 3D spherical harmonics Y_lm for D=2 hydrogen.

/**
 * Evaluate 2D circular harmonic as vec2f(re, im).
 *
 * Complex: Φ_m(φ) = e^{imφ} / √(2π)
 * Real: m=0 → 1/√(2π),  m>0 → cos(mφ)/√π,  m<0 → sin(|m|φ)/√π
 *
 * @param m - Angular momentum quantum number
 * @param phi - Azimuthal angle atan2(y, x)
 * @param useReal - Use real circular harmonics
 * @return vec2f(re, im) of angular factor
 */
fn evalCircularHarmonic(m: i32, phi: f32, useReal: bool) -> vec2f {
  let mf = f32(m);
  if (useReal) {
    // Real circular harmonics
    if (m == 0) {
      // 1/√(2π) ≈ 0.39894228
      return vec2f(0.39894228, 0.0);
    } else if (m > 0) {
      // cos(mφ)/√π ≈ cos(mφ) × 0.56418958
      return vec2f(0.56418958 * cos(mf * phi), 0.0);
    } else {
      // sin(|m|φ)/√π ≈ sin(|m|φ) × 0.56418958
      return vec2f(0.56418958 * sin(-mf * phi), 0.0);
    }
  } else {
    // Complex: e^{imφ} / √(2π)
    let norm = 0.39894228; // 1/√(2π)
    return vec2f(norm * cos(mf * phi), norm * sin(mf * phi));
  }
}
`
