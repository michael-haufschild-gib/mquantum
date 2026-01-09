/**
 * Doppler Effect
 *
 * Simulates relativistic Doppler shift in the accretion disk.
 * Material approaching the camera appears blue-shifted (brighter),
 * material receding appears red-shifted (dimmer).
 */

export const dopplerBlock = /* glsl */ `
//----------------------------------------------
// DOPPLER EFFECT
//----------------------------------------------

// Named constants for Doppler calculations
const float DOPPLER_EPSILON = 0.0001;     // Prevents division by zero
const float DOPPLER_MIN_RADIUS = 0.001;   // Minimum radius for calculations

/**
 * Calculate orbital velocity direction at a position in the disk.
 * Assumes Keplerian rotation in the XZ plane (horizontal disk like Saturn's rings).
 */
vec3 orbitalVelocity(vec3 pos3d, float r) {
  // Tangent to circle in XZ plane (counter-clockwise when viewed from +Y)
  // Add epsilon to prevent NaN when pos3d.xz is zero
  float safeLen = max(length(pos3d.xz), DOPPLER_EPSILON);
  vec3 tangent = vec3(-pos3d.z, 0.0, pos3d.x) / safeLen;
  return tangent;
}

/**
 * Calculate Doppler factor based on velocity relative to view.
 *
 * Returns a value where:
 * - > 1: approaching (blue shift)
 * - = 1: transverse motion
 * - < 1: receding (red shift)
 *
 * Physics Note: This uses a Keplerian (Newtonian) velocity profile v ∝ 1/√r
 * rather than full GR geodesic velocities. The Keplerian formula gives
 * qualitatively correct visual results (brighter approaching side) while
 * avoiding the complexity of relativistic corrections near the ISCO.
 *
 * For reference, the full Schwarzschild circular orbit velocity is:
 *   v = c * sqrt(rs / (2r - rs))
 * which diverges at the photon sphere (r = 1.5 rs) rather than infinity.
 */
float dopplerFactor(vec3 pos3d, vec3 viewDir) {
  if (!uDopplerEnabled) return 1.0;

  // Disk is in XZ plane, so radius is in XZ
  float r = length(pos3d.xz);
  if (r < DOPPLER_MIN_RADIUS) return 1.0;

  // Get orbital velocity direction
  vec3 velocity = orbitalVelocity(pos3d, r);

  // Dot product with view direction
  // Negative because viewDir points toward camera
  float approaching = -dot(velocity, viewDir);

  // Keplerian orbital speed: v ∝ 1/√r
  // PERF (OPT-BH-6): Use pre-computed uDiskInnerR uniform
  float safeRadius = max(r, max(uDiskInnerR, DOPPLER_EPSILON));

  // Normalize velocity so that innerR gives orbitSpeed ≈ 1.0
  // This makes uDopplerStrength act as the peak velocity (in units of c)
  float orbitSpeed = sqrt(uDiskInnerR / safeRadius);

  float dopplerShift = approaching * orbitSpeed * uDopplerStrength;

  return 1.0 + dopplerShift;
}

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
float gravitationalRedshift(float r) {
  // Schwarzschild redshift factor: sqrt(1 - rs/r)
  // Clamp to prevent singularity near horizon
  float rsOverR = uHorizonRadius / max(r, uHorizonRadius * 1.01);
  float redshiftFactor = sqrt(max(1.0 - rsOverR, 0.01));
  return redshiftFactor;
}

/**
 * Compute blackbody color from temperature.
 *
 * PERF (OPT-BH-17): Uses pre-computed LUT texture when available.
 * This replaces expensive pow()/log() operations (40+ cycles) with
 * a single texture lookup (~4 cycles).
 *
 * When USE_BLACKBODY_LUT is defined, samples from tBlackbodyLUT.
 * Otherwise falls back to analytical computation (Tanner Helland algorithm).
 *
 * @param temperature - Temperature in Kelvin (1000K - 40000K)
 * @returns RGB color (normalized to peak intensity)
 */
vec3 blackbodyColor(float temperature) {
#ifdef USE_BLACKBODY_LUT
  // PERF: LUT lookup - map temperature [1000, 40000] to UV [0, 1]
  float t = clamp((temperature - 1000.0) / 39000.0, 0.0, 1.0);
  return texture(tBlackbodyLUT, vec2(t, 0.5)).rgb;
#else
  // Fallback: analytical computation (Tanner Helland algorithm)
  float temp = clamp(temperature, 1000.0, 40000.0) / 100.0;

  vec3 rgb;

  // Red channel
  if (temp <= 66.0) {
    rgb.r = 1.0;
  } else {
    rgb.r = 329.698727446 * pow(temp - 60.0, -0.1332047592) / 255.0;
  }

  // Green channel
  if (temp <= 66.0) {
    rgb.g = (99.4708025861 * log(max(temp, 1.0)) - 161.1195681661) / 255.0;
  } else {
    rgb.g = 288.1221695283 * pow(max(temp - 60.0, 0.01), -0.0755148492) / 255.0;
  }

  // Blue channel
  if (temp >= 66.0) {
    rgb.b = 1.0;
  } else if (temp <= 19.0) {
    rgb.b = 0.0;
  } else {
    rgb.b = (138.5177312231 * log(max(temp - 10.0, 0.01)) - 305.0447927307) / 255.0;
  }

  return clamp(rgb, 0.0, 1.0);
#endif
}

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
float diskTemperatureProfile(float r, float rInner) {
  if (r <= rInner) return uDiskTemperature;
  return uDiskTemperature * pow(r / rInner, -0.75);
}

/**
 * Apply Doppler color shift.
 *
 * Blue shift for approaching (hue rotates toward blue/violet)
 * Red shift for receding (hue rotates toward red)
 *
 * PERF OPTIMIZATION: Uses direct RGB color mixing instead of HSL conversion.
 * The HSL round-trip (rgb2hsl + hsl2rgb) involves many branches and is expensive.
 * This approximation achieves similar visual results with ~3x speedup:
 * - Approaching (dopplerFac > 1): Shift toward blue
 * - Receding (dopplerFac < 1): Shift toward red
 */
vec3 applyDopplerShift(vec3 color, float dopplerFac) {
  if (!uDopplerEnabled) return color;

  // Brightness change (relativistic beaming: I' = I * D^3)
  // PERF: Use multiplication instead of pow(x, 3.0)
  float brightness = dopplerFac * dopplerFac * dopplerFac;
  color *= brightness;

  // PERF: Fast approximation of hue shift using direct RGB mixing
  // Instead of full HSL conversion, we interpolate between color and shifted targets
  float shiftAmount = (dopplerFac - 1.0) * uDopplerStrength;

  // Skip negligible shifts
  if (abs(shiftAmount) < 0.01) return color;

  // For blue shift (approaching): mix toward blue-weighted color
  // For red shift (receding): mix toward red-weighted color
  vec3 luminance = vec3(dot(color, vec3(0.299, 0.587, 0.114)));

  if (shiftAmount > 0.0) {
    // Blue shift: boost blue, reduce red
    vec3 blueShifted = vec3(
      color.r * 0.7,
      color.g * 0.9,
      min(color.b * 1.3 + 0.1, 2.0)
    );
    color = mix(color, blueShifted, min(shiftAmount, 1.0));
  } else {
    // Red shift: boost red, reduce blue
    vec3 redShifted = vec3(
      min(color.r * 1.3 + 0.1, 2.0),
      color.g * 0.9,
      color.b * 0.7
    );
    color = mix(color, redShifted, min(-shiftAmount, 1.0));
  }

  // Boost saturation slightly for stronger effect (similar to HSL version)
  float satBoost = 1.0 + abs(shiftAmount) * 0.3;
  color = mix(luminance, color, min(satBoost, 1.5));

  return max(color, vec3(0.0));
}
`
