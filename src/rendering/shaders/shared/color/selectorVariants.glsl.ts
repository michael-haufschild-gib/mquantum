/**
 * Compile-time optimized color selector variants
 *
 * When colorAlgorithm is known at compile time, we generate a simplified
 * getColorByAlgorithm function that only includes the specific algorithm.
 * This eliminates:
 * - Runtime algorithm switching (10+ branches)
 * - Unused color module dependencies
 *
 * Color algorithms and their dependencies:
 * - 0,1: HSL only (hsl2rgb)
 * - 2,3,4,6,7,8,9: Cosine palette only (getCosinePaletteColor)
 * - 5: Oklab only (lchColor)
 * - 10: Blackbody (no dependencies, inline math)
 */

import type { ColorAlgorithm } from '../types'

/**
 * Generate compile-time optimized color selector for a specific algorithm.
 *
 * @param algorithm - Color algorithm (0-10)
 * @returns GLSL code for getColorByAlgorithm function
 */
export function generateColorSelectorBlock(algorithm: ColorAlgorithm): string {
  switch (algorithm) {
    case 0:
      // Monochromatic (HSL)
      return `
// ============================================
// Color Selector - Algorithm 0: Monochromatic (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    float newL = 0.3 + distributedT * 0.4;
    return hsl2rgb(vec3(baseHSL.x, baseHSL.y, newL));
}
`

    case 1:
      // Analogous (HSL)
      return `
// ============================================
// Color Selector - Algorithm 1: Analogous (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    float hueOffset = (distributedT - 0.5) * 0.167;
    float newH = fract(baseHSL.x + hueOffset);
    return hsl2rgb(vec3(newH, baseHSL.y, baseHSL.z));
}
`

    case 2:
      // Cosine gradient
      return `
// ============================================
// Color Selector - Algorithm 2: Cosine Gradient (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    return getCosinePaletteColor(t, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 3:
      // Normal-based (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 3: Normal-based (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float normalT = normal.y * 0.5 + 0.5;
    return getCosinePaletteColor(normalT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 4:
      // Distance-field (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 4: Distance-field (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    return getCosinePaletteColor(t, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 5:
      // LCH/Oklab
      return `
// ============================================
// Color Selector - Algorithm 5: LCH/Oklab (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    return lchColor(distributedT, uLchLightness, uLchChroma);
}
`

    case 6:
      // Multi-source (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 6: Multi-source (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float totalWeight = uMultiSourceWeights.x + uMultiSourceWeights.y + uMultiSourceWeights.z;
    vec3 w = uMultiSourceWeights / max(totalWeight, 0.001);
    float normalValue = normal.y * 0.5 + 0.5;
    float orbitTrap = clamp(length(position) / BOUND_R, 0.0, 1.0);
    float blendedT = w.x * t + w.y * orbitTrap + w.z * normalValue;
    return getCosinePaletteColor(blendedT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 7:
      // Radial (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 7: Radial (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float radialT = clamp(length(position) / BOUND_R, 0.0, 1.0);
    return getCosinePaletteColor(radialT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 8:
      // Phase/Angular (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 8: Phase/Angular (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float angle = atan(position.z, position.x);
    float phaseT = angle * 0.15915 + 0.5; // 1/(2*PI)
    return getCosinePaletteColor(phaseT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 9:
      // Mixed (Cosine)
      return `
// ============================================
// Color Selector - Algorithm 9: Mixed Phase+Distance (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float angle = atan(position.z, position.x);
    float phaseT = angle * 0.15915 + 0.5;
    float distT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    float mixedT = mix(phaseT, distT, 0.5);
    return getCosinePaletteColor(mixedT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
}
`

    case 10:
      // Blackbody (no dependencies)
      return `
// ============================================
// Color Selector - Algorithm 10: Blackbody (Compile-time)
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
    float distT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    vec3 col = vec3(0.0);
    col.r = smoothstep(0.0, 0.33, distT);
    col.g = smoothstep(0.33, 0.66, distT);
    col.b = smoothstep(0.66, 1.0, distT);
    return col;
}
`

    default:
      // Fallback to full selector (should not happen)
      return ''
  }
}

/**
 * Get required color modules for a specific algorithm.
 *
 * @param algorithm - Color algorithm (0-10)
 * @returns Object indicating which modules are needed
 */
export function getColorModuleDependencies(algorithm: ColorAlgorithm): {
  hsl: boolean
  cosine: boolean
  oklab: boolean
} {
  switch (algorithm) {
    case 0:
    case 1:
      return { hsl: true, cosine: false, oklab: false }
    case 2:
    case 3:
    case 4:
    case 6:
    case 7:
    case 8:
    case 9:
      return { hsl: false, cosine: true, oklab: false }
    case 5:
      return { hsl: false, cosine: false, oklab: true }
    case 10:
      return { hsl: false, cosine: false, oklab: false }
    default:
      return { hsl: true, cosine: true, oklab: true }
  }
}
