/**
 * WGSL Cosine Palette Block
 *
 * Procedural color palettes using cosine functions.
 * Based on Inigo Quilez's technique.
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
`
