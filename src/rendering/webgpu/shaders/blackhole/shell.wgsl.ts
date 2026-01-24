/**
 * WGSL Photon Shell
 *
 * Port of GLSL blackhole/gravity/shell.glsl to WGSL.
 * Handles photon sphere visualization.
 *
 * @module rendering/webgpu/shaders/blackhole/shell.wgsl
 */

export const shellBlock = /* wgsl */ `
// ============================================
// Photon Shell
// ============================================

// Get photon shell contribution at given radius.
// The photon sphere is at r = 1.5 * rs (Schwarzschild) or modified by spin.
fn getPhotonShellGlow(ndRadius: f32, rayDir: vec3f, pos3d: vec3f) -> vec3f {
  let rp = blackhole.shellRpPrecomputed;
  let delta = blackhole.shellDeltaPrecomputed;

  // Distance from photon sphere
  let distFromShell = abs(ndRadius - rp);

  // Shell intensity based on proximity
  let shellIntensity = exp(-distFromShell / delta) * blackhole.shellGlowStrength;

  // Apply contrast boost
  let boostedIntensity = pow(shellIntensity, 1.0 / max(blackhole.shellContrastBoost, 0.1));

  // Shell color with radial variation
  let shellColor = blackhole.shellGlowColor;

  return shellColor * boostedIntensity;
}

// Check if we're near the photon shell for step size adjustment
fn isNearPhotonShell(ndRadius: f32) -> bool {
  let rp = blackhole.shellRpPrecomputed;
  let delta = blackhole.shellDeltaPrecomputed * 2.0;
  return abs(ndRadius - rp) < delta;
}

// Get adaptive step size near photon shell
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
