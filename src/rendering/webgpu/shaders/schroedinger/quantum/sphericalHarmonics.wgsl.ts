/**
 * WGSL Spherical Harmonics Y_lm(θ, φ)
 *
 * Spherical harmonics form the angular part of hydrogen atom wavefunctions.
 * They describe how electron probability density varies with direction.
 *
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
  if (l < 0 || absM > l) { return 0.0; }

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
  // legendre() includes Condon-Shortley phase (-1)^|m|.
  var P = legendre(l, m, cos(theta));

  // For m >= 0, the CS phase gives the standard physicist convention directly:
  //   Y_l^m = K · P_CS · e^{imφ} = (-1)^m · K · P · e^{imφ}  [correct]
  // For m < 0, the standard relation is Y_l^{-|m|} = K · P · e^{-i|m|φ}
  // (without the extra (-1)^|m| from CS). Undo it for odd |m|.
  if (m < 0 && (abs(m) & 1) == 1) { P = -P; }

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

  // Real spherical harmonic (chemistry/visualization convention, no CS phase)
  let K = sphericalHarmonicNorm(l, abs(m));
  // legendre() includes Condon-Shortley (-1)^|m|. Real spherical harmonics
  // are defined without it, so undo for odd |m|.
  var P = legendre(l, abs(m), cos(theta));
  if ((abs(m) & 1) == 1) { P = -P; }

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

// Spherical harmonic normalization constants (l=0..3)
// Used by both angle-based (fastRealSphericalHarmonicDirect) and
// Cartesian (fastRealSphericalHarmonicCartesian) evaluation paths.
const SH_Y00: f32 = 0.28209479;    // 1/(2√π)
const SH_Y1:  f32 = 0.48860251;    // √(3/(4π))
const SH_Y20: f32 = 0.31539157;    // √(5/(16π))
const SH_Y21: f32 = 1.09254843;    // √(15/(4π)) — includes √2 for real harmonics
const SH_Y22: f32 = 0.54627422;    // √(15/(16π))
const SH_Y30: f32 = 0.3731763326;  // √(7/(16π))
const SH_Y31: f32 = 0.4570457995;  // √(21/(32π)) — real Y_3±1 prefactor ((3/2)√2·K_3^1)
const SH_Y32: f32 = 1.4453057213;  // √(105/(16π))
const SH_Y33: f32 = 0.5900435899;  // √(35/(32π))

/**
 * Fast evaluation for common orbital shapes
 *
 * Direct computation without Legendre recursion for l <= 2.
 * These are the most commonly visualized orbitals.
 */
fn fastRealSphericalHarmonic(l: i32, m: i32, theta: f32, phi: f32) -> f32 {
  let ct = cos(theta);
  let st = sin(theta);
  return fastRealSphericalHarmonicDirect(l, m, ct, st, phi);
}

/**
 * PERF: Fast real spherical harmonic from pre-computed cos/sin theta.
 * Eliminates redundant acos → cos round-trip in the hot path.
 * cosTheta = z/r, sinTheta = sqrt(x²+y²)/r (precomputed by caller).
 */
fn fastRealSphericalHarmonicDirect(l: i32, m: i32, ct: f32, st: f32, phi: f32) -> f32 {
  if (l < 0 || abs(m) > l) { return 0.0; }

  // s orbital (l=0)
  if (l == 0) {
    return SH_Y00;
  }

  // p orbitals (l=1)
  if (l == 1) {
    if (m == 0) {
      // pz: ∝ cos(θ)
      return SH_Y1 * ct;
    } else if (m == 1) {
      // px: ∝ sin(θ)cos(φ)
      return SH_Y1 * st * cos(phi);
    } else { // m == -1
      // py: ∝ sin(θ)sin(φ)
      return SH_Y1 * st * sin(phi);
    }
  }

  // d orbitals (l=2)
  if (l == 2) {
    let ct2 = ct * ct;
    let st2 = st * st;

    if (m == 0) {
      // dz2: ∝ (3cos²θ - 1)
      return SH_Y20 * (3.0 * ct2 - 1.0);
    } else if (m == 1) {
      // dxz: ∝ sin(θ)cos(θ)cos(φ)
      return SH_Y21 * st * ct * cos(phi);
    } else if (m == -1) {
      // dyz: ∝ sin(θ)cos(θ)sin(φ)
      return SH_Y21 * st * ct * sin(phi);
    } else if (m == 2) {
      // dx2-y2: ∝ sin²(θ)cos(2φ)
      return SH_Y22 * st2 * cos(2.0 * phi);
    } else { // m == -2
      // dxy: ∝ sin²(θ)sin(2φ)
      return SH_Y22 * st2 * sin(2.0 * phi);
    }
  }

  // f orbitals (l=3) — using ct/st to avoid acos round-trip
  if (l == 3) {
    let ct2 = ct * ct;
    let st2 = st * st;
    if (m == 0) {
      return SH_Y30 * ct * (5.0 * ct2 - 3.0);
    }
    if (m == 1) {
      return SH_Y31 * st * cos(phi) * (5.0 * ct2 - 1.0);
    }
    if (m == -1) {
      return SH_Y31 * st * sin(phi) * (5.0 * ct2 - 1.0);
    }
    if (m == 2) {
      return SH_Y32 * st2 * cos(2.0 * phi) * ct;
    }
    if (m == -2) {
      return SH_Y32 * st2 * sin(2.0 * phi) * ct;
    }
    if (m == 3) {
      return SH_Y33 * st * st2 * cos(3.0 * phi);
    }
    // m == -3
    return SH_Y33 * st * st2 * sin(3.0 * phi);
  }

  // Fall back to general computation for l > 3 (needs theta for Legendre)
  let theta = acos(clamp(ct, -1.0, 1.0));
  return realSphericalHarmonic(l, m, theta, phi, true);
}

