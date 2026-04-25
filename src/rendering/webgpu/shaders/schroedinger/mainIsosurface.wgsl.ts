/**
 * Isosurface Main Block
 *
 * Extracted from main.wgsl.ts for file-size management.
 * Contains the isosurface rendering main function without temporal accumulation.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainIsosurface.wgsl
 */

import {
  generateBinarySearchSample,
  generateColorSample,
  generateDensitySample,
  generateGradientCompute,
  generateSeedSample,
} from './isosurfaceSampling'

/**
 *
 */
export interface IsosurfaceMainBlockConfig {
  /** Use pre-computed density grid for faster raymarching */
  useDensityGrid?: boolean
}

/** Generates the isosurface ray-marching main block with optional density grid sampling. */
export function generateMainBlockIsosurface(config: IsosurfaceMainBlockConfig = {}): string {
  const { useDensityGrid = false } = config

  const densitySample = generateDensitySample(useDensityGrid)
  const seedSample = generateSeedSample(useDensityGrid)
  const binarySearchSample = generateBinarySearchSample(useDensityGrid)
  const gradientCompute = generateGradientCompute(useDensityGrid)
  const colorSample = generateColorSample(useDensityGrid)

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Isosurface Mode
// ============================================
// Light helpers: getEmissionLightDir, getEmissionLightAttenuation
// from emissionLit.wgsl.ts (included via emissionPostBlock)

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;

  // Ray setup: transform to model space
  // PERF: cameraPositionModel is CPU-precomputed as inverseModelMatrix * (cameraPosition, 1).
  let ro = camera.cameraPositionModel;
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
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

  // Adaptive ray march: step size = |gap| / |ds/dt| along ray direction.
  // Uses cheap sampleDensity per step (same cost as fixed-step march),
  // with directional derivative estimated from consecutive samples.
  // Converges faster near surfaces by taking smaller, precise steps;
  // takes full stepLen steps in empty space (same as fixed-step).
  let stMinStep = stepLen * 0.1;    // Floor: prevent stalling
  let stDsDtFloor: f32 = 0.5;      // ds/dt floor: prevent huge steps when derivative ≈ 0
  let stConvergeEps: f32 = 0.05;   // Convergence: accept hit when gap < this

  // Seed directional derivative with sample at ray entry
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

    // Crossed threshold → binary search refinement
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

    // Converged close enough to surface → accept hit
    if (gap > -stConvergeEps) {
      hitT = t;
      break;
    }

    // Directional derivative along ray: ds/dt from consecutive samples
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

  // Potential overlay: accumulate V(x) along the ray up to the isosurface hit
  // (or the full ray if no hit). Renders as a solid wall in front of the wavefunction.
  // Only for compute modes (IS_FREE_SCALAR) where alpha encodes |V|/Vmax.
  // For HO/hydrogen, alpha is relativePhase — must NOT be rendered as potential.
  // For Pauli spinor, alpha is total density — must NOT be rendered as potential.
  let potEnd = select(tFar, hitT, hitT >= 0.0);
  var potAccColor = vec3f(0.0);
  var potAccAlpha: f32 = 0.0;
  if (IS_FREE_SCALAR && !IS_PAULI && USE_DENSITY_GRID && DENSITY_GRID_HAS_PHASE) {
    let potStepLen = stepLen * 0.5;
    var potT = tNear;
    var potTransmittance: f32 = 1.0;
    for (var pi = 0; pi < 128; pi++) {
      if (potT > potEnd || potTransmittance < 0.05) { break; }
      let potPos = ro + rd * potT;
      let potSample = sampleDensityFromGrid(potPos, schroedinger);
      if (potSample.a < -0.01) {
        let potColor = vec3f(0.35, 0.45, 0.55);
        let potIntensity = abs(potSample.a);
        let potOpacity = clamp(potIntensity * 0.04, 0.0, 0.15);
        potAccColor += potTransmittance * potOpacity * potColor;
        potTransmittance *= (1.0 - potOpacity);
      }
      potT += potStepLen;
    }
    potAccAlpha = 1.0 - potTransmittance;
  }

  if (hitT < 0.0) {
    // No isosurface hit — show potential overlay if present
    if (potAccAlpha > 0.01) {
      output.color = vec4f(potAccColor, potAccAlpha);
      return output;
    }
    if (sliceOnlyCrossSection && crossSection.alpha > 0.0) {
      output.color = vec4f(crossSection.color, crossSection.alpha);
      return output;
    }
    discard;
  }

  // Compute surface point and normal (preserve gradient magnitude for uncertainty).
  // Fuse normalization + length via inverseSqrt: one rsqrt replaces
  // sqrt + 3 vec3-by-scalar divs with rsqrt + 4 muls.
  let p = ro + rd * hitT;
  var rawGrad: vec3f;
  ${gradientCompute}
  let gMagSq = dot(rawGrad, rawGrad);
  // Floor only the scalar denominator path. Using the floored invGMag for the
  // normal would shrink |n| < 1 in shallow-gradient regions and bias diffuse /
  // specular energy. Compute the normal from the unfloored magnitude with an
  // explicit zero-gradient guard.
  let invGMag = inverseSqrt(max(gMagSq, 1e-12));
  let gradMag = gMagSq * invGMag;  // = sqrt(gMagSq)
  let invGMagExact = select(0.0, inverseSqrt(gMagSq), gMagSq > 1e-12);
  let n = -rawGrad * invGMagExact;

  // Sample for color
  ${colorSample}

  // Surface coloring via full color algorithm system
  // For dual-channel modes (Dirac particle/antiparticle, Pauli spin-up/down):
  //   rhoSurface = R (primary), dualSecondary = G (secondary) from the grid.
  //   computeBaseColor expects (rho=primary, s=secondary) — NOT log-density.
  // For standard modes: s = log(rho) as usual.
  let sSurface = select(sFromRho(rhoSurface), dualSecondary, IS_DUAL_CHANNEL);
  var surfaceColor = computeBaseColor(rhoSurface, sSurface, phase, p, schroedinger);

  // Branch coloring: tint isosurface by branch plane position
  if (schroedinger.quantumMode == 3 && schroedinger.branchSeparation > 0.5 && schroedinger.branchTransitionWidth > 0.0) {
    let branchFrac = smoothstep(
      schroedinger.branchPlaneThreshold - schroedinger.branchTransitionWidth,
      schroedinger.branchPlaneThreshold + schroedinger.branchTransitionWidth,
      p.x
    );
    let branchTint = mix(schroedinger.branchColorA, schroedinger.branchColorB, branchFrac);
    let lum = dot(surfaceColor, vec3f(0.2126, 0.7152, 0.0722));
    surfaceColor = branchTint * lum;
  }

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    surfaceColor = applyPhaseMateriality(surfaceColor, phase, sSurface, schroedinger);
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
  if (FEATURE_UNCERTAINTY_BOUNDARY && schroedinger.uncertaintyBoundaryEnabled != 0u && schroedinger.uncertaintyBoundaryStrength > 0.0) {
    let ubWidth = max(schroedinger.uncertaintyBoundaryWidth, 1e-3);
    let logRhoDelta = abs(sSurface - schroedinger.uncertaintyLogRhoThreshold);
    let spatialDist = logRhoDelta / max(gradMag, 1e-6);
    let z = spatialDist / ubWidth;  // cache (spatialDist/ubWidth) once — was computed twice
    let ubBand = exp(-0.5 * z * z);
    let ubGlow = ubBand * schroedinger.uncertaintyBoundaryStrength;
    surfaceColor = mix(surfaceColor, surfaceColor * 2.0 + vec3f(0.1, 0.08, 0.15), ubGlow);
  }

  // Lighting - use shared lighting uniforms
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) *
            lighting.ambientColor * lighting.ambientIntensity;

  let viewDir = -rd;
  let roughness = max(material.roughness, 0.04);

  // Multi-light loop using shared lighting system
  for (var i = 0; i < MAX_LIGHTS; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    // Enabled flag packed in params.w (0 or 1)
    if (light.params.w < 0.5) { continue; }
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    // Fuse light direction + distance so (position - p) is computed once
    // (avoids the double dot3+sqrt that getEmissionLightDir + length() does).
    let lightType = i32(light.position.w);
    var l: vec3f;
    var lightDistance: f32 = 0.0;
    if (lightType == LIGHT_TYPE_DIRECTIONAL) {
      l = normalize(-light.direction.xyz);
    } else {
      let delta = light.position.xyz - p;
      let lenSq = max(dot(delta, delta), 1.0e-12);
      let invLen = inverseSqrt(lenSq);
      l = delta * invLen;
      lightDistance = lenSq * invLen;
    }

    var attenuation = lightIntensity;

    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      attenuation *= getEmissionLightAttenuation(i, lightDistance);
    }

    if (lightType == LIGHT_TYPE_SPOT) {
      // lightToFrag == -l (l is already the surface->light unit vector).
      let spotDir = normalize(light.direction.xyz);
      let cosAngle = dot(-l, spotDir);
      let spotCosOuter = light.params.z;
      let spotCosInner = light.params.y;
      let spotAttenuation = smoothstep(spotCosOuter, spotCosInner, cosAngle);
      attenuation *= spotAttenuation;
    }

    if (attenuation < 0.001) { continue; }

    let NdotL = max(dot(n, l), 0.0);

    // GGX Specular (PBR) with energy conservation
    // Filament convention: F0 = 0.16 * reflectance^2 for dielectrics (0.5 → 0.04)
    let dielectricF0 = 0.16 * material.reflectance * material.reflectance;
    let F0 = mix(vec3f(dielectricF0), surfaceColor, material.metallic);
    let halfSum = l + viewDir;
    let halfLen = length(halfSum);
    var H: vec3f;
    if (halfLen > EPS_DIVISION) {
      H = halfSum / halfLen;
    } else {
      H = n;
    }
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

  // HDR Emission Glow (shared helper)
  col = applyHDREmissionGlow(col, surfaceColor, sSurface, schroedinger);

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

  if (FEATURE_PROBABILITY_CURRENT && schroedinger.probabilityCurrentEnabled != 0u && schroedinger.probabilityCurrentScale > 0.0) {
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

  // Blend potential overlay OVER the isosurface (front-to-back: potential is closer)
  if (potAccAlpha > 0.01) {
    finalColor = potAccColor + (1.0 - potAccAlpha) * finalColor;
    finalAlpha = potAccAlpha + (1.0 - potAccAlpha) * finalAlpha;
  }

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

  // Output final color.
  output.color = vec4f(finalColor, finalAlpha);

  return output;
}
`
}

/**
 * Configuration for isosurface temporal main block generation.
 */

// Re-export isosurface temporal block
