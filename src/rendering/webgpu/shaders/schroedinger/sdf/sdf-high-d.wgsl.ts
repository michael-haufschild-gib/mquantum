/**
 * WGSL High-dimensional (9D-11D) Mandelbulb-style SDF
 *
 * Uses array-based approach with BasisVectors for dimensions 9-11.
 *
 * Port of GLSL schroedinger/sdf/sdf-high-d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf-high-d.wgsl
 */

export const sdfHighDBlock = /* wgsl */ `
// ============================================
// High-dimensional SDF (9D-11D)
// ============================================

const MAX_ITER_HIGHD: i32 = 256;
const EPS_HIGHD: f32 = 1e-6;

/**
 * High-dimensional SDF (9D-11D) with array-based approach.
 *
 * @param pos 3D world position
 * @param D Dimension (9-11)
 * @param pwr Power for iteration
 * @param bail Bailout radius
 * @param maxIt Maximum iterations
 * @param basis N-D basis vectors
 * @param uniforms Schrödinger uniforms
 * @return vec2f where x = signed distance, y = trap value
 */
fn sdfHighD(
  pos: vec3f,
  D: i32,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> vec2f {
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  // Initialize z and c at sample point using basis vectors
  for (var j = 0; j < 11; j++) {
    c[j] = getBasisComponent(basis.origin, j) +
           pos.x * getBasisComponent(basis.basisX, j) +
           pos.y * getBasisComponent(basis.basisY, j) +
           pos.z * getBasisComponent(basis.basisZ, j);
    z[j] = c[j];
  }

  // Phase shifts for angular twisting
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minA: f32 = 1000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  for (var i = 0; i < MAX_ITER_HIGHD; i++) {
    if (i >= maxIt) { break; }

    // Compute r - unrolled for speed
    r = z[0]*z[0] + z[1]*z[1] + z[2]*z[2] + z[3]*z[3] + z[4]*z[4];
    r += z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10];
    r = sqrt(r);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z[1]));
    minA = min(minA, sqrt(z[0]*z[0] + z[1]*z[1]));
    minS = min(minS, abs(r - 0.8));

    dr = pow(max(r, EPS_HIGHD), pwr - 1.0) * pwr * dr + 1.0;

    // Compute angles
    var t: array<f32, 10>;
    var tail2 = r * r;

    for (var k = 0; k < 10; k++) {
      if (k >= D - 2) { break; }
      let tail = sqrt(max(tail2, EPS_HIGHD));
      t[k] = acos(clamp(z[k] / max(tail, EPS_HIGHD), -1.0, 1.0));
      tail2 -= z[k] * z[k];
    }
    t[D - 2] = atan2(z[D - 1], z[D - 2]);

    // Power map and reconstruct with phase shifts
    let rp = pow(max(r, EPS_HIGHD), pwr);
    let s0 = sin((t[0] + phaseT) * pwr);
    let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr);
    let c1 = cos((t[1] + phaseP) * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1];
    sp *= s1;

    for (var k = 2; k < 10; k++) {
      if (k >= D - 2) { break; }
      sp *= sin(t[k - 1] * pwr);
      z[k] = sp * cos(t[k] * pwr) + c[k];
    }

    sp *= sin(t[D - 3] * pwr);
    z[D - 2] = sp * cos(t[D - 2] * pwr) + c[D - 2];
    z[D - 1] = sp * sin(t[D - 2] * pwr) + c[D - 1];

    // Zero out unused dimensions
    for (var k = D; k < 11; k++) { z[k] = 0.0; }
    escIt = i;
  }

  let trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS_HIGHD)) * r / max(dr, EPS_HIGHD), EPS_HIGHD);
  return vec2f(dist, trap);
}

/**
 * High-dimensional SDF - simple version without trap.
 */
fn sdfHighD_simple(
  pos: vec3f,
  D: i32,
  pwr: f32,
  bail: f32,
  maxIt: i32,
  basis: BasisVectors,
  uniforms: SchroedingerUniforms
) -> f32 {
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  for (var j = 0; j < 11; j++) {
    c[j] = getBasisComponent(basis.origin, j) +
           pos.x * getBasisComponent(basis.basisX, j) +
           pos.y * getBasisComponent(basis.basisY, j) +
           pos.z * getBasisComponent(basis.basisZ, j);
    z[j] = c[j];
  }

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  for (var i = 0; i < MAX_ITER_HIGHD; i++) {
    if (i >= maxIt) { break; }

    r = z[0]*z[0] + z[1]*z[1] + z[2]*z[2] + z[3]*z[3] + z[4]*z[4];
    r += z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10];
    r = sqrt(r);

    if (r > bail) { break; }

    dr = pow(max(r, EPS_HIGHD), pwr - 1.0) * pwr * dr + 1.0;

    var t: array<f32, 10>;
    var tail2 = r * r;
    for (var k = 0; k < 10; k++) {
      if (k >= D - 2) { break; }
      let tail = sqrt(max(tail2, EPS_HIGHD));
      t[k] = acos(clamp(z[k] / max(tail, EPS_HIGHD), -1.0, 1.0));
      tail2 -= z[k] * z[k];
    }
    t[D - 2] = atan2(z[D - 1], z[D - 2]);

    let rp = pow(max(r, EPS_HIGHD), pwr);
    let s0 = sin((t[0] + phaseT) * pwr);
    let c0 = cos((t[0] + phaseT) * pwr);
    let s1 = sin((t[1] + phaseP) * pwr);
    let c1 = cos((t[1] + phaseP) * pwr);

    z[0] = rp * c0 + c[0];
    var sp = rp * s0;
    z[1] = sp * c1 + c[1];
    sp *= s1;

    for (var k = 2; k < 10; k++) {
      if (k >= D - 2) { break; }
      sp *= sin(t[k - 1] * pwr);
      z[k] = sp * cos(t[k] * pwr) + c[k];
    }

    sp *= sin(t[D - 3] * pwr);
    z[D - 2] = sp * cos(t[D - 2] * pwr) + c[D - 2];
    z[D - 1] = sp * sin(t[D - 2] * pwr) + c[D - 1];

    for (var k = D; k < 11; k++) { z[k] = 0.0; }
  }

  return max(0.5 * log(max(r, EPS_HIGHD)) * r / max(dr, EPS_HIGHD), EPS_HIGHD);
}
`
