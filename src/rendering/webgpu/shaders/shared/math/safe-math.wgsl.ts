/**
 * Safe Math Utilities for Shaders (WGSL)
 *
 * Provides hardened math functions that guard against:
 * - Division by zero
 * - NaN propagation
 * - Infinity values
 * - Invalid normalize operations
 *
 * Use these utilities in shaders that perform complex math operations
 * to prevent visual artifacts and crashes.
 *
 * Port of GLSL shared/math/safe-math.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/math/safe-math.wgsl
 */

/**
 * Safe math function implementations
 */
export const safeMathBlock = /* wgsl */ `
// ============================================
// Safe Math Utilities
// ============================================

// Epsilon values for different precision needs
const SAFE_EPSILON: f32 = 0.0001;
const SAFE_EPSILON_SQ: f32 = 0.00000001;

/**
 * Check if a float value is NaN or Infinity.
 * Note: WGSL has different syntax for these checks
 * @param v - Value to check
 * @returns true if value is invalid (NaN or Inf)
 */
fn isInvalidF32(v: f32) -> bool {
  // WGSL: Use comparison tricks for NaN (x != x is true for NaN)
  // and check for infinity with very large values
  let isNaN = v != v;
  let isInf = abs(v) > 3.402823e+38;
  return isNaN || isInf;
}

/**
 * Check if a vec2 contains any NaN or Infinity.
 */
fn isInvalidVec2(v: vec2f) -> bool {
  return isInvalidF32(v.x) || isInvalidF32(v.y);
}

/**
 * Check if a vec3 contains any NaN or Infinity.
 */
fn isInvalidVec3(v: vec3f) -> bool {
  return isInvalidF32(v.x) || isInvalidF32(v.y) || isInvalidF32(v.z);
}

/**
 * Check if a vec4 contains any NaN or Infinity.
 */
fn isInvalidVec4(v: vec4f) -> bool {
  return isInvalidF32(v.x) || isInvalidF32(v.y) || isInvalidF32(v.z) || isInvalidF32(v.w);
}

/**
 * Safe division that guards against divide by zero.
 * @param a - Numerator
 * @param b - Denominator
 * @returns a / b, or 0.0 if b is near zero
 */
fn safeDivide(a: f32, b: f32) -> f32 {
  return select(0.0, a / b, abs(b) > SAFE_EPSILON);
}

/**
 * Safe division with custom fallback value.
 */
fn safeDivideWithFallback(a: f32, b: f32, fallback: f32) -> f32 {
  return select(fallback, a / b, abs(b) > SAFE_EPSILON);
}

/**
 * Safe division for vec3 by scalar.
 */
fn safeDivideVec3(v: vec3f, s: f32) -> vec3f {
  return select(vec3f(0.0), v / s, abs(s) > SAFE_EPSILON);
}

/**
 * Safe division for vec4 by its w component (perspective divide).
 * Guards against w being zero which causes NaN/Inf.
 */
fn safePerspectiveDivide(v: vec4f) -> vec3f {
  // Preserve sign of w, defaulting to positive when w is exactly zero
  let signW = select(-1.0, 1.0, v.w >= 0.0);
  let safeW = select(v.w, signW * SAFE_EPSILON, abs(v.w) < SAFE_EPSILON);
  return v.xyz / safeW;
}

/**
 * Safe normalize for vec2 that guards against zero-length vectors.
 */
fn safeNormalizeVec2(v: vec2f) -> vec2f {
  let len = length(v);
  return select(vec2f(0.0, 1.0), v / len, len > SAFE_EPSILON);
}

/**
 * Safe normalize for vec2 with custom fallback.
 */
fn safeNormalizeVec2WithFallback(v: vec2f, fallback: vec2f) -> vec2f {
  let len = length(v);
  return select(fallback, v / len, len > SAFE_EPSILON);
}

/**
 * Safe normalize for vec3 that guards against zero-length vectors.
 */
fn safeNormalizeVec3(v: vec3f) -> vec3f {
  let len = length(v);
  return select(vec3f(0.0, 1.0, 0.0), v / len, len > SAFE_EPSILON);
}

/**
 * Safe normalize for vec3 with custom fallback.
 */
fn safeNormalizeVec3WithFallback(v: vec3f, fallback: vec3f) -> vec3f {
  let len = length(v);
  return select(fallback, v / len, len > SAFE_EPSILON);
}

/**
 * Safe length for vec2 that returns a minimum value for near-zero vectors.
 */
fn safeLengthVec2(v: vec2f) -> f32 {
  return max(length(v), SAFE_EPSILON);
}

/**
 * Safe length for vec3 that returns a minimum value for near-zero vectors.
 */
fn safeLengthVec3(v: vec3f) -> f32 {
  return max(length(v), SAFE_EPSILON);
}

/**
 * Safe inverse square root that guards against zero and negative inputs.
 */
fn safeInverseSqrt(x: f32) -> f32 {
  return inverseSqrt(max(x, SAFE_EPSILON_SQ));
}

/**
 * Safe square root that guards against negative inputs.
 */
fn safeSqrt(x: f32) -> f32 {
  return sqrt(max(x, 0.0));
}

/**
 * Safe power function that guards against NaN from negative bases.
 */
fn safePow(base: f32, exp: f32) -> f32 {
  // For fractional exponents, negative base causes NaN
  // Always use absolute value
  return pow(max(abs(base), SAFE_EPSILON), exp);
}

/**
 * Safe atan2 that guards against both inputs being zero.
 */
fn safeAtan2(y: f32, x: f32) -> f32 {
  if (abs(x) < SAFE_EPSILON && abs(y) < SAFE_EPSILON) {
    return 0.0;
  }
  return atan2(y, x);
}

/**
 * Safe logarithm that guards against zero and negative inputs.
 */
fn safeLog(x: f32) -> f32 {
  return log(max(x, SAFE_EPSILON));
}

/**
 * Clamp a value and check for NaN, returning fallback if invalid.
 */
fn safeClamp(v: f32, minVal: f32, maxVal: f32, fallback: f32) -> f32 {
  return select(clamp(v, minVal, maxVal), fallback, isInvalidF32(v));
}

/**
 * Safe mix that guards against NaN inputs.
 */
fn safeMixF32(a: f32, b: f32, t: f32) -> f32 {
  if (isInvalidF32(a) || isInvalidF32(b) || isInvalidF32(t)) {
    return select(a, 0.0, isInvalidF32(a));
  }
  return mix(a, b, clamp(t, 0.0, 1.0));
}

/**
 * Safe mix for vec3 that guards against NaN inputs.
 */
fn safeMixVec3(a: vec3f, b: vec3f, t: f32) -> vec3f {
  if (isInvalidVec3(a) || isInvalidVec3(b) || isInvalidF32(t)) {
    return select(a, vec3f(0.0), isInvalidVec3(a));
  }
  return mix(a, b, clamp(t, 0.0, 1.0));
}

/**
 * Guard a float value, returning fallback if NaN or Inf.
 */
fn guardNaNF32(v: f32, fallback: f32) -> f32 {
  return select(v, fallback, isInvalidF32(v));
}

/**
 * Guard a vec3 value, returning fallback if any component is NaN or Inf.
 */
fn guardNaNVec3(v: vec3f, fallback: vec3f) -> vec3f {
  return select(v, fallback, isInvalidVec3(v));
}

/**
 * Safe reciprocal (1/x) with guard against zero.
 */
fn safeReciprocal(x: f32) -> f32 {
  // Preserve sign of x, defaulting to positive when x is exactly zero
  let signX = select(-1.0, 1.0, x >= 0.0);
  return 1.0 / select(x, signX * SAFE_EPSILON, abs(x) < SAFE_EPSILON);
}
`
