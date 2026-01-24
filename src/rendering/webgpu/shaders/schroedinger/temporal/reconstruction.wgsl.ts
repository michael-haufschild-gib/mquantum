/**
 * WGSL Reconstruction shader for temporal cloud accumulation
 *
 * Combines freshly rendered quarter-res pixels with reprojected history
 * to produce the full-resolution accumulated cloud image.
 *
 * Port of GLSL schroedinger/temporal/reconstruction.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporal/reconstruction.wgsl
 */

export const reconstructionVertexShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@location(0) position: vec3f, @location(1) uv: vec2f) -> VertexOutput {
  var output: VertexOutput;
  output.uv = uv;
  // Direct NDC output for fullscreen quad
  output.position = vec4f(position.xy, 0.0, 1.0);
  return output;
}
`

export const reconstructionFragmentShader = /* wgsl */ `
struct ReconstructionUniforms {
  bayerOffset: vec2f,         // Current Bayer offset (determines which pixel was rendered this frame)
  cloudResolution: vec2f,     // Quarter-res resolution
  accumulationResolution: vec2f, // Full-res resolution
  historyWeight: f32,         // Blend weight for history (0.0 = favor new, 1.0 = favor history)
  hasValidHistory: u32,       // Whether this is one of the first frames (no valid history yet)
  frameIndex: i32,            // Frame index for debugging
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: ReconstructionUniforms;

// New quarter-res cloud render (color)
@group(0) @binding(1) var cloudRenderTexture: texture_2d<f32>;
@group(0) @binding(2) var cloudRenderSampler: sampler;

// New quarter-res cloud positions (from MRT attachment 1)
@group(0) @binding(3) var cloudPositionTexture: texture_2d<f32>;
@group(0) @binding(4) var cloudPositionSampler: sampler;

// Reprojected history color (from reprojection pass)
@group(0) @binding(5) var reprojectedHistoryTexture: texture_2d<f32>;
@group(0) @binding(6) var reprojectedHistorySampler: sampler;

// Reprojected history positions (from position accumulation buffer)
@group(0) @binding(7) var reprojectedPositionHistoryTexture: texture_2d<f32>;
@group(0) @binding(8) var reprojectedPositionHistorySampler: sampler;

// Validity mask (from reprojection pass)
@group(0) @binding(9) var validityMaskTexture: texture_2d<f32>;
@group(0) @binding(10) var validityMaskSampler: sampler;

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) position: vec4f,
}

// For freshly rendered pixels, reduce history influence by this factor.
const FRESH_PIXEL_HISTORY_REDUCTION: f32 = 0.5;

/**
 * Sample color from quarter-res cloud buffer for a given full-res pixel coordinate.
 * Maps full-res pixel to the corresponding quarter-res location.
 */
fn sampleCloudColorAtPixel(fullResPixel: vec2i) -> vec4f {
  // Each 2x2 block in full-res maps to one pixel in quarter-res
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(cloudRenderTexture, cloudRenderSampler, quarterUV);
}

/**
 * Sample position from quarter-res cloud buffer for a given full-res pixel coordinate.
 */
fn sampleCloudPositionAtPixel(fullResPixel: vec2i) -> vec4f {
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(cloudPositionTexture, cloudPositionSampler, quarterUV);
}

/**
 * Sample color from neighbors in the quarter-res buffer for spatial interpolation.
 * Used when there's no valid history - reconstructs from nearby rendered pixels.
 */
fn spatialInterpolationColorFromCloud(fullResPixel: vec2i) -> vec4f {
  // Find the 2x2 block this pixel belongs to
  let blockBase = (fullResPixel / 2) * 2;

  // The Bayer offset tells us which pixel in the block was rendered
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;

  // Sample the rendered pixel from quarter-res buffer
  return sampleCloudColorAtPixel(renderedPixel);
}

/**
 * Sample position from neighbors in the quarter-res buffer for spatial interpolation.
 */
fn spatialInterpolationPositionFromCloud(fullResPixel: vec2i) -> vec4f {
  let blockBase = (fullResPixel / 2) * 2;
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;
  return sampleCloudPositionAtPixel(renderedPixel);
}

/**
 * Sample color from neighbors for spatial interpolation using history buffer.
 * Only used when we have valid history data.
 */
