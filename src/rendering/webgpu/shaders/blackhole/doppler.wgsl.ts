/**
 * WGSL Doppler Effect
 *
 * Port of GLSL blackhole/gravity/doppler.glsl to WGSL.
 * Implements relativistic Doppler shift for accretion disk.
 *
 * Features:
 * - Keplerian orbital velocity calculation
 * - Relativistic Doppler factor computation
 * - Gravitational redshift (Schwarzschild metric)
 * - Blackbody color from temperature (Tanner Helland algorithm)
 * - Shakura-Sunyaev thin disk temperature profile
 * - Physically-based color shifting with luminance preservation
 *
 * @module rendering/webgpu/shaders/blackhole/doppler.wgsl
 */

export const dopplerBlock = /* wgsl */ `
// ============================================
// Doppler Effect Constants
// ============================================

// Named constants for Doppler calculations
const DOPPLER_EPSILON: f32 = 0.0001;       // Prevents division by zero
const DOPPLER_MIN_RADIUS: f32 = 0.001;     // Minimum radius for calculations

// Doppler color shift constants
const BLUE_SHIFT_TARGET: vec3f = vec3f(0.6, 0.8, 1.0);   // Blue-white for approaching
const RED_SHIFT_TARGET: vec3f = vec3f(1.0, 0.4, 0.1);    // Deep red-orange for receding
const DOPPLER_SHIFT_THRESHOLD: f32 = 0.01;               // Skip negligible shifts
const DOPPLER_SAT_BOOST_MAX: f32 = 1.5;                  // Maximum saturation boost

// ============================================
// Orbital Velocity
// ============================================

/**
 * Calculate orbital velocity direction at a position in the disk.
 * Assumes Keplerian rotation in the XZ plane (horizontal disk like Saturn's rings).
 */
fn orbitalVelocity(pos3d: vec3f, r: f32) -> vec3f {
  // Tangent to circle in XZ plane (counter-clockwise when viewed from +Y)
  // For counter-clockwise rotation, left side approaches camera at +Z
  // Add epsilon to prevent NaN when pos3d.xz is zero
  let safeLen = max(length(pos3d.xz), DOPPLER_EPSILON);
  let tangent = vec3f(pos3d.z, 0.0, -pos3d.x) / safeLen;
  return tangent;
}

// ============================================
// Doppler Factor
// ============================================

/**
 * Calculate Doppler factor based on velocity relative to view.
 *
 * Returns a value where:
 * - > 1: approaching (blue shift)
 * - = 1: transverse motion
 * - < 1: receding (red shift)
 *
 * Physics Note: This uses a Keplerian (Newtonian) velocity profile v proportional to 1/sqrt(r)
 * rather than full GR geodesic velocities. The Keplerian formula gives
 * qualitatively correct visual results (brighter approaching side) while
 * avoiding the complexity of relativistic corrections near the ISCO.
 */
fn dopplerFactor(pos3d: vec3f, viewDir: vec3f) -> f32 {
  if (blackhole.dopplerEnabled == 0u) {
    return 1.0;
  }

  // Disk is in XZ plane, so radius is in XZ
  let r = length(pos3d.xz);
  if (r < DOPPLER_MIN_RADIUS) {
    return 1.0;
  }

  // Get orbital velocity direction
  let velocity = orbitalVelocity(pos3d, r);

  // Dot product with view direction
  // viewDir points INTO the scene (from camera toward geometry)
  // Positive dot = velocity aligns with viewDir = moving away = receding
  // We want approaching (velocity toward camera), so negate
  let approaching = -dot(velocity, viewDir);

  // Keplerian orbital speed: v proportional to 1/sqrt(r)
  // Use pre-computed diskInnerR uniform
  let safeRadius = max(r, max(blackhole.diskInnerR, DOPPLER_EPSILON));

  // Normalize velocity so that innerR gives orbitSpeed approximately 1.0
  // This makes dopplerStrength act as the peak velocity (in units of c)
  let orbitSpeed = sqrt(blackhole.diskInnerR / safeRadius);

  let dopplerShift = approaching * orbitSpeed * blackhole.dopplerStrength;

  return 1.0 + dopplerShift;
}

// ============================================
// Gravitational Redshift
// ============================================

/**
 * Calculate gravitational redshift factor.
 *
 * Light escaping from near the black hole is redshifted due to
 * gravitational time dilation: z = 1/sqrt(1 - rs/r) - 1
 *
 * For visualization, we use a simplified form that blends smoothly.
 *
 * @param r - Distance from black hole center
 * @returns Redshift factor (1.0 = no shift, <1.0 = redshifted)
 */
fn gravitationalRedshift(r: f32) -> f32 {
  // Schwarzschild redshift factor: sqrt(1 - rs/r)
  // Clamp to prevent singularity near horizon
  let rsOverR = blackhole.horizonRadius / max(r, blackhole.horizonRadius * 1.01);
  let redshiftFactor = sqrt(max(1.0 - rsOverR, 0.01));
  return redshiftFactor;
}

// ============================================
// Blackbody Color (Tanner Helland Algorithm)
// ============================================

/**
 * Compute blackbody color from temperature.
 *
 * Uses the Tanner Helland algorithm for analytical blackbody color computation.
 * This approximates Planck's law for the visible spectrum.
 *
 * @param temperature - Temperature in Kelvin (1000K - 40000K)
 * @returns RGB color (normalized to peak intensity)
 */
fn blackbodyColor(temperature: f32) -> vec3f {
  // Clamp temperature to valid range and convert to scaled units
  let temp = clamp(temperature, 1000.0, 40000.0) / 100.0;

  var rgb: vec3f;

  // Red channel
  if (temp <= 66.0) {
    rgb.x = 1.0;
  } else {
    rgb.x = 329.698727446 * pow(temp - 60.0, -0.1332047592) / 255.0;
  }

  // Green channel
  if (temp <= 66.0) {
    rgb.y = (99.4708025861 * log(max(temp, 1.0)) - 161.1195681661) / 255.0;
  } else {
    rgb.y = 288.1221695283 * pow(max(temp - 60.0, 0.01), -0.0755148492) / 255.0;
  }

  // Blue channel
  if (temp >= 66.0) {
    rgb.z = 1.0;
  } else if (temp <= 19.0) {
    rgb.z = 0.0;
  } else {
    rgb.z = (138.5177312231 * log(max(temp - 10.0, 0.01)) - 305.0447927307) / 255.0;
  }

  return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// ============================================
// Disk Temperature Profile
// ============================================

/**
 * Compute disk temperature at radius using standard thin-disk profile.
 *
 * T(r) = T_inner * (r / r_inner)^(-3/4)
 *
 * This is the Shakura-Sunyaev thin disk temperature profile.
 *
 * @param r - Radius from center
 * @param rInner - Inner disk radius (ISCO)
 * @returns Temperature in Kelvin
 */
fn diskTemperatureProfile(r: f32, rInner: f32) -> f32 {
  if (r <= rInner) {
    return blackhole.diskTemperature;
  }
  return blackhole.diskTemperature * pow(r / rInner, -0.75);
}

// ============================================
// Apply Doppler Shift to Color
// ============================================

/**
 * Apply Doppler color shift.
 *
 * Blue shift for approaching (hue rotates toward blue/violet)
 * Red shift for receding (hue rotates toward red)
 *
 * Uses direct RGB color mixing instead of HSL conversion for performance.
 * This approximation achieves similar visual results with ~3x speedup:
 * - Approaching (dopplerFac > 1): Shift toward blue
 * - Receding (dopplerFac < 1): Shift toward red
 */
fn applyDopplerShift(color: vec3f, dopplerFac: f32) -> vec3f {
  if (blackhole.dopplerEnabled == 0u) {
    return color;
  }

  // Brightness change (relativistic beaming: I' = I * D^3)
  // Use multiplication instead of pow(x, 3.0) for performance
  let brightness = dopplerFac * dopplerFac * dopplerFac;
  var result = color * brightness;

  // Fast approximation of hue shift using direct RGB mixing
  // Instead of full HSL conversion, we interpolate between color and shifted targets
  let shiftAmount = (dopplerFac - 1.0) * blackhole.dopplerStrength;

  // Skip negligible shifts
  if (abs(shiftAmount) < DOPPLER_SHIFT_THRESHOLD) {
    return result;
  }

  // Compute luminance for mixing
  let luminance = vec3f(dot(result, vec3f(0.299, 0.587, 0.114)));

  if (shiftAmount > 0.0) {
    // Blue shift (approaching): shift spectrum toward shorter wavelengths
    // For warm colors, this should produce a bluish-white appearance
    // More aggressive shift: reduce red significantly, add blue
    let t = min(shiftAmount, 1.0);
    let blueShifted = vec3f(
      result.x * (1.0 - t * 0.5),           // Reduce red more aggressively
      result.y * (1.0 - t * 0.2),           // Slightly reduce green
      max(result.z, 0.3) + t * 0.4          // Boost blue significantly
    );
    // Blend toward blue-white for strong shifts
    result = mix(result, blueShifted, t);
    result = mix(result, BLUE_SHIFT_TARGET * dot(result, vec3f(0.299, 0.587, 0.114)) * 2.0, t * 0.3);
  } else {
    // Red shift (receding): shift spectrum toward longer wavelengths
    let t = min(-shiftAmount, 1.0);
    let redShifted = vec3f(
      max(result.x, 0.3) + t * 0.4,         // Boost red significantly
      result.y * (1.0 - t * 0.3),           // Reduce green
      result.z * (1.0 - t * 0.5)            // Reduce blue more aggressively
    );
    result = mix(result, redShifted, t);
    result = mix(result, RED_SHIFT_TARGET * dot(result, vec3f(0.299, 0.587, 0.114)) * 2.0, t * 0.3);
  }

  // Boost saturation slightly for stronger effect (similar to HSL version)
  let satBoost = 1.0 + abs(shiftAmount) * 0.3;
  result = mix(luminance, result, min(satBoost, DOPPLER_SAT_BOOST_MAX));

  return max(result, vec3f(0.0));
}
`
