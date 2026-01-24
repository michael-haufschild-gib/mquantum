export const mainBlock = `
// ============================================
// Main
// ============================================

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDirection);

  // Clamp roughness to prevent numerical issues (roughness=0 causes NDF=0)
  float roughness = max(uRoughness, 0.04);

  // Base reflectivity - dielectrics have F0 of 0.04, metals use albedo
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, uColor, uMetallic);

  // Start with ambient light (energy-conserved: metals don't scatter diffuse light)
  // max() guards against uMetallic > 1.0 which would cause negative diffuse
  vec3 Lo = uColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

  // Accumulator for total light contribution (for fresnel rim)
  float totalNdotL = 0.0;

  // Loop over all active lights
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uNumLights) break;
    if (!uLightsEnabled[i]) continue;

    // Get light direction
    vec3 L = getLightDirection(i, vWorldPosition);
    // Guard against V and L being opposite (zero-length half vector)
    vec3 halfSum = V + L;
    float halfLen = length(halfSum);
    vec3 H = halfLen > 0.0001 ? halfSum / halfLen : N;

    float attenuation = uLightIntensities[i];

    // Apply distance attenuation for point and spot lights
    int lightType = uLightTypes[i];
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      float distance = length(uLightPositions[i] - vWorldPosition);
      attenuation *= getDistanceAttenuation(i, distance);
    }

    // Apply spot light cone attenuation
    if (lightType == LIGHT_TYPE_SPOT) {
      vec3 ltfDiff = vWorldPosition - uLightPositions[i];
      float ltfLen = length(ltfDiff);
      // Guard against fragment at light position
      vec3 lightToFrag = ltfLen > 0.0001 ? ltfDiff / ltfLen : vec3(0.0, -1.0, 0.0);
      attenuation *= getSpotAttenuation(i, lightToFrag);
    }

    // Skip negligible contributions
    if (attenuation < 0.001) continue;

    // Shadow map sampling for mesh-based objects
#ifdef USE_SHADOWS
    float shadow = uShadowEnabled ? getShadow(i, vWorldPosition) : 1.0;
#else
    float shadow = 1.0;
#endif

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    // Specular term
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    // Energy conservation: what's not reflected is refracted (diffuse)
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    // Metals have no diffuse reflection
    kD *= 1.0 - uMetallic;

    float NdotL = max(dot(N, L), 0.0);

    // Add light contribution with shadow (energy-conserved PBR)
    vec3 radiance = uLightColors[i] * attenuation;
    Lo += (kD * uColor / PI + specular * uSpecularColor * uSpecularIntensity) * radiance * NdotL * shadow;

    // Rim SSS (backlight transmission)
#ifdef USE_SSS
    if (uSssEnabled && uSssIntensity > 0.0) {
      vec3 sss = computeSSS(L, V, N, 0.5, uSssThickness * 4.0, 0.0, uSssJitter, gl_FragCoord.xy);
      Lo += sss * uSssColor * uLightColors[i] * uSssIntensity * attenuation;
    }
#endif

    // Track total light for fresnel calculation
    totalNdotL = max(totalNdotL, NdotL * attenuation);
  }

  // Fresnel rim lighting
  // PERF: Use multiplications instead of pow(x, 3.0)
#ifdef USE_FRESNEL
  if (uFresnelEnabled && uFresnelIntensity > 0.0) {
    float NdotV = max(dot(N, V), 0.0);
    float t = 1.0 - NdotV;
    float rim = t * t * t * uFresnelIntensity * 2.0;
    rim *= (0.3 + 0.7 * totalNdotL);
    Lo += uRimColor * rim;
  }
#endif

  // IBL (environment reflections)
  Lo += computeIBL(N, V, F0, roughness, uMetallic, uColor);

  // Final color (tone mapping is applied by post-processing OutputPass)
  vec3 color = Lo;

  // Output to MRT (Multiple Render Targets)
  // gColor: Color buffer (RGBA)
  // gNormal: Normal buffer (RGB = normal * 0.5 + 0.5, A = reflectivity/metallic)
  // gPosition: World position for temporal reprojection (or dummy for compatibility)
  gColor = vec4(color, uOpacity);
  gNormal = vec4(N * 0.5 + 0.5, uMetallic);
  // CRITICAL: Always write to gPosition to prevent GL_INVALID_OPERATION when
  // rendering to MRT targets with 3 attachments. Unused outputs are silently
  // ignored when rendering to 2-attachment targets.
  // See: docs/bugfixing/log/2025-12-21-schroedinger-temporal-gl-invalid-operation.md
  gPosition = vec4(vWorldPosition, 1.0);
}
`
