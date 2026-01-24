export const hslBlock = `
// ============================================
// Color utilities (kept minimal)
// ============================================

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) * 0.5;
    if (maxC == minC) return vec3(0.0, 0.0, l);
    float d = maxC - minC;
    // Guard against division by zero
    float denom1 = 2.0 - maxC - minC;
    float denom2 = maxC + minC;
    float s = l > 0.5 ? d / max(denom1, 0.0001) : d / max(denom2, 0.0001);
    float h;
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 0.16667) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 0.66667) return p + (q - p) * (0.66667 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 hsl) {
    if (hsl.y == 0.0) return vec3(hsl.z);
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    return vec3(hue2rgb(p, q, hsl.x + 0.33333), hue2rgb(p, q, hsl.x), hue2rgb(p, q, hsl.x - 0.33333));
}

vec3 getPaletteColor(vec3 hsl, float t, int mode) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float minL = min(l * 0.15, 0.08);
    float maxL = l + (1.0 - l) * 0.7;
    if (s < 0.1 && mode != PAL_MONO) { h = 0.0; s = 0.4; }
    float newL = mix(minL, maxL, t);
    if (mode == PAL_MONO) return hsl2rgb(vec3(h, hsl.y, newL));
    if (mode == PAL_ANALOG) return hsl2rgb(vec3(fract(h + (t - 0.5) * 0.167), s, newL));
    if (mode == PAL_COMP) return hsl2rgb(vec3(t < 0.5 ? h : fract(h + 0.5), s, newL));
    if (mode == PAL_TRIAD) {
        float nh = t < 0.333 ? h : (t < 0.667 ? fract(h + 0.333) : fract(h + 0.667));
        return hsl2rgb(vec3(nh, s, newL));
    }
    if (mode == PAL_SPLIT) {
        float nh = t < 0.333 ? h : (t < 0.667 ? fract(h + 0.417) : fract(h + 0.583));
        return hsl2rgb(vec3(nh, s, newL));
    }
    return hsl2rgb(vec3(h, hsl.y, newL));
}
`
