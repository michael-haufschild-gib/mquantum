/**
 * Shared WGSL helpers for volume raymarching compositing.
 *
 * Extracted from volumeRaymarch, volumeRaymarchHQ, and volumeRaymarchGrid
 * to eliminate duplicated compositing logic across the three functions.
 *
 * Depends on: volumeIntegrationBlock (constants, applyDensityContrast),
 *             shared defines (FEATURE_PHASE_MATERIALITY, PI, TAU).
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeCompositing.wgsl
 */

/**
 * Shared compositing helpers used by all three volume raymarching functions.
 * Must be assembled after volumeIntegrationBlock (which defines constants and
 * applyDensityContrast) and before the raymarching blocks.
 */
export const volumeCompositingBlock = /* wgsl */ `
// ============================================
// Volume Compositing Helpers
// ============================================

/**
 * Early ray termination check.
 * Returns true when remaining contribution is below perceptible threshold.
 *
 * @param transmittance Current accumulated transmittance
 * @param densityGain Absorption coefficient (sigma)
 * @param remainingDist Remaining ray distance (tFar - t)
 */
fn shouldTerminateRay(transmittance: f32, densityGain: f32, remainingDist: f32) -> bool {
  // Primary check: below perceptible contribution (covers ~95% of terminations)
  if (transmittance < MIN_TRANSMITTANCE) { return true; }
  // Cheap distance-based check: replace exp() with linear approximation.
  // When remainingDist is small, the max opacity ≈ sigma*rho*dist.
  // The exact formula 1-exp(-sigma*rho*dist) is bounded below by min(sigma*rho*dist, 1).
  // Using the linear bound avoids exp() per step while being slightly more conservative
  // (terminates a few steps later than the exact check in edge cases).
  let maxAlphaEstimate = min(densityGain * MAX_REMAINING_DENSITY_BOUND * remainingDist, 1.0);
  return transmittance * maxAlphaEstimate < MIN_REMAINING_CONTRIBUTION;
}

/**
 * Adaptive step size from log-density.
 * Low-density regions use larger steps (4x at log(rho)<-12, 2x at <-8).
 *
 * @param logDensity Log of probability density (sCenter)
 * @param stepLen Base step length
 * @param maxRemaining Maximum remaining distance (tFar - t)
 */
fn computeAdaptiveStep(logDensity: f32, stepLen: f32, maxRemaining: f32) -> f32 {
  var multiplier = 1.0;
  if (logDensity < -12.0) {
    multiplier = 4.0;
  } else if (logDensity < -8.0) {
    multiplier = 2.0;
  }
  return min(stepLen * multiplier, maxRemaining);
}

/**
 * Effective density after contrast sharpening, phase materiality, and nodal softening.
 * Combines three per-sample density transformations that are identical across all
 * raymarching variants.
 *
 * @param rho Raw probability density
 * @param phase Wavefunction spatial phase
 * @param transmittance Current accumulated transmittance
 * @param uniforms Schroedinger uniforms
 */
fn computeEffectiveDensity(
  rho: f32,
  phase: f32,
  transmittance: f32,
  uniforms: SchroedingerUniforms
) -> f32 {
  var effectiveRho = applyDensityContrast(rho, uniforms);
  if (FEATURE_PHASE_MATERIALITY && uniforms.phaseMaterialityEnabled != 0u) {
    let pmPhase = fract((phase + PI) / TAU);
    let pmSmoke = 1.0 - smoothstep(0.35, 0.65, pmPhase);
    effectiveRho *= mix(1.0, 3.0, pmSmoke * uniforms.phaseMaterialityStrength);
  }
  let cloudDepth = 1.0 - transmittance;
  effectiveRho = max(effectiveRho, 5e-4 * cloudDepth * cloudDepth);
  return effectiveRho;
}

/**
 * Composite a nodal band overlay into the volume accumulation.
 * Uses Beer-Lambert alpha from faded intensity and nodal strength.
 *
 * @param fadedIntensity Nodal intensity * envelope weight
 * @param nodalStrength Nodal overlay strength from uniforms
 * @param nodalColor Selected nodal color
 * @param opticalStep Clamped step length for optical density
 * @param ambientLight Pre-computed ambient (color * intensity)
 * @param transmittance Mutable accumulated transmittance
 * @param accColor Mutable accumulated color
 */
fn compositeNodalBand(
  fadedIntensity: f32,
  nodalStrength: f32,
  nodalColor: vec3f,
  opticalStep: f32,
  ambientLight: vec3f,
  transmittance: ptr<function, f32>,
  accColor: ptr<function, vec3f>
) {
  let nodalAlpha = clamp(
    1.0 - exp(-max(fadedIntensity * nodalStrength, 0.0) * opticalStep),
    0.0,
    1.0
  );
  if (nodalAlpha > 1e-5) {
    let nodalScattered = mix(nodalColor, nodalColor * ambientLight, 0.35);
    *accColor += *transmittance * nodalAlpha * nodalScattered;
    *transmittance *= (1.0 - nodalAlpha * 0.6);
  }
}

/**
 * Composite a generic overlay (probability current or radial probability)
 * into the volume accumulation. Uses linear alpha scaling.
 *
 * @param overlay RGBA overlay (rgb = color, a = raw alpha)
 * @param adaptiveStep Current adaptive step length
 * @param stepLen Base step length
 * @param damping Transmittance damping factor (0.45 for current, 0.5 for radial)
 * @param transmittance Mutable accumulated transmittance
 * @param accColor Mutable accumulated color
 */
fn compositeOverlay(
  overlay: vec4f,
  adaptiveStep: f32,
  stepLen: f32,
  damping: f32,
  transmittance: ptr<function, f32>,
  accColor: ptr<function, vec3f>
) {
  if (overlay.a > 1e-5) {
    let alpha = clamp(
      overlay.a * min(adaptiveStep / max(stepLen, 1e-5), 2.0),
      0.0,
      1.0
    );
    *accColor += *transmittance * alpha * overlay.rgb;
    *transmittance *= (1.0 - alpha * damping);
  }
}
`
