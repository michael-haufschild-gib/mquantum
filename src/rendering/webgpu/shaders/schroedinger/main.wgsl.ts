/**
 * WGSL Schrödinger Main Shader
 *
 * Port of GLSL schroedinger/main.glsl to WGSL.
 * Main volume raymarching loop for quantum wavefunction visualization.
 *
 * Supports two modes:
 * - Volumetric: Uses Beer-Lambert absorption and front-to-back compositing
 * - Isosurface: Finds density threshold surface with PBR lighting
 *
 * Uniform access:
 * - camera: CameraUniforms (Group 0, Binding 0)
 * - lighting: LightingUniforms (Group 1, Binding 0)
 * - material: MaterialUniforms (Group 1, Binding 1)
 * - quality: QualityUniforms (Group 1, Binding 2)
 * - schroedinger: SchroedingerUniforms (Group 2, Binding 0)
 * - basis: BasisVectors (Group 2, Binding 1)
 *
 * @module rendering/webgpu/shaders/schroedinger/main.wgsl
 */

/**
 * Main block for volumetric rendering mode.
 * Uses volumeRaymarch() / volumeRaymarchHQ() from integration block.
 */
export const mainBlock = /* wgsl */ `
// ============================================
// Main Fragment Shader - Volumetric Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup: transform to model space
  // This matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

  // Compute ray direction per-pixel from interpolated world position
  // This matches WebGL: worldRayDir = normalize(vPosition - uCameraPosition)
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding sphere
  let tSphere = intersectSphere(ro, rd, BOUND_R);

  // No intersection with bounding volume
  if (tSphere.y < 0.0) {
    discard;
  }

  var tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Volumetric raymarching using functions from integration block
  // Fast mode selection based on quality multiplier
  var volumeResult: VolumeResult;

  // Use quality multiplier < 1.0 as "fast mode" indicator
  let fastMode = quality.qualityMultiplier < 0.75;

  // Use HQ mode if quality requires it OR if dispersion is enabled
  // (dispersion requires per-channel RGB transmittance only available in HQ path)
  if (fastMode && schroedinger.dispersionEnabled == 0u) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
  }

  // Debug Mode 1: Iteration Heatmap
  // Shows green→yellow→red gradient based on iteration count
  // Green = few iterations (efficient), Red = many iterations (expensive)
  if (quality.debugMode == 1) {
    let maxIter = f32(schroedinger.sampleCount);
    let iterT = f32(volumeResult.iterationCount) / max(maxIter, 1.0);
    // Heatmap: green (low) → yellow (mid) → red (high)
    var heatmap: vec3f;
    heatmap.r = smoothstep(0.0, 0.5, iterT);           // R: ramps up in first half
    heatmap.g = 1.0 - smoothstep(0.5, 1.0, iterT);     // G: stays high, drops in second half
    heatmap.b = 0.0;                                    // B: always 0
    // For low alpha (nearly transparent), show slightly darker
    if (volumeResult.alpha < 0.5) {
      heatmap *= 0.5 + 0.5 * volumeResult.alpha;
    }
    return vec4f(heatmap, 1.0);
  }

  // Discard fully transparent pixels
  if (volumeResult.alpha < 0.01) {
    discard;
  }

  // Alpha comes directly from Beer-Lambert integration
  let alpha = volumeResult.alpha;

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  return vec4f(volumeResult.color, alpha);
}
`

/**
 * Configuration for volumetric main block generation.
 */
export interface VolumetricMainBlockConfig {
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
}

/**
 * Generator function for volumetric main block.
 * When useDensityGrid is enabled, uses volumeRaymarchGrid() instead of
 * volumeRaymarch()/volumeRaymarchHQ() for 3-6x performance improvement.
 * @param config
 */
