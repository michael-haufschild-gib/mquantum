/**
 * WGSL Temporal Reprojection Block
 *
 * Temporal reprojection and accumulation for smooth rendering.
 * Used for noise reduction and temporal anti-aliasing.
 * Port of GLSL temporal.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/features/temporal.wgsl
 */

export const temporalBlock = /* wgsl */ `
// ============================================
// Temporal Reprojection
// ============================================

// Note: For raymarching temporal skip optimization, use getTemporalDepth()
// which requires:
// - prevPositionTexture: texture_2d<f32> bound to previous frame's position buffer
// - prevPositionSampler: sampler for the texture
// - temporalEnabled: bool uniform
// - temporalSafetyMargin: f32 uniform (typically 0.95)
// - depthBufferResolution: vec2f uniform

/**
 * Get temporal depth hint for raymarching acceleration.
 * Uses previous frame's position buffer to skip known empty space.
 *
 * Returns model-space ray distance, or -1.0 if invalid/unavailable.
 * Apply temporalSafetyMargin before using as skip distance.
 *
 * Note: Uses textureSampleLevel instead of textureSample to avoid
 * WGSL uniform control flow restrictions.
 */
fn getTemporalDepth(
  ro: vec3f,
  rd: vec3f,
  fragCoord: vec2f,
  depthBufferResolution: vec2f,
  temporalEnabled: bool,
  prevPositionTexture: texture_2d<f32>,
  prevPositionSampler: sampler
) -> f32 {
  if (!temporalEnabled) {
    return -1.0;
  }

  // Use screen coordinates for sampling the previous frame's MRT
  let screenUV = fragCoord / depthBufferResolution;

  // Sample previous frame's position buffer at current screen position
  // gPosition.xyz = model-space position, gPosition.w = model-space ray distance
  // Use textureSampleLevel with LOD 0 to avoid uniform control flow issues
  let prevPositionData = textureSampleLevel(prevPositionTexture, prevPositionSampler, screenUV, 0.0);

  // Check if we have valid position data (.w > 0 indicates valid hit)
  let storedDist = prevPositionData.w;
  if (storedDist <= 0.01) {
    return -1.0;  // No valid hit in previous frame at this pixel
  }

  // Get the MODEL-SPACE position that was hit at this screen location
  let prevModelPos = prevPositionData.xyz;

  // Calculate distance along CURRENT ray to the previous hit point
  let toHit = prevModelPos - ro;
  let projDistance = dot(toHit, rd);

  // Early rejection: point is behind the camera
  if (projDistance <= 0.0) {
    return -1.0;
  }

  // Validation: Is the previous hit actually ON the current ray?
  let closestOnRay = ro + rd * projDistance;
  let perpDist = length(prevModelPos - closestOnRay);

  // Reject if perpendicular distance is too large (camera rotated too much)
  // Threshold: 5% of distance or 0.1 minimum
  let threshold = max(0.1, projDistance * 0.05);
  if (perpDist > threshold) {
    return -1.0;
  }

  // Disocclusion detection using 2 diagonal samples
  // Use textureSampleLevel to avoid uniform control flow issues
  let texelSize = 1.0 / depthBufferResolution;
  let distTopLeft = textureSampleLevel(prevPositionTexture, prevPositionSampler,
    screenUV + vec2f(-texelSize.x, texelSize.y), 0.0).w;
  let distBottomRight = textureSampleLevel(prevPositionTexture, prevPositionSampler,
    screenUV + vec2f(texelSize.x, -texelSize.y), 0.0).w;

  // Use relative threshold for discontinuity detection
  let avgDist = (distTopLeft + distBottomRight + storedDist) * 0.333;
  let maxNeighborDiff = max(
    abs(storedDist - distTopLeft),
    abs(storedDist - distBottomRight)
  );

  // Threshold: 20% relative difference indicates edge/discontinuity
  let relativeThreshold = max(0.20 * avgDist, 0.05);
  if (maxNeighborDiff > relativeThreshold) {
    return -1.0;  // Depth discontinuity - temporal data unreliable
  }

  // Return the stored distance
  // Safety margin should be applied by caller: dist * temporalSafetyMargin
  return max(0.0, storedDist);
}

/**
 * Temporal reprojection uniforms.
 */
struct TemporalUniforms {
  prevViewProjection: mat4x4f,   // Previous frame's view-projection matrix
  jitterOffset: vec2f,           // Sub-pixel jitter for TAA
  blendFactor: f32,              // Temporal blend factor (0 = new only, 1 = old only)
  motionScale: f32,              // Motion vector scale
  frameIndex: u32,               // Current frame number
  enabled: u32,                  // Whether temporal is enabled
  _padding: vec2f,
}

/**
 * Reproject a world position to previous frame's screen space.
 *
 * @param worldPos Current frame world position
 * @param prevViewProj Previous frame's view-projection matrix
 * @return Previous frame UV coordinates (-1 to 1 if valid, outside if occluded)
 */
fn reprojectPosition(worldPos: vec3f, prevViewProj: mat4x4f) -> vec3f {
  let prevClip = prevViewProj * vec4f(worldPos, 1.0);
  let prevNDC = prevClip.xyz / prevClip.w;
  return vec3f(prevNDC.xy * 0.5 + 0.5, prevNDC.z);
}

/**
 * Calculate motion vector from depth and matrices.
 *
 * @param uv Current frame UV
 * @param depth Current depth value (0-1)
 * @param invViewProj Current inverse view-projection
 * @param prevViewProj Previous view-projection
 * @return Motion vector (screen space delta)
 */
fn calculateMotionVector(
  uv: vec2f,
  depth: f32,
  invViewProj: mat4x4f,
  prevViewProj: mat4x4f
) -> vec2f {
  // Reconstruct world position
  let ndc = vec3f(uv * 2.0 - 1.0, depth * 2.0 - 1.0);
  let worldPos4 = invViewProj * vec4f(ndc, 1.0);
  let worldPos = worldPos4.xyz / worldPos4.w;

  // Reproject to previous frame
  let prevUV = reprojectPosition(worldPos, prevViewProj);

  return uv - prevUV.xy;
}

/**
 * Check if reprojected UV is valid (within screen bounds).
 */
fn isValidReproject(prevUV: vec2f) -> bool {
  return prevUV.x >= 0.0 && prevUV.x <= 1.0 &&
         prevUV.y >= 0.0 && prevUV.y <= 1.0;
}

/**
 * Neighborhood color clamping for ghosting reduction.
 * Clamps the history color to the local color neighborhood.
 *
 * @param historyColor Color from previous frame
 * @param neighborMin Minimum color in 3x3 neighborhood
 * @param neighborMax Maximum color in 3x3 neighborhood
 * @return Clamped history color
 */
fn clampHistory(
  historyColor: vec3f,
  neighborMin: vec3f,
  neighborMax: vec3f
) -> vec3f {
  return clamp(historyColor, neighborMin, neighborMax);
}

/**
 * Variance-based color clamping (better than min/max for HDR).
 *
 * @param historyColor Color from previous frame
 * @param neighborMean Mean color in neighborhood
 * @param neighborStdDev Standard deviation in neighborhood
 * @param gamma Clamp range multiplier (typically 1.0-2.0)
 * @return Clamped history color
 */
fn clampHistoryVariance(
  historyColor: vec3f,
  neighborMean: vec3f,
  neighborStdDev: vec3f,
  gamma: f32
) -> vec3f {
  let minColor = neighborMean - neighborStdDev * gamma;
  let maxColor = neighborMean + neighborStdDev * gamma;
  return clamp(historyColor, minColor, maxColor);
}

/**
 * Calculate adaptive blend factor based on motion.
 * More motion = less history blending (reduces ghosting).
 *
 * @param motionVector Screen-space motion
 * @param baseBlend Base blend factor
 * @param motionScale Motion sensitivity
 * @return Adjusted blend factor
 */
fn adaptiveBlendFactor(motionVector: vec2f, baseBlend: f32, motionScale: f32) -> f32 {
  let motionLength = length(motionVector) * motionScale;
  return max(0.0, baseBlend - motionLength);
}

/**
 * Temporal blend with color clamping.
 *
 * @param currentColor Current frame color
 * @param historyColor Previous frame color
 * @param neighborMin Neighborhood minimum
 * @param neighborMax Neighborhood maximum
 * @param blendFactor Base blend factor
 * @param motionVector Motion from reprojection
 * @return Blended color
 */
fn temporalBlend(
  currentColor: vec3f,
  historyColor: vec3f,
  neighborMin: vec3f,
  neighborMax: vec3f,
  blendFactor: f32,
  motionVector: vec2f
) -> vec3f {
  // Clamp history to neighborhood
  let clampedHistory = clampHistory(historyColor, neighborMin, neighborMax);

  // Adapt blend factor to motion
  let adaptedBlend = adaptiveBlendFactor(motionVector, blendFactor, 10.0);

  // Blend
  return mix(currentColor, clampedHistory, adaptedBlend);
}

/**
 * Generate sub-pixel jitter offset for TAA.
 * Uses Halton sequence for well-distributed samples.
 *
 * @param frameIndex Current frame number
 * @param sampleCount Number of samples in the sequence
 * @return Jitter offset in pixels (-0.5 to 0.5)
 */
fn getJitterOffset(frameIndex: u32, sampleCount: u32) -> vec2f {
  let idx = frameIndex % sampleCount;

  // Halton sequence base 2 and 3
  var jitterX = haltonSequence(idx + 1u, 2u);
  var jitterY = haltonSequence(idx + 1u, 3u);

  // Center around 0
  return vec2f(jitterX - 0.5, jitterY - 0.5);
}

/**
 * Halton sequence generator.
 */
fn haltonSequence(index: u32, base: u32) -> f32 {
  var result: f32 = 0.0;
  var f: f32 = 1.0;
  var i = index;

  while (i > 0u) {
    f /= f32(base);
    result += f * f32(i % base);
    i /= base;
  }

  return result;
}
`
