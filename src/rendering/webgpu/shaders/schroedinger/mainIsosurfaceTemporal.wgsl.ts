/**
 * Isosurface Temporal Main Block
 *
 * Extracted from main.wgsl.ts for file-size management.
 * Contains the isosurface rendering main function with temporal accumulation.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainIsosurfaceTemporal.wgsl
 */

import {
  generateBinarySearchSample,
  generateColorSample,
  generateDensitySample,
  generateGradientCompute,
  generateSeedSample,
} from './isosurfaceSampling'
import { generateBayerJitterSection, getRayDirSource } from './temporalJitter'

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

  const bayerJitterSection = generateBayerJitterSection(bayerJitter)
  const rayDirSource = getRayDirSource(bayerJitter)

  const densitySample = generateDensitySample(useDensityGrid)
  const seedSample = generateSeedSample(useDensityGrid)
  const binarySearchSample = generateBinarySearchSample(useDensityGrid)
  const gradientCompute = generateGradientCompute(useDensityGrid)
  const colorSample = generateColorSample(useDensityGrid)

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Isosurface Temporal Mode
// ============================================
// Combines isosurface marching + PBR lighting with temporal reprojection.
// Outputs MRT: color + world position (no normal buffer in temporal mode).

// Light helpers: getEmissionLightDir, getEmissionLightAttenuation
// from emissionLit.wgsl.ts (included via emissionPostBlock)

@fragment
fn fragmentMain(input: VertexOutput) -> TemporalFragmentOutput {
  var output: TemporalFragmentOutput;
${bayerJitterSection}
  // Ray setup: transform to model space
  // PERF: cameraPositionModel is CPU-precomputed as inverseModelMatrix * (cameraPosition, 1).
  let ro = camera.cameraPositionModel;
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
  // PERF: rsqrt form — single hardware op replaces sqrt + divide for the
  // normal, and the same invGradMag is reused by the uncertainty boundary
  // below (saves two divides per isosurface hit). Clamp migrates from
  // max(gradMag, 1e-6) to max(gradMagSq, 1e-12) — same 1e6 cap on the output.
  let gradMagSq = dot(rawGrad, rawGrad);
  // Floor only the scalar denominator path. The floored invGradMag would
  // shrink |n| < 1 in shallow-gradient regions and bias diffuse / specular
  // energy; recompute the normal from the unfloored magnitude with an
  // explicit zero-gradient guard.
  // PERF: when gradMagSq > 1e-12, max(gradMagSq, 1e-12) == gradMagSq, so the
  // floored inverseSqrt is exact for the normal too — reuse instead of calling
  // inverseSqrt twice.
  let invGradMag = inverseSqrt(max(gradMagSq, 1e-12));
  let gradMag = gradMagSq * invGradMag;
  let invGradMagExact = select(0.0, invGradMag, gradMagSq > 1e-12);
  let n = -rawGrad * invGradMagExact;

  // Sample for color
  ${colorSample}

  // For dual-channel modes: s = secondary density from grid (not log-density).
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
    let lum = dot(surfaceColor, LUMA_WEIGHTS);
    surfaceColor = branchTint * lum;
  }

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && schroedinger.phaseMaterialityEnabled != 0u) {
    surfaceColor = applyPhaseMateriality(surfaceColor, phase, sSurface, schroedinger);
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
    // PERF: reuse invGradMag computed above — divide becomes a multiply.
    let spatialDist = logRhoDelta * invGradMag;
    let z = spatialDist / ubWidth;  // cache once instead of computing twice
    let ubBand = exp(-0.5 * z * z);
    let ubGlow = ubBand * schroedinger.uncertaintyBoundaryStrength;
    surfaceColor = mix(surfaceColor, surfaceColor * 2.0 + vec3f(0.1, 0.08, 0.15), ubGlow);
  }

  // Lighting
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) *
            lighting.ambientColor * lighting.ambientIntensity;

  let viewDir = -rd;
  let roughness = max(material.roughness, 0.04);

  // PERF: hoist F0 / dielectricF0 / kD-divide-by-PI invariants out of the
  // multi-light loop — they only depend on material + surfaceColor.
  // Filament convention: F0 = 0.16 * reflectance^2 for dielectrics (0.5 → 0.04).
  let dielectricF0_iso = 0.16 * material.reflectance * material.reflectance;
  let F0 = mix(vec3f(dielectricF0_iso), surfaceColor, material.metallic);
  let surfaceColorOverPi = surfaceColor * INV_PI;

  for (var i = 0; i < MAX_LIGHTS; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    if (light.params.w < 0.5) { continue; }
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    // Fuse light direction + distance so (position - p) is computed once
    // (getEmissionLightDir computes it internally; length() below would recompute it).
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

    // F0/dielectricF0_iso hoisted above the loop.
    // Halfway vector: rsqrt + select mirrors the pattern already used in
    // ggx.wgsl.ts:46. Saves 1 sqrt + 1 divide per light per pixel.
    let halfSum = l + viewDir;
    let halfSumSq = dot(halfSum, halfSum);
    let invHalfLen = inverseSqrt(max(halfSumSq, EPS_DIVISION * EPS_DIVISION));
    let H = select(n, halfSum * invHalfLen, halfSumSq > EPS_DIVISION * EPS_DIVISION);
    let F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - material.metallic);

    col += kD * surfaceColorOverPi * light.color.rgb * NdotL * attenuation;

    let specular = computePBRSpecular(n, viewDir, l, roughness, F0);
    col += specular * material.specularColor * light.color.rgb * NdotL * material.specularIntensity * attenuation;
  }

  // HDR Emission Glow (shared helper)
  col = applyHDREmissionGlow(col, surfaceColor, sSurface, schroedinger);

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
