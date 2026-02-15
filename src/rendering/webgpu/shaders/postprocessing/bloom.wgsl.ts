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
  let factor = min(contribution / max(brightness, 0.00001), 1.0);
  return color * factor;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(tInput, linearSampler, input.uv).rgb;
  let result = softThreshold(color, uniforms.threshold, uniforms.knee);
  return vec4f(result, 1.0);
}
`

/**
 * Creates a compute-shader Gaussian blur for a specific kernel radius.
 *
 * Uses shared workgroup memory to reduce redundant global texture reads.
 * A single `direction` uniform (0=horizontal, 1=vertical) controls axis.
 *
 * Uniform layout (112 bytes):
 *   outputSize: vec2u, direction: u32, sizeScale: f32, coefficients: array<vec4f, 6>
 */
export function createBloomBlurComputeShader(kernelRadius: number): string {
  return /* wgsl */ `
struct BlurComputeUniforms {
  outputSize: vec2u,
  direction: u32,
  sizeScale: f32,
  coefficients: array<vec4f, 6>,
}

@group(0) @binding(0) var<uniform> uniforms: BlurComputeUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var tOutput: texture_storage_2d<rgba16float, write>;

const TILE_SIZE = 256u;
const KERNEL_RADIUS = ${kernelRadius}u;

var<workgroup> tile: array<vec3f, ${256 + 2 * kernelRadius}>;

fn getCoeff(i: u32) -> f32 {
  return uniforms.coefficients[i / 4u][i % 4u];
}

fn loadTexel(major: i32, minor: i32, dimMajor: i32, dimMinor: i32) -> vec3f {
  let cMajor = clamp(major, 0, dimMajor - 1);
  let cMinor = clamp(minor, 0, dimMinor - 1);
  var coord: vec2i;
  if (uniforms.direction == 0u) {
    coord = vec2i(cMajor, cMinor);
  } else {
    coord = vec2i(cMinor, cMajor);
  }
  return textureLoad(tInput, coord, 0).rgb;
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u) {
  var dimMajor: i32;
  var dimMinor: i32;
  if (uniforms.direction == 0u) {
    dimMajor = i32(uniforms.outputSize.x);
    dimMinor = i32(uniforms.outputSize.y);
  } else {
    dimMajor = i32(uniforms.outputSize.y);
    dimMinor = i32(uniforms.outputSize.x);
  }

  let minorIdx = i32(wid.y);
  let tileStart = i32(wid.x * TILE_SIZE);
  let localIdx = i32(lid.x);

  // --- Load center texel ---
  let centerMajor = tileStart + localIdx;
  tile[u32(localIdx) + KERNEL_RADIUS] = loadTexel(centerMajor, minorIdx, dimMajor, dimMinor);

  // --- Load left/top border ---
  if (u32(localIdx) < KERNEL_RADIUS) {
    let borderMajor = tileStart - i32(KERNEL_RADIUS) + localIdx;
    tile[u32(localIdx)] = loadTexel(borderMajor, minorIdx, dimMajor, dimMinor);
  }

  // --- Load right/bottom border ---
  if (u32(localIdx) >= TILE_SIZE - KERNEL_RADIUS) {
    let offset = u32(localIdx) - (TILE_SIZE - KERNEL_RADIUS);
    let borderMajor = tileStart + i32(TILE_SIZE) + i32(offset);
    tile[TILE_SIZE + KERNEL_RADIUS + offset] = loadTexel(borderMajor, minorIdx, dimMajor, dimMinor);
  }

  workgroupBarrier();

  // --- Bounds check: skip threads beyond texture dimensions ---
  if (centerMajor >= dimMajor || minorIdx >= dimMinor) {
    return;
  }

  // --- Apply Gaussian kernel from shared memory ---
  let tileIdx = u32(localIdx) + KERNEL_RADIUS;
  var result = tile[tileIdx] * getCoeff(0u);

  for (var i = 1u; i < ${kernelRadius}u; i++) {
    let w = getCoeff(i);
    let rawStep = max(1i, i32(round(f32(i) * uniforms.sizeScale)));
    let step = u32(min(rawStep, i32(KERNEL_RADIUS) - 1));
    result += (tile[tileIdx - step] + tile[tileIdx + step]) * w;
  }

  // --- Write output ---
  var outCoord: vec2i;
  if (uniforms.direction == 0u) {
    outCoord = vec2i(centerMajor, minorIdx);
  } else {
    outCoord = vec2i(minorIdx, centerMajor);
  }
  textureStore(tOutput, outCoord, vec4f(result, 1.0));
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
  let brightness = max(color.r, max(color.g, color.b));
  let safeKnee = max(uniforms.knee, 0.0001);
  let soft = clamp(brightness - uniforms.threshold + safeKnee, 0.0, 2.0 * safeKnee);
  let quadratic = soft * soft / (4.0 * safeKnee + 0.00001);
  let contribution = max(quadratic, brightness - uniforms.threshold);
  return min(contribution / max(brightness, 0.00001), 1.0);
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
