/**
 * WGSL Normal Composite Shader
 *
 * Composites environment normals with main object MRT normals, and optionally
 * overlays volumetric normals from the temporal cloud buffer.
 *
 * Port of GLSL postprocessing/normalComposite.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/postprocessing/normal-composite.wgsl
 */

export const normalCompositeUniformsBlock = /* wgsl */ `
// ============================================
// Normal Composite Uniforms
// ============================================

struct NormalCompositeUniforms {
  cloudAvailable: f32,
  _padding: vec3f,
}
`

export const normalCompositeVertexShader = /* wgsl */ `
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

export const normalCompositeFragmentShader = /* wgsl */ `
${normalCompositeUniformsBlock}

@group(0) @binding(0) var normalEnvTexture: texture_2d<f32>;
@group(0) @binding(1) var normalEnvSampler: sampler;
@group(0) @binding(2) var mainNormalTexture: texture_2d<f32>;
@group(0) @binding(3) var mainNormalSampler: sampler;
@group(0) @binding(4) var cloudNormalTexture: texture_2d<f32>;
@group(0) @binding(5) var cloudNormalSampler: sampler;
@group(0) @binding(6) var<uniform> uniforms: NormalCompositeUniforms;

fn normalMagnitude(n: vec4f) -> f32 {
  return length(n.rgb);
}

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let envNormal = textureSample(normalEnvTexture, normalEnvSampler, uv);
  let mainNormal = textureSample(mainNormalTexture, mainNormalSampler, uv);

  var outNormal = envNormal;

  // Use main object normal if it has valid data
  let hasMainNormal = step(0.001, normalMagnitude(mainNormal));
  if (hasMainNormal > 0.5) {
    outNormal = mainNormal;
  }

  // Overlay cloud normals if available
  if (uniforms.cloudAvailable > 0.5) {
    let cloudNormal = textureSample(cloudNormalTexture, cloudNormalSampler, uv);
    let hasCloudNormal = step(0.001, normalMagnitude(cloudNormal));
    if (hasCloudNormal > 0.5) {
      outNormal = cloudNormal;
    }
  }

  return outNormal;
}
`
