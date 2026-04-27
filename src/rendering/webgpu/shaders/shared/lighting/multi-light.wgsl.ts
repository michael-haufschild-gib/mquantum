/**
 * WGSL Multi-Light System Block
 *
 * Helper functions for multi-light rendering with point, directional,
 * and spot lights.
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

  // Inverse-range attenuation with power-law decay
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
  specularColor: vec3f,
  specularIntensity: f32,
  twoSided: bool,
  lighting: LightingUniforms
) -> vec3f {
  var totalLight = vec3f(0.0);

  // Ambient contribution (energy-conserved: metals don't scatter diffuse light)
  totalLight +=
    albedo *
    max(1.0 - metallic, 0.0) *
    lighting.ambientColor *
    lighting.ambientIntensity;

  // Per-light contribution
  for (var i = 0; i < lighting.lightCount && i < MAX_LIGHTS; i++) {
    let light = lighting.lights[i];
    let lightType = i32(light.position.w);

    if (lightType == LIGHT_TYPE_NONE) {
      continue;
    }

    // Enabled flag packed in params.w (0 or 1)
    var attenuation = light.params.w;
    if (attenuation < 0.5) {
      continue;
    }

    // Inline the surface->light direction AND the distance together, so the
    // (position - fragPos) delta is computed once per light instead of twice
    // (once inside getLightDirection, once inside length() below). This saves
    // one vec3 sub + one dot3 + one sqrt per point/spot light per pixel.
    var L: vec3f;
    var lightDistance: f32 = 0.0;
    if (lightType == LIGHT_TYPE_DIRECTIONAL) {
      // Stored direction is Light -> Surface; negate for Surface -> Light.
      L = fastNormalize(-light.direction.xyz);
    } else {
      let delta = light.position.xyz - fragPos;
      let lenSq = dot(delta, delta);
      if (lenSq < LEN_SQ_THRESHOLD) {
        L = vec3f(0.0, 1.0, 0.0);
        lightDistance = 0.0;
      } else {
        let invLen = inverseSqrt(lenSq);
        L = delta * invLen;
        lightDistance = lenSq * invLen; // == sqrt(lenSq), no extra sqrt
      }
    }

    let nDotLRaw = dot(N, L);
    let NdotL = select(max(nDotLRaw, 0.0), abs(nDotLRaw), twoSided);
    if (NdotL <= 0.0) {
      continue;
    }

    // Distance attenuation for point and spot lights (distance already computed above)
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      attenuation *= getDistanceAttenuation(light, lightDistance);
    }

    // Spot light cone attenuation — lightToFrag = -L (L is already normalized).
    if (lightType == LIGHT_TYPE_SPOT) {
      attenuation *= getSpotAttenuation(light, -L);
    }

    // Skip negligible contributions
    if (attenuation < 0.001) {
      continue;
    }

    // Radiance = linear RGB * intensity * attenuation
    let radiance = light.color.rgb * light.color.a * attenuation;

    // Energy conservation: kS is specular reflectance, kD is diffuse
    let halfSum = V + L;
    let halfLen = length(halfSum);
    var H: vec3f;
    if (halfLen > EPS_DIVISION) {
      H = halfSum / halfLen;
    } else {
      H = N;
    }

    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - metallic);

    // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI).
    // PERF: * INV_PI replaces a vec3 divide (3 divs) with a vec3 mul (3 muls).
    let diffuse = kD * albedo * INV_PI;

    // Specular (Cook-Torrance, with artist-controlled tint/intensity)
    let specular = computePBRSpecular(N, V, L, roughness, F0);
    let specularTerm = specular * specularColor * specularIntensity;

    totalLight += (diffuse + specularTerm) * radiance * NdotL;
  }

  return totalLight;
}

/**
 * Compute total weighted NdotL across all lights (for fresnel rim modulation).
 * Matches WebGL's totalNdotL accumulation in per-light loop.
 */
fn computeTotalNdotL(
  fragPos: vec3f,
  N: vec3f,
  twoSided: bool,
  lighting: LightingUniforms
) -> f32 {
  var total = 0.0;

  for (var i = 0; i < lighting.lightCount && i < MAX_LIGHTS; i++) {
    let light = lighting.lights[i];
    let lightType = i32(light.position.w);

    if (lightType == LIGHT_TYPE_NONE) {
      continue;
    }

    var attenuation = light.params.w;
    if (attenuation < 0.5) {
      continue;
    }

    // Same delta+distance fusion as computeMultiLighting.
    var L: vec3f;
    var lightDistance: f32 = 0.0;
    if (lightType == LIGHT_TYPE_DIRECTIONAL) {
      L = fastNormalize(-light.direction.xyz);
    } else {
      let delta = light.position.xyz - fragPos;
      let lenSq = dot(delta, delta);
      if (lenSq < LEN_SQ_THRESHOLD) {
        L = vec3f(0.0, 1.0, 0.0);
      } else {
        let invLen = inverseSqrt(lenSq);
        L = delta * invLen;
        lightDistance = lenSq * invLen;
      }
    }

    let nDotLRaw = dot(N, L);
    let NdotL = select(max(nDotLRaw, 0.0), abs(nDotLRaw), twoSided);

    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      attenuation *= getDistanceAttenuation(light, lightDistance);
    }

    if (lightType == LIGHT_TYPE_SPOT) {
      // lightToFrag = -L (L is already normalized)
      attenuation *= getSpotAttenuation(light, -L);
    }

    total += NdotL * attenuation;
  }

  return total;
}
`
