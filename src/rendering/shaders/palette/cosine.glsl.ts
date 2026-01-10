/**
 * Cosine Gradient Palette GLSL Functions
 *
 * Implements the Inigo Quilez cosine palette technique for smooth,
 * infinitely variable color gradients. Also includes distribution
 * controls for remapping input values.
 *
 * @see https://iquilezles.org/articles/palettes/
 * @see docs/prd/advanced-color-system.md
 */

/**
 * GLSL shader code for cosine palette functions.
 * Include this in fragment shaders before the main() function.
 */
export const GLSL_COSINE_PALETTE = /* glsl */ `
// ============================================================================
// Cosine Gradient Palette Functions
// Based on Inigo Quilez's technique: https://iquilezles.org/articles/palettes/
// ============================================================================

/**
 * Core cosine palette function.
 * Generates smooth, cyclic color gradients.
 *
 * @param t - Input value [0, 1] (can exceed for cycling)
 * @param a - Base offset (shifts entire palette brightness)
 * @param b - Amplitude (controls color intensity range)
 * @param c - Frequency (how many color cycles in [0,1])
 * @param d - Phase (shifts colors along the gradient)
 * @return RGB color in [0, 1] range
 */
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

/**
 * Apply distribution curve to remap input value.
 * Shapes how colors are distributed across the input range.
 *
 * @param t - Input value [0, 1]
 * @param power - Power curve (< 1 expands darks, > 1 expands lights)
 * @param cycles - Number of palette repetitions
 * @param offset - Shifts the gradient start point
 * @return Remapped t value
 */
float applyDistribution(float t, float power, float cycles, float offset) {
  // Clamp t to valid range first
  float clamped = clamp(t, 0.0, 1.0);

  // PERF: Fast paths for common power values
  // pow() is expensive (~40 cycles), but sqrt/multiplication are cheap (~4 cycles)
  float curved;
  if (abs(power - 1.0) < 0.01) {
    // Power ~= 1.0: identity
    curved = clamped;
  } else if (abs(power - 0.5) < 0.01) {
    // Power ~= 0.5: square root
    curved = sqrt(max(clamped, 0.0));
  } else if (abs(power - 2.0) < 0.01) {
    // Power ~= 2.0: square
    curved = clamped * clamped;
  } else if (abs(power - 0.75) < 0.01) {
    // Power ~= 0.75: x^(3/4) = sqrt(x * sqrt(x))
    float sqrtX = sqrt(max(clamped, 0.0));
    curved = sqrt(clamped * sqrtX);
  } else if (abs(power - 1.5) < 0.01) {
    // Power ~= 1.5: x * sqrt(x)
    curved = clamped * sqrt(max(clamped, 0.0));
  } else {
    // General case: use pow()
    float safePower = max(power, 0.001);
    float safeBase = max(clamped, 0.0001);
    curved = pow(safeBase, safePower);
  }

  // Apply cycles and offset, wrap to [0, 1]
  float cycled = fract(curved * cycles + offset);

  return cycled;
}

/**
 * Get cosine palette color with full distribution controls.
 *
 * @param t - Input value (typically face depth or iteration)
 * @param a, b, c, d - Cosine palette coefficients
 * @param power, cycles, offset - Distribution parameters
 * @return RGB color in [0, 1] range
 */
vec3 getCosinePaletteColor(
  float t,
  vec3 a, vec3 b, vec3 c, vec3 d,
  float power, float cycles, float offset
) {
  float distributedT = applyDistribution(t, power, cycles, offset);
  return cosinePalette(distributedT, a, b, c, d);
}

// ============================================================================
// Oklab Color Space Functions (for LCH algorithm)
// Perceptually uniform color space for smooth hue transitions
// ============================================================================

/**
 * Convert Oklab to linear sRGB.
 * Based on Bjorn Ottosson's Oklab color space.
 */
vec3 oklabToLinearSrgb(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;

  return vec3(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

/**
 * Convert linear sRGB to Oklab.
 */
vec3 linearSrgbToOklab(vec3 rgb) {
  float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  // Guard cube root: clamp to non-negative to avoid NaN from pow with negative base
  float l_ = pow(max(l, 0.0), 1.0/3.0);
  float m_ = pow(max(m, 0.0), 1.0/3.0);
  float s_ = pow(max(s, 0.0), 1.0/3.0);

  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

/**
 * Generate color from LCH (Lightness, Chroma, Hue) in Oklab space.
 * Provides perceptually uniform hue transitions.
 *
 * @param t - Input value mapped to hue [0, 1] -> [0, 2pi]
 * @param lightness - Oklab L value (typically 0.5-0.8)
 * @param chroma - Color saturation (typically 0.1-0.2)
 * @return RGB color in [0, 1] range
 */
vec3 lchColor(float t, float lightness, float chroma) {
  float hue = t * 6.28318; // Map to radians
  vec3 oklab = vec3(lightness, chroma * cos(hue), chroma * sin(hue));
  vec3 rgb = oklabToLinearSrgb(oklab);
  // Clamp to valid RGB range
  return clamp(rgb, 0.0, 1.0);
}

// ============================================================================
// Normal-Based Coloring
// ============================================================================

/**
 * Generate color based on surface normal direction.
 *
 * @param normal - Surface normal vector (should be normalized)
 * @param a, b, c, d - Cosine palette coefficients
 * @param power, cycles, offset - Distribution parameters
 * @return RGB color
 */
vec3 normalBasedColor(
  vec3 normal,
  vec3 a, vec3 b, vec3 c, vec3 d,
  float power, float cycles, float offset
) {
  // Map normal Y component to [0, 1]
  // Up-facing surfaces = 1, down-facing = 0
  float t = normal.y * 0.5 + 0.5;
  return getCosinePaletteColor(t, a, b, c, d, power, cycles, offset);
}

// ============================================================================
// Distance Field Coloring
// ============================================================================

/**
 * Generate color based on distance field value.
 *
 * @param distance - Current distance from surface
 * @param maxDistance - Maximum distance for normalization
 * @param a, b, c, d - Cosine palette coefficients
 * @param power, cycles, offset - Distribution parameters
 * @return RGB color
 */
vec3 distanceFieldColor(
  float distance, float maxDistance,
  vec3 a, vec3 b, vec3 c, vec3 d,
  float power, float cycles, float offset
) {
  float t = clamp(distance / maxDistance, 0.0, 1.0);
  return getCosinePaletteColor(t, a, b, c, d, power, cycles, offset);
}

// ============================================================================
// Multi-Source Coloring
// ============================================================================

/**
 * Blend multiple value sources for complex coloring.
 *
 * @param depth - Normalized depth/iteration value
 * @param orbitTrap - Orbit trap value (for fractals)
 * @param normal - Surface normal
 * @param weights - Blend weights for each source
 * @param a, b, c, d - Cosine palette coefficients
 * @param power, cycles, offset - Distribution parameters
 * @return RGB color
 */
vec3 multiSourceColor(
  float depth, float orbitTrap, vec3 normal, vec3 weights,
  vec3 a, vec3 b, vec3 c, vec3 d,
  float power, float cycles, float offset
) {
  // Normalize weights
  float totalWeight = weights.x + weights.y + weights.z;
  vec3 w = weights / max(totalWeight, 0.001);

  // Map normal to [0, 1]
  float normalValue = normal.y * 0.5 + 0.5;

  // Blend sources
  float t = w.x * depth + w.y * orbitTrap + w.z * normalValue;

  return getCosinePaletteColor(t, a, b, c, d, power, cycles, offset);
}
`

