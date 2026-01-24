/**
 * Deferred Gravitational Lensing (WGSL)
 *
 * Post-processing pass that distorts the scene image based on
 * gravitational field. This applies lensing effects to background
 * objects that were rendered separately from the black hole.
 *
 * The distortion is calculated from:
 * - Black hole position in screen space
 * - Distance from each pixel to the black hole center
 * - Gravitational lensing formula
 *
 * Port of GLSL blackhole/effects/deferred-lensing.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/blackhole/deferred-lensing.wgsl
 */

export const deferredLensingBlock = /* wgsl */ `
// ============================================
// DEFERRED GRAVITATIONAL LENSING
// ============================================

/**
 * Compute radial distortion magnitude based on distance from center.
 *
 * Uses the gravitational lensing formula: deflection = strength / r^falloff
 *
 * The falloff exponent controls how lensing intensity changes with distance:
 * - Higher falloff (2.0-4.0): Effect concentrated near center, drops rapidly
 * - Lower falloff (0.5-1.0): Effect extends further from center, more gradual
 *
 * Note: deflection always increases as r decreases (toward center).
 * The exponent only affects the RATE of change, not the direction.
 * Valid range is [0.5, 4.0] with default 1.5.
 *
 * @param r - Distance from black hole center (in NDC space, 0-1)
 * @param strength - Overall lensing strength
 * @param falloff - Distance falloff exponent (0.5-4.0, default 1.5)
 * @returns Displacement magnitude (always positive, clamped to 0.5 max)
 */
fn lensingMagnitude(r: f32, strength: f32, falloff: f32) -> f32 {
  // Prevent division by zero at center
  let safeR = max(r, 0.001);

  // PERF: Fast paths for common falloff exponents
  // pow() is expensive (~40 cycles), use algebraic equivalents when possible
  var rPowFalloff: f32;
  if (abs(falloff - 1.0) < 0.01) {
    // falloff ~= 1.0: linear
    rPowFalloff = safeR;
  } else if (abs(falloff - 1.5) < 0.01) {
    // falloff ~= 1.5: r * sqrt(r) - default lensing
    rPowFalloff = safeR * sqrt(safeR);
  } else if (abs(falloff - 2.0) < 0.01) {
    // falloff ~= 2.0: r^2 (inverse square law)
    rPowFalloff = safeR * safeR;
  } else {
    // General case
    rPowFalloff = pow(safeR, falloff);
  }

  // Gravitational lensing: deflection = strength / r^falloff
  let deflection = strength / rPowFalloff;

  // Clamp to prevent extreme distortion
  return min(deflection, 0.5);
}

/**
 * Compute displacement vector for a UV coordinate.
 *
 * @param uv - Current UV coordinate
 * @param center - Black hole center in UV space (0-1)
 * @param strength - Overall lensing strength
 * @param falloff - Distance falloff exponent
 * @returns UV displacement to apply
 */
fn computeLensingDisplacement(uv: vec2f, center: vec2f, strength: f32, falloff: f32) -> vec2f {
  // Vector from pixel to black hole center
  let toCenter = center - uv;

  // Distance from center
  let r = length(toCenter);

  // Skip if very close to center (inside event horizon region)
  if (r < 0.01) {
    return vec2f(0.0);
  }

  // Direction toward center
  let dir = normalize(toCenter);

  // Calculate displacement magnitude
  let mag = lensingMagnitude(r, strength, falloff);

  // Return displacement vector (pulls toward center)
  return dir * mag;
}

/**
 * Apply chromatic aberration to lensing.
 * Simulates wavelength-dependent light bending.
 *
 * PERF: For small chromatic amounts (<0.5), uses single sample.
 * For larger amounts, samples R and B with offset from center G.
 *
 * @param sceneTexture - Scene texture to sample
 * @param sceneSampler - Texture sampler
 * @param uv - Current UV coordinate
 * @param displacement - Base displacement vector
 * @param chromaticAmount - Strength of chromatic separation
 * @returns RGB color with chromatic separation
 */
fn applyLensingChromatic(
  sceneTexture: texture_2d<f32>,
  sceneSampler: sampler,
  uv: vec2f,
  displacement: vec2f,
  chromaticAmount: f32
) -> vec3f {
  // PERF: Early exit for negligible chromatic aberration (single sample)
  if (chromaticAmount < 0.5) {
    return textureSample(sceneTexture, sceneSampler, uv + displacement).rgb;
  }

  // Chromatic separation constants
  let CHROMATIC_SCALE = 0.02;

  // Pre-compute UV coordinates (avoid redundant multiplications)
  let baseUV = uv + displacement;
  let chromaticOffset = displacement * chromaticAmount * CHROMATIC_SCALE;

  // Sample with offset for each channel
  // R bends less, B bends more, G is the reference
  let r = textureSample(sceneTexture, sceneSampler, baseUV - chromaticOffset).r;
  let g = textureSample(sceneTexture, sceneSampler, baseUV).g;
  let b = textureSample(sceneTexture, sceneSampler, baseUV + chromaticOffset).b;

  return vec3f(r, g, b);
}

/**
 * Compute Einstein ring brightness boost.
 * Pixels near the critical radius get brightness amplification.
 *
 * @param r - Distance from center
 * @param ringRadius - Critical Einstein ring radius
 * @param ringWidth - Width of the ring effect
 * @returns Brightness multiplier
 */
fn einsteinRingBoost(r: f32, ringRadius: f32, ringWidth: f32) -> f32 {
  // Gaussian profile centered on ring radius
  let diff = abs(r - ringRadius);
  // Guard against zero ringWidth to prevent NaN
  let safeWidth = max(ringWidth, 0.001);
  let falloff = exp(-diff * diff / (safeWidth * safeWidth * 2.0));

  // Return boost factor (1.0 = no boost)
  return 1.0 + falloff * 0.5;
}

/**
 * Sample scene with gravitational lensing distortion.
 * This is the main function for the deferred lensing pass.
 *
 * @param sceneTexture - The rendered scene texture to distort
 * @param sceneSampler - Texture sampler
 * @param uv - Current UV coordinate
 * @param blackHoleCenter - Black hole center in UV space
 * @param horizonRadius - Event horizon radius in UV space
 * @param strength - Overall lensing strength
 * @param falloff - Distance falloff exponent
 * @param enableChromatic - Whether to apply chromatic aberration
 * @param chromaticAmount - Chromatic aberration strength
 * @returns Final distorted color
 */
fn sampleWithLensing(
  sceneTexture: texture_2d<f32>,
  sceneSampler: sampler,
  uv: vec2f,
  blackHoleCenter: vec2f,
  horizonRadius: f32,
  strength: f32,
  falloff: f32,
  enableChromatic: bool,
  chromaticAmount: f32
) -> vec4f {
  // Compute displacement
  let displacement = computeLensingDisplacement(uv, blackHoleCenter, strength, falloff);

  // Distance from center for horizon check
  let r = length(uv - blackHoleCenter);

  // Inside event horizon: return black
  if (r < horizonRadius) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // Apply displacement to UV
  var distortedUV = uv + displacement;

  // Clamp to valid UV range
  distortedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));

  // Sample scene with optional chromatic aberration
  var color: vec3f;
  if (enableChromatic && chromaticAmount > 0.0) {
    color = applyLensingChromatic(sceneTexture, sceneSampler, uv, displacement, chromaticAmount);
  } else {
    color = textureSample(sceneTexture, sceneSampler, distortedUV).rgb;
  }

  // Apply Einstein ring brightness boost
  let ringRadius = horizonRadius * 1.5; // Photon sphere location
  let boost = einsteinRingBoost(r, ringRadius, horizonRadius * 0.3);
  color *= boost;

  return vec4f(color, 1.0);
}
`

/**
 * Uniforms struct for deferred lensing pass (WGSL)
 */
export const deferredLensingUniformsBlock = /* wgsl */ `
// Deferred Lensing Uniforms Structure
struct DeferredLensingUniforms {
  blackHoleCenter: vec2f,           // Center in UV space (0-1)
  horizonRadiusUV: f32,             // Horizon radius in UV space
  deferredLensingStrength: f32,     // Overall strength
  deferredLensingFalloff: f32,      // Distance falloff
  chromaticEnabled: u32,            // Enable chromatic aberration (bool as u32)
  chromaticAmount: f32,             // Chromatic aberration strength
  _padding: f32,                    // Padding for alignment
}
`
