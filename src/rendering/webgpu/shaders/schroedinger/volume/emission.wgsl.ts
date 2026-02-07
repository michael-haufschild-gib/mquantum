/**
 * WGSL Emission color computation for volumetric rendering
 *
 * Computes the emission color at each point based on:
 * - User's color palette
 * - Density (brightness/saturation)
 * - Wavefunction phase (subtle hue modulation)
 *
 * Uses shared lighting system (lighting uniform buffer) for lit emission.
 *
 * Port of GLSL schroedinger/volume/emission.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/emission.wgsl
 */

import type { ColorAlgorithm } from '../../types'

/**
 * Static utilities that computeBaseColor depends on:
 * - COLOR_ALG_* constants
 * - PHASE_HUE_INFLUENCE
 * - blackbody(), henyeyGreenstein(), applyDistributionS()
 */
export const emissionPreBlock = /* wgsl */ `
// ============================================
// Volume Emission Color
// ============================================
// Note: LIGHT_TYPE_* constants are defined in shared/core/constants.wgsl.ts

// Color algorithm constants (must match COLOR_ALGORITHM_TO_INT in types.ts)
const COLOR_ALG_PHASE: i32 = 8;
const COLOR_ALG_MIXED: i32 = 9;
const COLOR_ALG_BLACKBODY: i32 = 10;

// Phase influence on hue (0.0 = no phase color, 1.0 = full rainbow)
const PHASE_HUE_INFLUENCE: f32 = 0.4;

// Analytic approximation of blackbody color (rgb)
fn blackbody(Temp: f32) -> vec3f {
  if (Temp <= 0.0) { return vec3f(0.0); }
  var col = vec3f(255.0);
  // PERF: pow(x, -1.5) = 1/(x*sqrt(x)), avoids exp(-1.5*log(x)) ~8 cycle savings
  let sqrtTemp = sqrt(Temp);
  let invTemp = 1.0 / (Temp * sqrtTemp);
  col.x = 56100000.0 * invTemp + 148.0;
  col.y = 100040000.0 * invTemp + 66.0;
  col.z = 194180000.0 * invTemp + 30.0;
  col = col / 255.0;
  return clamp(col, vec3f(0.0), vec3f(1.0));
}

// Henyey-Greenstein Phase Function for anisotropic scattering
fn henyeyGreenstein(dotLH: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = max(1.0 + g2 - 2.0 * g * dotLH, 0.001);
  // PERF: pow(x, 1.5) = x * sqrt(x), avoids exp(1.5*log(x)) ~12 cycle savings
  let denomSqrt = sqrt(denom);
  return (1.0 - g2) / (4.0 * PI * denom * denomSqrt);
}

// Apply distribution function for color algorithms
// Matches WebGL order: pow() first, then fract(curved * cycles + offset)
fn applyDistributionS(t: f32, power: f32, cycles: f32, offset: f32) -> f32 {
  let clamped = clamp(t, 0.0, 1.0);
  // Guard pow() - ensure base > 0 and power >= small value
  let safePower = max(power, 0.001);
  let safeBase = max(clamped, 0.0001);
  let curved = pow(safeBase, safePower);
  // Clamp before fract to avoid fract(1.0)=0 discontinuity at peak density
  return fract(clamp(curved * cycles + offset, 0.0, 0.999));
}
`

// ---- Algorithm branch generators ----
// Each returns the WGSL body lines for col assignment (no fn signature, no return)

