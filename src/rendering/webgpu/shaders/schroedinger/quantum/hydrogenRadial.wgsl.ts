/**
 * WGSL Hydrogen Atom Radial Wavefunction R_nl(r)
 *
 * The radial part of the hydrogen wavefunction describes how
 * the probability density varies with distance from the nucleus.
 *
 * Port of GLSL quantum/hydrogenRadial.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hydrogenRadial.wgsl
 */

export const hydrogenRadialBlock = /* wgsl */ `
// ============================================
// Hydrogen Radial Wavefunction R_nl(r)
// ============================================

/**
 * Check if radial contribution is negligible.
 *
 * Uses precomputed threshold uniform for performance.
 */
fn hydrogenRadialEarlyExit(r: f32, uniforms: SchroedingerUniforms) -> bool {
  return r > uniforms.hydrogenRadialThreshold;
}

/**
 * Compute normalization constant for R_nl(r)
 *
 * N_nl = sqrt((2/na₀)³ · (n-l-1)! / (2n·(n+l)!))
 *
 * Uses FACTORIAL_LUT from sphericalHarmonics for O(1) lookup.
 */
fn hydrogenRadialNorm(n: i32, l: i32, a0: f32) -> f32 {
  let nf = f32(n);

  // (2/na₀)^{3/2} — use x*sqrt(x) instead of pow(x,1.5) to avoid exp+log
  let twoOverNa = 2.0 / (nf * a0);
  let front = twoOverNa * sqrt(twoOverNa);

  // sqrt((n-l-1)! / (2n·(n+l)!))
  let nMinusLMinus1 = n - l - 1;
  let nPlusL = n + l;

  var factRatio: f32;
  if (nPlusL <= 12 && nMinusLMinus1 >= 0) {
    // Direct LUT lookup - O(1) instead of O(n+l) loop
    let factNum = FACTORIAL_LUT[nMinusLMinus1];
    let factDen = 2.0 * nf * FACTORIAL_LUT[nPlusL];
    factRatio = factNum / factDen;
  } else {
    // Fallback for edge cases (rare: n ≤ 7 means nPlusL ≤ 12)
    var factNum = 1.0;
    for (var i = 1; i <= nMinusLMinus1; i++) {
      factNum *= f32(i);
    }
    var factDen = 2.0 * nf;
    for (var i = 1; i <= nPlusL; i++) {
      factDen *= f32(i);
    }
    factRatio = factNum / factDen;
  }

  return front * sqrt(factRatio);
}

/**
 * Evaluate hydrogen radial wavefunction R_nl(r)
 *
 * @param n - Principal quantum number (n >= 1)
 * @param l - Azimuthal quantum number (0 <= l < n)
 * @param r - Radial distance from nucleus
 * @param a0 - Bohr radius scale factor (controls orbital size)
 * @return R_nl(r)
 */
fn hydrogenRadial(n: i32, l: i32, r: f32, a0: f32) -> f32 {
  // Validate quantum numbers
  if (n < 1 || l < 0 || l >= n) { return 0.0; }

  // Avoid division by zero
  let a0Safe = max(a0, 0.001);

  // Scaled radial coordinate: ρ = 2r / (n·a₀)
  let nf = f32(n);
  let rho = 2.0 * r / (nf * a0Safe);

  // Normalization constant (simplified for visualization)
  let norm = hydrogenRadialNorm(n, l, a0Safe);

  // ρ^l factor (behavior near origin)
  // Use iterative multiplication instead of pow() to avoid exp+log transcendentals
  var rhoL: f32 = 1.0;
  for (var il = 0; il < l; il++) {
    rhoL *= rho;
  }

  // Associated Laguerre polynomial L^{2l+1}_{n-l-1}(ρ)
  let lagK = n - l - 1;
  let alpha = f32(2 * l + 1);
  let L = laguerre(lagK, alpha, rho);

  // Exponential decay: e^{-ρ/2} = e^{-r/(na₀)}
  let expPart = exp(-rho * 0.5);

  return norm * rhoL * L * expPart;
}

/**
 * Evaluate Gegenbauer polynomial C_n^alpha(x) using recurrence.
 */
fn gegenbauer(n: i32, alpha: f32, x: f32) -> f32 {
  if (n <= 0) { return 1.0; }
  if (n == 1) { return 2.0 * alpha * x; }

  var cNm2 = 1.0;
  var cNm1 = 2.0 * alpha * x;
  var cN = cNm1;

  for (var i = 2; i <= n; i++) {
    let fi = f32(i);
    let a = 2.0 * (fi + alpha - 1.0) / fi;
    let b = (fi + 2.0 * alpha - 2.0) / fi;
    cN = a * x * cNm1 - b * cNm2;
    cNm2 = cNm1;
    cNm1 = cN;
  }

  return cN;
}

/**
 * Momentum-space hydrogen radial amplitude R̃_nl(k).
 *
 * Visualization-oriented Fock-style form:
 * R̃_nl(k) ∝ (na0·k)^l / (1 + (na0·k)^2)^(l+2) · C_{n-l-1}^{l+1}(x)
 * with x = ((na0·k)^2 - 1) / ((na0·k)^2 + 1)
 */
fn hydrogenRadialMomentum(n: i32, l: i32, k: f32, a0: f32) -> f32 {
  if (n < 1 || l < 0 || l >= n) { return 0.0; }

  let a0Safe = max(a0, 0.001);
  let nf = f32(n);
  let na = nf * a0Safe;
  let q = max(na * abs(k), 0.0);
  let q2 = q * q;
  let x = (q2 - 1.0) / max(q2 + 1.0, 1e-6);

  let order = n - l - 1;
  let alpha = f32(l + 1);
  let gegen = gegenbauer(order, alpha, clamp(x, -1.0, 1.0));
  let denom = pow(1.0 + q2, f32(l) + 2.0);

  var qPow = 1.0;
  for (var il = 0; il < l; il++) {
    qPow *= q;
  }

  // Lightweight normalization using factorial ratio (n <= 7 in UI).
  let factNum = FACTORIAL_LUT[max(order, 0)];
  let factDen = max(FACTORIAL_LUT[min(n + l, 12)], 1e-6);
  let norm = sqrt(max(factNum / factDen, 1e-8));

  // Dimensional normalization for q = (n a0) k substitution:
  // k-space radial amplitudes scale with (n a0)^(3/2) to preserve ∫|R̃|² k² dk.
  let naNorm = na * sqrt(na);
  return naNorm * pow(2.0, f32(l) + 2.0) * norm * qPow * gegen / max(denom, 1e-8);
}

`