export function generateMainBlockVolumetric(config: VolumetricMainBlockConfig = {}): string {
  const { useDensityGrid = false } = config

  // When density grid is enabled, use the grid-based raymarcher
  // The grid version doesn't need separate HQ path since it's already much faster
  const raymarchCall = useDensityGrid
    ? `volumeResult = volumeRaymarchGrid(ro, rd, tNear, tFar, schroedinger);`
    : `// Use HQ mode if quality requires it OR if dispersion is enabled
  // (dispersion requires per-channel RGB transmittance only available in HQ path)
  if (fastMode && schroedinger.dispersionEnabled == 0u) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
  }`

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Volumetric Mode
// ============================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup: transform to model space
  // This matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

  // Compute ray direction per-pixel from interpolated world position
  // This matches WebGL: worldRayDir = normalize(vPosition - uCameraPosition)
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding sphere
  let tSphere = intersectSphere(ro, rd, BOUND_R);

  // No intersection with bounding volume
  if (tSphere.y < 0.0) {
    discard;
  }

  var tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Volumetric raymarching using functions from integration block
  // Fast mode selection based on quality multiplier
  var volumeResult: VolumeResult;

  // Use quality multiplier < 1.0 as "fast mode" indicator
  let fastMode = quality.qualityMultiplier < 0.75;

  ${raymarchCall}

  // Debug Mode 1: Iteration Heatmap
  // Shows green→yellow→red gradient based on iteration count
  // Green = few iterations (efficient), Red = many iterations (expensive)
  if (quality.debugMode == 1) {
    let maxIter = f32(schroedinger.sampleCount);
    let iterT = f32(volumeResult.iterationCount) / max(maxIter, 1.0);
    // Heatmap: green (low) → yellow (mid) → red (high)
    var heatmap: vec3f;
    heatmap.r = smoothstep(0.0, 0.5, iterT);           // R: ramps up in first half
    heatmap.g = 1.0 - smoothstep(0.5, 1.0, iterT);     // G: stays high, drops in second half
    heatmap.b = 0.0;                                    // B: always 0
    // For low alpha (nearly transparent), show slightly darker
    if (volumeResult.alpha < 0.5) {
      heatmap *= 0.5 + 0.5 * volumeResult.alpha;
    }
    return vec4f(heatmap, 1.0);
  }

  // Discard fully transparent pixels
  if (volumeResult.alpha < 0.01) {
    discard;
  }

  // Alpha comes directly from Beer-Lambert integration
  let alpha = volumeResult.alpha;

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  return vec4f(volumeResult.color, alpha);
}
`
}

/**
 * Configuration for isosurface main block generation.
 */
export interface IsosurfaceMainBlockConfig {
  /** Enable IBL (Image-Based Lighting) */
  ibl?: boolean
}

/**
 * Generator function for isosurface main block.
 * Conditionally includes IBL when enabled.
 * @param config
 */
export function generateMainBlockIsosurface(config: IsosurfaceMainBlockConfig = {}): string {
  const { ibl = false } = config

  // IBL section - only included when feature is enabled
  const iblSection = ibl
    ? `
  // Image-based lighting (IBL)
  {
    let F0_ibl = mix(vec3f(0.04), surfaceColor, material.metallic);
    col += computeIBL(
      n, viewDir, F0_ibl,
      roughness, material.metallic, surfaceColor,
      envMap, envMapSampler, iblUniforms
    );
  }
