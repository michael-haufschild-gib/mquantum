/**
 * WGSL shaders for the Temporal Cloud Pass.
 *
 * Contains reprojection and reconstruction fragment shaders plus
 * the fullscreen vertex shader used by both sub-passes.
 *
 * @module rendering/webgpu/shaders/temporal/temporalCloudShaders
 */

/** Bayer pattern offsets for 4-frame cycle. */
export const BAYER_OFFSETS: [number, number][] = [
  [0.0, 0.0],
  [1.0, 1.0],
  [1.0, 0.0],
  [0.0, 1.0],
]

/**
 * Reprojection Fragment Shader.
 *
 * Takes previous frame's accumulated data and reprojects it to current view.
 * Outputs reprojected color and validity mask.
 */
export const REPROJECTION_SHADER = /* wgsl */ `
struct Uniforms {
  prevViewProjectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  cameraPosition: vec3f,
  _pad0: f32,
  accumulationResolution: vec2f,
  disocclusionThreshold: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tPrevAccumulation: texture_2d<f32>;
@group(0) @binding(3) var tPrevPositionBuffer: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) validity: vec4f,
}

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.uv;

  // Sample previous frame's data at this screen location
  let prevColor = textureSample(tPrevAccumulation, texSampler, uv);
  let prevPosition = textureSample(tPrevPositionBuffer, texSampler, uv);

  // Early out if no valid history at this location
  if (prevColor.a < 0.001 || prevPosition.w < 0.001) {
    output.color = vec4f(0.0);
    output.validity = vec4f(0.0);
    return output;
  }

  let worldPos = prevPosition.xyz;

  // Project this world position to CURRENT frame to see where it went
  let currentClip = uniforms.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Guard against division by zero in perspective divide
  var safeW = currentClip.w;
  if (abs(safeW) < 0.0001) {
    safeW = select(-0.0001, 0.0001, safeW >= 0.0);
  }

  let currentUV = (currentClip.xy / safeW) * 0.5 + 0.5;

  // Compute how far the content has "moved" on screen
  let screenMotion = currentUV - uv;
  let motionMagnitude = length(screenMotion * uniforms.accumulationResolution);

  // Start with full validity
  var validity: f32 = 1.0;

  // MOTION-BASED REJECTION
  let MOTION_THRESHOLD_MIN: f32 = 2.0;
  let MOTION_THRESHOLD_MAX: f32 = 8.0;

  if (motionMagnitude > MOTION_THRESHOLD_MIN) {
    let motionFactor = 1.0 - smoothstep(MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX, motionMagnitude);
    validity *= motionFactor;
  }

  // OFF-SCREEN REJECTION
  if (currentUV.x < -0.1 || currentUV.x > 1.1 || currentUV.y < -0.1 || currentUV.y > 1.1) {
    validity = 0.0;
  }

  // EDGE DETECTION - check for position discontinuities
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let posL = textureSample(tPrevPositionBuffer, texSampler, uv - vec2f(texelSize.x, 0.0));
  let posR = textureSample(tPrevPositionBuffer, texSampler, uv + vec2f(texelSize.x, 0.0));
  let posU = textureSample(tPrevPositionBuffer, texSampler, uv + vec2f(0.0, texelSize.y));
  let posD = textureSample(tPrevPositionBuffer, texSampler, uv - vec2f(0.0, texelSize.y));

  let maxPosDiff = max(
    max(length(worldPos - posL.xyz), length(worldPos - posR.xyz)),
    max(length(worldPos - posU.xyz), length(worldPos - posD.xyz))
  );

  let POS_DISCONTINUITY_THRESHOLD: f32 = 0.3;
  if (maxPosDiff > POS_DISCONTINUITY_THRESHOLD) {
    validity *= 0.5;
  }

  // ALPHA DISCONTINUITY
  let colorL = textureSample(tPrevAccumulation, texSampler, uv - vec2f(texelSize.x, 0.0));
  let colorR = textureSample(tPrevAccumulation, texSampler, uv + vec2f(texelSize.x, 0.0));
  let colorU = textureSample(tPrevAccumulation, texSampler, uv + vec2f(0.0, texelSize.y));
  let colorD = textureSample(tPrevAccumulation, texSampler, uv - vec2f(0.0, texelSize.y));

  let maxAlphaDiff = max(
    max(abs(prevColor.a - colorL.a), abs(prevColor.a - colorR.a)),
    max(abs(prevColor.a - colorU.a), abs(prevColor.a - colorD.a))
  );

  if (maxAlphaDiff > uniforms.disocclusionThreshold) {
    validity *= 0.5;
  }

  // SCREEN EDGE REJECTION
  let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  if (edgeDist < 0.03) {
    validity *= edgeDist / 0.03;
  }

  output.color = prevColor;
  output.validity = vec4f(validity, 0.0, 0.0, 1.0);
  return output;
}
`

