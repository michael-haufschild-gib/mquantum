/**
 * Compile-time optimized color selector variants (WGSL)
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
 *
 * Port of GLSL shared/color/selectorVariants.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/color/selectorVariants.wgsl
 */

import type { ColorAlgorithm } from '../../types'

/**
 * Generate compile-time optimized color selector for a specific algorithm.
 *
 * @param algorithm - Color algorithm (0-10)
 * @returns WGSL code for getColorByAlgorithm function
 */
export function generateColorSelectorBlock(algorithm: ColorAlgorithm): string {
  switch (algorithm) {
    case 0:
      // Monochromatic (HSL)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 0: Monochromatic (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let distributedT = applyDistribution(t, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
  let newL = 0.3 + distributedT * 0.4;
  return hsl2rgb(vec3f(baseHSL.x, baseHSL.y, newL));
}
`

    case 1:
      // Analogous (HSL)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 1: Analogous (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let distributedT = applyDistribution(t, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
  let hueOffset = (distributedT - 0.5) * 0.167;
  let newH = fract(baseHSL.x + hueOffset);
  return hsl2rgb(vec3f(newH, baseHSL.y, baseHSL.z));
}
`

    case 2:
      // Cosine gradient
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 2: Cosine Gradient (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  return getCosinePaletteColor(t, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 3:
      // Normal-based (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 3: Normal-based (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let normalT = normal.y * 0.5 + 0.5;
  return getCosinePaletteColor(normalT, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 4:
      // Distance-field (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 4: Distance-field (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  return getCosinePaletteColor(t, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 5:
      // LCH/Oklab
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 5: LCH/Oklab (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let distributedT = applyDistribution(t, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
  return lchColor(distributedT, uniforms.lchLightness, uniforms.lchChroma);
}
`

    case 6:
      // Multi-source (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 6: Multi-source (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let totalWeight = uniforms.multiSourceWeights.x + uniforms.multiSourceWeights.y + uniforms.multiSourceWeights.z;
  let w = uniforms.multiSourceWeights / max(totalWeight, 0.001);
  let normalValue = normal.y * 0.5 + 0.5;
  let orbitTrap = clamp(length(position) / BOUND_R, 0.0, 1.0);
  let blendedT = w.x * t + w.y * orbitTrap + w.z * normalValue;
  return getCosinePaletteColor(blendedT, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 7:
      // Radial (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 7: Radial (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let radialT = clamp(length(position) / BOUND_R, 0.0, 1.0);
  return getCosinePaletteColor(radialT, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 8:
      // Phase/Angular (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 8: Phase/Angular (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let angle = atan2(position.z, position.x);
  let phaseT = angle * 0.15915 + 0.5; // 1/(2*PI)
  return getCosinePaletteColor(phaseT, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 9:
      // Mixed (Cosine)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 9: Mixed Phase+Distance (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let angle = atan2(position.z, position.x);
  let phaseT = angle * 0.15915 + 0.5;
  let distT = applyDistribution(t, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
  let mixedT = mix(phaseT, distT, 0.5);
  return getCosinePaletteColor(mixedT, uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
                                uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
}
`

    case 10:
      // Blackbody (no dependencies)
      return /* wgsl */ `
// ============================================
// Color Selector - Algorithm 10: Blackbody (Compile-time)
// ============================================

fn getColorByAlgorithm(t: f32, normal: vec3f, baseHSL: vec3f, position: vec3f, uniforms: ColorUniforms) -> vec3f {
  let distT = applyDistribution(t, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
  var col = vec3f(0.0);
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
