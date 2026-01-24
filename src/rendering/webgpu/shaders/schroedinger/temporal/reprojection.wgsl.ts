/**
 * WGSL Reprojection shader for temporal cloud accumulation
 *
 * Takes the previous frame's accumulated cloud color and reprojects it
 * to the current camera view. Outputs reprojected color and validity mask.
 *
 * Port of GLSL schroedinger/temporal/reprojection.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporal/reprojection.wgsl
 */

export const reprojectionVertexShader = /* wgsl */ `
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

export const reprojectionFragmentShader = /* wgsl */ `
struct ReprojectionUniforms {
  prevViewProjectionMatrix: mat4x4f, // Previous frame's VP matrix
  viewProjectionMatrix: mat4x4f,     // Current frame's VP matrix
  cameraPosition: vec3f,             // Current camera position
  _pad0: f32,
  accumulationResolution: vec2f,     // Resolution of accumulation buffer
  disocclusionThreshold: f32,        // Threshold for alpha discontinuity
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: ReprojectionUniforms;

// Previous frame's accumulated cloud color
@group(0) @binding(1) var prevAccumulationTexture: texture_2d<f32>;
@group(0) @binding(2) var prevAccumulationSampler: sampler;

// Previous frame's accumulated world positions (xyz = world pos, w = alpha weight)
@group(0) @binding(3) var prevPositionBufferTexture: texture_2d<f32>;
@group(0) @binding(4) var prevPositionBufferSampler: sampler;

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) validity: vec4f,
}

// Motion-based rejection thresholds
const MOTION_THRESHOLD_MIN: f32 = 2.0;  // Start reducing validity
const MOTION_THRESHOLD_MAX: f32 = 8.0;  // Fully invalid

// Position discontinuity threshold (in world units)
const POS_DISCONTINUITY_THRESHOLD: f32 = 0.3;

@fragment
fn main(@location(0) uv: vec2f) -> FragmentOutput {
  /**
   * CORRECT REPROJECTION FOR VOLUMETRIC TEMPORAL ACCUMULATION
   *
   * The goal: For each OUTPUT pixel at uv, find where to sample HISTORY from.
   *
   * The key insight is that the previous frame stored a world position at each
   * screen location. When the camera moves, that world position now appears at
   * a DIFFERENT screen location. We need to:
   *
   * 1. Get the world position that was stored at uv in the PREVIOUS accumulation
   * 2. Project it using the CURRENT VP matrix to find where it appears NOW
   * 3. If currentUV != uv, the content has "moved" on screen
   *
   * But we're doing a GATHER operation (reading from history, writing to current).
   * So we need to INVERT this: for current pixel at uv, find where to read FROM.
   */

  // Sample previous frame's data at this screen location
  let prevColor = textureSample(prevAccumulationTexture, prevAccumulationSampler, uv);
  let prevPosition = textureSample(prevPositionBufferTexture, prevPositionBufferSampler, uv);

  var output: FragmentOutput;

  // Early out if no valid history at this location
  if (prevColor.a < 0.001 || prevPosition.w < 0.001) {
    output.color = vec4f(0.0);
    output.validity = vec4f(0.0);
    return output;
  }

  let worldPos = prevPosition.xyz;

  // Project this world position to CURRENT frame to see where it went
  let currentClip = uniforms.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Guard against division by zero in perspective divide while preserving sign
  var safeW: f32;
  if (abs(currentClip.w) < 0.0001) {
    if (currentClip.w >= 0.0) {
      safeW = 0.0001;
    } else {
      safeW = -0.0001;
    }
  } else {
    safeW = currentClip.w;
  }
  let currentUV = (currentClip.xy / safeW) * 0.5 + 0.5;

  // Compute how far the content has "moved" on screen
  let screenMotion = currentUV - uv;
  let motionMagnitude = length(screenMotion * uniforms.accumulationResolution); // In pixels

  // Start with full validity
  var validity: f32 = 1.0;

  // MOTION-BASED REJECTION:
  // If the world position that WAS at uv has moved significantly on screen,
  // the history at uv is no longer valid for the current frame's uv.
  if (motionMagnitude > MOTION_THRESHOLD_MIN) {
    let motionFactor = 1.0 - smoothstep(MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX, motionMagnitude);
    validity *= motionFactor;
  }

  // OFF-SCREEN REJECTION:
  // If the content moved completely off-screen, it's definitely invalid
  if (currentUV.x < -0.1 || currentUV.x > 1.1 || currentUV.y < -0.1 || currentUV.y > 1.1) {
    validity = 0.0;
  }

  // EDGE DETECTION:
  // Check for depth/position discontinuities in the neighborhood
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let posL = textureSample(prevPositionBufferTexture, prevPositionBufferSampler, uv - vec2f(texelSize.x, 0.0));
  let posR = textureSample(prevPositionBufferTexture, prevPositionBufferSampler, uv + vec2f(texelSize.x, 0.0));
  let posU = textureSample(prevPositionBufferTexture, prevPositionBufferSampler, uv + vec2f(0.0, texelSize.y));
  let posD = textureSample(prevPositionBufferTexture, prevPositionBufferSampler, uv - vec2f(0.0, texelSize.y));

  // Large position differences indicate object edges - reduce validity there
  let maxPosDiff = max(
    max(length(worldPos - posL.xyz), length(worldPos - posR.xyz)),
    max(length(worldPos - posU.xyz), length(worldPos - posD.xyz))
  );

  if (maxPosDiff > POS_DISCONTINUITY_THRESHOLD) {
    validity *= 0.5; // Reduce but don't eliminate
  }

  // ALPHA DISCONTINUITY:
  // Check for sudden alpha changes (object boundary)
  let colorL = textureSample(prevAccumulationTexture, prevAccumulationSampler, uv - vec2f(texelSize.x, 0.0));
  let colorR = textureSample(prevAccumulationTexture, prevAccumulationSampler, uv + vec2f(texelSize.x, 0.0));
  let colorU = textureSample(prevAccumulationTexture, prevAccumulationSampler, uv + vec2f(0.0, texelSize.y));
  let colorD = textureSample(prevAccumulationTexture, prevAccumulationSampler, uv - vec2f(0.0, texelSize.y));

  let maxAlphaDiff = max(
    max(abs(prevColor.a - colorL.a), abs(prevColor.a - colorR.a)),
    max(abs(prevColor.a - colorU.a), abs(prevColor.a - colorD.a))
  );

  if (maxAlphaDiff > uniforms.disocclusionThreshold) {
    validity *= 0.5;
  }

  // SCREEN EDGE REJECTION:
  // Reduce validity near screen edges where content may be entering/leaving
  let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  if (edgeDist < 0.03) {
    validity *= edgeDist / 0.03;
  }

  output.color = prevColor;
  output.validity = vec4f(validity, 0.0, 0.0, 1.0);
  return output;
}
`
