/**
 * WGSL Mandelbulb 10D SDF Block
 *
 * 10-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf10d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf10d.wgsl
 */

export const sdf10dBlock = /* wgsl */ `
// ============================================
// 10D Mandelbulb SDF (Fully unrolled)
// ============================================

const MAX_ITER_10D: i32 = 256;
const EPS_10D: f32 = 1e-6;

fn optimizedPow10D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_10D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 10D Mandelbulb SDF with orbital trap.
 */
fn mandelbulbSDF10D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 10D using basis vectors
  var c: array<f32, 10>;
  var z: array<f32, 10>;

  for (var j = 0; j < 10; j++) {
    c[j] = (getBasisComponent(basis.origin, j) +
            pos.x * getBasisComponent(basis.basisX, j) +
            pos.y * getBasisComponent(basis.basisY, j) +
            pos.z * getBasisComponent(basis.basisZ, j)) * uniforms.scale;
    z[j] = c[j];
  }

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minASq: f32 = 1000000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.sdfMaxIterations);

  for (var i = 0; i < MAX_ITER_10D; i++) {
    if (i >= maxIt) { break; }

    // Cache squared values
    var zSq: array<f32, 10>;
    zSq[0] = z[0] * z[0]; zSq[1] = z[1] * z[1];
    let z01_sq = zSq[0] + zSq[1];
    zSq[2] = z[2] * z[2]; zSq[3] = z[3] * z[3]; zSq[4] = z[4] * z[4];
    zSq[5] = z[5] * z[5]; zSq[6] = z[6] * z[6]; zSq[7] = z[7] * z[7];
    zSq[8] = z[8] * z[8]; zSq[9] = z[9] * z[9];

    r = sqrt(z01_sq + zSq[2] + zSq[3] + zSq[4] + zSq[5] + zSq[6] + zSq[7] + zSq[8] + zSq[9]);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z[1]));
    minASq = min(minASq, z01_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPow10D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 10D: 9 angles using inverseSqrt optimization
    var t: array<f32, 9>;
    var tailSq = r * r;

    for (var k = 0; k < 8; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_10D * EPS_10D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[8] = atan2(z[9], z[8]);

    // Pre-compute sin/cos pairs
    let s0 = sin((t[0] + phaseT) * pwr); let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr); let c1 = cos((t[1] + phaseP) * pwr);
    let s2 = sin(t[2] * pwr); let c2 = cos(t[2] * pwr);
    let s3 = sin(t[3] * pwr); let c3 = cos(t[3] * pwr);
    let s4 = sin(t[4] * pwr); let c4 = cos(t[4] * pwr);
    let s5 = sin(t[5] * pwr); let c5 = cos(t[5] * pwr);
    let s6 = sin(t[6] * pwr); let c6 = cos(t[6] * pwr);
    let s7 = sin(t[7] * pwr); let c7 = cos(t[7] * pwr);
    let s8 = sin(t[8] * pwr); let c8 = cos(t[8] * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1]; sp *= s1;
    z[2] = sp * c2 + c[2]; sp *= s2;
    z[3] = sp * c3 + c[3]; sp *= s3;
    z[4] = sp * c4 + c[4]; sp *= s4;
    z[5] = sp * c5 + c[5]; sp *= s5;
    z[6] = sp * c6 + c[6]; sp *= s6;
    z[7] = sp * c7 + c[7]; sp *= s7;
    z[8] = sp * c8 + c[8];
    z[9] = sp * s8 + c[9];

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 + exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_10D)) * r / max(dr, EPS_10D), EPS_10D) / uniforms.scale;

  return vec2f(dist, trap);
}

/**
 * 10D Mandelbulb SDF - simple version.
 */
fn mandelbulbSDF10D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  var c: array<f32, 10>;
  var z: array<f32, 10>;

  for (var j = 0; j < 10; j++) {
    c[j] = (getBasisComponent(basis.origin, j) +
            pos.x * getBasisComponent(basis.basisX, j) +
            pos.y * getBasisComponent(basis.basisY, j) +
            pos.z * getBasisComponent(basis.basisZ, j)) * uniforms.scale;
    z[j] = c[j];
  }

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.sdfMaxIterations);

  for (var i = 0; i < MAX_ITER_10D; i++) {
    if (i >= maxIt) { break; }

    var zSq: array<f32, 10>;
    zSq[0] = z[0] * z[0]; zSq[1] = z[1] * z[1];
    let z01_sq = zSq[0] + zSq[1];
    zSq[2] = z[2] * z[2]; zSq[3] = z[3] * z[3]; zSq[4] = z[4] * z[4];
    zSq[5] = z[5] * z[5]; zSq[6] = z[6] * z[6]; zSq[7] = z[7] * z[7];
    zSq[8] = z[8] * z[8]; zSq[9] = z[9] * z[9];

    r = sqrt(z01_sq + zSq[2] + zSq[3] + zSq[4] + zSq[5] + zSq[6] + zSq[7] + zSq[8] + zSq[9]);
    if (r > bail) { break; }

    let powers = optimizedPow10D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    var t: array<f32, 9>;
    var tailSq = r * r;
    for (var k = 0; k < 8; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_10D * EPS_10D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[8] = atan2(z[9], z[8]);

    let s0 = sin((t[0] + phaseT) * pwr); let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr); let c1 = cos((t[1] + phaseP) * pwr);
    let s2 = sin(t[2] * pwr); let c2 = cos(t[2] * pwr);
    let s3 = sin(t[3] * pwr); let c3 = cos(t[3] * pwr);
    let s4 = sin(t[4] * pwr); let c4 = cos(t[4] * pwr);
    let s5 = sin(t[5] * pwr); let c5 = cos(t[5] * pwr);
    let s6 = sin(t[6] * pwr); let c6 = cos(t[6] * pwr);
    let s7 = sin(t[7] * pwr); let c7 = cos(t[7] * pwr);
    let s8 = sin(t[8] * pwr); let c8 = cos(t[8] * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1]; sp *= s1;
    z[2] = sp * c2 + c[2]; sp *= s2;
    z[3] = sp * c3 + c[3]; sp *= s3;
    z[4] = sp * c4 + c[4]; sp *= s4;
    z[5] = sp * c5 + c[5]; sp *= s5;
    z[6] = sp * c6 + c[6]; sp *= s6;
    z[7] = sp * c7 + c[7]; sp *= s7;
    z[8] = sp * c8 + c[8];
    z[9] = sp * s8 + c[9];
  }

  return max(0.5 * log(max(r, EPS_10D)) * r / max(dr, EPS_10D), EPS_10D) / uniforms.scale;
}
`
