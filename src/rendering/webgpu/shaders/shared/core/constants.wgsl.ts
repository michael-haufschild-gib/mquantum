/**
 * WGSL Constants Block
 *
 * Mathematical and rendering constants shared across all shaders.
 * Port of GLSL constants.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/core/constants.wgsl
 */

export const constantsBlock = /* wgsl */ `
// ============================================
// Mathematical Constants
// ============================================

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const HALF_PI: f32 = 1.57079632679;
const INV_PI: f32 = 0.31830988618;
const INV_TAU: f32 = 0.15915494309;

const E: f32 = 2.71828182846;
const LN2: f32 = 0.69314718056;
const LN10: f32 = 2.30258509299;
const LOG2E: f32 = 1.44269504089;
const LOG10E: f32 = 0.43429448190;

const SQRT2: f32 = 1.41421356237;
const SQRT3: f32 = 1.73205080757;
const INV_SQRT2: f32 = 0.70710678118;

const GOLDEN_RATIO: f32 = 1.61803398875;
const GOLDEN_ANGLE: f32 = 2.39996322972; // PI * (3.0 - sqrt(5.0))

// ============================================
// Epsilon Values for Numerical Stability
// ============================================

// Division guard - prevents divide by zero
const EPS_DIVISION: f32 = 0.0001;

// Position comparison - for ray origin offsets, etc.
const EPS_POSITION: f32 = 1e-4;

// Normal calculation - finite difference step
const EPS_NORMAL: f32 = 1e-4;

// Surface intersection threshold
const EPS_SURFACE: f32 = 1e-4;

// Generic small epsilon
const EPSILON: f32 = 1e-6;
const EPS: f32 = 1e-6; // Alias for EPSILON, used by Julia shaders

// ============================================
// Rendering Limits
// ============================================

// Maximum raymarching distance
const MAX_DIST: f32 = 100.0;

// Maximum raymarching iterations (quality dependent, see quality uniforms)
const MAX_STEPS: i32 = 256;

// Minimum surface distance (quality dependent)
const MIN_DIST: f32 = 0.001;

// Shadow ray offset to avoid self-intersection
const SHADOW_BIAS: f32 = 0.002;

// Bounding radius: now dynamic via SchroedingerUniforms.boundingRadius
// Kept as fallback for non-Schroedinger shaders (color selectors)
const BOUND_R: f32 = 2.0;

// ============================================
// Quality Mode Constants
// ============================================

// High quality mode (when idle)
const MAX_MARCH_STEPS_HQ: i32 = 128;
const MAX_ITER_HQ: i32 = 256;
const SURF_DIST_HQ: f32 = 0.002;

// Low quality mode (during animation)
const MAX_MARCH_STEPS_LQ: i32 = 64;
const MAX_ITER_LQ: i32 = 30;
const SURF_DIST_LQ: f32 = 0.002;

// ============================================
// Palette Mode Constants
// ============================================

const PAL_MONO: i32 = 0;
const PAL_ANALOG: i32 = 1;
const PAL_COMP: i32 = 2;
const PAL_TRIAD: i32 = 3;
const PAL_SPLIT: i32 = 4;

// ============================================
// Light Type Constants
// ============================================

const LIGHT_TYPE_NONE: i32 = 0;
const LIGHT_TYPE_POINT: i32 = 1;
const LIGHT_TYPE_DIRECTIONAL: i32 = 2;
const LIGHT_TYPE_SPOT: i32 = 3;

// Maximum number of lights
const MAX_LIGHTS: i32 = 8;

// ============================================
// Color Space Constants
// ============================================

// sRGB gamma
const GAMMA: f32 = 2.2;
const INV_GAMMA: f32 = 0.45454545455; // 1.0 / 2.2

// Luminance weights (ITU-R BT.709)
const LUMA_WEIGHTS: vec3f = vec3f(0.2126, 0.7152, 0.0722);
`
