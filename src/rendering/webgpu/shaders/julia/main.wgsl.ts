/**
 * WGSL Julia Main Shader Block
 *
 * Main entry point for Julia fragment shader.
 * Handles raymarching, lighting, and final color output.
 *
 * Uses dynamic generation to exclude function calls for disabled features,
 * since WGSL validates all function calls statically (no preprocessor).
 *
 * @module rendering/webgpu/shaders/julia/main.wgsl
 */

export interface MainBlockConfig {
  shadows?: boolean
  ao?: boolean
  sss?: boolean
  ibl?: boolean
}

/**
 * Generate main block with only enabled features.
 * This is the WGSL equivalent of GLSL's #ifdef - we exclude the code entirely.
 * @param config
 */
export function generateMainBlock(config: MainBlockConfig): string {
  const { shadows = false, ao = false, sss = false, ibl = false } = config

  // Build feature sections conditionally
  const iblSection = ibl
    ? `
  // Image-based lighting (IBL)
  if (IBL_ENABLED && iblUniforms.iblQuality > 0) {
    finalColor += computeIBL(
      nor, V, F0,
      roughness, metallic, albedo,
      envMap, envMapSampler,
      iblUniforms
    );
  }
`
    : ''

  const shadowSection = shadows
    ? `
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
`
    : ''

  const aoSection = ao
    ? `
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
`
    : ''

  const sssSection = sss
    ? `
  // Subsurface Scattering
  if (SSS_ENABLED && material.sssEnabled != 0u) {
    // sssParams: (distortion, power, thickness, jitter)
    let sssParams = vec4f(0.5, 4.0, material.sssThickness, material.sssJitter);
    let sssResult = computeMultiLightSSS(
      pos, V, nor,
      sssParams,
      input.clipPosition.xy,
      lighting
    );
    // Apply SSS color and intensity from material uniforms
    finalColor += sssResult * material.sssColor * material.sssIntensity;
  }
`
    : ''

  return /* wgsl */ `
// ============================================
// Main Fragment Shader (Julia Set)
// Generated with: shadows=${shadows}, ao=${ao}, sss=${sss}, ibl=${ibl}
// ============================================

/**
 * Raymarch with bounding sphere optimization (matches GLSL RayMarch).
 * Uses intersectSphere to find entry/exit points and relaxed sphere tracing.
 * Tracks orbital trap for color algorithms.
 */
fn RayMarchJulia(ro: vec3f, rd: vec3f) -> RaymarchResult {
  var result: RaymarchResult;
  result.hit = false;
  result.position = ro;
  result.distance = 0.0;
  result.iterations = 0.0;
  result.minDist = MAX_DIST;
  result.orbital = 0.0;

  // Calculate dynamic max distance based on camera position
  let camDist = length(ro);
  let maxDist = camDist + BOUND_R * 2.0 + 1.0;

  // Bounding sphere intersection test - critical optimization
  let tSphere = intersectSphere(ro, rd, BOUND_R);
  if (tSphere.y < 0.0) {
    // Ray misses bounding sphere entirely
    result.distance = maxDist + 1.0;
    return result;
  }

  // Start at sphere entry point, end at sphere exit
  var t = max(0.0, tSphere.x);
  let maxT = min(tSphere.y, maxDist);
  let surfDist = quality.sdfSurfaceDistance;
  let maxSteps = i32(quality.sdfMaxIterations);

  // Relaxed sphere tracing with overrelaxation (matches GLSL)
  // omega > 1 allows larger steps for faster convergence
  let omega = 1.2;  // Overrelaxation factor
  var prevDist: f32 = 1e10;
  var lastTrap: f32 = 0.0;

  for (var i = 0; i < maxSteps; i++) {
    result.iterations = f32(i);
    let pos = ro + rd * t;

    // Use GetDistWithOrbital to track orbital trap for coloring
    let distAndTrap = GetDistWithOrbital(pos);
    let d = distAndTrap.x;
    lastTrap = distAndTrap.y;

    result.minDist = min(result.minDist, d);

    if (d < surfDist) {
      result.hit = true;
      result.position = pos;
      result.distance = t;
      result.orbital = lastTrap;
      break;
    }

    // Relaxed sphere tracing: take larger steps when safe
    var step = d * omega;

    // Safety check: if step would be larger than previous distance,
    // we might have overstepped - use conservative step instead
    if (step > prevDist + d) {
      step = d;  // Conservative fallback
    }

    t += step;
    prevDist = d;

    if (t > maxT) {
      break;
    }
  }

  if (!result.hit) {
    result.distance = t;
    result.orbital = lastTrap;
  }

  return result;
}

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;

  // Transform ray to MODEL SPACE (matching WebGL behavior)
  // WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  // WebGL: rd = normalize((uInverseModelMatrix * vec4(worldRayDir, 0.0)).xyz)
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

  // CRITICAL: Compute ray direction PER-PIXEL from interpolated world position
  // Do NOT use interpolated normalized vectors - interpolating unit vectors
  // gives incorrect directions (fisheye distortion).
  // This matches GLSL: worldRayDir = normalize(vPosition - uCameraPosition);
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Raymarching with bounding sphere optimization (in MODEL SPACE)
  let result = RayMarchJulia(ro, rd);

  // Background if no hit
  if (!result.hit) {
    discard;
  }

  // Surface position and normal (in MODEL SPACE)
  let pos = result.position;
  let nor = calcNormalAdaptive(pos, result.distance);

  // View direction in MODEL SPACE (matching WebGL: viewDir = -rd)
  let V = -rd;

  // Material properties
  let metallic = material.metallic;
  let roughness = material.roughness;

  // Color from orbital trap (matches GLSL: t = 1.0 - trap)
  // The trap value varies across the surface, creating color variation
  let trapT = 1.0 - result.orbital;

  // Color algorithm: Monochromatic (algorithm 0)
  // Same hue, varying lightness based on orbital trap
  // Matches GLSL: newL = 0.3 + distributedT * 0.4
  let baseHSL = rgb2hsl(material.baseColor.rgb);
  let newLightness = 0.3 + trapT * 0.4;
  let albedo = hsl2rgb(baseHSL.x, baseHSL.y, newLightness);

  // Compute F0 (base reflectivity)
  let F0 = computeF0(albedo, metallic, material.reflectance);

  // ---- Lighting ----
  var finalColor = vec3f(0.0);

  // Direct lighting
  finalColor += computeMultiLighting(
    pos, nor, V,
    albedo, roughness, metallic, F0,
    material.specularColor,
    material.specularIntensity,
    false,
    lighting
  );
${iblSection}${shadowSection}${aoSection}${sssSection}
  // Emissive
  finalColor += material.emissive * material.emissiveIntensity;

  // Fresnel rim lighting
  if (material.fresnelEnabled != 0u) {
    let fresnel = fresnelSchlick(max(dot(nor, V), 0.0), F0);
    let rim = pow(1.0 - max(dot(nor, V), 0.0), 3.0);
    finalColor += rim * material.rimColor * material.fresnelIntensity;
  }

  // ---- Output ----
  output.color = vec4f(finalColor, 1.0);

  // Normal buffer (for post-processing)
  output.normal = vec4f(nor * 0.5 + 0.5, metallic);

  return output;
}
`
}

// Legacy exports for backwards compatibility (will be removed)
export const mainBlock = generateMainBlock({ shadows: true, ao: true, sss: true, ibl: false })
export const mainBlockWithIBL = generateMainBlock({
  shadows: true,
  ao: true,
  sss: true,
  ibl: true,
})
