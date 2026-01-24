/**
 * WGSL Color Selector Block
 *
 * Unified color selection system that maps iteration/depth/position
 * to colors using various algorithms.
 * Port of GLSL selector.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/color/selector.wgsl
 */

export const selectorBlock = /* wgsl */ `
// ============================================
// Color Selection Uniforms
// ============================================

struct ColorUniforms {
  // Base color (for solid mode)
  baseColor: vec4f,

  // Palette parameters
  paletteIndex: i32,        // Which palette to use
  paletteOffset: f32,       // Phase offset
  paletteScale: f32,        // Color cycling speed
  paletteContrast: f32,     // Contrast adjustment

  // Custom palette coefficients
  paletteA: vec4f,          // a coefficient (xyz) + unused
  paletteB: vec4f,          // b coefficient (xyz) + unused
  paletteC: vec4f,          // c coefficient (xyz) + unused
  paletteD: vec4f,          // d coefficient (xyz) + unused

  // Color mode
  colorMode: i32,           // 0=solid, 1=iteration, 2=depth, 3=normal, 4=position
  _padding: vec3f,
}

// ============================================
// Color Mode Constants
// ============================================

const COLOR_MODE_SOLID: i32 = 0;
const COLOR_MODE_ITERATION: i32 = 1;
const COLOR_MODE_DEPTH: i32 = 2;
const COLOR_MODE_NORMAL: i32 = 3;
const COLOR_MODE_POSITION: i32 = 4;
const COLOR_MODE_ORBITAL: i32 = 5;

// Palette indices
const PALETTE_RAINBOW: i32 = 0;
const PALETTE_FIRE: i32 = 1;
const PALETTE_OCEAN: i32 = 2;
const PALETTE_FOREST: i32 = 3;
const PALETTE_NEON: i32 = 4;
const PALETTE_SUNSET: i32 = 5;
const PALETTE_GRAYSCALE: i32 = 6;
const PALETTE_CUSTOM: i32 = 7;

// ============================================
// Color Selection Functions
// ============================================

/**
 * Select color from palette based on index.
 */
fn selectPaletteColor(t: f32, paletteIndex: i32, colorUniforms: ColorUniforms) -> vec3f {
  switch (paletteIndex) {
    case 0: { return paletteRainbow(t); }
    case 1: { return paletteFire(t); }
    case 2: { return paletteOcean(t); }
    case 3: { return paletteForest(t); }
    case 4: { return paletteNeon(t); }
    case 5: { return paletteSunset(t); }
    case 6: { return paletteGrayscale(t); }
    case 7: {
      return cosinePalette(
        t,
        colorUniforms.paletteA.xyz,
        colorUniforms.paletteB.xyz,
        colorUniforms.paletteC.xyz,
        colorUniforms.paletteD.xyz
      );
    }
    default: { return paletteRainbow(t); }
  }
}

/**
 * Compute color based on iteration count.
 * @param iterations Current iteration count
 * @param maxIterations Maximum iterations
 * @param colorUniforms Color uniform buffer
 * @return RGB color
 */
fn colorFromIteration(iterations: f32, maxIterations: f32, colorUniforms: ColorUniforms) -> vec3f {
  let t = iterations / maxIterations;
  let adjustedT = t * colorUniforms.paletteScale + colorUniforms.paletteOffset;
  var color = selectPaletteColor(adjustedT, colorUniforms.paletteIndex, colorUniforms);

  // Apply contrast
  color = mix(vec3f(0.5), color, colorUniforms.paletteContrast);

  return color;
}

/**
 * Compute color based on ray depth.
 * @param depth Distance from camera
 * @param maxDepth Maximum expected depth
 * @param colorUniforms Color uniform buffer
 * @return RGB color
 */
fn colorFromDepth(depth: f32, maxDepth: f32, colorUniforms: ColorUniforms) -> vec3f {
  let t = clamp(depth / maxDepth, 0.0, 1.0);
  let adjustedT = t * colorUniforms.paletteScale + colorUniforms.paletteOffset;
  return selectPaletteColor(adjustedT, colorUniforms.paletteIndex, colorUniforms);
}

/**
 * Compute color based on surface normal.
 * @param normal Surface normal (normalized)
 * @return RGB color
 */
fn colorFromNormal(normal: vec3f) -> vec3f {
  return normal * 0.5 + 0.5;
}

/**
 * Compute color based on world position.
 * @param position World position
 * @param scale Position scale factor
 * @param colorUniforms Color uniform buffer
 * @return RGB color
 */
fn colorFromPosition(position: vec3f, scale: f32, colorUniforms: ColorUniforms) -> vec3f {
  let t = fract(dot(position, vec3f(0.5, 0.3, 0.7)) * scale);
  let adjustedT = t * colorUniforms.paletteScale + colorUniforms.paletteOffset;
  return selectPaletteColor(adjustedT, colorUniforms.paletteIndex, colorUniforms);
}

/**
 * Compute color based on orbital trap value.
 * @param orbital Orbital trap distance
 * @param colorUniforms Color uniform buffer
 * @return RGB color
 */
fn colorFromOrbital(orbital: f32, colorUniforms: ColorUniforms) -> vec3f {
  let t = fract(orbital * colorUniforms.paletteScale + colorUniforms.paletteOffset);
  return selectPaletteColor(t, colorUniforms.paletteIndex, colorUniforms);
}

/**
 * Main color selector function.
 * Dispatches to appropriate color function based on color mode.
 */
fn selectColor(
  colorMode: i32,
  iterations: f32,
  maxIterations: f32,
  depth: f32,
  maxDepth: f32,
  normal: vec3f,
  position: vec3f,
  orbital: f32,
  colorUniforms: ColorUniforms
) -> vec3f {
  switch (colorMode) {
    case 0: { return colorUniforms.baseColor.rgb; }
    case 1: { return colorFromIteration(iterations, maxIterations, colorUniforms); }
    case 2: { return colorFromDepth(depth, maxDepth, colorUniforms); }
    case 3: { return colorFromNormal(normal); }
    case 4: { return colorFromPosition(position, 1.0, colorUniforms); }
    case 5: { return colorFromOrbital(orbital, colorUniforms); }
    default: { return colorUniforms.baseColor.rgb; }
  }
}
`
