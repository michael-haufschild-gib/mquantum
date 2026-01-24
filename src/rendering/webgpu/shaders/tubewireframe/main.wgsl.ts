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
 * @param tube Tube wireframe uniforms
 * @param lighting Lighting uniforms
 * @return Lit color
 */
fn computeTubeLighting(
  N: vec3f,
  V: vec3f,
  worldPos: vec3f,
  tube: TubeWireframeUniforms,
  lighting: LightingUniforms
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
    Lo += (kD * tube.baseColor / PI + specular) * radiance * NdotL;

    // Track total light for fresnel calculation
    totalNdotL = max(totalNdotL, NdotL * attenuation);
  }

  return Lo;
}
`
