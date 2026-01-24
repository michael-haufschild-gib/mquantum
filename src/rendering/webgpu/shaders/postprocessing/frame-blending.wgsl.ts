/**
 * WGSL Frame Blending Shader
 *
 * Blends current frame with previous frame for smoother motion at low frame rates.
 * Uses simple linear interpolation (mix) for temporal accumulation.
 *
 * Port of GLSL postprocessing/frameBlending.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/postprocessing/frame-blending.wgsl
 */

export const frameBlendingUniformsBlock = /* wgsl */ `
// ============================================
// Frame Blending Uniforms
// ============================================

struct FrameBlendingUniforms {
  blendFactor: f32,
  _padding: vec3f,
}
`

export const frameBlendingVertexShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@location(0) position: vec3f, @location(1) uv: vec2f) -> VertexOutput {
  var output: VertexOutput;
  output.uv = uv;
  output.position = vec4f(position.xy, 0.0, 1.0);
  return output;
}
`

export const frameBlendingFragmentShader = /* wgsl */ `
${frameBlendingUniformsBlock}

@group(0) @binding(0) var currentFrameTexture: texture_2d<f32>;
@group(0) @binding(1) var currentFrameSampler: sampler;
@group(0) @binding(2) var previousFrameTexture: texture_2d<f32>;
@group(0) @binding(3) var previousFrameSampler: sampler;
@group(0) @binding(4) var<uniform> uniforms: FrameBlendingUniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let current = textureSample(currentFrameTexture, currentFrameSampler, uv);
  let previous = textureSample(previousFrameTexture, previousFrameSampler, uv);

  // Linear blend between current and previous frame
  // blendFactor 0 = fully current, 1 = fully previous
  // Defensive clamp to ensure valid range
  return mix(current, previous, clamp(uniforms.blendFactor, 0.0, 1.0));
}
`
