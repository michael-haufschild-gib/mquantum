/**
 * WGSL Julia SDF - 6D Hyperspherical Power Map
 *
 * Port of GLSL julia/sdf/sdf6d.glsl to WGSL.
 * z = z^n + c where z starts at sample point, c is Julia constant
 *
 * @module rendering/webgpu/shaders/julia/sdf6d.wgsl
 */

export const sdf6dBlock = /* wgsl */ `
// ============================================
// 6D Julia SDF - Hyperspherical Power Map
// z = z^n + c where z starts at sample point, c is Julia constant
// ============================================

fn sdfJulia6D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32
) -> vec2f {
  // Map 3D position to 6D
  var zx = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  var zy = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  var zz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  var z3 = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);
  var z4 = getBasisComponent(basis.origin, 4) +
           pos.x * getBasisComponent(basis.basisX, 4) +
           pos.y * getBasisComponent(basis.basisY, 4) +
           pos.z * getBasisComponent(basis.basisZ, 4);
  var z5 = getBasisComponent(basis.origin, 5) +
           pos.x * getBasisComponent(basis.basisX, 5) +
           pos.y * getBasisComponent(basis.basisY, 5) +
           pos.z * getBasisComponent(basis.basisZ, 5);

  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;
  let c3 = julia.juliaConstant.w;
  let c4 = 0.0;
  let c5 = 0.0;

  var dr = 1.0;
  var r = 0.0;
  var minPlane: f32 = 1000.0;
  var minAxisSq: f32 = 1000000.0;
  var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;

  let usePower2 = (i32(pwr) == 2);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    let zx_sq = zx * zx;
    let zy_sq = zy * zy;
    let zz_sq = zz * zz;
    let z3_sq = z3 * z3;
    let z4_sq = z4 * z4;
    let z5_sq = z5 * z5;
    let zxzy_sq = zx_sq + zy_sq;
    let rSq = zxzy_sq + zz_sq + z3_sq + z4_sq + z5_sq;
    r = sqrt(rSq);

    if (r > bail) { escIt = i; break; }

    minPlane = min(minPlane, abs(zy));
    minAxisSq = min(minAxisSq, zxzy_sq);
    minSphere = min(minSphere, abs(r - 0.8));

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    var s0: f32; var c0: f32;
    var s1: f32; var c1: f32;
    var s2: f32; var c2: f32;
    var s3: f32; var c3_: f32;
    var s4: f32; var c4_: f32;

    if (usePower2) {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg0 = clamp(zz * invTail, -1.0, 1.0);
      c0 = 2.0 * arg0 * arg0 - 1.0;
      s0 = 2.0 * arg0 * sqrt(max(1.0 - arg0 * arg0, 0.0));
      tailSq = max(tailSq - zz_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg1 = clamp(zx * invTail, -1.0, 1.0);
      c1 = 2.0 * arg1 * arg1 - 1.0;
      s1 = 2.0 * arg1 * sqrt(max(1.0 - arg1 * arg1, 0.0));
      tailSq = max(tailSq - zx_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg2 = clamp(zy * invTail, -1.0, 1.0);
      c2 = 2.0 * arg2 * arg2 - 1.0;
      s2 = 2.0 * arg2 * sqrt(max(1.0 - arg2 * arg2, 0.0));
      tailSq = max(tailSq - zy_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg3 = clamp(z3 * invTail, -1.0, 1.0);
      c3_ = 2.0 * arg3 * arg3 - 1.0;
      s3 = 2.0 * arg3 * sqrt(max(1.0 - arg3 * arg3, 0.0));

      let den45 = max(z4_sq + z5_sq, EPS * EPS);
      let invDen45 = 1.0 / den45;
      c4_ = (z4_sq - z5_sq) * invDen45;
      s4 = 2.0 * z4 * z5 * invDen45;
    } else {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t0 = acos(clamp(zz * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zz_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t1 = acos(clamp(zx * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zx_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t2 = acos(clamp(zy * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zy_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t3 = acos(clamp(z3 * invTail, -1.0, 1.0));
      let t4 = atan2(z5, z4);

      s0 = sin(t0 * pwr); c0 = cos(t0 * pwr);
      s1 = sin(t1 * pwr); c1 = cos(t1 * pwr);
      s2 = sin(t2 * pwr); c2 = cos(t2 * pwr);
      s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
      s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
    }

    let p0 = rPows.x;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;
    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p4 * c4_ + c4;
    z5 = p4 * s4 + c5;

    escIt = i;
  }

  let minAxis = sqrt(minAxisSq);
  let trap = exp(-minPlane * 5.0) * 0.3 +
             exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  let dist = max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
  return vec2f(dist, trap);
}

fn sdfJulia6D_simple(pos: vec3f, pwr: f32, bail: f32, maxIt: i32) -> f32 {
  var zx = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  var zy = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  var zz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  var z3 = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);
  var z4 = getBasisComponent(basis.origin, 4) +
           pos.x * getBasisComponent(basis.basisX, 4) +
           pos.y * getBasisComponent(basis.basisY, 4) +
           pos.z * getBasisComponent(basis.basisZ, 4);
  var z5 = getBasisComponent(basis.origin, 5) +
           pos.x * getBasisComponent(basis.basisX, 5) +
           pos.y * getBasisComponent(basis.basisY, 5) +
           pos.z * getBasisComponent(basis.basisZ, 5);

  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;
  let c3 = julia.juliaConstant.w;
  let c4 = 0.0;
  let c5 = 0.0;

  var dr = 1.0;
  var r = 0.0;
  let usePower2 = (i32(pwr) == 2);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    let zx_sq = zx * zx;
    let zy_sq = zy * zy;
    let zz_sq = zz * zz;
    let z3_sq = z3 * z3;
    let z4_sq = z4 * z4;
    let z5_sq = z5 * z5;
    let rSq = zx_sq + zy_sq + zz_sq + z3_sq + z4_sq + z5_sq;
    r = sqrt(rSq);

    if (r > bail) { break; }

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    var s0: f32; var c0: f32;
    var s1: f32; var c1: f32;
    var s2: f32; var c2: f32;
    var s3: f32; var c3_: f32;
    var s4: f32; var c4_: f32;

    if (usePower2) {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg0 = clamp(zz * invTail, -1.0, 1.0);
      c0 = 2.0 * arg0 * arg0 - 1.0;
      s0 = 2.0 * arg0 * sqrt(max(1.0 - arg0 * arg0, 0.0));
      tailSq = max(tailSq - zz_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg1 = clamp(zx * invTail, -1.0, 1.0);
      c1 = 2.0 * arg1 * arg1 - 1.0;
      s1 = 2.0 * arg1 * sqrt(max(1.0 - arg1 * arg1, 0.0));
      tailSq = max(tailSq - zx_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg2 = clamp(zy * invTail, -1.0, 1.0);
      c2 = 2.0 * arg2 * arg2 - 1.0;
      s2 = 2.0 * arg2 * sqrt(max(1.0 - arg2 * arg2, 0.0));
      tailSq = max(tailSq - zy_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      var arg3 = clamp(z3 * invTail, -1.0, 1.0);
      c3_ = 2.0 * arg3 * arg3 - 1.0;
      s3 = 2.0 * arg3 * sqrt(max(1.0 - arg3 * arg3, 0.0));

      let den45 = max(z4_sq + z5_sq, EPS * EPS);
      let invDen45 = 1.0 / den45;
      c4_ = (z4_sq - z5_sq) * invDen45;
      s4 = 2.0 * z4 * z5 * invDen45;
    } else {
      var tailSq = rSq;
      var invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t0 = acos(clamp(zz * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zz_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t1 = acos(clamp(zx * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zx_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t2 = acos(clamp(zy * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zy_sq, 0.0);

      invTail = inverseSqrt(max(tailSq, EPS * EPS));
      let t3 = acos(clamp(z3 * invTail, -1.0, 1.0));
      let t4 = atan2(z5, z4);

      s0 = sin(t0 * pwr); c0 = cos(t0 * pwr);
      s1 = sin(t1 * pwr); c1 = cos(t1 * pwr);
      s2 = sin(t2 * pwr); c2 = cos(t2 * pwr);
      s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
      s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
    }

    let p0 = rPows.x;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;
    let p4 = p3 * s3;
    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p4 * c4_ + c4;
    z5 = p4 * s4 + c5;
  }

  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
