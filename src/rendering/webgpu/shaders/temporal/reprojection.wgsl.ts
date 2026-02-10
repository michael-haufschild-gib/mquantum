/**
 * WGSL Temporal Reprojection Shader
 *
 * Reprojects the previous frame's accumulation buffer to the current frame
 * using motion vectors derived from world position and camera matrices.
 *
 * Part of the Horizon-style 3-pass temporal accumulation system:
 * 1. Quarter-res render (with Bayer jitter)
 * 2. Reprojection (this pass) - reproject history using motion vectors
 * 3. Reconstruction - blend with neighborhood clamping
 *
 * @module rendering/webgpu/shaders/temporal/reprojection.wgsl
 */

export const temporalReprojectionShader = /* wgsl */ `
// ============================================
// Temporal Reprojection Pass
// ============================================

struct TemporalUniforms {
  prevViewProjection: mat4x4f,     // Previous frame view-projection (offset 0)
  inverseViewProjection: mat4x4f, // Current inverse view-projection (offset 64)
  bayerOffset: vec2f,              // Current Bayer offset (offset 128)
  fullResolution: vec2f,           // Full resolution (offset 136)
  historyWeight: f32,              // Blend weight (offset 144)
  frameIndex: u32,                 // Current frame (offset 148)
  _padding: vec2f,                 // Padding to 16-byte alignment (offset 152)
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Bind group 0: Uniforms
@group(0) @binding(0) var<uniform> temporal: TemporalUniforms;

// Bind group 1: Textures
@group(1) @binding(0) var prevAccumulation: texture_2d<f32>;
@group(1) @binding(1) var quarterPosition: texture_2d<f32>;
@group(1) @binding(2) var linearSampler: sampler;

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let fullDims = vec2i(temporal.fullResolution);
  let fullCoord = clamp(vec2i(uv * temporal.fullResolution), vec2i(0), fullDims - vec2i(1));

  // Quarter-res coordinate (current frame's position data)
  let quarterDims = vec2i(textureDimensions(quarterPosition));
  let quarterCoord = clamp(fullCoord / 2, vec2i(0), quarterDims - vec2i(1));

  // Sample world position from quarter-res buffer (stored in xyz, depth in w)
  let positionData = textureLoad(quarterPosition, quarterCoord, 0);
  let worldPos = positionData.xyz;
  let depth = positionData.w;

  // Reproject world position to previous frame's UV
  // Compute this BEFORE any early returns so we can sample history uniformly
  let prevClip = temporal.prevViewProjection * vec4f(worldPos, 1.0);
  let prevNDC = prevClip.xyz / max(prevClip.w, 0.0001);
  // NDC → UV: X is direct, Y must be flipped because NDC.y=+1 is screen top
  // but UV.y=0 is texture top (WebGPU framebuffer convention)
  let prevUV = vec2f(prevNDC.x, -prevNDC.y) * 0.5 + 0.5;

  // CRITICAL: textureSample must be called from UNIFORM control flow
  // Sample history BEFORE any per-pixel conditional branches
  let clampedUV = clamp(prevUV, vec2f(0.0), vec2f(1.0));
  let history = textureSample(prevAccumulation, linearSampler, clampedUV);

  // Now we can do per-pixel early returns and validity checks
  // Check for valid hit (depth > 0 indicates valid position)
  if (depth <= 0.0) {
    // No hit at this pixel - return invalid marker
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Validity checks
  var valid = true;

  // Off-screen rejection with small margin
  let margin = 0.01;
  if (prevUV.x < -margin || prevUV.x > 1.0 + margin ||
      prevUV.y < -margin || prevUV.y > 1.0 + margin) {
    valid = false;
  }

  // Screen edge fade (reject pixels near edges)
  let edgeDistance = min(
    min(prevUV.x, 1.0 - prevUV.x),
    min(prevUV.y, 1.0 - prevUV.y)
  );
  let edgeFade = smoothstep(0.0, 0.03, edgeDistance);

  // Depth discontinuity check using position neighbors
  // This helps detect disocclusion
  let topLeftCoord = clamp(quarterCoord + vec2i(-1, 1), vec2i(0), quarterDims - vec2i(1));
  let bottomRightCoord = clamp(quarterCoord + vec2i(1, -1), vec2i(0), quarterDims - vec2i(1));
  let topLeftDepth = textureLoad(quarterPosition, topLeftCoord, 0).w;
  let bottomRightDepth = textureLoad(quarterPosition, bottomRightCoord, 0).w;

  let avgDepth = (depth + topLeftDepth + bottomRightDepth) / 3.0;
  let maxDepthDiff = max(
    abs(depth - topLeftDepth),
    abs(depth - bottomRightDepth)
  );

  // Reject on depth discontinuity (20% relative threshold)
  let depthThreshold = max(0.2 * avgDepth, 0.05);
  if (maxDepthDiff > depthThreshold) {
    valid = false;
  }

  // Motion-based rejection
  let motion = length((prevUV - uv) * temporal.fullResolution);
  let motionFade = 1.0 - smoothstep(2.0, 8.0, motion);

  // Calculate validity based on all checks
  let validity = select(0.0, edgeFade * motionFade, valid);

  // Output: RGB = reprojected color, A = validity (0 = invalid, 1 = fully valid)
  return vec4f(history.rgb, validity);
}
`
