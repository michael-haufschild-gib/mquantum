/**
 * WGSL 5D Hyperbulb SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf5d.glsl to WGSL.
 * Uses BasisVectors pattern matching Mandelbulb for N-D transformation.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf5d.wgsl
 */

export const sdf5dBlock = /* wgsl */ `
// ============================================
// 5D Hyperbulb SDF - FULLY UNROLLED
// ============================================

const MAX_ITER_5D: i32 = 256;
const EPS_5D: f32 = 1e-6;

/**
 * Optimized pow for 5D: computes both r^p and r^(p-1) efficiently.
 */
fn optimizedPow5D_schro(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_5D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 5D Mandelbulb-style SDF with orbital trap.
 *
 * @param pos 3D world position
 * @param pwr Power for Mandelbulb iteration
 * @param bail Bailout radius
 * @param maxIt Maximum iterations
 * @param basis N-D basis vectors for transformation
 * @param uniforms Schrödinger uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn sdf5D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Transform to 5D using basis vectors
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minA: f32 = 1000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  // Phase shifts
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_5D; i++) {
    if (i >= maxIt) { break; }

    r = sqrt(zx * zx + zy * zy + zz * zz + z3 * z3 + z4 * z4);
    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(zy));
    minA = min(minA, sqrt(zx * zx + zy * zy));
    minS = min(minS, abs(r - 0.8));

    dr = pow(max(r, EPS_5D), pwr - 1.0) * pwr * dr + 1.0;

    // 5D: 4 angles, z-axis primary (like Mandelbulb)
    let t0 = acos(clamp(zz / max(r, EPS_5D), -1.0, 1.0));
    let r1 = sqrt(zx * zx + zy * zy + z3 * z3 + z4 * z4);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_5D), -1.0, 1.0)), r1 > EPS_5D);
    let r2 = sqrt(zy * zy + z3 * z3 + z4 * z4);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_5D), -1.0, 1.0)), r2 > EPS_5D);
    let t3 = atan2(z4, z3);

    let rp = pow(max(r, EPS_5D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);

    let sp = rp * s0 * s1 * s2;
    zz = rp * c0 + cz;
    zx = rp * s0 * c1 + cx;
    zy = rp * s0 * s1 * c2 + cy;
    z3 = sp * c3_ + c3;
    z4 = sp * s3 + c4;
    escIt = i;
  }

  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_5D)) * r / max(dr, EPS_5D), EPS_5D);
  return vec2f(dist, trap);
}

/**
 * 5D SDF - simple version without trap.
 */
fn sdf5D_simple(
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
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_5D; i++) {
    if (i >= maxIt) { break; }
    r = sqrt(zx * zx + zy * zy + zz * zz + z3 * z3 + z4 * z4);
    if (r > bail) { break; }
    dr = pow(max(r, EPS_5D), pwr - 1.0) * pwr * dr + 1.0;

    let t0 = acos(clamp(zz / max(r, EPS_5D), -1.0, 1.0));
    let r1 = sqrt(zx * zx + zy * zy + z3 * z3 + z4 * z4);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_5D), -1.0, 1.0)), r1 > EPS_5D);
    let r2 = sqrt(zy * zy + z3 * z3 + z4 * z4);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_5D), -1.0, 1.0)), r2 > EPS_5D);
    let t3 = atan2(z4, z3);

    let rp = pow(max(r, EPS_5D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);

    let sp = rp * s0 * s1 * s2;
    zz = rp * c0 + cz;
    zx = rp * s0 * c1 + cx;
    zy = rp * s0 * s1 * c2 + cy;
    z3 = sp * c3_ + c3;
    z4 = sp * s3 + c4;
  }
  return max(0.5 * log(max(r, EPS_5D)) * r / max(dr, EPS_5D), EPS_5D);
}
`
