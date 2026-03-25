/**
 * WGSL Probability current (j-field) visualization
 *
 * Computes and renders the quantum probability current density
 * j = Im(psi* grad(psi)) using finite-difference gradients.
 * Supports multiple visualization styles: arrows, streamlines, and LIC.
 *
 * Extracted from integration.wgsl.ts for modularity.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/probabilityCurrent.wgsl
 */

/** Probability current j-field functions. */
export const probabilityCurrentBlock = /* wgsl */ `
// ============================================
// Physical Probability Current (j-field)
// ============================================

// Returns vec4f(jx, jy, jz, |j|).
fn sampleProbabilityCurrent(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  var delta = clamp(uniforms.probabilityCurrentStepSize, 0.005, 0.2);
  // Momentum-space fields vary faster; use a larger stencil for stability.
  if (uniforms.representationMode == REPRESENTATION_MOMENTUM) {
    delta = max(delta, 0.02);
  }
  let invTwoDelta = 0.5 / delta;

  let xND = mapPosToND(pos, uniforms);
  let psi = evalPsi(xND, t, uniforms);

  let psiPx = evalPsi(mapPosToND(pos + vec3f(delta, 0.0, 0.0), uniforms), t, uniforms);
  let psiMx = evalPsi(mapPosToND(pos - vec3f(delta, 0.0, 0.0), uniforms), t, uniforms);
  let psiPy = evalPsi(mapPosToND(pos + vec3f(0.0, delta, 0.0), uniforms), t, uniforms);
  let psiMy = evalPsi(mapPosToND(pos - vec3f(0.0, delta, 0.0), uniforms), t, uniforms);
  let psiPz = evalPsi(mapPosToND(pos + vec3f(0.0, 0.0, delta), uniforms), t, uniforms);
  let psiMz = evalPsi(mapPosToND(pos - vec3f(0.0, 0.0, delta), uniforms), t, uniforms);

  let dPsiDx = (psiPx - psiMx) * invTwoDelta;
  let dPsiDy = (psiPy - psiMy) * invTwoDelta;
  let dPsiDz = (psiPz - psiMz) * invTwoDelta;

  // j = Im(conj(psi) * grad(psi)) -> psi.re * grad(psi.im) - psi.im * grad(psi.re)
  var j = vec3f(
    psi.x * dPsiDx.y - psi.y * dPsiDx.x,
    psi.x * dPsiDy.y - psi.y * dPsiDy.x,
    psi.x * dPsiDz.y - psi.y * dPsiDz.x
  );

  // Keep physical current magnitude aligned with hydrogen-ND density scaling.
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    j *= uniforms.hydrogenNDBoost;
  }

  let jMag = length(j);
  return vec4f(j, jMag);
}

fn computeProbabilityCurrentColor(
  pos: vec3f,
  currentDir: vec3f,
  currentMag: f32,
  uniforms: SchroedingerUniforms
) -> vec3f {
  let magNorm = 1.0 - exp(-currentMag * 1.5);

  if (uniforms.probabilityCurrentColorMode == PROBABILITY_CURRENT_COLOR_MODE_DIRECTION) {
    return currentDir * 0.5 + vec3f(0.5);
  }

  if (uniforms.probabilityCurrentColorMode == PROBABILITY_CURRENT_COLOR_MODE_CIRCULATION_SIGN) {
    let swirlZ = pos.x * currentDir.y - pos.y * currentDir.x;
    let swirlT = smoothstep(-0.25, 0.25, swirlZ);
    let negativeColor = vec3f(0.2, 0.55, 1.0);
    let positiveColor = vec3f(1.0, 0.55, 0.2);
    let swirlColor = mix(negativeColor, positiveColor, swirlT);
    return swirlColor * (0.35 + 0.65 * magNorm);
  }

  let low = vec3f(0.08, 0.35, 0.9);
  let high = vec3f(1.0, 0.85, 0.15);
  return mix(low, high, clamp(magNorm, 0.0, 1.0));
}

// Returns vec4f(color.rgb, alpha).
fn computeProbabilityCurrentOverlay(
  pos: vec3f,
  currentSample: vec4f,
  localRho: f32,
  surfaceNormal: vec3f,
  viewDir: vec3f,
  uniforms: SchroedingerUniforms
) -> vec4f {
  if (uniforms.probabilityCurrentEnabled == 0u) {
    return vec4f(0.0);
  }

  if (localRho < max(uniforms.probabilityCurrentDensityThreshold, 0.0)) {
    return vec4f(0.0);
  }

  let currentMagRaw = currentSample.w;
  let currentMag = currentMagRaw * max(uniforms.probabilityCurrentScale, 0.0);
  if (currentMag < max(uniforms.probabilityCurrentMagnitudeThreshold, 0.0)) {
    return vec4f(0.0);
  }

  let densitySafe = max(localRho, max(uniforms.probabilityCurrentDensityThreshold, 1e-6));
  // j = rho * grad(phi) can be numerically tiny for normalized states.
  // Use grad(phi)-proportional magnitude for visual mapping while keeping
  // thresholding in current-space (|j|).
  let phaseGradientMag = currentMag / densitySafe;
  let visualMag = phaseGradientMag * 3.0;

  let currentDir = normalize(currentSample.xyz + vec3f(1e-6, 0.0, 0.0));
  let safeNormal = normalize(surfaceNormal + vec3f(1e-6, 0.0, 0.0));
  let safeView = normalize(viewDir + vec3f(0.0, 0.0, 1e-6));

  var placementMask = 1.0;
  // If isosurface placement is selected while iso rendering is disabled,
  // treat it as volumetric placement to avoid fully masking the effect.
  let useIsosurfacePlacement =
    uniforms.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_ISOSURFACE &&
    uniforms.isoEnabled != 0u;
  if (useIsosurfacePlacement) {
    let logRho = sFromRho(max(localRho * max(uniforms.densityGain, 0.01), 1e-8));
    let shellDistance = abs(logRho - uniforms.isoThreshold);
    placementMask = 1.0 - smoothstep(0.08, 0.35, shellDistance);
  }
  if (placementMask <= 1e-4) {
    return vec4f(0.0);
  }

  let lineDensity = max(uniforms.probabilityCurrentLineDensity, 1.0);
  let speedPhase = uniforms.time * uniforms.probabilityCurrentSpeed;
  let tangent = normalize(currentDir - safeNormal * dot(currentDir, safeNormal) + vec3f(1e-6, 0.0, 0.0));
  let bitangent = normalize(cross(safeNormal, tangent) + cross(tangent, safeView) * 0.25 + vec3f(1e-6, 0.0, 0.0));

  var styleMask = 1.0;
  if (uniforms.probabilityCurrentStyle == PROBABILITY_CURRENT_STYLE_ARROWS) {
    let u = dot(pos, tangent) * lineDensity - speedPhase;
    let v = dot(pos, bitangent) * lineDensity;
    let shaft = 1.0 - smoothstep(0.24, 0.48, abs(fract(v) - 0.5));
    let body = smoothstep(0.15, 0.72, fract(u)) * (1.0 - smoothstep(0.72, 0.97, fract(u)));
    let head = smoothstep(0.76, 0.97, fract(u)) * (1.0 - smoothstep(0.0, 0.22, abs(fract(v) - 0.5)));
    styleMask = max(shaft * body, head);
  } else if (uniforms.probabilityCurrentStyle == PROBABILITY_CURRENT_STYLE_SURFACE_LIC) {
    let u = dot(pos, tangent) * lineDensity + speedPhase;
    let v = dot(pos, bitangent) * lineDensity;
    let lic = 0.5 + 0.5 * sin(TAU * u);
    let streak = 1.0 - smoothstep(0.28, 0.48, abs(fract(v) - 0.5));
    styleMask = lic * streak;
  } else if (uniforms.probabilityCurrentStyle == PROBABILITY_CURRENT_STYLE_STREAMLINES) {
    let segmentCount = max(f32(uniforms.probabilityCurrentSteps), 4.0);
    let stepScale = max(uniforms.probabilityCurrentStepSize, 0.005);
    let u = dot(pos, tangent) * lineDensity + speedPhase;
    let v = dot(pos, bitangent) * lineDensity;
    let carrier = 0.5 + 0.5 * sin(TAU * (u + stepScale * segmentCount * 0.15));
    let pulse = smoothstep(0.25, 0.95, carrier);
    let width = 1.0 - smoothstep(0.24, 0.5, abs(fract(v + stepScale * segmentCount * 0.25) - 0.5));
    styleMask = pulse * width;
  }

  let color = computeProbabilityCurrentColor(pos, currentDir, visualMag, uniforms);
  let magAlpha = 1.0 - exp(-visualMag * 0.9);
  var baseOpacity = clamp(uniforms.probabilityCurrentOpacity, 0.0, 1.0);
  if (uniforms.probabilityCurrentStyle == PROBABILITY_CURRENT_STYLE_MAGNITUDE) {
    baseOpacity = max(baseOpacity, 0.35);
  }
  let alpha = clamp(baseOpacity * styleMask * placementMask * magAlpha, 0.0, 1.0);
  return vec4f(color, alpha);
}

`

/** No-op stubs for probability current functions when feature is off. */
export const probabilityCurrentStubBlock = /* wgsl */ `
// Stubs: probability current disabled at compile time
fn sampleProbabilityCurrent(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  return vec4f(0.0);
}
fn computeProbabilityCurrentOverlay(
  pos: vec3f, currentSample: vec4f, localRho: f32, surfaceNormal: vec3f, viewDir: vec3f, uniforms: SchroedingerUniforms
) -> vec4f {
  return vec4f(0.0);
}
`
