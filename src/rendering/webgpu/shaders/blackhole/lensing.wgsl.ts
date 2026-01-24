/**
 * WGSL Gravitational Lensing
 *
 * Port of GLSL blackhole/gravity/lensing.glsl to WGSL.
 * Implements N-dimensional ray bending based on simplified gravitational field.
 *
 * @module rendering/webgpu/shaders/blackhole/lensing.wgsl
 */

export const lensingBlock = /* wgsl */ `
// ============================================
// Gravitational Lensing
// ============================================

// Safely normalize a vector, returning a fallback if near zero.
fn safeNormalize(v: vec3f, fallback: vec3f) -> vec3f {
  let len = length(v);
  return select(fallback, v / len, len > 1e-6);
}

// Compute N-dimensional distance to origin.
// For a 3D slice defined by orthonormal basis vectors and an origin offset,
// the distance squared to the N-D origin is:
// Radius^2 = worldX^2 + worldY^2 + worldZ^2 + |OriginOffset|^2
fn ndDistance(pos3d: vec3f) -> f32 {
  // Compute distance squared in the 3D slice
  let dist3dSq = dot(pos3d, pos3d);

  // Add the pre-calculated squared length of the N-D origin offset
  let sumSq = dist3dSq + blackhole.originOffsetLengthSq;

  return sqrt(max(sumSq, 1e-10));
}

// Compute gravitational lensing strength.
// Uses the N-dimensional lensing formula:
//   G(r,N) = k * N^α / (r + ε)^β
fn computeDeflectionAngle(ndRadius: f32) -> f32 {
  let k = blackhole.gravityStrength;
  let r = ndRadius;
  let epsilon = blackhole.epsilonMul;
  let beta = blackhole.distanceFalloff;

  var denominator: f32;
  if (abs(beta - 2.0) < 0.01) {
    let re = r + epsilon;
    denominator = re * re;
  } else {
    denominator = pow(r + epsilon, beta);
  }

  var deflectionAngle = k * blackhole.dimPower / denominator;

  // Scale by horizon radius for physical units
  deflectionAngle *= blackhole.horizonRadius;

  // Clamp to prevent extreme bending per step
  deflectionAngle = min(deflectionAngle, blackhole.bendMaxPerStep);

  return deflectionAngle;
}

// Apply ray bending for one raymarch step using "Magic Potential" approach
// with Kerr frame dragging and N-dimensional scaling.
fn bendRay(rayDir: vec3f, pos3d: vec3f, stepSize: f32, ndRadius: f32) -> vec3f {
  let rs = blackhole.horizonRadius;

  // N-Dimensional radius (already computed and passed in)
  let r = max(ndRadius, blackhole.epsilonMul);

  // Compute h² without cross product: h² = |pos|^2 - (pos . rayDir)^2
  let p_dot_d = dot(pos3d, rayDir);

  // Derive pos3dLenSq from ndRadius
  let pos3dLenSq = max(1e-10, ndRadius * ndRadius - blackhole.originOffsetLengthSq);
  let h2 = pos3dLenSq - p_dot_d * p_dot_d;

  // If h² ≈ 0, ray is purely radial - no bending possible
  if (h2 < 1e-10) {
    return rayDir;
  }

  // Photon Sphere Proximity Factor
  let proximityT = 1.0 - smoothstep(blackhole.lensingFalloffStart, blackhole.lensingFalloffEnd, r);
  let proximityFactor = mix(0.1, 1.0, proximityT);

  // Schwarzschild component: F = -1.5 * h² * r_hat / r^5
  let r2 = r * r;
  let r5 = r2 * r2 * r;
  var forceMagnitude = 1.5 * h2 / r5;

  // N-Dimensional Scaling: scale factor = N^α * r^(2-β)
  var ndScale = blackhole.dimPower;
  if (abs(blackhole.distanceFalloff - 2.0) > 0.01) {
    ndScale *= pow(r, 2.0 - blackhole.distanceFalloff);
  }

  forceMagnitude *= ndScale;

  // Apply gravity strength and proximity
  forceMagnitude *= blackhole.gravityStrength * blackhole.bendScale * proximityFactor;

  // Apply clamping
  forceMagnitude = min(forceMagnitude, min(blackhole.lensingClamp, blackhole.bendMaxPerStep / stepSize));

  // Radial acceleration (toward origin)
  let invPosLen = inverseSqrt(pos3dLenSq);
  var acceleration = -(forceMagnitude * invPosLen) * pos3d;

  // Kerr frame dragging component
  if (abs(blackhole.spin) > 0.001) {
    // Spin axis is Y-axis (vertical)
    let a = blackhole.spin * rs * 0.5;

    // Azimuthal direction: cross((0,1,0), pos) = (-pos.z, 0, pos.x)
    let azimuthalDirRaw = vec3f(-pos3d.z, 0.0, pos3d.x);
    let azLenSq = dot(azimuthalDirRaw, azimuthalDirRaw);

    if (azLenSq > 1e-6) {
      // Frame dragging acceleration: ~ 2*a/r³
      var frameDragMag = (a + a) / (r2 * r);

      // Scale factors
      frameDragMag *= blackhole.gravityStrength * blackhole.bendScale * ndScale * proximityFactor;

      acceleration += (frameDragMag * inverseSqrt(azLenSq)) * azimuthalDirRaw;
    }
  }

  // Velocity Verlet integration
  let newDir = rayDir + acceleration * stepSize;

  // Renormalize to maintain unit direction
  return normalize(newDir);
}
`
