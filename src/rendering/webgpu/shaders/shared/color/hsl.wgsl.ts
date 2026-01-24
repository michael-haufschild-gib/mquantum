/**
 * WGSL HSL Color Block
 *
 * HSL (Hue, Saturation, Lightness) color conversion functions.
 * Port of GLSL hsl.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/color/hsl.wgsl
 */

export const hslBlock = /* wgsl */ `
// ============================================
// HSL Color Conversion
// ============================================

/**
 * Convert HSL to RGB.
 * @param h Hue (0-1)
 * @param s Saturation (0-1)
 * @param l Lightness (0-1)
 * @return RGB color (0-1)
 */
fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3f {
  let hue = fract(h) * 6.0;
  let c = (1.0 - abs(2.0 * l - 1.0)) * s;
  let x = c * (1.0 - abs(fract(hue / 2.0) * 2.0 - 1.0));
  let m = l - c * 0.5;

  var rgb: vec3f;

  if (hue < 1.0) {
    rgb = vec3f(c, x, 0.0);
  } else if (hue < 2.0) {
    rgb = vec3f(x, c, 0.0);
  } else if (hue < 3.0) {
    rgb = vec3f(0.0, c, x);
  } else if (hue < 4.0) {
    rgb = vec3f(0.0, x, c);
  } else if (hue < 5.0) {
    rgb = vec3f(x, 0.0, c);
  } else {
    rgb = vec3f(c, 0.0, x);
  }

  return rgb + m;
}

/**
 * Convert RGB to HSL.
 * @param rgb RGB color (0-1)
 * @return HSL values (0-1)
 */
fn rgb2hsl(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;

  let l = (maxC + minC) * 0.5;

  var h: f32 = 0.0;
  var s: f32 = 0.0;

  if (delta > EPS_DIVISION) {
    s = delta / (1.0 - abs(2.0 * l - 1.0));

    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta;
      if (rgb.g < rgb.b) {
        h += 6.0;
      }
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
      h = (rgb.r - rgb.g) / delta + 4.0;
    }

    h /= 6.0;
  }

  return vec3f(h, s, l);
}

/**
 * Adjust HSL values of an RGB color.
 * @param rgb Input RGB color
 * @param hueShift Hue shift (0-1)
 * @param satMult Saturation multiplier
 * @param lightAdd Lightness addition
 * @return Adjusted RGB color
 */
fn adjustHSL(rgb: vec3f, hueShift: f32, satMult: f32, lightAdd: f32) -> vec3f {
  var hsl = rgb2hsl(rgb);
  hsl.x = fract(hsl.x + hueShift);
  hsl.y = clamp(hsl.y * satMult, 0.0, 1.0);
  hsl.z = clamp(hsl.z + lightAdd, 0.0, 1.0);
  return hsl2rgb(hsl.x, hsl.y, hsl.z);
}
`
