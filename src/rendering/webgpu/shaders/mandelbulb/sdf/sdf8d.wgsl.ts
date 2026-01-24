/**
 * WGSL Mandelbulb 8D SDF Block
 *
 * 8-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf8d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf8d.wgsl
 */

export const sdf8dBlock = /* wgsl */ `
// ============================================
// 8D Mandelbulb SDF (Array-based approach)
// ============================================

const MAX_ITER_8D: i32 = 256;
const EPS_8D: f32 = 1e-6;

fn optimizedPow8D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_8D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 8D Mandelbulb SDF with orbital trap.
 */
fn mandelbulbSDF8D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 8D using basis vectors
  var c: array<f32, 8>;
  var z: array<f32, 8>;

  for (var j = 0; j < 8; j++) {
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

  for (var i = 0; i < MAX_ITER_8D; i++) {
    if (i >= maxIt) { break; }

    // Cache squared values
    var zSq: array<f32, 8>;
    zSq[0] = z[0] * z[0]; zSq[1] = z[1] * z[1];
    let z01_sq = zSq[0] + zSq[1];
    zSq[2] = z[2] * z[2]; zSq[3] = z[3] * z[3]; zSq[4] = z[4] * z[4];
    zSq[5] = z[5] * z[5]; zSq[6] = z[6] * z[6]; zSq[7] = z[7] * z[7];

    r = sqrt(z01_sq + zSq[2] + zSq[3] + zSq[4] + zSq[5] + zSq[6] + zSq[7]);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z[1]));
    minASq = min(minASq, z01_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPow8D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 8D: 7 angles using inversesqrt optimization
    var t: array<f32, 7>;
    var tailSq = r * r;

    for (var k = 0; k < 6; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_8D * EPS_8D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[6] = atan2(z[7], z[6]);

    // Pre-compute sin/cos pairs
    let s0 = sin((t[0] + phaseT) * pwr); let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr); let c1 = cos((t[1] + phaseP) * pwr);
    let s2 = sin(t[2] * pwr); let c2 = cos(t[2] * pwr);
    let s3 = sin(t[3] * pwr); let c3 = cos(t[3] * pwr);
    let s4 = sin(t[4] * pwr); let c4 = cos(t[4] * pwr);
    let s5 = sin(t[5] * pwr); let c5 = cos(t[5] * pwr);
    let s6 = sin(t[6] * pwr); let c6 = cos(t[6] * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1]; sp *= s1;
    z[2] = sp * c2 + c[2]; sp *= s2;
    z[3] = sp * c3 + c[3]; sp *= s3;
    z[4] = sp * c4 + c[4]; sp *= s4;
    z[5] = sp * c5 + c[5]; sp *= s5;
    z[6] = sp * c6 + c[6];
    z[7] = sp * s6 + c[7];

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 + exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_8D)) * r / max(dr, EPS_8D), EPS_8D) / uniforms.scale;

  return vec2f(dist, trap);
}

/**
 * 8D Mandelbulb SDF - simple version.
 */
fn mandelbulbSDF8D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  var c: array<f32, 8>;
  var z: array<f32, 8>;

  for (var j = 0; j < 8; j++) {
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

  for (var i = 0; i < MAX_ITER_8D; i++) {
    if (i >= maxIt) { break; }

    var zSq: array<f32, 8>;
    zSq[0] = z[0] * z[0]; zSq[1] = z[1] * z[1];
    let z01_sq = zSq[0] + zSq[1];
    zSq[2] = z[2] * z[2]; zSq[3] = z[3] * z[3]; zSq[4] = z[4] * z[4];
    zSq[5] = z[5] * z[5]; zSq[6] = z[6] * z[6]; zSq[7] = z[7] * z[7];

    r = sqrt(z01_sq + zSq[2] + zSq[3] + zSq[4] + zSq[5] + zSq[6] + zSq[7]);
    if (r > bail) { break; }

    let powers = optimizedPow8D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    var t: array<f32, 7>;
    var tailSq = r * r;
    for (var k = 0; k < 6; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_8D * EPS_8D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[6] = atan2(z[7], z[6]);

    let s0 = sin((t[0] + phaseT) * pwr); let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr); let c1 = cos((t[1] + phaseP) * pwr);
    let s2 = sin(t[2] * pwr); let c2 = cos(t[2] * pwr);
    let s3 = sin(t[3] * pwr); let c3 = cos(t[3] * pwr);
    let s4 = sin(t[4] * pwr); let c4 = cos(t[4] * pwr);
    let s5 = sin(t[5] * pwr); let c5 = cos(t[5] * pwr);
    let s6 = sin(t[6] * pwr); let c6 = cos(t[6] * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1]; sp *= s1;
    z[2] = sp * c2 + c[2]; sp *= s2;
    z[3] = sp * c3 + c[3]; sp *= s3;
    z[4] = sp * c4 + c[4]; sp *= s4;
    z[5] = sp * c5 + c[5]; sp *= s5;
    z[6] = sp * c6 + c[6];
    z[7] = sp * s6 + c[7];
  }

  return max(0.5 * log(max(r, EPS_8D)) * r / max(dr, EPS_8D), EPS_8D) / uniforms.scale;
}
`
