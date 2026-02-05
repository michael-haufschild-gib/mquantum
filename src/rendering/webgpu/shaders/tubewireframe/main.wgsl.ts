/**
 * WGSL Tube Wireframe Main Fragment Block
 *
 * Full PBR lighting with Cook-Torrance BRDF, multiple lights,
 * and MRT (Multiple Render Targets) output.
 *
 * Port of GLSL tubewireframe/main.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/tubewireframe/main.wgsl
 */

export const tubeMainBlock = /* wgsl */ `
// ============================================
// Main Fragment Shader Logic
// ============================================

/**
 * Compute full PBR lighting for tube wireframe.
 *
 * @param N Surface normal (normalized)
 * @param V View direction (normalized)
 * @param worldPos World position
 * @param fragCoord Fragment coordinates (SSS jitter seed)
 * @param tube Tube wireframe uniforms
 * @param lighting Lighting uniforms
 * @param envMap PMREM environment map
 * @param envSampler PMREM sampler
 * @param iblUniforms IBL uniforms
 * @return Lit color
 */
fn computeTubeLighting(
  N: vec3f,
  V: vec3f,
  worldPos: vec3f,
  fragCoord: vec2f,
  tube: TubeWireframeUniforms,
  lighting: LightingUniforms,
  envMap: texture_2d<f32>,
  envSampler: sampler,
  iblUniforms: IBLUniforms
) -> vec3f {
  // Clamp roughness to prevent numerical issues (roughness=0 causes NDF=0)
  let roughness = max(tube.roughness, 0.04);

  // Base reflectivity - dielectrics have F0 of 0.04, metals use albedo
  var F0 = vec3f(0.04);
  F0 = mix(F0, tube.baseColor, tube.metalness);

  // Start with ambient light (energy-conserved: metals don't scatter diffuse light)
  var Lo = tube.baseColor * max(1.0 - tube.metalness, 0.0) *
           lighting.ambientColor * lighting.ambientIntensity * tube.ambientIntensity;

  // Accumulator for total light contribution (for fresnel rim)
  var totalNdotL: f32 = 0.0;

  // Loop over all active lights
  for (var i: i32 = 0; i < lighting.lightCount && i < MAX_LIGHTS; i++) {
    let light = lighting.lights[i];
    let lightType = i32(light.position.w);

    if (lightType == LIGHT_TYPE_NONE) {
      continue;
    }
    // Enabled flag packed in params.w (0 or 1)
    if (light.params.w < 0.5) {
      continue;
    }

    // Get light direction
    let L = getLightDirection(light, worldPos);

    // Guard against V and L being opposite (zero-length half vector)
    let halfSum = V + L;
    let halfLen = length(halfSum);
    var H: vec3f;
    if (halfLen > 0.0001) {
      H = halfSum / halfLen;
    } else {
      H = N;
    }

    var attenuation = light.color.a;

    // Apply distance attenuation for point and spot lights
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(light.position.xyz - worldPos);
      attenuation *= getDistanceAttenuation(light, distance);
    }

    // Apply spot light cone attenuation
    if (lightType == LIGHT_TYPE_SPOT) {
      let ltfDiff = worldPos - light.position.xyz;
      let ltfLen = length(ltfDiff);
      var lightToFrag: vec3f;
      if (ltfLen > 0.0001) {
        lightToFrag = ltfDiff / ltfLen;
      } else {
        lightToFrag = vec3f(0.0, -1.0, 0.0);
      }
      attenuation *= getSpotAttenuation(light, lightToFrag);
    }

    // Skip negligible contributions
    if (attenuation < 0.001) {
      continue;
    }

    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    // Specular term
    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    // Energy conservation: what's not reflected is refracted (diffuse)
    let kS = F;
    var kD = vec3f(1.0) - kS;
    // Metals have no diffuse reflection
    kD *= 1.0 - tube.metalness;

    let NdotL = max(dot(N, L), 0.0);

    // Add light contribution (energy-conserved PBR)
    let radiance = light.color.rgb * attenuation;
    Lo += (kD * tube.baseColor / PI + specular * tube.specularColor * tube.specularIntensity) *
          radiance *
          NdotL;

    // Rim SSS (backlight transmission)
    if (tube.sssEnabled != 0u && tube.sssIntensity > 0.0) {
      let sss = computeSSS(
        L,
        V,
        N,
        0.5,
        tube.sssThickness * 4.0,
        0.0,
        tube.sssJitter,
        fragCoord
      );
      Lo += sss * tube.sssColor * light.color.rgb * tube.sssIntensity * attenuation;
    }

    // Track total light for fresnel calculation
    totalNdotL = max(totalNdotL, NdotL * attenuation);
  }

  // Fresnel rim lighting
  if (tube.fresnelEnabled != 0u && tube.fresnelIntensity > 0.0) {
    let NdotV = max(dot(N, V), 0.0);
    let t = 1.0 - NdotV;
    let rim = t * t * t * tube.fresnelIntensity * 2.0;
    Lo += tube.rimColor * rim * (0.3 + 0.7 * totalNdotL);
  }

  // IBL (environment reflections)
  Lo += computeIBL(N, V, F0, roughness, tube.metalness, tube.baseColor, envMap, envSampler, iblUniforms);

  return Lo;
}
`
