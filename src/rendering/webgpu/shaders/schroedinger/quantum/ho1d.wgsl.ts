/**
 * WGSL 1D Harmonic Oscillator eigenfunction
 *
 * The quantum harmonic oscillator eigenfunctions are:
 *   φ_n(x) = (α/π)^{1/4} · (1/√(2^n n!)) · H_n(αx) · e^{-½(αx)²}
 *
 * Port of GLSL quantum/ho1d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl
 */

export const ho1dBlock = /* wgsl */ `
// ============================================
// 1D Harmonic Oscillator Eigenfunction
// ============================================

// Evaluate 1D HO eigenfunction φ_n(x, ω)
// Uses visual normalization (not physically exact but stable)
//
// Parameters:
//   n     - quantum number (0-6)
//   x     - position coordinate
//   omega - angular frequency (affects spread)
//
// Returns: eigenfunction value (real)
fn ho1D(n: i32, x: f32, omega: f32) -> f32 {
  // α = √ω (in dimensionless units with ℏ=m=1)
  let alpha = sqrt(max(omega, 0.01));
  let u = alpha * x;

  // Gaussian envelope: e^{-½u²}
  // Clamp u² to prevent underflow
  let u2 = min(u * u, 40.0);
  let gauss = exp(-0.5 * u2);

  // Hermite polynomial
  let H = hermite(n, u);

  // Damping factor to prevent blowup at higher n
  // This keeps visual amplitude reasonable across quantum numbers
  let damp = 1.0 / (1.0 + 0.15 * f32(n * n));

  return damp * H * gauss;
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
  // OPTIMIZATION: Early exit for points outside 3σ Gaussian envelope
  // Harmonic oscillator decays as exp(-0.5 * α² * x²), negligible beyond 3σ
  var distSq = 0.0;
  for (var j = 0; j < 11; j++) {
    if (j >= dim) { break; }
    let alpha = sqrt(max(uniforms.omega[j], 0.01));
    let u = alpha * xND[j];
    distSq += u * u;
  }
  // If sum of squared scaled coords > 18 (≈3σ per dim), contribution < 1e-8
  if (distSq > 18.0) { return 0.0; }

  var product = 1.0;

  for (var j = 0; j < 11; j++) {
    if (j >= dim) { break; }

    let n = uniforms.quantum[termIdx * 11 + j];
    let omega = uniforms.omega[j];

    product *= ho1D(n, xND[j], omega);

    // Early exit if product becomes negligible
    if (abs(product) < 1e-10) { return 0.0; }
  }

  return product;
}
`
