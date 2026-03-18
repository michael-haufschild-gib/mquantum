/**
 * WGSL Hydrogen Atom Radial Wavefunction R_nl(r)
 *
 * Provides both the standard 3D radial wavefunction R_nl(r) and the
 * N-dimensional generalization R_nl^(D)(r) that uses the effective
 * angular momentum λ = l + (D-3)/2 from the D-dimensional Coulomb problem.
 *
 * The N-D radial equation yields:
 *   R_nl^(D)(r) = N × ρ^λ × L_{n_r}^{2λ+1}(ρ) × exp(-ρ/2)
 * where n_eff = n + (D-3)/2, ρ = 2r/(n_eff × a₀), and energies shift to
 * E_n(D) = -0.5/n_eff². At D=3, λ=l and all formulas reduce to standard hydrogen.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hydrogenRadial.wgsl
 */

export const hydrogenRadialBlock = /* wgsl */ `
// ============================================
// Hydrogen Radial Wavefunction R_nl(r)
// ============================================

/**
 * Check if radial contribution is negligible (3D).
 *
 * Uses precomputed threshold uniform for performance.
 */
fn hydrogenRadialEarlyExit(r: f32, uniforms: SchroedingerUniforms) -> bool {
  return r > uniforms.hydrogenRadialThreshold;
}

/**
 * Check if radial contribution is negligible (N-dimensional).
 *
 * Uses n_eff = n + (D-3)/2 for the effective orbital extent.
 * The threshold scales as 25 × n_eff × a₀ × (1 + 0.1l).
 *
 * @param r - Radial distance
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param a0 - Bohr radius
 * @param dim - Spatial dimension D (3-11)
 */
fn hydrogenRadialEarlyExitND(r: f32, n: i32, l: i32, a0: f32, dim: i32) -> bool {
  let nEff = f32(n) + f32(dim - 3) * 0.5;
  return r > 25.0 * nEff * a0 * (1.0 + 0.1 * f32(l));
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

// ============================================
// N-Dimensional Hydrogen Radial Wavefunction R_nl^(D)(r)
// ============================================

// Log-factorial LUT: ln(k!) for k = 0..22.
// Max needed index: n + l + D - 2 = 7 + 6 + 11 - 2 = 22.
// Precomputed from f64, stored as f32. Exact for all our quantum number ranges.
const LN_FACTORIAL_LUT: array<f32, 23> = array<f32, 23>(
  0.0,                  // ln(0!) = 0
  0.0,                  // ln(1!) = 0
  0.6931472,            // ln(2!) = ln(2)
  1.7917595,            // ln(3!)
  3.1780539,            // ln(4!)
  4.7874917,            // ln(5!)
  6.5792512,            // ln(6!)
  8.5251614,            // ln(7!)
  10.604602,            // ln(8!)
  12.801827,            // ln(9!)
  15.104413,            // ln(10!)
  17.502308,            // ln(11!)
  19.987214,            // ln(12!)
  22.552164,            // ln(13!)
  25.191221,            // ln(14!)
  27.899271,            // ln(15!)
  30.671860,            // ln(16!)
  33.505073,            // ln(17!)
  36.395445,            // ln(18!)
  39.339884,            // ln(19!)
  42.335616,            // ln(20!)
  45.380139,            // ln(21!)
  48.471181,            // ln(22!)
);

/**
 * Log-factorial lookup: returns ln(k!) for 0 ≤ k ≤ 22.
 *
 * All arguments in the ND hydrogen normalization are positive integers:
 *   Γ(nr + 1) = nr!  and  Γ(nr + 2λ + 2) = (nr + 2l + D - 1)!
 * because 2λ = 2l + D - 3 is always integer (l, D are integers).
 *
 * No Lanczos/Stirling approximation needed — this is exact.
 */
fn lnFactorial(k: i32) -> f32 {
  return LN_FACTORIAL_LUT[clamp(k, 0, 22)];
}

/**
 * Compute normalization constant for R_nl^(D)(r)
 *
 * N = sqrt((2/(n_eff·a₀))³ · n_r! / (2·n_eff · (n_r + 2λ + 1)!))
 *
 * where n_r = n - l - 1, λ = l + (D-3)/2, n_eff = n_r + λ + 1.
 * Both factorial arguments are always positive integers because
 * 2λ = 2l + D - 3 is integer for integer l and D.
 *
 * For D=3: λ = l, n_eff = n, and this reduces to hydrogenRadialNorm.
 *
 * @param nr - Radial quantum number (n - l - 1)
 * @param lambda - Effective angular momentum l + (D-3)/2
 * @param nEff - Effective principal quantum number n + (D-3)/2
 * @param a0 - Bohr radius scale factor
 */
fn hydrogenRadialNormND(nr: i32, lambda: f32, nEff: f32, a0: f32) -> f32 {
  // (2/(n_eff·a₀))^{3/2}
  let twoOverNa = 2.0 / (nEff * a0);
  let front = twoOverNa * sqrt(twoOverNa);

  // n_r! / (2·n_eff · (n_r + 2λ + 1)!)
  // Both arguments are integers: nr and nr + 2l + D - 1
  let denomFactIdx = nr + i32(2.0 * lambda + 1.0 + 0.5);  // round to nearest int
  let lnNum = lnFactorial(nr);
  let lnDen = log(2.0 * nEff) + lnFactorial(denomFactIdx);
  let lnRatio = lnNum - lnDen;

  return front * sqrt(exp(lnRatio));
}

/**
 * Evaluate N-dimensional hydrogen radial wavefunction R_nl^(D)(r).
 *
 * Uses the effective angular momentum λ = l + (D-3)/2 from the
 * D-dimensional Coulomb Schrödinger equation. The radial solution is:
 *
 *   R_nl^(D)(r) = N × ρ^λ × L_{n_r}^{2λ+1}(ρ) × exp(-ρ/2)
 *
 * where ρ = 2r/(n_eff × a₀) and n_eff = n + (D-3)/2.
 *
 * At D=3, λ = l, n_eff = n, and this is identical to hydrogenRadial().
 *
 * @param n - Principal quantum number (n >= 1)
 * @param l - Azimuthal quantum number (0 <= l < n)
 * @param r - Radial distance from nucleus
 * @param a0 - Bohr radius scale factor
 * @param dim - Spatial dimension D (3-11)
 * @return R_nl^(D)(r)
 */
fn hydrogenRadialND(n: i32, l: i32, r: f32, a0: f32, dim: i32) -> f32 {
  if (n < 1 || l < 0 || l >= n) { return 0.0; }

  let a0Safe = max(a0, 0.001);

  // Effective angular momentum and principal quantum number
  let lambda = f32(l) + f32(dim - 3) * 0.5;
  let nr = n - l - 1;
  let nEff = f32(nr) + lambda + 1.0;

  // Scaled radial coordinate: ρ = 2r / (n_eff·a₀)
  let rho = 2.0 * r / (nEff * a0Safe);

  // Normalization
  let norm = hydrogenRadialNormND(nr, lambda, nEff, a0Safe);

  // ρ^λ — for integer lambda use iterative multiply, else use pow
  var rhoLambda: f32;
  let lambdaInt = i32(lambda);
  if (abs(lambda - f32(lambdaInt)) < 1e-6) {
    // Integer lambda (even dimensions): iterative multiply avoids exp+log
    rhoLambda = 1.0;
    for (var il = 0; il < lambdaInt; il++) {
      rhoLambda *= rho;
    }
  } else {
    // Half-integer lambda (odd dimensions): must use pow
    rhoLambda = pow(max(rho, 1e-20), lambda);
  }

  // Associated Laguerre polynomial L^{2λ+1}_{n_r}(ρ)
  let alpha = 2.0 * lambda + 1.0;
  let L = laguerre(nr, alpha, rho);

  // Exponential decay
  let expPart = exp(-rho * 0.5);

  return norm * rhoLambda * L * expPart;
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
  return naNorm * exp2(f32(l) + 2.0) * norm * qPow * gegen / max(denom, 1e-8);
}

/**
 * N-dimensional momentum-space hydrogen radial amplitude R̃_nl^(D)(k).
 *
 * Uses effective parameters: λ = l + (D-3)/2, n_eff = n + (D-3)/2.
 * Modified Fock-style form:
 *   R̃ ∝ (n_eff·a0·k)^λ / (1 + (n_eff·a0·k)²)^(λ+2) · C_{n_r}^{λ+1}(x)
 *
 * At D=3 this reduces to hydrogenRadialMomentum().
 *
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param k - Momentum-space radial coordinate
 * @param a0 - Bohr radius
 * @param dim - Spatial dimension D (3-11)
 */
fn hydrogenRadialMomentumND(n: i32, l: i32, k: f32, a0: f32, dim: i32) -> f32 {
  if (n < 1 || l < 0 || l >= n) { return 0.0; }

  let a0Safe = max(a0, 0.001);
  let lambda = f32(l) + f32(dim - 3) * 0.5;
  let nr = n - l - 1;
  let nEff = f32(nr) + lambda + 1.0;
  let na = nEff * a0Safe;
  let q = max(na * abs(k), 0.0);
  let q2 = q * q;
  let x = (q2 - 1.0) / max(q2 + 1.0, 1e-6);

  let gegen = gegenbauer(nr, lambda + 1.0, clamp(x, -1.0, 1.0));
  let denom = pow(1.0 + q2, lambda + 2.0);

  // q^λ
  let qPow = pow(max(q, 1e-20), lambda);

  // Normalization via log-factorial ratio: sqrt(nr! / (nr + 2λ + 1)!)
  // Both arguments are always integers (see hydrogenRadialNormND comment).
  let denomFactIdx = nr + i32(2.0 * lambda + 1.0 + 0.5);
  let lnRatio = lnFactorial(nr) - lnFactorial(denomFactIdx);
  let norm = sqrt(max(exp(lnRatio), 1e-8));

  let naNorm = na * sqrt(na);
  return naNorm * exp2(lambda + 2.0) * norm * qPow * gegen / max(denom, 1e-8);
}

`