`
    : ''

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Isosurface Mode
// ============================================
// Note: LIGHT_TYPE_* constants are defined in shared/core/constants.wgsl.ts

// Helper to get light direction
fn getIsosurfaceLightDir(lightIdx: i32, pos: vec3f) -> vec3f {
  let light = lighting.lights[lightIdx];
  let lightType = i32(light.position.w);

  if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    return normalize(-light.direction.xyz);
  } else {
    return normalize(light.position.xyz - pos);
  }
}

// Helper to get light attenuation
fn getIsosurfaceLightAttenuation(lightIdx: i32, distance: f32) -> f32 {
  let light = lighting.lights[lightIdx];
  let lightRange = light.direction.w;
  let decay = light.params.x;

  if (lightRange <= 0.0) {
    return 1.0;
  }

  let normalizedDist = distance / lightRange;
  return max(0.0, 1.0 - pow(normalizedDist, decay));
}

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;

  // Ray setup: transform to model space
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding sphere
  let tSphere = intersectSphere(ro, rd, BOUND_R);
  if (tSphere.y < 0.0) {
    discard;
  }

  let tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Isosurface raymarching
  let animTime = schroedinger.time * schroedinger.timeScale;
  let threshold = schroedinger.isoThreshold;

  // Use quality multiplier to determine step count
  let fastMode = quality.qualityMultiplier < 0.75;
  let maxSteps = select(128, 64, fastMode);
  let stepLen = (tFar - tNear) / f32(maxSteps);
  var t = tNear;
  var hitT: f32 = -1.0;

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  for (var i = 0; i < 128; i++) {
    if (i >= maxSteps) { break; }
    if (t > tFar) { break; }
    iterCount = i + 1;  // Track iteration count

    let pos = ro + rd * t;
    let rho = sampleDensity(pos, animTime, schroedinger);
    let s = sFromRho(rho);

    if (s > threshold) {
      // Binary search refinement
      var tLo = t - stepLen;
      var tHi = t;
      for (var j = 0; j < 5; j++) {
        let tMid = (tLo + tHi) * 0.5;
        let midPos = ro + rd * tMid;
        let midS = sFromRho(sampleDensity(midPos, animTime, schroedinger));
        if (midS > threshold) {
          tHi = tMid;
        } else {
          tLo = tMid;
        }
      }
      hitT = (tLo + tHi) * 0.5;
      break;
    }

    t += stepLen;
  }

  // Debug Mode 1: Iteration Heatmap (isosurface mode)
  // Shows green→yellow→red gradient based on iteration count
  if (quality.debugMode == 1) {
    let maxIter = f32(maxSteps);
    let iterT = f32(iterCount) / max(maxIter, 1.0);
    // Heatmap: green (low) → yellow (mid) → red (high)
    var heatmap: vec3f;
    heatmap.r = smoothstep(0.0, 0.5, iterT);           // R: ramps up in first half
    heatmap.g = 1.0 - smoothstep(0.5, 1.0, iterT);     // G: stays high, drops in second half
    heatmap.b = 0.0;                                    // B: always 0
    // For misses, show slightly darker
    if (hitT < 0.0) {
      heatmap *= 0.7;
    }
    output.color = vec4f(heatmap, 1.0);
    output.normal = vec4f(0.5, 0.5, 1.0, 0.0);  // Default up normal for debug
    return output;
  }

  if (hitT < 0.0) {
    discard;
  }

  // Compute surface point and normal
  let p = ro + rd * hitT;
  let n = normalize(computeGradientTetrahedral(p, animTime, 0.01, schroedinger));

  // Sample for color
  let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
  let rho = densityInfo.x;
  let phase = densityInfo.z;

  // Surface coloring - use material base color with subtle phase modulation
  let baseHSL = rgb2hsl(material.baseColor.rgb);
  let normS = clamp((sFromRho(rho) + 8.0) / 8.0, 0.0, 1.0);
  var surfaceColor: vec3f;

  // Phase influence on hue
  let phaseNorm = (phase + PI) / TAU;
  let hueShift = (phaseNorm - 0.5) * 0.4; // +/- 20% hue shift

  // Use color algorithm 8 (Phase) as default for quantum visualization
  let hue = fract(baseHSL.x + hueShift);
  let lightness = 0.15 + 0.35 * normS;
  let saturation = 0.7 + 0.25 * normS;
  surfaceColor = hsl2rgb(hue, saturation, lightness);

  // Lighting - use shared lighting uniforms
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) *
            lighting.ambientColor * lighting.ambientIntensity;

  let viewDir = -rd;
  let roughness = max(material.roughness, 0.04);

  // Multi-light loop using shared lighting system
  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    let l = getIsosurfaceLightDir(i, p);
    var attenuation = lightIntensity;

    let lightType = i32(light.position.w);
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(light.position.xyz - p);
      attenuation *= getIsosurfaceLightAttenuation(i, distance);
    }

    if (lightType == LIGHT_TYPE_SPOT) {
      let lightToFrag = normalize(p - light.position.xyz);
      let spotDir = normalize(light.direction.xyz);
      let cosAngle = dot(lightToFrag, spotDir);
      let spotCosOuter = light.params.z;
      let spotCosInner = light.params.y;
      let spotAttenuation = smoothstep(spotCosOuter, spotCosInner, cosAngle);
      attenuation *= spotAttenuation;
    }

    if (attenuation < 0.001) { continue; }

    let NdotL = max(dot(n, l), 0.0);

    // GGX Specular (PBR) with energy conservation
    let F0 = mix(vec3f(0.04), surfaceColor, material.metallic);
    let H = normalize(l + viewDir);
    let F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

    // Energy conservation
    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - material.metallic);

    // Diffuse (Lambertian BRDF = albedo/PI)
    col += kD * surfaceColor / PI * light.color.rgb * NdotL * attenuation;

    // Specular
    let specular = computePBRSpecular(n, viewDir, l, roughness, F0);
    col += specular * light.color.rgb * NdotL * attenuation;
  }
${iblSection}
  // Fresnel rim from material uniforms
  if (material.fresnelEnabled != 0u && material.fresnelIntensity > 0.0) {
    let NdotV = max(dot(n, viewDir), 0.0);
    let t = 1.0 - NdotV;
    let rim = t * t * t * material.fresnelIntensity * 2.0;
    col += material.rimColor * rim;
  }

  // Output color and normal for MRT
  output.color = vec4f(col, 1.0);
  // Normal buffer: RGB = world-space normal (encoded 0-1), A = metallic
  output.normal = vec4f(n * 0.5 + 0.5, material.metallic);

  return output;
}
`
}

