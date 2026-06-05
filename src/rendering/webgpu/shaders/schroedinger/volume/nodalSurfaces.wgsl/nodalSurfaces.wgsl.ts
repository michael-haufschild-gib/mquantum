/**
 * WGSL Nodal surface visualization for Schrödinger wavefunctions
 *
 * Provides ray-hit tracing, band rendering, and field computation for
 * nodal surfaces (where ψ = 0). Primitive helpers (NodalFieldJet struct,
 * specialization dispatch, crossing/band masks, color selection) live in
 * nodalFieldJet.wgsl.ts — always assembled before this block.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/nodalSurfaces.wgsl
 */

/** Nodal surface computation: scalar field eval, ray-hit, tetrahedral sampling. */
export const nodalSurfacesBlock = /* wgsl */ `
// ============================================
// Physical Nodal Classification
// ============================================

// Evaluate hydrogen radial/angular node factors from ND coordinates.
fn evalHydrogenNodeFactorsAtXND(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> vec2f {
  let x0 = xND[0];
  let x1 = xND[1];
  let x2 = xND[2];

  // squares are always >= 0, so max(sum3D, 0.0) was redundant.
  // Fuse sqrt + reciprocal into a single inverseSqrt: r3D = sum3D * invR recovers
  // the length from the reciprocal root at no extra sqrt.
  let sum3D = x0 * x0 + x1 * x1 + x2 * x2;
  let invR = inverseSqrt(max(sum3D, 1e-20));
  let r3D = sum3D * invR;
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
  let definition = activeNodalDefinition(uniforms);
  if (definition == NODAL_DEFINITION_PSI_ABS) {
    return NODAL_DEFINITION_REAL;
  }
  return definition;
}

// Evaluate the scalar field used for nodal-surface ray-hit tracking.
fn evaluateNodalScalarField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalScalarSample {
  let surfaceDefinition = resolveSurfaceNodalDefinition(uniforms);
  let familyFilter = activeNodalFamilyFilter(uniforms);
  let psi = samplePsiWithFlow(pos, t, uniforms);
  let psiAbs = length(psi);

  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND && familyFilter != NODAL_FAMILY_ALL) {
    let factors = sampleHydrogenNodeFactorsWithFlow(pos, t, uniforms);
    if (familyFilter == NODAL_FAMILY_RADIAL) {
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

fn evaluateNodalSurfaceFieldJet(pos: vec3f, t: f32, uniforms: SchroedingerUniforms, delta: f32) -> NodalFieldJet {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  let center = evaluateNodalScalarField(pos, t, uniforms);
  let s0 = evaluateNodalScalarField(pos + TETRA_V0 * delta, t, uniforms);
  let s1 = evaluateNodalScalarField(pos + TETRA_V1 * delta, t, uniforms);
  let s2 = evaluateNodalScalarField(pos + TETRA_V2 * delta, t, uniforms);
  let s3 = evaluateNodalScalarField(pos + TETRA_V3 * delta, t, uniforms);
  let gradient = (TETRA_V0 * s0.value + TETRA_V1 * s1.value +
                  TETRA_V2 * s2.value + TETRA_V3 * s3.value) * (0.75 / delta);
  let crossing = nodalCrossingMask(s0.value, s1.value, s2.value, s3.value, eps);
  return makeNodalFieldJet(
    center.value,
    center.signValue,
    center.amplitude,
    center.colorMode,
    gradient,
    crossing,
    eps
  );
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
    return NodalSurfaceHit(0.0, -1.0, 0.0, activeNodalDefinition(uniforms), vec3f(0.0, 0.0, 1.0), 0.0);
  }

  // Surface mode is an overlay on top of volume rendering. Keep the root search
  // budget below the volume sample count; the previous 2x budget dominated frame
  // time on high-DPI canvases.
  let stepCount = clamp(uniforms.sampleCount / 2, 32, 96);
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
      for (var j: i32 = 0; j < 4; j++) {
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

      var refinedHitT = lastMidT;
      var refinedHitSample = lastMidSample;
      let jetDelta = clamp(max(stepLen * 0.5, 0.005), 0.005, max(0.05 * uniforms.boundingRadius, 0.02));
      let initialJet = evaluateNodalSurfaceFieldJet(rayOrigin + rayDir * refinedHitT, animTime, uniforms, jetDelta);
      let initialJetGradLen2 = dot(initialJet.gradient, initialJet.gradient);
      if (initialJetGradLen2 > 1e-12) {
        let rayDerivative = dot(initialJet.gradient, rayDir);
        if (abs(rayDerivative) > 1e-8) {
          let candidateT = clamp(refinedHitT - initialJet.value / rayDerivative, tLo, tHi);
          if (candidateT > tLo && candidateT < tHi) {
            let candidateSample = evaluateNodalScalarField(rayOrigin + rayDir * candidateT, animTime, uniforms);
            let improvesResidual = abs(candidateSample.value) <= abs(refinedHitSample.value);
            let keepsBracket = nodalCrossingPair(loSample.value, candidateSample.value, eps)
              || nodalCrossingPair(candidateSample.value, hiSample.value, eps);
            if (candidateSample.amplitude >= minAmplitude && (improvesResidual || keepsBracket)) {
              refinedHitT = candidateT;
              refinedHitSample = candidateSample;
            }
          }
        }
      }

      let hitT = refinedHitT;
      let hitPos = rayOrigin + rayDir * hitT;
      let hitSample = refinedHitSample;
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
      let bracketGrad = rayDir * rayGrad + tangent1 * t1Grad + tangent2 * t2Grad;

      let hitJet = evaluateNodalSurfaceFieldJet(hitPos, animTime, uniforms, jetDelta);
      var grad = hitJet.gradient;
      if (dot(grad, grad) < 1e-10) {
        grad = bracketGrad;
      }

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

  return NodalSurfaceHit(0.0, -1.0, 0.0, activeNodalDefinition(uniforms), vec3f(0.0, 0.0, 1.0), 0.0);
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
  // Hoist the tetrahedral-gradient scale factor (0.75/delta) so it's one
  // reciprocal per call instead of one per gradient combine (up to 5× below).
  let invGradDelta = 0.75 / delta;

  var nodalJet = makeNodalFieldJet(0.0, 0.0, 0.0, activeNodalDefinition(uniforms), vec3f(0.0), 0.0, eps);
  var maxAbsPsi = 0.0;
  var densityGrad = vec3f(0.0);
  var avgRho = 0.0;
  var avgS = 0.0;
  // Track max boosted density across branches for hydrogen envelope correction.
  var maxBoostedRho = 0.0;

  // Hydrogen node-family filtering branch
  if (isActiveHydrogenFamilyNodal(uniforms)) {
    let psiC = samplePsiWithFlow(pos, t, uniforms);
    maxAbsPsi = length(psiC);

    let h0 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let h1 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let h2 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let h3 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    // For family-filter envelope: use max |factor| from tetrahedral samples.
    // Raw |ψ| is zero at the node by definition, but the individual factor
    // (radial/angular) at offset positions has reasonable magnitude.
    let maxRadialFactor = max(max(abs(h0.x), abs(h1.x)), max(abs(h2.x), abs(h3.x)));
    let maxAngularFactor = max(max(abs(h0.y), abs(h1.y)), max(abs(h2.y), abs(h3.y)));
    let maxFactor = select(maxAngularFactor, maxRadialFactor, activeNodalFamilyFilter(uniforms) == NODAL_FAMILY_RADIAL);
    maxBoostedRho = maxFactor * maxFactor * uniforms.hydrogenNDBoost;

    let radialCenter = (h0.x + h1.x + h2.x + h3.x) * 0.25;
    let angularCenter = (h0.y + h1.y + h2.y + h3.y) * 0.25;
    let gradRadial = (TETRA_V0 * h0.x + TETRA_V1 * h1.x + TETRA_V2 * h2.x + TETRA_V3 * h3.x) * invGradDelta;
    let gradAngular = (TETRA_V0 * h0.y + TETRA_V1 * h1.y + TETRA_V2 * h2.y + TETRA_V3 * h3.y) * invGradDelta;
    let crossingRadial = nodalCrossingMask(h0.x, h1.x, h2.x, h3.x, eps);
    let crossingAngular = nodalCrossingMask(h0.y, h1.y, h2.y, h3.y, eps);
    nodalJet = selectHydrogenFamilyFieldJet(
      radialCenter,
      angularCenter,
      gradRadial,
      gradAngular,
      crossingRadial,
      crossingAngular,
      sqrt(max(maxBoostedRho, 0.0)),
      eps,
      uniforms
    );

    // For hydrogen family filter, density gradient needs separate samples
    // (hydrogen factors don't directly give us density at offset positions)
    let sd0 = sFromRho(sampleDensity(pos + TETRA_V0 * delta, t, uniforms));
    let sd1 = sFromRho(sampleDensity(pos + TETRA_V1 * delta, t, uniforms));
    let sd2 = sFromRho(sampleDensity(pos + TETRA_V2 * delta, t, uniforms));
    let sd3 = sFromRho(sampleDensity(pos + TETRA_V3 * delta, t, uniforms));
    densityGrad = (TETRA_V0 * sd0 + TETRA_V1 * sd1 + TETRA_V2 * sd2 + TETRA_V3 * sd3) * invGradDelta;
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
    densityGrad = (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * invGradDelta;

    // Nodal detection from the same samples
    let psiCenter = (p0 + p1 + p2 + p3) * 0.25;
    let gradRe = (TETRA_V0 * re0 + TETRA_V1 * re1 + TETRA_V2 * re2 + TETRA_V3 * re3) * invGradDelta;
    let gradIm = (TETRA_V0 * im0 + TETRA_V1 * im1 + TETRA_V2 * im2 + TETRA_V3 * im3) * invGradDelta;
    let crossingRe = nodalCrossingMask(re0, re1, re2, re3, eps);
    let crossingIm = nodalCrossingMask(im0, im1, im2, im3, eps);

    let psiAbsCenter = 0.25 * (abs0 + abs1 + abs2 + abs3);
    let gradAbs = (TETRA_V0 * abs0 + TETRA_V1 * abs1 + TETRA_V2 * abs2 + TETRA_V3 * abs3) * invGradDelta;
    let crossingAbs = nodalCrossingMask(abs0, abs1, abs2, abs3, eps);
    var envelopeAmp = maxAbsPsi;
    if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
      envelopeAmp = sqrt(max(maxBoostedRho, 0.0));
    }
    nodalJet = selectNodalPsiFieldJet(
      psiCenter.x,
      psiCenter.y,
      psiAbsCenter,
      envelopeAmp,
      gradRe,
      gradIm,
      gradAbs,
      crossingRe,
      crossingIm,
      crossingAbs,
      eps,
      uniforms
    );
  }

  let nodalResult = nodalSampleFromFieldJet(nodalJet);
  return NodalWithGradient(nodalResult, densityGrad, avgRho, avgS);
}

// OPT-14: Compute nodal band from already-computed analytical psi + psi-gradient.
// Skips the 4 tetrahedral psi evaluations of computePhysicalNodalFieldWithGradient
// when USE_ANALYTICAL_GRADIENT is true. Used in the analytical inline raymarch
// (HO 3D-11D with cached eigenfunctions) — the dominant hot path.
//
// Uses the exact center value and analytical gradient for the same local band
// predicate that nodalBandMask applies to the tetrahedral gradient path.
//
// For NODAL_DEFINITION_PSI_ABS the gradient of |ψ| is (Re·∇Re + Im·∇Im) / |ψ|
// (chain rule). For NODAL_DEFINITION_COMPLEX_INTERSECTION we evaluate two
// separate band masks and combine them with sqrt() identically to the
// tetrahedral path.
//
// Hydrogen family-filter is not handled here (analytical gradient is HO-only
// today via composeConfig.useAnalyticalGradient && includeHarmonic).
fn computeNodalFromAnalyticalPsi(
  psi: vec2f,
  gradPsiRe: vec3f,
  gradPsiIm: vec3f,
  uniforms: SchroedingerUniforms
) -> NodalSample {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  let psiRe = psi.x;
  let psiIm = psi.y;
  let psiMag2 = psiRe * psiRe + psiIm * psiIm;
  let psiAbs = sqrt(max(psiMag2, 0.0));

  // |ψ| mode: gradient via chain rule ∇|ψ| = (Re·∇Re + Im·∇Im)/|ψ|.
  // At a true node (Re≈0, Im≈0) the numerator vanishes and nodalBandMask
  // returns 0 — the band disappears exactly at the node. Fall back to
  // √(|∇Re|² + |∇Im|²) which stays nonzero at the node.
  let invPsiAbs = 1.0 / max(psiAbs, 1e-8);
  let gradChain = (gradPsiRe * psiRe + gradPsiIm * psiIm) * invPsiAbs;
  let chainLen = length(gradChain);
  let fallbackLen = sqrt(dot(gradPsiRe, gradPsiRe) + dot(gradPsiIm, gradPsiIm));
  let gradAbs = select(normalize(gradPsiRe + gradPsiIm) * fallbackLen, gradChain, chainLen > 1e-6);
  let jet = selectNodalPsiFieldJet(
    psiRe,
    psiIm,
    psiAbs,
    psiAbs,
    gradPsiRe,
    gradPsiIm,
    gradAbs,
    1.0,
    1.0,
    1.0,
    eps,
    uniforms
  );
  return nodalSampleFromFieldJet(jet);
}

// Compute physically grounded nodal intensity from psi, Re(psi), Im(psi), and hydrogen factors.
fn computePhysicalNodalField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalSample {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  // Scale tetrahedral sampling radius with bounding radius (see WithGradient variant).
  let delta = 0.05 * max(uniforms.boundingRadius / 3.0, 1.0);
  let invGradDelta = 0.75 / delta;

  var nodalJet = makeNodalFieldJet(0.0, 0.0, 0.0, activeNodalDefinition(uniforms), vec3f(0.0), 0.0, eps);
  var maxAbsPsi = 0.0;

  // Hydrogen node-family filtering: only needs hydrogen factors + center amplitude
  // Track max factor magnitude for envelope (raw |ψ| is zero at the node itself).
  var maxFamilyFactor = 0.0;
  if (isActiveHydrogenFamilyNodal(uniforms)) {
    let psiC = samplePsiWithFlow(pos, t, uniforms);
    maxAbsPsi = length(psiC);

    let h0 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V0 * delta, t, uniforms);
    let h1 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V1 * delta, t, uniforms);
    let h2 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V2 * delta, t, uniforms);
    let h3 = sampleHydrogenNodeFactorsWithFlow(pos + TETRA_V3 * delta, t, uniforms);

    let maxRadialFactor = max(max(abs(h0.x), abs(h1.x)), max(abs(h2.x), abs(h3.x)));
    let maxAngularFactor = max(max(abs(h0.y), abs(h1.y)), max(abs(h2.y), abs(h3.y)));
    maxFamilyFactor = select(maxAngularFactor, maxRadialFactor, activeNodalFamilyFilter(uniforms) == NODAL_FAMILY_RADIAL);

    let radialCenter = (h0.x + h1.x + h2.x + h3.x) * 0.25;
    let angularCenter = (h0.y + h1.y + h2.y + h3.y) * 0.25;
    let gradRadial = (TETRA_V0 * h0.x + TETRA_V1 * h1.x + TETRA_V2 * h2.x + TETRA_V3 * h3.x) * invGradDelta;
    let gradAngular = (TETRA_V0 * h0.y + TETRA_V1 * h1.y + TETRA_V2 * h2.y + TETRA_V3 * h3.y) * invGradDelta;
    let crossingRadial = nodalCrossingMask(h0.x, h1.x, h2.x, h3.x, eps);
    let crossingAngular = nodalCrossingMask(h0.y, h1.y, h2.y, h3.y, eps);
    nodalJet = selectHydrogenFamilyFieldJet(
      radialCenter,
      angularCenter,
      gradRadial,
      gradAngular,
      crossingRadial,
      crossingAngular,
      sqrt(max(maxFamilyFactor * maxFamilyFactor * uniforms.hydrogenNDBoost, 0.0)),
      eps,
      uniforms
    );
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
    let gradRe = (TETRA_V0 * re0 + TETRA_V1 * re1 + TETRA_V2 * re2 + TETRA_V3 * re3) * invGradDelta;
    let gradIm = (TETRA_V0 * im0 + TETRA_V1 * im1 + TETRA_V2 * im2 + TETRA_V3 * im3) * invGradDelta;
    let crossingRe = nodalCrossingMask(re0, re1, re2, re3, eps);
    let crossingIm = nodalCrossingMask(im0, im1, im2, im3, eps);

    // |psi| mode: near-zero envelope, gated by sign changes or near-zero contact.
    let psiAbsCenter = 0.25 * (abs0 + abs1 + abs2 + abs3);
    let gradAbs = (TETRA_V0 * abs0 + TETRA_V1 * abs1 + TETRA_V2 * abs2 + TETRA_V3 * abs3) * invGradDelta;
    let crossingAbs = nodalCrossingMask(abs0, abs1, abs2, abs3, eps);
    var envelopeAmp = maxAbsPsi;
    if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
      envelopeAmp = sqrt(max(maxAbsPsi * maxAbsPsi * uniforms.hydrogenNDBoost, 0.0));
    }
    nodalJet = selectNodalPsiFieldJet(
      psiCenter.x,
      psiCenter.y,
      psiAbsCenter,
      envelopeAmp,
      gradRe,
      gradIm,
      gradAbs,
      crossingRe,
      crossingIm,
      crossingAbs,
      eps,
      uniforms
    );
  }

  return nodalSampleFromFieldJet(nodalJet);
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
fn computeNodalFromAnalyticalPsi(
  psi: vec2f, gradPsiRe: vec3f, gradPsiIm: vec3f, uniforms: SchroedingerUniforms
) -> NodalSample {
  return NodalSample(0.0, 0.0, 0, 0.0);
}
fn findNodalSurfaceHit(
  rayOrigin: vec3f, rayDir: vec3f, tNear: f32, tFar: f32, animTime: f32, uniforms: SchroedingerUniforms
) -> NodalSurfaceHit {
  return NodalSurfaceHit(0.0, -1.0, 0.0, 0, vec3f(0.0, 0.0, 1.0), 0.0);
}
`
