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

// Compute neighborhood min/max for clamping (3x3 at 2-pixel stride = 6x6 effective area)
fn computeNeighborhoodBounds(centerCoord: vec2i, dims: vec2i) -> array<vec3f, 2> {
  var minColor = vec3f(99999.0);
  var maxColor = vec3f(-99999.0);

  // Sample 3x3 neighborhood with stride 2 (covers larger area)
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let offset = vec2i(dx * 2, dy * 2);
      let sample = sampleQuarterRes(centerCoord + offset, dims);

      // Only include samples with valid alpha
      if (sample.a > 0.001) {
        minColor = min(minColor, sample.rgb);
        maxColor = max(maxColor, sample.rgb);
      }
    }
  }

  // Fallback if no valid samples
  if (minColor.x > 90000.0) {
    let center = sampleQuarterRes(centerCoord, dims);
    minColor = center.rgb;
    maxColor = center.rgb;
  }

  return array<vec3f, 2>(minColor, maxColor);
}

// Spatial interpolation from quarter-res (for non-rendered pixels without history)
fn spatialInterpolate(fullCoord: vec2i, quarterDims: vec2i) -> vec4f {
  // Determine sub-pixel position within the 2x2 block
  let subPixel = fullCoord % 2;
  let quarterCoord = fullCoord / 2;

  // Bilinear weights based on position in block
  let fx = f32(subPixel.x) * 0.5 + 0.25;
  let fy = f32(subPixel.y) * 0.5 + 0.25;

  // Sample 4 nearest quarter-res pixels
  let tl = sampleQuarterRes(quarterCoord, quarterDims);
  let tr = sampleQuarterRes(quarterCoord + vec2i(1, 0), quarterDims);
  let bl = sampleQuarterRes(quarterCoord + vec2i(0, 1), quarterDims);
  let br = sampleQuarterRes(quarterCoord + vec2i(1, 1), quarterDims);

  // Bilinear blend
  let top = mix(tl, tr, fx);
  let bottom = mix(bl, br, fx);
  return mix(top, bottom, fy);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let fullDims = vec2i(temporal.fullResolution);
  let fullCoord = clamp(vec2i(input.uv * temporal.fullResolution), vec2i(0), fullDims - vec2i(1));
  let quarterCoord = fullCoord / 2;

  // Get quarter-res texture dimensions
  let quarterDims = vec2i(textureDimensions(quarterColor));

  // Current frame: spatially interpolate from quarter-res for ALL pixels.
  // This ensures every pixel reflects the current frame's data, eliminating
  // the visible Bayer shimmer caused by treating pixels differently based
  // on the cycling Bayer offset.
  let interpolated = spatialInterpolate(fullCoord, quarterDims);

  // For the Bayer-aligned pixel, we have an exact sample (no interpolation needed)
  let blockPos = vec2f(f32(fullCoord.x % 2), f32(fullCoord.y % 2));
  let isRenderedPixel = (blockPos.x == temporal.bayerOffset.x && blockPos.y == temporal.bayerOffset.y);
  let current = sampleQuarterRes(quarterCoord, quarterDims);

  // Use exact sample for rendered pixel, interpolated for others
  let currentColor = select(interpolated.rgb, current.rgb, isRenderedPixel);
  let currentAlpha = select(interpolated.a, current.a, isRenderedPixel);

  // Sample reprojected history (RGB color, A = validity)
  let historyData = textureLoad(reprojectedHistory, fullCoord, 0);
  let historyColor = historyData.rgb;
  let validity = historyData.a;

  // Compute neighborhood bounds for clamping
  let bounds = computeNeighborhoodBounds(quarterCoord, quarterDims);
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
