/**
 * Ground Plane Fragment Shader Main Block (WGSL)
 * Port of: src/rendering/shaders/groundplane/main.glsl.ts
 *
 * Uses GGX PBR lighting consistent with other custom shaders.
 * Supports multi-light system, shadow maps, and IBL.
 */

export const fragmentUniformsBlock = `
// --- Ground Plane Fragment Uniforms ---
struct GroundPlaneUniforms {
  color: vec3<f32>,
  opacity: f32,
  metallic: f32,
  roughness: f32,
  specularIntensity: f32,
  _pad: f32,
  specularColor: vec3<f32>,
  _pad2: f32,
  cameraPosition: vec3<f32>,
  _pad3: f32,
}

@group(1) @binding(0) var<uniform> groundPlaneUniforms: GroundPlaneUniforms;
`

export const fragmentOutputStruct = `
// --- Fragment Output (MRT) ---
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) worldPosition: vec4<f32>,
}
`

/**
 * Generate the main block with configurable shadow support.
 * This avoids invalid WGSL preprocessor directives by handling
 * conditional compilation at the TypeScript level.
 *
 * @param enableShadows - Whether to include shadow sampling code
 * @returns WGSL main block string
 */
export function generateMainBlock(enableShadows: boolean): string {
  const shadowCode = enableShadows
    ? `let shadow = select(1.0, getShadow(i, input.worldPosition), shadowUniforms.enabled != 0u);`
    : `let shadow = 1.0;`

  return `
// --- Main Fragment Entry Point ---
@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  let N = normalize(input.normal);
  let V = normalize(input.viewDirection);

  // Clamp roughness to prevent numerical issues
  let roughness = max(groundPlaneUniforms.roughness, 0.04);

  // F0 with metallic mixing (industry-standard PBR)
  let F0 = mix(vec3<f32>(0.04), groundPlaneUniforms.color, groundPlaneUniforms.metallic);

  // Start with ambient light (energy-conserved: metals don't scatter diffuse light)
  // max() guards against metallic > 1.0 which would cause negative diffuse
  var Lo = groundPlaneUniforms.color * max(1.0 - groundPlaneUniforms.metallic, 0.0) *
           ambientUniforms.color * ambientUniforms.intensity * f32(ambientUniforms.enabled);

  // Loop over all active lights
  for (var i = 0u; i < MAX_LIGHTS; i++) {
    if (i >= lightUniforms.numLights) { break; }
    if (lightUniforms.lights[i].enabled == 0u) { continue; }

    // Get light direction
    let L = getLightDirection(i, input.worldPosition);
    let H = normalize(V + L);

    var attenuation = lightUniforms.lights[i].intensity;

    // Apply distance attenuation for point and spot lights
    let lightType = lightUniforms.lights[i].lightType;
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(lightUniforms.lights[i].position - input.worldPosition);
      attenuation *= getDistanceAttenuation(i, distance);
    }

    // Apply spot light cone attenuation
    if (lightType == LIGHT_TYPE_SPOT) {
      let lightToFrag = normalize(input.worldPosition - lightUniforms.lights[i].position);
      attenuation *= getSpotAttenuation(i, lightToFrag);
    }

    // Skip negligible contributions
    if (attenuation < 0.001) { continue; }

    // Shadow map sampling (conditionally compiled)
    ${shadowCode}

    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let Fr = fresnelSchlick(max(dot(H, V), 0.0), F0);

    // Specular term
    let numerator = NDF * G * Fr;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    // Energy conservation
    let kS = Fr;
    let kD = (vec3<f32>(1.0) - kS) * (1.0 - groundPlaneUniforms.metallic);

    let NdotL = max(dot(N, L), 0.0);

    // Add light contribution (with artist-controlled specular color)
    let radiance = lightUniforms.lights[i].color * attenuation;
    Lo += (kD * groundPlaneUniforms.color / PI + specular * groundPlaneUniforms.specularColor * groundPlaneUniforms.specularIntensity) * radiance * NdotL * shadow;
  }

  // IBL (environment reflections)
  Lo += computeIBL(N, V, F0, roughness, groundPlaneUniforms.metallic, groundPlaneUniforms.color);

  var color = Lo;

  // Apply procedural grid overlay using LOCAL coordinates
  // input.localPosition.xy is the vertex position before model rotation
  // This ensures consistent grid for all wall orientations
  color = applyGrid(color, input.localPosition.xy, input.worldPosition, groundPlaneUniforms.cameraPosition);

  // Output to render targets (MRT)
  var output: FragmentOutput;
  output.color = vec4<f32>(color, groundPlaneUniforms.opacity);
  output.normal = vec4<f32>(N * 0.5 + 0.5, groundPlaneUniforms.metallic);
  // CRITICAL: Always write to worldPosition to prevent validation errors
  output.worldPosition = vec4<f32>(input.worldPosition, 1.0);
  return output;
}
`
}

// Legacy export for backward compatibility (defaults to shadows enabled)
export const mainBlock = generateMainBlock(true)
