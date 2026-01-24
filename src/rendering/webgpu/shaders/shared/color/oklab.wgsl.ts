/**
 * WGSL Oklab Color Block
 *
 * Oklab perceptually uniform color space conversions.
 * Port of GLSL oklab.glsl to WGSL.
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

/**
 * Convert linear sRGB to Oklab.
 * @param c Linear RGB color
 * @return Oklab color (L, a, b)
 */
fn rgb2oklab(c: vec3f) -> vec3f {
  let l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  let m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  let s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

  let l_ = pow(l, 1.0 / 3.0);
  let m_ = pow(m, 1.0 / 3.0);
  let s_ = pow(s, 1.0 / 3.0);

  return vec3f(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

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

/**
 * Convert Oklab to Oklch (cylindrical form).
 * @param lab Oklab color (L, a, b)
 * @return Oklch color (L, C, h)
 */
fn oklab2oklch(lab: vec3f) -> vec3f {
  let C = sqrt(lab.y * lab.y + lab.z * lab.z);
  let h = atan2(lab.z, lab.y);
  return vec3f(lab.x, C, h);
}

/**
 * Convert Oklch to Oklab.
 * @param lch Oklch color (L, C, h)
 * @return Oklab color (L, a, b)
 */
fn oklch2oklab(lch: vec3f) -> vec3f {
  return vec3f(
    lch.x,
    lch.y * cos(lch.z),
    lch.y * sin(lch.z)
  );
}

/**
 * Mix two colors in Oklab space for perceptually uniform interpolation.
 * @param c1 First RGB color
 * @param c2 Second RGB color
 * @param t Mix factor (0-1)
 * @return Mixed RGB color
 */
fn mixOklab(c1: vec3f, c2: vec3f, t: f32) -> vec3f {
  let lab1 = rgb2oklab(c1);
  let lab2 = rgb2oklab(c2);
  let mixed = mix(lab1, lab2, t);
  return oklab2rgb(mixed);
}

/**
 * Adjust lightness in Oklab space.
 * @param rgb Input RGB color
 * @param amount Lightness adjustment (-1 to 1)
 * @return Adjusted RGB color
 */
fn adjustOklabLightness(rgb: vec3f, amount: f32) -> vec3f {
  var lab = rgb2oklab(rgb);
  lab.x = clamp(lab.x + amount, 0.0, 1.0);
  return oklab2rgb(lab);
}

/**
 * Adjust chroma (saturation) in Oklab space.
 * @param rgb Input RGB color
 * @param mult Chroma multiplier
 * @return Adjusted RGB color
 */
fn adjustOklabChroma(rgb: vec3f, mult: f32) -> vec3f {
  var lab = rgb2oklab(rgb);
  lab.y *= mult;
  lab.z *= mult;
  return oklab2rgb(lab);
}
`
