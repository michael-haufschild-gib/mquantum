/**
 * Shared GLSL Palette Functions
 *
 * Color palette generation based on color theory principles.
 * Used by both Mandelbulb raymarching shader and standard surface shader.
 *
 * Export as TypeScript string for concatenation with other shaders.
 * Three.js doesn't support native GLSL #include, so we use string concatenation.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

/**
 * GLSL code for color palette generation.
 *
 * Includes:
 * - Palette mode constants (PALETTE_MONOCHROMATIC, etc.)
 * - HSL <-> RGB conversion functions
 * - Lightness range calculation
 * - Core palette color generation
 *
 * Usage in shader:
 * ```typescript
 * import { GLSL_PALETTE_FUNCTIONS } from '@/rendering/shaders/palette';
 * const fragmentShader = GLSL_PALETTE_FUNCTIONS + myShaderCode;
 * ```
 */
export const GLSL_PALETTE_FUNCTIONS = `
// ============================================
// Palette Mode Constants
// ============================================
// Must match COLOR_MODE_TO_INT in palette/types.ts

#define PALETTE_MONOCHROMATIC 0
#define PALETTE_ANALOGOUS 1
#define PALETTE_COMPLEMENTARY 2
#define PALETTE_TRIADIC 3
#define PALETTE_SPLIT_COMPLEMENTARY 4

// ============================================
// HSL <-> RGB Conversion Functions
// ============================================

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) * 0.5;

    if (maxC == minC) {
        return vec3(0.0, 0.0, l); // achromatic
    }

    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

    float h;
    if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x;
    float s = hsl.y;
    float l = hsl.z;

    if (s == 0.0) {
        return vec3(l); // achromatic
    }

    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;

    return vec3(
        hue2rgb(p, q, h + 1.0/3.0),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1.0/3.0)
    );
}

// ============================================
// Palette Generation Based on Color Theory
// ============================================

/**
 * Calculate lightness range based on base lightness.
 * Provides wide dynamic range with bias toward darkness.
 */
vec2 getLightnessRange(float baseL) {
    // Wide range: from near-black to bright highlights
    // Dark base colors: [0, 0.7] - mostly dark with bright highlights
    // Light base colors: [0.2, 1.0] - some shadow, mostly bright
    // Mid base colors: [0.05, 0.85] - full range

    float minL = baseL * 0.15;  // Dark colors get very dark minimum
    float maxL = baseL + (1.0 - baseL) * 0.7;  // Expand toward bright

    // Ensure minimum is always quite dark for contrast
    minL = min(minL, 0.08);

    return vec2(minL, maxL);
}

/**
 * Generate a color from the palette based on variation value (0-1).
 * Uses color theory principles from Adobe Color.
 *
 * For achromatic base colors (black, white, gray), adds subtle saturation
 * to make palette modes meaningful.
 *
 * @param baseHSL - The base color in HSL (from user's surface color)
 * @param t - Variation value [0,1] controlling position in palette
 * @param mode - Palette mode (see PALETTE_* defines)
 */
vec3 getPaletteColor(vec3 baseHSL, float t, int mode) {
    float h = baseHSL.x;
    float s = baseHSL.y;
    float l = baseHSL.z;

    // Calculate lightness range based on base color
    vec2 lRange = getLightnessRange(l);
    float minL = lRange.x;
    float maxL = lRange.y;

    // For achromatic colors, use red as default hue and add subtle saturation
    // This makes palette modes meaningful for black/white/gray
    bool isAchromatic = s < 0.1;
    if (isAchromatic && mode != PALETTE_MONOCHROMATIC) {
        h = 0.0;  // Red hue as starting point
        s = 0.4;  // Add moderate saturation for color visibility
    }

    if (mode == PALETTE_MONOCHROMATIC) {
        // Same hue, vary lightness only - true grayscale for achromatic
        float newL = mix(minL, maxL, t);
        return hsl2rgb(vec3(h, baseHSL.y, newL));  // Use original saturation
    }
    else if (mode == PALETTE_ANALOGOUS) {
        // Hue varies +/-30 degrees from base
        float hueShift = (t - 0.5) * 0.167;
        float newH = fract(h + hueShift);
        float newL = mix(minL, maxL, t);
        return hsl2rgb(vec3(newH, s, newL));
    }
    else if (mode == PALETTE_COMPLEMENTARY) {
        // Two distinct colors: base hue and complement (180 degrees apart)
        float complement = fract(h + 0.5);
        float newH;
        // Sharp transition between the two colors
        if (t < 0.5) {
            newH = h;
        } else {
            newH = complement;
        }
        // Vary lightness smoothly
        float newL = mix(minL, maxL, t);
        return hsl2rgb(vec3(newH, s, newL));
    }
    else if (mode == PALETTE_TRIADIC) {
        // Three distinct colors 120 degrees apart
        float hue1 = h;
        float hue2 = fract(h + 0.333);
        float hue3 = fract(h + 0.667);
        // Sharp transitions between the three hues
        float newH;
        if (t < 0.333) {
            newH = hue1;
        } else if (t < 0.667) {
            newH = hue2;
        } else {
            newH = hue3;
        }
        float newL = mix(minL, maxL, t);
        return hsl2rgb(vec3(newH, s, newL));
    }
    else if (mode == PALETTE_SPLIT_COMPLEMENTARY) {
        // Three colors: base + two flanking complement (+/-30 degrees from 180 degrees)
        float split1 = fract(h + 0.5 - 0.083); // 150 degrees from base
        float split2 = fract(h + 0.5 + 0.083); // 210 degrees from base
        // Sharp transitions
        float newH;
        if (t < 0.333) {
            newH = h;
        } else if (t < 0.667) {
            newH = split1;
        } else {
            newH = split2;
        }
        float newL = mix(minL, maxL, t);
        return hsl2rgb(vec3(newH, s, newL));
    }

    // Fallback: monochromatic
    return hsl2rgb(vec3(h, baseHSL.y, mix(minL, maxL, t)));
}
`
