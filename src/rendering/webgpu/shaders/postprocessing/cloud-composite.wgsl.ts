/**
 * WGSL Cloud Composite Shader
 *
 * Composites premultiplied volumetric cloud color over the scene.
 *
 * Port of GLSL postprocessing/cloudComposite.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/postprocessing/cloud-composite.wgsl
 */

export const cloudCompositeUniformsBlock = /* wgsl */ `
// ============================================
// Cloud Composite Uniforms
// ============================================

struct CloudCompositeUniforms {
  cloudAvailable: f32,
  _padding: vec3f,
}
`

export const cloudCompositeVertexShader = /* wgsl */ `
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

export const cloudCompositeFragmentShader = /* wgsl */ `
${cloudCompositeUniformsBlock}

@group(0) @binding(0) var sceneColorTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneColorSampler: sampler;
@group(0) @binding(2) var cloudTexture: texture_2d<f32>;
@group(0) @binding(3) var cloudSampler: sampler;
@group(0) @binding(4) var<uniform> uniforms: CloudCompositeUniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sceneColor = textureSample(sceneColorTexture, sceneColorSampler, uv);

  if (uniforms.cloudAvailable < 0.5) {
    return sceneColor;
  }

  let cloudColor = textureSample(cloudTexture, cloudSampler, uv);

  // Premultiplied alpha composite: out = cloud + scene * (1 - cloud.a)
  let combined = cloudColor.rgb + sceneColor.rgb * (1.0 - cloudColor.a);
  return vec4f(combined, sceneColor.a);
}
`
