/**
 * WGSL Oklab Color Block
 *
 * Oklab perceptually uniform color space conversions.
 *
 * Oklab is a perceptually uniform color space designed by Björn Ottosson.
 * It provides more accurate color mixing and manipulation than HSL or Lab.
 *
 * @module rendering/webgpu/shaders/shared/color/oklab.wgsl
 */

export const oklabBlock = /* wgsl */ `
// ============================================
// Oklab Color Conversion
// ============================================
//
// Only oklab2rgb is kept. rgb2oklab / oklab2oklch / oklch2oklab / mixOklab /
// adjustOklab* were dead across the whole project. WGSL DCE would strip them
// anyway, but removing them from source keeps shader module creation faster
// and the file skimmable.

/**
 * Convert Oklab to linear sRGB.
 * @param c Oklab color (L, a, b)
 * @return Linear RGB color
 */
fn oklab2rgb(c: vec3f) -> vec3f {
  let l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  let m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  let s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

  let l = l_ * l_ * l_;
  let m = m_ * m_ * m_;
  let s = s_ * s_ * s_;

  return vec3f(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}
`
