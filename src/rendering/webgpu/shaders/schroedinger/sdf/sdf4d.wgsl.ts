/**
 * WGSL 4D Hyperbulb SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf4d.glsl to WGSL.
 * Uses BasisVectors pattern matching Mandelbulb for N-D transformation.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf4d.wgsl
 */

export const sdf4dBlock = /* wgsl */ `
// ============================================
// 4D Hyperbulb SDF - FULLY UNROLLED
// ============================================

const MAX_ITER_4D: i32 = 256;
const EPS_4D: f32 = 1e-6;

/**
 * Optimized pow: computes both r^p and r^(p-1) efficiently.
 */
fn optimizedPow4D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_4D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 4D Mandelbulb-style SDF with orbital trap.
 *
 * @param pos 3D world position
 * @param pwr Power for Mandelbulb iteration
 * @param bail Bailout radius
 * @param maxIt Maximum iterations
 * @param basis N-D basis vectors for transformation
 * @param uniforms Schrödinger uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn sdf4D(
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
  let cw = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);

  // Mandelbulb mode: z starts at c (sample point)
  var zx = cx;
  var zy = cy;
  var zz = cz;
  var zw = cw;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  // Orbit traps
  var minPlane: f32 = 1000.0;
  var minAxis: f32 = 1000.0;
  var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;

  // Phase shifts
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_4D; i++) {
    if (i >= maxIt) { break; }

    // r = |z|
    r = sqrt(zx * zx + zy * zy + zz * zz + zw * zw);
    if (r > bail) { escIt = i; break; }

    // Orbit traps (using z-axis primary convention)
    minPlane = min(minPlane, abs(zy));
    minAxis = min(minAxis, sqrt(zx * zx + zy * zy));  // Distance from z-axis
    minSphere = min(minSphere, abs(r - 0.8));

    // Optimized power calculation
    let powers = optimizedPow4D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // To hyperspherical: z-axis primary (like Mandelbulb)
    // 4D: (z, x, y, w) -> hyperspherical
    let theta = acos(clamp(zz / max(r, EPS_4D), -1.0, 1.0));  // From z-axis
    let rxyw = sqrt(zx * zx + zy * zy + zw * zw);
    let phi = select(0.0, acos(clamp(zx / max(rxyw, EPS_4D), -1.0, 1.0)), rxyw > EPS_4D);  // From x in xyw
    let psi = atan2(zw, zy);  // In yw plane

    // Power map: angles * n (with phase shift)
    let thetaN = (theta + phaseT) * pwr;
    let phiN = (phi + phaseP) * pwr;
    let psiN = psi * pwr;

    // From hyperspherical: z-axis primary reconstruction
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);
    let cPsi = cos(psiN);
    let sPsi = sin(psiN);

    let rSinTheta = rp * sTheta;
    let rSinThetaSinPhi = rSinTheta * sPhi;
    zz = rp * cTheta + cz;              // z = r * cos(theta)
    zx = rSinTheta * cPhi + cx;         // x = r * sin(theta) * cos(phi)
    zy = rSinThetaSinPhi * cPsi + cy;   // y = r * sin(theta) * sin(phi) * cos(psi)
    zw = rSinThetaSinPhi * sPsi + cw;   // w = r * sin(theta) * sin(phi) * sin(psi)
    escIt = i;
  }

  let trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_4D)) * r / max(dr, EPS_4D), EPS_4D);
  return vec2f(dist, trap);
}

/**
 * 4D SDF - simple version without trap.
 */
fn sdf4D_simple(
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
  let cw = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var zw = cw;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_4D; i++) {
    if (i >= maxIt) { break; }
    r = sqrt(zx * zx + zy * zy + zz * zz + zw * zw);
    if (r > bail) { break; }

    let powers = optimizedPow4D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // z-axis primary
    let theta = acos(clamp(zz / max(r, EPS_4D), -1.0, 1.0));
    let rxyw = sqrt(zx * zx + zy * zy + zw * zw);
    let phi = select(0.0, acos(clamp(zx / max(rxyw, EPS_4D), -1.0, 1.0)), rxyw > EPS_4D);
    let psi = atan2(zw, zy);

    let thetaN = (theta + phaseT) * pwr;
    let phiN = (phi + phaseP) * pwr;
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);
    let cPsi = cos(psi * pwr);
    let sPsi = sin(psi * pwr);

    let rSinThetaSinPhi = rp * sTheta * sPhi;
    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rSinThetaSinPhi * cPsi + cy;
    zw = rSinThetaSinPhi * sPsi + cw;
  }
  return max(0.5 * log(max(r, EPS_4D)) * r / max(dr, EPS_4D), EPS_4D);
}
`
