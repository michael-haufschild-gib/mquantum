/**
 * Isosurface Temporal Main Block
 *
 * Extracted from main.wgsl.ts for file-size management.
 * Contains the isosurface rendering main function with temporal accumulation.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainIsosurfaceTemporal.wgsl
 */

/**
 *
 */
export interface IsosurfaceTemporalMainBlockConfig {
  /** Enable Bayer jitter for quarter-res rendering */
  bayerJitter?: boolean
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
}

/**
 * Generator function for isosurface + temporal mode.
 * Combines Bayer sub-pixel jitter from temporal with isosurface marching + PBR lighting.
 * Outputs TemporalFragmentOutput (color + worldPosition) instead of FragmentOutput (color + normal).
 *
 * @param config
 */
export function generateMainBlockIsosurfaceTemporal(
  config: IsosurfaceTemporalMainBlockConfig = {}
): string {
  const { bayerJitter = true, useDensityGrid = false } = config

  // Reuse Bayer jitter from temporal mode
  const bayerJitterSection = bayerJitter
    ? `
  // ============================================
  // Temporal Sub-Pixel Jitter
  // ============================================
  let jitterOffset = camera.bayerOffset - vec2f(0.5);
  let viewDirRaw = normalize(input.vPosition - camera.cameraPosition);
  let dist = length(input.vPosition - camera.cameraPosition);
  let pixelSizeY = 2.0 * dist * tan(camera.fov * 0.5) / camera.resolution.y;
  let pixelSizeX = 2.0 * dist * tan(camera.fov * 0.5) * camera.aspectRatio /
                   camera.resolution.x;
  let cameraRight = normalize(camera.inverseViewMatrix[0].xyz);
  let cameraUp = normalize(camera.inverseViewMatrix[1].xyz);
  let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -
                    cameraUp * (jitterOffset.y * pixelSizeY);
  let jitteredVPosition = input.vPosition + worldOffset;
`
    : ''

  const rayDirSource = bayerJitter ? 'jitteredVPosition' : 'input.vPosition'

  // Density grid sampling helpers (same as non-temporal isosurface)
  const densitySample = useDensityGrid
    ? `if (USE_DENSITY_GRID) {
      rho = sampleDensityFromGrid(pos, schroedinger).r;
      if (FEATURE_UNCERTAINTY_BOUNDARY) { rho = applyUncertaintyBoundaryEmphasis(rho, sFromRho(rho), schroedinger); }
      rho *= isoGain;
    } else {
      rho = sampleDensity(pos, animTime, schroedinger) * isoGain;
    }`
    : `rho = sampleDensity(pos, animTime, schroedinger) * isoGain;`

  const seedSample = useDensityGrid
    ? `var seedRho: f32;
  if (USE_DENSITY_GRID) {
    seedRho = sampleDensityFromGrid(ro + rd * tNear, schroedinger).r;
    if (FEATURE_UNCERTAINTY_BOUNDARY) { seedRho = applyUncertaintyBoundaryEmphasis(seedRho, sFromRho(seedRho), schroedinger); }
    seedRho *= isoGain;
  } else {
    seedRho = sampleDensity(ro + rd * tNear, animTime, schroedinger) * isoGain;
  }
  var prevS = sFromRho(seedRho);`
    : `var prevS = sFromRho(sampleDensity(ro + rd * tNear, animTime, schroedinger) * isoGain);`

  const binarySearchSample = useDensityGrid
    ? `var midRho: f32;
        if (USE_DENSITY_GRID) {
          midRho = sampleDensityFromGrid(midPos, schroedinger).r;
          if (FEATURE_UNCERTAINTY_BOUNDARY) { midRho = applyUncertaintyBoundaryEmphasis(midRho, sFromRho(midRho), schroedinger); }
          midRho *= isoGain;
        } else {
          midRho = sampleDensity(midPos, animTime, schroedinger) * isoGain;
        }
        let midS = sFromRho(midRho);`
    : `let midS = sFromRho(sampleDensity(midPos, animTime, schroedinger) * isoGain);`

  const gradientCompute = useDensityGrid
    ? `if (USE_DENSITY_GRID) {
    rawGrad = computeGradientFromGrid(p, schroedinger);
  } else if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`
    : `if (USE_ANALYTICAL_GRADIENT) {
    rawGrad = computeAnalyticalGradient(p, animTime, schroedinger);
  } else {
    rawGrad = computeGradientTetrahedral(p, animTime, schroedinger.boundingRadius * 0.005, schroedinger);
  }`

  const colorSample = useDensityGrid
    ? `var rhoSurface: f32;
  var phase: f32;
  if (USE_DENSITY_GRID && DENSITY_GRID_HAS_PHASE) {
    let gridColor = sampleDensityFromGrid(p, schroedinger);
    rhoSurface = gridColor.r * isoGain;
    phase = select(gridColor.b, gridColor.a, COLOR_ALGORITHM == 10);
  } else {
    let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
    rhoSurface = densityInfo.x * isoGain;
    phase = densityInfo.z;
  }`
    : `let densityInfo = sampleDensityWithPhase(p, animTime, schroedinger);
  let rhoSurface = densityInfo.x * isoGain;
  let phase = densityInfo.z;`

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Isosurface Temporal Mode
// ============================================
// Combines isosurface marching + PBR lighting with temporal reprojection.
// Outputs MRT: color + world position (no normal buffer in temporal mode).

// Helper to get light direction (same as non-temporal isosurface)
fn getIsosurfaceLightDir(lightIdx: i32, pos: vec3f) -> vec3f {
  let light = lighting.lights[lightIdx];
  let lightType = i32(light.position.w);

  if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    return normalize(-light.direction.xyz);
  } else {
    return normalize(light.position.xyz - pos);
  }
}