/**
 * Legacy static export for backward compatibility.
 * @deprecated Use generateMainBlockIsosurface() instead
 */
export const mainBlockIsosurface = generateMainBlockIsosurface()


/**
 * Configuration for temporal volumetric main block generation.
 */
export interface TemporalMainBlockConfig {
  /** Enable Bayer jitter for quarter-res rendering */
  bayerJitter?: boolean
}

/**
 * MRT output struct for temporal volumetric rendering.
 * Outputs color + world position for reprojection.
 */
export const temporalMRTOutputBlock = /* wgsl */ `
// Temporal MRT output for volumetric rendering
struct TemporalFragmentOutput {
  @location(0) color: vec4f,       // RGB color + alpha
  @location(1) worldPosition: vec4f, // XYZ world position + ray distance in W
}
`

/**
 * Generator function for temporal volumetric main block.
 * Outputs MRT with color + world position for temporal accumulation.
 *
 * TEMPORAL ACCUMULATION ARCHITECTURE:
 * - Quarter-res rendering: Render target is 1/4 size (1/2 width × 1/2 height)
 * - Bayer jitter: Each frame samples a different sub-pixel within each 2×2 block
 * - Over 4 frames, all sub-pixels are covered for full resolution reconstruction
 *
 * The Bayer offset cycles: [0,0] → [1,1] → [1,0] → [0,1]
 * Each offset determines which sub-pixel position within the 2×2 block to sample.
 *
 * @param config
 */
