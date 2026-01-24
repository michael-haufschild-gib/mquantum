/**
 * WGSL Mandelbulb 6D SDF Block
 *
 * 6-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf6d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf6d.wgsl
 */

export const sdf6dBlock = /* wgsl */ `
// ============================================
// 6D Mandelbulb SDF
// ============================================

const MAX_ITER_6D: i32 = 256;
const EPS_6D: f32 = 1e-6;

fn optimizedPow6D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_6D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 6D Mandelbulb SDF with orbital trap.
 */
fn mandelbulbSDF6D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 6D
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);

  let scx = cx * uniforms.scale;
  let scy = cy * uniforms.scale;
  let scz = cz * uniforms.scale;
  let sc3 = c3 * uniforms.scale;
  let sc4 = c4 * uniforms.scale;
  let sc5 = c5 * uniforms.scale;

  var zx = scx; var zy = scy; var zz = scz;
  var z3 = sc3; var z4 = sc4; var z5 = sc5;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minASq: f32 = 1000000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.sdfMaxIterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_6D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4 + z5 * z5);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(zy));
    minASq = min(minASq, zxzy_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPow6D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 6D: 5 angles
    let t0 = acos(clamp(zz / max(r, EPS_6D), -1.0, 1.0));
    let z45_sq = z4 * z4 + z5 * z5;
    let z345_sq = z3 * z3 + z45_sq;
    let r1 = sqrt(zxzy_sq + z345_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_6D), -1.0, 1.0)), r1 > EPS_6D);
    let r2 = sqrt(zy * zy + z345_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_6D), -1.0, 1.0)), r2 > EPS_6D);
    let r3 = sqrt(z345_sq);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_6D), -1.0, 1.0)), r3 > EPS_6D);
    let t4 = atan2(z5, z4);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4_ = cos(t4 * pwr);

    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;

    zz = p0 * c0 + scz;
    zx = p1 * c1 + scx;
    zy = p2 * c2 + scy;
    z3 = p3 * c3_ + sc3;
    z4 = p4 * c4_ + sc4;
    z5 = p4 * s4 + sc5;

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 + exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_6D)) * r / max(dr, EPS_6D), EPS_6D) / uniforms.scale;

  return vec2f(dist, trap);
}

/**
 * 6D Mandelbulb SDF - simple version.
 */
fn mandelbulbSDF6D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  let cx = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);

  let scx = cx * uniforms.scale;
  let scy = cy * uniforms.scale;
  let scz = cz * uniforms.scale;
  let sc3 = c3 * uniforms.scale;
  let sc4 = c4 * uniforms.scale;
  let sc5 = c5 * uniforms.scale;

  var zx = scx; var zy = scy; var zz = scz;
  var z3 = sc3; var z4 = sc4; var z5 = sc5;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.sdfMaxIterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_6D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4 + z5 * z5);
    if (r > bail) { break; }

    let powers = optimizedPow6D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    let t0 = acos(clamp(zz / max(r, EPS_6D), -1.0, 1.0));
    let z45_sq = z4 * z4 + z5 * z5;
    let z345_sq = z3 * z3 + z45_sq;
    let r1 = sqrt(zxzy_sq + z345_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_6D), -1.0, 1.0)), r1 > EPS_6D);
    let r2 = sqrt(zy * zy + z345_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_6D), -1.0, 1.0)), r2 > EPS_6D);
    let r3 = sqrt(z345_sq);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_6D), -1.0, 1.0)), r3 > EPS_6D);
    let t4 = atan2(z5, z4);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4_ = cos(t4 * pwr);

    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;

    zz = p0 * c0 + scz;
    zx = p1 * c1 + scx;
    zy = p2 * c2 + scy;
    z3 = p3 * c3_ + sc3;
    z4 = p4 * c4_ + sc4;
    z5 = p4 * s4 + sc5;
  }

  return max(0.5 * log(max(r, EPS_6D)) * r / max(dr, EPS_6D), EPS_6D) / uniforms.scale;
}
`
