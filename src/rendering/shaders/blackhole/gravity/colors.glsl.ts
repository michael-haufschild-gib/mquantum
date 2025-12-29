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
 * @param t - Input parameter [0, 1] (usually normalized radial distance)
 * @param pos - 3D position (for normal/phase based algorithms)
 * @param normal - Surface normal (for normal-based coloring)
 * @return RGB color
 */
vec3 getAlgorithmColor(float t, vec3 pos, vec3 normal) {
  // OPT-BH-COLOR: Use else-if chain for proper mutual exclusion.
  // Previously used separate if statements which ALL evaluated even after match.

  // 1. Monochromatic / Analogous (Legacy Palette)
  if (uColorAlgorithm == ALGO_MONOCHROMATIC ||
      uColorAlgorithm == ALGO_ANALOGOUS) {
      vec3 baseHSL = rgb2hsl(uBaseColor);
      return getPaletteColor(baseHSL, t, uColorAlgorithm);
  }
  // 2. Cosine Gradient (Standard Radial)
  else if (uColorAlgorithm == ALGO_COSINE ||
           uColorAlgorithm == ALGO_DISTANCE ||
           uColorAlgorithm == ALGO_RADIAL) {
      return getCosinePaletteColor(
          t,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 3. Normal Based
  else if (uColorAlgorithm == ALGO_NORMAL) {
      // Map normal Y (up/down) to gradient
      // Perturbed normal from turbulence gives nice variation
      float nt = normal.y * 0.5 + 0.5;
      return getCosinePaletteColor(
          nt,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 4. Phase (Angular)
  else if (uColorAlgorithm == ALGO_PHASE) {
      // Map angle to gradient
      float angle = atan(pos.z, pos.x);
      float pt = angle * 0.15915 + 0.5; // [-PI, PI] -> [0, 1]
      return getCosinePaletteColor(
          pt,
          uCosineA, uCosineB, uCosineC, uCosineD,
          1.0, 1.0, 0.0
      );
  }
  // 5. LCH
  else if (uColorAlgorithm == ALGO_LCH) {
      return lchColor(t, uLchLightness, uLchChroma);
  }
  // 6. Blackbody
  else if (uColorAlgorithm == ALGO_BLACKBODY) {
      // Guard against negative/zero base for pow with fractional exponent
      // t + 0.1 ensures minimum of 0.1, max guards against very small values
      float safeBase = max(t + 0.1, 0.01);
      float temp = uDiskTemperature * pow(safeBase, -0.5);
      return blackbodyColor(temp);
  }
  // 7. Accretion Gradient
  else if (uColorAlgorithm == ALGO_ACCRETION_GRADIENT) {
      vec3 deepGold = vec3(1.0, 0.5, 0.1);
      vec3 brightGold = vec3(1.0, 0.9, 0.7);
      return mix(brightGold, deepGold, t);
  }
  // 8. Gravitational Redshift
  else if (uColorAlgorithm == ALGO_GRAVITATIONAL_REDSHIFT) {
      float r = length(pos.xz);
      float redshift = gravitationalRedshift(r);
      return mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), redshift);
  }

  // Fallback
  return uBaseColor;
}
`
