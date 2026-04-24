/**
 * WGSL HSL Color Block
 *
 * HSL (Hue, Saturation, Lightness) color conversion functions.
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
  // PERF: Branchless HSL→RGB using the triangle-wave identity.
  // Each RGB channel is a triangle wave offset by 120° in hue space.
  // This eliminates the 6-branch if-else chain that causes GPU warp divergence.
  let c = (1.0 - abs(2.0 * l - 1.0)) * s;
  let m = l - c * 0.5;
  let hue6 = fract(h) * 6.0;

  // Triangle wave: T(x) = clamp(|x - 3| - 1, 0, 1) maps hue sector to channel intensity
  let r = clamp(abs(hue6 - 3.0) - 1.0, 0.0, 1.0);
  let g = clamp(2.0 - abs(hue6 - 2.0), 0.0, 1.0);
  let b = clamp(2.0 - abs(hue6 - 4.0), 0.0, 1.0);

  return vec3f(r, g, b) * c + m;
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

`
