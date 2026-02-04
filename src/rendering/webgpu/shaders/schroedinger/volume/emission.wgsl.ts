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

export const emissionBlock = /* wgsl */ `
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
  // Safety: pow(x, -1.5) is undefined for x <= 0
  if (Temp <= 0.0) { return vec3f(0.0); }
  var col = vec3f(255.0);
  let invTemp = pow(Temp, -1.5);
  col.x = 56100000.0 * invTemp + 148.0;
  col.y = 100040000.0 * invTemp + 66.0;
  col.z = 194180000.0 * invTemp + 30.0;
  col = col / 255.0;
  return clamp(col, vec3f(0.0), vec3f(1.0));
}

// Henyey-Greenstein Phase Function for anisotropic scattering
fn henyeyGreenstein(dotLH: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * dotLH;
  return (1.0 - g2) / (4.0 * PI * pow(max(denom, 0.001), 1.5));
}

// Apply distribution function for color algorithms
fn applyDistributionS(t: f32, power: f32, cycles: f32, offset: f32) -> f32 {
  let cycled = fract(t * cycles + offset);
  return pow(cycled, power);
}

// Compute base surface color (no lighting applied)
// Uses uniforms.colorAlgorithm to select the coloring method
fn computeBaseColor(rho: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // Normalize log-density to [0, 1] range for color mapping
  let s = sFromRho(rho);
  let normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);

  // Get base color from material's base color
  let baseHSL = rgb2hsl(material.baseColor.rgb);
  let algorithm = uniforms.colorAlgorithm;

  var col = vec3f(0.0);

  // Quantum-specific color algorithms (8-10) use actual wavefunction phase
  // Algorithms 0-7 delegate to standard color system
  if (algorithm == COLOR_ALG_PHASE) {
    // Algorithm 8: Quantum Phase coloring
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    col = hsl2rgb(hue, 0.75, 0.35);
  }
  else if (algorithm == COLOR_ALG_MIXED) {
    // Algorithm 9: Mixed (Quantum Phase + Density) - DEFAULT
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    let lightness = 0.15 + 0.35 * normalized;
    let saturation = 0.7 + 0.25 * normalized;
    col = hsl2rgb(hue, saturation, lightness);
  }
  else if (algorithm == COLOR_ALG_BLACKBODY) {
    // Algorithm 10: Blackbody (Heat)
    let temp = normalized * 12000.0;
    if (temp < 500.0) { return vec3f(0.0); } // Cold is black
    col = blackbody(temp);
  }
  else {
    // Algorithms 0-7: Use shared color algorithm system
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);

    if (algorithm == 0) {
      // Monochromatic - same hue, varying lightness
      let newL = 0.3 + distributedT * 0.4;
      col = hsl2rgb(baseHSL.x, baseHSL.y, newL);
    }
    else if (algorithm == 1) {
      // Analogous - hue varies ±30° from base
      let hueOffset = (distributedT - 0.5) * 0.167;
      let newH = fract(baseHSL.x + hueOffset);
      col = hsl2rgb(newH, baseHSL.y, 0.35 + distributedT * 0.3);
    }
    else if (algorithm == 2) {
      // Complementary - flip between base and complement
      let complement = fract(baseHSL.x + 0.5);
      let newH = mix(baseHSL.x, complement, distributedT);
      col = hsl2rgb(newH, baseHSL.y, 0.35 + distributedT * 0.3);
    }
    else if (algorithm == 3) {
      // Triadic - three evenly spaced colors
      let triadic1 = fract(baseHSL.x + 0.333);
      let triadic2 = fract(baseHSL.x + 0.666);
      var newH: f32;
      if (distributedT < 0.333) {
        newH = mix(baseHSL.x, triadic1, distributedT * 3.0);
      } else if (distributedT < 0.666) {
        newH = mix(triadic1, triadic2, (distributedT - 0.333) * 3.0);
      } else {
        newH = mix(triadic2, baseHSL.x, (distributedT - 0.666) * 3.0);
      }
      col = hsl2rgb(newH, baseHSL.y, 0.35 + distributedT * 0.3);
    }
    else if (algorithm == 4) {
      // Split-complementary
      let split1 = fract(baseHSL.x + 0.417);
      let split2 = fract(baseHSL.x + 0.583);
      var newH: f32;
      if (distributedT < 0.5) {
        newH = mix(baseHSL.x, split1, distributedT * 2.0);
      } else {
        newH = mix(split1, split2, (distributedT - 0.5) * 2.0);
      }
      col = hsl2rgb(newH, baseHSL.y, 0.35 + distributedT * 0.3);
    }
    else if (algorithm == 5) {
      // Cosine palette
      let a = uniforms.cosineA.xyz;
      let b = uniforms.cosineB.xyz;
      let c = uniforms.cosineC.xyz;
      let d = uniforms.cosineD.xyz;
      col = cosinePalette(distributedT, a, b, c, d);
    }
    else if (algorithm == 6) {
      // Oklab gradient
      let oklA = rgb2oklab(hsl2rgb(baseHSL.x, baseHSL.y, 0.3));
      let oklB = rgb2oklab(hsl2rgb(fract(baseHSL.x + 0.5), baseHSL.y, 0.7));
      let oklMix = mix(oklA, oklB, distributedT);
      col = oklab2rgb(oklMix);
    }
    else if (algorithm == 7) {
      // Rainbow
      col = hsl2rgb(distributedT, 0.8, 0.5);
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

// Compute emission with ambient lighting only (for fast mode)
fn computeEmission(rho: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let baseColor = computeBaseColor(rho, phase, pos, uniforms);
  var col = baseColor * max(1.0 - material.metallic, 0.0) * lighting.ambientColor * lighting.ambientIntensity;

  // Nodal surface highlighting (port from WebGL emission.glsl.ts lines 136-144)
  if (uniforms.nodalEnabled != 0u) {
    let s = sFromRho(rho);
    if (s < -5.0 && s > -12.0) {
      let intensity = 1.0 - smoothstep(-12.0, -5.0, s);
      // Additive self-luminous glow for nodes (ignores ambient level)
      col += uniforms.nodalColor * uniforms.nodalStrength * intensity * 2.0;
    }
  }

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
fn computeEmissionLit(
  rho: f32,
  phase: f32,
  p: vec3f,
  gradient: vec3f,
  viewDir: vec3f,
  uniforms: SchroedingerUniforms
) -> vec3f {
  // Early return if no lights
  if (lighting.lightCount == 0) {
    return computeEmission(rho, phase, p, uniforms);
  }

  let surfaceColor = computeBaseColor(rho, phase, p, uniforms);

  // Start with ambient
  var col = surfaceColor * max(1.0 - material.metallic, 0.0) * lighting.ambientColor * lighting.ambientIntensity;

  // Normalize gradient as pseudo-normal
  let gradLen = length(gradient);
  if (gradLen < 0.0001) { return col; }

  let n = gradient / gradLen;

  // Clamp roughness to prevent numerical issues
  let roughness = max(material.roughness, 0.04);

  // Loop through lights using shared lighting system
  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
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

    // GGX Specular (PBR) with energy conservation
    let NdotL = max(dot(n, l), 0.0);
    let F0 = mix(vec3f(0.04), surfaceColor, material.metallic);
    let H = normalize(l + viewDir);
    let F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - material.metallic);

    // Diffuse
    col += kD * surfaceColor / PI * light.color.rgb * NdotL * attenuation * powder * phaseFactor;

    // Specular
    let specular = computePBRSpecular(n, viewDir, l, roughness, F0);

    // Volumetric self-shadowing (simplified for WGSL)
    // PERFORMANCE: Skip shadow calculation in very low density regions
    // where the visual contribution is negligible (saves up to 8 sampleDensity calls)
    var shadowFactor = 1.0;
    let shadowDensityThreshold = 0.001;  // Skip shadows below this density
    if (uniforms.shadowsEnabled != 0u && uniforms.shadowStrength > 0.0 && rho > shadowDensityThreshold) {
      var shadowDens: f32 = 0.0;
      var shadowStep: f32 = 0.1;
      var tShadow: f32 = 0.05;

      let effectiveShadowSteps = select(uniforms.shadowSteps, max(uniforms.shadowSteps / 2, 1), quality.qualityMultiplier < 0.75);
      for (var s = 0; s < 8; s++) {
        if (s >= effectiveShadowSteps) { break; }
        let shadowPos = p + l * tShadow;
        let rhoS = sampleDensity(shadowPos, uniforms.time * uniforms.timeScale, uniforms);
        shadowDens += rhoS * shadowStep;
        shadowStep *= 1.5;
        tShadow += shadowStep;
      }

      shadowFactor = exp(-shadowDens * uniforms.densityGain * uniforms.shadowStrength);
    }

    // Add specular with intensity/color (matching WebGL line 257)
    col += specular * material.specularColor * light.color.rgb * NdotL * material.specularIntensity * attenuation * shadowFactor;

    // Subsurface Scattering (SSS) - port from WebGL emission.glsl.ts lines 259-278
    if (material.sssEnabled != 0u && material.sssIntensity > 0.0) {
      // Screen-space noise for jitter (uses fragment position)
      let fragCoord = vec2f(p.x * 100.0, p.y * 100.0); // Approximate fragment coord from world pos
      let sssNoise = fract(sin(dot(fragCoord * 0.1, vec2f(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
      let jitteredDistortion = 0.5 * (1.0 + sssNoise * material.sssJitter);

      let halfVec = normalize(l + n * jitteredDistortion);
      let trans = pow(clamp(dot(viewDir, -halfVec), 0.0, 1.0), material.sssThickness * 4.0);

      var transmission = trans;
      if (uniforms.shadowsEnabled != 0u) {
        transmission *= shadowFactor;
      } else {
        transmission *= exp(-rho * material.sssThickness);
      }

      col += material.sssColor * light.color.rgb * transmission * material.sssIntensity * attenuation;
    }
  }

  // Volumetric Ambient Occlusion (port from WebGL emission.glsl.ts lines 281-315)
  // PERFORMANCE: Skip AO calculation in very low density regions
  // where the visual contribution is negligible (saves up to 8 sampleDensity calls)
  var aoFactor: f32 = 1.0;
  let aoDensityThreshold = 0.001;  // Skip AO below this density
  if (quality.aoEnabled != 0 && uniforms.aoStrength > 0.0 && rho > aoDensityThreshold) {
    var ao: f32 = 0.0;
    let radius = uniforms.aoRadius;
    // Halve AO steps in fast mode for better interactivity (min 2 for basic coverage)
    let effectiveAoSteps = select(uniforms.aoSteps, max(uniforms.aoSteps / 2, 2), quality.qualityMultiplier < 0.75);

    // Compute tangent basis for cone sampling
    let t1 = normalize(cross(n, vec3f(0.0, 1.0, 0.0) + vec3f(0.001)));
    let t2 = cross(n, t1);

    // Sample in cone directions around normal
    for (var k = 0; k < 8; k++) {
      if (k >= effectiveAoSteps) { break; }

      var dir = n;
      if (k == 1) { dir = normalize(n + t1); }
      if (k == 2) { dir = normalize(n - t1); }
      if (k == 3) { dir = normalize(n + t2); }
      if (k == 4) { dir = normalize(n - t2); }
      if (k == 5) { dir = normalize(n + t1 + t2); }
      if (k == 6) { dir = normalize(n - t1 - t2); }
      if (k == 7) { dir = normalize(n + t1 - t2); }

      let samplePos = p + dir * radius;
      let sampleRho = sampleDensity(samplePos, uniforms.time * uniforms.timeScale, uniforms);

      ao += sampleRho;
    }

    ao = ao / f32(effectiveAoSteps);
    aoFactor = exp(-ao * uniforms.densityGain * uniforms.aoStrength * 2.0);

    // Apply AO tint color
    let aoModulator = mix(uniforms.aoColor, vec3f(1.0), aoFactor);
    col *= aoModulator;
  }

  // Volumetric Fresnel / Rim Lighting (port from WebGL emission.glsl.ts lines 317-325)
  if (material.fresnelEnabled != 0u && material.fresnelIntensity > 0.0) {
    let NdotV = max(dot(n, viewDir), 0.0);
    var rim = pow(1.0 - NdotV, uniforms.rimExponent) * material.fresnelIntensity;
    // Modulate rim by AO factor if AO is enabled
    if (quality.aoEnabled != 0) {
      rim *= aoFactor;
    }
    col += material.rimColor * rim;
  }

  // Cache sFromRho for reuse in HDR Emission and Nodal sections (saves log() call)
  let cachedS = sFromRho(rho);

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

      var pulse = 1.0;
      if (uniforms.emissionPulsing != 0u) {
        let phaseNorm = (phase + PI) / TAU;
        pulse = 1.0 + 0.5 * sin(phaseNorm * 6.28 + uniforms.time * uniforms.timeScale * 2.0);
      }

      col += emissionColor * uniforms.emissionIntensity * emissionFactor * pulse;
    }
  }

  // Nodal surface highlighting (port from WebGL emission.glsl.ts lines 364-373)
  if (uniforms.nodalEnabled != 0u) {
    // Nodes are low-density regions between high-density lobes
    if (cachedS < -5.0 && cachedS > -12.0) {
      let intensity = 1.0 - smoothstep(-12.0, -5.0, cachedS);
      // Additive self-luminous glow for nodes (ignores shadows/lighting)
      col += uniforms.nodalColor * uniforms.nodalStrength * intensity * 2.0;
    }
  }

  return col;
}
`

