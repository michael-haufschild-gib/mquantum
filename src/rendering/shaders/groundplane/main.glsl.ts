/**
 * Ground Plane Fragment Shader Main Block
 *
 * Uses GGX PBR lighting consistent with other custom shaders.
 * Supports multi-light system, shadow maps, and IBL.
 */

export const mainBlock = `
// ============================================
// Main
// ============================================

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDirection);

  // Clamp roughness to prevent numerical issues
  float roughness = max(uRoughness, 0.04);

  // F0 with metallic mixing (industry-standard PBR)
  vec3 F0 = mix(vec3(0.04), uColor, uMetallic);

  // Start with ambient light (energy-conserved: metals don't scatter diffuse light)
  // max() guards against uMetallic > 1.0 which would cause negative diffuse
  vec3 Lo = uColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

  // Loop over all active lights
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uNumLights) break;
    if (!uLightsEnabled[i]) continue;

    // Get light direction
    vec3 L = getLightDirection(i, vWorldPosition);
    vec3 H = normalize(V + L);

    float attenuation = uLightIntensities[i];

    // Apply distance attenuation for point and spot lights
    int lightType = uLightTypes[i];
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      float distance = length(uLightPositions[i] - vWorldPosition);
      attenuation *= getDistanceAttenuation(i, distance);
    }

    // Apply spot light cone attenuation
    if (lightType == LIGHT_TYPE_SPOT) {
      vec3 lightToFrag = normalize(vWorldPosition - uLightPositions[i]);
      attenuation *= getSpotAttenuation(i, lightToFrag);
    }

    // Skip negligible contributions
    if (attenuation < 0.001) continue;

    // Shadow map sampling
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

    // Energy conservation
    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

    float NdotL = max(dot(N, L), 0.0);

    // Add light contribution (with artist-controlled specular color)
    vec3 radiance = uLightColors[i] * attenuation;
    Lo += (kD * uColor / PI + specular * uSpecularColor * uSpecularIntensity) * radiance * NdotL * shadow;
  }

  // IBL (environment reflections)
  Lo += computeIBL(N, V, F0, roughness, uMetallic, uColor);

  vec3 color = Lo;

  // Apply procedural grid overlay using LOCAL coordinates
  // vLocalPosition.xy is the vertex position before model rotation
  // This ensures consistent grid for all wall orientations
  color = applyGrid(color, vLocalPosition.xy, vWorldPosition, uCameraPosition);

  // Output to render targets (MRT)
  gColor = vec4(color, uOpacity);
  gNormal = vec4(N * 0.5 + 0.5, uMetallic);
  // CRITICAL: Always write to gPosition to prevent GL_INVALID_OPERATION
  gPosition = vec4(vWorldPosition, 1.0);
}
`