export function generateMainBlockTemporal(config: TemporalMainBlockConfig = {}): string {
  const { bayerJitter = true } = config

  // Bayer jitter section - applies sub-pixel offset for quarter-res rendering
  // NOTE: Unlike the incorrect previous implementation that DISCARDED pixels,
  // this correctly JITTERS the ray direction to sample different sub-pixels.
  // ALL quarter-res pixels render - no discard based on Bayer pattern!
  const bayerJitterSection = bayerJitter
    ? `
  // ============================================
  // Temporal Sub-Pixel Jitter
  // ============================================
  // In quarter-res mode, each pixel covers a 2×2 block of full-res pixels.
  // The Bayer offset determines which sub-pixel within the block we sample.
  // Over 4 frames (with cycling offsets), all sub-pixels are covered.
  //
  // NO DISCARD HERE! All quarter-res pixels must render for proper accumulation.
  // The jitter offsets the ray direction to sample different sub-pixel positions.

  // Compute jitter offset from Bayer pattern
  // bayerOffset is in [0,1], convert to [-0.5, 0.5] for symmetric jitter
  let jitterOffset = camera.bayerOffset - vec2f(0.5);

  // Compute view-aligned vectors for applying world-space jitter
  let viewDir = normalize(input.vPosition - camera.cameraPosition);
  let dist = length(input.vPosition - camera.cameraPosition);

  // Compute pixel size at this distance (perspective projection)
  // pixelSize = 2 * dist * tan(fov/2) / resolution
  // Note: camera.fov is in radians
  let pixelSize = 2.0 * dist * tan(camera.fov * 0.5) / camera.resolution.y;

  // View-aligned right and up vectors
  let worldUp = vec3f(0.0, 1.0, 0.0);
  var viewRight = cross(worldUp, viewDir);
  // Handle degenerate case when viewDir is parallel to worldUp
  if (length(viewRight) < 0.001) {
    viewRight = vec3f(1.0, 0.0, 0.0);
  } else {
    viewRight = normalize(viewRight);
  }
  let viewUp = normalize(cross(viewDir, viewRight));

  // Apply sub-pixel offset in world space
  // In quarter-res, each pixel is 2 full-res pixels, so jitter by 2× pixelSize
  let worldOffset = (viewRight * jitterOffset.x + viewUp * jitterOffset.y) * pixelSize * 2.0;
  let jitteredVPosition = input.vPosition + worldOffset;
`
    : ''

  // When jitter is applied, use jitteredVPosition for ray direction
  const rayDirSource = bayerJitter ? 'jitteredVPosition' : 'input.vPosition'

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Temporal Volumetric Mode
// ============================================
// Outputs MRT: color + world position for temporal accumulation
// Uses Bayer jitter for sub-pixel sampling across 4-frame cycles

@fragment
fn fragmentMain(input: VertexOutput) -> TemporalFragmentOutput {
  var output: TemporalFragmentOutput;
${bayerJitterSection}
  // Ray setup: transform to model space
  // This matches WebGL: ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;

  // Compute ray direction per-pixel from interpolated world position
  // In temporal mode, use jittered position for sub-pixel sampling
  // This matches WebGL's approach: screenCoord = floor(fragCoord) * 2 + bayerOffset + 0.5
  let worldRayDir = normalize(${rayDirSource} - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding sphere
  let tSphere = intersectSphere(ro, rd, BOUND_R);

  // No intersection with bounding volume
  if (tSphere.y < 0.0) {
    discard;
  }

  var tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Volumetric raymarching using functions from integration block
  // Fast mode selection based on quality multiplier
  var volumeResult: VolumeResult;

  // Use quality multiplier < 1.0 as "fast mode" indicator
  let fastMode = quality.qualityMultiplier < 0.75;

  // Use HQ mode if quality requires it OR if dispersion is enabled
  // (dispersion requires per-channel RGB transmittance only available in HQ path)
  if (fastMode && schroedinger.dispersionEnabled == 0u) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
  }

  // Debug Mode 1: Iteration Heatmap
  if (quality.debugMode == 1) {
    let maxIter = f32(schroedinger.sampleCount);
    let iterT = f32(volumeResult.iterationCount) / max(maxIter, 1.0);
    var heatmap: vec3f;
    heatmap.r = smoothstep(0.0, 0.5, iterT);
    heatmap.g = 1.0 - smoothstep(0.5, 1.0, iterT);
    heatmap.b = 0.0;
    if (volumeResult.alpha < 0.5) {
      heatmap *= 0.5 + 0.5 * volumeResult.alpha;
    }
    output.color = vec4f(heatmap, 1.0);
    output.worldPosition = vec4f(0.0, 0.0, 0.0, -1.0); // Invalid position for debug
    return output;
  }

  // Discard fully transparent pixels
  if (volumeResult.alpha < 0.01) {
    discard;
  }

  // Alpha comes directly from Beer-Lambert integration
  let alpha = volumeResult.alpha;

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  // Compute hit position for temporal reprojection
  // Use the primary hit distance from volume result
  let hitT = volumeResult.primaryHitT;
  let hitPosModel = ro + rd * hitT;

  // Transform hit position to world space for reprojection
  let hitPosWorld = (camera.modelMatrix * vec4f(hitPosModel, 1.0)).xyz;

  // Output color
  output.color = vec4f(volumeResult.color, alpha);
  
  // Output world position (xyz) and model-space ray distance (w) for reprojection
  // The ray distance in W is used for temporal depth optimization
  output.worldPosition = vec4f(hitPosWorld, hitT);

  return output;
}
`
}

/**
 * Legacy static export for temporal mode.
 */
export const mainBlockTemporal = generateMainBlockTemporal()
