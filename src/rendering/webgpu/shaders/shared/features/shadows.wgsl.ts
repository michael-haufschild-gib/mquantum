/**
 * WGSL Shadows Block
 *
 * Soft shadow calculation for SDF rendering using improved
 * penumbra technique by Inigo Quilez.
 * Port of GLSL shadows.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/features/shadows.wgsl
 */

export const shadowsBlock = /* wgsl */ `
// ============================================
// Soft Shadows for SDF
// ============================================

/**
 * Calculate hard shadows (binary).
 *
 * @param ro Ray origin (surface position + bias)
 * @param rd Ray direction (toward light)
 * @param mint Minimum march distance (skip near surface)
 * @param maxt Maximum march distance (to light)
 * @return Shadow factor (0 = in shadow, 1 = lit)
 */
fn calcHardShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32) -> f32 {
  var t = mint;

  for (var i = 0; i < 64; i++) {
    let h = GetDist(ro + rd * t);

    if (h < 0.001) {
      return 0.0;
    }

    t += h;

    if (t > maxt) {
      break;
    }
  }

  return 1.0;
}

/**
 * Quality-aware soft shadow with variable sample count and penumbra.
 * Uses Inigo Quilez's improved soft shadow technique.
 *
 * @param ro Ray origin
 * @param rd Ray direction
 * @param mint Minimum march distance
 * @param maxt Maximum march distance
 * @param softness Penumbra softness (0=hard, 2=very soft)
 * @param quality Quality level (0=low, 1=medium, 2=high, 3=ultra)
 * @return Shadow factor with soft penumbra
 */
fn calcSoftShadowQuality(
  ro: vec3f,
  rd: vec3f,
  mint: f32,
  maxt: f32,
  softness: f32,
  quality: i32
) -> f32 {
  // Sample counts based on quality level
  let maxSteps = 8 + quality * 8;

  var res: f32 = 1.0;
  var t = mint;
  var ph: f32 = 1e10;

  // Softness affects penumbra size (k parameter)
  // softness=0 -> k=64 (hard shadows), softness=2 -> k=4 (very soft)
  let k = mix(64.0, 4.0, softness * 0.5);

  for (var i = 0; i < 32; i++) {
    if (i >= maxSteps || t > maxt) {
      break;
    }

    let h = GetDist(ro + rd * t);

    if (h < 0.001) {
      return 0.0;
    }

    // Improved soft shadow technique (Inigo Quilez)
    // y represents the perpendicular distance to the occluder
    let y = min(h * h / (2.0 * ph), h);
    let d = sqrt(max(0.0, h * h - y * y));
    res = min(res, k * d / max(0.0001, t - y));
    ph = h;

    t += clamp(h, 0.02, 0.25);
  }

  return clamp(res, 0.0, 1.0);
}

/**
 * Standard soft shadow with default quality.
 */
fn calcSoftShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32, softness: f32) -> f32 {
  return calcSoftShadowQuality(ro, rd, mint, maxt, softness, 1);
}

/**
 * Fast soft shadow approximation.
 * Uses fewer samples but still provides smooth penumbra.
 *
 * @param ro Ray origin
 * @param rd Ray direction
 * @param mint Minimum distance
 * @param maxt Maximum distance
 * @param k Sharpness (higher = sharper shadows)
 * @return Shadow factor
 */
fn calcSoftShadowFast(ro: vec3f, rd: vec3f, mint: f32, maxt: f32, k: f32) -> f32 {
  var res: f32 = 1.0;
  var t = mint;

  for (var i = 0; i < 16; i++) {
    let h = GetDist(ro + rd * t);

    if (h < 0.001) {
      return 0.0;
    }

    res = min(res, k * h / t);
    t += h;

    if (t > maxt) {
      break;
    }
  }

  return clamp(res, 0.0, 1.0);
}

/**
 * Calculate shadow for a specific light.
 *
 * @param surfacePos Surface position
 * @param surfaceNormal Surface normal (for bias)
 * @param light Light data
 * @param softness Shadow softness
 * @param quality Shadow quality level
 * @return Shadow factor
 */
fn calcLightShadow(
  surfacePos: vec3f,
  surfaceNormal: vec3f,
  light: LightData,
  softness: f32,
  quality: i32
) -> f32 {
  let lightType = i32(light.position.w);

  if (lightType == LIGHT_TYPE_NONE) {
    return 1.0;
  }

  // Bias origin along normal to prevent self-shadowing
  let ro = surfacePos + surfaceNormal * SHADOW_BIAS;

  // Get light direction and distance
  var rd: vec3f;
  var maxDist: f32;

  if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    rd = fastNormalize(-light.direction.xyz);
    maxDist = MAX_DIST;
  } else {
    let toLight = light.position.xyz - surfacePos;
    maxDist = length(toLight);
    rd = toLight / maxDist;
  }

  return calcSoftShadowQuality(ro, rd, 0.001, maxDist, softness, quality);
}

/**
 * Calculate combined shadow factor from all lights.
 *
 * @param surfacePos Surface position
 * @param surfaceNormal Surface normal
 * @param lighting Lighting uniforms
 * @param softness Shadow softness
 * @param quality Shadow quality level
 * @return Array-like shadow factors per light (packed in vec4s)
 */
fn calcAllLightShadows(
  surfacePos: vec3f,
  surfaceNormal: vec3f,
  lighting: LightingUniforms,
  softness: f32,
  quality: i32
) -> array<f32, 8> {
  var shadows: array<f32, 8>;

  for (var i = 0; i < MAX_LIGHTS; i++) {
    if (i >= lighting.lightCount) {
      shadows[i] = 1.0;
    } else {
      shadows[i] = calcLightShadow(
        surfacePos,
        surfaceNormal,
        lighting.lights[i],
        softness,
        quality
      );
    }
  }

  return shadows;
}
`
