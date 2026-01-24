/**
 * Skybox constants for WGSL
 * Port of: src/rendering/shaders/skybox/core/constants.glsl.ts
 */
export const constantsBlock = `
// --- Constants ---
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

const MODE_CLASSIC: f32 = 0.0;
const MODE_AURORA: f32 = 1.0;
const MODE_NEBULA: f32 = 2.0;
const MODE_VOID: f32 = 3.0;
const MODE_CRYSTALLINE: f32 = 4.0;
const MODE_HORIZON: f32 = 5.0;
const MODE_OCEAN: f32 = 6.0;
const MODE_TWILIGHT: f32 = 7.0;
const MODE_STARFIELD: f32 = 8.0;
`
