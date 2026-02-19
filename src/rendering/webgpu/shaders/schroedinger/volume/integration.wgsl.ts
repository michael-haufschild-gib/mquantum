/**
 * WGSL Volume integration loop for Schrödinger density field
 *
 * Performs front-to-back compositing along rays through the volume.
 * Uses Beer-Lambert absorption and emission accumulation.
 *
 * Key optimizations:
 * - Early ray termination when transmittance is low
 * - Adaptive step size based on density
 * - Gaussian bounds allow aggressive culling
 *
 * Port of GLSL schroedinger/volume/integration.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/integration.wgsl
 */

/**
 * Tetrahedral gradient sampling - shared between isosurface and volumetric modes.
 * Extracted so both rendering paths can compute surface/volume normals.
 */
export const volumeGradientBlock = /* wgsl */ `
// ============================================
// Tetrahedral Gradient Sampling
// ============================================
// Uses symmetric 4-point stencil for combined density+gradient computation
// More accurate than forward differences (O(h^2) vs O(h)) with same sample count

// Tetrahedral stencil vertices (regular tetrahedron, equidistant from origin)
// Normalized to unit distance: each vertex is 1/sqrt(3) from origin
const TETRA_V0: vec3f = vec3f(1.0, 1.0, -1.0) * 0.5773503;
const TETRA_V1: vec3f = vec3f(1.0, -1.0, 1.0) * 0.5773503;
const TETRA_V2: vec3f = vec3f(-1.0, 1.0, 1.0) * 0.5773503;
const TETRA_V3: vec3f = vec3f(-1.0, -1.0, -1.0) * 0.5773503;

// Result structure for combined density+gradient sampling
struct TetraSample {
  rho: f32,       // Probability density (averaged from 4 samples)
  s: f32,         // Log-density (averaged)
  phase: f32,     // Spatial phase (averaged)
  gradient: vec3f // Gradient of log-density
}

/**
 * Combined density+gradient via tetrahedral finite differences.
 * Samples 4 points in symmetric tetrahedral pattern.
 * Returns: averaged density/phase at center + O(h^2) accurate gradient.
 */
fn sampleWithTetrahedralGradient(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> TetraSample {
  // Sample at 4 tetrahedral vertices
  let d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t, uniforms);
  let d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t, uniforms);
  let d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t, uniforms);
  let d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t, uniforms);

  // Average for center approximation
  let rho = (d0.x + d1.x + d2.x + d3.x) * 0.25;
  let s = (d0.y + d1.y + d2.y + d3.y) * 0.25;
  let phase = (d0.z + d1.z + d2.z + d3.z) * 0.25;

  // Gradient from tetrahedral stencil (scale factor: 3/(4*delta) = 0.75/delta)
  let grad = (TETRA_V0 * d0.y + TETRA_V1 * d1.y +
              TETRA_V2 * d2.y + TETRA_V3 * d3.y) * (0.75 / delta);

  return TetraSample(rho, s, phase, grad);
}

/**
 * Convenience function: gradient-only (for cold path where density already known).
 * Still uses 4 tetrahedral samples for symmetric O(h^2) accuracy.
 */
fn computeGradientTetrahedral(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let s0 = sFromRho(sampleDensity(pos + TETRA_V0 * delta, t, uniforms));
  let s1 = sFromRho(sampleDensity(pos + TETRA_V1 * delta, t, uniforms));
  let s2 = sFromRho(sampleDensity(pos + TETRA_V2 * delta, t, uniforms));
  let s3 = sFromRho(sampleDensity(pos + TETRA_V3 * delta, t, uniforms));

  return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}

/**
 * Tetrahedral gradient sampling of log-density at a position.
 */
fn computeGradientTetrahedralAtPos(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let s0 = sFromRho(sampleDensityAtPos(pos + TETRA_V0 * delta, t, uniforms));
  let s1 = sFromRho(sampleDensityAtPos(pos + TETRA_V1 * delta, t, uniforms));
  let s2 = sFromRho(sampleDensityAtPos(pos + TETRA_V2 * delta, t, uniforms));
  let s3 = sFromRho(sampleDensityAtPos(pos + TETRA_V3 * delta, t, uniforms));

  return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}
`

