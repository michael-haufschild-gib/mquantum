/**
 * WGSL FXAA Shader
 *
 * Fast Approximate Anti-Aliasing (FXAA 3.11).
 * Based on NVIDIA's implementation.
 *
 * @module rendering/webgpu/shaders/postprocessing/fxaa.wgsl
 */

export const fxaaShader = /* wgsl */ `
// ============================================
// FXAA 3.11 (Fast Approximate Anti-Aliasing)
// ============================================

struct FXAAUniforms {
  resolution: vec2f,
  subpixelQuality: f32,      // 0.0 to 1.0 (0.75 default)
  edgeThreshold: f32,        // 0.063 to 0.333 (0.125 default)
  edgeThresholdMin: f32,     // 0.0312 to 0.0833 (0.0625 default)
  _padding: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: FXAAUniforms;
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
  return dot(color, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let texelSize = 1.0 / uniforms.resolution;

  // Sample the center and 4 neighbors
  let colorC = textureSample(tInput, linearSampler, input.uv).rgb;
  let colorN = textureSample(tInput, linearSampler, input.uv + vec2f(0.0, texelSize.y)).rgb;
  let colorS = textureSample(tInput, linearSampler, input.uv - vec2f(0.0, texelSize.y)).rgb;
  let colorE = textureSample(tInput, linearSampler, input.uv + vec2f(texelSize.x, 0.0)).rgb;
  let colorW = textureSample(tInput, linearSampler, input.uv - vec2f(texelSize.x, 0.0)).rgb;

  // Sample corners (moved here for uniform control flow - all textureSamples before conditionals)
  let colorNW = textureSample(tInput, linearSampler, input.uv + vec2f(-texelSize.x, texelSize.y)).rgb;
  let colorNE = textureSample(tInput, linearSampler, input.uv + vec2f(texelSize.x, texelSize.y)).rgb;
  let colorSW = textureSample(tInput, linearSampler, input.uv + vec2f(-texelSize.x, -texelSize.y)).rgb;
  let colorSE = textureSample(tInput, linearSampler, input.uv + vec2f(texelSize.x, -texelSize.y)).rgb;

  // Calculate luminance
  let lumC = luminance(colorC);
  let lumN = luminance(colorN);
  let lumS = luminance(colorS);
  let lumE = luminance(colorE);
  let lumW = luminance(colorW);
  let lumNW = luminance(colorNW);
  let lumNE = luminance(colorNE);
  let lumSW = luminance(colorSW);
  let lumSE = luminance(colorSE);

  // Find min/max luma
  let lumMin = min(lumC, min(min(lumN, lumS), min(lumE, lumW)));
  let lumMax = max(lumC, max(max(lumN, lumS), max(lumE, lumW)));

  // Calculate contrast
  let lumRange = lumMax - lumMin;

  // Check if contrast is below threshold (no early return - use select at end)
  let skipAA = lumRange < max(uniforms.edgeThresholdMin, lumMax * uniforms.edgeThreshold);

  // Calculate edge direction
  let edgeH = abs((lumNW + lumNE) - 2.0 * lumN) +
              2.0 * abs((lumW + lumE) - 2.0 * lumC) +
              abs((lumSW + lumSE) - 2.0 * lumS);
  let edgeV = abs((lumNW + lumSW) - 2.0 * lumW) +
              2.0 * abs((lumN + lumS) - 2.0 * lumC) +
              abs((lumNE + lumSE) - 2.0 * lumE);

  let isHorizontal = edgeH >= edgeV;

  // Choose edge direction using select for uniform control flow
  let stepLength = select(texelSize.x, texelSize.y, isHorizontal);
  let lumNeg = select(lumW, lumS, isHorizontal);
  let lumPos = select(lumE, lumN, isHorizontal);

  let gradientNeg = abs(lumNeg - lumC);
  let gradientPos = abs(lumPos - lumC);

  // Choose the direction with the steeper gradient
  let pixelStep = select(stepLength, -stepLength, gradientNeg < gradientPos);

  // Calculate subpixel offset
  var lumaSum = lumN + lumS + lumE + lumW;
  lumaSum += lumNW + lumNE + lumSW + lumSE;
  let lumaAverage = lumaSum / 8.0;
  // Use max to avoid division by zero when lumRange is 0
  let subpixelOffset = clamp(abs(lumaAverage - lumC) / max(lumRange, 0.0001), 0.0, 1.0);
  let subpixelOffsetFinal = (-2.0 * subpixelOffset + 3.0) * subpixelOffset * subpixelOffset;
  let pixelOffset = subpixelOffsetFinal * subpixelOffsetFinal * uniforms.subpixelQuality;

  // Calculate final UV using select for uniform control flow
  let finalOffsetH = vec2f(pixelOffset * pixelStep, pixelStep * 0.5);
  let finalOffsetV = vec2f(pixelStep * 0.5, pixelOffset * pixelStep);
  let finalOffset = select(finalOffsetV, finalOffsetH, isHorizontal);

  // Sample final color (must be before any conditionals for uniform control flow)
  let finalColor = textureSample(tInput, linearSampler, input.uv + finalOffset).rgb;

  // Use select to choose between original color (skip AA) or processed color
  let outputColor = select(finalColor, colorC, skipAA);

  return vec4f(outputColor, 1.0);
}
`
