/**
 * WGSL Emission color computation for volumetric rendering
 *
 * Computes the emission color at each point based on:
 * - User's color palette
 * - Density (brightness/saturation)
 * - Wavefunction phase (subtle hue modulation)
 *
 * Port of GLSL schroedinger/volume/emission.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/emission.wgsl
 */

export const emissionBlock = /* wgsl */ `
// ============================================
// Volume Emission Color
// ============================================

// Color algorithm constants
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

// Compute base surface color (no lighting applied)
fn computeBaseColor(rho: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // Normalize log-density to [0, 1] range for color mapping
  let s = sFromRho(rho);
  let normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);

  // Get base color from user's palette
  let baseHSL = rgb2hsl(uniforms.color);

  var col = vec3f(0.0);

  if (uniforms.colorAlgorithm == COLOR_ALG_PHASE) {
    // Algorithm 8: Quantum Phase coloring
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    col = hsl2rgb(vec3f(hue, 0.75, 0.35));
  }
  else if (uniforms.colorAlgorithm == COLOR_ALG_MIXED) {
    // Algorithm 9: Mixed (Quantum Phase + Density)
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    let lightness = 0.15 + 0.35 * normalized;
    let saturation = 0.7 + 0.25 * normalized;
    col = hsl2rgb(vec3f(hue, saturation, lightness));
  }
  else if (uniforms.colorAlgorithm == COLOR_ALG_BLACKBODY) {
    // Algorithm 10: Blackbody (Heat)
    let temp = normalized * 12000.0;
    if (temp < 500.0) { return vec3f(0.0); }
    col = blackbody(temp);
  }
  else {
    // Algorithms 0-7: Delegate to shared color system
    col = getColorByAlgorithm(normalized, vec3f(0.0, 1.0, 0.0), baseHSL, pos, uniforms);
  }

  return col;
}

// Compute emission with ambient lighting only (for fast mode)
fn computeEmission(rho: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let baseColor = computeBaseColor(rho, phase, pos, uniforms);
  var col = baseColor * max(1.0 - uniforms.metallic, 0.0) * uniforms.ambientColor * uniforms.ambientIntensity;

  if (uniforms.ambientEnabled == 0u) {
    col = vec3f(0.0);
  }

  return col;
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
  if (uniforms.numLights == 0) {
    return computeEmission(rho, phase, p, uniforms);
  }

  let surfaceColor = computeBaseColor(rho, phase, p, uniforms);

  // Start with ambient
  var col = surfaceColor * max(1.0 - uniforms.metallic, 0.0) * uniforms.ambientColor * uniforms.ambientIntensity;
  if (uniforms.ambientEnabled == 0u) {
    col = vec3f(0.0);
  }

  // Normalize gradient as pseudo-normal
  let gradLen = length(gradient);
  if (gradLen < 0.0001) { return col; }

  let n = gradient / gradLen;

  // Clamp roughness to prevent numerical issues
  let roughness = max(uniforms.roughness, 0.04);

  // Loop through lights
  for (var i = 0; i < 8; i++) {
    if (i >= uniforms.numLights) { break; }
    if (uniforms.lightsEnabled[i] == 0u) { continue; }

    let l = getLightDirection(i, p, uniforms);
    var attenuation = uniforms.lightIntensities[i];

    let lightType = uniforms.lightTypes[i];
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(uniforms.lightPositions[i] - p);
      attenuation *= getDistanceAttenuation(i, distance, uniforms);
    }

    if (lightType == LIGHT_TYPE_SPOT) {
      let lightToFrag = normalize(p - uniforms.lightPositions[i]);
      attenuation *= getSpotAttenuation(i, lightToFrag, uniforms);
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
    let F0 = mix(vec3f(0.04), surfaceColor, uniforms.metallic);
    let H = normalize(l + viewDir);
    let F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - uniforms.metallic);

    // Diffuse
    col += kD * surfaceColor / PI * uniforms.lightColors[i] * NdotL * attenuation * powder * phaseFactor;

    // Specular
    let specular = computePBRSpecular(n, viewDir, l, roughness, F0);

    // Volumetric self-shadowing (simplified for WGSL)
    var shadowFactor = 1.0;
    if (uniforms.shadowsEnabled && uniforms.shadowStrength > 0.0) {
      var shadowDens = 0.0;
      var shadowStep = 0.1;
      var tShadow = 0.05;

      let effectiveShadowSteps = select(uniforms.shadowSteps, max(uniforms.shadowSteps / 2, 1), uniforms.fastMode);
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

    col += specular * uniforms.specularColor * uniforms.lightColors[i] * NdotL * uniforms.specularIntensity * attenuation * shadowFactor;
  }

  return col;
}
`
