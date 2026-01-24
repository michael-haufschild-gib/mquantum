/**
 * WGSL Multi-Light System Block
 *
 * Helper functions for multi-light rendering with point, directional,
 * and spot lights.
 * Port of GLSL multi-light.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/lighting/multi-light.wgsl
 */

export const multiLightBlock = /* wgsl */ `
// ============================================
// Multi-Light System Helper Functions
// ============================================

// Length squared threshold for normalization
const LEN_SQ_THRESHOLD: f32 = EPS_POSITION * EPS_POSITION;

/**
 * Fast normalize using inverseSqrt.
 * Returns (0, 1, 0) for zero-length vectors.
 */
fn fastNormalize(v: vec3f) -> vec3f {
  let lenSq = dot(v, v);
  if (lenSq < LEN_SQ_THRESHOLD) {
    return vec3f(0.0, 1.0, 0.0);
  }
  return v * inverseSqrt(lenSq);
}

/**
 * Fast normalize with length output.
 * Returns normalized direction and length.
 */
fn fastNormalizeWithLength(v: vec3f) -> vec4f {
  let lenSq = dot(v, v);
  if (lenSq < LEN_SQ_THRESHOLD) {
    return vec4f(0.0, 1.0, 0.0, 0.0);
  }
  let invLen = inverseSqrt(lenSq);
  let len = lenSq * invLen;  // len = sqrt(lenSq)
  return vec4f(v * invLen, len);
}

/**
 * Get light direction for a given light.
 * Returns normalized direction FROM fragment TO light source.
 *
 * @param light Light data
 * @param fragPos Fragment world position
 * @return Normalized light direction
 */
fn getLightDirection(light: LightData, fragPos: vec3f) -> vec3f {
  let lightType = i32(light.position.w);

  if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
    return fastNormalize(light.position.xyz - fragPos);
  } else if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    // Directional light: stored direction points Light -> Surface
    // We need Surface -> Light, so negate
    return fastNormalize(-light.direction.xyz);
  }

  return vec3f(0.0, 1.0, 0.0);
}

/**
 * Get spot light cone attenuation with penumbra falloff.
 *
 * @param light Light data with spot parameters
 * @param lightToFrag Direction from light to fragment (normalized)
 * @return Spot attenuation factor
 */
fn getSpotAttenuation(light: LightData, lightToFrag: vec3f) -> f32 {
  let normDir = fastNormalize(light.direction.xyz);
  let cosAngle = dot(lightToFrag, normDir);
  let cosOuter = light.params.z;  // spotCosOuter
  let cosInner = light.params.y;  // spotCosInner
  return smoothstep(cosOuter, cosInner, cosAngle);
}

/**
 * Get distance attenuation for point and spot lights.
 *
 * @param light Light data
 * @param distance Distance from light to fragment
 * @return Distance attenuation factor
 */
fn getDistanceAttenuation(light: LightData, distance: f32) -> f32 {
  let range = light.direction.w;
  let decay = light.params.x;

  // No distance falloff when range is 0 (infinite range)
  if (range <= 0.0) {
    return 1.0;
  }

  // Clamp distance to prevent division by zero
  let d = max(distance, EPS_DIVISION);

  // Three.js attenuation formula
  let rangeAttenuation = clamp(1.0 - d / range, 0.0, 1.0);
  return pow(rangeAttenuation, decay);
}

/**
 * Compute total light contribution from all lights.
 *
 * @param fragPos Fragment world position
 * @param N Surface normal
 * @param V View direction
 * @param albedo Base color
 * @param roughness Material roughness
 * @param metallic Metallic factor
 * @param F0 Base reflectivity
 * @param lighting Lighting uniform data
 * @return Total light contribution (diffuse + specular)
 */
fn computeMultiLighting(
  fragPos: vec3f,
  N: vec3f,
  V: vec3f,
  albedo: vec3f,
  roughness: f32,
  metallic: f32,
  F0: vec3f,
  lighting: LightingUniforms
) -> vec3f {
  var totalLight = vec3f(0.0);

  // Ambient contribution
  totalLight += lighting.ambientColor * lighting.ambientIntensity * albedo;

  // Per-light contribution
  for (var i = 0; i < lighting.lightCount && i < MAX_LIGHTS; i++) {
    let light = lighting.lights[i];
    let lightType = i32(light.position.w);

    if (lightType == LIGHT_TYPE_NONE) {
      continue;
    }

    // Get light direction
    let L = getLightDirection(light, fragPos);
    let NdotL = max(dot(N, L), 0.0);

    if (NdotL <= 0.0) {
      continue;  // Light is behind surface
    }

    // Light color and intensity
    var lightColor = light.color.rgb * light.color.a;

    // Apply attenuation
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(light.position.xyz - fragPos);
      lightColor *= getDistanceAttenuation(light, distance);
    }

    // Spot light cone attenuation
    if (lightType == LIGHT_TYPE_SPOT) {
      let lightToFrag = normalize(fragPos - light.position.xyz);
      lightColor *= getSpotAttenuation(light, lightToFrag);
    }

    // Diffuse contribution (Lambertian)
    let kD = (1.0 - metallic);
    let diffuse = albedo * kD / PI;

    // Specular contribution (Cook-Torrance)
    let specular = computePBRSpecular(N, V, L, roughness, F0);

    // Combine
    totalLight += (diffuse + specular) * lightColor * NdotL;
  }

  return totalLight;
}
`
