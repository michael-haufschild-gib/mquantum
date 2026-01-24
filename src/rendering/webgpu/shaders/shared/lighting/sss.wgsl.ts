/**
 * WGSL Subsurface Scattering Block
 *
 * Fast approximation of subsurface scattering for translucent materials.
 * Uses wrap lighting technique for backlit appearance.
 * Port of GLSL sss.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/lighting/sss.wgsl
 */

export const sssBlock = /* wgsl */ `
// ============================================
// Subsurface Scattering Approximation
// ============================================

/**
 * Fast hash for screen-space noise (SSS jitter).
 * Uses integer-like operations for efficiency.
 */
fn sssHash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/**
 * Compute subsurface scattering approximation.
 *
 * Fast "Wrap Lighting" SSS for SDF/volumetric objects,
 * approximating translucency when backlit.
 *
 * @param lightDir Light direction (normalized)
 * @param viewDir View direction (normalized)
 * @param normal Surface normal (normalized)
 * @param distortion Normal distortion factor
 * @param power SSS power/sharpness
 * @param thickness Material thickness (affects absorption)
 * @param jitter Screen-space noise amount (0-1)
 * @param fragCoord Fragment coordinates for noise seed
 * @return SSS contribution
 */
fn computeSSS(
  lightDir: vec3f,
  viewDir: vec3f,
  normal: vec3f,
  distortion: f32,
  power: f32,
  thickness: f32,
  jitter: f32,
  fragCoord: vec2f
) -> vec3f {
  // Apply jitter: perturb distortion with screen-space noise
  let noise = sssHash(fragCoord * 0.1) * 2.0 - 1.0;  // -1 to 1
  let jitteredDistortion = distortion * (1.0 + noise * jitter);

  let halfSum = lightDir + normal * jitteredDistortion;
  let halfLen = length(halfSum);

  // Guard against zero-length vector
  var halfVec: vec3f;
  if (halfLen > 0.0001) {
    halfVec = halfSum / halfLen;
  } else {
    halfVec = vec3f(0.0, 1.0, 0.0);
  }

  // Compute transmission
  let dotVal = clamp(dot(viewDir, -halfVec), 0.0, 1.0);
  let safePower = max(power, 0.001);
  let trans = pow(max(dotVal, 0.0001), safePower);

  // Attenuate by thickness
  return vec3f(trans) * exp(-thickness);
}

/**
 * SSS contribution for a single light.
 *
 * @param light Light data
 * @param fragPos Fragment position
 * @param V View direction
 * @param N Surface normal
 * @param sssParams SSS parameters (distortion, power, thickness, jitter)
 * @param fragCoord Fragment coordinates
 * @return SSS color contribution
 */
fn computeLightSSS(
  light: LightData,
  fragPos: vec3f,
  V: vec3f,
  N: vec3f,
  sssParams: vec4f,
  fragCoord: vec2f
) -> vec3f {
  let L = getLightDirection(light, fragPos);
  let lightColor = light.color.rgb * light.color.a;

  let sss = computeSSS(
    L,
    V,
    N,
    sssParams.x,  // distortion
    sssParams.y,  // power
    sssParams.z,  // thickness
    sssParams.w,  // jitter
    fragCoord
  );

  return sss * lightColor;
}

/**
 * Compute total SSS contribution from all lights.
 */
fn computeMultiLightSSS(
  fragPos: vec3f,
  V: vec3f,
  N: vec3f,
  sssParams: vec4f,
  fragCoord: vec2f,
  lighting: LightingUniforms
) -> vec3f {
  var totalSSS = vec3f(0.0);

  for (var i = 0; i < lighting.lightCount && i < MAX_LIGHTS; i++) {
    let light = lighting.lights[i];
    let lightType = i32(light.position.w);

    if (lightType == LIGHT_TYPE_NONE) {
      continue;
    }

    totalSSS += computeLightSSS(light, fragPos, V, N, sssParams, fragCoord);
  }

  return totalSSS;
}
`
