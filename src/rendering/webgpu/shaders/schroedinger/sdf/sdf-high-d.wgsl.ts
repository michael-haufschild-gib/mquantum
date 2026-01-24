/**
 * WGSL High-dimensional (9D-11D) Mandelbulb-style SDF
 *
 * Uses array-based approach with rotated basis for dimensions 9-11.
 *
 * Port of GLSL schroedinger/sdf/sdf-high-d.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/sdf/sdf-high-d.wgsl
 */

export const sdfHighDBlock = /* wgsl */ `
// High-dimensional SDF (9D-11D) with array-based approach
fn sdfHighD(pos: vec3f, D: i32, pwr: f32, bail: f32, maxIt: i32, uniforms: SchroedingerUniforms) -> vec2f {
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  // Initialize z and c at sample point
  for (var j = 0; j < 11; j++) {
    c[j] = uniforms.origin[j] + pos.x*uniforms.basisX[j] + pos.y*uniforms.basisY[j] + pos.z*uniforms.basisZ[j];
    z[j] = c[j];
  }

  // Phase shifts for angular twisting
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled);

  var dr = 1.0;
  var r = 0.0;
  var minP = 1000.0;
  var minA = 1000.0;
  var minS = 1000.0;
  var escIt = 0;

  for (var i = 0; i < 256; i++) {
    if (i >= maxIt) { break; }

    // Compute r - unrolled for speed
    r = z[0]*z[0] + z[1]*z[1] + z[2]*z[2] + z[3]*z[3] + z[4]*z[4];
    r += z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10];
    r = sqrt(r);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z[1]));
    minA = min(minA, sqrt(z[0]*z[0] + z[1]*z[1]));
    minS = min(minS, abs(r - 0.8));

    dr = pow(max(r, EPS), pwr - 1.0) * pwr * dr + 1.0;

    // Compute angles
    var t: array<f32, 10>;
    var tail2 = r * r;

    for (var k = 0; k < 10; k++) {
      if (k >= D - 2) { break; }
      let tail = sqrt(max(tail2, EPS));
      t[k] = acos(clamp(z[k] / max(tail, EPS), -1.0, 1.0));
      tail2 -= z[k] * z[k];
    }
    t[D - 2] = atan2(z[D - 1], z[D - 2]);

    // Power map and reconstruct with phase shifts
    let rp = pow(max(r, EPS), pwr);
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
  let dist = max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
  return vec2f(dist, trap);
}

fn sdfHighD_simple(pos: vec3f, D: i32, pwr: f32, bail: f32, maxIt: i32, uniforms: SchroedingerUniforms) -> f32 {
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  for (var j = 0; j < 11; j++) {
    c[j] = uniforms.origin[j] + pos.x*uniforms.basisX[j] + pos.y*uniforms.basisY[j] + pos.z*uniforms.basisZ[j];
    z[j] = c[j];
  }

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled);

  var dr = 1.0;
  var r = 0.0;

  for (var i = 0; i < 256; i++) {
    if (i >= maxIt) { break; }

    r = z[0]*z[0] + z[1]*z[1] + z[2]*z[2] + z[3]*z[3] + z[4]*z[4];
    r += z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10];
    r = sqrt(r);

    if (r > bail) { break; }

    dr = pow(max(r, EPS), pwr - 1.0) * pwr * dr + 1.0;

    var t: array<f32, 10>;
    var tail2 = r * r;
    for (var k = 0; k < 10; k++) {
      if (k >= D - 2) { break; }
      let tail = sqrt(max(tail2, EPS));
      t[k] = acos(clamp(z[k] / max(tail, EPS), -1.0, 1.0));
      tail2 -= z[k] * z[k];
    }
    t[D - 2] = atan2(z[D - 1], z[D - 2]);

    let rp = pow(max(r, EPS), pwr);
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

  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