/**
 * Reconstruction Fragment Shader.
 *
 * Combines freshly rendered quarter-res pixels with reprojected history
 * to produce full-resolution accumulated cloud image.
 */
export const RECONSTRUCTION_SHADER = /* wgsl */ `
struct Uniforms {
  bayerOffset: vec2f,
  frameIndex: i32,
  hasValidHistory: i32,
  cloudResolution: vec2f,
  accumulationResolution: vec2f,
  historyWeight: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tCloudRender: texture_2d<f32>;
@group(0) @binding(3) var tCloudPosition: texture_2d<f32>;
@group(0) @binding(4) var tReprojectedHistory: texture_2d<f32>;
@group(0) @binding(5) var tReprojectedPositionHistory: texture_2d<f32>;
@group(0) @binding(6) var tValidityMask: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) position: vec4f,
}

// Sample color from quarter-res cloud buffer for a given full-res pixel coordinate
fn sampleCloudColorAtPixel(fullResPixel: vec2i) -> vec4f {
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(tCloudRender, texSampler, quarterUV);
}

// Sample position from quarter-res cloud buffer
fn sampleCloudPositionAtPixel(fullResPixel: vec2i) -> vec4f {
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(tCloudPosition, texSampler, quarterUV);
}

// Spatial interpolation from quarter-res cloud buffer (no history)
fn spatialInterpolationColorFromCloud(fullResPixel: vec2i) -> vec4f {
  let blockBase = (fullResPixel / 2) * 2;
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;
  return sampleCloudColorAtPixel(renderedPixel);
}

fn spatialInterpolationPositionFromCloud(fullResPixel: vec2i) -> vec4f {
  let blockBase = (fullResPixel / 2) * 2;
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;
  return sampleCloudPositionAtPixel(renderedPixel);
}

// Spatial interpolation from history buffer
fn spatialInterpolationColorFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let c0 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(-texelSize.x, 0.0));
  let c1 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(texelSize.x, 0.0));
  let c2 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(0.0, -texelSize.y));
  let c3 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(0.0, texelSize.y));

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

fn spatialInterpolationPositionFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let p0 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(-texelSize.x, 0.0));
  let p1 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(texelSize.x, 0.0));
  let p2 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(0.0, -texelSize.y));
  let p3 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(0.0, texelSize.y));

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

// Neighborhood clamping - critical for preventing ghosting
fn computeNeighborhoodBounds(centerPixel: vec2i) -> array<vec4f, 2> {
  var minBound = vec4f(1e10);
  var maxBound = vec4f(-1e10);

  for (var dy: i32 = -1; dy <= 1; dy++) {
    for (var dx: i32 = -1; dx <= 1; dx++) {
      var samplePixel = centerPixel + vec2i(dx, dy) * 2;
      samplePixel = clamp(samplePixel, vec2i(0), vec2i(uniforms.accumulationResolution) - 1);

      let neighborColor = sampleCloudColorAtPixel(samplePixel);

      if (neighborColor.a > 0.001) {
        minBound = min(minBound, neighborColor);
        maxBound = max(maxBound, neighborColor);
      }
    }
  }

  if (minBound.a > 1e9) {
    minBound = vec4f(0.0);
    maxBound = vec4f(1.0);
  }

  return array<vec4f, 2>(minBound, maxBound);
}

fn clampToNeighborhood(color: vec4f, minBound: vec4f, maxBound: vec4f) -> vec4f {
  return clamp(color, minBound, maxBound);
}

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.uv;

  let pixelCoordInt = vec2i(floor(uv * uniforms.accumulationResolution));
  let blockPosInt = pixelCoordInt % 2;
  let bayerOffsetInt = vec2i(uniforms.bayerOffset);

  let renderedThisFrame = (blockPosInt.x == bayerOffsetInt.x && blockPosInt.y == bayerOffsetInt.y);

  var newColor = vec4f(0.0);
  var newPosition = vec4f(0.0);
  var historyColor = vec4f(0.0);
  var historyPosition = vec4f(0.0);
  var validity: f32 = 0.0;

  // Get new rendered color/position for pixels rendered this frame
  if (renderedThisFrame) {
    newColor = sampleCloudColorAtPixel(pixelCoordInt);
    newPosition = sampleCloudPositionAtPixel(pixelCoordInt);
  }

  // Get reprojected history if available
  if (uniforms.hasValidHistory != 0) {
    historyColor = textureSample(tReprojectedHistory, texSampler, uv);
    historyPosition = textureSample(tReprojectedPositionHistory, texSampler, uv);
    validity = textureSample(tValidityMask, texSampler, uv).r;
  }

  var finalColor: vec4f;
  var finalPosition: vec4f;

  let FRESH_PIXEL_HISTORY_REDUCTION: f32 = 0.5;

  // Neighborhood clamping
  let bounds = computeNeighborhoodBounds(pixelCoordInt);
  let neighborMin = bounds[0];
  let neighborMax = bounds[1];

  let clampedHistoryColor = clampToNeighborhood(historyColor, neighborMin, neighborMax);

  if (renderedThisFrame) {
    if (uniforms.hasValidHistory != 0 && validity > 0.5 && historyColor.a > 0.001) {
      let blendWeight = uniforms.historyWeight * validity * FRESH_PIXEL_HISTORY_REDUCTION;
      finalColor = mix(newColor, clampedHistoryColor, blendWeight);
      finalPosition = mix(newPosition, historyPosition, blendWeight);

      if (newColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      finalColor = newColor;
      finalPosition = newPosition;
    }
  } else {
    if (uniforms.hasValidHistory != 0 && validity > 0.5 && historyColor.a > 0.001) {
      finalColor = clampedHistoryColor;
      finalPosition = historyPosition;

      if (historyColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else if (uniforms.hasValidHistory != 0 && historyColor.a > 0.001) {
      let spatialColor = spatialInterpolationColorFromHistory(uv);
      let spatialPosition = spatialInterpolationPositionFromHistory(uv);
      let clampedSpatial = clampToNeighborhood(spatialColor, neighborMin, neighborMax);
      finalColor = mix(clampedSpatial, clampedHistoryColor, validity);
      finalPosition = mix(spatialPosition, historyPosition, validity);

      if (historyColor.a >= 0.99 || spatialColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      finalColor = spatialInterpolationColorFromCloud(pixelCoordInt);
      finalPosition = spatialInterpolationPositionFromCloud(pixelCoordInt);
    }
  }

  finalColor = max(finalColor, vec4f(0.0));
  finalPosition.w = max(finalPosition.w, 0.0);

  output.color = finalColor;
  output.position = finalPosition;
  return output;
}
`

/**
 * Standard fullscreen vertex shader.
 */
export const FULLSCREEN_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(
  @location(0) position: vec2f,
  @location(1) uv: vec2f
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}
`
