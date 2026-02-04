/**
 * WGSL Mandelbulb 7D SDF Block
 *
 * 7-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf7d.glsl to WGSL.
 *
 * NOTE: Scale is handled by the dispatch function (GetDist), NOT here.
 * The SDF works on pure fractal coordinates without scale modification.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf7d.wgsl
 */

export const sdf7dBlock = /* wgsl */ `
// ============================================
// 7D Mandelbulb SDF
// With proper basis transformation (matching WebGL)
// ============================================

const MAX_ITER_7D: i32 = 256;
const EPS_7D: f32 = 1e-6;

fn optimizedPow7D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_7D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 7D Mandelbulb SDF with orbital trap.
 *
 * @param pos 3D world position (already scaled by dispatch)
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn mandelbulbSDF7D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 7D fractal space using basis vectors (matching WebGL)
  let cx = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) +
           pos.x * getBasisComponent(basis.basisX, 4) +
           pos.y * getBasisComponent(basis.basisY, 4) +
           pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) +
           pos.x * getBasisComponent(basis.basisX, 5) +
           pos.y * getBasisComponent(basis.basisY, 5) +
           pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) +
           pos.x * getBasisComponent(basis.basisX, 6) +
           pos.y * getBasisComponent(basis.basisY, 6) +
           pos.z * getBasisComponent(basis.basisZ, 6);

  // Mandelbulb mode: z starts at c (sample point)
  var zx = cx; var zy = cy; var zz = cz;
  var z3 = c3; var z4 = c4; var z5 = c5; var z6 = c6;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minASq: f32 = 1000000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_7D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(zy));
    minASq = min(minASq, zxzy_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPow7D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 7D: 6 angles
    let t0 = acos(clamp(zz / max(r, EPS_7D), -1.0, 1.0));
    let z56_sq = z5 * z5 + z6 * z6;
    let z456_sq = z4 * z4 + z56_sq;
    let z3456_sq = z3 * z3 + z456_sq;
    let r1 = sqrt(zxzy_sq + z3456_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_7D), -1.0, 1.0)), r1 > EPS_7D);
    let r2 = sqrt(zy * zy + z3456_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_7D), -1.0, 1.0)), r2 > EPS_7D);
    let r3 = sqrt(z3456_sq);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_7D), -1.0, 1.0)), r3 > EPS_7D);
    let r4 = sqrt(z456_sq);
    let t4 = select(0.0, acos(clamp(z4 / max(r4, EPS_7D), -1.0, 1.0)), r4 > EPS_7D);
    let t5 = atan2(z6, z5);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4_ = cos(t4 * pwr);
    let s5 = sin(t5 * pwr); let c5_ = cos(t5 * pwr);

    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;
    let p5 = p4 * s4;

    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p4 * c4_ + c4;
    z5 = p5 * c5_ + c5;
    z6 = p5 * s5 + c6;

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 +
             exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  // Distance estimator (no scale division - handled by dispatch)
  let dist = max(0.5 * log(max(r, EPS_7D)) * r / max(dr, EPS_7D), EPS_7D);

  return vec2f(dist, trap);
}

/**
 * 7D Mandelbulb SDF - simple version without trap.
 */
fn mandelbulbSDF7D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // Transform to 7D fractal space using basis vectors
  let cx = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  let cy = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  let cz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  let c3 = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);
  let c4 = getBasisComponent(basis.origin, 4) +
           pos.x * getBasisComponent(basis.basisX, 4) +
           pos.y * getBasisComponent(basis.basisY, 4) +
           pos.z * getBasisComponent(basis.basisZ, 4);
  let c5 = getBasisComponent(basis.origin, 5) +
           pos.x * getBasisComponent(basis.basisX, 5) +
           pos.y * getBasisComponent(basis.basisY, 5) +
           pos.z * getBasisComponent(basis.basisZ, 5);
  let c6 = getBasisComponent(basis.origin, 6) +
           pos.x * getBasisComponent(basis.basisX, 6) +
           pos.y * getBasisComponent(basis.basisY, 6) +
           pos.z * getBasisComponent(basis.basisZ, 6);

  var zx = cx; var zy = cy; var zz = cz;
  var z3 = c3; var z4 = c4; var z5 = c5; var z6 = c6;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_7D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4 + z5 * z5 + z6 * z6);
    if (r > bail) { break; }

    let powers = optimizedPow7D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    let t0 = acos(clamp(zz / max(r, EPS_7D), -1.0, 1.0));
    let z56_sq = z5 * z5 + z6 * z6;
    let z456_sq = z4 * z4 + z56_sq;
    let z3456_sq = z3 * z3 + z456_sq;
    let r1 = sqrt(zxzy_sq + z3456_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_7D), -1.0, 1.0)), r1 > EPS_7D);
    let r2 = sqrt(zy * zy + z3456_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_7D), -1.0, 1.0)), r2 > EPS_7D);
    let r3 = sqrt(z3456_sq);
    let t3 = select(0.0, acos(clamp(z3 / max(r3, EPS_7D), -1.0, 1.0)), r3 > EPS_7D);
    let r4 = sqrt(z456_sq);
    let t4 = select(0.0, acos(clamp(z4 / max(r4, EPS_7D), -1.0, 1.0)), r4 > EPS_7D);
    let t5 = atan2(z6, z5);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3_ = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4_ = cos(t4 * pwr);
    let s5 = sin(t5 * pwr); let c5_ = cos(t5 * pwr);

    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;
    let p5 = p4 * s4;

    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p4 * c4_ + c4;
    z5 = p5 * c5_ + c5;
    z6 = p5 * s5 + c6;
  }

  return max(0.5 * log(max(r, EPS_7D)) * r / max(dr, EPS_7D), EPS_7D);
}
`