// Helper to get light attenuation (physically-based inverse-range falloff)
fn getIsosurfaceLightAttenuation(lightIdx: i32, distance: f32) -> f32 {
  let light = lighting.lights[lightIdx];
  let lightRange = light.direction.w;
  let decay = light.params.x;

  if (lightRange <= 0.0) {
    return 1.0;
  }

  let d = max(distance, EPS_DIVISION);
  let rangeAttenuation = clamp(1.0 - d / lightRange, 0.0, 1.0);
  return pow(rangeAttenuation, decay);
}

@fragment
fn fragmentMain(input: VertexOutput) -> TemporalFragmentOutput {
  var output: TemporalFragmentOutput;
${bayerJitterSection}
  // Ray setup: transform to model space
  let ro = (camera.inverseModelMatrix * vec4f(camera.cameraPosition, 1.0)).xyz;
  let worldRayDir = normalize(${rayDirSource} - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Intersect with bounding volume (box for free scalar field, sphere otherwise)
  var tSphere: vec2f;
  if (IS_FREE_SCALAR) {
    tSphere = intersectBox(ro, rd, schroedinger.boundingRadius);
  } else {
    tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);
  }
  if (tSphere.y < 0.0) {
    discard;
  }

  let tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // Isosurface raymarching
  let animTime = schroedinger.time * schroedinger.timeScale;
  let threshold = schroedinger.isoThreshold;
  let isoGain = max(schroedinger.densityGain, 0.01);

  let fastMode = quality.qualityMultiplier < 0.75;
  let maxSteps = select(128, 64, fastMode);
  let stepLen = (tFar - tNear) / f32(maxSteps);
  var t = tNear;
  var hitT: f32 = -1.0;
  var iterCount: i32 = 0;

  let stMinStep = stepLen * 0.1;
  let stDsDtFloor: f32 = 0.5;
  let stConvergeEps: f32 = 0.05;

  // Seed directional derivative
  ${seedSample}
  var prevT = tNear;
  t = tNear + stMinStep;

  for (var i = 0; i < 128; i++) {
    if (i >= maxSteps) { break; }
    if (t > tFar) { break; }
    iterCount = i + 1;

    let pos = ro + rd * t;
    var rho: f32;
    ${densitySample}
    let s = sFromRho(rho);
    let gap = s - threshold;

    if (gap > 0.0) {
      var tLo = prevT;
      var tHi = t;
      for (var j = 0; j < 5; j++) {
        let tMid = (tLo + tHi) * 0.5;
        let midPos = ro + rd * tMid;
        ${binarySearchSample}
        if (midS > threshold) {
          tHi = tMid;
        } else {
          tLo = tMid;
        }
      }
      hitT = (tLo + tHi) * 0.5;
      break;
    }

    if (gap > -stConvergeEps) {
      hitT = t;
      break;
    }

    let dt = t - prevT;
    let dsDt = (s - prevS) / max(dt, 1e-6);
    let stStep = clamp(abs(gap) / max(abs(dsDt), stDsDtFloor), stMinStep, stepLen);

    prevS = s;
    prevT = t;
    t += stStep;
  }

  let crossSection = evaluateCrossSectionSample(ro, rd, tNear, tFar, animTime, schroedinger);
  let sliceOnlyCrossSection =
    schroedinger.crossSectionEnabled != 0u &&
    schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY;

  // Potential overlay: accumulate up to hit point (or full ray if no hit).
  // Only for compute modes (IS_FREE_SCALAR) where alpha encodes |V|/Vmax.
  // Pauli spinor: alpha is total density — skip potential overlay.
  let potEndT = select(tFar, hitT, hitT >= 0.0);
  var potAccColor = vec3f(0.0);
  var potAccAlpha: f32 = 0.0;
  if (IS_FREE_SCALAR && !IS_PAULI && USE_DENSITY_GRID && DENSITY_GRID_HAS_PHASE) {
    let potStepLen = stepLen * 0.5;
    var potT = tNear;
    var potTransmittance: f32 = 1.0;
    for (var pi = 0; pi < 128; pi++) {
      if (potT > potEndT || potTransmittance < 0.05) { break; }
      let potPos = ro + rd * potT;
      let potSample = sampleDensityFromGrid(potPos, schroedinger);
      if (potSample.a > 0.01) {
        let potColor = vec3f(0.35, 0.45, 0.55);
        let potOpacity = clamp(potSample.a * 0.5, 0.0, 0.7);
        potAccColor += potTransmittance * potOpacity * potColor;
        potTransmittance *= (1.0 - potOpacity);
      }
      potT += potStepLen;
    }
    potAccAlpha = 1.0 - potTransmittance;
  }

  if (hitT < 0.0) {
    if (potAccAlpha > 0.01) {
      let potHitPosWorld = (camera.modelMatrix * vec4f(ro + rd * ((tNear + tFar) * 0.5), 1.0)).xyz;
      output.color = vec4f(potAccColor, potAccAlpha);
      output.worldPosition = vec4f(potHitPosWorld, (tNear + tFar) * 0.5);
      return output;
    }
    if (sliceOnlyCrossSection && crossSection.alpha > 0.0) {
      // Cross-section only: output cross-section color with world position
      let crossHitPos = ro + rd * ((tNear + tFar) * 0.5);
      let crossHitPosWorld = (camera.modelMatrix * vec4f(crossHitPos, 1.0)).xyz;
      output.color = vec4f(crossSection.color, crossSection.alpha);
      output.worldPosition = vec4f(crossHitPosWorld, (tNear + tFar) * 0.5);
      return output;
    }
    discard;
  }

  // Compute surface point and normal
  let p = ro + rd * hitT;
  var rawGrad: vec3f;
  ${gradientCompute}
  let gradMag = length(rawGrad);
  let n = -rawGrad / max(gradMag, 1e-6);

  // Sample for color
  ${colorSample}

  let sSurface = sFromRho(rhoSurface);
  var surfaceColor = computeBaseColor(rhoSurface, sSurface, phase, p, schroedinger);

  // Phase materiality
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

  // Interference fringing
  if (FEATURE_INTERFERENCE && schroedinger.interferenceEnabled != 0u && schroedinger.interferenceAmp > 0.0) {
    let iTime = schroedinger.time * schroedinger.interferenceSpeed;
    let fringe = 1.0 + schroedinger.interferenceAmp * sin(phase * schroedinger.interferenceFreq + iTime);
    surfaceColor *= max(fringe, 0.0);
  }

  // Uncertainty boundary
  if (FEATURE_UNCERTAINTY_BOUNDARY && schroedinger.uncertaintyBoundaryEnabled != 0u && schroedinger.uncertaintyBoundaryStrength > 0.0) {
    let ubWidth = max(schroedinger.uncertaintyBoundaryWidth, 1e-3);
    let logRhoDelta = abs(sSurface - schroedinger.uncertaintyLogRhoThreshold);
    let spatialDist = logRhoDelta / max(gradMag, 1e-6);
    let ubBand = exp(-0.5 * (spatialDist / ubWidth) * (spatialDist / ubWidth));
    let ubGlow = ubBand * schroedinger.uncertaintyBoundaryStrength;
    surfaceColor = mix(surfaceColor, surfaceColor * 2.0 + vec3f(0.1, 0.08, 0.15), ubGlow);
  }

  // Lighting
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) *
            lighting.ambientColor * lighting.ambientIntensity;

  let viewDir = -rd;
  let roughness = max(material.roughness, 0.04);

  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
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

    // Filament convention: F0 = 0.16 * reflectance^2 for dielectrics (0.5 → 0.04)
    let dielectricF0_iso = 0.16 * material.reflectance * material.reflectance;
    let F0 = mix(vec3f(dielectricF0_iso), surfaceColor, material.metallic);
    let halfSum = l + viewDir;
    let halfLen = length(halfSum);
    var H: vec3f;
    if (halfLen > EPS_DIVISION) {
      H = halfSum / halfLen;
    } else {
      H = n;
    }
    let F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - material.metallic);

    col += kD * surfaceColor / PI * light.color.rgb * NdotL * attenuation;

    let specular = computePBRSpecular(n, viewDir, l, roughness, F0);
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

  // Nodal overlay
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

  // Probability current overlay
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

  // Blend potential overlay OVER the isosurface (front-to-back: potential is closer)
  if (potAccAlpha > 0.01) {
    finalColor = potAccColor + (1.0 - potAccAlpha) * finalColor;
    finalAlpha = potAccAlpha + (1.0 - potAccAlpha) * finalAlpha;
  }

  if (crossSection.alpha > 0.0) {
    if (schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY) {
      finalColor = crossSection.color;
      finalAlpha = crossSection.alpha;
    } else {
      let crossSectionAlpha = clamp(crossSection.alpha, 0.0, 1.0);
      finalColor = mix(finalColor, crossSection.color, crossSectionAlpha);
      finalAlpha = max(finalAlpha, crossSectionAlpha);
    }
  } else if (sliceOnlyCrossSection) {
    discard;
  }

  // Compute world-space hit position for temporal reprojection
  let hitPosWorld = (camera.modelMatrix * vec4f(p, 1.0)).xyz;

  output.color = vec4f(finalColor, finalAlpha);
  output.worldPosition = vec4f(hitPosWorld, hitT);

  return output;
}
`
}

/**
 * Configuration for temporal volumetric main block generation.
 */
