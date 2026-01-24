/**
 * WGSL Tonemapping Shader
 *
 * Various tonemapping operators for HDR to LDR conversion.
 *
 * @module rendering/webgpu/shaders/postprocessing/tonemapping.wgsl
 */

export const tonemappingShader = /* wgsl */ `
// ============================================
// Tonemapping Shader
// ============================================

struct TonemapUniforms {
  exposure: f32,
  gamma: f32,
  mode: i32,  // 0=Linear, 1=Reinhard, 2=ACES, 3=Filmic
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: TonemapUniforms;
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

// Simple Reinhard tonemapping
fn reinhardTonemap(color: vec3f) -> vec3f {
  return color / (color + vec3f(1.0));
}

// Extended Reinhard with white point
fn reinhardExtended(color: vec3f, whitePoint: f32) -> vec3f {
  let Lw = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  let Ld = Lw * (1.0 + Lw / (whitePoint * whitePoint)) / (1.0 + Lw);
  return color * (Ld / max(Lw, 0.0001));
}

// ACES Filmic Tonemapping
fn ACESFilm(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

// Uncharted 2 Filmic Tonemapping
fn uncharted2Tonemap(x: vec3f) -> vec3f {
  let A = 0.15;  // Shoulder Strength
  let B = 0.50;  // Linear Strength
  let C = 0.10;  // Linear Angle
  let D = 0.20;  // Toe Strength
  let E = 0.02;  // Toe Numerator
  let F = 0.30;  // Toe Denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn filmic(color: vec3f) -> vec3f {
  let W = 11.2;  // Linear White Point
  let curr = uncharted2Tonemap(color * 2.0);
  let whiteScale = vec3f(1.0) / uncharted2Tonemap(vec3f(W));
  return curr * whiteScale;
}

// Gamma correction
fn gammaCorrect(color: vec3f, gamma: f32) -> vec3f {
  return pow(color, vec3f(1.0 / gamma));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(tInput, linearSampler, input.uv).rgb;

  // Apply exposure
  color *= uniforms.exposure;

  // Apply tonemapping based on mode
  var tonemapped: vec3f;
  switch (uniforms.mode) {
    case 0: {
      // Linear (no tonemapping)
      tonemapped = clamp(color, vec3f(0.0), vec3f(1.0));
    }
    case 1: {
      // Reinhard
      tonemapped = reinhardTonemap(color);
    }
    case 2: {
      // ACES Filmic
      tonemapped = ACESFilm(color);
    }
    case 3: {
      // Filmic (Uncharted 2)
      tonemapped = filmic(color);
    }
    default: {
      tonemapped = ACESFilm(color);
    }
  }

  // Apply gamma correction
  let result = gammaCorrect(tonemapped, uniforms.gamma);

  return vec4f(result, 1.0);
}
`
