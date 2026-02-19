/**
 * Sphere Intersection for Raymarching (WGSL)
 *
 * Provides ray-sphere intersection test used for bounding sphere
 * optimization in raymarching algorithms.
 *
 * Port of GLSL shared/raymarch/sphere-intersect.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/raymarch/sphere-intersect.wgsl
 */

export const sphereIntersectBlock = /* wgsl */ `
// ============================================
// Sphere Intersection
// ============================================

/**
 * Ray-sphere intersection test.
 *
 * Uses the quadratic formula to find intersection points of a ray with a sphere
 * centered at the origin.
 *
 * @param ro - Ray origin
 * @param rd - Ray direction (should be normalized)
 * @param radius - Sphere radius
 * @returns vec2(near, far) intersection distances, or vec2(-1.0) if no intersection
 */
fn intersectSphere(ro: vec3f, rd: vec3f, radius: f32) -> vec2f {
  // Quadratic coefficients for ray-sphere intersection:
  // |ro + t*rd|² = radius²
  // t² + 2*dot(ro,rd)*t + (|ro|² - radius²) = 0
  let b = dot(ro, rd);
  let c = dot(ro, ro) - radius * radius;
  let h = b * b - c;

  // No intersection if discriminant is negative
  if (h < 0.0) {
    return vec2f(-1.0);
  }

  let sqrtH = sqrt(h);
  return vec2f(-b - sqrtH, -b + sqrtH);
}

/**
 * Ray-sphere intersection test with arbitrary center.
 *
 * @param ro - Ray origin
 * @param rd - Ray direction (should be normalized)
 * @param center - Sphere center
 * @param radius - Sphere radius
 * @returns vec2(near, far) intersection distances, or vec2(-1.0) if no intersection
 */
fn intersectSphereAt(ro: vec3f, rd: vec3f, center: vec3f, radius: f32) -> vec2f {
  // Transform ray to sphere-local coordinates
  let localRo = ro - center;
  return intersectSphere(localRo, rd, radius);
}

/**
 * Check if a point is inside a sphere.
 *
 * @param p - Point to test
 * @param center - Sphere center
 * @param radius - Sphere radius
 * @returns true if point is inside sphere
 */
fn isInsideSphere(p: vec3f, center: vec3f, radius: f32) -> bool {
  return length(p - center) < radius;
}

/**
 * Ray-AABB intersection test for an axis-aligned box centered at the origin.
 *
 * Uses the slab method (Kay-Kajiya). Returns near/far distances along the ray,
 * or vec2(-1.0) if no intersection. Handles rays parallel to slab planes
 * correctly via IEEE 754 infinity arithmetic.
 *
 * @param ro - Ray origin
 * @param rd - Ray direction (should be normalized)
 * @param halfSize - Half-extent of the box (box spans [-halfSize, +halfSize] on each axis)
 * @returns vec2(near, far) intersection distances, or vec2(-1.0) if no intersection
 */
fn intersectBox(ro: vec3f, rd: vec3f, halfSize: f32) -> vec2f {
  let invRd = 1.0 / rd;
  let t0 = (-halfSize - ro) * invRd;
  let t1 = (halfSize - ro) * invRd;
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  let tNear = max(max(tmin.x, tmin.y), tmin.z);
  let tFar = min(min(tmax.x, tmax.y), tmax.z);
  if (tNear > tFar || tFar < 0.0) {
    return vec2f(-1.0);
  }
  return vec2f(tNear, tFar);
}
`
