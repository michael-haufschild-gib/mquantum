/**
 * WGSL Bloom Shaders
 *
 * Multi-scale bloom effect matching Three.js UnrealBloomPass quality.
 * Uses 5 MIP levels with progressive downsampling and Gaussian blur.
 *
 * - Threshold: HDR-aware luminance extraction with peak normalization
 * - Blur: Per-level Gaussian with precomputed coefficients (kernel sizes [3,5,7,9,11])
 * - Composite: 5 MIP level weighted sum with lerpBloomFactor and 3.0x strength multiplier
 *
 * Fragment-only shaders: vertex stage provided by WebGPUBasePass FULLSCREEN_VERTEX_SHADER.
 *
 * @module rendering/webgpu/shaders/postprocessing/bloom.wgsl
 */

/**
 * Brightness threshold shader with HDR peak normalization.
 * Extracts bright areas matching WebGL HDRLuminosityHighPassShader behavior.
 *
 * Uniform layout (16 bytes):
 *   threshold: f32, knee: f32, hdrPeak: f32, _padding: f32
 */
export const bloomThresholdShader = /* wgsl */ `
struct ThresholdUniforms {
  threshold: f32,
  knee: f32,
  hdrPeak: f32,
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: ThresholdUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(tInput, linearSampler, input.uv).rgb;

  // Normalize luminance by HDR peak (matches WebGL HDRLuminosityHighPassShader)
  // This makes threshold=0.8 mean "80% of peak brightness"
  let lum = luminance(color) / uniforms.hdrPeak;

  // Smoothstep threshold with knee as smooth width
  let alpha = smoothstep(uniforms.threshold, uniforms.threshold + uniforms.knee, lum);

  return vec4f(color * alpha, 1.0);
}
`

/**
 * Creates a Gaussian blur shader for a specific kernel radius.
 * Each MIP level gets a shader with a fixed loop bound for optimal GPU performance.
 * Kernel sizes match UnrealBloomPass: [3, 5, 7, 9, 11] per MIP level.
 *
 * Coefficients are precomputed on CPU and passed as uniforms packed in array<vec4f, 3>.
 *
 * Uniform layout (64 bytes):
 *   direction: vec2f, texelSize: vec2f, coefficients: array<vec4f, 3>
 *
 * @param kernelRadius - Number of samples on each side of center (3, 5, 7, 9, or 11)
 * @returns WGSL fragment shader source
 */
export function createBloomBlurShader(kernelRadius: number): string {
  return /* wgsl */ `
struct BlurUniforms {
  direction: vec2f,
  texelSize: vec2f,
  coefficients: array<vec4f, 3>,
}

@group(0) @binding(0) var<uniform> uniforms: BlurUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn getCoeff(i: u32) -> f32 {
  return uniforms.coefficients[i / 4u][i % 4u];
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let offset = uniforms.direction * uniforms.texelSize;

  // Center sample
  var result = textureSample(tInput, linearSampler, input.uv).rgb * getCoeff(0u);

  // Symmetric Gaussian samples (${kernelRadius} on each side)
  for (var i = 1u; i < ${kernelRadius + 1}u; i++) {
    let w = getCoeff(i);
    let o = offset * f32(i);
    result += textureSample(tInput, linearSampler, input.uv + o).rgb * w;
    result += textureSample(tInput, linearSampler, input.uv - o).rgb * w;
  }

  return vec4f(result, 1.0);
}
`
}

/**
 * Multi-scale bloom composite shader.
 * Reads 5 MIP levels and blends with scene using lerpBloomFactor and 3.0x multiplier.
 * Matches UnrealBloomPass composite behavior exactly.
 *
 * Uniform layout (48 bytes):
 *   bloomStrength: f32, bloomRadius: f32, _pad: vec2f,
 *   bloomFactors: vec4f (levels 0-3), bloomFactor4: vec4f (level 4 in .x)
 */
export const bloomCompositeShader = /* wgsl */ `
struct CompositeUniforms {
  bloomStrength: f32,
  bloomRadius: f32,
  _pad0: f32,
  _pad1: f32,
  bloomFactors: vec4f,
  bloomFactor4: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tMip0: texture_2d<f32>;
@group(0) @binding(3) var tMip1: texture_2d<f32>;
@group(0) @binding(4) var tMip2: texture_2d<f32>;
@group(0) @binding(5) var tMip3: texture_2d<f32>;
@group(0) @binding(6) var tMip4: texture_2d<f32>;
@group(0) @binding(7) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn lerpBloomFactor(factor: f32) -> f32 {
  let mirrorFactor = 1.2 - factor;
  return mix(factor, mirrorFactor, uniforms.bloomRadius);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, linearSampler, input.uv).rgb;

  // Weighted multi-scale bloom composite (matches UnrealBloomPass)
  // 3.0x multiplier matches WebGL's hardcoded composite strength
  let bloom = 3.0 * uniforms.bloomStrength * (
    lerpBloomFactor(uniforms.bloomFactors.x) * textureSample(tMip0, linearSampler, input.uv).rgb +
    lerpBloomFactor(uniforms.bloomFactors.y) * textureSample(tMip1, linearSampler, input.uv).rgb +
    lerpBloomFactor(uniforms.bloomFactors.z) * textureSample(tMip2, linearSampler, input.uv).rgb +
    lerpBloomFactor(uniforms.bloomFactors.w) * textureSample(tMip3, linearSampler, input.uv).rgb +
    lerpBloomFactor(uniforms.bloomFactor4.x) * textureSample(tMip4, linearSampler, input.uv).rgb
  );

  return vec4f(sceneColor + bloom, 1.0);
}
`
