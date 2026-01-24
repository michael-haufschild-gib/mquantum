/**
 * WGSL 7D Hyperbulb SDF for Schrödinger isosurface rendering
 *
 * Port of GLSL schroedinger/sdf/sdf7d.glsl to WGSL.
 * Uses BasisVectors pattern matching Mandelbulb for N-D transformation.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf7d.wgsl
 */

export const sdf7dBlock = /* wgsl */ `
// ============================================
// 7D Hyperbulb SDF - FULLY UNROLLED
// ============================================

const MAX_ITER_7D: i32 = 256;
const EPS_7D: f32 = 1e-6;

/**
 * 7D Mandelbulb-style SDF with orbital trap.
 */
fn sdf7D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Transform to 7D using basis vectors
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;
  var z5 = c5;
  var z6 = c6;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minA: f32 = 1000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_7D; i++) {
    if (i >= maxIt) { break; }

    r = sqrt(zx * zx + zy * zy + zz * zz + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(zy));
    minA = min(minA, sqrt(zx * zx + zy * zy));
    minS = min(minS, abs(r - 0.8));
    dr = pow(max(r, EPS_7D), pwr - 1.0) * pwr * dr + 1.0;

    // 7D: 6 angles, z-axis primary
    let t0 = acos(clamp(zz / max(r, EPS_7D), -1.0, 1.0));
    let r1 = sqrt(zx * zx + zy * zy + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_7D), -1.0, 1.0)), r1 > EPS_7D);
    let r2 = sqrt(zy * zy + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_7D), -1.0, 1.0)), r2 > EPS_7D);
    let r3 = sqrt(z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_7D), -1.0, 1.0)), r3 > EPS_7D);
    let r4 = sqrt(z4 * z4 + z5 * z5 + z6 * z6);
    let t4 = select(0.0, acos(clamp(z4 / max(r4, EPS_7D), -1.0, 1.0)), r4 > EPS_7D);
    let t5 = atan2(z6, z5);

    let rp = pow(max(r, EPS_7D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr);
    let c4_ = cos(t4 * pwr);
    let s5 = sin(t5 * pwr);
    let c5_ = cos(t5 * pwr);

    let sp = rp * s0 * s1 * s2 * s3 * s4;
    zz = rp * c0 + cz;
    zx = rp * s0 * c1 + cx;
    zy = rp * s0 * s1 * c2 + cy;
    z3 = rp * s0 * s1 * s2 * c3_ + c3;
    z4 = rp * s0 * s1 * s2 * s3 * c4_ + c4;
    z5 = sp * c5_ + c5;
    z6 = sp * s5 + c6;
    escIt = i;
  }

  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_7D)) * r / max(dr, EPS_7D), EPS_7D);
  return vec2f(dist, trap);
}

/**
 * 7D SDF - simple version without trap.
 */
fn sdf7D_simple(
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
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;
  var z5 = c5;
  var z6 = c6;
  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_7D; i++) {
    if (i >= maxIt) { break; }
    r = sqrt(zx * zx + zy * zy + zz * zz + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    if (r > bail) { break; }
    dr = pow(max(r, EPS_7D), pwr - 1.0) * pwr * dr + 1.0;

    let t0 = acos(clamp(zz / max(r, EPS_7D), -1.0, 1.0));
    let r1 = sqrt(zx * zx + zy * zy + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_7D), -1.0, 1.0)), r1 > EPS_7D);
    let r2 = sqrt(zy * zy + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_7D), -1.0, 1.0)), r2 > EPS_7D);
    let r3 = sqrt(z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_7D), -1.0, 1.0)), r3 > EPS_7D);
    let r4 = sqrt(z4 * z4 + z5 * z5 + z6 * z6);
    let t4 = select(0.0, acos(clamp(z4 / max(r4, EPS_7D), -1.0, 1.0)), r4 > EPS_7D);
    let t5 = atan2(z6, z5);

    let rp = pow(max(r, EPS_7D), pwr);
    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr);
    let c4_ = cos(t4 * pwr);
    let s5 = sin(t5 * pwr);
    let c5_ = cos(t5 * pwr);

    let sp = rp * s0 * s1 * s2 * s3 * s4;
    zz = rp * c0 + cz;
    zx = rp * s0 * c1 + cx;
    zy = rp * s0 * s1 * c2 + cy;
    z3 = rp * s0 * s1 * s2 * c3_ + c3;
    z4 = rp * s0 * s1 * s2 * s3 * c4_ + c4;
    z5 = sp * c5_ + c5;
    z6 = sp * s5 + c6;
  }
  return max(0.5 * log(max(r, EPS_7D)) * r / max(dr, EPS_7D), EPS_7D);
}
`
