/**
 * WGSL Julia SDF - Pure 3D (w=0 slice)
 *
 * Port of GLSL julia/sdf/sdf3d.glsl to WGSL.
 * z = z^n + c where c is Julia constant (w component = 0)
 *
 * @module rendering/webgpu/shaders/julia/sdf3d.wgsl
 */

export const sdf3dBlock = /* wgsl */ `
// ============================================
// Quaternion Julia SDF - Pure 3D (w=0 slice)
// z = z^n + c where c is Julia constant (w component = 0)
// ============================================

fn sdfJulia3D(
  pos: vec3f,
  pwr: f32,
  bail: f32,
  maxIt: i32
) -> vec2f {  // Returns (distance, trap)
  // Map 3D position - no w component for pure 3D
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

  // z starts at sample position (w=0 for pure 3D)
  var zx = px;
  var zy = py;
  var zz = pz;

  // c is the fixed Julia constant (only xyz, w=0)
  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;

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
    let zxy_sq = zx_sq + zy_sq;

    r = sqrt(zxy_sq + zz_sq);
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

    // Julia iteration: z = z^n + c (w=0 throughout)
    if (usePower2) {
      // quatSqr with w=0: simpler formula
      let newX = zx_sq - zy_sq - zz_sq;
      let newY = 2.0 * zx * zy;
      let newZ = 2.0 * zx * zz;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
    } else if (usePower3) {
      // z^3 = z^2 * z with w=0
      let sqX = zx_sq - zy_sq - zz_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      // quatMul(sq, z) with w=0
      let newX = sqX * zx - sqY * zy - sqZ * zz;
      let newY = sqX * zy + sqY * zx;
      let newZ = sqX * zz + sqZ * zx;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
    } else if (usePower4) {
      // z^4 = (z^2)^2 with w=0
      let sqX = zx_sq - zy_sq - zz_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sq2X = sqX * sqX;
      let sq2Y = sqY * sqY;
      let sq2Z = sqZ * sqZ;
      zx = sq2X - sq2Y - sq2Z + cx;
      zy = 2.0 * sqX * sqY + cy;
      zz = 2.0 * sqX * sqZ + cz;
    } else {
      // General power using quatPow (with w=0)
      let zVec = quatPow(vec4f(zx, zy, zz, 0.0), pwr);
      zx = zVec.x + cx;
      zy = zVec.y + cy;
      zz = zVec.z + cz;
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

fn sdfJulia3D_simple(pos: vec3f, pwr: f32, bail: f32, maxIt: i32) -> f32 {
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

  var zx = px;
  var zy = py;
  var zz = pz;
  let cx = julia.juliaConstant.x;
  let cy = julia.juliaConstant.y;
  let cz = julia.juliaConstant.z;

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

    r = sqrt(zx_sq + zy_sq + zz_sq);
    if (r > bail) { break; }

    let rPows = optimizedPowJulia(r, pwr);
    dr = pwr * rPows.y * dr;

    if (usePower2) {
      let newX = zx_sq - zy_sq - zz_sq;
      let newY = 2.0 * zx * zy;
      let newZ = 2.0 * zx * zz;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
    } else if (usePower3) {
      let sqX = zx_sq - zy_sq - zz_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let newX = sqX * zx - sqY * zy - sqZ * zz;
      let newY = sqX * zy + sqY * zx;
      let newZ = sqX * zz + sqZ * zx;
      zx = newX + cx;
      zy = newY + cy;
      zz = newZ + cz;
    } else if (usePower4) {
      let sqX = zx_sq - zy_sq - zz_sq;
      let sqY = 2.0 * zx * zy;
      let sqZ = 2.0 * zx * zz;
      let sq2X = sqX * sqX;
      let sq2Y = sqY * sqY;
      let sq2Z = sqZ * sqZ;
      zx = sq2X - sq2Y - sq2Z + cx;
      zy = 2.0 * sqX * sqY + cy;
      zz = 2.0 * sqX * sqZ + cz;
    } else {
      let zVec = quatPow(vec4f(zx, zy, zz, 0.0), pwr);
      zx = zVec.x + cx;
      zy = zVec.y + cy;
      zz = zVec.z + cz;
    }
  }

  return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
