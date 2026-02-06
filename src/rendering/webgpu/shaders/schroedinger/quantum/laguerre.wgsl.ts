/**
 * WGSL Associated Laguerre Polynomial evaluation
 *
 * Associated Laguerre polynomials L^α_k(x) appear in the radial part
 * of hydrogen atom wavefunctions:
 *   R_nl(r) ∝ ρ^l · L^{2l+1}_{n-l-1}(ρ) · e^{-ρ/2}
 *
 * Port of GLSL quantum/laguerre.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/laguerre.wgsl
 */

export const laguerreBlock = /* wgsl */ `
// ============================================
// Associated Laguerre Polynomial L^α_k(x)
// ============================================

// Maximum supported degree for Laguerre polynomials
// For hydrogen orbitals: k = n - l - 1, so for n=7, l=0: k=6
const MAX_LAGUERRE_K: i32 = 7;
const LAGUERRE_INV_DEN: array<f32, 8> = array<f32, 8>(
  1.0, // unused (index 0)
  1.0, // 1/1
  0.5, // 1/2
  0.3333333333, // 1/3
  0.25, // 1/4
  0.2, // 1/5
  0.1666666667, // 1/6
  0.1428571429 // 1/7
);

/**
 * Evaluate associated Laguerre polynomial L^α_k(x)
 *
 * Uses three-term recurrence relation for numerical stability.
 * This is more efficient than direct summation on GPU.
 *
 * @param k - Polynomial degree (non-negative integer)
 * @param alpha - Associated parameter (typically 2l+1 for hydrogen)
 * @param x - Evaluation point (typically ρ = 2r/na₀)
 * @return L^α_k(x)
 */
fn laguerre(k: i32, alpha: f32, x: f32) -> f32 {
  // Handle edge cases
  if (k < 0) { return 0.0; }
  if (k == 0) { return 1.0; }

  // L^α_1(x) = 1 + α - x
  let L0 = 1.0;
  let L1 = 1.0 + alpha - x;
  if (k == 1) { return L1; }

  // Clamp k to prevent infinite loops
  let kClamped = min(k, MAX_LAGUERRE_K);

  // Three-term recurrence
  var Lkm1 = L0;
  var Lk = L1;

  for (var i = 1; i < kClamped; i++) {
    let fi = f32(i);
    let invDen = LAGUERRE_INV_DEN[i + 1];
    // (k+1)L_{k+1} = (2k + 1 + α - x)L_k - (k + α)L_{k-1}
    let Lkp1 = ((2.0 * fi + 1.0 + alpha - x) * Lk - (fi + alpha) * Lkm1) * invDen;
    Lkm1 = Lk;
    Lk = Lkp1;
  }

  return Lk;
}

/**
 * Evaluate associated Laguerre polynomial with damping for visualization
 *
 * High-degree polynomials can have large oscillations. This version
 * applies mild damping to keep values reasonable for volume rendering.
 *
 * @param k - Polynomial degree
 * @param alpha - Associated parameter
 * @param x - Evaluation point
 * @return Damped L^α_k(x)
 */
fn laguerreDamped(k: i32, alpha: f32, x: f32) -> f32 {
  let L = laguerre(k, alpha, x);
  // Damping factor to reduce oscillation amplitude at high k
  let damp = 1.0 / (1.0 + 0.05 * f32(k * k));
  return damp * L;
}
`
