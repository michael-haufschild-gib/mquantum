export const cosinePaletteBlock = `
// ============================================
// Cosine Gradient Palette Functions
// Based on Inigo Quilez's technique
// ============================================

vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

float applyDistribution(float t, float power, float cycles, float offset) {
  float clamped = clamp(t, 0.0, 1.0);
  // Guard pow() - ensure base > 0 when power could be negative
  // and ensure power >= small value to avoid pow(x, 0) edge cases
  float safePower = max(power, 0.001);
  float safeBase = max(clamped, 0.0001);
  float curved = pow(safeBase, safePower);
  float cycled = fract(curved * cycles + offset);
  return cycled;
}

vec3 getCosinePaletteColor(
  float t,
  vec3 a, vec3 b, vec3 c, vec3 d,
  float power, float cycles, float offset
) {
  float distributedT = applyDistribution(t, power, cycles, offset);
  return cosinePalette(distributedT, a, b, c, d);
}
`
