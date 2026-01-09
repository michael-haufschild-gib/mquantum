/**
 * Black Hole Coloring Logic
 *
 * Implements the color algorithm dispatcher for the black hole.
 * Integrates global palette functions with black hole specific modes.
 */

export const colorsBlock = /* glsl */ `
//----------------------------------------------
// COLOR ALGORITHMS
//----------------------------------------------

// Mode constants (must match palette/types.ts)
#define ALGO_MONOCHROMATIC 0
#define ALGO_ANALOGOUS 1
#define ALGO_COSINE 2
#define ALGO_NORMAL 3
#define ALGO_DISTANCE 4
#define ALGO_LCH 5
#define ALGO_MULTISOURCE 6
#define ALGO_RADIAL 7
#define ALGO_PHASE 8
#define ALGO_MIXED 9
#define ALGO_BLACKBODY 10
#define ALGO_ACCRETION_GRADIENT 11
#define ALGO_GRAVITATIONAL_REDSHIFT 12

/**
 * Get color from the selected algorithm.
 *
 * PERF (OPT-BH-20): Optimized color algorithms:
 * - Removed rgb2hsl()/hsl2rgb() from MONOCHROMATIC/ANALOGOUS (~40 ALU ops saved)
 * - Use direct RGB lightness variation instead
 * - Simplified PHASE to reuse existing angle if available
 *
 * @param t - Input parameter [0, 1] (usually normalized radial distance)
 * @param pos - 3D position (for normal/phase based algorithms)
 * @param normal - Surface normal (for normal-based coloring)
 * @return RGB color
 */
/**
 * Get color from the selected algorithm.
 *
 * PERF (OPT-BH-20): Optimized color algorithms:
 * - Removed rgb2hsl()/hsl2rgb() from MONOCHROMATIC/ANALOGOUS (~40 ALU ops saved)
 * - Use direct RGB lightness variation instead
 * - Simplified PHASE to reuse existing angle if available
 *
 * @param t - Input parameter [0, 1] (usually normalized radial distance)
 * @param pos - 3D position (for normal/phase based algorithms)
 * @param normal - Surface normal (for normal-based coloring)
 * @return RGB color
 */
vec3 getAlgorithmColor(float t, vec3 pos, vec3 normal) {
  // PERF: Use else-if chain for proper mutual exclusion.

  // 1. Monochromatic (Direct RGB lightness variation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with direct RGB interpolation
  if (uColorAlgorithm == ALGO_MONOCHROMATIC) {
      // Compute luminance for consistent lightness perception
      float luminance = dot(uBaseColor, vec3(0.299, 0.587, 0.114));
      // Interpolate between black, base color, and white based on t
      // t=0 -> dark, t=0.5 -> base, t=1 -> bright
      vec3 dark = uBaseColor * 0.2;
      vec3 bright = mix(uBaseColor, vec3(1.0), 0.5);
      return t < 0.5
        ? mix(dark, uBaseColor, t * 2.0)
        : mix(uBaseColor, bright, (t - 0.5) * 2.0);
  }
  // 2. Analogous (Direct RGB hue shift approximation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with RGB rotation
  else if (uColorAlgorithm == ALGO_ANALOGOUS) {
      // Hue shift in RGB using rotation around gray axis
      // Shift amount based on t: center (t=0.5) = no shift
      float hueShift = (t - 0.5) * 0.5; // ±0.25 radians (~±15 degrees)
      float c = cos(hueShift * 6.283);
      float s = sin(hueShift * 6.283);
      // RGB rotation matrix (rotate around (1,1,1) axis)
      mat3 hueRotation = mat3(
        0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,
        0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,
        0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c
      );
      vec3 shifted = hueRotation * uBaseColor;
      // Also vary lightness
      float lightness = 0.3 + t * 0.7;
      return clamp(shifted * lightness, 0.0, 1.0);
  }
  // 3. Cosine Gradient (Standard Radial)
  else if (uColorAlgorithm == ALGO_COSINE ||
           uColorAlgorithm == ALGO_DISTANCE ||
           uColorAlgorithm == ALGO_RADIAL) {
      return getCosinePaletteColor(
          t,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 4. Normal Based
  else if (uColorAlgorithm == ALGO_NORMAL) {
      float nt = normal.y * 0.5 + 0.5;
      return getCosinePaletteColor(
          nt,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 5. Phase (Angular)
  else if (uColorAlgorithm == ALGO_PHASE) {
      float angle = atan(pos.z, pos.x);
      float pt = angle * 0.15915 + 0.5; // [-PI, PI] -> [0, 1]
      return getCosinePaletteColor(
          pt,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 6. LCH
  else if (uColorAlgorithm == ALGO_LCH) {
      return lchColor(t, uLchLightness, uLchChroma);
  }
  // 7. Blackbody
  else if (uColorAlgorithm == ALGO_BLACKBODY) {
      float safeBase = max(t + 0.1, 0.01);
      // PERF: Use multiplication instead of pow(x, -0.5) = 1/sqrt(x)
      float temp = uDiskTemperature * inversesqrt(safeBase);
      return blackbodyColor(temp);
  }
  // 8. Accretion Gradient (Interstellar-style: white/yellow inner -> deep red outer)
  else if (uColorAlgorithm == ALGO_ACCRETION_GRADIENT) {
      // Three-color gradient for realistic accretion disk appearance
      vec3 hotCore = vec3(1.0, 0.95, 0.8);    // White/pale yellow (hottest, inner)
      vec3 midOrange = vec3(1.0, 0.6, 0.15);  // Bright orange (middle)
      vec3 coolRed = vec3(0.7, 0.15, 0.05);   // Deep red (coolest, outer)

      // Two-stage interpolation for smooth gradient
      if (t < 0.5) {
          return mix(hotCore, midOrange, t * 2.0);
      } else {
          return mix(midOrange, coolRed, (t - 0.5) * 2.0);
      }
  }
  // 9. Gravitational Redshift
  else if (uColorAlgorithm == ALGO_GRAVITATIONAL_REDSHIFT) {
      float r = length(pos.xz);
      float redshift = gravitationalRedshift(r);
      return mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), redshift);
  }

  // Fallback
  return uBaseColor;
}
`
