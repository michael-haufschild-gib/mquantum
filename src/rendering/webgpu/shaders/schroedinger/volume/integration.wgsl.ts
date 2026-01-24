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

// Threshold for considering a sample as "entry" into the volume
const ENTRY_ALPHA_THRESHOLD: f32 = 0.01;

// Quantum mode constants
const QUANTUM_MODE_HARMONIC: i32 = 0;

// Result structure for volume raymarching
// Includes weighted center for temporal reprojection (more stable than entry point)
struct VolumeResult {
  color: vec3f,
  alpha: f32,
  entryT: f32,           // Distance to first meaningful contribution (-1 if none)
  weightedCenter: vec3f, // Density-weighted center position (for stable reprojection)
  centerWeight: f32,     // Weight sum for center (0 if no valid center)
}

// ============================================
// Tetrahedral Gradient Sampling
// ============================================
// Uses symmetric 4-point stencil for combined density+gradient computation
// More accurate than forward differences (O(h^2) vs O(h)) with same sample count

// Tetrahedral stencil vertices (regular tetrahedron, equidistant from origin)
// Normalized to unit distance: each vertex is 1/sqrt(3) from origin
const TETRA_V0: vec3f = vec3f(+1.0, +1.0, -1.0) * 0.5773503;
const TETRA_V1: vec3f = vec3f(+1.0, -1.0, +1.0) * 0.5773503;
const TETRA_V2: vec3f = vec3f(-1.0, +1.0, +1.0) * 0.5773503;
const TETRA_V3: vec3f = vec3f(-1.0, -1.0, -1.0) * 0.5773503;

// Result structure for combined density+gradient sampling
struct TetraSample {
  rho: f32,       // Probability density (averaged from 4 samples)
  s: f32,         // Log-density (averaged)
  phase: f32,     // Spatial phase (averaged)
  gradient: vec3f // Gradient of log-density
}

/**
 * Compute time value for animation.
 */
fn getVolumeTime(uniforms: SchroedingerUniforms) -> f32 {
  return uniforms.time * uniforms.timeScale;
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
 * Main volume raymarching function.
 * Supports lighting (matched to Mandelbulb behavior).
 * Returns: VolumeResult with color, alpha, entry distance, and density-weighted centroid.
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
  var entryT: f32 = -1.0;  // Track first meaningful contribution

  // Centroid accumulation for stable temporal reprojection
  var centroidSum = vec3f(0.0);
  var centroidWeight: f32 = 0.0;

  // Sample count from uniforms
  let sampleCount = uniforms.sampleCount;

  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  // Time for animation
  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;

  // Transmittance (scalar for non-dispersion path)
  var transmittance: f32 = 1.0;

  // Consecutive low-density samples (for early exit)
  var lowDensityCount: i32 = 0;
  let allowEarlyExit = (uniforms.quantumMode == QUANTUM_MODE_HARMONIC);

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }

    if (transmittance < MIN_TRANSMITTANCE) { break; }

    let pos = rayOrigin + rayDir * t;

    // Sample density with phase
    let densityInfo = sampleDensityWithPhase(pos, animTime, uniforms);
    let rho = densityInfo.x;
    let sCenter = densityInfo.y;
    let phase = densityInfo.z;

    // Early exit if density is consistently low (harmonic oscillator only)
    if (allowEarlyExit && rho < MIN_DENSITY) {
      lowDensityCount++;
      if (lowDensityCount > 5) { break; }
      t += stepLen;
      continue;
    } else {
      lowDensityCount = 0;
    }

    var rhoAlpha = rho;

    // Nodal Surface Opacity Boost
    if (uniforms.nodalEnabled != 0u) {
      if (sCenter < -5.0 && sCenter > -12.0) {
        let intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
        rhoAlpha += 5.0 * uniforms.nodalStrength * intensity;
      }
    }

    let alpha = computeAlpha(rhoAlpha, stepLen, uniforms.densityGain);

    if (alpha > 0.001) {
      if (entryT < 0.0 && alpha > ENTRY_ALPHA_THRESHOLD) {
        entryT = t;
      }

      // CENTROID ACCUMULATION
      let weight = alpha * transmittance;
      centroidSum += pos * weight;
      centroidWeight += weight;

      // Compute gradient for lighting
      let gradient = computeGradientTetrahedral(pos, animTime, 0.05, uniforms);

      // Compute emission with lighting
      let emission = computeEmissionLit(rho, phase, pos, gradient, viewDir, uniforms);

      // Front-to-back compositing (scalar path)
      accColor += transmittance * alpha * emission;
      transmittance *= (1.0 - alpha);
    }

    t += stepLen;
  }

  // Final alpha
  let finalAlpha = 1.0 - transmittance;

  // Fallback: if no entry found, use midpoint for depth
  if (entryT < 0.0) {
    entryT = (tNear + tFar) * 0.5;
  }

  // Compute final weighted center
  var wCenter: vec3f;
  if (centroidWeight > 0.001) {
    wCenter = centroidSum / centroidWeight;
  } else {
    wCenter = rayOrigin + rayDir * entryT;
  }

  return VolumeResult(accColor, finalAlpha, entryT, wCenter, centroidWeight);
}