fn spatialInterpolationColorFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  // Sample 4 neighbors from history
  let c0 = textureSample(reprojectedHistoryTexture, reprojectedHistorySampler, uv + vec2f(-texelSize.x, 0.0));
  let c1 = textureSample(reprojectedHistoryTexture, reprojectedHistorySampler, uv + vec2f(texelSize.x, 0.0));
  let c2 = textureSample(reprojectedHistoryTexture, reprojectedHistorySampler, uv + vec2f(0.0, -texelSize.y));
  let c3 = textureSample(reprojectedHistoryTexture, reprojectedHistorySampler, uv + vec2f(0.0, texelSize.y));

  // Average valid neighbors
  var sum = vec4f(0.0);
  var count: f32 = 0.0;

  if (c0.a > 0.001) { sum += c0; count += 1.0; }
  if (c1.a > 0.001) { sum += c1; count += 1.0; }
  if (c2.a > 0.001) { sum += c2; count += 1.0; }
  if (c3.a > 0.001) { sum += c3; count += 1.0; }

  if (count > 0.0) {
    return sum / count;
  }
  return vec4f(0.0);
}

/**
 * Sample position from neighbors for spatial interpolation using history buffer.
 */
fn spatialInterpolationPositionFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let p0 = textureSample(reprojectedPositionHistoryTexture, reprojectedPositionHistorySampler, uv + vec2f(-texelSize.x, 0.0));
  let p1 = textureSample(reprojectedPositionHistoryTexture, reprojectedPositionHistorySampler, uv + vec2f(texelSize.x, 0.0));
  let p2 = textureSample(reprojectedPositionHistoryTexture, reprojectedPositionHistorySampler, uv + vec2f(0.0, -texelSize.y));
  let p3 = textureSample(reprojectedPositionHistoryTexture, reprojectedPositionHistorySampler, uv + vec2f(0.0, texelSize.y));

  // Average valid neighbors (w > 0 indicates valid position)
  var sum = vec4f(0.0);
  var count: f32 = 0.0;

  if (p0.w > 0.001) { sum += p0; count += 1.0; }
  if (p1.w > 0.001) { sum += p1; count += 1.0; }
  if (p2.w > 0.001) { sum += p2; count += 1.0; }
  if (p3.w > 0.001) { sum += p3; count += 1.0; }

  if (count > 0.0) {
    return sum / count;
  }
  return vec4f(0.0);
}

struct NeighborhoodBounds {
  minBound: vec4f,
  maxBound: vec4f,
}

/**
 * NEIGHBORHOOD CLAMPING - Critical for preventing ghosting and smearing artifacts.
 *
 * Samples a 3x3 neighborhood from the quarter-res cloud buffer and computes
 * min/max bounds. History colors outside these bounds are clamped.
 */
fn computeNeighborhoodBounds(centerPixel: vec2i) -> NeighborhoodBounds {
  var minBound = vec4f(1e10);
  var maxBound = vec4f(-1e10);

  // Sample 3x3 neighborhood at 2-pixel stride
  for (var dy: i32 = -1; dy <= 1; dy++) {
    for (var dx: i32 = -1; dx <= 1; dx++) {
      // Sample neighboring 2x2 blocks in full-res space
      var samplePixel = centerPixel + vec2i(dx, dy) * 2;

      // Clamp to valid range
      samplePixel = clamp(samplePixel, vec2i(0), vec2i(uniforms.accumulationResolution) - 1);

      let neighborColor = sampleCloudColorAtPixel(samplePixel);

      // Only include valid samples in bounds
      if (neighborColor.a > 0.001) {
        minBound = min(minBound, neighborColor);
        maxBound = max(maxBound, neighborColor);
      }
    }
  }

  // If no valid samples found, use defaults that won't clamp
  if (minBound.a > 1e9) {
    minBound = vec4f(0.0);
    maxBound = vec4f(1.0);
  }

  return NeighborhoodBounds(minBound, maxBound);
}

/**
 * Clamp a color to neighborhood bounds.
 */
fn clampToNeighborhood(color: vec4f, minBound: vec4f, maxBound: vec4f) -> vec4f {
  return clamp(color, minBound, maxBound);
}

