/**
 * WGSL Doppler Effect
 *
 * Port of GLSL blackhole/gravity/doppler.glsl to WGSL.
 * Implements relativistic Doppler shift for accretion disk.
 *
 * @module rendering/webgpu/shaders/blackhole/doppler.wgsl
 */

export const dopplerBlock = /* wgsl */ `
// ============================================
// Doppler Effect
// ============================================

// Compute Doppler factor for a point in the accretion disk.
// The disk rotates around the Y-axis, with inner regions moving faster (Keplerian).
fn dopplerFactor(pos3d: vec3f, rayDir: vec3f) -> f32 {
  if (blackhole.dopplerEnabled == 0u) {
    return 1.0;
  }

  let r = length(pos3d.xz);
  if (r < blackhole.diskInnerR) {
    return 1.0;
  }

  // Keplerian velocity: v ∝ 1/sqrt(r)
  // At inner edge, velocity is highest
  let innerR = blackhole.diskInnerR;
  let velocityNormalized = sqrt(innerR / max(r, innerR));

  // Apply differential rotation
  let differential = blackhole.keplerianDifferential;
  let uniformVelocity = 0.3;  // Base uniform rotation
  let keplerianVelocity = velocityNormalized * 0.5;  // Keplerian component
  let orbitalVelocity = mix(uniformVelocity, keplerianVelocity, differential);

  // Orbital direction: tangent to circle in XZ plane
  // For counter-clockwise rotation looking down Y: (-z, 0, x) / r
  let tangent = vec3f(-pos3d.z, 0.0, pos3d.x) / max(r, 0.001);

  // Doppler shift: approaching = blue shift (factor > 1), receding = red shift (factor < 1)
  // factor = 1 / (1 - v·rayDir/c)
  // Simplified non-relativistic: factor ≈ 1 + v·rayDir
  let vDotRay = dot(tangent * orbitalVelocity, rayDir);

  // Relativistic Doppler factor (simplified)
  let gamma = 1.0 / sqrt(max(1.0 - orbitalVelocity * orbitalVelocity, 0.01));
  let dopplerFac = gamma * (1.0 + vDotRay);

  // Apply user-controlled strength
  return mix(1.0, dopplerFac, blackhole.dopplerStrength);
}

// Apply Doppler shift to color.
// Blue shift (factor > 1): shift toward blue
// Red shift (factor < 1): shift toward red
fn applyDopplerShift(color: vec3f, dopplerFac: f32) -> vec3f {
  if (abs(dopplerFac - 1.0) < 0.001) {
    return color;
  }

  // Intensity scales with factor^4 (relativistic beaming)
  let intensityFactor = pow(dopplerFac, 4.0);

  // Hue shift: blue shift moves toward shorter wavelengths
  let hueShift = (dopplerFac - 1.0) * blackhole.dopplerStrength * 0.2;

  // Simple color shift approximation
  var shifted = color;
  if (hueShift > 0.0) {
    // Blue shift: boost blue, reduce red
    shifted = vec3f(
      color.r * (1.0 - hueShift * 0.5),
      color.g,
      color.b * (1.0 + hueShift)
    );
  } else {
    // Red shift: boost red, reduce blue
    let absShift = abs(hueShift);
    shifted = vec3f(
      color.r * (1.0 + absShift),
      color.g,
      color.b * (1.0 - absShift * 0.5)
    );
  }

  // Apply intensity factor
  return shifted * intensityFactor;
}
`
