/**
 * WGSL Bloom Shaders (Progressive Downsample/Upsample)
 *
 * Jimenez 2014 / Call of Duty bloom algorithm:
 * - Prefilter: luminance threshold + Karis average
 * - Downsample: 13-tap box filter
 * - Upsample: 9-tap tent filter + additive blend
 * - Composite: scene + gain * bloom
 * - Copy: zero-gain fast path passthrough
 */

/**
 * Prefilter shader: luminance-based threshold with Karis average.
 *
 * Samples 4 quadrant texels at half-res, weights by 1/(1+luma),
 * applies soft threshold per sample, averages with Karis weights.
 *
 * Uniform layout (16 bytes):
 *   threshold: f32, knee: f32, _pad0: f32, _pad1: f32
 */
export const bloomPrefilterShader = /* wgsl */ `
struct PrefilterUniforms {
  threshold: f32,
  knee: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: PrefilterUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

fn softThreshold(color: vec3f, threshold: f32, knee: f32) -> vec3f {
  let radiance = max(color, vec3f(0.0));
  let luma = luminance(radiance);
  let safeKnee = max(knee, 0.0001);
  let soft = clamp(luma - threshold + safeKnee, 0.0, 2.0 * safeKnee);
  let quadratic = soft * soft / (4.0 * safeKnee + 0.00001);
  let contribution = max(quadratic, luma - threshold);
  let factor = min(contribution / max(luma, 0.00001), 1.0);
  return radiance * factor;
}

fn extractBloomSample(colorSample: vec4f, threshold: f32, knee: f32) -> vec3f {
  // object-color is premultiplied-alpha. Threshold in straight color space
  // and then re-apply alpha so transparent edge pixels don't leak bloom rings.
  let alpha = clamp(colorSample.a, 0.0, 1.0);
  if (alpha <= 0.0001) {
    return vec3f(0.0);
  }

  let straightColor = colorSample.rgb / alpha;
  let thresholded = softThreshold(straightColor, threshold, knee);
  return thresholded * alpha;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tInput));
  let texelSize = 1.0 / dims;

  // Sample 4 quadrant texels (bilinear-filtered at half-pixel offsets)
  let a = textureSample(tInput, linearSampler, input.uv + texelSize * vec2f(-1.0, -1.0));
  let b = textureSample(tInput, linearSampler, input.uv + texelSize * vec2f( 1.0, -1.0));
  let c = textureSample(tInput, linearSampler, input.uv + texelSize * vec2f(-1.0,  1.0));
  let d = textureSample(tInput, linearSampler, input.uv + texelSize * vec2f( 1.0,  1.0));

  // Apply threshold to each sample independently
  let ta = extractBloomSample(a, uniforms.threshold, uniforms.knee);
  let tb = extractBloomSample(b, uniforms.threshold, uniforms.knee);
  let tc = extractBloomSample(c, uniforms.threshold, uniforms.knee);
  let td = extractBloomSample(d, uniforms.threshold, uniforms.knee);

  // Karis average: weight by 1/(1+luma) to prevent firefly artifacts
  let wa = 1.0 / (1.0 + luminance(ta));
  let wb = 1.0 / (1.0 + luminance(tb));
  let wc = 1.0 / (1.0 + luminance(tc));
  let wd = 1.0 / (1.0 + luminance(td));

  let result = (ta * wa + tb * wb + tc * wc + td * wd) / (wa + wb + wc + wd);
  return vec4f(result, 1.0);
}
`

/**
 * 13-tap downsample filter (Jimenez 2014).
 *
 * Samples a 4x4 texel area via 5 overlapping 2x2 blocks, weighted to sum to 1.0.
 * No uniforms — texel size derived from textureDimensions().
 */
