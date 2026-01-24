/**
 * WGSL Julia SDF - 4D (full quaternion with w from basis)
 *
 * Port of GLSL julia/sdf/sdf4d.glsl to WGSL.
 * z = z^n + c where c is Julia constant
 *
 * @module rendering/webgpu/shaders/julia/sdf4d.wgsl
 */

export const sdf4dBlock = /* wgsl */ `
// ============================================
// Quaternion Julia SDF - 4D (full quaternion with w from basis)
// z = z^n + c where c is Julia constant
// ============================================

fn sdfJulia4D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32
) -> vec2f {  // Returns (distance, trap)
  // Map 3D position to 4D quaternion via basis transformation
  let px = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  let py = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  let pz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  let pw = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);

  // z starts at sample position
  var zx = px;
  var zy = py;
  var zz = pz;
  var zw = pw;

  // c is the fixed Julia constant
  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;
  let cw = julia.juliaConstant.w;

  var dr = 1.0;
  var r = 0.0;

  // Orbit traps
  var minPlane: f32 = 1000.0;
  var minAxisSq: f32 = 1000000.0;
  var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;

  // Hoist power check outside loop
  let intPwr = i32(pwr);
  let usePower2 = (intPwr == 2);
  let usePower3 = (intPwr == 3);
  let usePower4 = (intPwr == 4);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    // Cache squared components
    let zx_sq = zx * zx;
    let zy_sq = zy * zy;
    let zz_sq = zz * zz;
    let zw_sq = zw * zw;
    let zxy_sq = zx_sq + zy_sq;

    r = sqrt(zxy_sq + zz_sq + zw_sq);
    if (r > bail) {
      escIt = i;
      break;
    }

    // Orbit traps
    minPlane = min(minPlane, abs(zy));
    minAxisSq = min(minAxisSq, zxy_sq);
    minSphere = min(minSphere, abs(r - 0.8));

    // Derivative using optimized power
    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    // Julia iteration: z = z^n + c
    if (usePower2) {
      // Inline quatSqr for power 2
      let newX = zx_sq - zy_sq - zz_sq - zw_sq;
      let newY = 2.0 * zx * zy;
      let newZ = 2.0 * zx * zz;
      let newW = 2.0 * zx * zw;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
      zw = newW + cw;
    } else if (usePower3) {
      // z^3 = z^2 * z (inline for performance)
      let sqX = zx_sq - zy_sq - zz_sq - zw_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sqW = 2.0 * zx * zw;
      // quatMul(sq, z)
      let newX = sqX * zx - sqY * zy - sqZ * zz - sqW * zw;
      let newY = sqX * zy + sqY * zx + sqZ * zw - sqW * zz;
      let newZ = sqX * zz - sqY * zw + sqZ * zx + sqW * zy;
      let newW = sqX * zw + sqY * zz - sqZ * zy + sqW * zx;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
      zw = newW + cw;
    } else if (usePower4) {
      // z^4 = (z^2)^2 (inline for performance)
      let sqX = zx_sq - zy_sq - zz_sq - zw_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sqW = 2.0 * zx * zw;
      // quatSqr(sq)
      let sq2X = sqX * sqX;
      let sq2Y = sqY * sqY;
      let sq2Z = sqZ * sqZ;
      let sq2W = sqW * sqW;
      zx = sq2X - sq2Y - sq2Z - sq2W + cx;
      zy = 2.0 * sqX * sqY + cy;
      zz = 2.0 * sqX * sqZ + cz;
      zw = 2.0 * sqX * sqW + cw;
    } else {
      // General power using quatPow
      let zVec = quatPow(vec4f(zx, zy, zz, zw), pwr);
      zx = zVec.x + cx;
      zy = zVec.y + cy;
      zz = zVec.z + cz;
      zw = zVec.w + cw;
    }

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

fn sdfJulia4D_simple(pos: vec3f, pwr: f32, bail: f32, maxIt: i32) -> f32 {
  let px = getBasisComponent(basis.origin, 0) +
           pos.x * getBasisComponent(basis.basisX, 0) +
           pos.y * getBasisComponent(basis.basisY, 0) +
           pos.z * getBasisComponent(basis.basisZ, 0);
  let py = getBasisComponent(basis.origin, 1) +
           pos.x * getBasisComponent(basis.basisX, 1) +
           pos.y * getBasisComponent(basis.basisY, 1) +
           pos.z * getBasisComponent(basis.basisZ, 1);
  let pz = getBasisComponent(basis.origin, 2) +
           pos.x * getBasisComponent(basis.basisX, 2) +
           pos.y * getBasisComponent(basis.basisY, 2) +
           pos.z * getBasisComponent(basis.basisZ, 2);
  let pw = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);

  var zx = px;
  var zy = py;
  var zz = pz;
  var zw = pw;

  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;
  let cw = julia.juliaConstant.w;

  var dr = 1.0;
  var r = 0.0;

  let intPwr = i32(pwr);
  let usePower2 = (intPwr == 2);
  let usePower3 = (intPwr == 3);
  let usePower4 = (intPwr == 4);

  for (var i = 0; i < MAX_ITER_HQ; i++) {
    if (i >= maxIt) { break; }

    let zx_sq = zx * zx;
    let zy_sq = zy * zy;
    let zz_sq = zz * zz;
    let zw_sq = zw * zw;

    r = sqrt(zx_sq + zy_sq + zz_sq + zw_sq);
    if (r > bail) { break; }

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    if (usePower2) {
      let newX = zx_sq - zy_sq - zz_sq - zw_sq;
      let newY = 2.0 * zx * zy;
      let newZ = 2.0 * zx * zz;
      let newW = 2.0 * zx * zw;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
      zw = newW + cw;
    } else if (usePower3) {
      let sqX = zx_sq - zy_sq - zz_sq - zw_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sqW = 2.0 * zx * zw;
      let newX = sqX * zx - sqY * zy - sqZ * zz - sqW * zw;
      let newY = sqX * zy + sqY * zx + sqZ * zw - sqW * zz;
      let newZ = sqX * zz - sqY * zw + sqZ * zx + sqW * zy;
      let newW = sqX * zw + sqY * zz - sqZ * zy + sqW * zx;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
      zw = newW + cw;
    } else if (usePower4) {
      let sqX = zx_sq - zy_sq - zz_sq - zw_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sqW = 2.0 * zx * zw;
      let sq2X = sqX * sqX;
      let sq2Y = sqY * sqY;
      let sq2Z = sqZ * sqZ;
      let sq2W = sqW * sqW;
      zx = sq2X - sq2Y - sq2Z - sq2W + cx;
      zy = 2.0 * sqX * sqY + cy;
      zz = 2.0 * sqX * sqZ + cz;
      zw = 2.0 * sqX * sqW + cw;
    } else {
      let zVec = quatPow(vec4f(zx, zy, zz, zw), pwr);
      zx = zVec.x + cx;
      zy = zVec.y + cy;
      zz = zVec.z + cz;
      zw = zVec.w + cw;
    }
  }

  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
