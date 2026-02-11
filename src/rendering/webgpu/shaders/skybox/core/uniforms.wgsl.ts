/**
 * Skybox uniforms for WGSL
 * Port of: src/rendering/shaders/skybox/core/uniforms.glsl.ts
 *
 * In WGSL, uniforms are organized into bind groups.
 * Texture and sampler are separate resources.
 */

/**
 * Uniform struct for skybox parameters
 */
export const uniformStructBlock = `
// --- Skybox Uniform Struct ---
struct SkyboxUniforms {
  mode: f32,           // 0=Classic, 1=Aurora, 2=Nebula, etc.
  time: f32,
  intensity: f32,
  hue: f32,

  saturation: f32,
  scale: f32,
  complexity: f32,
  timeScale: f32,

  evolution: f32,
  _padSync: f32,           // was usePalette (removed)
  distortion: f32,
  vignette: f32,

  turbulence: f32,
  dualTone: f32,
  sunIntensity: f32,
  _pad0: f32,          // padding for 16-byte alignment

  color1: vec3<f32>,
  _pad1: f32,
  color2: vec3<f32>,
  _pad2: f32,

  palA: vec3<f32>,
  _pad3: f32,
  palB: vec3<f32>,
  _pad4: f32,
  palC: vec3<f32>,
  _pad5: f32,
  palD: vec3<f32>,
  _pad6: f32,

  sunPosition: vec3<f32>,
  _pad7: f32,

  // Aurora-specific
  auroraCurtainHeight: f32,
  auroraWaveFrequency: f32,

  // Horizon-specific
  horizonGradientContrast: f32,
  horizonSpotlightFocus: f32,

  // Ocean-specific
  oceanCausticIntensity: f32,
  oceanDepthGradient: f32,
  oceanBubbleDensity: f32,
  oceanSurfaceShimmer: f32,
}
`

/**
 * Uniform bindings declaration
 * Group 0: Main uniforms
 * Group 1: Textures (cube map + sampler)
 */
export const uniformBindingsBlock = `
// --- Uniform Bindings ---
@group(0) @binding(0) var<uniform> uniforms: SkyboxUniforms;

// Cube texture and sampler (for classic mode)
@group(1) @binding(0) var skyboxTexture: texture_cube<f32>;
@group(1) @binding(1) var skyboxSampler: sampler;
`

/**
 * Helper to access uniforms with shorter names (for shader code clarity)
 */
export const uniformAliasesBlock = `
// --- Uniform Aliases (for code clarity) ---
fn getMode() -> f32 { return uniforms.mode; }
fn getTime() -> f32 { return uniforms.time; }
fn getIntensity() -> f32 { return uniforms.intensity; }
fn getHue() -> f32 { return uniforms.hue; }
fn getSaturation() -> f32 { return uniforms.saturation; }
fn getScale() -> f32 { return uniforms.scale; }
fn getComplexity() -> f32 { return uniforms.complexity; }
fn getTimeScale() -> f32 { return uniforms.timeScale; }
fn getEvolution() -> f32 { return uniforms.evolution; }
fn getDistortion() -> f32 { return uniforms.distortion; }
fn getVignette() -> f32 { return uniforms.vignette; }
fn getTurbulence() -> f32 { return uniforms.turbulence; }
fn getDualTone() -> f32 { return uniforms.dualTone; }
fn getSunIntensity() -> f32 { return uniforms.sunIntensity; }
fn getPalA() -> vec3<f32> { return uniforms.palA; }
fn getPalB() -> vec3<f32> { return uniforms.palB; }
fn getPalC() -> vec3<f32> { return uniforms.palC; }
fn getPalD() -> vec3<f32> { return uniforms.palD; }
fn getSunPosition() -> vec3<f32> { return uniforms.sunPosition; }
`
