/**
 * WGSL Nodal surface visualization for Schrödinger wavefunctions
 *
 * Provides classification, ray-hit tracing, and band rendering for
 * nodal surfaces (where ψ = 0). Supports Re/Im/|ψ| decompositions
 * and hydrogen radial/angular node-family filtering.
 *
 * Extracted from integration.wgsl.ts for modularity.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/nodalSurfaces.wgsl
 */

/** Nodal surface functions: classification, ray-hit, band rendering. */
export const nodalSurfacesBlock = /* wgsl */ `
// ============================================
// Physical Nodal Classification
// ============================================

// Evaluate hydrogen radial/angular node factors from ND coordinates.
fn evalHydrogenNodeFactorsAtXND(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> vec2f {
  let x0 = xND[0];
  let x1 = xND[1];
  let x2 = xND[2];

  let sum3D = x0 * x0 + x1 * x1 + x2 * x2;
  let r3D = sqrt(max(sum3D, 0.0));
  let invR = 1.0 / max(r3D, 1e-10);
  let nx = x0 * invR;
  let ny = x1 * invR;
  let nz = x2 * invR;
  // For node-family decomposition, radial nodes are defined by the 3D hydrogen core.
  let radial = hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, r3D, uniforms.bohrRadius);
  let angularComplex = evalHydrogenNDAngularCartesian(
    uniforms.azimuthalL,
    uniforms.magneticM,
    nx, ny, nz,
    uniforms.useRealOrbitals != 0u
  );
  // Node decomposition uses real part for sign-change detection.
  // For real orbitals, .x is the full real Y_lm; for complex, .x = Re(Y_lm).
  return vec2f(radial, angularComplex.x);
}

// Sample hydrogen radial/angular factors at world position.
fn sampleHydrogenNodeFactorsWithFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let xND = mapPosToND(pos, uniforms);
  return evalHydrogenNodeFactorsAtXND(xND, uniforms);
}

// Surface mode needs a sign-changing scalar field.
// |psi| is nonnegative and often yields no crossings, so we map psiAbs -> Re(psi)
// for the ray-hit branch while keeping volumetric band behavior unchanged.
fn resolveSurfaceNodalDefinition(uniforms: SchroedingerUniforms) -> i32 {
  if (uniforms.nodalDefinition == NODAL_DEFINITION_PSI_ABS) {
    return NODAL_DEFINITION_REAL;
  }
  return uniforms.nodalDefinition;
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

// Evaluate the scalar field used for nodal-surface ray-hit tracking.
fn evaluateNodalScalarField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalScalarSample {
  let surfaceDefinition = resolveSurfaceNodalDefinition(uniforms);
  let psi = samplePsiWithFlow(pos, t, uniforms);
  let psiAbs = length(psi);

  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND && uniforms.nodalFamilyFilter != NODAL_FAMILY_ALL) {
    let factors = sampleHydrogenNodeFactorsWithFlow(pos, t, uniforms);
    if (uniforms.nodalFamilyFilter == NODAL_FAMILY_RADIAL) {
      return NodalScalarSample(factors.x, factors.x, psiAbs, NODAL_DEFINITION_PSI_ABS);
    }
    return NodalScalarSample(factors.y, factors.y, psiAbs, NODAL_DEFINITION_PSI_ABS);
  }

  if (surfaceDefinition == NODAL_DEFINITION_REAL) {
    return NodalScalarSample(psi.x, psi.x, psiAbs, NODAL_DEFINITION_REAL);
  }
  if (surfaceDefinition == NODAL_DEFINITION_IMAG) {
    return NodalScalarSample(psi.y, psi.y, psiAbs, NODAL_DEFINITION_IMAG);
  }
  if (surfaceDefinition == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
    // Use Re*Im product: sign-changing at EITHER Re(psi)=0 or Im(psi)=0.
    // The previous max(|Re|,|Im|) was nonneg, preventing bisection convergence.
    // Re*Im gives proper sign changes for robust ray-hit detection.
    let value = psi.x * psi.y;
    return NodalScalarSample(value, psi.x, psiAbs, NODAL_DEFINITION_COMPLEX_INTERSECTION);
  }

  return NodalScalarSample(psi.x, psi.x, psiAbs, NODAL_DEFINITION_REAL);
}

// Trace a true nodal surface along the ray and refine the intersection.
fn findNodalSurfaceHit(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  animTime: f32,
  uniforms: SchroedingerUniforms
) -> NodalSurfaceHit {
  const NODAL_SURFACE_MAX_STEPS: i32 = 192;
  let span = max(tFar - tNear, 0.0);
  if (span <= 1e-5) {
    return NodalSurfaceHit(0.0, -1.0, 0.0, uniforms.nodalDefinition, vec3f(0.0, 0.0, 1.0), 0.0);
  }

  let stepCount = clamp(uniforms.sampleCount * 2, 48, NODAL_SURFACE_MAX_STEPS);
  let stepLen = span / f32(stepCount);
  let eps = max(uniforms.nodalTolerance, 1e-6);
  let strengthT = clamp(uniforms.nodalStrength * 0.5, 0.0, 1.0);
  let minAmplitudeScale = mix(5.5, 2.0, strengthT);
  let minAmplitudeFloor = mix(8e-4, 2e-4, strengthT);
  // Hydrogen amplitude correction: raw |ψ| is much smaller than HO.
  // Scale threshold down by sqrt(hydrogenNDBoost) so zero-crossings aren't skipped.
  var ampThresholdScale = 1.0;
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    ampThresholdScale = 1.0 / max(sqrt(uniforms.hydrogenNDBoost), 1.0);
  }
  let minAmplitude = max(uniforms.nodalTolerance * minAmplitudeScale, minAmplitudeFloor) * ampThresholdScale;
  var t = tNear;

  let p0 = rayOrigin + rayDir * t;
  var prevSample = evaluateNodalScalarField(p0, animTime, uniforms);

  for (var i: i32 = 0; i < NODAL_SURFACE_MAX_STEPS; i++) {
    if (i >= stepCount) { break; }
    t += stepLen;
    if (t > tFar) { break; }

    let pos = rayOrigin + rayDir * t;
    let currSample = evaluateNodalScalarField(pos, animTime, uniforms);
    if (max(prevSample.amplitude, currSample.amplitude) < minAmplitude) {
      prevSample = currSample;
      continue;
    }

    if (nodalCrossingPair(prevSample.value, currSample.value, eps)) {
      var tLo = t - stepLen;
      var tHi = t;
      var loSample = prevSample;
      var hiSample = currSample;

      var lastMidT = (tLo + tHi) * 0.5;
      var lastMidSample = loSample;
      for (var j: i32 = 0; j < 6; j++) {
        // Illinois method: interpolate root position from bracket values
        let denom = loSample.value - hiSample.value;
        var w = 0.5;
        if (abs(denom) > 1e-20) {
          w = clamp(loSample.value / denom, 0.1, 0.9);
        }
        let tMid = mix(tLo, tHi, w);
        let pMid = rayOrigin + rayDir * tMid;
        let midSample = evaluateNodalScalarField(pMid, animTime, uniforms);
        lastMidT = tMid;
        lastMidSample = midSample;
        if (nodalCrossingPair(loSample.value, midSample.value, eps)) {
          tHi = tMid;
          hiSample = midSample;
        } else {
          tLo = tMid;
          loSample = midSample;
        }
      }

      let hitT = lastMidT;
      let hitPos = rayOrigin + rayDir * hitT;
      let hitSample = lastMidSample;
      if (hitSample.amplitude < minAmplitude) {
        prevSample = currSample;
        continue;
      }

      // PERF: Hybrid gradient using bisection bracket + 2 off-axis samples.
      // The bisection already refined lo/hi bracketing the zero-crossing. We reuse the
      // bracket values for the ray-directional gradient component, then add 2 perpendicular
      // samples for the tangent-plane gradient. This saves 2 psi evaluations vs 4-point tetrahedral.
      let bracketSpan = max(tHi - tLo, 1e-6);
      let rayGrad = (hiSample.value - loSample.value) / bracketSpan;

      // Build a local frame: rayDir + two perpendicular axes
      let absRx = abs(rayDir.x);
      let absRy = abs(rayDir.y);
      let absRz = abs(rayDir.z);
      var up = vec3f(0.0, 1.0, 0.0);
      if (absRy > absRx && absRy > absRz) {
        up = vec3f(1.0, 0.0, 0.0);
      }
      let tangent1 = normalize(cross(rayDir, up));
      let tangent2 = cross(rayDir, tangent1);

      let gradDelta = max(stepLen * 0.5, 0.01);
      let t1Val = evaluateNodalScalarField(hitPos + tangent1 * gradDelta, animTime, uniforms).value;
      let t2Val = evaluateNodalScalarField(hitPos + tangent2 * gradDelta, animTime, uniforms).value;
      let hitVal = hitSample.value;

      // Forward-difference gradient in the tangent plane
      let t1Grad = (t1Val - hitVal) / gradDelta;
      let t2Grad = (t2Val - hitVal) / gradDelta;

      // Combine ray-directional and tangent-plane gradients
      let grad = rayDir * rayGrad + tangent1 * t1Grad + tangent2 * t2Grad;

      var normal = normalize(grad);
      if (dot(grad, grad) < 1e-10) {
        if (USE_ANALYTICAL_GRADIENT) {
          normal = normalize(computeAnalyticalGradient(hitPos, animTime, uniforms));
        } else {
          normal = normalize(computeGradientTetrahedral(hitPos, animTime, 0.02, uniforms));
        }
      }

      return NodalSurfaceHit(1.0, hitT, hitSample.signValue, hitSample.colorMode, normal, 0.0);
    }

    prevSample = currSample;
  }

  return NodalSurfaceHit(0.0, -1.0, 0.0, uniforms.nodalDefinition, vec3f(0.0, 0.0, 1.0), 0.0);
}

// Combined nodal field + density gradient computation.
// When nodal surfaces are enabled, the volumeRaymarch loop needs both:
// 1. Nodal band detection (requires 4 tetrahedral psi evaluations)
// 2. Density gradient for lighting (requires 4 tetrahedral density evaluations)
// By computing both from the same 4 tetrahedral samples, we eliminate 4 redundant
// psi evaluations per ray step — a ~44% reduction in per-step wavefunction evaluation cost.
fn computePhysicalNodalFieldWithGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalWithGradient {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  // Scale tetrahedral sampling radius with bounding radius so samples reach into
  // adjacent lobes for hydrogen (whose bounding radius is much larger than HO).
  // Reference radius ~3.0 keeps delta ≈ 0.05 for typical HO states.
  let delta = 0.05 * max(uniforms.boundingRadius / 3.0, 1.0);

  var intensity = 0.0;
  var signValue = 0.0;
  var colorMode = uniforms.nodalDefinition;
  var maxAbsPsi = 0.0;
  var densityGrad = vec3f(0.0);
  var avgRho = 0.0;
  var avgS = 0.0;
  // Track max boosted density across branches for hydrogen envelope correction.
  var maxBoostedRho = 0.0;

  // Hydrogen node-family filtering branch
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND && uniforms.nodalFamilyFilter != NODAL_FAMILY_ALL) {
    let psiC = samplePsiWithFlow(pos, t, uniforms);
    maxAbsPsi = length(psiC);

    let h0 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let h1 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let h2 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let h3 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    var f0 = 0.0;
    var f1 = 0.0;
    var f2 = 0.0;
    var f3 = 0.0;
    if (uniforms.nodalFamilyFilter == NODAL_FAMILY_RADIAL) {
      f0 = h0.x; f1 = h1.x; f2 = h2.x; f3 = h3.x;
    } else {
      f0 = h0.y; f1 = h1.y; f2 = h2.y; f3 = h3.y;
    }

    // For family-filter envelope: use max |factor| from tetrahedral samples.
    // Raw |ψ| is zero at the node by definition, but the individual factor
    // (radial/angular) at offset positions has reasonable magnitude.
    let maxFactor = max(max(abs(f0), abs(f1)), max(abs(f2), abs(f3)));
    maxBoostedRho = maxFactor * maxFactor * uniforms.hydrogenNDBoost;

    let fCenter = (f0 + f1 + f2 + f3) * 0.25;
    let fGrad = (TETRA_V0 * f0 + TETRA_V1 * f1 + TETRA_V2 * f2 + TETRA_V3 * f3) * (0.75 / delta);
    let crossing = nodalCrossingMask(f0, f1, f2, f3, eps);
    intensity = nodalBandMask(fCenter, fGrad, eps) * crossing;
    signValue = fCenter;
    colorMode = NODAL_DEFINITION_PSI_ABS;

    // For hydrogen family filter, density gradient needs separate samples
    // (hydrogen factors don't directly give us density at offset positions)
    let sd0 = sFromRho(sampleDensityAtPos(pos + TETRA_V0 * delta, t, uniforms));
    let sd1 = sFromRho(sampleDensityAtPos(pos + TETRA_V1 * delta, t, uniforms));
    let sd2 = sFromRho(sampleDensityAtPos(pos + TETRA_V2 * delta, t, uniforms));
    let sd3 = sFromRho(sampleDensityAtPos(pos + TETRA_V3 * delta, t, uniforms));
    densityGrad = (TETRA_V0 * sd0 + TETRA_V1 * sd1 + TETRA_V2 * sd2 + TETRA_V3 * sd3) * (0.75 / delta);
    avgS = (sd0 + sd1 + sd2 + sd3) * 0.25;
  } else {
    // Full tetrahedral psi sampling — SHARED between nodal detection and gradient
    let p0 = samplePsiWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let p1 = samplePsiWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let p2 = samplePsiWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let p3 = samplePsiWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    let re0 = p0.x; let re1 = p1.x; let re2 = p2.x; let re3 = p3.x;
    let im0 = p0.y; let im1 = p1.y; let im2 = p2.y; let im3 = p3.y;
    let abs0 = length(p0); let abs1 = length(p1); let abs2 = length(p2); let abs3 = length(p3);
    maxAbsPsi = max(max(abs0, abs1), max(abs2, abs3));

    // Compute density at each tetrahedral vertex for gradient
    var rho0 = dot(p0, p0); var rho1 = dot(p1, p1);
    var rho2 = dot(p2, p2); var rho3 = dot(p3, p3);
    if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
      rho0 *= uniforms.hydrogenNDBoost;
      rho1 *= uniforms.hydrogenNDBoost;
      rho2 *= uniforms.hydrogenNDBoost;
      rho3 *= uniforms.hydrogenNDBoost;
      maxBoostedRho = max(max(rho0, rho1), max(rho2, rho3));
    }
    let s0 = sFromRho(rho0); let s1 = sFromRho(rho1);
    let s2 = sFromRho(rho2); let s3 = sFromRho(rho3);
    avgRho = (rho0 + rho1 + rho2 + rho3) * 0.25;
    avgS = (s0 + s1 + s2 + s3) * 0.25;
    densityGrad = (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);

    // Nodal detection from the same samples
    let psiCenter = (p0 + p1 + p2 + p3) * 0.25;
    let gradRe = (TETRA_V0 * re0 + TETRA_V1 * re1 + TETRA_V2 * re2 + TETRA_V3 * re3) * (0.75 / delta);
    let gradIm = (TETRA_V0 * im0 + TETRA_V1 * im1 + TETRA_V2 * im2 + TETRA_V3 * im3) * (0.75 / delta);
    let crossingRe = nodalCrossingMask(re0, re1, re2, re3, eps);
    let crossingIm = nodalCrossingMask(im0, im1, im2, im3, eps);

    if (uniforms.nodalDefinition == NODAL_DEFINITION_REAL) {
      intensity = nodalBandMask(psiCenter.x, gradRe, eps) * crossingRe;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_REAL;
    } else if (uniforms.nodalDefinition == NODAL_DEFINITION_IMAG) {
      intensity = nodalBandMask(psiCenter.y, gradIm, eps) * crossingIm;
      signValue = psiCenter.y;
      colorMode = NODAL_DEFINITION_IMAG;
    } else if (uniforms.nodalDefinition == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
      let maskRe = nodalBandMask(psiCenter.x, gradRe, eps);
      let maskIm = nodalBandMask(psiCenter.y, gradIm, eps);
      intensity = sqrt(maskRe * maskIm) * crossingRe * crossingIm;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_COMPLEX_INTERSECTION;
    } else {
      let psiAbsCenter = 0.25 * (abs0 + abs1 + abs2 + abs3);
      let gradAbs = (TETRA_V0 * abs0 + TETRA_V1 * abs1 + TETRA_V2 * abs2 + TETRA_V3 * abs3) * (0.75 / delta);
      let crossingAbs = nodalCrossingMask(abs0, abs1, abs2, abs3, eps);
      let crossingAny = max(max(crossingRe, crossingIm), crossingAbs);
      intensity = nodalBandMask(psiAbsCenter, gradAbs, eps) * crossingAny;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_PSI_ABS;
    }
  }

  // Envelope: suppress nodal bands where the wavefunction is negligibly small.
  // For hydrogen, raw |ψ| is orders of magnitude smaller than HO due to different
  // normalization (compensated by hydrogenNDBoost for density but not for raw ψ).
  // Use sqrt(boosted density) for hydrogen so the threshold matches visual significance.
  let envelopeFloor = max(eps * 0.4, 5e-5);
  let envelopeCeil = max(eps * 2.0, envelopeFloor + 1e-4);
  var envelopeAmp = maxAbsPsi;
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    envelopeAmp = sqrt(max(maxBoostedRho, 0.0));
  }
  let envelopeWeight = smoothstep(envelopeFloor, envelopeCeil, envelopeAmp);

  let nodalResult = NodalSample(clamp(intensity, 0.0, 1.0), signValue, colorMode, envelopeWeight);
  return NodalWithGradient(nodalResult, densityGrad, avgRho, avgS);
}

// Compute physically grounded nodal intensity from psi, Re(psi), Im(psi), and hydrogen factors.
fn computePhysicalNodalField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalSample {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  // Scale tetrahedral sampling radius with bounding radius (see WithGradient variant).
  let delta = 0.05 * max(uniforms.boundingRadius / 3.0, 1.0);

  var intensity = 0.0;
  var signValue = 0.0;
  var colorMode = uniforms.nodalDefinition;
  var maxAbsPsi = 0.0;

  // Hydrogen node-family filtering: only needs hydrogen factors + center amplitude
  // Track max factor magnitude for envelope (raw |ψ| is zero at the node itself).
  var maxFamilyFactor = 0.0;
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND && uniforms.nodalFamilyFilter != NODAL_FAMILY_ALL) {
    let psiC = samplePsiWithFlow(pos, t, uniforms);
    maxAbsPsi = length(psiC);

    let h0 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let h1 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let h2 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let h3 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    var f0 = 0.0;
    var f1 = 0.0;
    var f2 = 0.0;
    var f3 = 0.0;
    if (uniforms.nodalFamilyFilter == NODAL_FAMILY_RADIAL) {
      f0 = h0.x;
      f1 = h1.x;
      f2 = h2.x;
      f3 = h3.x;
    } else {
      f0 = h0.y;
      f1 = h1.y;
      f2 = h2.y;
      f3 = h3.y;
    }

    maxFamilyFactor = max(max(abs(f0), abs(f1)), max(abs(f2), abs(f3)));

    let fCenter = (f0 + f1 + f2 + f3) * 0.25;
    let fGrad = (TETRA_V0 * f0 + TETRA_V1 * f1 + TETRA_V2 * f2 + TETRA_V3 * f3) * (0.75 / delta);
    let crossing = nodalCrossingMask(f0, f1, f2, f3, eps);
    intensity = nodalBandMask(fCenter, fGrad, eps) * crossing;
    signValue = fCenter;
    colorMode = NODAL_DEFINITION_PSI_ABS;
  } else {
    // Full tetrahedral psi sampling for Re/Im/|psi| nodal modes
    let p0 = samplePsiWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let p1 = samplePsiWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let p2 = samplePsiWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let p3 = samplePsiWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    let re0 = p0.x;
    let re1 = p1.x;
    let re2 = p2.x;
    let re3 = p3.x;
    let im0 = p0.y;
    let im1 = p1.y;
    let im2 = p2.y;
    let im3 = p3.y;
    let abs0 = length(p0);
    let abs1 = length(p1);
    let abs2 = length(p2);
    let abs3 = length(p3);
    maxAbsPsi = max(max(abs0, abs1), max(abs2, abs3));

    let psiCenter = (p0 + p1 + p2 + p3) * 0.25;
    let gradRe = (TETRA_V0 * re0 + TETRA_V1 * re1 + TETRA_V2 * re2 + TETRA_V3 * re3) * (0.75 / delta);
    let gradIm = (TETRA_V0 * im0 + TETRA_V1 * im1 + TETRA_V2 * im2 + TETRA_V3 * im3) * (0.75 / delta);
    let crossingRe = nodalCrossingMask(re0, re1, re2, re3, eps);
    let crossingIm = nodalCrossingMask(im0, im1, im2, im3, eps);

    if (uniforms.nodalDefinition == NODAL_DEFINITION_REAL) {
      intensity = nodalBandMask(psiCenter.x, gradRe, eps) * crossingRe;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_REAL;
    } else if (uniforms.nodalDefinition == NODAL_DEFINITION_IMAG) {
      intensity = nodalBandMask(psiCenter.y, gradIm, eps) * crossingIm;
      signValue = psiCenter.y;
      colorMode = NODAL_DEFINITION_IMAG;
    } else if (uniforms.nodalDefinition == NODAL_DEFINITION_COMPLEX_INTERSECTION) {
      let maskRe = nodalBandMask(psiCenter.x, gradRe, eps);
      let maskIm = nodalBandMask(psiCenter.y, gradIm, eps);
      intensity = sqrt(maskRe * maskIm) * crossingRe * crossingIm;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_COMPLEX_INTERSECTION;
    } else {
      // |psi| mode: near-zero envelope, gated by sign changes or near-zero contact.
      let psiAbsCenter = 0.25 * (abs0 + abs1 + abs2 + abs3);
      let gradAbs = (TETRA_V0 * abs0 + TETRA_V1 * abs1 + TETRA_V2 * abs2 + TETRA_V3 * abs3) * (0.75 / delta);
      let crossingAbs = nodalCrossingMask(abs0, abs1, abs2, abs3, eps);
      let crossingAny = max(max(crossingRe, crossingIm), crossingAbs);
      intensity = nodalBandMask(psiAbsCenter, gradAbs, eps) * crossingAny;
      signValue = psiCenter.x;
      colorMode = NODAL_DEFINITION_PSI_ABS;
    }
  }

  // Hydrogen envelope correction: raw |ψ| is much smaller than HO due to
  // normalization differences. Scale by sqrt(hydrogenNDBoost) to match the
  // effective amplitude used in density visualization.
  // For family-filter mode, use the factor magnitude instead of raw |ψ|
  // (at a node, |ψ| is zero but the individual factor has nonzero magnitude at offsets).
  let envelopeFloor = max(eps * 0.4, 5e-5);
  let envelopeCeil = max(eps * 2.0, envelopeFloor + 1e-4);
  var envelopeAmp = maxAbsPsi;
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    let baseAmp = select(maxAbsPsi, maxFamilyFactor, maxFamilyFactor > 0.0);
    envelopeAmp = sqrt(baseAmp * baseAmp * uniforms.hydrogenNDBoost);
  }
  let envelopeWeight = smoothstep(envelopeFloor, envelopeCeil, envelopeAmp);

  return NodalSample(clamp(intensity, 0.0, 1.0), signValue, colorMode, envelopeWeight);
}
`

/** No-op stubs for nodal surface functions when FEATURE_NODAL is off. */
export const nodalSurfacesStubBlock = /* wgsl */ `
// Stubs: nodal surfaces disabled at compile time
fn computePhysicalNodalField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalSample {
  return NodalSample(0.0, 0.0, 0, 0.0);
}
fn computePhysicalNodalFieldWithGradient(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalWithGradient {
  return NodalWithGradient(NodalSample(0.0, 0.0, 0, 0.0), vec3f(0.0), 0.0, 0.0);
}
fn selectPhysicalNodalColor(uniforms: SchroedingerUniforms, colorMode: i32, signValue: f32) -> vec3f {
  return vec3f(0.0);
}
fn findNodalSurfaceHit(
  rayOrigin: vec3f, rayDir: vec3f, tNear: f32, tFar: f32, animTime: f32, uniforms: SchroedingerUniforms
) -> NodalSurfaceHit {
  return NodalSurfaceHit(0.0, -1.0, 0.0, 0, vec3f(0.0, 0.0, 1.0), 0.0);
}
`
