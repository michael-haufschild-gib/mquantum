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

// ============================================
// COSINE PALETTE HELPERS
// ============================================

/**
 * Apply distribution function to input parameter.
 * Transforms linear input using power curve, cycles, and offset.
 *
 * @param t - Input value [0, 1]
 * @param power - Power curve exponent (1.0 = linear)
 * @param cycles - Number of color cycles
 * @param offset - Phase offset
 * @return Transformed value [0, 1]
 */
fn applyDistribution(t: f32, power: f32, cycles: f32, offset: f32) -> f32 {
  let clamped = clamp(t, 0.0, 1.0);

  // Apply power curve
  var curved: f32;
  if (abs(power - 1.0) < 0.001) {
    curved = clamped;
  } else if (abs(power - 2.0) < 0.001) {
    curved = clamped * clamped;
  } else if (abs(power - 0.5) < 0.001) {
    curved = sqrt(clamped);
  } else {
    let safePower = max(power, 0.001);
    let safeBase = max(clamped, 0.0001);
    curved = pow(safeBase, safePower);
  }

  // Apply cycles and offset, wrap to [0, 1]
  let cycled = fract(curved * cycles + offset);

  return cycled;
}

/**
 * Base cosine palette function.
 * Formula: color = a + b * cos(2π * (c * t + d))
 *
 * @param t - Input parameter
 * @param a, b, c, d - Palette coefficients
 * @return RGB color
 */
fn cosinePalette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(TAU * (c * t + d));
}

/**
 * Get cosine palette color with full distribution controls.
 *
 * @param t - Input value (typically face depth or iteration)
 * @param a, b, c, d - Cosine palette coefficients
 * @param power, cycles, offset - Distribution parameters
 * @return RGB color in [0, 1] range
 */
fn getCosinePaletteColor(
  t: f32,
  a: vec3f, b: vec3f, c: vec3f, d: vec3f,
  power: f32, cycles: f32, offset: f32
) -> vec3f {
  let distributedT = applyDistribution(t, power, cycles, offset);
  return cosinePalette(distributedT, a, b, c, d);
}

// ============================================
// OKLAB / LCH COLOR SPACE
// ============================================

/**
 * Convert Oklab to linear sRGB.
 * Based on Bjorn Ottosson's Oklab color space.
 */
