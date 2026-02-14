/**
 * WGSL Bloom Shaders (Bloom V2)
 *
 * Supports:
 * - Threshold extraction
 * - Per-level Gaussian blur shaders
 * - Level-specialized Gaussian composite shaders
 * - Convolution composite shader
 * - Copy shader for zero-strength fast path
 */

/**
 * Brightness threshold shader (UE4/Catlike-style soft threshold).
 *
 * Uses max(r,g,b) brightness instead of luminance to avoid chromatic bias
 * (luminance weights green at 71.5%, causing green fringes on dark backgrounds).
 * Quadratic soft knee creates a gradual bloom onset instead of a hard cutoff.
 *
 * Uniform layout (16 bytes):
 *   threshold: f32, knee: f32, _padding0: f32, _padding1: f32
 */
export const bloomThresholdShader = /* wgsl */ `
struct ThresholdUniforms {
  threshold: f32,
  knee: f32,
  _padding0: f32,
  _padding1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: ThresholdUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn softThreshold(color: vec3f, threshold: f32, knee: f32) -> vec3f {
  let brightness = max(color.r, max(color.g, color.b));
  let safeKnee = max(knee, 0.0001);
  // Quadratic ramp in the knee region [threshold - knee, threshold + knee]
  let soft = clamp(brightness - threshold + safeKnee, 0.0, 2.0 * safeKnee);
  let quadratic = soft * soft / (4.0 * safeKnee + 0.00001);
  // Above threshold + knee: use linear (brightness - threshold)
  let contribution = max(quadratic, brightness - threshold);
  let factor = contribution / max(brightness, 0.00001);
  return color * max(factor, 0.0);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(tInput, linearSampler, input.uv).rgb;
  let result = softThreshold(color, uniforms.threshold, uniforms.knee);
  return vec4f(result, 1.0);
}
`

/**
 * Creates a Gaussian blur shader for a specific kernel radius.
 *
 * Uniform layout (112 bytes):
 *   direction: vec2f, texelSize: vec2f, coefficients: array<vec4f, 6>
 */
export function createBloomBlurShader(kernelRadius: number): string {
  return /* wgsl */ `
struct BlurUniforms {
  direction: vec2f,
  texelSize: vec2f,
  coefficients: array<vec4f, 6>,
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

  var result = textureSample(tInput, linearSampler, input.uv).rgb * getCoeff(0u);

  for (var i = 1u; i < ${kernelRadius}u; i++) {
    let w = getCoeff(i);
    let o = offset * f32(i);
    result += textureSample(tInput, linearSampler, input.uv + o).rgb * w;
    result += textureSample(tInput, linearSampler, input.uv - o).rgb * w;
  }

  return vec4f(result, 1.0);
}
`
}

function weightExpr(index: number): string {
  if (index === 4) return 'uniforms.weights1.x'
  const channels = ['x', 'y', 'z', 'w'] as const
  return `uniforms.weights0.${channels[index]!}`
}

/**
 * Creates a level-specialized Gaussian composite shader.
 *
 * Uniform layout (128 bytes):
 *   bloomGain: f32, _pad: vec3f,
 *   weights0: vec4f, weights1: vec4f,
 *   tint0..tint4: vec4f
 */
export function createBloomCompositeShader(activeLevels: number): string {
  const clampedLevels = Math.max(1, Math.min(5, Math.floor(activeLevels)))
  const samplerBinding = clampedLevels + 2

  const mipBindings = Array.from({ length: clampedLevels }, (_, i) => {
    return `@group(0) @binding(${i + 2}) var tMip${i}: texture_2d<f32>;`
  }).join('\n')

  const bloomTerms = Array.from({ length: clampedLevels }, (_, i) => {
    return `${weightExpr(i)} * uniforms.tint${i}.rgb * textureSample(tMip${i}, linearSampler, input.uv).rgb`
  }).join(' +\n    ')

  return /* wgsl */ `
struct CompositeUniforms {
  bloomGain: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  weights0: vec4f,
  weights1: vec4f,
  tint0: vec4f,
  tint1: vec4f,
  tint2: vec4f,
  tint3: vec4f,
  tint4: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var tScene: texture_2d<f32>;
${mipBindings}
@group(0) @binding(${samplerBinding}) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, linearSampler, input.uv).rgb;
  let bloom = uniforms.bloomGain * (
    ${bloomTerms}
  );

  return vec4f(sceneColor + bloom, 1.0);
}
`
}

/**
 * Copy shader used for zero-strength fast path and convolution downsample pass.
 */
export const bloomCopyShader = /* wgsl */ `
@group(0) @binding(0) var tInput: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(textureSample(tInput, linearSampler, input.uv).rgb, 1.0);
}
`

/**
 * Convolution bloom shader.
 *
 * Uniform layout (48 bytes):
 *   gain: f32, radius: f32, boost: f32, threshold: f32,
 *   knee: f32, _pad: vec3f,
 *   tint: vec4f
 */
export const bloomConvolutionCompositeShader = /* wgsl */ `
struct ConvolutionUniforms {
  gain: f32,
  radius: f32,
  boost: f32,
  threshold: f32,
  knee: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  tint: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: ConvolutionUniforms;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tBloomInput: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn softThresholdFactor(color: vec3f) -> f32 {
  if (uniforms.threshold < 0.0) {
    return 1.0;
  }

  let brightness = max(color.r, max(color.g, color.b));
  let safeKnee = max(uniforms.knee, 0.0001);
  let soft = clamp(brightness - uniforms.threshold + safeKnee, 0.0, 2.0 * safeKnee);
  let quadratic = soft * soft / (4.0 * safeKnee + 0.00001);
  let contribution = max(quadratic, brightness - uniforms.threshold);
  return max(contribution / max(brightness, 0.00001), 0.0);
}

fn sampleBloom(uv: vec2f) -> vec3f {
  let color = textureSample(tBloomInput, linearSampler, uv).rgb;
  return color * softThresholdFactor(color);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, linearSampler, input.uv).rgb;

  let dims = vec2f(textureDimensions(tBloomInput));
  let texel = vec2f(1.0) / max(dims, vec2f(1.0));
  let radius = uniforms.radius * texel;

  let offX = vec2f(radius.x, 0.0);
  let offY = vec2f(0.0, radius.y);
  let offHalfX = offX * 0.5;
  let offHalfY = offY * 0.5;
  let offDiag = vec2f(radius.x * 0.70710678, radius.y * 0.70710678);

  var blurred = sampleBloom(input.uv) * 0.22;

  blurred += sampleBloom(input.uv + offX) * 0.09;
  blurred += sampleBloom(input.uv - offX) * 0.09;
  blurred += sampleBloom(input.uv + offY) * 0.09;
  blurred += sampleBloom(input.uv - offY) * 0.09;

  blurred += sampleBloom(input.uv + offDiag) * 0.07;
  blurred += sampleBloom(input.uv - offDiag) * 0.07;
  blurred += sampleBloom(input.uv + vec2f(offDiag.x, -offDiag.y)) * 0.07;
  blurred += sampleBloom(input.uv + vec2f(-offDiag.x, offDiag.y)) * 0.07;

  blurred += sampleBloom(input.uv + offHalfX) * 0.035;
  blurred += sampleBloom(input.uv - offHalfX) * 0.035;
  blurred += sampleBloom(input.uv + offHalfY) * 0.035;
  blurred += sampleBloom(input.uv - offHalfY) * 0.035;

  let bloomColor = blurred * uniforms.boost;
  return vec4f(sceneColor + uniforms.gain * uniforms.tint.rgb * bloomColor, 1.0);
}
`