export const volumeIntegrationBlock = /* wgsl */ `
// ============================================
// Volume Integration (Beer-Lambert Compositing)
// ============================================

// Maximum samples per ray
const MAX_VOLUME_SAMPLES: i32 = 128;

// Minimum transmittance before early exit
const MIN_TRANSMITTANCE: f32 = 0.01;

// Minimum density to consider for accumulation
const MIN_DENSITY: f32 = 1e-8;
const EMPTY_SKIP_THRESHOLD: f32 = 1e-7;
const EMPTY_SKIP_FACTOR: f32 = 4.0;
const MIN_REMAINING_CONTRIBUTION: f32 = 0.001;
const MAX_REMAINING_DENSITY_BOUND: f32 = 8.0;

// Note: QUANTUM_MODE_* constants defined in uniforms.wgsl.ts

// Result structure for volume raymarching
// Contains fields for temporal reprojection support
struct VolumeResult {
  color: vec3f,
  alpha: f32,
  iterationCount: i32,   // Number of iterations performed (for debug visualization)
  primaryHitT: f32,      // Model-space ray distance to first significant density hit (for temporal reprojection)
}

/**
 * Compute time value for animation.
 */
fn getVolumeTime(uniforms: SchroedingerUniforms) -> f32 {
  return uniforms.time * uniforms.timeScale;
}

/**
 * Apply density contrast sharpening via smoothstep sigmoid transfer function.
 * Uses smoothstep(0, width, normalized) where width = 1/contrast.
 *
 * Effect: mid-range densities are BOOSTED toward peak (lobes stay same size),
 * while very low tail densities are suppressed to zero (kills blur/noise).
 * This creates a sharper opaque→transparent transition at lobe boundaries
 * without shrinking the visible lobe extent.
 *
 * contrast=1.0: bypass (linear)
 * contrast=1.5: gentle sharpening (width=0.67, saturates above 67% of peak)
 * contrast=2.0: moderate (width=0.50, saturates above 50% of peak)
 * contrast=3.0: aggressive (width=0.33, saturates above 33% of peak)
 */
fn applyDensityContrast(rho: f32, uniforms: SchroedingerUniforms) -> f32 {
  if (uniforms.densityContrast <= 1.0 || uniforms.peakDensity <= 0.0) { return rho; }
  let normalized = clamp(rho / uniforms.peakDensity, 0.0, 1.0);
  let width = 1.0 / uniforms.densityContrast;
  return smoothstep(0.0, width, normalized) * uniforms.peakDensity;
}

/**
 * Compute per-step internal fog alpha for volumetric integration.
 */
fn computeInternalFogAlpha(stepLen: f32, uniforms: SchroedingerUniforms) -> f32 {
  if (uniforms.fogIntegrationEnabled == 0u) { return 0.0; }
  if (uniforms.fogContribution <= 0.0 || uniforms.internalFogDensity <= 0.0) { return 0.0; }

  let fogDensity = uniforms.internalFogDensity * uniforms.fogContribution;
  return 1.0 - exp(-fogDensity * stepLen);
}

// ============================================
// Physical Nodal Classification
// ============================================

struct NodalSample {
  intensity: f32,
  signValue: f32,
  colorMode: i32,
  envelopeWeight: f32,
}

struct NodalScalarSample {
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
}

struct NodalSurfaceHit {
  hitMask: f32,
  t: f32,
  signValue: f32,
  colorMode: i32,
  normal: vec3f,
  _pad: f32,
}

// Sample complex wavefunction ψ at world position.
fn samplePsiWithFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let xND = mapPosToND(pos, uniforms);
  return evalPsi(xND, t, uniforms);
}

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
  let angular = evalHydrogenNDAngularCartesian(
    uniforms.azimuthalL,
    uniforms.magneticM,
    nx, ny, nz,
    uniforms.useRealOrbitals != 0u
  );
  return vec2f(radial, angular);
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

  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND && uniforms.nodalFamilyFilter != NODAL_FAMILY_ALL) {
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
    let value = max(abs(psi.x), abs(psi.y));
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
  let minAmplitude = max(uniforms.nodalTolerance * minAmplitudeScale, minAmplitudeFloor);
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

      for (var j: i32 = 0; j < 6; j++) {
        let tMid = (tLo + tHi) * 0.5;
        let pMid = rayOrigin + rayDir * tMid;
        let midSample = evaluateNodalScalarField(pMid, animTime, uniforms);
        if (nodalCrossingPair(loSample.value, midSample.value, eps)) {
          tHi = tMid;
          hiSample = midSample;
        } else {
          tLo = tMid;
          loSample = midSample;
        }
      }

      let hitT = (tLo + tHi) * 0.5;
      let hitPos = rayOrigin + rayDir * hitT;
      let hitSample = evaluateNodalScalarField(hitPos, animTime, uniforms);
      if (hitSample.amplitude < minAmplitude) {
        prevSample = currSample;
        continue;
      }
      let gradDelta = max(stepLen * 0.5, 0.01);

      let fx0 = evaluateNodalScalarField(hitPos - vec3f(gradDelta, 0.0, 0.0), animTime, uniforms).value;
      let fx1 = evaluateNodalScalarField(hitPos + vec3f(gradDelta, 0.0, 0.0), animTime, uniforms).value;
      let fy0 = evaluateNodalScalarField(hitPos - vec3f(0.0, gradDelta, 0.0), animTime, uniforms).value;
      let fy1 = evaluateNodalScalarField(hitPos + vec3f(0.0, gradDelta, 0.0), animTime, uniforms).value;
      let fz0 = evaluateNodalScalarField(hitPos - vec3f(0.0, 0.0, gradDelta), animTime, uniforms).value;
      let fz1 = evaluateNodalScalarField(hitPos + vec3f(0.0, 0.0, gradDelta), animTime, uniforms).value;
      let grad = vec3f(fx1 - fx0, fy1 - fy0, fz1 - fz0) / (2.0 * gradDelta);

      var normal = normalize(grad);
      if (length(grad) < 1e-5) {
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

// Compute physically grounded nodal intensity from ψ, Re(ψ), Im(ψ), and hydrogen factors.
fn computePhysicalNodalField(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> NodalSample {
  let eps = max(uniforms.nodalTolerance, 1e-6);
  let delta = 0.05;

  // Tetrahedral ψ sampling
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
  let maxAbsPsi = max(max(abs0, abs1), max(abs2, abs3));

  let psiCenter = (p0 + p1 + p2 + p3) * 0.25;
  let gradRe = (TETRA_V0 * re0 + TETRA_V1 * re1 + TETRA_V2 * re2 + TETRA_V3 * re3) * (0.75 / delta);
  let gradIm = (TETRA_V0 * im0 + TETRA_V1 * im1 + TETRA_V2 * im2 + TETRA_V3 * im3) * (0.75 / delta);
  let crossingRe = nodalCrossingMask(re0, re1, re2, re3, eps);
  let crossingIm = nodalCrossingMask(im0, im1, im2, im3, eps);

  var intensity = 0.0;
  var signValue = psiCenter.x;
  var colorMode = uniforms.nodalDefinition;

  // Optional hydrogen node-family filtering.
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND && uniforms.nodalFamilyFilter != NODAL_FAMILY_ALL) {
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

    let fCenter = (f0 + f1 + f2 + f3) * 0.25;
    let fGrad = (TETRA_V0 * f0 + TETRA_V1 * f1 + TETRA_V2 * f2 + TETRA_V3 * f3) * (0.75 / delta);
    let crossing = nodalCrossingMask(f0, f1, f2, f3, eps);
    intensity = nodalBandMask(fCenter, fGrad, eps) * crossing;
    signValue = fCenter;
    colorMode = NODAL_DEFINITION_PSI_ABS;
  } else {
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

  let envelopeFloor = max(eps * 0.4, 5e-5);
  let envelopeCeil = max(eps * 2.0, envelopeFloor + 1e-4);
  let envelopeWeight = smoothstep(envelopeFloor, envelopeCeil, maxAbsPsi);

  return NodalSample(clamp(intensity, 0.0, 1.0), signValue, colorMode, envelopeWeight);
}

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
  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
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

/**
 * Main volume raymarching function.
 * Supports lighting (matched to Mandelbulb behavior).
 * Returns: VolumeResult with color, alpha, and iteration count.
 *
 * Fixed sample counts: uses uniforms.sampleCount
 */
fn volumeRaymarch(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  // Primary hit tracking for temporal reprojection
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01; // Alpha threshold to consider a "hit"

  // Sample count scaled by per-pixel path length to keep step SIZE constant.
  // Glancing rays traverse less volume → fewer steps, same sampling density.
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);

  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  // Time for animation
  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let fogColor = lighting.ambientColor * lighting.ambientIntensity;

  // Transmittance
  var transmittance: f32 = 1.0;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  let boundR2Skip = boundR2 * 0.85;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERFORMANCE: Gaussian envelope early-skip for deep tail region.
    // The outer ~15% shell of the bounding sphere is exponentially low density.
    // Skip expensive wavefunction evaluation and take 8x steps through it.
    let r2 = dot(pos, pos);
    if (r2 > boundR2Skip) {
      t += stepLen * 8.0;
      continue;
    }

    // Sample density with phase AND get flowed position for optimized gradient computation
    let densityResult = sampleDensityWithPhaseAndFlow(pos, animTime, uniforms);
    let densityInfo = densityResult[0];
    let flowedPos = densityResult[1];
    let rho = densityInfo.x;
    let sCenter = densityInfo.y;
    let phase = densityInfo.z;

    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    // PERFORMANCE: Adaptive step size based on density
    // Take larger steps in empty regions to reduce wasted samples.
    // IMPORTANT: Use adaptiveStep for absorption/fog integration to preserve energy.
    var stepMultiplier = 1.0;
    if (sCenter < -12.0) {
      stepMultiplier = 4.0;  // 4x larger steps in near-empty regions
    } else if (sCenter < -8.0) {
      stepMultiplier = 2.0;  // 2x larger steps in low density regions
    }
    // Clamp to not overshoot tFar
    let adaptiveStep = min(stepLen * stepMultiplier, tFar - t);

    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND
    ) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensity = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalOpticalStep = min(adaptiveStep, stepLen * 1.5);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensity * uniforms.nodalStrength, 0.0) * nodalOpticalStep),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = mix(nodalColor, nodalColor * fogColor, 0.35);
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha * 0.6);
        }
      }
    }

    let momentumOverlaySubsample =
      uniforms.representationMode == REPRESENTATION_MOMENTUM && (i & 3) != 0;
    if (
      !momentumOverlaySubsample &&
      uniforms.probabilityCurrentEnabled != 0u &&
      uniforms.probabilityCurrentScale > 0.0
    ) {
      let normalProxy = normalize(pos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos,
        currentSample,
        rho,
        normalProxy,
        viewDir,
        uniforms
      );
      if (currentOverlay.a > 1e-5) {
        let overlayAlpha = clamp(
          currentOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
          0.0,
          1.0
        );
        accColor += transmittance * overlayAlpha * currentOverlay.rgb;
        transmittance *= (1.0 - overlayAlpha * 0.45);
      }
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      if (rProbOverlay.a > 1e-5) {
        let rProbAlpha = clamp(
          rProbOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 1.0
        );
        accColor += transmittance * rProbAlpha * rProbOverlay.rgb;
        transmittance *= (1.0 - rProbAlpha * 0.5);
      }
    }

    // Density contrast sharpening: compress low-density tails for sharper lobes
    var effectiveRho = applyDensityContrast(rho, uniforms);
    // Phase materiality: smoke regions are denser (more absorbing)
    if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
      let pmPhase = fract((phase + PI) / TAU);
      let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
      effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
    }
    // Nodal plane softening: when inside the cloud, apply a tiny density floor
    // to fill the thin dark line artifact where |psi|^2 = 0 at nodal surfaces.
    // Scales with cloud depth so edges and empty space are unaffected.
    let cloudDepth = 1.0 - transmittance;
    effectiveRho = max(effectiveRho, 5e-4 * cloudDepth * cloudDepth);
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient for emission lighting
      // When eigenfunction cache is available, use analytical gradient (no extra evaluations).
      // Otherwise, fall back to tetrahedral finite differences (4 samples).
      var gradient: vec3f;
      if (USE_ANALYTICAL_GRADIENT) {
        gradient = computeAnalyticalGradient(pos, animTime, uniforms);
      } else {
        gradient = computeGradientTetrahedralAtPos(flowedPos, animTime, 0.05, uniforms);
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing (scalar path)
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    // Internal fog integration (scene atmosphere inside volume)
    let fogAlpha = computeInternalFogAlpha(adaptiveStep, uniforms);
    if (fogAlpha > 0.0001) {
      accColor += transmittance * fogAlpha * fogColor;
      transmittance *= (1.0 - fogAlpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // If no primary hit found, use midpoint of ray segment
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}

/**
 * High-quality volume integration with lighting.
 * Uses tetrahedral gradient sampling (4 samples) for O(h^2) accuracy.
 */
fn volumeRaymarchHQ(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);
  var transmittance: f32 = 1.0;

  // Iteration counter for debug visualization
  var iterCount: i32 = 0;

  // Primary hit tracking for temporal reprojection
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01; // Alpha threshold to consider a "hit"

  // Sample count scaled by per-pixel path length to keep step SIZE constant.
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let fogColor = lighting.ambientColor * lighting.ambientIntensity;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  let boundR2Skip = boundR2 * 0.85;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;  // Track iteration count

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERFORMANCE: Gaussian envelope early-skip for deep tail region.
    let r2 = dot(pos, pos);
    if (r2 > boundR2Skip) {
      t += stepLen * 8.0;
      continue;
    }

    // First do cheap center-only density check
    let quickCheck = sampleDensityWithPhase(pos, animTime, uniforms);
    let quickRho = quickCheck.x;
    let quickS = quickCheck.y;

    // Skip expensive tetrahedral gradient when density is negligible
    var skipGradient = (quickS < -15.0);

    if (quickRho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensity(pos + rayDir * (skipDistance * 0.5), animTime, uniforms);
        let probeFar = sampleDensity(pos + rayDir * skipDistance, animTime, uniforms);
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    var rho: f32;
    var sCenter: f32;
    var phase: f32;
    var gradient: vec3f;

    if (skipGradient) {
      rho = quickRho;
      sCenter = quickS;
      phase = quickCheck.z;
      gradient = vec3f(0.0);
    } else if (USE_ANALYTICAL_GRADIENT) {
      // Analytical gradient from cached eigenfunctions (1 eval vs 4 tetrahedral samples)
      let cached = sampleDensityWithAnalyticalGradient(pos, animTime, uniforms);
      rho = cached.rho;
      sCenter = cached.s;
      phase = cached.phase;
      gradient = cached.gradient;
    } else {
      let tetra = sampleWithTetrahedralGradient(pos, animTime, 0.05, uniforms);
      rho = tetra.rho;
      sCenter = tetra.s;
      phase = tetra.phase;
      gradient = tetra.gradient;
    }

    // PERFORMANCE: Adaptive step size based on density
    // Take larger steps in empty regions to reduce wasted samples.
    // IMPORTANT: Use adaptiveStep for absorption/fog integration to preserve energy.
    var stepMultiplier = 1.0;
    if (quickS < -12.0) {
      stepMultiplier = 4.0;  // 4x larger steps in near-empty regions
    } else if (quickS < -8.0) {
      stepMultiplier = 2.0;  // 2x larger steps in low density regions
    }
    // Clamp to not overshoot tFar
    let adaptiveStep = min(stepLen * stepMultiplier, tFar - t);

    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND
    ) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensityHQ = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensityHQ > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalOpticalStepHQ = min(adaptiveStep, stepLen * 1.5);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensityHQ * uniforms.nodalStrength, 0.0) * nodalOpticalStepHQ),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = mix(nodalColor, nodalColor * fogColor, 0.35);
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha * 0.6);
        }
      }
    }

    let momentumOverlaySubsample =
      uniforms.representationMode == REPRESENTATION_MOMENTUM && (i & 3) != 0;
    if (
      !momentumOverlaySubsample &&
      uniforms.probabilityCurrentEnabled != 0u &&
      uniforms.probabilityCurrentScale > 0.0
    ) {
      let normalProxy = normalize(gradient + pos * 0.2 + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos,
        currentSample,
        rho,
        normalProxy,
        viewDir,
        uniforms
      );
      if (currentOverlay.a > 1e-5) {
        let overlayAlpha = clamp(
          currentOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
          0.0,
          1.0
        );
        accColor += transmittance * overlayAlpha * currentOverlay.rgb;
        transmittance *= (1.0 - overlayAlpha * 0.45);
      }
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      if (rProbOverlay.a > 1e-5) {
        let rProbAlpha = clamp(
          rProbOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 1.0
        );
        accColor += transmittance * rProbAlpha * rProbOverlay.rgb;
        transmittance *= (1.0 - rProbAlpha * 0.5);
      }
    }

    // Phase materiality: smoke regions are denser (more absorbing)
    // Density contrast sharpening: compress low-density tails for sharper lobes
    var effectiveRho = applyDensityContrast(rho, uniforms);
    // Phase materiality: smoke regions are denser (more absorbing)
    if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
      let pmPhase = fract((phase + PI) / TAU);
      let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
      effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
    }
    // Nodal plane softening: density floor AFTER contrast so sigmoid doesn't kill it
    let cloudDepthHQ = 1.0 - transmittance;
    effectiveRho = max(effectiveRho, 5e-4 * cloudDepthHQ * cloudDepthHQ);
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      // Track primary hit for temporal reprojection
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute emission with lighting (pass pre-computed log-density to avoid redundant log())
      let emission = computeEmissionLit(rho, sCenter, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    // Internal fog integration (scene atmosphere inside volume)
    let fogAlpha = computeInternalFogAlpha(adaptiveStep, uniforms);
    if (fogAlpha > 0.0001) {
      accColor += transmittance * fogAlpha * fogColor;
      transmittance *= (1.0 - fogAlpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // If no primary hit found, use midpoint of ray segment
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`