const ALGO_BRANCH: Record<number, string> = {
  0: /* wgsl */ `
    // 0: Monochromatic - same hue, varying lightness
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let newL = 0.3 + distributedT * 0.4;
    col = hsl2rgb(baseHSL.x, baseHSL.y, newL);`,

  1: /* wgsl */ `
    // 1: Analogous - hue varies +/-30deg from base, preserves material lightness
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let hueOffset = (distributedT - 0.5) * 0.167;
    let newH = fract(baseHSL.x + hueOffset);
    col = hsl2rgb(newH, baseHSL.y, baseHSL.z);`,

  2: /* wgsl */ `
    // 2: Cosine gradient (Inigo Quilez palette)
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(distributedT, a, b, c, d);`,

  3: /* wgsl */ `
    // 3: Normal-based - color by vertical position as normal proxy
    let normalT = pos.y * 0.5 + 0.5;
    let distNormalT = applyDistributionS(normalT, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(distNormalT, a, b, c, d);`,

  4: /* wgsl */ `
    // 4: Distance field - cosine palette on density (primary signal for volume)
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(distributedT, a, b, c, d);`,

  5: /* wgsl */ `
    // 5: LCH/Oklab perceptual hue rotation
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    // Maps distributedT to hue angle in Oklab color space
    let hue = distributedT * TAU;
    let oklab = vec3f(uniforms.lchLightness, uniforms.lchChroma * cos(hue), uniforms.lchChroma * sin(hue));
    col = clamp(oklab2rgb(oklab), vec3f(0.0), vec3f(1.0));`,

  6: /* wgsl */ `
    // 6: Multi-source - blend density + radial + vertical through cosine palette
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let totalW = uniforms.multiSourceWeights.x + uniforms.multiSourceWeights.y + uniforms.multiSourceWeights.z;
    let w = uniforms.multiSourceWeights.xyz / max(totalW, 0.001);
    let radialT = clamp(length(pos) / uniforms.boundingRadius, 0.0, 1.0);
    let verticalT = pos.y * 0.5 + 0.5;
    let blendedT = w.x * distributedT + w.y * radialT + w.z * verticalT;
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(blendedT, a, b, c, d);`,

  7: /* wgsl */ `
    // 7: Radial - color by distance from center through cosine palette
    let rawRadialT = clamp(length(pos) / uniforms.boundingRadius, 0.0, 1.0);
    let radialT = applyDistributionS(rawRadialT, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(radialT, a, b, c, d);`,

  8: /* wgsl */ `
    // 8: Quantum Phase coloring
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    col = hsl2rgb(hue, 0.75, 0.35);`,

  9: /* wgsl */ `
    // 9: Mixed (Quantum Phase + Density) - DEFAULT
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    let lightness = 0.15 + 0.35 * normalized;
    let saturation = 0.7 + 0.25 * normalized;
    col = hsl2rgb(hue, saturation, lightness);`,

  10: /* wgsl */ `
    // 10: Blackbody (Heat)
    let temp = normalized * 12000.0;
    if (temp < 500.0) { return vec3f(0.0); } // Cold is black
    col = blackbody(temp);`,
}

/** Human-readable names for color algorithms (indexed by ColorAlgorithm value) */
const COLOR_ALG_NAMES: Record<number, string> = {
  0: 'Monochromatic',
  1: 'Analogous',
  2: 'Cosine',
  3: 'Normal-based',
  4: 'Distance Field',
  5: 'LCH/Oklab',
  6: 'Multi-source',
  7: 'Radial',
  8: 'Phase',
  9: 'Mixed',
  10: 'Blackbody',
}

export { COLOR_ALG_NAMES }

/**
 * Generate the computeBaseColor() WGSL function.
 *
 * @param colorAlgorithm When defined, emit only that algorithm's branch (no if/else chain).
 *                       When undefined, emit the full 11-branch runtime dispatch (backward compatible).
 */
