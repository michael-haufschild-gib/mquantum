/**
 * WGSL Bloom Shader
 *
 * Multi-pass bloom effect for HDR rendering.
 * Includes brightness extraction, gaussian blur, and compositing.
 *
 * @module rendering/webgpu/shaders/postprocessing/bloom.wgsl
 */

export const bloomThresholdShader = /* wgsl */ `
// ============================================
// Bloom Brightness Threshold
// ============================================

struct BloomUniforms {
  threshold: f32,
  knee: f32,
  intensity: f32,
  _padding: f32,
  resolution: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: BloomUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

// Soft threshold with knee for smooth transition
fn softThreshold(lum: f32, threshold: f32, knee: f32) -> f32 {
  let soft = lum - threshold + knee;
  let soft2 = clamp(soft / (2.0 * knee + 0.0001), 0.0, 1.0);
  let soft3 = soft2 * soft2;
  let hard = max(lum - threshold, 0.0);
  return max(soft3 * knee, hard);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(tInput, linearSampler, input.uv).rgb;
  let lum = luminance(color);

  let contribution = softThreshold(lum, uniforms.threshold, uniforms.knee);
  let multiplier = contribution / max(lum, 0.0001);

  return vec4f(color * multiplier, 1.0);
}
`

export const bloomBlurShader = /* wgsl */ `
// ============================================
// Bloom Gaussian Blur
// ============================================

struct BlurUniforms {
  direction: vec2f,  // (1, 0) for horizontal, (0, 1) for vertical
  _padding: vec2f,
  resolution: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: BlurUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let texelSize = 1.0 / uniforms.resolution;
  let offset = uniforms.direction * texelSize;

  // 9-tap Gaussian blur (sigma ~= 2.0)
  // Weights: [0.0162, 0.0540, 0.1216, 0.1945, 0.2162, 0.1945, 0.1216, 0.0540, 0.0162]
  var weights = array<f32, 5>(0.2162, 0.1945, 0.1216, 0.0540, 0.0162);

  var result = textureSample(tInput, linearSampler, input.uv).rgb * weights[0];

  for (var i = 1; i < 5; i++) {
    let o = offset * f32(i);
    result += textureSample(tInput, linearSampler, input.uv + o).rgb * weights[i];
    result += textureSample(tInput, linearSampler, input.uv - o).rgb * weights[i];
  }

  return vec4f(result, 1.0);
}
`

export const bloomCompositeShader = /* wgsl */ `
// ============================================
// Bloom Composite
// ============================================

struct BloomUniforms {
  threshold: f32,
  knee: f32,
  intensity: f32,
  _padding: f32,
  resolution: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: BloomUniforms;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tBloom: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, linearSampler, input.uv).rgb;
  let bloomColor = textureSample(tBloom, linearSampler, input.uv).rgb;

  let result = sceneColor + bloomColor * uniforms.intensity;

  return vec4f(result, 1.0);
}
`
