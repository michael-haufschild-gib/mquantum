/**
 * WGSL 1D Harmonic Oscillator eigenfunction
 *
 * The quantum harmonic oscillator eigenfunctions are:
 *   φ_n(x) = (ω/π)^{1/4} · (1/√(2^n n!)) · H_n(√ω·x) · e^{-½ω x²}
 *
 * With α = √ω (ℏ=m=1), the argument is αx and the prefactor is (α²/π)^{1/4}.
 *
 * Port of GLSL quantum/ho1d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl
 */

export const ho1dBlock = /* wgsl */ `
// ============================================
// 1D Harmonic Oscillator Eigenfunction
// ============================================

// 1/sqrt(2^n n!) for n = 0..6
const HO_NORM: array<f32, 7> = array<f32, 7>(
  1.0,
  0.707106781187,
  0.353553390593,
  0.144337567297,
  0.0510310363080,
  0.0161374306092,
  0.00465847495312
);

// Evaluate 1D HO eigenfunction φ_n(x, ω)
// Uses canonical normalization (Griffiths eq. 2.85, natural units ℏ=m=1):
//   (ω/π)^(1/4) * 1/sqrt(2^n n!)  =  (α²/π)^(1/4) * 1/sqrt(2^n n!)
//
// Parameters:
//   n     - quantum number (0-6)
//   x     - position coordinate
//   omega - angular frequency (affects spread)
//
// Returns: eigenfunction value (real)
fn ho1D(n: i32, x: f32, omega: f32) -> f32 {
  if (n < 0 || n > 6) { return 0.0; }

  // α = √ω (in dimensionless units with ℏ=m=1)
  let omegaClamped = max(omega, 0.01);
  let alpha = sqrt(omegaClamped);
  let u = alpha * x;

  // Gaussian envelope: e^{-½u²}
  // Clamp u² to prevent underflow
  let u2 = min(u * u, 40.0);
  let gauss = exp(-0.5 * u2);

  // Hermite polynomial
  let H = hermite(n, u);

  // Canonical normalization factor: (α²/π)^{1/4} = (ω/π)^{1/4}
  // Note: α² = ω (clamped), so we use omegaClamped directly
  let alphaNorm = sqrt(sqrt(omegaClamped * INV_PI));
  let norm = HO_NORM[n];

  return alphaNorm * norm * H * gauss;
}

// Evaluate product of 1D HO eigenfunctions for D dimensions
// This is the separable D-dimensional eigenfunction:
//   Φ_n(x) = Π_{j=0}^{D-1} φ_{n_j}(x_j, ω_j)
//
// Parameters:
//   xND     - D-dimensional coordinates
//   dim     - number of dimensions
//   termIdx - which superposition term (for accessing quantum numbers)
//   uniforms - Schrödinger uniforms
//
// Returns: product eigenfunction value (real)
fn hoND(
  xND: array<f32, 11>,
  dim: i32,
  termIdx: i32,
  uniforms: SchroedingerUniforms
) -> f32 {
  var product = 1.0;

  for (var j = 0; j < 11; j++) {
    if (j >= dim) { break; }

    let n = getQuantum(uniforms, termIdx * 11 + j);
    let omega = getOmega(uniforms, j);

    product *= ho1D(n, xND[j], omega);

    // Early exit if product becomes negligible
    if (abs(product) < 1e-10) { return 0.0; }
  }

  return product;
}
`
