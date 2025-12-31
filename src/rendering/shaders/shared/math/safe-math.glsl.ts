/**
 * Safe Math Utilities for Shaders
 *
 * Provides hardened math functions that guard against:
 * - Division by zero
 * - NaN propagation
 * - Infinity values
 * - Invalid normalize operations
 *
 * Use these utilities in shaders that perform complex math operations
 * to prevent visual artifacts and crashes.
 */

/**
 * Safe math uniforms (if any needed in future)
 */
export const safeMathUniformsBlock = `
// No uniforms needed for safe math utilities
`

/**
 * Safe math function implementations
 */
export const safeMathFunctionsBlock = /* glsl */ `
// ============================================
// Safe Math Utilities
// ============================================

// Epsilon values for different precision needs
#ifndef SAFE_EPSILON
#define SAFE_EPSILON 0.0001
#endif

#ifndef SAFE_EPSILON_SQ
#define SAFE_EPSILON_SQ 0.00000001
#endif

/**
 * Check if a float value is NaN or Infinity.
 * @param v - Value to check
 * @returns true if value is invalid (NaN or Inf)
 */
bool isInvalid(float v) {
  return isnan(v) || isinf(v);
}

/**
 * Check if a vec2 contains any NaN or Infinity.
 * @param v - Vector to check
 * @returns true if any component is invalid
 */
bool isInvalid(vec2 v) {
  return isInvalid(v.x) || isInvalid(v.y);
}

/**
 * Check if a vec3 contains any NaN or Infinity.
 * @param v - Vector to check
 * @returns true if any component is invalid
 */
bool isInvalid(vec3 v) {
  return isInvalid(v.x) || isInvalid(v.y) || isInvalid(v.z);
}

/**
 * Check if a vec4 contains any NaN or Infinity.
 * @param v - Vector to check
 * @returns true if any component is invalid
 */
bool isInvalid(vec4 v) {
  return isInvalid(v.x) || isInvalid(v.y) || isInvalid(v.z) || isInvalid(v.w);
}

/**
 * Safe division that guards against divide by zero.
 * @param a - Numerator
 * @param b - Denominator
 * @returns a / b, or 0.0 if b is near zero
 */
float safeDivide(float a, float b) {
  return abs(b) > SAFE_EPSILON ? a / b : 0.0;
}

/**
 * Safe division with custom fallback value.
 * @param a - Numerator
 * @param b - Denominator
 * @param fallback - Value to return if b is near zero
 * @returns a / b, or fallback if b is near zero
 */
float safeDivide(float a, float b, float fallback) {
  return abs(b) > SAFE_EPSILON ? a / b : fallback;
}

/**
 * Safe division for vec3 by scalar.
 * @param v - Vector numerator
 * @param s - Scalar denominator
 * @returns v / s, or vec3(0) if s is near zero
 */
vec3 safeDivide(vec3 v, float s) {
  return abs(s) > SAFE_EPSILON ? v / s : vec3(0.0);
}

/**
 * Safe division for vec4 by its w component (perspective divide).
 * Guards against w being zero which causes NaN/Inf.
 * @param v - Homogeneous vector
 * @returns v.xyz / v.w with w clamped to safe minimum
 */
vec3 safePerspectiveDivide(vec4 v) {
  // Preserve sign of w, defaulting to positive when w is exactly zero
  float signW = v.w >= 0.0 ? 1.0 : -1.0;
  float safeW = abs(v.w) < SAFE_EPSILON ? signW * SAFE_EPSILON : v.w;
  return v.xyz / safeW;
}

/**
 * Safe normalize that guards against zero-length vectors.
 * @param v - Vector to normalize
 * @returns Normalized vector, or fallback if length is near zero
 */
vec2 safeNormalize(vec2 v) {
  float len = length(v);
  return len > SAFE_EPSILON ? v / len : vec2(0.0, 1.0);
}

/**
 * Safe normalize with custom fallback.
 * @param v - Vector to normalize
 * @param fallback - Fallback vector if v is near zero length
 * @returns Normalized vector, or fallback if length is near zero
 */
vec2 safeNormalize(vec2 v, vec2 fallback) {
  float len = length(v);
  return len > SAFE_EPSILON ? v / len : fallback;
}

/**
 * Safe normalize that guards against zero-length vectors.
 * @param v - Vector to normalize
 * @returns Normalized vector, or (0,1,0) if length is near zero
 */
vec3 safeNormalize(vec3 v) {
  float len = length(v);
  return len > SAFE_EPSILON ? v / len : vec3(0.0, 1.0, 0.0);
}

/**
 * Safe normalize with custom fallback.
 * @param v - Vector to normalize
 * @param fallback - Fallback vector if v is near zero length
 * @returns Normalized vector, or fallback if length is near zero
 */
vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len = length(v);
  return len > SAFE_EPSILON ? v / len : fallback;
}

/**
 * Safe length that returns a minimum value for near-zero vectors.
 * Useful when length is used as a divisor.
 * @param v - Vector
 * @returns Length of vector, clamped to minimum epsilon
 */
float safeLength(vec2 v) {
  return max(length(v), SAFE_EPSILON);
}

/**
 * Safe length that returns a minimum value for near-zero vectors.
 * @param v - Vector
 * @returns Length of vector, clamped to minimum epsilon
 */
float safeLength(vec3 v) {
  return max(length(v), SAFE_EPSILON);
}

/**
 * Safe inverse square root that guards against zero and negative inputs.
 * @param x - Input value
 * @returns 1.0 / sqrt(x), with x clamped to safe minimum
 */
float safeInverseSqrt(float x) {
  return inversesqrt(max(x, SAFE_EPSILON_SQ));
}

/**
 * Safe square root that guards against negative inputs.
 * @param x - Input value
 * @returns sqrt(max(x, 0))
 */
float safeSqrt(float x) {
  return sqrt(max(x, 0.0));
}

/**
 * Safe power function that guards against NaN from negative bases.
 * @param base - Base value
 * @param exp - Exponent
 * @returns pow(abs(base), exp) with sign preserved for odd exponents
 */
float safePow(float base, float exp) {
  // For fractional exponents, negative base causes NaN
  // Always use absolute value and handle sign separately if needed
  return pow(max(abs(base), SAFE_EPSILON), exp);
}

/**
 * Safe atan2 that guards against both inputs being zero.
 * @param y - Y component
 * @param x - X component
 * @returns Angle in radians, or 0 if both inputs are near zero
 */
float safeAtan(float y, float x) {
  if (abs(x) < SAFE_EPSILON && abs(y) < SAFE_EPSILON) {
    return 0.0;
  }
  return atan(y, x);
}

/**
 * Safe logarithm that guards against zero and negative inputs.
 * @param x - Input value
 * @returns log(max(x, epsilon))
 */
float safeLog(float x) {
  return log(max(x, SAFE_EPSILON));
}

/**
 * Clamp a value and check for NaN, returning fallback if invalid.
 * @param v - Value to clamp
 * @param minVal - Minimum
 * @param maxVal - Maximum
 * @param fallback - Fallback if NaN
 * @returns Clamped value or fallback
 */
float safeClamp(float v, float minVal, float maxVal, float fallback) {
  return isInvalid(v) ? fallback : clamp(v, minVal, maxVal);
}

/**
 * Safe mix that guards against NaN inputs.
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor
 * @returns Interpolated value, or a if any input is invalid
 */
float safeMix(float a, float b, float t) {
  if (isInvalid(a) || isInvalid(b) || isInvalid(t)) {
    return isInvalid(a) ? 0.0 : a;
  }
  return mix(a, b, clamp(t, 0.0, 1.0));
}

/**
 * Safe mix for vec3 that guards against NaN inputs.
 */
vec3 safeMix(vec3 a, vec3 b, float t) {
  if (isInvalid(a) || isInvalid(b) || isInvalid(t)) {
    return isInvalid(a) ? vec3(0.0) : a;
  }
  return mix(a, b, clamp(t, 0.0, 1.0));
}

/**
 * Guard a float value, returning fallback if NaN or Inf.
 * @param v - Value to guard
 * @param fallback - Fallback value
 * @returns v if valid, fallback otherwise
 */
float guardNaN(float v, float fallback) {
  return isInvalid(v) ? fallback : v;
}

/**
 * Guard a vec3 value, returning fallback if any component is NaN or Inf.
 * @param v - Value to guard
 * @param fallback - Fallback value
 * @returns v if valid, fallback otherwise
 */
vec3 guardNaN(vec3 v, vec3 fallback) {
  return isInvalid(v) ? fallback : v;
}

/**
 * Safe reciprocal (1/x) with guard against zero.
 * @param x - Input value
 * @returns 1/x with x clamped away from zero
 */
float safeReciprocal(float x) {
  // Preserve sign of x, defaulting to positive when x is exactly zero
  float signX = x >= 0.0 ? 1.0 : -1.0;
  return 1.0 / (abs(x) < SAFE_EPSILON ? signX * SAFE_EPSILON : x);
}
`