export function generateComputeBaseColor(colorAlgorithm?: ColorAlgorithm): string {
  // Common function header
  const header = /* wgsl */ `
// Compute base surface color (no lighting applied)
// PERF: accepts pre-computed log-density s to avoid redundant log() call
fn computeBaseColor(rho: f32, s: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // Normalize log-density to [0, 1] range for color mapping
  let normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);

  // Get base color from material's base color
  var baseHSL = rgb2hsl(material.baseColor.rgb);

  // Energy level coloring: map radial distance to spectral hue
  // Center (low energy) -> Red, Edge (high energy) -> Violet
  if (uniforms.energyColorEnabled != 0u) {
    let r = length(pos);
    let energyProxy = clamp(r * 0.5, 0.0, 1.0);
    let hue = 0.8 * energyProxy;
    baseHSL = vec3f(hue, 1.0, 0.5);
  }

  var col = vec3f(0.0);
`

  // Specialized single-branch (compile-time)
  if (colorAlgorithm !== undefined) {
    const branch = ALGO_BRANCH[colorAlgorithm]
    if (!branch) {
      throw new Error(`Unknown colorAlgorithm: ${colorAlgorithm}`)
    }
    return header + branch + '\n\n  return col;\n}\n'
  }

  // Full runtime dispatch (backward compatible)
  return header + /* wgsl */ `
  let algorithm = uniforms.colorAlgorithm;

  // Quantum-specific color algorithms (8-10) use actual wavefunction phase
  // Algorithms 0-7 delegate to standard color system
  if (algorithm == COLOR_ALG_PHASE) {${ALGO_BRANCH[8]}
  }
  else if (algorithm == COLOR_ALG_MIXED) {${ALGO_BRANCH[9]}
  }
  else if (algorithm == COLOR_ALG_BLACKBODY) {${ALGO_BRANCH[10]}
  }
  else {
    // Algorithms 0-7: Use shared color algorithm system
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);

    if (algorithm == 0) {
      // 0: Monochromatic - same hue, varying lightness
      let newL = 0.3 + distributedT * 0.4;
      col = hsl2rgb(baseHSL.x, baseHSL.y, newL);
    }
    else if (algorithm == 1) {
      // 1: Analogous - hue varies +/-30deg from base, preserves material lightness
      let hueOffset = (distributedT - 0.5) * 0.167;
      let newH = fract(baseHSL.x + hueOffset);
      col = hsl2rgb(newH, baseHSL.y, baseHSL.z);
    }
    else if (algorithm == 2) {
      // 2: Cosine gradient (Inigo Quilez palette)
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(distributedT, a, b, c, d);
    }
    else if (algorithm == 3) {
      // 3: Normal-based - color by vertical position as normal proxy
      let normalT = pos.y * 0.5 + 0.5;
      let distNormalT = applyDistributionS(normalT, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(distNormalT, a, b, c, d);
    }
    else if (algorithm == 4) {
      // 4: Distance field - cosine palette on density (primary signal for volume)
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(distributedT, a, b, c, d);
    }
    else if (algorithm == 5) {
      // 5: LCH/Oklab perceptual hue rotation
      // Maps distributedT to hue angle in Oklab color space
      let hue = distributedT * TAU;
      let oklab = vec3f(uniforms.lchLightness, uniforms.lchChroma * cos(hue), uniforms.lchChroma * sin(hue));
      col = clamp(oklab2rgb(oklab), vec3f(0.0), vec3f(1.0));
    }
    else if (algorithm == 6) {
      // 6: Multi-source - blend density + radial + vertical through cosine palette
      let totalW = uniforms.multiSourceWeights.x + uniforms.multiSourceWeights.y + uniforms.multiSourceWeights.z;
      let w = uniforms.multiSourceWeights.xyz / max(totalW, 0.001);
      let radialT = clamp(length(pos) / uniforms.boundingRadius, 0.0, 1.0);
      let verticalT = pos.y * 0.5 + 0.5;
      let blendedT = w.x * distributedT + w.y * radialT + w.z * verticalT;
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(blendedT, a, b, c, d);
    }
    else if (algorithm == 7) {
      // 7: Radial - color by distance from center through cosine palette
      let rawRadialT = clamp(length(pos) / uniforms.boundingRadius, 0.0, 1.0);
      let radialT = applyDistributionS(rawRadialT, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(radialT, a, b, c, d);
    }
    else {
      // Default fallback to mixed
      let phaseNorm = (phase + PI) / TAU;
      let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
      let hue = fract(baseHSL.x + hueShift);
      let lightness = 0.15 + 0.35 * normalized;
      let saturation = 0.7 + 0.25 * normalized;
      col = hsl2rgb(hue, saturation, lightness);
    }
  }

  return col;
}
`
}

