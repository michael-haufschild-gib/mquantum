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
  // PERF: Branchless HSL→RGB using the triangle-wave identity, fully
  // vectorised. Each RGB channel is a triangle wave centred at hue
  // sectors 0/2/4 (R wraps at the ±3 endpoints) — folding the three
  // scalar abs/clamp pairs into three vec3 ops lets the hardware run
  // them as a single SIMD instruction on every backend instead of
  // relying on the compiler to re-vectorise three independent scalars.
  let c = (1.0 - abs(2.0 * l - 1.0)) * s;
  let m = l - c * 0.5;
  let hue6 = fract(h) * 6.0;

  // dist.x = |hue6 − 3|: R is high outside [2, 4]   → pre = dist − 1
  // dist.yz = |hue6 − 2|, |hue6 − 4|: G, B are tents → pre = 2 − dist
  // Unify via a per-component sign+offset so the pre-clamp lane is one
  // vec3 fma:   signs * dist + offsets.
  let dist = abs(hue6 - vec3f(3.0, 2.0, 4.0));
  let preClamp = vec3f(1.0, -1.0, -1.0) * dist + vec3f(-1.0, 2.0, 2.0);
  let rgb = clamp(preClamp, vec3f(0.0), vec3f(1.0));

  return rgb * c + m;
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
