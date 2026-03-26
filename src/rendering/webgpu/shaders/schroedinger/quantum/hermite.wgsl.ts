/**
 * WGSL Hermite polynomial evaluation using precomputed coefficients
 *
 * Hermite polynomials H_n(u) are used in quantum harmonic oscillator eigenfunctions.
 * Port of GLSL quantum/hermite.glsl to WGSL.
 *
 * Uses a precomputed coefficient LUT + Horner's method instead of the three-term
 * recurrence relation. The loop has a constant upper bound (MAX_QUANTUM_N = 6),
 * which Dawn/Tint unrolls automatically during WGSL compilation.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hermite.wgsl
 */

export const hermiteBlock = /* wgsl */ `
// ============================================
// Hermite Polynomial (Coefficient LUT Version)
// ============================================

// Maximum supported quantum number (n ≤ MAX_QUANTUM_N)
const MAX_QUANTUM_N: i32 = 6;

// Precomputed Hermite polynomial coefficients
// Layout: 7 polynomials x 7 coefficients = 49 floats
// Access: HERMITE_COEFFS[n * 7 + k] = coefficient of u^k in H_n(u)
const HERMITE_COEFFS: array<f32, 49> = array<f32, 49>(
  // H_0: 1
  1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  // H_1: 2u
  0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  // H_2: 4u^2 - 2
  -2.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0,
  // H_3: 8u^3 - 12u
  0.0, -12.0, 0.0, 8.0, 0.0, 0.0, 0.0,
  // H_4: 16u^4 - 48u^2 + 12
  12.0, 0.0, -48.0, 0.0, 16.0, 0.0, 0.0,
  // H_5: 32u^5 - 160u^3 + 120u
  0.0, 120.0, 0.0, -160.0, 0.0, 32.0, 0.0,
  // H_6: 64u^6 - 480u^4 + 720u^2 - 120
  -120.0, 0.0, 720.0, 0.0, -480.0, 0.0, 64.0
);

// Evaluate Hermite polynomial H_n(u) using precomputed coefficients.
// Horner's method from highest to lowest power: H_n(u) = c[n]*u^n + ... + c[0].
// The loop bound is constant (≤ MAX_QUANTUM_N), so Dawn/Tint unrolls it.
fn hermite(n: i32, u: f32) -> f32 {
  if (n < 0 || n > MAX_QUANTUM_N) { return 0.0; }
  if (n == 0) { return 1.0; }
  if (n == 1) { return 2.0 * u; }

  let offset = n * 7;
  var result = HERMITE_COEFFS[offset + n];
  for (var k = n - 1; k >= 0; k--) {
    result = result * u + HERMITE_COEFFS[offset + k];
  }
  return result;
}
`
