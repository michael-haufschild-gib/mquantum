/**
 * WGSL Mandelbulb 4D SDF Block
 *
 * 4-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf4d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf4d.wgsl
 */

export const sdf4dBlock = /* wgsl */ `
// ============================================
// 4D Mandelbulb SDF
// ============================================

/**
 * 4D Mandelbulb power formula using hyperspherical coordinates.
 *
 * In 4D, we use three angles (theta, phi, psi):
 * z^n = r^n * (direction in 4D hypersphere)
 *
 * @param z Current 4D position
 * @param power Mandelbulb power
 * @param phaseTheta Phase shift
 * @return 4D position after power transformation
 */
fn mandelbulbPower4D(z: vec4f, power: f32, phaseTheta: f32) -> vec4f {
  let r = length(z);

  // Hyperspherical coordinates for 4D
  // Using standard 4D spherical conversion
  let r2 = length(z.xyz);
  let r3 = length(z.xy);

  // Compute angles (with epsilon guards)
  let theta = acos(clamp(z.w / max(r, EPS_DIVISION), -1.0, 1.0));
  let phi = acos(clamp(z.z / max(r2, EPS_DIVISION), -1.0, 1.0));
  let psi = atan2(z.y, z.x);

  // Apply power and phase
  let rn = pow(r, power);
  let thetaN = (theta + phaseTheta) * power;
  let phiN = phi * power;
  let psiN = psi * power;

  // Convert back to Cartesian 4D
  let sinTheta = sin(thetaN);
  let cosTheta = cos(thetaN);
  let sinPhi = sin(phiN);
  let cosPhi = cos(phiN);

  return vec4f(
    rn * sinTheta * sinPhi * cos(psiN),
    rn * sinTheta * sinPhi * sin(psiN),
    rn * sinTheta * cosPhi,
    rn * cosTheta
  );
}

/**
 * 4D Mandelbulb SDF.
 *
 * @param p 4D point (z is transformed from 3D via basis vectors)
 * @param power Mandelbulb power
 * @param maxIter Maximum iterations
 * @param bailout Escape radius
 * @param phaseTheta Phase shift
 * @return Signed distance estimate
 */
fn mandelbulbSDF4D(
  p: vec4f,
  power: f32,
  maxIter: i32,
  bailout: f32,
  phaseTheta: f32
) -> f32 {
  var z = p;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  for (var i = 0; i < maxIter; i++) {
    r = length(z);

    if (r > bailout) {
      break;
    }

    // Update derivative
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    // Apply power transformation
    z = mandelbulbPower4D(z, power, phaseTheta) + p;
  }

  // Distance estimator (same formula as 3D)
  return 0.5 * log(r) * r / dr;
}

/**
 * 4D Mandelbulb SDF with orbital trap.
 */
fn mandelbulbSDF4DWithOrbital(
  p: vec4f,
  power: f32,
  maxIter: i32,
  bailout: f32,
  phaseTheta: f32
) -> vec2f {
  var z = p;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var orbital: f32 = 1e10;

  for (var i = 0; i < maxIter; i++) {
    r = length(z);
    orbital = min(orbital, r);

    if (r > bailout) {
      break;
    }

    dr = pow(r, power - 1.0) * power * dr + 1.0;
    z = mandelbulbPower4D(z, power, phaseTheta) + p;
  }

  let dist = 0.5 * log(r) * r / dr;
  return vec2f(dist, orbital);
}

/**
 * Transform 3D point to 4D using basis vectors, then compute SDF.
 * This is the entry point for the Mandelbulb renderer.
 *
 * @param p3d 3D world position
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return Signed distance
 */
fn mandelbulbSDF4DFromBasis(
  p3d: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // Transform to 4D
  let p4d = vec4f(
    p3d.x * getBasisComponent(basis.basisX, 0) +
    p3d.y * getBasisComponent(basis.basisY, 0) +
    p3d.z * getBasisComponent(basis.basisZ, 0) +
    getBasisComponent(basis.origin, 0),

    p3d.x * getBasisComponent(basis.basisX, 1) +
    p3d.y * getBasisComponent(basis.basisY, 1) +
    p3d.z * getBasisComponent(basis.basisZ, 1) +
    getBasisComponent(basis.origin, 1),

    p3d.x * getBasisComponent(basis.basisX, 2) +
    p3d.y * getBasisComponent(basis.basisY, 2) +
    p3d.z * getBasisComponent(basis.basisZ, 2) +
    getBasisComponent(basis.origin, 2),

    p3d.x * getBasisComponent(basis.basisX, 3) +
    p3d.y * getBasisComponent(basis.basisY, 3) +
    p3d.z * getBasisComponent(basis.basisZ, 3) +
    getBasisComponent(basis.origin, 3)
  ) * uniforms.scale;

  // Compute SDF
  let phase = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);

  return mandelbulbSDF4D(
    p4d,
    uniforms.effectivePower,
    i32(uniforms.iterations),
    uniforms.effectiveBailout,
    phase
  ) / uniforms.scale;
}
`