/**
 * Configuration for emission block generator.
 */
export interface EmissionBlockConfig {
  /**
   * Use pre-computed density grid for shadow/AO sampling.
   * When true, replaces expensive sampleDensity() calls with cheap texture lookups.
   */
  useDensityGrid?: boolean
}

/**
 * Generate emission block with optional density grid support.
 *
 * When useDensityGrid is true, shadow and AO calculations use the pre-computed
 * density grid texture instead of evaluating the wavefunction per-sample.
 * This provides ~15-25% GPU time reduction for these effects.
 *
 * @param config - Configuration options
 * @returns WGSL emission block string
 */
export function generateEmissionBlock(config: EmissionBlockConfig = {}): string {
  const { useDensityGrid = false } = config

  // When density grid is enabled, use texture sampling instead of wavefunction evaluation
  // This is much cheaper: ~10 ops vs ~300-460 ops per sample
  const shadowSampleCall = useDensityGrid
    ? 'sampleDensityOnlyFromGrid(shadowPos)'
    : 'sampleDensity(shadowPos, uniforms.time * uniforms.timeScale, uniforms)'

  const aoSampleCall = useDensityGrid
    ? 'sampleDensityOnlyFromGrid(samplePos)'
    : 'sampleDensity(samplePos, uniforms.time * uniforms.timeScale, uniforms)'

  // Replace the density sampling calls in the emission block
  // The emissionBlock is a template literal, so we use string replacement
  let result = emissionBlock

  // Replace shadow sampling
  result = result.replace(
    'let rhoS = sampleDensity(shadowPos, uniforms.time * uniforms.timeScale, uniforms);',
    `let rhoS = ${shadowSampleCall};`
  )

  // Replace AO sampling
  result = result.replace(
    'let sampleRho = sampleDensity(samplePos, uniforms.time * uniforms.timeScale, uniforms);',
    `let sampleRho = ${aoSampleCall};`
  )

  return result
}