export const bloomDownsampleShader = /* wgsl */ `
@group(0) @binding(0) var tInput: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tInput));
  let texelSize = 1.0 / dims;
  let uv = input.uv;

  // 13-tap filter: 5 overlapping 2x2 bilinear taps
  //
  //   a . b . c
  //   . d . e .
  //   f . g . h
  //   . i . j .
  //   k . l . m
  //
  // Weights: center cross = 0.125 each (×4 = 0.5),
  //   corner blocks = 0.03125 each (×4 per block × 4 blocks = 0.5)
  //   Total = 1.0

  let a = textureSample(tInput, linearSampler, uv + texelSize * vec2f(-2.0, -2.0)).rgb;
  let b = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 0.0, -2.0)).rgb;
  let c = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 2.0, -2.0)).rgb;
  let d = textureSample(tInput, linearSampler, uv + texelSize * vec2f(-1.0, -1.0)).rgb;
  let e = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 1.0, -1.0)).rgb;
  let f = textureSample(tInput, linearSampler, uv + texelSize * vec2f(-2.0,  0.0)).rgb;
  let g = textureSample(tInput, linearSampler, uv).rgb;
  let h = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 2.0,  0.0)).rgb;
  let i = textureSample(tInput, linearSampler, uv + texelSize * vec2f(-1.0,  1.0)).rgb;
  let j = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 1.0,  1.0)).rgb;
  let k = textureSample(tInput, linearSampler, uv + texelSize * vec2f(-2.0,  2.0)).rgb;
  let l = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 0.0,  2.0)).rgb;
  let m = textureSample(tInput, linearSampler, uv + texelSize * vec2f( 2.0,  2.0)).rgb;

  // Center diamond (d+e+i+j) gets weight 0.5 (0.125 each)
  // Four corner blocks get weight 0.125 total each (0.03125 per sample)
  var result = (d + e + i + j) * 0.125;
  result += (a + b + f + g) * 0.03125;
  result += (b + c + g + h) * 0.03125;
  result += (f + g + k + l) * 0.03125;
  result += (g + h + l + m) * 0.03125;

  return vec4f(result, 1.0);
}
`

/**
 * 9-tap tent upsample filter with additive blend.
 *
 * Samples lower mip with 9-tap tent kernel, adds to current mip.
 *
 * Uniform layout (16 bytes):
 *   filterRadius: f32, _pad0: f32, _pad1: f32, _pad2: f32
 */
export const bloomUpsampleShader = /* wgsl */ `
struct UpsampleUniforms {
  filterRadius: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: UpsampleUniforms;
@group(0) @binding(1) var tLowerMip: texture_2d<f32>;
@group(0) @binding(2) var tCurrentMip: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tLowerMip));
  let texelSize = uniforms.filterRadius / dims;
  let uv = input.uv;

  // 9-tap tent filter: corners 1/16, edges 2/16, center 4/16
  var bloom = textureSample(tLowerMip, linearSampler, uv + vec2f(-texelSize.x, -texelSize.y)).rgb;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f( 0.0,           -texelSize.y)).rgb * 2.0;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f( texelSize.x,   -texelSize.y)).rgb;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f(-texelSize.x,    0.0)).rgb * 2.0;
  bloom += textureSample(tLowerMip, linearSampler, uv).rgb * 4.0;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f( texelSize.x,    0.0)).rgb * 2.0;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f(-texelSize.x,    texelSize.y)).rgb;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f( 0.0,            texelSize.y)).rgb * 2.0;
  bloom += textureSample(tLowerMip, linearSampler, uv + vec2f( texelSize.x,    texelSize.y)).rgb;
  bloom *= (1.0 / 16.0);

  // Additive blend with current mip
  let current = textureSample(tCurrentMip, linearSampler, uv).rgb;
  return vec4f(bloom + current, 1.0);
}
`

/**
 * Bloom composite shader: adds bloom to scene.
 *
 * Uniform layout (16 bytes):
 *   bloomGain: f32, _pad0: f32, _pad1: f32, _pad2: f32
 */
export const bloomCompositeShader = /* wgsl */ `
struct CompositeUniforms {
  bloomGain: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tBloom: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, linearSampler, input.uv).rgb;
  let bloomColor = textureSample(tBloom, linearSampler, input.uv).rgb;
  return vec4f(sceneColor + uniforms.bloomGain * bloomColor, 1.0);
}
`

/**
 * Copy shader for zero-gain fast path passthrough.
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
