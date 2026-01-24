/**
 * Black Hole Coloring Logic (WGSL)
 *
 * Implements the color algorithm dispatcher for the black hole.
 * Integrates global palette functions with black hole specific modes.
 *
 * Port of GLSL blackhole/gravity/colors.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/blackhole/colors.wgsl
 */

export const colorsBlock = /* wgsl */ `
// ============================================
// COLOR ALGORITHMS
// ============================================

// Mode constants (must match palette/types.ts)
const ALGO_MONOCHROMATIC: i32 = 0;
const ALGO_ANALOGOUS: i32 = 1;
const ALGO_COSINE: i32 = 2;
const ALGO_NORMAL: i32 = 3;
const ALGO_DISTANCE: i32 = 4;
const ALGO_LCH: i32 = 5;
const ALGO_MULTISOURCE: i32 = 6;
const ALGO_RADIAL: i32 = 7;
const ALGO_PHASE: i32 = 8;
const ALGO_MIXED: i32 = 9;
const ALGO_BLACKBODY: i32 = 10;
const ALGO_ACCRETION_GRADIENT: i32 = 11;
const ALGO_GRAVITATIONAL_REDSHIFT: i32 = 12;

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
 * @param uniforms - BlackHole uniforms struct
 * @return RGB color
 */
fn getAlgorithmColor(t: f32, pos: vec3f, normal: vec3f, uniforms: BlackHoleUniforms) -> vec3f {
  // 1. Monochromatic (Direct RGB lightness variation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with direct RGB interpolation
  if (uniforms.colorAlgorithm == ALGO_MONOCHROMATIC) {
    // Compute luminance for consistent lightness perception
    let luminance = dot(uniforms.baseColor, vec3f(0.299, 0.587, 0.114));
    // Interpolate between black, base color, and white based on t
    // t=0 -> dark, t=0.5 -> base, t=1 -> bright
    let dark = uniforms.baseColor * 0.2;
    let bright = mix(uniforms.baseColor, vec3f(1.0), 0.5);
    return select(
      mix(uniforms.baseColor, bright, (t - 0.5) * 2.0),
      mix(dark, uniforms.baseColor, t * 2.0),
      t < 0.5
    );
  }
  // 2. Analogous (Direct RGB hue shift approximation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with RGB rotation
  else if (uniforms.colorAlgorithm == ALGO_ANALOGOUS) {
    // Hue shift in RGB using rotation around gray axis
    // Shift amount based on t: center (t=0.5) = no shift
    let hueShift = (t - 0.5) * 0.5; // ±0.25 radians (~±15 degrees)
    let c = cos(hueShift * 6.283);
    let s = sin(hueShift * 6.283);
    // RGB rotation matrix (rotate around (1,1,1) axis)
    let hueRotation = mat3x3f(
      0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,
      0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,
      0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c
    );
    let shifted = hueRotation * uniforms.baseColor;
    // Also vary lightness
    let lightness = 0.3 + t * 0.7;
    return clamp(shifted * lightness, vec3f(0.0), vec3f(1.0));
  }
  // 3. Cosine Gradient (Standard Radial)
  else if (uniforms.colorAlgorithm == ALGO_COSINE ||
           uniforms.colorAlgorithm == ALGO_DISTANCE ||
           uniforms.colorAlgorithm == ALGO_RADIAL) {
    return getCosinePaletteColor(
      t,
      uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 4. Normal Based
  else if (uniforms.colorAlgorithm == ALGO_NORMAL) {
    let nt = normal.y * 0.5 + 0.5;
    return getCosinePaletteColor(
      nt,
      uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 5. Phase (Angular)
  else if (uniforms.colorAlgorithm == ALGO_PHASE) {
    let angle = atan2(pos.z, pos.x);
    let pt = angle * 0.15915 + 0.5; // [-PI, PI] -> [0, 1]
    return getCosinePaletteColor(
      pt,
      uniforms.cosineA, uniforms.cosineB, uniforms.cosineC, uniforms.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 6. LCH
  else if (uniforms.colorAlgorithm == ALGO_LCH) {
    return lchColor(t, uniforms.lchLightness, uniforms.lchChroma);
  }
  // 7. Blackbody
  else if (uniforms.colorAlgorithm == ALGO_BLACKBODY) {
    let safeBase = max(t + 0.1, 0.01);
    // PERF: Use multiplication instead of pow(x, -0.5) = 1/sqrt(x)
    let temp = uniforms.diskTemperature * inverseSqrt(safeBase);
    return blackbodyColor(temp);
  }
  // 8. Accretion Gradient (Interstellar-style: white/yellow inner -> deep red outer)
  else if (uniforms.colorAlgorithm == ALGO_ACCRETION_GRADIENT) {
    // Three-color gradient for realistic accretion disk appearance
    let hotCore = vec3f(1.0, 0.95, 0.8);    // White/pale yellow (hottest, inner)
    let midOrange = vec3f(1.0, 0.6, 0.15);  // Bright orange (middle)
    let coolRed = vec3f(0.7, 0.15, 0.05);   // Deep red (coolest, outer)

    // Two-stage interpolation for smooth gradient
    if (t < 0.5) {
      return mix(hotCore, midOrange, t * 2.0);
    } else {
      return mix(midOrange, coolRed, (t - 0.5) * 2.0);
    }
  }
  // 9. Gravitational Redshift
  else if (uniforms.colorAlgorithm == ALGO_GRAVITATIONAL_REDSHIFT) {
    let r = length(pos.xz);
    let redshift = gravitationalRedshift(r, uniforms);
    return mix(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), redshift);
  }

  // Fallback
  return uniforms.baseColor;
}
`
