/**
 * WGSL Temporal Reconstruction Shader
 *
 * Reconstructs full-resolution image from quarter-res samples and reprojected history.
 * Uses neighborhood clamping to prevent ghosting artifacts.
 *
 * Part of the Horizon-style 3-pass temporal accumulation system:
 * 1. Quarter-res render (with Bayer jitter)
 * 2. Reprojection - reproject history using motion vectors
 * 3. Reconstruction (this pass) - blend with neighborhood clamping
 *
 * @module rendering/webgpu/shaders/temporal/reconstruction.wgsl
 */

export const temporalReconstructionShader = /* wgsl */ `
// ============================================
// Temporal Reconstruction Pass
// ============================================

struct TemporalUniforms {
  prevViewProjection: mat4x4f,     // Previous frame view-projection (offset 0)
  inverseViewProjection: mat4x4f, // Current inverse view-projection (offset 64)
  bayerOffset: vec2f,              // Current Bayer offset (offset 128)
  fullResolution: vec2f,           // Full resolution (offset 136)
  historyWeight: f32,              // Blend weight (offset 144)
  frameIndex: u32,                 // Current frame (offset 148)
  _padding: vec2f,                 // Padding (offset 152)
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Bind group 0: Uniforms
@group(0) @binding(0) var<uniform> temporal: TemporalUniforms;

// Bind group 1: Textures
@group(1) @binding(0) var quarterColor: texture_2d<f32>;       // Quarter-res color from current frame
@group(1) @binding(1) var reprojectedHistory: texture_2d<f32>; // Reprojected history (RGB + validity in A)
@group(1) @binding(2) var nearestSampler: sampler;

// Sample quarter-res texture with bounds checking
fn sampleQuarterRes(coord: vec2i, dims: vec2i) -> vec4f {
  let clamped = clamp(coord, vec2i(0), dims - 1);
  return textureLoad(quarterColor, clamped, 0);
}

// Compute neighborhood min/max for clamping (3x3 at 2-pixel stride = 6x6 effective area).
// centerSample is the already-loaded texel at centerCoord -- passed in so the center
// iteration of the 3x3 does not reload the same texel the caller already has.
fn computeNeighborhoodBounds(centerCoord: vec2i, dims: vec2i, centerSample: vec4f) -> array<vec3f, 2> {
  var minColor = vec3f(99999.0);
  var maxColor = vec3f(-99999.0);

  // Fold the pre-loaded center sample into the min/max first.
  if (centerSample.a > 0.001) {
    minColor = centerSample.rgb;
    maxColor = centerSample.rgb;
  }

  // Sample 3x3 neighborhood with stride 2 (covers larger area).
  // NB: the center (dx=0, dy=0) is skipped -- it is centerSample, already folded in above.
  // Unrolled so the compiler sees eight plain textureLoads.
  let s_nn = sampleQuarterRes(centerCoord + vec2i(-2, -2), dims);
  let s_0n = sampleQuarterRes(centerCoord + vec2i( 0, -2), dims);
  let s_pn = sampleQuarterRes(centerCoord + vec2i( 2, -2), dims);
  let s_n0 = sampleQuarterRes(centerCoord + vec2i(-2,  0), dims);
  let s_p0 = sampleQuarterRes(centerCoord + vec2i( 2,  0), dims);
  let s_np = sampleQuarterRes(centerCoord + vec2i(-2,  2), dims);
  let s_0p = sampleQuarterRes(centerCoord + vec2i( 0,  2), dims);
  let s_pp = sampleQuarterRes(centerCoord + vec2i( 2,  2), dims);

  // Fold each neighbor in if it has valid alpha. Done branchlessly via select() on
  // sentinel extrema — the compiler lowers this to predicated min/max on all known
  // back-ends and avoids per-sample branches.
  let INF = vec3f(99999.0);
  let NEG_INF = vec3f(-99999.0);
  minColor = min(minColor, select(INF,     s_nn.rgb, s_nn.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_nn.rgb, s_nn.a > 0.001));
  minColor = min(minColor, select(INF,     s_0n.rgb, s_0n.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_0n.rgb, s_0n.a > 0.001));
  minColor = min(minColor, select(INF,     s_pn.rgb, s_pn.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_pn.rgb, s_pn.a > 0.001));
  minColor = min(minColor, select(INF,     s_n0.rgb, s_n0.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_n0.rgb, s_n0.a > 0.001));
  minColor = min(minColor, select(INF,     s_p0.rgb, s_p0.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_p0.rgb, s_p0.a > 0.001));
  minColor = min(minColor, select(INF,     s_np.rgb, s_np.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_np.rgb, s_np.a > 0.001));
  minColor = min(minColor, select(INF,     s_0p.rgb, s_0p.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_0p.rgb, s_0p.a > 0.001));
  minColor = min(minColor, select(INF,     s_pp.rgb, s_pp.a > 0.001));
  maxColor = max(maxColor, select(NEG_INF, s_pp.rgb, s_pp.a > 0.001));

  // Fallback: if neither the center nor any neighbor was valid, fall back to centerSample.
  if (minColor.x > 90000.0) {
    minColor = centerSample.rgb;
    maxColor = centerSample.rgb;
  }

  return array<vec3f, 2>(minColor, maxColor);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let fullDims = vec2i(temporal.fullResolution);
  let fullCoord = clamp(vec2i(input.uv * temporal.fullResolution), vec2i(0), fullDims - vec2i(1));
  let quarterCoord = fullCoord / 2;

  // Get quarter-res texture dimensions
  let quarterDims = vec2i(textureDimensions(quarterColor));

  // Load the four bilinear taps ONCE. Reuse tl as both the bilinear top-left AND
  // the exact sample for the Bayer-aligned pixel (current). This fuses the old
  // spatialInterpolate() helper and the stand-alone current = sampleQuarterRes(
  // quarterCoord, ...) into a single set of four loads, saving one textureLoad
  // per pixel vs. the previous implementation.
  let tl = sampleQuarterRes(quarterCoord, quarterDims);
  let tr = sampleQuarterRes(quarterCoord + vec2i(1, 0), quarterDims);
  let bl = sampleQuarterRes(quarterCoord + vec2i(0, 1), quarterDims);
  let br = sampleQuarterRes(quarterCoord + vec2i(1, 1), quarterDims);

  // Determine sub-pixel position within the 2x2 block.
  // (fullCoord & 1 == fullCoord % 2 for non-negative ints, but cheaper on all back-ends.)
  let subPixel = fullCoord & vec2i(1);
  // Bilinear weights: 0.25 or 0.75 depending on sub-pixel parity.
  let fx = f32(subPixel.x) * 0.5 + 0.25;
  let fy = f32(subPixel.y) * 0.5 + 0.25;

  // Bilinear blend (for non-rendered pixels — ensures every pixel reflects the current
  // frame's data and eliminates Bayer shimmer).
  let interpolated = mix(mix(tl, tr, fx), mix(bl, br, fx), fy);

  // For the Bayer-aligned pixel, reuse tl (same coord as quarterCoord).
  let blockPos = vec2f(f32(subPixel.x), f32(subPixel.y));
  let isRenderedPixel = (blockPos.x == temporal.bayerOffset.x && blockPos.y == temporal.bayerOffset.y);

  // Use exact sample for rendered pixel, interpolated for others
  let currentColor = select(interpolated.rgb, tl.rgb, isRenderedPixel);
  let currentAlpha = select(interpolated.a, tl.a, isRenderedPixel);

  // Sample reprojected history (RGB color, A = validity)
  let historyData = textureLoad(reprojectedHistory, fullCoord, 0);
  let historyColor = historyData.rgb;
  let validity = historyData.a;

  // Compute neighborhood bounds for clamping — pass the already-loaded tl as the
  // center sample so the bounds pass reuses it (saves one more textureLoad per pixel).
  let bounds = computeNeighborhoodBounds(quarterCoord, quarterDims, tl);
  let neighborMin = bounds[0];
  let neighborMax = bounds[1];

  // Clamp history to neighborhood bounds (prevents ghosting)
  let clampedHistory = clamp(historyColor, neighborMin, neighborMax);

  // Blend current frame with clamped history uniformly for all pixels.
  // All pixels get the same treatment regardless of Bayer position,
  // preventing the 4-frame pattern that causes visible jitter.
  var result: vec3f;
  var alpha: f32;

  if (validity > 0.5 && currentAlpha > 0.001) {
    let blendWeight = temporal.historyWeight * validity;
    result = mix(currentColor, clampedHistory, blendWeight);
    alpha = currentAlpha;
  } else if (currentAlpha > 0.001) {
    // No valid history - use current frame directly
    result = currentColor;
    alpha = currentAlpha;
  } else if (validity > 0.5) {
    // No current data but valid history
    result = clampedHistory;
    alpha = 1.0;
  } else {
    // Nothing available
    result = vec3f(0.0);
    alpha = 0.0;
  }

  // Ensure solid objects remain solid (preserve alpha = 1.0)
  if (currentAlpha > 0.99) {
    alpha = 1.0;
  }

  return vec4f(result, alpha);
}
`
