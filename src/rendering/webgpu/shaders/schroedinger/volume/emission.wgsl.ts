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
 * @module rendering/webgpu/shaders/schroedinger/volume/emission.wgsl
 */

/**
 * Generate emission pre-block WGSL with only the helpers needed by the active algorithm.
 *
 * Conditional:
 * - PHASE_HUE_INFLUENCE: algorithms 3, 4
 * - applyDistributionS(): algorithms 0, 1, 2
 * - henyeyGreenstein(): 3D volumetric only (computeEmissionLit)
 *
 * Always included:
 * - blackbody(): referenced in main.wgsl.ts / main2D.wgsl.ts behind
 *   FEATURE_PHASE_MATERIALITY guards (WGSL requires symbol resolution in dead branches)
 */
export function generateEmissionPreBlock(colorAlgorithm: number, is2D: boolean): string {
  const parts: string[] = [
    /* wgsl */ `
// ============================================
// Volume Emission Color
// ============================================
// Note: LIGHT_TYPE_* constants are defined in shared/core/constants.wgsl.ts`,
  ]

  // PHASE_HUE_INFLUENCE: only algorithms 3 (Phase) and 4 (Mixed)
  if (colorAlgorithm === 3 || colorAlgorithm === 4) {
    parts.push(/* wgsl */ `
// Phase influence on hue (0.0 = no phase color, 1.0 = full rainbow)
const PHASE_HUE_INFLUENCE: f32 = 0.4;`)
  }

  // blackbody(): always included — called by algorithm 5 directly, and referenced by
  // phase materiality blocks in emissionPostBlock, main.wgsl.ts, and main2D.wgsl.ts
  // (WGSL requires symbol resolution even in dead branches behind compile-time const guards)
  parts.push(/* wgsl */ `
// Blackbody color from temperature in Kelvin (Tanner Helland approximation)
// Based on CIE 1964 color matching data. Produces physically plausible
// dim-red → orange → white → blue-white ramp across 1000–40000 K.
fn blackbody(Temp: f32) -> vec3f {
  if (Temp <= 0.0) { return vec3f(0.0); }
  let t = Temp / 100.0;
  var r: f32; var g: f32; var b: f32;

  // Red
  if (t <= 66.0) {
    r = 255.0;
  } else {
    r = 329.698727446 * pow(t - 60.0, -0.1332047592);
  }

  // Green
  if (t <= 66.0) {
    g = 99.4708025861 * log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
  }

  // Blue
  if (t >= 66.0) {
    b = 255.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
  }

  return clamp(vec3f(r, g, b) / 255.0, vec3f(0.0), vec3f(1.0));
}`)

  // henyeyGreenstein(): only 3D volumetric (used by computeEmissionLit in post-block)
  if (!is2D) {
    parts.push(/* wgsl */ `
// Henyey-Greenstein Phase Function for anisotropic scattering
fn henyeyGreenstein(dotLH: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = max(1.0 + g2 - 2.0 * g * dotLH, 0.001);
  // PERF: pow(x, 1.5) = x * sqrt(x), avoids exp(1.5*log(x)) ~12 cycle savings
  let denomSqrt = sqrt(denom);
  return (1.0 - g2) / (4.0 * PI * denom * denomSqrt);
}`)
  }

  // applyDistributionS(): algorithms 0, 1, 2
  if (colorAlgorithm === 0 || colorAlgorithm === 1 || colorAlgorithm === 2) {
    parts.push(/* wgsl */ `
// Apply distribution function for color algorithms
fn applyDistributionS(t: f32, power: f32, cycles: f32, offset: f32) -> f32 {
  let clamped = clamp(t, 0.0, 1.0);
  // Guard pow() - ensure base > 0 and power >= small value
  let safePower = max(power, 0.001);
  let safeBase = max(clamped, 0.0001);
  let curved = pow(safeBase, safePower);
  // Clamp before fract to avoid fract(1.0)=0 discontinuity at peak density
  return fract(clamp(curved * cycles + offset, 0.0, 0.999));
}`)
  }

  // viridis(): algorithms 19 (Viridis) and 21 (Density Contours)
  if (colorAlgorithm === 19 || colorAlgorithm === 21) {
    parts.push(/* wgsl */ `
// Viridis colormap — 5-stop piecewise-linear approximation in linear RGB
fn viridis(t: f32) -> vec3f {
  var r: f32; var g: f32; var b: f32;
  if (t < 0.25) {
    let u = t / 0.25;
    r = mix(0.267, 0.282, u); g = mix(0.004, 0.140, u); b = mix(0.329, 0.457, u);
  } else if (t < 0.5) {
    let u = (t - 0.25) / 0.25;
    r = mix(0.282, 0.127, u); g = mix(0.140, 0.566, u); b = mix(0.457, 0.550, u);
  } else if (t < 0.75) {
    let u = (t - 0.5) / 0.25;
    r = mix(0.127, 0.741, u); g = mix(0.566, 0.873, u); b = mix(0.550, 0.150, u);
  } else {
    let u = (t - 0.75) / 0.25;
    r = mix(0.741, 0.993, u); g = mix(0.873, 0.906, u); b = mix(0.150, 0.144, u);
  }
  return vec3f(r, g, b);
}`)
  }

  // applyPhaseMateriality(): shared plasma/smoke color modulation for all render modes.
  // Depends on blackbody() (above). Placed before applyHDREmissionGlow since both are
  // called sequentially in the same main blocks.
  parts.push(/* wgsl */ `
// Phase materiality: modulate surface color based on quantum phase.
// Positive phase → plasma (blackbody), negative phase → cool smoke.
fn applyPhaseMateriality(baseColor: vec3f, phase: f32, s: f32, u: SchroedingerUniforms) -> vec3f {
  let phaseMod = fract((phase + PI) / TAU);
  let plasmaWeight = smoothstep(0.35, 0.65, phaseMod);
  let smokeWeight = 1.0 - plasmaWeight;
  let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
  let plasmaColor = blackbody(normalizedRho * 8000.0 + 2000.0);
  let smokeColor = vec3f(0.08, 0.08, 0.25) * max(length(baseColor), 0.1);
  return mix(baseColor,
    plasmaColor * plasmaWeight + smokeColor * smokeWeight,
    u.phaseMaterialityStrength);
}`)

  // applyHDREmissionGlow(): shared post-lighting emission glow for all render modes.
  // Placed in pre-block (always included) so both 2D main blocks and 3D isosurface/
  // volumetric can call it. Depends on rgb2hsl/hsl2rgb from the HSL block (composed earlier).
  parts.push(/* wgsl */ `
// HDR emission glow with optional color shift via HSL.
// Adds emissive contribution to already-lit color based on log-density threshold.
fn applyHDREmissionGlow(col: vec3f, baseColor: vec3f, s: f32, u: SchroedingerUniforms) -> vec3f {
  if (u.emissionIntensity <= 0.0) { return col; }
  let emNorm = clamp((s + 8.0) / 8.0, 0.0, 1.0);
  if (emNorm <= u.emissionThreshold) { return col; }
  var emFactor = (emNorm - u.emissionThreshold) / (1.0 - u.emissionThreshold);
  emFactor = emFactor * emFactor;
  var emColor = baseColor;
  if (abs(u.emissionColorShift) > 0.01) {
    var hsl = rgb2hsl(emColor);
    if (u.emissionColorShift > 0.0) {
      hsl.x = mix(hsl.x, 0.08, u.emissionColorShift * 0.5);
      hsl.y = mix(hsl.y, 1.0, u.emissionColorShift * 0.3);
    } else {
      hsl.x = mix(hsl.x, 0.6, -u.emissionColorShift * 0.5);
      hsl.z = mix(hsl.z, 0.9, -u.emissionColorShift * 0.3);
    }
    emColor = hsl2rgb(hsl.x, hsl.y, hsl.z);
  }
  return col + emColor * u.emissionIntensity * emFactor;
}`)

  return parts.join('\n')
}

