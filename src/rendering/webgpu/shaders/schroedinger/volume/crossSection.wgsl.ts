/**
 * WGSL cross-section slice helpers for Schrödinger visualization.
 *
 * Renders a plane/slice through the quantum field and supports:
 * - scalar selection (density / real / imaginary)
 * - auto/manual windowing
 * - shared object color pipeline integration
 * - slab thickness + opacity compositing
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/crossSection.wgsl
 */

export const crossSectionBlock = /* wgsl */ `
// ============================================
// Cross-Section Slice
// ============================================

struct CrossSectionSample {
  color: vec3f,
  alpha: f32,
  hitT: f32,
  _pad0: vec3f,
}

struct CrossSectionScalarSample {
  value01: f32,
  envelope: f32,
  _pad0: vec2f,
}

fn mapCrossSectionColor(
  value01: f32,
  envelope: f32,
  uniforms: SchroedingerUniforms
) -> vec3f {
  // Reuse the existing object color algorithm pipeline, but drive it from the
  // slice scalar alone (1D ramp). This avoids spatial/phase artifacts in slices.
  let t = clamp(value01, 0.0, 1.0);
  let proxyS = t * 8.0 - 8.0;
  let proxyRho = exp(proxyS);
  let proxyPhase = t * TAU - PI;
  let proxyPos = vec3f(t * 2.0 - 1.0, t * 2.0 - 1.0, t * 2.0 - 1.0);
  let scalarColor = computeBaseColor(proxyRho, proxyS, proxyPhase, proxyPos, uniforms);
  let planeColor = uniforms.crossSectionPlaneColor.xyz;
  return mix(planeColor, scalarColor, clamp(envelope, 0.0, 1.0));
}

// Returns normalized scalar value + supporting wavefunction data for coloring.
fn sampleCrossSectionScalar(
  pos: vec3f,
  animTime: f32,
  uniforms: SchroedingerUniforms
) -> CrossSectionScalarSample {
  let xND = mapPosToND(pos, uniforms);
  let psi = evalPsi(xND, animTime, uniforms);

  var rho = rhoFromPsi(psi);
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    rho *= uniforms.hydrogenNDBoost;
  }

  var scalar = rho;
  if (uniforms.crossSectionScalar == CROSS_SECTION_SCALAR_REAL) {
    scalar = psi.x;
  } else if (uniforms.crossSectionScalar == CROSS_SECTION_SCALAR_IMAG) {
    scalar = psi.y;
  }

  var value01: f32;
  if (uniforms.crossSectionAutoWindow != 0u) {
    if (uniforms.crossSectionScalar == CROSS_SECTION_SCALAR_DENSITY) {
      value01 = clamp((sFromRho(rho) + 8.0) / 8.0, 0.0, 1.0);
    } else {
      let amplitude = sqrt(max(rho, DENSITY_EPS));
      let signedUnit = scalar / max(amplitude, 1e-4);
      value01 = clamp(0.5 + 0.5 * signedUnit, 0.0, 1.0);
    }
  } else {
    let windowMin = uniforms.crossSectionWindow.x;
    let windowMax = max(uniforms.crossSectionWindow.y, windowMin + 1e-5);
    value01 = clamp((scalar - windowMin) / (windowMax - windowMin), 0.0, 1.0);
  }

  // Density-envelope mask used for overlay compositing so the plane stays
  // visually tied to actual lobe mass rather than appearing as a detached sheet.
  let rho01 = clamp((sFromRho(max(rho, DENSITY_EPS)) + 8.0) / 8.0, 0.0, 1.0);
  let envelope = smoothstep(0.03, 0.22, rho01);

  var sample: CrossSectionScalarSample;
  sample.value01 = value01;
  sample.envelope = envelope;
  sample._pad0 = vec2f(0.0);
  return sample;
}

fn evaluateCrossSectionSample(
  ro: vec3f,
  rd: vec3f,
  tNear: f32,
  tFar: f32,
  animTime: f32,
  uniforms: SchroedingerUniforms
) -> CrossSectionSample {
  var result: CrossSectionSample;
  result.color = vec3f(0.0);
  result.alpha = 0.0;
  result.hitT = -1.0;
  result._pad0 = vec3f(0.0);

  if (uniforms.crossSectionEnabled == 0u) {
    return result;
  }

  var planeNormal = uniforms.crossSectionPlane.xyz;
  if (dot(planeNormal, planeNormal) < 1e-8) {
    planeNormal = vec3f(0.0, 0.0, 1.0);
  }
  planeNormal = normalize(planeNormal);

  let planeDistance = uniforms.crossSectionPlane.w * uniforms.boundingRadius;
  let signedOrigin = dot(planeNormal, ro) - planeDistance;
  let denom = dot(planeNormal, rd);
  let opacity = clamp(uniforms.crossSectionWindow.z, 0.0, 1.0);
  let halfThickness = max(uniforms.crossSectionWindow.w * uniforms.boundingRadius * 0.5, 1e-4);

  var slabNear = tNear;
  var slabFar = tFar;

  if (abs(denom) < 1e-6) {
    if (abs(signedOrigin) > halfThickness) {
      return result;
    }
  } else {
    let tA = (-halfThickness - signedOrigin) / denom;
    let tB = (halfThickness - signedOrigin) / denom;
    slabNear = max(tNear, min(tA, tB));
    slabFar = min(tFar, max(tA, tB));
    if (slabFar <= slabNear) {
      return result;
    }
  }

  let sampleT = (slabNear + slabFar) * 0.5;
  let samplePos = ro + rd * sampleT;
  let scalarSample = sampleCrossSectionScalar(samplePos, animTime, uniforms);

  var coverage = 1.0;
  if (abs(denom) >= 1e-6) {
    let fullSlabLength = (2.0 * halfThickness) / max(abs(denom), 1e-4);
    coverage = clamp((slabFar - slabNear) / max(fullSlabLength, 1e-4), 0.0, 1.0);
  }

  let alpha = opacity * coverage;
  var maskedAlpha = alpha;
  if (uniforms.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_OVERLAY) {
    maskedAlpha *= scalarSample.envelope;
  }

  if (maskedAlpha <= 1e-5) {
    return result;
  }

  result.color = mapCrossSectionColor(scalarSample.value01, scalarSample.envelope, uniforms);
  result.alpha = maskedAlpha;
  result.hitT = sampleT;
  return result;
}
`
