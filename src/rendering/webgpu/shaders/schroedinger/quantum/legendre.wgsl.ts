/**
 * WGSL Associated Legendre Polynomial evaluation
 *
 * Associated Legendre polynomials P^m_l(x) are the θ-dependent part
 * of spherical harmonics:
 *   Y_lm(θ, φ) ∝ P^{|m|}_l(cos θ) · e^{imφ}
 *
 * Port of GLSL quantum/legendre.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/legendre.wgsl
 */

export const legendreBlock = /* wgsl */ `
// ============================================
// Associated Legendre Polynomial P^m_l(x)
// ============================================

// Maximum supported l for Legendre polynomials
// For hydrogen orbitals: l can be up to n-1, so for n=7: l=6
const MAX_LEGENDRE_L: i32 = 7;

/**
 * Evaluate associated Legendre polynomial P^m_l(x)
 *
 * Uses upward recurrence from P^m_m, which is numerically stable for |x| <= 1.
 *
 * Note: This computes P^{|m|}_l(x). The Condon-Shortley phase factor
 * (-1)^m is included in the spherical harmonic normalization.
 *
 * @param l - Degree (l >= 0)
 * @param m - Order (|m| <= l)
 * @param x - Evaluation point (typically cos(θ), so |x| <= 1)
 * @return P^{|m|}_l(x)
 */
fn legendre(l: i32, m: i32, x: f32) -> f32 {
  let absM = abs(m);

  // Validate: |m| must be <= l
  if (absM > l) { return 0.0; }

  // Clamp x to valid range to avoid numerical issues
  let xClamped = clamp(x, -1.0, 1.0);

  // Compute (1 - x²)^{1/2} = sin(θ) for x = cos(θ)
  let somx2 = sqrt((1.0 - xClamped) * (1.0 + xClamped));

  // Start with P^m_m using the closed form:
  // P^m_m(x) = (-1)^m (2m-1)!! (1-x²)^{m/2}
  // Includes the (-1)^m Condon-Shortley phase in the result
  var pmm = 1.0;

  if (absM > 0) {
    // (2m-1)!! = 1·3·5·...·(2m-1)
    var fact = 1.0;
    for (var i = 1; i <= absM; i++) {
      pmm *= fact * somx2;
      fact += 2.0;
    }
    // Include (-1)^m Condon-Shortley phase
    if ((absM & 1) == 1) { pmm = -pmm; }
  }

  // If l == |m|, we're done
  if (l == absM) { return pmm; }

  // Compute P^m_{m+1} = x(2m+1) P^m_m
  let fm = f32(absM);
  var pmmp1 = xClamped * (2.0 * fm + 1.0) * pmm;

  // If l == |m| + 1, we're done
  if (l == absM + 1) { return pmmp1; }

  // Upward recurrence for l > |m| + 1:
  // (l-m)P^m_l = x(2l-1)P^m_{l-1} - (l+m-1)P^m_{l-2}
  var pll = pmmp1;

  for (var ll = absM + 2; ll <= min(l, MAX_LEGENDRE_L); ll++) {
    let fll = f32(ll);
    pll = (xClamped * (2.0 * fll - 1.0) * pmmp1 - (fll + fm - 1.0) * pmm) / (fll - fm);
    pmm = pmmp1;
    pmmp1 = pll;
  }

  return pll;
}

`