/**
 * Everything after computeBaseColor:
 * computeEmission(), getEmissionLightDir(), getEmissionLightAttenuation(),
 * getEmissionSpotAttenuation(), computeEmissionLit()
 */
export const emissionPostBlock = /* wgsl */ `
// Compute emission with ambient lighting only (for fast mode)
// PERF: accepts pre-computed log-density s to avoid redundant log() call
fn computeEmission(rho: f32, s: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  var surfaceColor = computeBaseColor(rho, s, phase, pos, uniforms);

  // Phase materiality: matter (plasma) vs anti-matter (smoke)
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    let phaseMod = fract((phase + PI) / TAU); // 0..1, 0.5 = positive real
    let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
    let smokeWeight = 1.0 - plasmaWeight;
    let str = uniforms.phaseMaterialityStrength;
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
    let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(surfaceColor), 0.1);
    surfaceColor = mix(surfaceColor,
      plasmaColor * plasmaWeight + smokeColor * smokeWeight,
      str);
  }

  var col = surfaceColor * lighting.ambientColor * lighting.ambientIntensity;

  return col;
}

// Helper to get light direction from shared lighting system
fn getEmissionLightDir(lightIdx: i32, pos: vec3f) -> vec3f {
  let light = lighting.lights[lightIdx];
  let lightType = i32(light.position.w);

  if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    return normalize(-light.direction.xyz);
  } else {
    return normalize(light.position.xyz - pos);
  }
}

// Helper to get light attenuation from shared lighting system
fn getEmissionLightAttenuation(lightIdx: i32, distance: f32) -> f32 {
  let light = lighting.lights[lightIdx];
  let lightRange = light.direction.w;
  let decay = light.params.x;

  if (lightRange <= 0.0) {
    return 1.0;
  }

  let normalizedDist = distance / lightRange;
  return max(0.0, 1.0 - pow(normalizedDist, decay));
}

// Helper to get spot attenuation from shared lighting system
fn getEmissionSpotAttenuation(lightIdx: i32, lightToFrag: vec3f) -> f32 {
  let light = lighting.lights[lightIdx];
  let spotDir = normalize(light.direction.xyz);
  let cosAngle = dot(lightToFrag, spotDir);
  let spotCosOuter = light.params.z;
  let spotCosInner = light.params.y;
  return smoothstep(spotCosOuter, spotCosInner, cosAngle);
}

// Compute emission with full scene lighting (for HQ mode)
// PERF: accepts pre-computed log-density s to avoid redundant log() call
fn computeEmissionLit(
  rho: f32,
  s: f32,
  phase: f32,
  p: vec3f,
  gradient: vec3f,
  viewDir: vec3f,
  uniforms: SchroedingerUniforms
) -> vec3f {
  // Early return if no lights
  if (lighting.lightCount == 0) {
    return computeEmission(rho, s, phase, p, uniforms);
  }

  var surfaceColor = computeBaseColor(rho, s, phase, p, uniforms);

  // Phase materiality: matter (plasma) vs anti-matter (smoke)
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    let phaseMod = fract((phase + PI) / TAU); // 0..1, 0.5 = positive real
    let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
    let smokeWeight = 1.0 - plasmaWeight;
    let str = uniforms.phaseMaterialityStrength;
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
    let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(surfaceColor), 0.1);
    surfaceColor = mix(surfaceColor,
      plasmaColor * plasmaWeight + smokeColor * smokeWeight,
      str);
  }

  // Start with ambient (Lambertian — no PBR metallic suppression for volumetric)
  var col = surfaceColor * lighting.ambientColor * lighting.ambientIntensity;

  // Normalize gradient as pseudo-normal; fallback to view direction at wavefunction peak
  // where gradient of log(rho) is exactly zero (avoids division by zero)
  let gradLen = length(gradient);
  var n: vec3f;
  if (gradLen < 0.0001) {
    n = viewDir;
  } else {
    n = gradient / gradLen;
  }

  // Loop through lights using shared lighting system
  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    // Enabled flag packed in params.w (0 or 1)
    if (light.params.w < 0.5) { continue; }
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    let l = getEmissionLightDir(i, p);
    var attenuation = lightIntensity;

    let lightType = i32(light.position.w);
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(light.position.xyz - p);
      attenuation *= getEmissionLightAttenuation(i, distance);
    }

    if (lightType == LIGHT_TYPE_SPOT) {
      let lightToFrag = normalize(p - light.position.xyz);
      attenuation *= getEmissionSpotAttenuation(i, lightToFrag);
    }

    if (attenuation < 0.001) { continue; }

    // Powder effect for volumetric multiple scattering
    var powder = 1.0;
    if (uniforms.powderScale > 0.0) {
      powder = 1.0 - exp(-rho * uniforms.densityGain * uniforms.powderScale * 4.0);
      powder = 0.5 + 1.5 * powder;
    }

    // Anisotropic scattering
    var phaseFactor = 1.0;
    if (abs(uniforms.scatteringAnisotropy) > 0.01) {
      let cosTheta = dot(-l, viewDir);
      phaseFactor = henyeyGreenstein(cosTheta, uniforms.scatteringAnisotropy);
      phaseFactor *= 12.56;
    }

    // Lambertian diffuse (no PBR specular for volumetric — it has negligible effect on clouds)
    let NdotL = max(dot(n, l), 0.0);

    // Diffuse
    col += surfaceColor / PI * light.color.rgb * NdotL * attenuation * powder * phaseFactor;

    // Subsurface Scattering (SSS) - port from WebGL emission.glsl.ts lines 259-278
    if (material.sssEnabled != 0u && material.sssIntensity > 0.0) {
      // Screen-space noise for jitter (uses fragment position)
      let fragCoord = vec2f(p.x * 100.0, p.y * 100.0); // Approximate fragment coord from world pos
      let sssNoise = fract(sin(dot(fragCoord * 0.1, vec2f(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
      let jitteredDistortion = 0.5 * (1.0 + sssNoise * material.sssJitter);

      let halfVec = normalize(l + n * jitteredDistortion);
      let trans = pow(clamp(dot(viewDir, -halfVec), 0.0, 1.0), material.sssThickness * 4.0);

      let transmission = trans * exp(-rho * material.sssThickness);

      col += material.sssColor * light.color.rgb * transmission * material.sssIntensity * attenuation;
    }
  }

  // Use pre-computed log-density (passed in as parameter, saves log() call)
  let cachedS = s;

  // HDR Emission Glow (port from WebGL emission.glsl.ts lines 332-361)
  if (uniforms.emissionIntensity > 0.0) {
    let normalizedRho = clamp((cachedS + 8.0) / 8.0, 0.0, 1.0);

    if (normalizedRho > uniforms.emissionThreshold) {
      var emissionFactor = (normalizedRho - uniforms.emissionThreshold) / (1.0 - uniforms.emissionThreshold);
      // PERF: Use multiplication instead of pow(x, 2.0)
      emissionFactor = emissionFactor * emissionFactor;

      var emissionColor = surfaceColor;

      if (abs(uniforms.emissionColorShift) > 0.01) {
        var hsl = rgb2hsl(emissionColor);
        if (uniforms.emissionColorShift > 0.0) {
          hsl.x = mix(hsl.x, 0.08, uniforms.emissionColorShift * 0.5);
          hsl.y = mix(hsl.y, 1.0, uniforms.emissionColorShift * 0.3);
        } else {
          hsl.x = mix(hsl.x, 0.6, -uniforms.emissionColorShift * 0.5);
          hsl.z = mix(hsl.z, 0.9, -uniforms.emissionColorShift * 0.3);
        }
        emissionColor = hsl2rgb(hsl.x, hsl.y, hsl.z);
      }

      col += emissionColor * uniforms.emissionIntensity * emissionFactor;
    }
  }

  return col;
}
`

/** Backward-compatible combined block (full runtime dispatch) */
export const emissionBlock = emissionPreBlock + '\n' + generateComputeBaseColor() + '\n' + emissionPostBlock
