/**
 * WGSL Nodal Field Jet — compile-time specialization dispatch and field-sampling primitives.
 *
 * Extracted from nodalSurfaces.wgsl.ts so the main file stays under the
 * 600-line ESLint budget. Always included (both nodal-on and nodal-off
 * variants reference the activeNodal* dispatch).
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/nodalFieldJet.wgsl
 */

/** Specialization dispatch, NodalFieldJet struct, constructors, and selectors. */
export const nodalFieldJetBlock = /* wgsl */ `
// ============================================
// Nodal Compile-Time Specialization Dispatch
// ============================================

override NODAL_SPECIALIZATION_ENABLED: bool = false;
override NODAL_SPECIALIZED_DEFINITION: i32 = 0;
override NODAL_SPECIALIZED_RENDER_MODE: i32 = 0;
override NODAL_SPECIALIZED_FAMILY_FILTER: i32 = 0;

struct NodalFieldJet {
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
  intensity: f32,
  envelopeWeight: f32,
  gradient: vec3f,
  crossing: f32,
}

fn activeNodalDefinition(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_DEFINITION;
  }
  return uniforms.nodalDefinition;
}

fn activeNodalRenderMode(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_RENDER_MODE;
  }
  return uniforms.nodalRenderMode;
}

fn activeNodalFamilyFilter(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_FAMILY_FILTER;
  }
  return uniforms.nodalFamilyFilter;
}

fn isActiveHydrogenFamilyNodal(uniforms: SchroedingerUniforms) -> bool {
  return QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND
    && activeNodalFamilyFilter(uniforms) != NODAL_FAMILY_ALL;
}

// Convert a zero-crossing scalar field into a nodal intensity.
fn nodalBandMask(value: f32, gradient: vec3f, eps: f32) -> f32 {
  let epsSafe = max(eps, 1e-6);
  let gradMag = length(gradient);
  if (gradMag < 1e-6) { return 0.0; }

  // First-order distance to the nodal manifold: d ~= |f| / |grad f|
  let signedDistance = abs(value) / gradMag;
  // Adaptive width: tighten where gradients are strong to avoid broad planar bands.
  let gradFactor = clamp(gradMag, 0.35, 4.0);
  let width = epsSafe / gradFactor;
  return 1.0 - smoothstep(width, width * 2.5, signedDistance);
}

// Gate nodal response to neighborhoods that actually straddle f=0.
// Uses strict sign changes when present, with a near-zero fallback for fields that are
// nonnegative by construction (for example |Y_lm| in complex-orbital angular mode).
fn nodalCrossingMask(f0: f32, f1: f32, f2: f32, f3: f32, eps: f32) -> f32 {
  let minF = min(min(f0, f1), min(f2, f3));
  let maxF = max(max(f0, f1), max(f2, f3));
  if (minF < 0.0 && maxF > 0.0) {
    return 1.0;
  }
  let epsSafe = max(eps, 1e-6);
  let minAbs = min(min(abs(f0), abs(f1)), min(abs(f2), abs(f3)));
  let span = maxF - minF;
  if (minAbs <= epsSafe && span >= epsSafe * 0.5) {
    return 1.0;
  }
  return 0.0;
}

// Pairwise zero-crossing test for ray-segment stepping.
fn nodalCrossingPair(fPrev: f32, fCurr: f32, eps: f32) -> bool {
  if ((fPrev < 0.0 && fCurr > 0.0) || (fPrev > 0.0 && fCurr < 0.0)) {
    return true;
  }
  let epsSafe = max(eps, 1e-6);
  let minAbs = min(abs(fPrev), abs(fCurr));
  let span = abs(fCurr - fPrev);
  return minAbs <= epsSafe && span >= epsSafe * 0.35;
}

fn nodalEnvelopeWeightFromAmplitude(amplitude: f32, eps: f32) -> f32 {
  let envelopeFloor = max(eps * 0.4, 5e-5);
  let envelopeCeil = max(eps * 2.0, envelopeFloor + 1e-4);
  return smoothstep(envelopeFloor, envelopeCeil, amplitude);
}

fn makeNodalFieldJet(
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
  gradient: vec3f,
  crossing: f32,
  eps: f32
) -> NodalFieldJet {
  let intensity = nodalBandMask(value, gradient, eps) * crossing;
  let envelopeWeight = nodalEnvelopeWeightFromAmplitude(amplitude, eps);
  return NodalFieldJet(
    value,
    signValue,
    amplitude,
    colorMode,
    clamp(intensity, 0.0, 1.0),
    envelopeWeight,
    gradient,
    crossing
  );
}

fn makeNodalFieldJetWithIntensity(
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
  gradient: vec3f,
  crossing: f32,
  intensity: f32,
  eps: f32
) -> NodalFieldJet {
  let envelopeWeight = nodalEnvelopeWeightFromAmplitude(amplitude, eps);
  return NodalFieldJet(
    value,
    signValue,
    amplitude,
    colorMode,
    clamp(intensity, 0.0, 1.0),
    envelopeWeight,
    gradient,
    crossing
  );
}

fn nodalSampleFromFieldJet(jet: NodalFieldJet) -> NodalSample {
  return NodalSample(jet.intensity, jet.signValue, jet.colorMode, jet.envelopeWeight);
}

fn scalarSampleFromFieldJet(jet: NodalFieldJet) -> NodalScalarSample {
  return NodalScalarSample(jet.value, jet.signValue, jet.amplitude, jet.colorMode);
}

fn selectNodalPsiFieldJet(
  psiRe: f32,
  psiIm: f32,
  psiAbs: f32,
  amplitude: f32,
  gradRe: vec3f,
  gradIm: vec3f,
  gradAbs: vec3f,
  crossingRe: f32,
  crossingIm: f32,
  crossingAbs: f32,
  eps: f32,
  uniforms: SchroedingerUniforms
) -> NodalFieldJet {
  let definition = activeNodalDefinition(uniforms);
  if (definition == NODAL_DEFINITION_REAL) {
    return makeNodalFieldJet(psiRe, psiRe, amplitude, NODAL_DEFINITION_REAL, gradRe, crossingRe, eps);
  }
  if (definition == NODAL_DEFINITION_IMAG) {
    return makeNodalFieldJet(psiIm, psiIm, amplitude, NODAL_DEFINITION_IMAG, gradIm, crossingIm, eps);
  }
  if (definition == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
    let maskRe = nodalBandMask(psiRe, gradRe, eps) * crossingRe;
    let maskIm = nodalBandMask(psiIm, gradIm, eps) * crossingIm;
    let intensity = sqrt(max(maskRe * maskIm, 0.0));
    return makeNodalFieldJetWithIntensity(
      psiRe,
      psiRe,
      amplitude,
      NODAL_DEFINITION_COMPLEX_INTERSECTION,
      gradRe + gradIm,
      crossingRe * crossingIm,
      intensity,
      eps
    );
  }

  let crossingAny = max(max(crossingRe, crossingIm), crossingAbs);
  return makeNodalFieldJet(psiAbs, psiRe, amplitude, NODAL_DEFINITION_PSI_ABS, gradAbs, crossingAny, eps);
}

fn selectHydrogenFamilyFieldJet(
  radial: f32,
  angular: f32,
  gradRadial: vec3f,
  gradAngular: vec3f,
  crossingRadial: f32,
  crossingAngular: f32,
  amplitude: f32,
  eps: f32,
  uniforms: SchroedingerUniforms
) -> NodalFieldJet {
  if (activeNodalFamilyFilter(uniforms) == NODAL_FAMILY_RADIAL) {
    return makeNodalFieldJet(radial, radial, amplitude, NODAL_DEFINITION_PSI_ABS, gradRadial, crossingRadial, eps);
  }
  return makeNodalFieldJet(angular, angular, amplitude, NODAL_DEFINITION_PSI_ABS, gradAngular, crossingAngular, eps);
}

// Select nodal color based on active mode and lobe-coloring options.
fn selectPhysicalNodalColor(uniforms: SchroedingerUniforms, colorMode: i32, signValue: f32) -> vec3f {
  if (uniforms.nodalLobeColoringEnabled != 0u) {
    if (signValue >= 0.0) {
      return uniforms.nodalColorPositive;
    }
    return uniforms.nodalColorNegative;
  }

  if (colorMode == NODAL_DEFINITION_REAL) {
    return uniforms.nodalColorReal;
  }
  if (colorMode == NODAL_DEFINITION_IMAG) {
    return uniforms.nodalColorImag;
  }
  if (colorMode == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
    return 0.5 * (uniforms.nodalColorReal + uniforms.nodalColorImag);
  }
  return uniforms.nodalColor;
}
`

/** Stub field jet block — same dispatch, no-op primitives. */
export const nodalFieldJetStubBlock = /* wgsl */ `
override NODAL_SPECIALIZATION_ENABLED: bool = false;
override NODAL_SPECIALIZED_DEFINITION: i32 = 0;
override NODAL_SPECIALIZED_RENDER_MODE: i32 = 0;
override NODAL_SPECIALIZED_FAMILY_FILTER: i32 = 0;

fn activeNodalDefinition(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_DEFINITION;
  }
  return uniforms.nodalDefinition;
}

fn activeNodalRenderMode(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_RENDER_MODE;
  }
  return uniforms.nodalRenderMode;
}

fn activeNodalFamilyFilter(uniforms: SchroedingerUniforms) -> i32 {
  if (NODAL_SPECIALIZATION_ENABLED) {
    return NODAL_SPECIALIZED_FAMILY_FILTER;
  }
  return uniforms.nodalFamilyFilter;
}

fn nodalBandMask(value: f32, gradient: vec3f, eps: f32) -> f32 {
  return 0.0;
}

fn selectPhysicalNodalColor(uniforms: SchroedingerUniforms, colorMode: i32, signValue: f32) -> vec3f {
  return vec3f(0.0);
}
`
