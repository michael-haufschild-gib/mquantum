/**
 * WGSL 9D Hyperbulb SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf9d.glsl to WGSL.
 * Uses BasisVectors pattern matching Mandelbulb for N-D transformation.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf9d.wgsl
 */

export const sdf9dBlock = /* wgsl */ `
// ============================================
// 9D Hyperbulb SDF - FULLY UNROLLED
// ============================================

const MAX_ITER_9D: i32 = 256;
const EPS_9D: f32 = 1e-6;

/**
 * 9D Mandelbulb-style SDF with orbital trap.
 */
fn sdf9D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Transform to 9D using basis vectors
  let c0 = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let c1 = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let c2 = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);
  let c7 = getBasisComponent(basis.origin, 7) + pos.x * getBasisComponent(basis.basisX, 7) + pos.y * getBasisComponent(basis.basisY, 7) + pos.z * getBasisComponent(basis.basisZ, 7);
  let c8 = getBasisComponent(basis.origin, 8) + pos.x * getBasisComponent(basis.basisX, 8) + pos.y * getBasisComponent(basis.basisY, 8) + pos.z * getBasisComponent(basis.basisZ, 8);

  var z0 = c0;
  var z1 = c1;
  var z2 = c2;
  var z3 = c3;
  var z4 = c4;
  var z5 = c5;
  var z6 = c6;
  var z7 = c7;
  var z8 = c8;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minA: f32 = 1000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_9D; i++) {
    if (i >= maxIt) { break; }

    r = sqrt(z0*z0 + z1*z1 + z2*z2 + z3*z3 + z4*z4 + z5*z5 + z6*z6 + z7*z7 + z8*z8);
    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z1));
    minA = min(minA, sqrt(z0*z0 + z1*z1));
    minS = min(minS, abs(r - 0.8));
    dr = pow(max(r, EPS_9D), pwr - 1.0) * pwr * dr + 1.0;

    // 9D: 8 angles (t0..t6 from acos, t7 from atan2)
    var tail = r;
    let t0 = acos(clamp(z0 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z0*z0, EPS_9D));
    let t1 = acos(clamp(z1 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z1*z1, EPS_9D));
    let t2 = acos(clamp(z2 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z2*z2, EPS_9D));
    let t3 = acos(clamp(z3 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z3*z3, EPS_9D));
    let t4 = acos(clamp(z4 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z4*z4, EPS_9D));
    let t5 = acos(clamp(z5 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z5*z5, EPS_9D));
    let t6 = acos(clamp(z6 / max(tail, EPS_9D), -1.0, 1.0));
    let t7 = atan2(z8, z7);

    let rp = pow(max(r, EPS_9D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0_ = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1_ = cos((t1 + phaseP) * pwr);

    z0 = rp * c0_ + c0;
    var sp = rp * s0;
    z1 = sp * c1_ + c1;
    sp *= s1;
    z2 = sp * cos(t2 * pwr) + c2; sp *= sin(t2 * pwr);
    z3 = sp * cos(t3 * pwr) + c3; sp *= sin(t3 * pwr);
    z4 = sp * cos(t4 * pwr) + c4; sp *= sin(t4 * pwr);
    z5 = sp * cos(t5 * pwr) + c5; sp *= sin(t5 * pwr);
    z6 = sp * cos(t6 * pwr) + c6; sp *= sin(t6 * pwr);
    z7 = sp * cos(t7 * pwr) + c7;
    z8 = sp * sin(t7 * pwr) + c8;

    escIt = i;
  }

  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_9D)) * r / max(dr, EPS_9D), EPS_9D);
  return vec2f(dist, trap);
}

/**
 * 9D SDF - simple version without trap.
 */
fn sdf9D_simple(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> f32 {
  let c0 = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let c1 = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let c2 = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);
  let c7 = getBasisComponent(basis.origin, 7) + pos.x * getBasisComponent(basis.basisX, 7) + pos.y * getBasisComponent(basis.basisY, 7) + pos.z * getBasisComponent(basis.basisZ, 7);
  let c8 = getBasisComponent(basis.origin, 8) + pos.x * getBasisComponent(basis.basisX, 8) + pos.y * getBasisComponent(basis.basisY, 8) + pos.z * getBasisComponent(basis.basisZ, 8);

  var z0 = c0;
  var z1 = c1;
  var z2 = c2;
  var z3 = c3;
  var z4 = c4;
  var z5 = c5;
  var z6 = c6;
  var z7 = c7;
  var z8 = c8;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_9D; i++) {
    if (i >= maxIt) { break; }

    r = sqrt(z0*z0 + z1*z1 + z2*z2 + z3*z3 + z4*z4 + z5*z5 + z6*z6 + z7*z7 + z8*z8);
    if (r > bail) { break; }
    dr = pow(max(r, EPS_9D), pwr - 1.0) * pwr * dr + 1.0;

    var tail = r;
    let t0 = acos(clamp(z0 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z0*z0, EPS_9D));
    let t1 = acos(clamp(z1 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z1*z1, EPS_9D));
    let t2 = acos(clamp(z2 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z2*z2, EPS_9D));
    let t3 = acos(clamp(z3 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z3*z3, EPS_9D));
    let t4 = acos(clamp(z4 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z4*z4, EPS_9D));
    let t5 = acos(clamp(z5 / max(tail, EPS_9D), -1.0, 1.0)); tail = sqrt(max(tail*tail - z5*z5, EPS_9D));
    let t6 = acos(clamp(z6 / max(tail, EPS_9D), -1.0, 1.0));
    let t7 = atan2(z8, z7);

    let rp = pow(max(r, EPS_9D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0_ = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1_ = cos((t1 + phaseP) * pwr);

    z0 = rp * c0_ + c0;
    var sp = rp * s0;
    z1 = sp * c1_ + c1;
    sp *= s1;
    z2 = sp * cos(t2 * pwr) + c2; sp *= sin(t2 * pwr);
    z3 = sp * cos(t3 * pwr) + c3; sp *= sin(t3 * pwr);
    z4 = sp * cos(t4 * pwr) + c4; sp *= sin(t4 * pwr);
    z5 = sp * cos(t5 * pwr) + c5; sp *= sin(t5 * pwr);
    z6 = sp * cos(t6 * pwr) + c6; sp *= sin(t6 * pwr);
    z7 = sp * cos(t7 * pwr) + c7;
    z8 = sp * sin(t7 * pwr) + c8;
  }
  return max(0.5 * log(max(r, EPS_9D)) * r / max(dr, EPS_9D), EPS_9D);
}
`
