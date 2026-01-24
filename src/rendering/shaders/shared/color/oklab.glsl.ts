export const oklabBlock = `
// ============================================
// Oklab Color Space Functions (for LCH algorithm)
// ============================================

// Convert linear sRGB to Oklab color space
// Enables round-trip conversions and color manipulation in perceptual space
vec3 linearSrgbToOklab(vec3 rgb) {
  // Linear sRGB to LMS
  float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  // Cube root (non-linear transform)
  float l_ = pow(max(l, 0.0), 0.333333333);
  float m_ = pow(max(m, 0.0), 0.333333333);
  float s_ = pow(max(s, 0.0), 0.333333333);

  // LMS' to Oklab
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

// Convert Oklab to linear sRGB color space
vec3 oklabToLinearSrgb(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;

  return vec3(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

// Create LCH color from normalized hue parameter
vec3 lchColor(float t, float lightness, float chroma) {
  float hue = t * 6.28318;
  vec3 oklab = vec3(lightness, chroma * cos(hue), chroma * sin(hue));
  vec3 rgb = oklabToLinearSrgb(oklab);
  return clamp(rgb, 0.0, 1.0);
}
`
