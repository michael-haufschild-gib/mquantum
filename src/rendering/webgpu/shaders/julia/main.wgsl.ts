/**
 * WGSL Julia Main Shader Block
 *
 * Main entry point for Julia fragment shader.
 * Handles raymarching, lighting, and final color output.
 *
 * @module rendering/webgpu/shaders/julia/main.wgsl
 */

export const mainBlock = /* wgsl */ `
// ============================================
// Main Fragment Shader (Julia Set)
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;

  // Get ray from vertex shader
  let ro = input.vRayOrigin;
  let rd = normalize(input.vRayDir);

  // Raymarching
  let result = raymarch(
    ro,
    rd,
    MAX_DIST,
    quality.sdfSurfaceDistance,
    i32(quality.sdfMaxIterations)
  );

  // Background if no hit
  if (!result.hit) {
    discard;
  }

  // Surface position and normal
  let pos = result.position;
  let nor = calcNormalAdaptive(pos, result.distance);

  // View direction
  let V = normalize(camera.cameraPosition - pos);

  // Material properties
  let albedo = material.baseColor.rgb;
  let metallic = material.metallic;
  let roughness = material.roughness;

  // Compute F0 (base reflectivity)
  let F0 = computeF0(albedo, metallic, material.reflectance);

  // ---- Lighting ----
  var finalColor = vec3f(0.0);

  // Direct lighting
  finalColor += computeMultiLighting(
    pos, nor, V,
    albedo, roughness, metallic, F0,
    lighting
  );

  // Shadows (if enabled)
  if (SHADOW_ENABLED) {
    let shadows = calcAllLightShadows(
      pos, nor, lighting,
      quality.shadowSoftness,
      quality.shadowQuality
    );

    // Apply per-light shadows
    let primaryShadow = shadows[0];
    finalColor *= mix(0.2, 1.0, primaryShadow);
  }

  // Ambient Occlusion (if enabled)
  if (AO_ENABLED) {
    let ao = calcAOQuality(
      pos, nor,
      quality.aoSamples,
      quality.aoRadius,
      quality.aoIntensity
    );
    finalColor *= ao;
  }

  // Subsurface Scattering (if enabled)
  if (SSS_ENABLED) {
    let sssColor = computeMultiLightSSS(
      pos, V, nor,
      vec4f(0.5, 4.0, 1.0, 0.2),  // distortion, power, thickness, jitter
      input.clipPosition.xy,
      lighting
    );
    finalColor += sssColor * material.baseColor.rgb * 0.5;
  }

  // Emissive
  finalColor += material.emissive * material.emissiveIntensity;

  // Fresnel rim
  let fresnel = fresnelSchlick(max(dot(nor, V), 0.0), F0);
  let rim = pow(1.0 - max(dot(nor, V), 0.0), 3.0);
  finalColor += rim * fresnel * 0.1;

  // ---- Output ----
  output.color = vec4f(finalColor, 1.0);

  // Normal buffer (for post-processing)
  output.normal = vec4f(nor * 0.5 + 0.5, metallic);

  return output;
}
`

/**
 * Main block with IBL support.
 */
export const mainBlockWithIBL = /* wgsl */ `
// ============================================
// Main Fragment Shader (Julia with IBL)
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;

  // Get ray from vertex shader
  let ro = input.vRayOrigin;
  let rd = normalize(input.vRayDir);

  // Raymarching
  let result = raymarch(
    ro,
    rd,
    MAX_DIST,
    quality.sdfSurfaceDistance,
    i32(quality.sdfMaxIterations)
  );

  // Background if no hit
  if (!result.hit) {
    discard;
  }

  // Surface position and normal
  let pos = result.position;
  let nor = calcNormalAdaptive(pos, result.distance);

  // View direction
  let V = normalize(camera.cameraPosition - pos);

  // Material properties
  let albedo = material.baseColor.rgb;
  let metallic = material.metallic;
  let roughness = material.roughness;

  // Compute F0
  let F0 = computeF0(albedo, metallic, material.reflectance);

  // ---- Lighting ----
  var finalColor = vec3f(0.0);

  // Direct lighting
  finalColor += computeMultiLighting(
    pos, nor, V,
    albedo, roughness, metallic, F0,
    lighting
  );

  // Image-based lighting (IBL)
  if (IBL_ENABLED && iblUniforms.iblQuality > 0) {
    finalColor += computeIBL(
      nor, V, F0,
      roughness, metallic, albedo,
      envMap, envMapSampler,
      iblUniforms
    );
  }

  // Shadows
  if (SHADOW_ENABLED) {
    let shadows = calcAllLightShadows(
      pos, nor, lighting,
      quality.shadowSoftness,
      quality.shadowQuality
    );
    let primaryShadow = shadows[0];
    finalColor *= mix(0.2, 1.0, primaryShadow);
  }

  // Ambient Occlusion
  if (AO_ENABLED) {
    let ao = calcAOQuality(
      pos, nor,
      quality.aoSamples,
      quality.aoRadius,
      quality.aoIntensity
    );
    finalColor *= ao;
  }

  // SSS
  if (SSS_ENABLED) {
    let sssColor = computeMultiLightSSS(
      pos, V, nor,
      vec4f(0.5, 4.0, 1.0, 0.2),
      input.clipPosition.xy,
      lighting
    );
    finalColor += sssColor * albedo * 0.5;
  }

  // Emissive
  finalColor += material.emissive * material.emissiveIntensity;

  // Fresnel rim
  let fresnel = fresnelSchlick(max(dot(nor, V), 0.0), F0);
  let rim = pow(1.0 - max(dot(nor, V), 0.0), 3.0);
  finalColor += rim * fresnel * 0.1;

  // Output
  output.color = vec4f(finalColor, 1.0);
  output.normal = vec4f(nor * 0.5 + 0.5, metallic);

  return output;
}
`