fn oklabToLinearSrgb(lab: vec3f) -> vec3f {
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

  let l = l_ * l_ * l_;
  let m = m_ * m_ * m_;
  let s = s_ * s_ * s_;

  return vec3f(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

/**
 * Generate color from LCH (Lightness, Chroma, Hue) in Oklab space.
 * Provides perceptually uniform hue transitions.
 *
 * @param t - Input value mapped to hue [0, 1] -> [0, 2pi]
 * @param lightness - Oklab L value (typically 0.5-0.8)
 * @param chroma - Color saturation (typically 0.1-0.2)
 * @return RGB color in [0, 1] range
 */
fn lchColor(t: f32, lightness: f32, chroma: f32) -> vec3f {
  let hue = t * TAU; // Map to radians
  let oklab = vec3f(lightness, chroma * cos(hue), chroma * sin(hue));
  let rgb = oklabToLinearSrgb(oklab);
  // Clamp to valid RGB range
  return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// ============================================
// MAIN COLOR DISPATCHER
// ============================================

/**
 * Get color from the selected algorithm.
 *
 * PERF (OPT-BH-20): Optimized color algorithms:
 * - Removed rgb2hsl()/hsl2rgb() from MONOCHROMATIC/ANALOGOUS (~40 ALU ops saved)
 * - Use direct RGB lightness variation instead
 * - Simplified PHASE to reuse existing angle if available
 *
 * Uses global 'blackhole' uniform binding directly for consistency with other shader functions.
 *
 * @param t - Input parameter [0, 1] (usually normalized radial distance)
 * @param pos - 3D position (for normal/phase based algorithms)
 * @param normal - Surface normal (for normal-based coloring)
 * @return RGB color
 */
fn getAlgorithmColor(t: f32, pos: vec3f, normal: vec3f) -> vec3f {
  // 1. Monochromatic (Direct RGB lightness variation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with direct RGB interpolation
  if (blackhole.colorAlgorithm == ALGO_MONOCHROMATIC) {
    // Compute luminance for consistent lightness perception
    let luminance = dot(blackhole.baseColor, vec3f(0.299, 0.587, 0.114));
    // Interpolate between black, base color, and white based on t
    // t=0 -> dark, t=0.5 -> base, t=1 -> bright
    let dark = blackhole.baseColor * 0.2;
    let bright = mix(blackhole.baseColor, vec3f(1.0), 0.5);
    return select(
      mix(blackhole.baseColor, bright, (t - 0.5) * 2.0),
      mix(dark, blackhole.baseColor, t * 2.0),
      t < 0.5
    );
  }
  // 2. Analogous (Direct RGB hue shift approximation)
  // PERF (OPT-BH-20): Replaced HSL round-trip with RGB rotation
  else if (blackhole.colorAlgorithm == ALGO_ANALOGOUS) {
    // Hue shift in RGB using rotation around gray axis
    // Shift amount based on t: center (t=0.5) = no shift
    let hueShift = (t - 0.5) * 0.5; // ±0.25 radians (~±15 degrees)
    let c = cos(hueShift * TAU);
    let s = sin(hueShift * TAU);
    // RGB rotation matrix (rotate around (1,1,1) axis)
    let hueRotation = mat3x3f(
      0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,
      0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c,  0.2929 * (1.0 - c) - 0.4082 * s,
      0.2929 * (1.0 - c) - 0.4082 * s,  0.2929 * (1.0 - c) + 0.4082 * s,  0.7071 + 0.2929 * c
    );
    let shifted = hueRotation * blackhole.baseColor;
    // Also vary lightness
    let lightness = 0.3 + t * 0.7;
    return clamp(shifted * lightness, vec3f(0.0), vec3f(1.0));
  }
  // 3. Cosine Gradient (Standard Radial)
  else if (blackhole.colorAlgorithm == ALGO_COSINE ||
           blackhole.colorAlgorithm == ALGO_DISTANCE ||
           blackhole.colorAlgorithm == ALGO_RADIAL) {
    return getCosinePaletteColor(
      t,
      blackhole.cosineA, blackhole.cosineB, blackhole.cosineC, blackhole.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 4. Normal Based
  else if (blackhole.colorAlgorithm == ALGO_NORMAL) {
    let nt = normal.y * 0.5 + 0.5;
    return getCosinePaletteColor(
      nt,
      blackhole.cosineA, blackhole.cosineB, blackhole.cosineC, blackhole.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 5. Phase (Angular)
  else if (blackhole.colorAlgorithm == ALGO_PHASE) {
    let angle = atan2(pos.z, pos.x);
    let pt = angle * 0.15915 + 0.5; // [-PI, PI] -> [0, 1]
    return getCosinePaletteColor(
      pt,
      blackhole.cosineA, blackhole.cosineB, blackhole.cosineC, blackhole.cosineD,
      1.0, 1.0, 0.0
    );
  }
  // 6. LCH
  else if (blackhole.colorAlgorithm == ALGO_LCH) {
    return lchColor(t, blackhole.lchLightness, blackhole.lchChroma);
  }
  // 7. Blackbody
  else if (blackhole.colorAlgorithm == ALGO_BLACKBODY) {
    let safeBase = max(t + 0.1, 0.01);
    // PERF: Use multiplication instead of pow(x, -0.5) = 1/sqrt(x)
    let temp = blackhole.diskTemperature * inverseSqrt(safeBase);
    return blackbodyColor(temp);
  }
  // 8. Accretion Gradient (Interstellar-style: white/yellow inner -> deep red outer)
  else if (blackhole.colorAlgorithm == ALGO_ACCRETION_GRADIENT) {
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
  else if (blackhole.colorAlgorithm == ALGO_GRAVITATIONAL_REDSHIFT) {
    let r = length(pos.xz);
    // gravitationalRedshift is defined in doppler.wgsl
    let redshift = gravitationalRedshift(r);
    return mix(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), redshift);
  }

  // Fallback
  return blackhole.baseColor;
}
`
