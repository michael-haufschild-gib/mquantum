/**
 * WGSL 3D Mandelbulb-style SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf3d.glsl to WGSL.
 * Uses BasisVectors pattern matching Mandelbulb for N-D transformation.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf3d.wgsl
 */

export const sdf3dBlock = /* wgsl */ `
// ============================================
// 3D Mandelbulb SDF - FULLY UNROLLED
// ============================================

const MAX_ITER_3D: i32 = 256;
const EPS_3D: f32 = 1e-6;

/**
 * 3D Mandelbulb SDF with orbital trap support.
 *
 * @param pos 3D world position
 * @param pwr Power for Mandelbulb iteration
 * @param bail Bailout radius
 * @param maxIt Maximum iterations
 * @param basis N-D basis vectors for transformation
 * @param uniforms Schrödinger uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn sdf3D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // c = origin + pos.x * basisX + pos.y * basisY + pos.z * basisZ
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);

  var zx = cx;
  var zy = cy;
  var zz = cz;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  // Orbit traps
  var minPlane: f32 = 1000.0;
  var minAxis: f32 = 1000.0;
  var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;

  // Phase shifts
  let phaseTheta = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phasePhi = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_3D; i++) {
    if (i >= maxIt) { break; }

    // r = |z|
    r = sqrt(zx * zx + zy * zy + zz * zz);
    if (r > bail) { escIt = i; break; }

    // Orbit traps
    minPlane = min(minPlane, abs(zy));
    minAxis = min(minAxis, sqrt(zx * zx + zy * zy));
    minSphere = min(minSphere, abs(r - 0.8));

    // Optimized power calculation
    let rp = pow(max(r, EPS_3D), pwr);
    let rpMinus1 = rp / max(r, EPS_3D);
    dr = rpMinus1 * pwr * dr + 1.0;

    // To spherical: z-axis primary
    let theta = acos(clamp(zz / max(r, EPS_3D), -1.0, 1.0));
    let phi = atan2(zy, zx);

    // Power map: angles * n (with optional phase shift)
    let thetaN = (theta + phaseTheta) * pwr;
    let phiN = (phi + phasePhi) * pwr;

    // From spherical: z-axis primary reconstruction
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);

    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rp * sTheta * sPhi + cy;
    escIt = i;
  }

  let trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_3D)) * r / max(dr, EPS_3D), EPS_3D);
  return vec2f(dist, trap);
}

/**
 * 3D SDF - simple version without trap.
 */
fn sdf3D_simple(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> f32 {
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let phaseTheta = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phasePhi = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_3D; i++) {
    if (i >= maxIt) { break; }
    r = sqrt(zx * zx + zy * zy + zz * zz);
    if (r > bail) { break; }

    let rp = pow(max(r, EPS_3D), pwr);
    let rpMinus1 = rp / max(r, EPS_3D);
    dr = rpMinus1 * pwr * dr + 1.0;

    let theta = acos(clamp(zz / max(r, EPS_3D), -1.0, 1.0));
    let phi = atan2(zy, zx);

    let thetaN = (theta + phaseTheta) * pwr;
    let phiN = (phi + phasePhi) * pwr;
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);

    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rp * sTheta * sPhi + cy;
  }
  return max(0.5 * log(max(r, EPS_3D)) * r / max(dr, EPS_3D), EPS_3D);
}
`