/**
 * High-quality volume integration with lighting and dispersion support.
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
  var transmittance = vec3f(1.0); // vec3 for chromatic dispersion support
  var entryT: f32 = -1.0;

  // Centroid accumulation for stable temporal reprojection
  var centroidSum = vec3f(0.0);
  var centroidWeight: f32 = 0.0;

  let sampleCount = uniforms.sampleCount;
  let stepLen = (tFar - tNear) / f32(sampleCount);
  var t = tNear;

  let animTime = getVolumeTime(uniforms);
  let viewDir = -rayDir;

  // Dispersion offsets
  var dispOffsetR = vec3f(0.0);
  var dispOffsetB = vec3f(0.0);
  let dispersionActive = uniforms.dispersionEnabled != 0u && uniforms.dispersionStrength > 0.0;

  if (dispersionActive) {
    let dispAmount = uniforms.dispersionStrength * 0.15;

    if (uniforms.dispersionDirection == 1) { // View-aligned
      // Use alternative up vector when rayDir is nearly vertical to avoid NaN from zero cross product
      var up = vec3f(0.0, 1.0, 0.0);
      if (abs(rayDir.y) > 0.999) {
        up = vec3f(1.0, 0.0, 0.0);
      }
      let right = normalize(cross(rayDir, up));
      dispOffsetR = right * dispAmount;
      dispOffsetB = -right * dispAmount;
    }
    // Radial mode: offset updated inside loop
  }

  for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) { break; }

    // Exit if ALL channels are blocked
    if (transmittance.r < MIN_TRANSMITTANCE &&
        transmittance.g < MIN_TRANSMITTANCE &&
        transmittance.b < MIN_TRANSMITTANCE) { break; }

    let pos = rayOrigin + rayDir * t;

    // Update radial dispersion offset per sample
    if (dispersionActive && uniforms.dispersionDirection == 0) {
      let normalProxy = normalize(pos);
      let dispAmount = uniforms.dispersionStrength * 0.15;
      dispOffsetR = normalProxy * dispAmount;
      dispOffsetB = -normalProxy * dispAmount;
    }

    // First do cheap center-only density check
    let quickCheck = sampleDensityWithPhase(pos, animTime, uniforms);
    let quickRho = quickCheck.x;
    let quickS = quickCheck.y;

    // Skip expensive tetrahedral gradient when density is negligible
    var skipGradient = (quickS < -15.0);

    // Nodal can boost low-density samples
    if (uniforms.nodalEnabled != 0u && quickS > -12.0 && quickS < -5.0) {
      skipGradient = false;
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
    } else {
      let tetra = sampleWithTetrahedralGradient(pos, animTime, 0.05, uniforms);
      rho = tetra.rho;
      sCenter = tetra.s;
      phase = tetra.phase;
      gradient = tetra.gradient;
    }

    // Chromatic Dispersion Logic
    var rhoRGB = vec3f(rho);

    if (dispersionActive) {
      // Gradient extrapolation for R/B channels
      let s_r = sCenter + dot(gradient, dispOffsetR);
      let s_b = sCenter + dot(gradient, dispOffsetB);
      rhoRGB.r = exp(s_r);
      rhoRGB.b = exp(s_b);
    }

    // Nodal Surface Opacity Boost
    var rhoAlpha = rhoRGB;

    if (uniforms.nodalEnabled != 0u) {
      if (sCenter < -5.0 && sCenter > -12.0) {
        let intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
        let boost = 5.0 * uniforms.nodalStrength * intensity;
        rhoAlpha += vec3f(boost);
      }
    }

    // Alpha per channel (using boosted density)
    var alpha: vec3f;
    alpha.r = computeAlpha(rhoAlpha.r, stepLen, uniforms.densityGain);
    alpha.g = computeAlpha(rhoAlpha.g, stepLen, uniforms.densityGain);
    alpha.b = computeAlpha(rhoAlpha.b, stepLen, uniforms.densityGain);

    if (alpha.g > 0.001 || alpha.r > 0.001 || alpha.b > 0.001) {
      // Track entry point (use Green/Center channel)
      if (entryT < 0.0 && alpha.g > ENTRY_ALPHA_THRESHOLD) {
        entryT = t;
      }

      // CENTROID ACCUMULATION
      let avgAlpha = (alpha.r + alpha.g + alpha.b) / 3.0;
      let avgTrans = (transmittance.r + transmittance.g + transmittance.b) / 3.0;
      let weight = avgAlpha * avgTrans;
      centroidSum += pos * weight;
      centroidWeight += weight;

      // Compute emission using ORIGINAL density (rhoRGB) so coloring logic works
      let emissionCenter = computeEmissionLit(rhoRGB.g, phase, pos, gradient, viewDir, uniforms);

      // Modulate emission for R/B channels based on their density relative to G
      var emission: vec3f;
      emission.g = emissionCenter.g;
      emission.r = emissionCenter.r * (rhoRGB.r / max(rhoRGB.g, 0.0001));
      emission.b = emissionCenter.b * (rhoRGB.b / max(rhoRGB.g, 0.0001));

      accColor += transmittance * alpha * emission;
      transmittance *= (vec3f(1.0) - alpha);
    }

    t += stepLen;
  }

  // Fallback: if no entry found, use midpoint for depth
  if (entryT < 0.0) {
    entryT = (tNear + tFar) * 0.5;
  }

  // Compute final weighted center
  var wCenter: vec3f;
  if (centroidWeight > 0.001) {
    wCenter = centroidSum / centroidWeight;
  } else {
    wCenter = rayOrigin + rayDir * entryT;
  }

  // Final alpha (average remaining transmittance)
  let finalAlpha = 1.0 - (transmittance.r + transmittance.g + transmittance.b) / 3.0;

  return VolumeResult(accColor, finalAlpha, entryT, wCenter, centroidWeight);
}
`
