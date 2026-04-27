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

// VertexOutput must match the layout produced by the base-class
// FULLSCREEN_VERTEX_SHADER in WebGPUBasePass.ts. FXAAPass uses
// createFullscreenPipeline(), which injects its own vertex stage with
// entryPoint main and feeds this fragment entry from its own vertex
// buffer — so no @vertex entry point is needed in THIS module. A
// leftover fn vertexMain(...) was previously compiled but never
// invoked; removed because (a) it violated the projects entry point
// naming convention and (b) it was a maintenance trap for anyone
// adapting this shader to a custom pipeline who would assume the
// vertex entry was live.
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let texelSize = 1.0 / uniforms.resolution;

  // Sample the center and 4 neighbors
  // textureSampleLevel(..., 0.0) skips ddx/ddy derivative computation required by textureSample.
  // The bound texture is non-mipped, so mip 0 is the only valid level — derivatives are wasted work.
  let colorC = textureSampleLevel(tInput, linearSampler, input.uv, 0.0).rgb;
  let colorN = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(0.0, texelSize.y), 0.0).rgb;
  let colorS = textureSampleLevel(tInput, linearSampler, input.uv - vec2f(0.0, texelSize.y), 0.0).rgb;
  let colorE = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(texelSize.x, 0.0), 0.0).rgb;
  let colorW = textureSampleLevel(tInput, linearSampler, input.uv - vec2f(texelSize.x, 0.0), 0.0).rgb;

  // Sample corners (moved here for uniform control flow - all textureSamples before conditionals)
  let colorNW = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(-texelSize.x, texelSize.y), 0.0).rgb;
  let colorNE = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(texelSize.x, texelSize.y), 0.0).rgb;
  let colorSW = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(-texelSize.x, -texelSize.y), 0.0).rgb;
  let colorSE = textureSampleLevel(tInput, linearSampler, input.uv + vec2f(texelSize.x, -texelSize.y), 0.0).rgb;

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

  // Early out for low-contrast pixels. textureSampleLevel uses an
  // explicit LOD so non-uniform control flow is permitted (no implicit
  // derivatives), and on flat regions of the image the wave is
  // coherent — the entire warp skips the ~30 arithmetic ops plus the
  // final texture fetch below. The previous "compute everything then
  // select" form was conservative against an outdated uniform-CF
  // requirement that does not apply to textureSampleLevel.
  if (lumRange < max(uniforms.edgeThresholdMin, lumMax * uniforms.edgeThreshold)) {
    return vec4f(colorC, 1.0);
  }

  // Calculate edge direction.
  // edgeH sums vertical Laplacians (Y second derivatives at columns W, C, E).
  // Large edgeH → strong vertical variation → horizontal edge span.
  // edgeV sums horizontal Laplacians (X second derivatives at rows N, C, S).
  // Large edgeV → strong horizontal variation → vertical edge span.
  // (Matches NVIDIA FXAA 3.11: edgeHorz = vertical Laplacian sums.)
  let edgeH = abs((lumNW + lumSW) - 2.0 * lumW) +
              2.0 * abs((lumN + lumS) - 2.0 * lumC) +
              abs((lumNE + lumSE) - 2.0 * lumE);
  let edgeV = abs((lumNW + lumNE) - 2.0 * lumN) +
              2.0 * abs((lumW + lumE) - 2.0 * lumC) +
              abs((lumSW + lumSE) - 2.0 * lumS);

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
  let lumaAverage = lumaSum * 0.125;
  // lumRange ≥ max(edgeThresholdMin, lumMax*edgeThreshold) > 0 here, so the
  // divide is safe without an explicit floor; the early-out above guarantees
  // we never reach this with lumRange == 0.
  let subpixelOffset = clamp(abs(lumaAverage - lumC) / lumRange, 0.0, 1.0);
  let subpixelOffsetFinal = (-2.0 * subpixelOffset + 3.0) * subpixelOffset * subpixelOffset;
  let pixelOffset = subpixelOffsetFinal * uniforms.subpixelQuality;

  // Calculate final UV using select for uniform control flow.
  // pixelStep is the perpendicular step (±texelSize.y for horizontal, ±texelSize.x for vertical).
  // The perpendicular 0.5-pixel shift moves the sample towards the edge boundary.
  // The subpixel offset uses the along-edge texel dimension (texelSize.x for horizontal edges,
  // texelSize.y for vertical edges) — NOT the perpendicular dimension.
  let alongEdgeStep = select(texelSize.y, texelSize.x, isHorizontal);
  let finalOffsetH = vec2f(pixelOffset * alongEdgeStep, pixelStep * 0.5);
  let finalOffsetV = vec2f(pixelStep * 0.5, pixelOffset * alongEdgeStep);
  let finalOffset = select(finalOffsetV, finalOffsetH, isHorizontal);

  let finalColor = textureSampleLevel(tInput, linearSampler, input.uv + finalOffset, 0.0).rgb;
  return vec4f(finalColor, 1.0);
}
`
