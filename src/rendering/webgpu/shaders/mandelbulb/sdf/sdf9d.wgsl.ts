/**
 * WGSL Mandelbulb 9D SDF Block
 *
 * 9-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf9d.glsl to WGSL.
 *
 * NOTE: Scale is handled by the dispatch function (GetDist), NOT here.
 * The SDF works on pure fractal coordinates without scale modification.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf9d.wgsl
 */

export const sdf9dBlock = /* wgsl */ `
// ============================================
// 9D Mandelbulb SDF (Fully unrolled)
// With proper basis transformation (matching WebGL)
// ============================================

const MAX_ITER_9D: i32 = 256;
const EPS_9D: f32 = 1e-6;

fn optimizedPow9D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_9D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 9D Mandelbulb SDF with orbital trap.
 *
 * @param pos 3D world position (already scaled by dispatch)
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn mandelbulbSDF9D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // 9D initialization - transform using basis vectors (matching WebGL)
  let coord0 = getBasisComponent(basis.origin, 0) +
               pos.x * getBasisComponent(basis.basisX, 0) +
               pos.y * getBasisComponent(basis.basisY, 0) +
               pos.z * getBasisComponent(basis.basisZ, 0);
  let coord1 = getBasisComponent(basis.origin, 1) +
               pos.x * getBasisComponent(basis.basisX, 1) +
               pos.y * getBasisComponent(basis.basisY, 1) +
               pos.z * getBasisComponent(basis.basisZ, 1);
  let coord2 = getBasisComponent(basis.origin, 2) +
               pos.x * getBasisComponent(basis.basisX, 2) +
               pos.y * getBasisComponent(basis.basisY, 2) +
               pos.z * getBasisComponent(basis.basisZ, 2);
  let coord3 = getBasisComponent(basis.origin, 3) +
               pos.x * getBasisComponent(basis.basisX, 3) +
               pos.y * getBasisComponent(basis.basisY, 3) +
               pos.z * getBasisComponent(basis.basisZ, 3);
  let coord4 = getBasisComponent(basis.origin, 4) +
               pos.x * getBasisComponent(basis.basisX, 4) +
               pos.y * getBasisComponent(basis.basisY, 4) +
               pos.z * getBasisComponent(basis.basisZ, 4);
  let coord5 = getBasisComponent(basis.origin, 5) +
               pos.x * getBasisComponent(basis.basisX, 5) +
               pos.y * getBasisComponent(basis.basisY, 5) +
               pos.z * getBasisComponent(basis.basisZ, 5);
  let coord6 = getBasisComponent(basis.origin, 6) +
               pos.x * getBasisComponent(basis.basisX, 6) +
               pos.y * getBasisComponent(basis.basisY, 6) +
               pos.z * getBasisComponent(basis.basisZ, 6);
  let coord7 = getBasisComponent(basis.origin, 7) +
               pos.x * getBasisComponent(basis.basisX, 7) +
               pos.y * getBasisComponent(basis.basisY, 7) +
               pos.z * getBasisComponent(basis.basisZ, 7);
  let coord8 = getBasisComponent(basis.origin, 8) +
               pos.x * getBasisComponent(basis.basisX, 8) +
               pos.y * getBasisComponent(basis.basisY, 8) +
               pos.z * getBasisComponent(basis.basisZ, 8);

  var z0 = coord0; var z1 = coord1; var z2 = coord2; var z3 = coord3;
  var z4 = coord4; var z5 = coord5; var z6 = coord6; var z7 = coord7; var z8 = coord8;

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

  for (var i = 0; i < MAX_ITER_9D; i++) {
    if (i >= maxIt) { break; }

    // Cache squared values
    let z0_sq = z0 * z0; let z1_sq = z1 * z1; let z2_sq = z2 * z2; let z3_sq = z3 * z3;
    let z4_sq = z4 * z4; let z5_sq = z5 * z5; let z6_sq = z6 * z6; let z7_sq = z7 * z7; let z8_sq = z8 * z8;
    let z01_sq = z0_sq + z1_sq;

    r = sqrt(z01_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z1));
    minASq = min(minASq, z01_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPow9D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 9D: 8 angles using inversesqrt
    var tailSq = r * r;
    var invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t6 = acos(clamp(z6 * invTail, -1.0, 1.0));
    let t7 = atan2(z8, z7);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3 = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4 = cos(t4 * pwr);
    let s5 = sin(t5 * pwr); let c5 = cos(t5 * pwr);
    let s6 = sin(t6 * pwr); let c6 = cos(t6 * pwr);
    let s7 = sin(t7 * pwr); let c7 = cos(t7 * pwr);

    z0 = rp * c0 + coord0;
    var sp = rp * s0;
    z1 = sp * c1 + coord1; sp *= s1;
    z2 = sp * c2 + coord2; sp *= s2;
    z3 = sp * c3 + coord3; sp *= s3;
    z4 = sp * c4 + coord4; sp *= s4;
    z5 = sp * c5 + coord5; sp *= s5;
    z6 = sp * c6 + coord6; sp *= s6;
    z7 = sp * c7 + coord7;
    z8 = sp * s7 + coord8;

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 +
             exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  // Distance estimator (no scale division - handled by dispatch)
  let dist = max(0.5 * log(max(r, EPS_9D)) * r / max(dr, EPS_9D), EPS_9D);

  return vec2f(dist, trap);
}

/**
 * 9D Mandelbulb SDF - simple version without trap.
 */
fn mandelbulbSDF9D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // 9D initialization - transform using basis vectors
  let coord0 = getBasisComponent(basis.origin, 0) +
               pos.x * getBasisComponent(basis.basisX, 0) +
               pos.y * getBasisComponent(basis.basisY, 0) +
               pos.z * getBasisComponent(basis.basisZ, 0);
  let coord1 = getBasisComponent(basis.origin, 1) +
               pos.x * getBasisComponent(basis.basisX, 1) +
               pos.y * getBasisComponent(basis.basisY, 1) +
               pos.z * getBasisComponent(basis.basisZ, 1);
  let coord2 = getBasisComponent(basis.origin, 2) +
               pos.x * getBasisComponent(basis.basisX, 2) +
               pos.y * getBasisComponent(basis.basisY, 2) +
               pos.z * getBasisComponent(basis.basisZ, 2);
  let coord3 = getBasisComponent(basis.origin, 3) +
               pos.x * getBasisComponent(basis.basisX, 3) +
               pos.y * getBasisComponent(basis.basisY, 3) +
               pos.z * getBasisComponent(basis.basisZ, 3);
  let coord4 = getBasisComponent(basis.origin, 4) +
               pos.x * getBasisComponent(basis.basisX, 4) +
               pos.y * getBasisComponent(basis.basisY, 4) +
               pos.z * getBasisComponent(basis.basisZ, 4);
  let coord5 = getBasisComponent(basis.origin, 5) +
               pos.x * getBasisComponent(basis.basisX, 5) +
               pos.y * getBasisComponent(basis.basisY, 5) +
               pos.z * getBasisComponent(basis.basisZ, 5);
  let coord6 = getBasisComponent(basis.origin, 6) +
               pos.x * getBasisComponent(basis.basisX, 6) +
               pos.y * getBasisComponent(basis.basisY, 6) +
               pos.z * getBasisComponent(basis.basisZ, 6);
  let coord7 = getBasisComponent(basis.origin, 7) +
               pos.x * getBasisComponent(basis.basisX, 7) +
               pos.y * getBasisComponent(basis.basisY, 7) +
               pos.z * getBasisComponent(basis.basisZ, 7);
  let coord8 = getBasisComponent(basis.origin, 8) +
               pos.x * getBasisComponent(basis.basisX, 8) +
               pos.y * getBasisComponent(basis.basisY, 8) +
               pos.z * getBasisComponent(basis.basisZ, 8);

  var z0 = coord0; var z1 = coord1; var z2 = coord2; var z3 = coord3;
  var z4 = coord4; var z5 = coord5; var z6 = coord6; var z7 = coord7; var z8 = coord8;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_9D; i++) {
    if (i >= maxIt) { break; }

    let z0_sq = z0 * z0; let z1_sq = z1 * z1; let z2_sq = z2 * z2; let z3_sq = z3 * z3;
    let z4_sq = z4 * z4; let z5_sq = z5 * z5; let z6_sq = z6 * z6; let z7_sq = z7 * z7; let z8_sq = z8 * z8;

    r = sqrt(z0_sq + z1_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq);
    if (r > bail) { break; }

    let powers = optimizedPow9D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    var tailSq = r * r;
    var invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
    invTail = inverseSqrt(max(tailSq, EPS_9D * EPS_9D));
    let t6 = acos(clamp(z6 * invTail, -1.0, 1.0));
    let t7 = atan2(z8, z7);

    let s0 = sin((t0 + phaseT) * pwr); let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr); let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr); let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr); let c3 = cos(t3 * pwr);
    let s4 = sin(t4 * pwr); let c4 = cos(t4 * pwr);
    let s5 = sin(t5 * pwr); let c5 = cos(t5 * pwr);
    let s6 = sin(t6 * pwr); let c6 = cos(t6 * pwr);
    let s7 = sin(t7 * pwr); let c7 = cos(t7 * pwr);

    z0 = rp * c0 + coord0;
    var sp = rp * s0;
    z1 = sp * c1 + coord1; sp *= s1;
    z2 = sp * c2 + coord2; sp *= s2;
    z3 = sp * c3 + coord3; sp *= s3;
    z4 = sp * c4 + coord4; sp *= s4;
    z5 = sp * c5 + coord5; sp *= s5;
    z6 = sp * c6 + coord6; sp *= s6;
    z7 = sp * c7 + coord7;
    z8 = sp * s7 + coord8;
  }

  return max(0.5 * log(max(r, EPS_9D)) * r / max(dr, EPS_9D), EPS_9D);
}
`