/**
 * Grid-based volume raymarching function.
 * Uses pre-computed 3D density grid texture instead of inline wavefunction evaluation.
 * Same compositing logic as volumeRaymarch() but ~3-6x cheaper per step
 * (texture lookup vs Laguerre + Legendre + spherical harmonics).
 *
 * Only used for hydrogen modes when eigenfunctionCacheEnabled.
 */
export const volumeRaymarchGridBlock = /* wgsl */ `
// ============================================
// Grid-Based Volume Raymarching
// ============================================

fn volumeRaymarchGrid(
  rayOrigin: vec3f,
  rayDir: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms
) -> VolumeResult {
  var accColor = vec3f(0.0);
  var iterCount: i32 = 0;
  var primaryHitT: f32 = -1.0;
  let primaryHitThreshold: f32 = 0.01;

  // Sample count scaled by per-pixel path length to keep step SIZE constant
  let maxPathLen = 2.0 * uniforms.boundingRadius;
  let sampleCount = max(i32(f32(max(uniforms.sampleCount, 1)) * (tFar - tNear) / maxPathLen), 4);
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;
  let fogColor = lighting.ambientColor * lighting.ambientIntensity;

  var transmittance: f32 = 1.0;

  // PERF: Hoist loop-invariant bounding radius computation
  let boundR2 = uniforms.boundingRadius * uniforms.boundingRadius;
  let boundR2Skip = boundR2 * 0.85;

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }
    iterCount = i + 1;

    if (transmittance < MIN_TRANSMITTANCE) { break; }
    let remainingDistance = max(tFar - t, 0.0);
    let maxRemainingOpacity = 1.0 - exp(-min(uniforms.densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDistance, 20.0));
    let remainingContributionBound = transmittance * maxRemainingOpacity;
    if (remainingContributionBound < MIN_REMAINING_CONTRIBUTION) { break; }

    let pos = rayOrigin + rayDir * t;

    // PERF: Gaussian envelope early-skip for deep tail region.
    // The outer ~15% shell of the bounding sphere is exponentially low density.
    // Skip expensive texture lookups and take 8x steps through it.
    // Free scalar fills a cube, not a sphere — skip this optimization.
    if (!IS_FREE_SCALAR) {
      let r2 = dot(pos, pos);
      if (r2 > boundR2Skip) {
        t += stepLen * 8.0;
        continue;
      }
    }

    // Sample density from pre-computed 3D grid texture
    // Returns (rho, logRho, spatialPhase, relativePhase) for rgba16float
    // Returns (rho, 0, 0, 0) for r16float
    let gridSample = sampleDensityFromGrid(pos, uniforms);
    var rho = gridSample.r;

    // Compute logRho: use grid value if available (rgba16float), else compute from rho
    var sCenter: f32;
    if (DENSITY_GRID_HAS_PHASE) {
      sCenter = gridSample.g; // logRho from grid
    } else {
      sCenter = select(-20.0, log(rho), rho > 1e-9);
    }

    // Phase: choose spatial (B) or relative (A) based on compile-time color algorithm.
    var phase: f32;
    if (DENSITY_GRID_HAS_PHASE) {
      phase = select(gridSample.b, gridSample.a, COLOR_ALGORITHM == 10);
    } else {
      phase = 0.0;
    }

    // Apply uncertainty boundary emphasis (matches inline sampleDensityWithPhase path)
    // PERF: Only recompute log(rho) when emphasis actually modifies rho
    if (FEATURE_UNCERTAINTY_BOUNDARY) {
      rho = applyUncertaintyBoundaryEmphasis(rho, sCenter, uniforms);
      // Update logRho to reflect emphasis so emission color/brightness matches inline path
      // (computeBaseColor uses s for color mapping: normalized = clamp((s+8)/8, 0, 1))
      sCenter = select(-20.0, log(rho), rho > 1e-9);
    }

    // Skip near-zero density regions
    if (rho < EMPTY_SKIP_THRESHOLD) {
      let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(tFar - t, 0.0));
      if (skipDistance > stepLen) {
        let probeMid = sampleDensityFromGrid(pos + rayDir * (skipDistance * 0.5), uniforms).r;
        let probeFar = sampleDensityFromGrid(pos + rayDir * skipDistance, uniforms).r;
        if (probeMid < EMPTY_SKIP_THRESHOLD && probeFar < EMPTY_SKIP_THRESHOLD) {
          t += skipDistance;
          continue;
        }
      }
    }

    // Adaptive step size based on density
    var stepMultiplier = 1.0;
    if (sCenter < -12.0) {
      stepMultiplier = 4.0;
    } else if (sCenter < -8.0) {
      stepMultiplier = 2.0;
    }
    let adaptiveStep = min(stepLen * stepMultiplier, tFar - t);

    // Nodal surface overlay (uses inline evaluation, not grid)
    if (
      FEATURE_NODAL &&
      uniforms.nodalEnabled != 0u &&
      uniforms.nodalStrength > 0.0 &&
      uniforms.nodalRenderMode == NODAL_RENDER_MODE_BAND
    ) {
      let nodal = computePhysicalNodalField(pos, animTime, uniforms);
      let fadedIntensity = nodal.intensity * nodal.envelopeWeight;
      if (fadedIntensity > 1e-4) {
        let nodalColor = selectPhysicalNodalColor(uniforms, nodal.colorMode, nodal.signValue);
        let nodalOpticalStep = min(adaptiveStep, stepLen * 1.5);
        let nodalAlpha = clamp(
          1.0 - exp(-max(fadedIntensity * uniforms.nodalStrength, 0.0) * nodalOpticalStep),
          0.0,
          1.0
        );
        if (nodalAlpha > 1e-5) {
          let nodalScattered = mix(nodalColor, nodalColor * fogColor, 0.35);
          accColor += transmittance * nodalAlpha * nodalScattered;
          transmittance *= (1.0 - nodalAlpha * 0.6);
        }
      }
    }

    // Probability current overlay
    let momentumOverlaySubsample =
      uniforms.representationMode == REPRESENTATION_MOMENTUM && (i & 3) != 0;
    if (
      !momentumOverlaySubsample &&
      uniforms.probabilityCurrentEnabled != 0u &&
      uniforms.probabilityCurrentScale > 0.0
    ) {
      let normalProxy = normalize(pos + vec3f(1e-6, 0.0, 0.0));
      let currentSample = sampleProbabilityCurrent(pos, animTime, uniforms);
      let currentOverlay = computeProbabilityCurrentOverlay(
        pos,
        currentSample,
        rho,
        normalProxy,
        viewDir,
        uniforms
      );
      if (currentOverlay.a > 1e-5) {
        let overlayAlpha = clamp(
          currentOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
          0.0,
          1.0
        );
        accColor += transmittance * overlayAlpha * currentOverlay.rgb;
        transmittance *= (1.0 - overlayAlpha * 0.45);
      }
    }

    // Radial probability overlay (hydrogen P(r) shells)
    if (FEATURE_RADIAL_PROBABILITY && uniforms.radialProbabilityEnabled != 0u) {
      let rProbOverlay = computeRadialProbabilityOverlay(pos, uniforms);
      if (rProbOverlay.a > 1e-5) {
        let rProbAlpha = clamp(
          rProbOverlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0), 0.0, 1.0
        );
        accColor += transmittance * rProbAlpha * rProbOverlay.rgb;
        transmittance *= (1.0 - rProbAlpha * 0.5);
      }
    }

    // Density contrast sharpening: compress low-density tails for sharper lobes
    var effectiveRho = applyDensityContrast(rho, uniforms);
    // Phase materiality: smoke regions are denser (more absorbing)
    if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
      let pmPhase = fract((phase + PI) / TAU);
      let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
      effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
    }
    // Nodal plane softening: density floor AFTER contrast so sigmoid doesn't kill it
    let cloudDepth = 1.0 - transmittance;
    effectiveRho = max(effectiveRho, 5e-4 * cloudDepth * cloudDepth);
    let alpha = computeAlpha(effectiveRho, adaptiveStep, uniforms.densityGain);

    if (alpha > 0.001) {
      if (primaryHitT < 0.0 && alpha > primaryHitThreshold) {
        primaryHitT = t;
      }

      // Compute gradient from grid (central differences on texture)
      let gradient = computeGradientFromGrid(pos, uniforms);

      // Compute emission with lighting
      let emission = computeEmissionLit(rho, sCenter, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    // Internal fog integration
    let fogAlpha = computeInternalFogAlpha(adaptiveStep, uniforms);
    if (fogAlpha > 0.0001) {
      accColor += transmittance * fogAlpha * fogColor;
      transmittance *= (1.0 - fogAlpha);
    }

    t += adaptiveStep;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;
  if (primaryHitT < 0.0) {
    primaryHitT = (tNear + tFar) * 0.5;
  }

  return VolumeResult(accColor, finalAlpha, iterCount, primaryHitT);
}
`
