/**
 * WGSL Julia SDF - 9D Hyperspherical Power Map
 *
 * @module rendering/webgpu/shaders/julia/sdf9d.wgsl
 */

export const sdf9dBlock = /* wgsl */ `
// ============================================
// 9D Julia SDF - Hyperspherical Power Map
// ============================================

fn sdfJulia9D(pos: vec3f, pwr: f32, bail: f32, maxIt: i32) -> vec2f {
  var z0 = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  var z1 = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  var z2 = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  var z3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  var z4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  var z5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  var z6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);
  var z7 = getBasisComponent(basis.origin, 7) + pos.x * getBasisComponent(basis.basisX, 7) + pos.y * getBasisComponent(basis.basisY, 7) + pos.z * getBasisComponent(basis.basisZ, 7);
  var z8 = getBasisComponent(basis.origin, 8) + pos.x * getBasisComponent(basis.basisX, 8) + pos.y * getBasisComponent(basis.basisY, 8) + pos.z * getBasisComponent(basis.basisZ, 8);

  let c0 = julia.juliaConstant.x; let c1 = julia.juliaConstant.y;
  let c2 = julia.juliaConstant.z; let c3 = julia.juliaConstant.w;
  let c4 = 0.0; let c5 = 0.0; let c6 = 0.0; let c7 = 0.0; let c8 = 0.0;

  var dr = 1.0; var r = 0.0;
  var minPlane: f32 = 1000.0; var minAxisSq: f32 = 1000000.0; var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;
  let usePower2 = (i32(pwr) == 2);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    let z0_sq = z0*z0; let z1_sq = z1*z1; let z2_sq = z2*z2; let z3_sq = z3*z3;
    let z4_sq = z4*z4; let z5_sq = z5*z5; let z6_sq = z6*z6; let z7_sq = z7*z7; let z8_sq = z8*z8;
    let z01_sq = z0_sq + z1_sq;
    let rSq = z01_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq;
    r = sqrt(rSq);

    if (r > bail) { escIt = i; break; }

    minPlane = min(minPlane, abs(z1));
    minAxisSq = min(minAxisSq, z01_sq);
    minSphere = min(minSphere, abs(r - 0.8));

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    var s0: f32; var c0_: f32; var s1: f32; var c1_: f32;
    var s2: f32; var c2_: f32; var s3: f32; var c3_: f32;
    var s4: f32; var c4_: f32; var s5: f32; var c5_: f32;
    var s6: f32; var c6_: f32; var s7: f32; var c7_: f32;

    if (usePower2) {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS*EPS));
      var arg = clamp(z0 * invTail, -1.0, 1.0);
      c0_ = 2.0*arg*arg - 1.0; s0 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z0_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z1 * invTail, -1.0, 1.0);
      c1_ = 2.0*arg*arg - 1.0; s1 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z1_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z2 * invTail, -1.0, 1.0);
      c2_ = 2.0*arg*arg - 1.0; s2 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z2_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z3 * invTail, -1.0, 1.0);
      c3_ = 2.0*arg*arg - 1.0; s3 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z3_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z4 * invTail, -1.0, 1.0);
      c4_ = 2.0*arg*arg - 1.0; s4 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z4_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z5 * invTail, -1.0, 1.0);
      c5_ = 2.0*arg*arg - 1.0; s5 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z5_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z6 * invTail, -1.0, 1.0);
      c6_ = 2.0*arg*arg - 1.0; s6 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));

      let den78 = max(z7_sq + z8_sq, EPS*EPS);
      c7_ = (z7_sq - z8_sq) / den78;
      s7 = 2.0 * z7 * z8 / den78;
    } else {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t6 = acos(clamp(z6 * invTail, -1.0, 1.0));
      let t7 = atan2(z8, z7);

      s0 = sin(t0 * pwr); c0_ = cos(t0 * pwr);
      s1 = sin(t1 * pwr); c1_ = cos(t1 * pwr);
      s2 = sin(t2 * pwr); c2_ = cos(t2 * pwr);
      s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
      s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
      s5 = sin(t5 * pwr); c5_ = cos(t5 * pwr);
      s6 = sin(t6 * pwr); c6_ = cos(t6 * pwr);
      s7 = sin(t7 * pwr); c7_ = cos(t7 * pwr);
    }

    z0 = rPows.x * c0_ + c0;
    var sp = rPows.x * s0;
    z1 = sp * c1_ + c1; sp *= s1;
    z2 = sp * c2_ + c2; sp *= s2;
    z3 = sp * c3_ + c3; sp *= s3;
    z4 = sp * c4_ + c4; sp *= s4;
    z5 = sp * c5_ + c5; sp *= s5;
    z6 = sp * c6_ + c6; sp *= s6;
    z7 = sp * c7_ + c7;
    z8 = sp * s7 + c8;

    escIt = i;
  }

  let minAxis = sqrt(minAxisSq);
  let trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 + f32(escIt) / f32(max(maxIt, 1)) * 0.3;
  let dist = max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
  return vec2f(dist, trap);
}

fn sdfJulia9D_simple(pos: vec3f, pwr: f32, bail: f32, maxIt: i32) -> f32 {
  var z0 = getBasisComponent(basis.origin, 0) + pos.x * getBasisComponent(basis.basisX, 0) + pos.y * getBasisComponent(basis.basisY, 0) + pos.z * getBasisComponent(basis.basisZ, 0);
  var z1 = getBasisComponent(basis.origin, 1) + pos.x * getBasisComponent(basis.basisX, 1) + pos.y * getBasisComponent(basis.basisY, 1) + pos.z * getBasisComponent(basis.basisZ, 1);
  var z2 = getBasisComponent(basis.origin, 2) + pos.x * getBasisComponent(basis.basisX, 2) + pos.y * getBasisComponent(basis.basisY, 2) + pos.z * getBasisComponent(basis.basisZ, 2);
  var z3 = getBasisComponent(basis.origin, 3) + pos.x * getBasisComponent(basis.basisX, 3) + pos.y * getBasisComponent(basis.basisY, 3) + pos.z * getBasisComponent(basis.basisZ, 3);
  var z4 = getBasisComponent(basis.origin, 4) + pos.x * getBasisComponent(basis.basisX, 4) + pos.y * getBasisComponent(basis.basisY, 4) + pos.z * getBasisComponent(basis.basisZ, 4);
  var z5 = getBasisComponent(basis.origin, 5) + pos.x * getBasisComponent(basis.basisX, 5) + pos.y * getBasisComponent(basis.basisY, 5) + pos.z * getBasisComponent(basis.basisZ, 5);
  var z6 = getBasisComponent(basis.origin, 6) + pos.x * getBasisComponent(basis.basisX, 6) + pos.y * getBasisComponent(basis.basisY, 6) + pos.z * getBasisComponent(basis.basisZ, 6);
  var z7 = getBasisComponent(basis.origin, 7) + pos.x * getBasisComponent(basis.basisX, 7) + pos.y * getBasisComponent(basis.basisY, 7) + pos.z * getBasisComponent(basis.basisZ, 7);
  var z8 = getBasisComponent(basis.origin, 8) + pos.x * getBasisComponent(basis.basisX, 8) + pos.y * getBasisComponent(basis.basisY, 8) + pos.z * getBasisComponent(basis.basisZ, 8);

  let c0 = julia.juliaConstant.x; let c1 = julia.juliaConstant.y;
  let c2 = julia.juliaConstant.z; let c3 = julia.juliaConstant.w;
  let c4 = 0.0; let c5 = 0.0; let c6 = 0.0; let c7 = 0.0; let c8 = 0.0;

  var dr = 1.0; var r = 0.0;
  let usePower2 = (i32(pwr) == 2);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    let z0_sq = z0*z0; let z1_sq = z1*z1; let z2_sq = z2*z2; let z3_sq = z3*z3;
    let z4_sq = z4*z4; let z5_sq = z5*z5; let z6_sq = z6*z6; let z7_sq = z7*z7; let z8_sq = z8*z8;
    let rSq = z0_sq + z1_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq;
    r = sqrt(rSq);

    if (r > bail) { break; }

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    var s0: f32; var c0_: f32; var s1: f32; var c1_: f32;
    var s2: f32; var c2_: f32; var s3: f32; var c3_: f32;
    var s4: f32; var c4_: f32; var s5: f32; var c5_: f32;
    var s6: f32; var c6_: f32; var s7: f32; var c7_: f32;

    if (usePower2) {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS*EPS));
      var arg = clamp(z0 * invTail, -1.0, 1.0);
      c0_ = 2.0*arg*arg - 1.0; s0 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z0_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z1 * invTail, -1.0, 1.0);
      c1_ = 2.0*arg*arg - 1.0; s1 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z1_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z2 * invTail, -1.0, 1.0);
      c2_ = 2.0*arg*arg - 1.0; s2 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z2_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z3 * invTail, -1.0, 1.0);
      c3_ = 2.0*arg*arg - 1.0; s3 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z3_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z4 * invTail, -1.0, 1.0);
      c4_ = 2.0*arg*arg - 1.0; s4 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z4_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z5 * invTail, -1.0, 1.0);
      c5_ = 2.0*arg*arg - 1.0; s5 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));
      tailSq = max(tailSq - z5_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      arg = clamp(z6 * invTail, -1.0, 1.0);
      c6_ = 2.0*arg*arg - 1.0; s6 = 2.0*arg*sqrt(max(1.0 - arg*arg, 0.0));

      let den78 = max(z7_sq + z8_sq, EPS*EPS);
      c7_ = (z7_sq - z8_sq) / den78;
      s7 = 2.0 * z7 * z8 / den78;
    } else {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
      invTail = inverseSqrt(max(tailSq, EPS*EPS));
      let t6 = acos(clamp(z6 * invTail, -1.0, 1.0));
      let t7 = atan2(z8, z7);

      s0 = sin(t0 * pwr); c0_ = cos(t0 * pwr);
      s1 = sin(t1 * pwr); c1_ = cos(t1 * pwr);
      s2 = sin(t2 * pwr); c2_ = cos(t2 * pwr);
      s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
      s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
      s5 = sin(t5 * pwr); c5_ = cos(t5 * pwr);
      s6 = sin(t6 * pwr); c6_ = cos(t6 * pwr);
      s7 = sin(t7 * pwr); c7_ = cos(t7 * pwr);
    }

    z0 = rPows.x * c0_ + c0;
    var sp = rPows.x * s0;
    z1 = sp * c1_ + c1; sp *= s1;
    z2 = sp * c2_ + c2; sp *= s2;
    z3 = sp * c3_ + c3; sp *= s3;
    z4 = sp * c4_ + c4; sp *= s4;
    z5 = sp * c5_ + c5; sp *= s5;
    z6 = sp * c6_ + c6; sp *= s6;
    z7 = sp * c7_ + c7;
    z8 = sp * s7 + c8;
  }

  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
