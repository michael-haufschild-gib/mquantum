/**
 * WGSL Raymarching Core Block
 *
 * Core raymarching functions for SDF rendering.
 * Port of GLSL core.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/raymarch/core.wgsl
 */

export const raymarchCoreBlock = /* wgsl */ `
// ============================================
// Raymarching Core Functions
// ============================================

/**
 * Raymarching result structure.
 */
struct RaymarchResult {
  hit: bool,           // Whether ray hit surface
  position: vec3f,     // Hit position in world space
  distance: f32,       // Total distance traveled
  iterations: f32,     // Number of iterations used
  minDist: f32,        // Minimum distance encountered (for AO/glow)
  orbital: f32,        // Orbital trap value for coloring
}

/**
 * Standard sphere tracing raymarcher.
 *
 * @param ro Ray origin
 * @param rd Ray direction (normalized)
 * @param maxDist Maximum march distance
 * @param minDist Minimum surface distance threshold
 * @param maxSteps Maximum iteration count
 * @return Raymarch result
 */
fn raymarch(
  ro: vec3f,
  rd: vec3f,
  maxDist: f32,
  minDist: f32,
  maxSteps: i32
) -> RaymarchResult {
  var result: RaymarchResult;
  result.hit = false;
  result.position = ro;
  result.distance = 0.0;
  result.iterations = 0.0;
  result.minDist = maxDist;
  result.orbital = 0.0;

  var t: f32 = 0.0;

  for (var i = 0; i < maxSteps; i++) {
    result.iterations = f32(i);
    let pos = ro + rd * t;
    let d = GetDist(pos);

    result.minDist = min(result.minDist, d);

    if (d < minDist) {
      result.hit = true;
      result.position = pos;
      result.distance = t;
      break;
    }

    if (t > maxDist) {
      break;
    }

    t += d;
  }

  if (!result.hit) {
    result.distance = t;
  }

  return result;
}

/**
 * Enhanced raymarcher with orbital trap tracking.
 *
 * @param ro Ray origin
 * @param rd Ray direction
 * @param maxDist Maximum distance
 * @param minDist Surface threshold
 * @param maxSteps Max iterations
 * @return Raymarch result with orbital trap value
 */
fn raymarchWithOrbital(
  ro: vec3f,
  rd: vec3f,
  maxDist: f32,
  minDist: f32,
  maxSteps: i32
) -> RaymarchResult {
  var result: RaymarchResult;
  result.hit = false;
  result.position = ro;
  result.distance = 0.0;
  result.iterations = 0.0;
  result.minDist = maxDist;
  result.orbital = 0.0;

  var t: f32 = 0.0;
  var orbitalAccum: f32 = 0.0;

  for (var i = 0; i < maxSteps; i++) {
    result.iterations = f32(i);
    let pos = ro + rd * t;

    // Get distance and orbital trap
    let distResult = GetDistWithOrbital(pos);
    let d = distResult.x;
    let orbital = distResult.y;

    orbitalAccum += orbital * exp(-t * 0.5);
    result.minDist = min(result.minDist, d);

    if (d < minDist) {
      result.hit = true;
      result.position = pos;
      result.distance = t;
      result.orbital = orbitalAccum / (result.iterations + 1.0);
      break;
    }

    if (t > maxDist) {
      break;
    }

    t += d;
  }

  if (!result.hit) {
    result.distance = t;
    result.orbital = orbitalAccum / max(result.iterations, 1.0);
  }

  return result;
}

/**
 * Relaxed sphere tracing for better performance on complex SDFs.
 * Uses overstepping with backtracking for faster convergence.
 *
 * @param ro Ray origin
 * @param rd Ray direction
 * @param maxDist Maximum distance
 * @param minDist Surface threshold
 * @param maxSteps Max iterations
 * @param relaxation Overstep factor (1.0 = standard, >1.0 = faster but less accurate)
 * @return Raymarch result
 */
fn raymarchRelaxed(
  ro: vec3f,
  rd: vec3f,
  maxDist: f32,
  minDist: f32,
  maxSteps: i32,
  relaxation: f32
) -> RaymarchResult {
  var result: RaymarchResult;
  result.hit = false;
  result.position = ro;
  result.distance = 0.0;
  result.iterations = 0.0;
  result.minDist = maxDist;
  result.orbital = 0.0;

  var t: f32 = 0.0;
  var prevD: f32 = 0.0;

  for (var i = 0; i < maxSteps; i++) {
    result.iterations = f32(i);
    let pos = ro + rd * t;
    let d = GetDist(pos);

    result.minDist = min(result.minDist, d);

    // Check for overstep (relaxation can cause this)
    if (d < 0.0 && relaxation > 1.0) {
      // Backtrack and use smaller step
      t -= prevD * (relaxation - 1.0);
      continue;
    }

    if (d < minDist) {
      result.hit = true;
      result.position = pos;
      result.distance = t;
      break;
    }

    if (t > maxDist) {
      break;
    }

    prevD = d;
    t += d * relaxation;
  }

  if (!result.hit) {
    result.distance = t;
  }

  return result;
}

/**
 * Get ray direction from screen UV and camera.
 *
 * @param uv Normalized screen coordinates (-1 to 1)
 * @param cameraPos Camera position
 * @param cameraTarget Camera look-at target
 * @param fov Field of view in radians
 * @return Ray direction (normalized)
 */
fn getRayDirection(
  uv: vec2f,
  cameraPos: vec3f,
  cameraTarget: vec3f,
  fov: f32
) -> vec3f {
  let forward = normalize(cameraTarget - cameraPos);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), forward));
  let up = cross(forward, right);

  let fovScale = tan(fov * 0.5);
  return normalize(forward + right * uv.x * fovScale + up * uv.y * fovScale);
}

/**
 * Get ray from camera matrices (for Three.js integration).
 *
 * @param uv Normalized screen coordinates (0 to 1)
 * @param inverseProjection Inverse projection matrix
 * @param inverseView Inverse view matrix
 * @return Ray direction in world space (normalized)
 */
fn getRayFromMatrices(
  uv: vec2f,
  inverseProjection: mat4x4f,
  inverseView: mat4x4f
) -> vec3f {
  // Convert to NDC
  let ndc = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);

  // Unproject to view space
  var viewSpace = inverseProjection * ndc;
  viewSpace /= viewSpace.w;

  // Transform to world space
  let worldDir = (inverseView * vec4f(viewSpace.xyz, 0.0)).xyz;

  return normalize(worldDir);
}
`
