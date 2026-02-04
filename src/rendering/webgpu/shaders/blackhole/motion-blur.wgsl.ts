/**
 * Motion Blur for Black Hole Accretion Disk (WGSL)
 *
 * Creates rotational motion blur effect for the accretion disk.
 * Uses temporal sampling to blur along the orbital motion direction.
 *
 * The blur follows Keplerian velocity: faster near the center, slower at edge.
 * v ∝ r^(-0.5) (orbital velocity decreases with sqrt of radius)
 *
 * Port of GLSL blackhole/effects/motion-blur.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/blackhole/motion-blur.wgsl
 */

export const motionBlurBlock = /* wgsl */ `
// ============================================
// MOTION BLUR
// ============================================

/**
 * Compute orbital velocity factor at given radius.
 * Based on Keplerian orbit: v ∝ 1/√r
 *
 * @param radius - Distance from center
 * @param innerR - Inner disk radius
 * @param outerR - Outer disk radius
 * @param motionBlurRadialFalloff - Radial falloff multiplier
 * @returns Normalized velocity factor [0, 1]
 */
fn orbitalVelocityFactor(radius: f32, innerR: f32, outerR: f32, motionBlurRadialFalloff: f32) -> f32 {
  // Avoid division by zero - ensure both innerR and r have minimum values
  let safeInnerR = max(innerR, 0.001);
  let r = max(radius, safeInnerR * 0.5);

  // Keplerian velocity: v ∝ 1/√r
  // Normalize so inner edge = 1.0, outer edge ≈ 0.35 (for typical disk ratio)
  let v = sqrt(safeInnerR / r);

  // Apply radial falloff (no blur outside disk)
  let radialMask = smoothstep(innerR * 0.8, innerR, radius) *
                   (1.0 - smoothstep(outerR, outerR * 1.2, radius));

  return v * radialMask * motionBlurRadialFalloff;
}

/**
 * Get motion blur offset direction at given position.
 * Returns the tangent direction (perpendicular to radial in XZ plane).
 *
 * Coordinate system matches accretion disk:
 * - Disk plane: XZ (horizontal)
 * - Vertical axis: Y
 * - Orbital motion: circular in XZ plane
 *
 * @param pos3d - Current 3D position
 * @returns Tangent direction for motion blur sampling
 */
fn getMotionBlurDirection(pos3d: vec3f) -> vec3f {
  // Tangent direction in XZ plane (orbital direction)
  let xzLen = length(pos3d.xz);
  // Guard against zero-length vector (position on Y axis)
  if (xzLen < 0.0001) {
    return vec3f(1.0, 0.0, 0.0); // Default tangent direction
  }
  // Radial direction in XZ plane: (x/r, 0, z/r)
  // Tangent (perpendicular, orbital direction): (-z/r, 0, x/r)
  let tangent = vec3f(-pos3d.z / xzLen, 0.0, pos3d.x / xzLen);

  return tangent;
}

/**
 * Apply motion blur to manifold color.
 *
 * Samples the manifold at multiple time offsets along the orbital path
 * and averages the results for a motion blur effect.
 *
 * @param baseColor - Original manifold color
 * @param pos3d - Current 3D position
 * @param ndRadius - N-dimensional radius
 * @param density - Current density
 * @param time - Animation time
 * @param uniforms - BlackHole uniforms struct
 * @returns Motion-blurred color
 */
fn applyMotionBlur(
  baseColor: vec3f,
  pos3d: vec3f,
  ndRadius: f32,
  density: f32,
  time: f32
) -> vec3f {
  if (blackhole.motionBlurEnabled == 0u || blackhole.motionBlurStrength < 0.001) {
    return baseColor;
  }

  // Disk is in XZ plane, so radius is in XZ
  let radius = length(pos3d.xz);
  let innerR = blackhole.horizonRadius * blackhole.diskInnerRadiusMul;
  let outerR = blackhole.horizonRadius * blackhole.diskOuterRadiusMul;

  // Compute blur amount based on orbital velocity
  let velocityFactor = orbitalVelocityFactor(radius, innerR, outerR, blackhole.motionBlurRadialFalloff);
  let blurAmount = velocityFactor * blackhole.motionBlurStrength;

  if (blurAmount < 0.001) {
    return baseColor;
  }

  // Get blur direction (tangent to orbit)
  let blurDir = getMotionBlurDirection(pos3d);

  // Sample count (capped lower for performance)
  let samples = min(blackhole.motionBlurSamples, 4);
  if (samples < 2) {
    return baseColor;
  }

  // Accumulate samples along motion path
  var accumColor = vec3f(0.0);
  var totalWeight = 0.0;

  // PERF: Pre-compute shared values outside loop
  let safeSamples = f32(max(samples - 1, 1));
  let blurScale = blurAmount * radius * 0.05;

  for (var i = 0; i < 4; i++) {
    if (i >= samples) { break; }

    // Sample offset: -0.5 to +0.5 of blur range
    let t = (f32(i) / safeSamples - 0.5) * 2.0;

    // Position offset along blur direction (tangent)
    let samplePos = pos3d + blurDir * t * blurScale;

    let sampleDensity = manifoldDensity(samplePos, ndRadius, time);

    if (sampleDensity > 0.001) {
      let sampleColor = manifoldColor(samplePos, ndRadius, sampleDensity, time);

      // Weight by distance from center of blur kernel (triangle kernel)
      let weight = 1.0 - abs(t);
      accumColor += sampleColor * weight;
      totalWeight += weight;
    }
  }

  // Blend with original based on blur amount
  if (totalWeight > 0.001) {
    let blurredColor = accumColor / totalWeight;
    return mix(baseColor, blurredColor, blurAmount * 0.5);
  }

  return baseColor;
}
`