// ---- Algorithm branch generators ----
// Each returns the WGSL body lines for col assignment (no fn signature, no return)

const ALGO_BRANCH: Record<number, string> = {
  0: /* wgsl */ `
    // 0: LCH/Oklab perceptual hue rotation
    let distributedT = applyDistributionS(normalized, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    // Maps distributedT to hue angle in Oklab color space
    let hue = distributedT * TAU;
    let oklab = vec3f(uniforms.lchLightness, uniforms.lchChroma * cos(hue), uniforms.lchChroma * sin(hue));
    col = clamp(oklab2rgb(oklab), vec3f(0.0), vec3f(1.0));`,

  1: /* wgsl */ `
    // 1: Multi-source - blend density + radial + vertical through cosine palette
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

  2: /* wgsl */ `
    // 2: Radial - color by distance from center through cosine palette
    let rawRadialT = clamp(length(pos) / uniforms.boundingRadius, 0.0, 1.0);
    let radialT = applyDistributionS(rawRadialT, uniforms.distPower, uniforms.distCycles, uniforms.distOffset);
    let a = uniforms.cosineA.xyz;
    let b = uniforms.cosineB.xyz;
    let c = uniforms.cosineC.xyz;
    let d = uniforms.cosineD.xyz;
    col = cosinePalette(radialT, a, b, c, d);`,

  3: /* wgsl */ `
    // 3: Quantum Phase coloring
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    col = hsl2rgb(hue, 0.75, 0.35);`,

  4: /* wgsl */ `
    // 4: Mixed (Quantum Phase + Density) - DEFAULT
    let phaseNorm = (phase + PI) / TAU;
    let hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
    let hue = fract(baseHSL.x + hueShift);
    let lightness = 0.15 + 0.35 * normalized;
    let saturation = 0.7 + 0.25 * normalized;
    col = hsl2rgb(hue, saturation, lightness);`,

  5: /* wgsl */ `
    // 5: Blackbody (Heat)
    // Map normalized log-density to temperature. Low density → cold, high → hot.
    let temp = normalized * 12000.0;
    // Smooth fade-out below 1500 K instead of hard cutoff at 500 K.
    // The hard cutoff created zero-emission regions that still accumulated
    // opacity in the raymarcher, producing dark opaque blobs for wide
    // wavepackets (where much of the volume has moderate density).
    // Clamp temp ≥ 1000 K for blackbody() (Tanner-Helland approximation
    // is only valid above ~1000 K and produces spurious bright red below).
    let coldFade = smoothstep(0.0, 1500.0, temp);
    col = blackbody(max(temp, 1000.0)) * coldFade;`,

  6: /* wgsl */ `
    // 6: Perceptually uniform cyclic phase map (phase-only)
    // PERF: cos/sin are 2π-periodic, so (phase + PI) directly gives the hue angle
    // without the fract((phase + PI) / TAU) * TAU roundtrip (saves fract + div + mul)
    let hueAngle = phase + PI;
    let cyclicOklab = vec3f(0.72, 0.11 * cos(hueAngle), 0.11 * sin(hueAngle));
    col = clamp(oklab2rgb(cyclicOklab), vec3f(0.0), vec3f(1.0));`,

  7: /* wgsl */ `
    // 7: Signed diverging phase map (Wigner-style sign encoding proxy)
    let phaseSignCarrier = cos(phase);
    let signStrength = abs(phaseSignCarrier);
    let positiveWing = uniforms.divergingPositiveParams.xyz;
    let negativeWing = uniforms.divergingNegativeParams.xyz;
    let wing = select(negativeWing, positiveWing, phaseSignCarrier >= 0.0);
    let neutral = uniforms.divergingNeutralParams.xyz;
    col = mix(neutral, wing, signStrength) * (0.2 + 0.8 * normalized);`,

  8: /* wgsl */ `
    // 8: Domain coloring for wavefunction psi (phase hue + log-modulus lightness)
    let phaseNorm = fract((phase + PI) / TAU);
    let modulusMode = uniforms.domainColoringParams0.x >= 0.5;
    // s = log(|psi|^2).  Mode 0 uses s directly; mode 1 uses s*0.5 = log(|psi|).
    // Both normalize against the same 8.0 window so the different log scaling
    // produces visibly different tonal distributions:
    //   log|psi|^2: full range [-8,0] -> lightness [0.08, 0.90]  (high contrast)
    //   log|psi|:   half range [-4,0] -> lightness [0.49, 0.90]  (brighter, more tail detail)
    // QW grid stores log(normDensity) in G channel — same normalization works.
    let logModulus = select(s, s * 0.5, modulusMode);
    let modulusValue = clamp((logModulus + 8.0) / 8.0, 0.0, 1.0);
    let baseLightness = clamp(0.08 + 0.82 * modulusValue, 0.0, 1.0);
    col = hsl2rgb(phaseNorm, 0.85, baseLightness);

    let contoursEnabled = uniforms.domainColoringParams0.y >= 0.5;
    if (contoursEnabled) {
      let contourDensity = max(uniforms.domainColoringParams0.z, 1.0);
      let contourWidth = clamp(uniforms.domainColoringParams0.w, 0.005, 0.25);
      let contourStrength = clamp(uniforms.domainColoringParams1.x, 0.0, 1.0);
      let contourPhase = fract(logModulus * contourDensity);
      let lineDistance = min(contourPhase, 1.0 - contourPhase);
      // Derivative-free feathering width to keep WGSL valid in non-uniform control paths.
      let antiAlias = max(0.0005, contourWidth * 0.35);
      let lineMask = 1.0 - smoothstep(contourWidth, contourWidth + antiAlias, lineDistance);
      let darken = 1.0 - contourStrength * lineMask * 0.85;
      col *= darken;
    }`,

  9: /* wgsl */ `
    // 9: Zero-centered diverging map for Re/Im(psi)
    // divergingPositiveParams.w: 0.0 = Re(psi) via cos, 1.0 = Im(psi) via sin
    let useImag = uniforms.divergingPositiveParams.w >= 0.5;
    let signedVal = normalized * select(cos(phase), sin(phase), useImag);
    let signStrength = clamp(abs(signedVal), 0.0, 1.0);
    let neutral = uniforms.divergingNeutralParams.xyz;
    let positiveWing = uniforms.divergingPositiveParams.xyz;
    let negativeWing = uniforms.divergingNegativeParams.xyz;
    let wing = select(negativeWing, positiveWing, signedVal >= 0.0);
    let intensityFloor = clamp(uniforms.divergingNeutralParams.w, 0.0, 1.0);
    let intensity = intensityFloor + (1.0 - intensityFloor) * signStrength;
    col = mix(neutral, wing, signStrength) * intensity;`,

  10: /* wgsl */ `
    // 10: Relative phase to spatial reference.
    // phase is expected to be arg(conj(psi_ref) * psi), precomputed in density sampling.
    // Lightness uses normalized |psi|^2 so students can read probability amplitude directly.
    let relativePhaseNorm = fract((phase + PI) / TAU);
    let rhoNorm = clamp(rho / max(uniforms.peakDensity, 1e-8), 0.0, 1.0);
    col = hsl2rgb(relativePhaseNorm, 0.85, rhoNorm);`,

  11: /* wgsl */ `
    // 11: Radial Distance (spectral)
    let r = length(pos);
    let distanceNorm = clamp(r / uniforms.boundingRadius, 0.0, 1.0);
    let hue = 0.8 * distanceNorm;
    col = hsl2rgb(hue, 1.0, 0.5);`,

  12: /* wgsl */ `
    // 12: Hamiltonian Decomposition — K(red)/G(green)/V(blue) energy fractions
    let analysis = sampleAnalysisFromGrid(pos, uniforms);
    let K = analysis.r;
    let G = analysis.g;
    let V = analysis.b;
    let E = analysis.a;
    let eps = 1e-6;
    let invE = 1.0 / (E + eps);
    let brightness = clamp((log(E + eps) + 8.0) / 8.0, 0.0, 1.0);
    col = vec3f(K, G, V) * (invE * brightness);`,

  13: /* wgsl */ `
    // 13: Mode Character Map — wave-like (gradient) vs mass-dominated (potential)
    let analysis = sampleAnalysisFromGrid(pos, uniforms);
    let G = analysis.g;
    let V = analysis.b;
    let E = analysis.a;
    // PERF: atan2(V/(E+eps), G/(E+eps)) = atan2(V, G) — common denominator cancels
    let C = atan2(V, G) / (PI * 0.5);
    let charHue = clamp(C, 0.0, 1.0) * 0.8;
    let charBrightness = clamp(sqrt(E) * 2.0, 0.0, 1.0);
    let charSaturation = clamp(E * 10.0, 0.0, 1.0);
    col = hsl2rgb(charHue, charSaturation, charBrightness * 0.5);`,

  14: /* wgsl */ `
    // 14: Energy Flux Map — direction color wheel + magnitude brightness
    let analysis = sampleAnalysisFromGrid(pos, uniforms);
    let S = analysis.rgb;
    let Smag = analysis.a;
    let eps = 1e-6;
    // PERF: atan2(S.z/mag, S.x/mag) = atan2(S.z, S.x) — skip normalization for hue
    let fluxHue = fract(atan2(S.z, S.x) / TAU + 0.5);
    let invSmag = 1.0 / (Smag + eps);
    let elevation = S.y * invSmag * 0.5 + 0.5;
    let fluxBrightness = clamp(log(Smag + eps) / 4.0 + 1.0, 0.0, 1.0);
    col = hsl2rgb(fluxHue, 0.8, mix(0.2, 0.6, elevation)) * fluxBrightness;`,

  15: /* wgsl */ `
    // 15: k-Space Occupation Map — sequential colormap by occupation number
    let analysis = sampleAnalysisFromGrid(pos, uniforms);
    let nk = max(analysis.r, 0.0);
    let logNk = clamp(log(nk + 1e-6) / 8.0 + 1.0, 0.0, 1.0);
    // Viridis-like: low n_k → deep blue, mid → teal, high → yellow
    let hue = mix(0.7, 0.12, logNk);
    let saturation = mix(0.6, 0.95, smoothstep(0.0, 0.5, logNk));
    let lightness = mix(0.08, 0.55, logNk);
    col = hsl2rgb(hue, saturation, lightness);`,

  // ===== OPEN QUANTUM COLOR ALGORITHMS =====
  // In density matrix mode, the density grid's B channel (passed as 'phase')
  // carries the coherence fraction: 1 - diag/total. 0 = fully diagonal (decohered),
  // 1 = fully off-diagonal (maximally coherent).

  16: /* wgsl */ `
    // 16: Purity Map — warm tones, saturation from coherence fraction
    // High coherence → vivid plasma, decohered → muted/desaturated
    let coherence = clamp(phase, 0.0, 1.0);
    let hue = mix(0.08, 0.02, normalized); // warm orange-red range
    let saturation = mix(0.15, 0.9, coherence); // pure=vivid, mixed=muted
    let lightness = mix(0.12, 0.52, normalized);
    col = hsl2rgb(hue, saturation, lightness);`,

  17: /* wgsl */ `
    // 17: Entropy Map — blue (ordered/pure) to red (disordered/mixed)
    // Maps coherence fraction to a diverging blue-white-red scale
    let coherence = clamp(phase, 0.0, 1.0);
    // Invert: high coherence = low entropy = blue, low coherence = high entropy = red
    let entropy_t = 1.0 - coherence;
    let hue = mix(0.62, 0.02, entropy_t); // blue(0.62) → red(0.02)
    let saturation = mix(0.3, 0.85, abs(entropy_t - 0.5) * 2.0); // desaturate at midpoint
    let lightness = mix(0.15, 0.55, normalized);
    col = hsl2rgb(hue, saturation, lightness);`,

  18: /* wgsl */ `
    // 18: Coherence Map — cyan (high coherence) to amber (low coherence)
    // Most informative: shows spatial variation of quantum coherence
    let coherence = clamp(phase, 0.0, 1.0);
    let hue = mix(0.1, 0.5, coherence); // amber(0.1) → cyan(0.5)
    let saturation = mix(0.6, 0.92, coherence);
    let lightness = mix(0.10, 0.50, normalized);
    col = hsl2rgb(hue, saturation, lightness);`,

  // ===== SCIENTIFIC COLORMAPS (density grid modes: TDSE / BEC) =====

  19: /* wgsl */ `
    // 19: Viridis — perceptually uniform, colorblind-safe scientific colormap
    col = viridis(clamp(normalized, 0.0, 1.0));`,

  20: /* wgsl */ `
    // 20: Inferno — high-contrast scientific colormap, resolves low-density features
    // 5-stop piecewise-linear: black → dark purple → red-orange → yellow → white
    let t = clamp(normalized, 0.0, 1.0);
    var ir: f32; var ig: f32; var ib: f32;
    if (t < 0.25) {
      let u = t / 0.25;
      ir = mix(0.001, 0.258, u); ig = mix(0.000, 0.039, u); ib = mix(0.014, 0.406, u);
    } else if (t < 0.5) {
      let u = (t - 0.25) / 0.25;
      ir = mix(0.258, 0.865, u); ig = mix(0.039, 0.138, u); ib = mix(0.406, 0.082, u);
    } else if (t < 0.75) {
      let u = (t - 0.5) / 0.25;
      ir = mix(0.865, 0.987, u); ig = mix(0.138, 0.645, u); ib = mix(0.082, 0.040, u);
    } else {
      let u = (t - 0.75) / 0.25;
      ir = mix(0.987, 0.988, u); ig = mix(0.645, 0.998, u); ib = mix(0.040, 0.645, u);
    }
    col = vec3f(ir, ig, ib);`,

  21: /* wgsl */ `
    // 21: Density Contours — isodensity contour lines on density colormap
    // Topographic-style visualization showing quantized density levels.
    // Useful for verifying Thomas-Fermi profiles, soliton notch depths, vortex cores.
    let t = clamp(normalized, 0.0, 1.0);
    col = viridis(t);
    // Overlay contour lines at 10 evenly-spaced density levels
    let contourT = fract(t * 10.0);
    let lineDistance = min(contourT, 1.0 - contourT);
    let lineMask = 1.0 - smoothstep(0.03, 0.06, lineDistance);
    col *= (1.0 - 0.7 * lineMask);`,

  22: /* wgsl */ `
    // 22: Phase-Density Composite — hue=phase, brightness=density
    // Simultaneously shows condensate shape and phase structure.
    // Vortex cores appear dark (zero density) with phase winding (hue rotation).
    // Solitons appear as dark bands with π phase jump across the notch.
    // Log-compressed 'normalized' provides good dynamic range for all compute modes
    // including QW's sparse lattice (normDensity 0.01 → brightness 0.42).
    let phaseNorm = fract((phase + PI) / TAU);
    let brightness = clamp(normalized, 0.0, 1.0);
    // Use higher saturation at higher density for visual clarity
    let saturation = mix(0.3, 0.95, brightness);
    let lightness = brightness * 0.55;
    col = hsl2rgb(phaseNorm, saturation, lightness);`,

  // ===== DIRAC EQUATION COLOR ALGORITHMS =====

  23: /* wgsl */ `
    // 23: Particle / Antiparticle Split (Dirac dual-channel)
    // Density grid encoding: R = particle density, G = antiparticle density, B = phase.
    // In computeBaseColor: rho = R, s = G, phase = B.
    // Maps particle → blue-cyan, antiparticle → red-magenta with additive blending.
    let particleDensity = clamp(rho, 0.0, 1.0);
    let antiparticleDensity = clamp(s, 0.0, 1.0);
    // Blue-cyan for particle component
    let pColor = vec3f(0.1, 0.55, 0.95) * particleDensity;
    // Red-magenta for antiparticle component
    let aColor = vec3f(0.95, 0.15, 0.45) * antiparticleDensity;
    // Additive blending of both components
    col = pColor + aColor;
    // Phase (B channel) modulates brightness (subtle variation)
    let phaseBrightness = 0.7 + 0.3 * cos(phase);
    col *= phaseBrightness;`,

  // ===== PAULI SPINOR COLOR ALGORITHMS =====
  // Density grid encoding: R = spin-up |ψ↑|², G = spin-down |ψ↓|², B = phase, A = total.
  // Raymarcher passes rho = R (spin-up), s = G (spin-down) via IS_DUAL_CHANNEL path.

  24: /* wgsl */ `
    // 24: Pauli Spin Density — user-configurable spin-up/down colors
    // Additive blend produces mixed hue where both components overlap.
    let upDensity = clamp(rho, 0.0, 1.0);
    let downDensity = clamp(s, 0.0, 1.0);
    let upColor = uniforms.pauliSpinUpColor * upDensity;
    let downColor = uniforms.pauliSpinDownColor * downDensity;
    col = upColor + downColor;
    // Subtle phase modulation on brightness
    let spinPhaseBrightness = 0.75 + 0.25 * cos(phase);
    col *= spinPhaseBrightness;`,

  25: /* wgsl */ `
    // 25: Pauli Spin Expectation — diverging blue/red for ⟨σ_z⟩
    // R channel = σ_z⁺ (spin-up bias), G channel = σ_z⁻ (spin-down bias)
    // Total density = R + G gates overall brightness.
    let upBias = clamp(rho, 0.0, 1.0);
    let downBias = clamp(s, 0.0, 1.0);
    let totalGate = clamp(upBias + downBias, 0.0, 1.0);
    // Blue for spin-up dominant, red for spin-down dominant
    let blueWing = vec3f(0.15, 0.35, 0.95);
    let redWing = vec3f(0.95, 0.20, 0.15);
    let neutral = vec3f(0.85, 0.85, 0.85);
    // sigmaZ in [-1, 1] from the dual channels
    let sigmaZ = select((upBias - downBias) / totalGate, 0.0, totalGate < 1e-6);
    let wing = select(redWing, blueWing, sigmaZ >= 0.0);
    let strength = abs(sigmaZ);
    col = mix(neutral, wing, strength) * (0.3 + 0.7 * totalGate);`,

  26: /* wgsl */ `
    // 26: Pauli Coherence — cyan/teal for off-diagonal spinor coherence
    // Single-channel: R = |ψ↑* ψ↓|, G = log(coh), standard density path.
    // High coherence → vivid cyan-teal, low → dim.
    let cohValue = clamp(normalized, 0.0, 1.0);
    let hue = mix(0.48, 0.52, cohValue);
    let saturation = mix(0.4, 0.95, cohValue);
    let lightness = mix(0.08, 0.50, cohValue);
    col = hsl2rgb(hue, saturation, lightness);`,

  // 27: Bohmian quantum potential Q(x) = -½ ∇²R / R. Q + V = E for any stationary
  // state. Hue encodes sign (red=positive/pressure, cyan=negative/concentration);
  // sqrt-compressed |Q|/8 drives saturation+lightness from a dim-gray baseline so
  // Q ≈ 0 voxels render as visually neutral. Must stay in lockstep with
  // `computeQuantumPotentialPreviewColor` in colorPreviewGradient.ts.
  27: /* wgsl */ `
    let qClamped = clamp(computeQuantumPotentialFromGrid(pos, uniforms), -16.0, 16.0);
    let qStrength = sqrt(clamp(abs(qClamped) / 8.0, 0.0, 1.0));
    let qHue = select(0.50, 0.02, qClamped >= 0.0);
    col = hsl2rgb(qHue, 0.85 * qStrength, 0.18 + 0.52 * qStrength);`,

  // 28: Vortex Density — per-voxel topological charge from plaquette phase winding.
  // nu(x) = (|W_xy| + |W_yz| + |W_zx|) / (2*pi). Brightness and saturation ramp with
  // nu in [0, 3]; hue is pinned to a warm red indicating "defect here".
  28: /* wgsl */ `
    let nu = computeVortexDensityFromGrid(pos, uniforms);
    let vortexStrength = clamp(nu, 0.0, 3.0) / 3.0;
    let vortexLight = 0.05 + 0.60 * vortexStrength;
    col = hsl2rgb(0.02, 0.2 + 0.75 * vortexStrength, vortexLight);`,
}

/** Human-readable names for color algorithms (indexed by number value) */
export { ALGO_BRANCH }
export { COLOR_ALG_NAMES } from './emissionConstants'

/**
 * Generate the computeBaseColor() WGSL function for a specific color algorithm.
 * Emits only that algorithm's branch (no if/else chain) for compile-time specialization.
 */
export function generateComputeBaseColor(colorAlgorithm: number): string {
  // Only algorithms 3 (Phase) and 4 (Mixed) use baseHSL from material color
  const needsBaseHSL = colorAlgorithm === 3 || colorAlgorithm === 4
  const header = /* wgsl */ `
// Compute base surface color (no lighting applied)
// PERF: accepts pre-computed log-density s to avoid redundant log() call
fn computeBaseColor(rho: f32, s: f32, phase: f32, pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // Normalize log-density to [0, 1] range for color mapping
  let normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);
${needsBaseHSL ? "\n  // Get base color from material's base color\n  var baseHSL = rgb2hsl(material.baseColor.rgb);\n" : ''}
  var col = vec3f(0.0);
`

  const branch = ALGO_BRANCH[colorAlgorithm]
  if (!branch) {
    throw new Error(`Unknown colorAlgorithm: ${colorAlgorithm}`)
  }
  return header + branch + '\n\n  return col;\n}\n'
}

// emissionPostBlock (computeEmission + computeEmissionLit) extracted to emissionLit.wgsl.ts
