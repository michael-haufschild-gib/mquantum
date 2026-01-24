/**
 * WGSL Cosine Palette Block
 *
 * Procedural color palettes using cosine functions.
 * Based on Inigo Quilez's technique.
 * Port of GLSL cosine-palette.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/color/cosine-palette.wgsl
 */

export const cosinePaletteBlock = /* wgsl */ `
// ============================================
// Cosine Color Palette
// ============================================

/**
 * Generate a color from a cosine palette.
 *
 * The palette is defined by four vec3 parameters that control
 * the brightness, contrast, oscillation, and phase of RGB channels.
 *
 * Formula: color = a + b * cos(2π * (c * t + d))
 *
 * @param t Parameter value (typically 0-1, but can wrap)
 * @param a Brightness offset
 * @param b Amplitude
 * @param c Frequency
 * @param d Phase
 * @return RGB color
 */
fn cosinePalette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(TAU * (c * t + d));
}

/**
 * Generate a color from a cosine palette with smooth looping.
 * Ensures smooth transitions when t wraps around.
 *
 * @param t Parameter value (0-1)
 * @param a Brightness offset
 * @param b Amplitude
 * @param c Frequency
 * @param d Phase
 * @return RGB color
 */
fn cosinePaletteSmooth(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  let smoothT = t * t * (3.0 - 2.0 * t); // Smoothstep
  return a + b * cos(TAU * (c * smoothT + d));
}

// ============================================
// Preset Palettes
// ============================================

/**
 * Classic rainbow palette.
 */
fn paletteRainbow(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.5, 0.5, 0.5),
    vec3f(0.5, 0.5, 0.5),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.0, 0.33, 0.67)
  );
}

/**
 * Fire palette (red-orange-yellow).
 */
fn paletteFire(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.5, 0.5, 0.5),
    vec3f(0.5, 0.5, 0.5),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.0, 0.1, 0.2)
  );
}

/**
 * Ocean palette (blue-cyan-white).
 */
fn paletteOcean(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.5, 0.5, 0.5),
    vec3f(0.5, 0.5, 0.5),
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.5, 0.6, 0.7)
  );
}

/**
 * Forest palette (green-brown-earth).
 */
fn paletteForest(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.5, 0.5, 0.5),
    vec3f(0.5, 0.5, 0.5),
    vec3f(1.0, 1.0, 0.5),
    vec3f(0.8, 0.9, 0.3)
  );
}

/**
 * Neon palette (vibrant colors).
 */
fn paletteNeon(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.5, 0.5, 0.5),
    vec3f(0.5, 0.5, 0.5),
    vec3f(2.0, 1.0, 0.0),
    vec3f(0.5, 0.2, 0.25)
  );
}

/**
 * Sunset palette (warm colors).
 */
fn paletteSunset(t: f32) -> vec3f {
  return cosinePalette(
    t,
    vec3f(0.8, 0.5, 0.4),
    vec3f(0.2, 0.4, 0.2),
    vec3f(2.0, 1.0, 1.0),
    vec3f(0.0, 0.25, 0.25)
  );
}

/**
 * Grayscale palette.
 */
fn paletteGrayscale(t: f32) -> vec3f {
  return vec3f(t);
}

/**
 * Custom palette from uniform parameters.
 */
fn paletteCustom(t: f32, params: vec4f, freqs: vec3f, phases: vec3f) -> vec3f {
  let a = vec3f(params.x);
  let b = vec3f(params.y);
  return cosinePalette(t * params.z + params.w, a, b, freqs, phases);
}
`
