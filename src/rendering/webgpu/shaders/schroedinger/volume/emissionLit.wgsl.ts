/**
 * WGSL Lit emission: computeEmission() and computeEmissionLit()
 *
 * Extracted from emission.wgsl.ts to stay under the max-lines limit.
 * Requires: computeBaseColor, applyPhaseMateriality, applyHDREmissionGlow,
 * henyeyGreenstein, lighting/material uniforms, LIGHT_TYPE_* constants.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/emissionLit.wgsl
 */

/**
 * WGSL block containing computeEmission (ambient-only) and computeEmissionLit
 * (full scene lighting with inlined attenuation helpers).
 */
export const emissionPostBlock = /* wgsl */ `
// Compute emission with ambient lighting only (for fast mode)
// PERF: accepts pre-computed log-density s to avoid redundant log() call
fn computeEmission(rho: f32, s: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  var surfaceColor = computeBaseColor(rho, s, phase, pos, uniforms);

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    surfaceColor = applyPhaseMateriality(surfaceColor, phase, s, uniforms);
  }

  var col = surfaceColor * lighting.ambientColor * lighting.ambientIntensity;

  return col;
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

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    surfaceColor = applyPhaseMateriality(surfaceColor, phase, s, uniforms);
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

  // PERF: Hoist light-independent computations out of the per-light loop.
  // Powder effect depends only on rho/uniforms — same for all lights.
  var powder = 1.0;
  if (uniforms.powderScale > 0.0) {
    powder = 1.0 - exp(-rho * uniforms.densityGain * uniforms.powderScale * 4.0);
    powder = 0.5 + 1.5 * powder;
  }

  // SSS noise is position-dependent only — compute once for all lights.
  var sssJitteredDistortion = 0.5;
  var sssTransmission = 0.0;
  let sssActive = material.sssEnabled != 0u && material.sssIntensity > 0.0;
  if (sssActive) {
    let fragCoord = vec2f(p.x * 100.0, p.y * 100.0);
    let sssNoise = fract(sin(dot(fragCoord * 0.1, vec2f(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
    sssJitteredDistortion = 0.5 * (1.0 + sssNoise * material.sssJitter);
    sssTransmission = exp(-rho * material.sssThickness);
  }

  // Pre-compute diffuse color factor (light-independent)
  let diffuseBase = surfaceColor / PI;

  // PERF: Pre-compute scattering state outside loop (uniform across all lights)
  let hasScattering = abs(uniforms.scatteringAnisotropy) > 0.01;

  // Loop through lights — inlined helper functions to avoid redundant
  // lighting.lights[i] struct reads (was 4x per light, now 1x)
  for (var i = 0; i < 8; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    if (light.params.w < 0.5) { continue; }
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    let lightType = i32(light.position.w);

    // Inlined getEmissionLightDir
    var l: vec3f;
    if (lightType == LIGHT_TYPE_DIRECTIONAL) {
      l = normalize(-light.direction.xyz);
    } else {
      l = normalize(light.position.xyz - p);
    }

    var attenuation = lightIntensity;

    // Inlined getEmissionLightAttenuation + getEmissionSpotAttenuation
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let distance = length(light.position.xyz - p);
      let lightRange = light.direction.w;
      if (lightRange > 0.0) {
        let d = max(distance, EPS_DIVISION);
        let rangeAttenuation = clamp(1.0 - d / lightRange, 0.0, 1.0);
        attenuation *= pow(rangeAttenuation, light.params.x);
      }

      if (lightType == LIGHT_TYPE_SPOT) {
        let lightToFrag = normalize(p - light.position.xyz);
        let cosAngle = dot(lightToFrag, normalize(light.direction.xyz));
        attenuation *= smoothstep(light.params.z, light.params.y, cosAngle);
      }
    }

    if (attenuation < 0.001) { continue; }

    // Anisotropic scattering
    var phaseFactor = 1.0;
    if (hasScattering) {
      let cosTheta = dot(-l, viewDir);
      phaseFactor = henyeyGreenstein(cosTheta, uniforms.scatteringAnisotropy);
      phaseFactor *= 4.0 * PI;
    }

    let NdotL = max(dot(n, l), 0.0);
    col += diffuseBase * light.color.rgb * NdotL * attenuation * powder * phaseFactor;

    // Subsurface Scattering (SSS) — noise/transmission pre-computed above
    if (sssActive) {
      let halfVec = normalize(l + n * sssJitteredDistortion);
      let trans = pow(clamp(dot(viewDir, -halfVec), 0.0, 1.0), material.sssThickness * 4.0);
      col += material.sssColor * light.color.rgb * (trans * sssTransmission) * material.sssIntensity * attenuation;
    }
  }

  // HDR Emission Glow (shared helper)
  col = applyHDREmissionGlow(col, surfaceColor, s, uniforms);

  return col;
}
`
