/**
 * WGSL Normal Calculation Block
 *
 * Surface normal estimation using finite differences on SDFs.
 * Port of GLSL normal.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/raymarch/normal.wgsl
 */

export const normalBlock = /* wgsl */ `
// ============================================
// Normal Calculation
// ============================================

/**
 * Calculate surface normal using central differences.
 * Standard approach with 6 SDF evaluations.
 *
 * @param p Surface position
 * @param eps Epsilon for finite difference
 * @return Surface normal (normalized)
 */
fn calcNormal(p: vec3f, eps: f32) -> vec3f {
  let e = vec2f(eps, 0.0);
  let n = vec3f(
    GetDist(p + e.xyy) - GetDist(p - e.xyy),
    GetDist(p + e.yxy) - GetDist(p - e.yxy),
    GetDist(p + e.yyx) - GetDist(p - e.yyx)
  );
  return normalize(n);
}

/**
 * Calculate normal with default epsilon.
 */
fn calcNormalDefault(p: vec3f) -> vec3f {
  return calcNormal(p, EPS_NORMAL);
}

/**
 * Calculate normal using tetrahedron technique.
 * More accurate for sharp features with only 4 SDF evaluations.
 *
 * @param p Surface position
 * @param eps Epsilon for finite difference
 * @return Surface normal (normalized)
 */
fn calcNormalTetrahedron(p: vec3f, eps: f32) -> vec3f {
  // Tetrahedron vertices
  let k = vec2f(1.0, -1.0);
  return normalize(
    k.xyy * GetDist(p + k.xyy * eps) +
    k.yyx * GetDist(p + k.yyx * eps) +
    k.yxy * GetDist(p + k.yxy * eps) +
    k.xxx * GetDist(p + k.xxx * eps)
  );
}

/**
 * Calculate normal with quality-based epsilon.
 * Larger epsilon for distant surfaces, smaller for close-ups.
 *
 * @param p Surface position
 * @param dist Distance from camera
 * @return Surface normal (normalized)
 */
fn calcNormalAdaptive(p: vec3f, dist: f32) -> vec3f {
  // Scale epsilon with distance for consistent quality
  let eps = max(EPS_NORMAL, dist * 0.0001);
  return calcNormal(p, eps);
}

/**
 * Calculate normal with smoothing for noisy SDFs.
 * Averages multiple samples for smoother results.
 *
 * @param p Surface position
 * @param eps Base epsilon
 * @param smoothing Additional smoothing radius
 * @return Smoothed surface normal (normalized)
 */
fn calcNormalSmooth(p: vec3f, eps: f32, smoothing: f32) -> vec3f {
  var n = vec3f(0.0);

  // Sample multiple offsets
  let offsets = array<vec3f, 4>(
    vec3f(1.0, 0.0, 0.0),
    vec3f(0.0, 1.0, 0.0),
    vec3f(0.0, 0.0, 1.0),
    vec3f(0.577, 0.577, 0.577)  // Diagonal
  );

  for (var i = 0; i < 4; i++) {
    let o = offsets[i];
    let d = GetDist(p + o * eps) - GetDist(p - o * eps);
    n += o * d;
  }

  return normalize(n);
}

/**
 * Calculate bent normal for ambient occlusion.
 * Approximates the average unoccluded direction.
 *
 * @param p Surface position
 * @param n Surface normal
 * @param radius AO sampling radius
 * @param samples Number of samples
 * @return Bent normal direction
 */
fn calcBentNormal(p: vec3f, n: vec3f, radius: f32, samples: i32) -> vec3f {
  var bentNormal = n;
  var weight: f32 = 1.0;

  // Sample hemisphere
  let goldenAngle = PI * (3.0 - sqrt(5.0));

  for (var i = 0; i < samples; i++) {
    let t = f32(i) / f32(samples);
    let theta = goldenAngle * f32(i);
    let phi = acos(1.0 - t);

    // Hemisphere sample direction
    let sampleDir = vec3f(
      sin(phi) * cos(theta),
      sin(phi) * sin(theta),
      cos(phi)
    );

    // Align with normal
    let tangent = normalize(cross(n, vec3f(0.0, 1.0, 0.0001)));
    let bitangent = cross(n, tangent);
    let worldDir = tangent * sampleDir.x + bitangent * sampleDir.y + n * sampleDir.z;

    // Check occlusion
    let samplePos = p + worldDir * radius;
    let d = GetDist(samplePos);
    let occlusion = smoothstep(0.0, radius, d);

    bentNormal += worldDir * occlusion;
    weight += 1.0;
  }

  return normalize(bentNormal / weight);
}
`