/**
 * TypeScript utility function to calculate cosine palette color.
 * Used for color preview in UI.
 * @param t - Input value (0-1)
 * @param a - Base offset coefficients
 * @param b - Amplitude coefficients
 * @param c - Frequency coefficients
 * @param d - Phase coefficients
 * @returns RGB color object with values 0-1
 */
export function calculateCosineColor(
  t: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
): { r: number; g: number; b: number } {
  const TAU = 6.28318
  return {
    r: Math.max(0, Math.min(1, a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])))),
    g: Math.max(0, Math.min(1, a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])))),
    b: Math.max(0, Math.min(1, a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])))),
  }
}

/**
 * Apply distribution curve to t value (TypeScript version).
 * @param t - Input value (0-1)
 * @param power - Power curve exponent
 * @param cycles - Number of palette cycles
 * @param offset - Offset shift
 * @returns Distributed t value
 */
export function applyDistributionTS(
  t: number,
  power: number,
  cycles: number,
  offset: number
): number {
  const clamped = Math.max(0, Math.min(1, t))
  const curved = Math.pow(clamped, power)
  const cycled = (((curved * cycles + offset) % 1) + 1) % 1 // fract equivalent
  return cycled
}

/**
 * Get cosine palette color with distribution (TypeScript version).
 * Used for UI preview rendering.
 * @param t - Input value (0-1)
 * @param a - Base offset coefficients
 * @param b - Amplitude coefficients
 * @param c - Frequency coefficients
 * @param d - Phase coefficients
 * @param power - Power curve exponent
 * @param cycles - Number of palette cycles
 * @param offset - Offset shift
 * @returns RGB color object with values 0-1
 */
export function getCosinePaletteColorTS(
  t: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  power: number,
  cycles: number,
  offset: number
): { r: number; g: number; b: number } {
  const distributedT = applyDistributionTS(t, power, cycles, offset)
  return calculateCosineColor(distributedT, a, b, c, d)
}
