/**
 * WGSL Julia Set Uniforms
 *
 * Port of GLSL julia/uniforms.glsl to WGSL.
 * Defines uniform structure for Julia set rendering.
 *
 * @module rendering/webgpu/shaders/julia/uniforms.wgsl
 */

export const juliaUniformsBlock = /* wgsl */ `
// ============================================
// Julia Set Uniforms
// ============================================

struct JuliaUniforms {
  // Julia constant (fixed c value, not derived from sample position)
  juliaConstant: vec4f,

  // Power parameters
  effectivePower: f32,
  effectiveBailout: f32,
  iterations: u32,

  // Power Animation
  powerAnimationEnabled: u32,
  animatedPower: f32,

  // Dimension Mixing
  dimensionMixEnabled: u32,
  mixIntensity: f32,
  mixTime: f32,

  // LOD
  lodEnabled: u32,
  lodDetail: f32,

  // Phase (for animation)
  phaseEnabled: u32,
  phaseTheta: f32,
  phasePhi: f32,

  // Scale
  scale: f32,

  // Padding for 16-byte alignment
  _padding: vec2f,
}
`

/**
 * Generate bind group layout entry for Julia uniforms.
 */
export function generateJuliaBindGroupEntry(bindingIndex: number): string {
  return /* wgsl */ `
@group(4) @binding(${bindingIndex}) var<uniform> julia: JuliaUniforms;
`
}
