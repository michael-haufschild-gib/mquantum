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
  let tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);

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
  if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
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

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;

  // True nodal-surface ray-hit mode: trace f=0 directly and composite as a crisp surface.
  if (
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE
  ) {
    let animTime = getVolumeTime(schroedinger);
    let surfaceStrengthT = clamp(schroedinger.nodalStrength * 0.5, 0.0, 1.0);
    let localSpan = max(
      (tFar - tNear) * mix(0.14, 0.26, surfaceStrengthT),
      mix(0.16, 0.36, surfaceStrengthT)
    );
    let localNear = max(tNear, volumeResult.primaryHitT - localSpan);
    let localFar = min(tFar, volumeResult.primaryHitT + localSpan);
    let nodalHit = findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger);
    if (nodalHit.hitMask > 0.0) {
      let nodalColor = selectPhysicalNodalColor(
        schroedinger,
        nodalHit.colorMode,
        nodalHit.signValue
      );
      let facing = max(dot(nodalHit.normal, -rd), 0.0);
      let surfaceLight = 0.35 + 0.65 * facing;
      let overlayColor = nodalColor * surfaceLight;
      let overlayAlpha = clamp(
        (0.45 + 0.55 * nodalHit.hitMask) * schroedinger.nodalStrength,
        0.0,
        0.95
      );
      finalColor = mix(finalColor, overlayColor, overlayAlpha);
      finalAlpha = max(finalAlpha, overlayAlpha);
    }
  }

  let crossSection = evaluateCrossSectionSample(
    ro,
    rd,
    tNear,
    tFar,
    getVolumeTime(schroedinger),
    schroedinger
  );
  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
    }
  } else if (
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY
  ) {
    discard;
  }

  // Discard fully transparent pixels
  if (finalAlpha < 0.01) {
    discard;
  }

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  return vec4f(finalColor, finalAlpha);
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
 * Selects between volumeRaymarch() (fast) and volumeRaymarchHQ() (dispersion-capable).
 * @param config
 */
export function generateMainBlockVolumetric(config: VolumetricMainBlockConfig = {}): string {
  const { useDensityGrid = false } = config

  // When density grid is enabled, use the grid-based raymarcher
  // with automatic fallback when features require direct wavefunction sampling.
  const raymarchCall = useDensityGrid
    ? `let phaseDependentMode =
    schroedinger.colorAlgorithm == 8 ||
    schroedinger.colorAlgorithm == 9 ||
    (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) ||
    (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u);

  let probabilityCurrentVolumeMode =
    schroedinger.probabilityCurrentEnabled != 0u &&
    (
      schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_VOLUME ||
      (
        schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_ISOSURFACE &&
        schroedinger.isoEnabled == 0u
      )
    );

  let requiresDirectSampling =
    (FEATURE_DISPERSION && schroedinger.dispersionEnabled != 0u) ||
    (phaseDependentMode && !DENSITY_GRID_HAS_PHASE) ||
    probabilityCurrentVolumeMode;

  if (requiresDirectSampling) {
    if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
      volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
    } else {
      volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
    }
  } else {
    volumeResult = volumeRaymarchGrid(ro, rd, tNear, tFar, schroedinger);
  }`
    : `// Use HQ mode if quality requires it OR if dispersion is enabled
  // (dispersion requires per-channel RGB transmittance only available in HQ path)
  if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
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
  let tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);

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

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;

  // True nodal-surface ray-hit mode: trace f=0 directly and composite as a crisp surface.
  if (
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0 &&
    schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE
  ) {
    let animTime = getVolumeTime(schroedinger);
    let surfaceStrengthT = clamp(schroedinger.nodalStrength * 0.5, 0.0, 1.0);
    let localSpan = max(
      (tFar - tNear) * mix(0.14, 0.26, surfaceStrengthT),
      mix(0.16, 0.36, surfaceStrengthT)
    );
    let localNear = max(tNear, volumeResult.primaryHitT - localSpan);
    let localFar = min(tFar, volumeResult.primaryHitT + localSpan);
    let nodalHit = findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger);
    if (nodalHit.hitMask > 0.0) {
      let nodalColor = selectPhysicalNodalColor(
        schroedinger,
        nodalHit.colorMode,
        nodalHit.signValue
      );
      let facing = max(dot(nodalHit.normal, -rd), 0.0);
      let surfaceLight = 0.35 + 0.65 * facing;
      let overlayColor = nodalColor * surfaceLight;
      let overlayAlpha = clamp(
        (0.45 + 0.55 * nodalHit.hitMask) * schroedinger.nodalStrength,
        0.0,
        0.95
      );
      finalColor = mix(finalColor, overlayColor, overlayAlpha);
      finalAlpha = max(finalAlpha, overlayAlpha);
    }
  }

  let crossSection = evaluateCrossSectionSample(
    ro,
    rd,
    tNear,
    tFar,
    getVolumeTime(schroedinger),
    schroedinger
  );
  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
    }
  } else if (
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY
  ) {
    discard;
  }

  // Discard fully transparent pixels
  if (finalAlpha < 0.01) {
    discard;
  }

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  return vec4f(finalColor, finalAlpha);
}
`
}

