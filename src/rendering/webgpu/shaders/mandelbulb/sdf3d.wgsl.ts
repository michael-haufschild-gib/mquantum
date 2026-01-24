/**
 * WGSL Mandelbulb 3D SDF Block
 *
 * 3-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf3d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf3d.wgsl
 */

export const sdf3dBlock = /* wgsl */ `
// ============================================
// 3D Mandelbulb SDF
// ============================================

/**
 * Mandelbulb iteration in 3D.
 *
 * Uses spherical coordinates for the power formula:
 * z^n = r^n * (sin(n*theta)*cos(n*phi), sin(n*theta)*sin(n*phi), cos(n*theta))
 *
 * @param z Current position
 * @param c Initial position (Julia constant or position)
 * @param power Mandelbulb power
 * @param phaseTheta Phase shift for theta
 * @param phasePhi Phase shift for phi
 * @return New position after iteration
 */
fn mandelbulbIteration3D(
  z: vec3f,
  c: vec3f,
  power: f32,
  phaseTheta: f32,
  phasePhi: f32
) -> vec3f {
  let r = length(z);

  // Convert to spherical coordinates
  let theta = acos(z.z / r) + phaseTheta;
  let phi = atan2(z.y, z.x) + phasePhi;

  // Apply power
  let rn = pow(r, power);
  let thetaN = theta * power;
  let phiN = phi * power;

  // Convert back to Cartesian
  let sinThetaN = sin(thetaN);
  return vec3f(
    sinThetaN * cos(phiN),
    sinThetaN * sin(phiN),
    cos(thetaN)
  ) * rn + c;
}

/**
 * 3D Mandelbulb SDF.
 *
 * @param p Point in 3D space
 * @param power Mandelbulb power
 * @param maxIter Maximum iterations
 * @param bailout Escape radius
 * @param phaseTheta Theta phase shift
 * @param phasePhi Phi phase shift
 * @return Signed distance estimate
 */
fn mandelbulbSDF3D(
  p: vec3f,
  power: f32,
  maxIter: i32,
  bailout: f32,
  phaseTheta: f32,
  phasePhi: f32
) -> f32 {
  var z = p;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  for (var i = 0; i < maxIter; i++) {
    r = length(z);

    if (r > bailout) {
      break;
    }

    // Convert to spherical
    let theta = acos(z.z / r) + phaseTheta;
    let phi = atan2(z.y, z.x) + phasePhi;

    // Update running derivative
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    // Apply power transformation
    let rn = pow(r, power);
    let thetaN = theta * power;
    let phiN = phi * power;

    // Convert back to Cartesian and add original point
    let sinThetaN = sin(thetaN);
    z = vec3f(
      sinThetaN * cos(phiN),
      sinThetaN * sin(phiN),
      cos(thetaN)
    ) * rn + p;
  }

  // Distance estimator
  return 0.5 * log(r) * r / dr;
}

/**
 * 3D Mandelbulb SDF with orbital trap tracking.
 *
 * @return vec2f where x = distance, y = orbital trap value
 */
fn mandelbulbSDF3DWithOrbital(
  p: vec3f,
  power: f32,
  maxIter: i32,
  bailout: f32,
  phaseTheta: f32,
  phasePhi: f32
) -> vec2f {
  var z = p;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var orbital: f32 = 1e10;  // Minimum distance to origin trap

  for (var i = 0; i < maxIter; i++) {
    r = length(z);

    // Track orbital trap (minimum distance to origin)
    orbital = min(orbital, r);

    if (r > bailout) {
      break;
    }

    let theta = acos(z.z / r) + phaseTheta;
    let phi = atan2(z.y, z.x) + phasePhi;

    dr = pow(r, power - 1.0) * power * dr + 1.0;

    let rn = pow(r, power);
    let thetaN = theta * power;
    let phiN = phi * power;

    let sinThetaN = sin(thetaN);
    z = vec3f(
      sinThetaN * cos(phiN),
      sinThetaN * sin(phiN),
      cos(thetaN)
    ) * rn + p;
  }

  let dist = 0.5 * log(r) * r / dr;
  return vec2f(dist, orbital);
}
`
