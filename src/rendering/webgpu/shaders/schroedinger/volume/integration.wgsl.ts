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

// Maximum samples per ray (iteration budget, clamped by sampleCount from uniforms)
const MAX_VOLUME_SAMPLES: i32 = 128;

// 1% remaining transmittance → max 2.56/256 sRGB levels → below quantization noise.
// Conservative 2.5× margin over minimum perceptible delta (1/255 ≈ 0.004).
const MIN_TRANSMITTANCE: f32 = 0.01;

// Minimum density to consider for accumulation (below f32 precision for alpha)
const MIN_DENSITY: f32 = 1e-8;
// At ρ=1e-7 for Gaussian ψ: r≈4σ (deep tail). 2-point probe guards against missed spikes.
const EMPTY_SKIP_THRESHOLD: f32 = 1e-7;
// 4× step at ρ<1e-7: alpha contribution ≈ σ·1e-7·4·stepLen ≈ 8e-9·σ. Sub-pixel.
const EMPTY_SKIP_FACTOR: f32 = 4.0;
// transmittance × max_remaining_alpha at this threshold < 0.1%. Below 8-bit precision.
const MIN_REMAINING_CONTRIBUTION: f32 = 0.001;
// Upper ρ bound for early-exit estimate. Normalized HO peak ≈ 1/(π^1.5) ≈ 0.18;
// high-n hydrogen peaks ≈ 2-5. 8.0 provides ≥1.5× safety margin. (computeAlpha clamps at 10.)
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
    // Use Re*Im product: sign-changing at EITHER Re(ψ)=0 or Im(ψ)=0.
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
      let invTwoGradDelta = 0.5 / gradDelta;

      let dxOff = vec3f(gradDelta, 0.0, 0.0);
      let dyOff = vec3f(0.0, gradDelta, 0.0);
      let dzOff = vec3f(0.0, 0.0, gradDelta);
      let fx0 = evaluateNodalScalarField(hitPos - dxOff, animTime, uniforms).value;
      let fx1 = evaluateNodalScalarField(hitPos + dxOff, animTime, uniforms).value;
      let fy0 = evaluateNodalScalarField(hitPos - dyOff, animTime, uniforms).value;
      let fy1 = evaluateNodalScalarField(hitPos + dyOff, animTime, uniforms).value;
      let fz0 = evaluateNodalScalarField(hitPos - dzOff, animTime, uniforms).value;
      let fz1 = evaluateNodalScalarField(hitPos + dzOff, animTime, uniforms).value;
      let grad = vec3f(fx1 - fx0, fy1 - fy0, fz1 - fz0) * invTwoGradDelta;

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

`

// Re-export raymarching block from dedicated module
export { volumeRaymarchBlock } from './volumeRaymarch.wgsl'

// Re-export grid raymarching block from dedicated module
export { volumeRaymarchGridBlock } from './volumeRaymarchGrid.wgsl'