/**
 * Generator function for isosurface main block.
 */
export function generateMainBlockIsosurface(): string {
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
  let tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);
  if (tSphere.y < 0.0) {
    discard;
  }

  let tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Isosurface raymarching
  let animTime = schroedinger.time * schroedinger.timeScale;
  let threshold = schroedinger.isoThreshold;
  // densityGain includes canonical normalization compensation, so the
  // log-density threshold operates on the same scale as volumetric rendering.
  let isoGain = max(schroedinger.densityGain, 0.01);

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
    let rho = sampleDensity(pos, animTime, schroedinger) * isoGain;
    let s = sFromRho(rho);

    if (s > threshold) {
      // Binary search refinement
      var tLo = t - stepLen;
      var tHi = t;
      for (var j = 0; j < 5; j++) {
        let tMid = (tLo + tHi) * 0.5;
        let midPos = ro + rd * tMid;
        let midS = sFromRho(sampleDensity(midPos, animTime, schroedinger) * isoGain);
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

  let crossSection = evaluateCrossSectionSample(ro, rd, tNear, tFar, animTime, schroedinger);
  let sliceOnlyCrossSection =
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY;

  if (hitT < 0.0) {
    if (sliceOnlyCrossSection && crossSection.alpha > 0.0) {
      let planeNormal = normalize(schroedinger.crossSectionPlane.xyz);
      output.color = vec4f(crossSection.color, crossSection.alpha);
      output.normal = vec4f(planeNormal * 0.5 + 0.5, material.metallic);
      return output;
    }
    discard;
  }

  // Compute surface point and normal (preserve gradient magnitude for uncertainty)
  let p = ro + rd * hitT;
  var rawGrad: vec3f;
  if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, 0.01, schroedinger);
  }
  let gradMag = length(rawGrad);
  let n = rawGrad / max(gradMag, 1e-6);

  // Sample for color
  let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
  let rhoSurface = densityInfo.x * isoGain;
  let phase = densityInfo.z;

  // Surface coloring via full color algorithm system
  let sSurface = sFromRho(rhoSurface);
  var surfaceColor = computeBaseColor(rhoSurface, sSurface, phase, p, schroedinger);

  // Phase materiality: matter (plasma) vs anti-matter (smoke)
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    let phaseMod = fract((phase + PI) / TAU);
    let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
    let smokeWeight = 1.0 - plasmaWeight;
    let pmStr = schroedinger.phaseMaterialityStrength;
    let normalizedRho = clamp((sSurface + 8.0) / 8.0, 0.0, 1.0);
    let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
    let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(surfaceColor), 0.1);
    surfaceColor = mix(surfaceColor,
      plasmaColor * plasmaWeight + smokeColor * smokeWeight,
      pmStr);
  }

  // Interference fringing: modulate surface brightness by phase-band pattern
  if (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u && schroedinger.interferenceAmp > 0.0) {
    let iTime = schroedinger.time * schroedinger.interferenceSpeed;
    let fringe = 1.0 + schroedinger.interferenceAmp * sin(phase * schroedinger.interferenceFreq + iTime);
    surfaceColor *= max(fringe, 0.0);
  }

  // Uncertainty boundary: highlight proximity to the confidence iso-probability surface
  // Estimates spatial distance from this surface point to the confidence contour:
  //   spatialDist ≈ |log(ρ_surface) - log(ρ_confidence)| / |∇log(ρ)|
  // Small distance → this part of the isosurface is near the confidence boundary → glow
  if (schroedinger.uncertaintyBoundaryEnabled != 0u && schroedinger.uncertaintyBoundaryStrength > 0.0) {
    let ubWidth = max(schroedinger.uncertaintyBoundaryWidth, 1e-3);
    let logRhoDelta = abs(sSurface - schroedinger.uncertaintyLogRhoThreshold);
    let spatialDist = logRhoDelta / max(gradMag, 1e-6);
    let ubBand = exp(-0.5 * (spatialDist / ubWidth) * (spatialDist / ubWidth));
    let ubGlow = ubBand * schroedinger.uncertaintyBoundaryStrength;
    surfaceColor = mix(surfaceColor, surfaceColor * 2.0 + vec3f(0.1, 0.08, 0.15), ubGlow);
  }

  // Chromatic dispersion: per-channel color separation at surface
  // Stronger at glancing angles (Fresnel-like chromatic aberration)
  if (FEATURE_DISPERSION && schroedinger.dispersionEnabled != 0u && schroedinger.dispersionStrength > 0.0) {
    let NdotV = max(dot(n, -rd), 0.0);
    let fresnelEdge = pow(1.0 - NdotV, 3.0);
    let dispScale = schroedinger.dispersionStrength * schroedinger.boundingRadius * 0.08;
    let dispAmount = dispScale * (0.3 + 0.7 * fresnelEdge);
    var dispDir: vec3f;
    if (schroedinger.dispersionDirection == 1) {
      // View-aligned
      var up = vec3f(0.0, 1.0, 0.0);
      if (abs(rd.y) > 0.999) { up = vec3f(1.0, 0.0, 0.0); }
      dispDir = normalize(cross(rd, up));
    } else {
      // Radial
      dispDir = normalize(p);
    }
    let pR = p + dispDir * dispAmount;
    let pB = p - dispDir * dispAmount;
    let infoR = sampleDensityWithPhase(pR, animTime, schroedinger);
    let infoB = sampleDensityWithPhase(pB, animTime, schroedinger);
    let rhoR = infoR.x * isoGain;
    let rhoB = infoB.x * isoGain;
    let colorR = computeBaseColor(rhoR, sFromRho(rhoR), infoR.z, pR, schroedinger);
    let colorB = computeBaseColor(rhoB, sFromRho(rhoB), infoB.z, pB, schroedinger);
    surfaceColor = vec3f(colorR.r, surfaceColor.g, colorB.b);
  }

  // Lighting - use shared lighting uniforms
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) *
            lighting.ambientColor * lighting.ambientIntensity;

  let viewDir = -rd;
  let roughness = max(material.roughness, 0.04);

  // Multi-light loop using shared lighting system
  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    // Enabled flag packed in params.w (0 or 1)
    if (light.params.w < 0.5) { continue; }
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
    // Specular tint + intensity (matches WebGL uSpecularColor/uSpecularIntensity)
    col += specular * material.specularColor * light.color.rgb * NdotL * material.specularIntensity * attenuation;
  }

  // HDR Emission Glow
  if (schroedinger.emissionIntensity > 0.0) {
    let emNorm = clamp((sSurface + 8.0) / 8.0, 0.0, 1.0);
    if (emNorm > schroedinger.emissionThreshold) {
      var emFactor = (emNorm - schroedinger.emissionThreshold) / (1.0 - schroedinger.emissionThreshold);
      emFactor = emFactor * emFactor;
      var emColor = surfaceColor;
      if (abs(schroedinger.emissionColorShift) > 0.01) {
        var emHSL = rgb2hsl(emColor);
        if (schroedinger.emissionColorShift > 0.0) {
          emHSL.x = mix(emHSL.x, 0.08, schroedinger.emissionColorShift * 0.5);
          emHSL.y = mix(emHSL.y, 1.0, schroedinger.emissionColorShift * 0.3);
        } else {
          emHSL.x = mix(emHSL.x, 0.6, -schroedinger.emissionColorShift * 0.5);
          emHSL.z = mix(emHSL.z, 0.9, -schroedinger.emissionColorShift * 0.3);
        }
        emColor = hsl2rgb(emHSL.x, emHSL.y, emHSL.z);
      }
      col += emColor * schroedinger.emissionIntensity * emFactor;
    }
  }

  // Iso-mode nodal consistency: band overlay + local ray-hit surface overlay.
  if (
    FEATURE_NODAL &&
    schroedinger.nodalEnabled != 0u &&
    schroedinger.nodalStrength > 0.0
  ) {
    if (schroedinger.nodalRenderMode == NODAL_RENDER_MODE_BAND) {
      let nodal = computePhysicalNodalField(p, animTime, schroedinger);
      let nodalIntensity = nodal.intensity * nodal.envelopeWeight;
      if (nodalIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(schroedinger, nodal.colorMode, nodal.signValue);
        let nodalMix = clamp(nodalIntensity * schroedinger.nodalStrength, 0.0, 0.85);
        col = mix(col, nodalColor, nodalMix);
      }
    } else if (schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE) {
      let surfaceStrengthT = clamp(schroedinger.nodalStrength * 0.5, 0.0, 1.0);
      let localSpan = stepLen * mix(3.0, 8.0, surfaceStrengthT);
      let localNear = max(tNear, hitT - localSpan);
      let localFar = min(tFar, hitT + localSpan);
      let nodalHit = findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger);
      if (nodalHit.hitMask > 0.0) {
        let nodalColor = selectPhysicalNodalColor(
          schroedinger,
          nodalHit.colorMode,
          nodalHit.signValue
        );
        let nodalFacing = max(dot(nodalHit.normal, -rd), 0.0);
        let nodalLight = 0.35 + 0.65 * nodalFacing;
        let nodalMix = clamp(
          (0.55 + 0.45 * nodalHit.hitMask) * schroedinger.nodalStrength,
          0.0,
          0.9
        );
        col = mix(col, nodalColor * nodalLight, nodalMix);
      }
    }
  }

  if (schroedinger.probabilityCurrentEnabled != 0u && schroedinger.probabilityCurrentScale > 0.0) {
    let currentSample = sampleProbabilityCurrent(p, animTime, schroedinger);
    let currentOverlay = computeProbabilityCurrentOverlay(
      p,
      currentSample,
      rhoSurface,
      n,
      viewDir,
      schroedinger
    );
    if (currentOverlay.a > 1e-5) {
      col = mix(col, currentOverlay.rgb, currentOverlay.a);
    }
  }

  var finalColor = col;
  var finalAlpha = 1.0;
  var finalNormal = n;

  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
      finalNormal = normalize(schroedinger.crossSectionPlane.xyz);
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
    }
  } else if (sliceOnlyCrossSection) {
    discard;
  }

  // Output color and normal for MRT
  output.color = vec4f(finalColor, finalAlpha);
  // Normal buffer: RGB = world-space normal (encoded 0-1), A = metallic
  output.normal = vec4f(finalNormal * 0.5 + 0.5, material.metallic);

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
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
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
  const { bayerJitter = true, useDensityGrid = false } = config

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

  // Compute per-pixel view direction and distance
  let viewDir = normalize(input.vPosition - camera.cameraPosition);
  let dist = length(input.vPosition - camera.cameraPosition);

  // Compute world-space pixel sizes at this depth (perspective projection)
  // Note: camera.fov is in radians.
  let pixelSizeY = 2.0 * dist * tan(camera.fov * 0.5) / camera.resolution.y;
  let pixelSizeX = 2.0 * dist * tan(camera.fov * 0.5) * camera.aspectRatio /
                   camera.resolution.x;

  // Use camera basis vectors (stable screen-space axes) for jitter.
  // This avoids per-pixel basis flips that can cause visible seam artifacts.
  let cameraRight = normalize(camera.inverseViewMatrix[0].xyz);
  let cameraUp = normalize(camera.inverseViewMatrix[1].xyz);

  // Apply sub-pixel offset in world space.
  // jitterOffset is in full-pixel units [-0.5, 0.5].
  // NOTE: Screen-space Y grows downward (texture coordinates), while cameraUp
  // points upward in world space, so Y must be inverted to match reconstruction.
  let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -
                    cameraUp * (jitterOffset.y * pixelSizeY);
  let jitteredVPosition = input.vPosition + worldOffset;