/**
 * Cartesian form of real spherical harmonics for l <= 2.
 * Takes normalized direction (nx, ny, nz) = (x/r, y/r, z/r) instead of angles.
 * Completely avoids atan2 — eliminates the z-axis singularity where phi is undefined.
 *
 * Equivalences:
 *   sin(θ)cos(φ) = x/r = nx
 *   sin(θ)sin(φ) = y/r = ny
 *   cos(θ)        = z/r = nz
 */
fn fastRealSphericalHarmonicCartesian(l: i32, m: i32, nx: f32, ny: f32, nz: f32) -> f32 {
  if (l < 0 || abs(m) > l) { return 0.0; }

  // s orbital (l=0)
  if (l == 0) {
    return SH_Y00;
  }

  // p orbitals (l=1)
  if (l == 1) {
    if (m == 0) { return SH_Y1 * nz; }       // pz: cos(θ) = z/r
    if (m == 1) { return SH_Y1 * nx; }        // px: sin(θ)cos(φ) = x/r
    return SH_Y1 * ny;                         // py: sin(θ)sin(φ) = y/r
  }

  // d orbitals (l=2)
  if (l == 2) {
    if (m == 0) {
      // dz²: (3cos²θ - 1) = (3z²/r² - 1)
      return SH_Y20 * (3.0 * nz * nz - 1.0);
    }
    if (m == 1) {
      // dxz: sin(θ)cos(θ)cos(φ) = xz/r²
      return SH_Y21 * nx * nz;
    }
    if (m == -1) {
      // dyz: sin(θ)cos(θ)sin(φ) = yz/r²
      return SH_Y21 * ny * nz;
    }
    if (m == 2) {
      // dx²-y²: sin²(θ)cos(2φ) = (x²-y²)/r²
      return SH_Y22 * (nx * nx - ny * ny);
    }
    // dxy: sin²(θ)sin(2φ) = 2xy/r²
    return SH_Y22 * 2.0 * nx * ny;
  }

  // f orbitals (l=3) — Cartesian real spherical harmonics
  // Eliminates Legendre recurrence + atan2 for f-orbital visualization.
  // Coefficients from standard real solid harmonics (Wikipedia convention, CS-phase undone).
  if (l == 3) {
    let nz2 = nz * nz;
    if (m == 0) {
      // f_z³ ∝ nz(5nz²-3)
      return SH_Y30 * nz * (5.0 * nz2 - 3.0);
    }
    if (m == 1) {
      // f_xz² ∝ nx(5nz²-1)
      return SH_Y31 * nx * (5.0 * nz2 - 1.0);
    }
    if (m == -1) {
      // f_yz² ∝ ny(5nz²-1)
      return SH_Y31 * ny * (5.0 * nz2 - 1.0);
    }
    if (m == 2) {
      // f_z(x²-y²) ∝ (nx²-ny²)nz
      return SH_Y32 * (nx * nx - ny * ny) * nz;
    }
    if (m == -2) {
      // f_xyz ∝ nx·ny·nz — note: 2*SH_Y32 = 2.8906114426
      return 2.0 * SH_Y32 * nx * ny * nz;
    }
    if (m == 3) {
      // f_x(x²-3y²) ∝ nx(nx²-3ny²)
      return SH_Y33 * nx * (nx * nx - 3.0 * ny * ny);
    }
    // m == -3: f_y(3x²-y²) ∝ ny(3nx²-ny²)
    return SH_Y33 * ny * (3.0 * nx * nx - ny * ny);
  }

  // Should not reach here for l <= 3
  return 0.0;
}
`
