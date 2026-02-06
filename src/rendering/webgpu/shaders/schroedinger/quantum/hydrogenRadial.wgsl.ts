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

  // (2/na₀)^{3/2}
  let front = pow(2.0 / (nf * a0), 1.5);

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
  let fl = f32(l);
  var rhoL: f32;
  if (l == 0) {
    rhoL = 1.0;
  } else {
    rhoL = pow(max(rho, 1e-10), fl);
  }

  // Associated Laguerre polynomial L^{2l+1}_{n-l-1}(ρ)
  let lagK = n - l - 1;
  let alpha = f32(2 * l + 1);
  let L = laguerre(lagK, alpha, rho);

  // Exponential decay: e^{-ρ/2} = e^{-r/(na₀)}
  let expPart = exp(-rho * 0.5);

  // Damping for high n to prevent numerical blowup
  let damp = 1.0 / (1.0 + 0.02 * f32(n * n));

  return damp * norm * rhoL * L * expPart;
}

/**
 * Compute radial probability density r²|R_nl|²
 *
 * This is what's often plotted to show where electrons are likely
 * to be found. The r² factor accounts for the spherical volume element.
 */
fn hydrogenRadialProbability(n: i32, l: i32, r: f32, a0: f32) -> f32 {
  let R = hydrogenRadial(n, l, r, a0);
  return r * r * R * R;
}

/**
 * Find approximate maximum of radial wavefunction
 *
 * Used for adaptive scaling in visualization.
 */
fn hydrogenRadialMaxRadius(n: i32, l: i32, a0: f32) -> f32 {
  let nf = f32(n);
  let fl = f32(l);

  if (l == 0) {
    // s orbitals: max at r ≈ n·a₀
    return nf * a0;
  } else {
    // General case: max near r = n·a₀·(1 + sqrt(1 - (l/n)²))
    let ratio = fl / nf;
    return nf * a0 * (1.0 + sqrt(max(0.0, 1.0 - ratio * ratio)));
  }
}
`
