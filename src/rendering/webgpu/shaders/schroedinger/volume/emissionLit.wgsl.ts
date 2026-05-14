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
// Light helpers called by isosurface shaders (volumetric path inlines these
// directly for fewer struct reads per light).

fn safeNormalizeEmission(v: vec3f, fallback: vec3f) -> vec3f {
  let lenSq = dot(v, v);
  if (lenSq < 1.0e-12) { return fallback; }
  return v * inverseSqrt(lenSq);
}

fn getEmissionLightDir(lightIdx: i32, pos: vec3f) -> vec3f {
  let light = lighting.lights[lightIdx];
  let lightType = i32(light.position.w);
  if (lightType == LIGHT_TYPE_DIRECTIONAL) {
    return safeNormalizeEmission(-light.direction.xyz, vec3f(0.0, 0.0, 1.0));
  } else {
    return safeNormalizeEmission(light.position.xyz - pos, vec3f(0.0, 0.0, 1.0));
  }
}

fn getEmissionLightAttenuation(lightIdx: i32, distance: f32) -> f32 {
  let light = lighting.lights[lightIdx];
  let lightRange = light.direction.w;
  let decay = light.params.x;
  if (lightRange <= 0.0) { return 1.0; }
  let d = max(distance, EPS_DIVISION);
  let rangeAttenuation = clamp(1.0 - d / lightRange, 0.0, 1.0);
  return pow(rangeAttenuation, decay);
}

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
  // No lights: ambient + HDR glow only (preserves emission glow on ambient-only scenes)
  if (lighting.lightCount == 0) {
    var ambientCol = computeEmission(rho, s, phase, p, uniforms);
    return applyHDREmissionGlow(ambientCol, ambientCol, s, uniforms);
  }

  var surfaceColor = computeBaseColor(rho, s, phase, p, uniforms);

  // Phase materiality (shared helper)
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    surfaceColor = applyPhaseMateriality(surfaceColor, phase, s, uniforms);
  }

  // Start with ambient (Lambertian — no PBR metallic suppression for volumetric)
  var col = surfaceColor * lighting.ambientColor * lighting.ambientIntensity;

  // Normalize gradient as pseudo-normal; fallback to view direction at the
  // wavefunction peak where ∇log(ρ) is zero. Uses rsqrt(dot) instead of
  // length+divide (1 rsqrt vs 1 sqrt + 1 reciprocal — ~2× cheaper on GPU).
  let gradDot = dot(gradient, gradient);
  var n: vec3f;
  if (gradDot < 1.0e-8) {
    n = viewDir;
  } else {
    let invGradLen = inverseSqrt(gradDot);
    n = gradient * invGradLen;
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

  // Pre-compute diffuse color factor (light-independent).
  // PERF: * INV_PI replaces a vec3 divide (3 divs) with a vec3 mul (3 muls).
  let diffuseBase = surfaceColor * INV_PI;

  // PERF: Pre-compute scattering state outside loop (uniform across all lights)
  let hasScattering = abs(uniforms.scatteringAnisotropy) > 0.01;

  // Loop through lights — inlined helper functions to avoid redundant
  // lighting.lights[i] struct reads (was 4x per light, now 1x)
  for (var i = 0; i < MAX_LIGHTS; i++) {
    if (i >= lighting.lightCount) { break; }

    let light = lighting.lights[i];
    if (light.params.w < 0.5) { continue; }
    let lightIntensity = light.color.a;
    if (lightIntensity < 0.001) { continue; }

    let lightType = i32(light.position.w);

    // Fuse surface->light direction with the distance calculation so the
    // (position - p) delta is computed ONCE per point/spot light per sample.
    // Old path paid a dot3 + sqrt for length() on top of the normalize; the
    // fused form reuses lenSq * invLen = sqrt(lenSq).
    var l: vec3f;
    var lightDistance: f32 = 0.0;
    if (lightType == LIGHT_TYPE_DIRECTIONAL) {
      l = safeNormalizeEmission(-light.direction.xyz, -viewDir);
    } else {
      let delta = light.position.xyz - p;
      let lenSq = max(dot(delta, delta), 1.0e-12);
      let invLen = inverseSqrt(lenSq);
      l = delta * invLen;
      lightDistance = lenSq * invLen;
    }

    var attenuation = lightIntensity;

    // Inlined attenuation + spot falloff
    if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
      let lightRange = light.direction.w;
      if (lightRange > 0.0) {
        let d = max(lightDistance, EPS_DIVISION);
        let rangeAttenuation = clamp(1.0 - d / lightRange, 0.0, 1.0);
        attenuation *= pow(rangeAttenuation, light.params.x);
      }

      if (lightType == LIGHT_TYPE_SPOT) {
        // lightToFrag is -l (l is already the surface->light unit vector).
        let spotDir = safeNormalizeEmission(light.direction.xyz, viewDir);
        let cosAngle = dot(-l, spotDir);
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
    // PERF: pre-multiply scalars (NdotL · attenuation · powder · phaseFactor)
    // before applying to the vec3 color terms — saves ~6 vec3 muls per light.
    let lightScalar = NdotL * attenuation * powder * phaseFactor;
    col += diffuseBase * light.color.rgb * lightScalar;

    // Subsurface Scattering (SSS) — noise/transmission pre-computed above
    if (sssActive) {
      let halfVec = safeNormalizeEmission(l + n * sssJitteredDistortion, n);
      let trans = pow(clamp(dot(viewDir, -halfVec), 0.0, 1.0), material.sssThickness * 4.0);
      col += material.sssColor * light.color.rgb * (trans * sssTransmission) * material.sssIntensity * attenuation;
    }
  }

  // HDR Emission Glow (shared helper)
  col = applyHDREmissionGlow(col, surfaceColor, s, uniforms);

  return col;
}
`
