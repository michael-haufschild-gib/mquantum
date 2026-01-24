/**
 * WGSL Photon Shell
 *
 * Port of GLSL blackhole/gravity/shell.glsl to WGSL.
 * Handles photon sphere visualization and adaptive step sizing.
 *
 * The photon sphere is where light orbits the black hole.
 * For Schwarzschild black hole: R_p = 1.5 * R_h (photon sphere at 1.5× horizon).
 *
 * NOTE: Shell emission is handled via transmittance gradient in main.wgsl.ts.
 * This module provides helper functions for:
 * - Photon shell radius calculation
 * - Shell mask computation (for visibility)
 * - Adaptive step size near the photon sphere
 *
 * @module rendering/webgpu/shaders/blackhole/shell.wgsl
 */

export const shellBlock = /* wgsl */ `
// ============================================
// Photon Shell
// ============================================

/**
 * Get photon sphere radius.
 *
 * Uses precomputed value from CPU to avoid per-pixel log() and multiplication.
 * Original formula (for reference):
 *   dimBias = photonShellRadiusDimBias * log(DIMENSION)
 *   Rp = horizonRadius * (photonShellRadiusMul + dimBias)
 *
 * @returns Photon sphere radius
 */
fn getPhotonShellRadius() -> f32 {
  return blackhole.shellRpPrecomputed;
}

/**
 * Calculate photon shell mask.
 * Returns 1.0 when on the shell, 0.0 elsewhere.
 *
 * Uses smooth falloff with smoothstep to prevent ring artifacts.
 * Applies contrast boost for sharper ring when desired.
 *
 * mask = 1 - smoothstep(0, delta, |r - Rp|)
 *
 * @param ndRadius - N-dimensional radius from center
 * @returns Shell mask value [0, 1]
 */
fn photonShellMask(ndRadius: f32) -> f32 {
  let rp = blackhole.shellRpPrecomputed;
  let delta = blackhole.shellDeltaPrecomputed;

  // Distance from photon sphere
  let dist = abs(ndRadius - rp);

  // Smooth ring falloff using smoothstep (no hard cutoffs)
  var mask = 1.0 - smoothstep(0.0, delta, dist);

  // Apply contrast boost for sharper ring (default 1.0 = no change)
  mask = pow(mask, 1.0 / max(blackhole.shellContrastBoost, 0.1));

  return mask;
}

/**
 * Result struct for shell step modifier with mask.
 * WGSL doesn't support out parameters, so we return both values in a struct.
 */
struct ShellStepResult {
  stepModifier: f32,
  mask: f32,
}

/**
 * Get adaptive step size modifier near shell, also returns the computed mask.
 * Smaller steps near the photon sphere for accurate capture.
 *
 * The mask can be reused for shell emission to avoid redundant computation.
 *
 * @param ndRadius - N-dimensional radius
 * @returns ShellStepResult with stepModifier and mask
 */
fn shellStepModifierWithMask(ndRadius: f32) -> ShellStepResult {
  var result: ShellStepResult;

  // Use precomputed values
  let adaptiveCenter = blackhole.shellRpPrecomputed;
  let adaptiveWidth = blackhole.shellDeltaPrecomputed * 2.0;

  let dist = abs(ndRadius - adaptiveCenter);

  // Smooth mask using smoothstep (no hard cutoffs)
  result.mask = 1.0 - smoothstep(0.0, adaptiveWidth, dist);

  // Reduce step size smoothly near the region of interest
  // This helps capture details near the horizon/shell without causing aliasing
  result.stepModifier = mix(1.0, blackhole.shellStepMul, result.mask);

  return result;
}

/**
 * Get adaptive step size modifier near shell (convenience function).
 * Use shellStepModifierWithMask if you also need the mask for emission.
 *
 * @param ndRadius - N-dimensional radius
 * @returns Step size modifier (1.0 = no change, <1.0 = smaller steps)
 */
fn shellStepModifier(ndRadius: f32) -> f32 {
  let result = shellStepModifierWithMask(ndRadius);
  return result.stepModifier;
}

/**
 * Check if we're near the photon shell for step size adjustment.
 *
 * @param ndRadius - N-dimensional radius
 * @returns true if within adaptive region
 */
fn isNearPhotonShell(ndRadius: f32) -> bool {
  let rp = blackhole.shellRpPrecomputed;
  let delta = blackhole.shellDeltaPrecomputed * 2.0;
  return abs(ndRadius - rp) < delta;
}

/**
 * Get photon shell glow contribution at given radius.
 * The photon sphere is at r = 1.5 * rs (Schwarzschild) or modified by spin.
 *
 * This computes the visual glow effect for the photon sphere ring.
 *
 * @param ndRadius - N-dimensional radius from center
 * @param rayDir - Ray direction (for future directional effects)
 * @param pos3d - 3D position (for future position-based effects)
 * @returns RGB glow color contribution
 */
fn getPhotonShellGlow(ndRadius: f32, rayDir: vec3f, pos3d: vec3f) -> vec3f {
  // Get shell mask (includes contrast boost)
  let mask = photonShellMask(ndRadius);

  // Apply glow strength
  let shellIntensity = mask * blackhole.shellGlowStrength;

  // Shell color
  let shellColor = blackhole.shellGlowColor;

  return shellColor * shellIntensity;
}

/**
 * Get adaptive step size near photon shell.
 * Smaller steps help capture the shell detail accurately.
 *
 * @param ndRadius - N-dimensional radius
 * @returns Step size multiplier (1.0 = no change, <1.0 = smaller steps)
 */
fn getPhotonShellStepMultiplier(ndRadius: f32) -> f32 {
  if (!isNearPhotonShell(ndRadius)) {
    return 1.0;
  }

  let rp = blackhole.shellRpPrecomputed;
  let delta = blackhole.shellDeltaPrecomputed;
  let distFromShell = abs(ndRadius - rp);

  // Smoothly reduce step size near shell
  let t = clamp(distFromShell / delta, 0.0, 1.0);
  return mix(blackhole.shellStepMul, 1.0, t);
}
`