@fragment
fn main(@location(0) uv: vec2f) -> FragmentOutput {
  // Use integer math to avoid floating-point precision issues
  let pixelCoordInt = vec2i(floor(uv * uniforms.accumulationResolution));

  // Determine which pixel in the 2x2 block this is (0 or 1 for each axis)
  let blockPosInt = pixelCoordInt % 2;

  // Convert Bayer offset to integer for reliable comparison
  let bayerOffsetInt = vec2i(uniforms.bayerOffset);

  // Check if this pixel was rendered this frame
  let renderedThisFrame = (blockPosInt.x == bayerOffsetInt.x && blockPosInt.y == bayerOffsetInt.y);

  var newColor = vec4f(0.0);
  var newPosition = vec4f(0.0);
  var historyColor = vec4f(0.0);
  var historyPosition = vec4f(0.0);
  var validity: f32 = 0.0;

  // Get the new rendered color and position (for pixels rendered this frame)
  if (renderedThisFrame) {
    newColor = sampleCloudColorAtPixel(pixelCoordInt);
    newPosition = sampleCloudPositionAtPixel(pixelCoordInt);
  }

  // Get reprojected history (only if we have valid history)
  if (uniforms.hasValidHistory != 0u) {
    historyColor = textureSample(reprojectedHistoryTexture, reprojectedHistorySampler, uv);
    historyPosition = textureSample(reprojectedPositionHistoryTexture, reprojectedPositionHistorySampler, uv);
    validity = textureSample(validityMaskTexture, validityMaskSampler, uv).r;
  }

  // Combine new and history based on what's available
  var finalColor: vec4f;
  var finalPosition: vec4f;

  // NEIGHBORHOOD CLAMPING: Compute bounds from current frame's quarter-res data
  let bounds = computeNeighborhoodBounds(pixelCoordInt);

  // Clamp history to neighborhood bounds BEFORE any blending
  let clampedHistoryColor = clampToNeighborhood(historyColor, bounds.minBound, bounds.maxBound);

  if (renderedThisFrame) {
    // This pixel was freshly rendered
    if (uniforms.hasValidHistory != 0u && validity > 0.5 && historyColor.a > 0.001) {
      // Blend with CLAMPED history for temporal stability without ghosting
      let blendWeight = uniforms.historyWeight * validity * FRESH_PIXEL_HISTORY_REDUCTION;
      finalColor = mix(newColor, clampedHistoryColor, blendWeight);
      finalPosition = mix(newPosition, historyPosition, blendWeight);

      // Preserve alpha=1.0 for SOLID objects
      if (newColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      // No valid history - use new data directly
      finalColor = newColor;
      finalPosition = newPosition;
    }
  } else {
    // This pixel was NOT rendered this frame
    if (uniforms.hasValidHistory != 0u && validity > 0.5 && historyColor.a > 0.001) {
      // Use CLAMPED reprojected history
      finalColor = clampedHistoryColor;
      finalPosition = historyPosition;

      // Preserve alpha=1.0 for SOLID objects from history
      if (historyColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else if (uniforms.hasValidHistory != 0u && historyColor.a > 0.001) {
      // History exists but validity is low - blend with spatial interpolation
      let spatialColor = spatialInterpolationColorFromHistory(uv);
      let spatialPosition = spatialInterpolationPositionFromHistory(uv);
      let clampedSpatial = clampToNeighborhood(spatialColor, bounds.minBound, bounds.maxBound);
      finalColor = mix(clampedSpatial, clampedHistoryColor, validity);
      finalPosition = mix(spatialPosition, historyPosition, validity);

      // Preserve alpha for SOLID objects
      if (historyColor.a >= 0.99 || spatialColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      // No valid history at all - use spatial interpolation from quarter-res cloud buffer
      finalColor = spatialInterpolationColorFromCloud(pixelCoordInt);
      finalPosition = spatialInterpolationPositionFromCloud(pixelCoordInt);
    }
  }

  // Clamp to valid range
  finalColor = max(finalColor, vec4f(0.0));
  finalPosition.w = max(finalPosition.w, 0.0);

  var output: FragmentOutput;
  output.color = finalColor;
  output.position = finalPosition;
  return output;
}
`