`
    : ''

  // When jitter is applied, use jitteredVPosition for ray direction
  const rayDirSource = bayerJitter ? 'jitteredVPosition' : 'input.vPosition'

  const raymarchCall = useDensityGrid
    ? `let phaseDependentMode =
    schroedinger.colorAlgorithm == 8 ||
    schroedinger.colorAlgorithm == 9 ||
    (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) ||
    (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u);

  let probabilityCurrentVolumeMode =
    schroedinger.probabilityCurrentEnabled != 0u &&
    (
      schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_VOLUME ||
      (
        schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_ISOSURFACE &&
        schroedinger.isoEnabled == 0u
      )
    );

  let requiresDirectSampling =
    (FEATURE_DISPERSION && schroedinger.dispersionEnabled != 0u) ||
    (phaseDependentMode && !DENSITY_GRID_HAS_PHASE) ||
    probabilityCurrentVolumeMode;

  if (requiresDirectSampling) {
    if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
      volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
    } else {
      volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
    }
  } else {
    volumeResult = volumeRaymarchGrid(ro, rd, tNear, tFar, schroedinger);
    // Safety fallback: if grid path yields a fully transparent sample,
    // re-evaluate with direct sampling to avoid blank frames.
    // This can happen when the density grid hasn't been populated yet
    // or when coordinate mapping produces out-of-range lookups.
    if (volumeResult.alpha < 0.01) {
      if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
        volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
      } else {
        volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
      }
    }
  }`
    : `// Use HQ mode if quality requires it OR if dispersion is enabled
  // (dispersion requires per-channel RGB transmittance only available in HQ path)
  if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
    volumeResult = volumeRaymarch(ro, rd, tNear, tFar, schroedinger);
  } else {
    volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar, schroedinger);
  }`

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
  let tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);

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

  let crossSection = evaluateCrossSectionSample(
    ro,
    rd,
    tNear,
    tFar,
    getVolumeTime(schroedinger),
    schroedinger
  );

  var finalColor = volumeResult.color;
  var finalAlpha = volumeResult.alpha;
  var hitT = volumeResult.primaryHitT;

  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
      hitT = crossSection.hitT;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
      if (hitT < 0.0) {
        hitT = crossSection.hitT;
      }
    }
  } else if (
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY
  ) {
    discard;
  }

  // Discard fully transparent pixels
  if (finalAlpha < 0.01) {
    discard;
  }

  // Note: Powder effect is applied inside computeEmissionLit() in emission.wgsl.ts
  // matching WebGL behavior (inside light loop, not post-process)

  // Compute hit position for temporal reprojection
  if (hitT < 0.0) {
    hitT = (tNear + tFar) * 0.5;
  }
  let hitPosModel = ro + rd * hitT;

  // Transform hit position to world space for reprojection
  let hitPosWorld = (camera.modelMatrix * vec4f(hitPosModel, 1.0)).xyz;

  // Output color
  output.color = vec4f(finalColor, finalAlpha);
  
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
