/**
 * WGSL Julia Power Helpers
 *
 * Port of GLSL julia/power.glsl to WGSL.
 * Optimized power calculation for fractal derivative.
 *
 * @module rendering/webgpu/shaders/julia/power.wgsl
 */

export const juliaPowerBlock = /* wgsl */ `
// ============================================
// Julia Power Optimization
// ============================================

// Compute r^n and r^(n-1) efficiently for fractal derivative calculation
// Returns (r^n, r^(n-1)) in a vec2f
fn optimizedPowJulia(r: f32, n: f32) -> vec2f {
  // Fast paths for common integer powers
  if (n == 2.0) {
    return vec2f(r * r, r);
  }
  if (n == 3.0) {
    let r2 = r * r;
    return vec2f(r2 * r, r2);
  }
  if (n == 4.0) {
    let r2 = r * r;
    return vec2f(r2 * r2, r2 * r);
  }
  if (n == 5.0) {
    let r2 = r * r;
    let r4 = r2 * r2;
    return vec2f(r4 * r, r4);
  }
  if (n == 6.0) {
    let r2 = r * r;
    let r3 = r2 * r;
    return vec2f(r3 * r3, r2 * r3);
  }
  if (n == 7.0) {
    let r2 = r * r;
    let r3 = r2 * r;
    let r6 = r3 * r3;
    return vec2f(r6 * r, r6);
  }
  if (n == 8.0) {
    let r2 = r * r;
    let r4 = r2 * r2;
    return vec2f(r4 * r4, r4 * r2 * r);
  }

  // General case using pow()
  let rn = pow(r, n);
  let rnm1 = rn / max(r, EPS);
  return vec2f(rn, rnm1);
}
`
