/**
 * WGSL Power animation and optimization helpers for Mandelbulb
 *
 * Provides:
 * - getEffectivePower: Returns effective power considering animation and blending
 * - fastPow8: Optimized power 8 calculation (4 muls instead of pow())
 * - optimizedPow: Generic power with fast path for power=8
 *
 * Port of GLSL mandelbulb/power.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/power.wgsl
 */

export const powerBlock = /* wgsl */ `
// ============================================
// Power animation helper (Technique B)
// Returns effective power value considering animation and alternate power
// ============================================

/**
 * Get the effective power value from uniforms.
 *
 * @param uniforms Mandelbulb uniforms
 * @return Effective power value (min 2.0)
 */
fn getEffectivePower(uniforms: MandelbulbUniforms) -> f32 {
  // Start with base power (possibly animated)
  var basePower: f32;
  if (uniforms.powerAnimationEnabled != 0u) {
    basePower = uniforms.animatedPower;
  } else {
    basePower = uniforms.power;
  }

  // Apply alternate power blending if enabled
  if (uniforms.alternatePowerEnabled != 0u) {
    basePower = mix(basePower, uniforms.alternatePowerValue, uniforms.alternatePowerBlend);
  }

  // Clamp to minimum safe value
  return max(basePower, 2.0);
}

// ============================================
// Optimized Power Functions
// Only fast-path power=8 (most common) to avoid branch cascade overhead
// ============================================

struct PowerResult {
  rPow: f32,        // r^pwr
  rPowMinus1: f32,  // r^(pwr-1)
}

/**
 * Fast integer power for common Mandelbulb power value (8).
 * Uses only 4 multiplications instead of expensive pow().
 *
 * @param r Radius value
 * @return PowerResult with r^8 and r^7
 */
fn fastPow8(r: f32) -> PowerResult {
  let r2 = r * r;
  let r4 = r2 * r2;
  let rPowMinus1 = r4 * r2 * r;  // r^7
  let rPow = r4 * r4;             // r^8

  return PowerResult(rPow, rPowMinus1);
}

/**
 * Generic optimized power - fast path for power=8, pow() for others.
 * Returns r^pwr and r^(pwr-1) for derivative calculation.
 *
 * @param r Radius value
 * @param pwr Power exponent
 * @return PowerResult with r^pwr and r^(pwr-1)
 */
fn optimizedPow(r: f32, pwr: f32) -> PowerResult {
  if (pwr == 8.0) {
    return fastPow8(r);
  } else {
    let rPow = pow(r, pwr);
    let rPowMinus1 = pow(max(r, EPSILON), pwr - 1.0);
    return PowerResult(rPow, rPowMinus1);
  }
}

/**
 * Optimized power - alternate version that unpacks to var parameters.
 * Useful when integrating with existing code that expects separate values.
 *
 * @param r Radius value
 * @param pwr Power exponent
 * @param rPow Output: r^pwr
 * @param rPowMinus1 Output: r^(pwr-1)
 */
fn optimizedPowUnpacked(r: f32, pwr: f32, rPow: ptr<function, f32>, rPowMinus1: ptr<function, f32>) {
  if (pwr == 8.0) {
    let r2 = r * r;
    let r4 = r2 * r2;
    *rPowMinus1 = r4 * r2 * r;  // r^7
    *rPow = r4 * r4;            // r^8
  } else {
    *rPow = pow(r, pwr);
    *rPowMinus1 = pow(max(r, EPSILON), pwr - 1.0);
  }
}
`
