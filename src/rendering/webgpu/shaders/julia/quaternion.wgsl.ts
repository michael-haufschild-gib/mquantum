/**
 * WGSL Quaternion Operations for Julia Sets
 *
 * Port of GLSL quaternion.glsl to WGSL.
 * Provides quaternion multiplication, squaring, and general power operations.
 *
 * @module rendering/webgpu/shaders/julia/quaternion.wgsl
 */

export const quaternionBlock = /* wgsl */ `
// ============================================
// Quaternion Operations for Julia Sets
// OPT: Fast paths for powers 2-4 are inlined in SDF
// This file handles powers 5+ and non-integer powers
// ============================================

// Quaternion multiplication: q1 * q2
fn quatMul(q1: vec4f, q2: vec4f) -> vec4f {
  return vec4f(
    q1.x * q2.x - q1.y * q2.y - q1.z * q2.z - q1.w * q2.w,
    q1.x * q2.y + q1.y * q2.x + q1.z * q2.w - q1.w * q2.z,
    q1.x * q2.z - q1.y * q2.w + q1.z * q2.x + q1.w * q2.y,
    q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x
  );
}

// Quaternion squared: q * q (optimized, avoids full multiplication)
fn quatSqr(q: vec4f) -> vec4f {
  let xx = q.x * q.x;
  let yy = q.y * q.y;
  let zz = q.z * q.z;
  let ww = q.w * q.w;
  return vec4f(
    xx - yy - zz - ww,
    2.0 * q.x * q.y,
    2.0 * q.x * q.z,
    2.0 * q.x * q.w
  );
}

// Quaternion power using hyperspherical coordinates
// For generalized power n (including non-integer)
// NOTE: Powers 2, 3, 4 are inlined in SDF for maximum performance
// This function handles powers 5+ and non-integer powers
fn quatPow(q: vec4f, n: f32) -> vec4f {
  // Fast path for power 5: q^5 = q^4 * q = (q^2)^2 * q
  if (n == 5.0) {
    let q2 = quatSqr(q);
    let q4 = quatSqr(q2);
    return quatMul(q4, q);
  }

  // Fast path for power 6: q^6 = (q^2)^3 = (q^2)^2 * q^2
  if (n == 6.0) {
    let q2 = quatSqr(q);
    let q4 = quatSqr(q2);
    return quatMul(q4, q2);
  }

  // Fast path for power 7: q^7 = q^6 * q
  if (n == 7.0) {
    let q2 = quatSqr(q);
    let q4 = quatSqr(q2);
    let q6 = quatMul(q4, q2);
    return quatMul(q6, q);
  }

  // Fast path for power 8: q^8 = ((q^2)^2)^2
  if (n == 8.0) {
    let q2 = quatSqr(q);
    let q4 = quatSqr(q2);
    return quatSqr(q4);
  }

  // General hyperspherical approach for other powers
  let r = length(q);
  if (r < EPS) {
    return vec4f(0.0);
  }

  // Normalize the vector part
  let v = q.yzw;
  let vLen = length(v);

  if (vLen < EPS) {
    // Pure scalar quaternion
    let rn = pow(r, n);
    return vec4f(rn * select(-1.0, 1.0, q.x >= 0.0), 0.0, 0.0, 0.0);
  }

  // Convert to hyperspherical: q = r * (cos(theta) + sin(theta) * v_hat)
  let theta = acos(clamp(q.x / r, -1.0, 1.0));
  let vHat = v / vLen;

  // Apply power: q^n = r^n * (cos(n*theta) + sin(n*theta) * v_hat)
  let rn = pow(r, n);
  let nTheta = n * theta;
  let cosNT = cos(nTheta);
  let sinNT = sin(nTheta);

  return vec4f(rn * cosNT, rn * sinNT * vHat);
}
`
