/**
 * WGSL Mandelbulb 5D SDF Block
 *
 * 5-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf5d.glsl to WGSL.
 *
 * NOTE: Scale is handled by the dispatch function (GetDist), NOT here.
 * The SDF works on pure fractal coordinates without scale modification.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf5d.wgsl
 */

export const sdf5dBlock = /* wgsl */ `
// ============================================
// 5D Mandelbulb SDF
// With proper basis transformation (matching WebGL)
// ============================================

// Constants for 5D
const MAX_ITER_5D: i32 = 256;
const EPS_5D: f32 = 1e-6;

/**
 * Optimized pow: computes both r^p and r^(p-1) efficiently.
 * Uses log/exp to share computation.
 */
fn optimizedPow5D(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_5D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * 5D Mandelbulb SDF with orbital trap.
 *
 * @param pos 3D world position (already scaled by dispatch)
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn mandelbulbSDF5D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 5D fractal space using basis vectors (matching WebGL)
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

  // Mandelbulb mode: z starts at c (sample point)
  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;
  var minP: f32 = 1000.0;
  var minASq: f32 = 1000000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  // Phase shifts
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_5D; i++) {
    if (i >= maxIt) { break; }

    // Cache squared values
    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4);

    if (r > bail) {
      escIt = i;
      break;
    }

    minP = min(minP, abs(zy));
    minASq = min(minASq, zxzy_sq);
    minS = min(minS, abs(r - 0.8));

    // Optimized pow: get both r^pwr and r^(pwr-1)
    let powers = optimizedPow5D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // 5D: 4 angles, z-axis primary
    let t0 = acos(clamp(zz / max(r, EPS_5D), -1.0, 1.0));
    let z34_sq = z3 * z3 + z4 * z4;
    let r1 = sqrt(zxzy_sq + z34_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_5D), -1.0, 1.0)), r1 > EPS_5D);
    let r2 = sqrt(zy * zy + z34_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_5D), -1.0, 1.0)), r2 > EPS_5D);
    let t3 = atan2(z4, z3);

    // Compute sin/cos pairs
    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);

    // Product chaining
    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;

    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p3 * s3 + c4;

    escIt = i;
  }

  // Compute trap value
  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 +
             exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  // Distance estimator (no scale division - handled by dispatch)
  let dist = max(0.5 * log(max(r, EPS_5D)) * r / max(dr, EPS_5D), EPS_5D);

  return vec2f(dist, trap);
}

/**
 * 5D Mandelbulb SDF - simple version without trap.
 */
fn mandelbulbSDF5D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // Transform to 5D fractal space using basis vectors
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

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var z3 = c3;
  var z4 = c4;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_5D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + z3 * z3 + z4 * z4);

    if (r > bail) { break; }

    let powers = optimizedPow5D(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    let t0 = acos(clamp(zz / max(r, EPS_5D), -1.0, 1.0));
    let z34_sq = z3 * z3 + z4 * z4;
    let r1 = sqrt(zxzy_sq + z34_sq);
    let t1 = select(0.0, acos(clamp(zx / max(r1, EPS_5D), -1.0, 1.0)), r1 > EPS_5D);
    let r2 = sqrt(zy * zy + z34_sq);
    let t2 = select(0.0, acos(clamp(zy / max(r2, EPS_5D), -1.0, 1.0)), r2 > EPS_5D);
    let t3 = atan2(z4, z3);

    let s0 = sin((t0 + phaseT) * pwr);
    let c0 = cos((t0 + phaseT) * pwr);
    let s1 = sin((t1 + phaseP) * pwr);
    let c1 = cos((t1 + phaseP) * pwr);
    let s2 = sin(t2 * pwr);
    let c2 = cos(t2 * pwr);
    let s3 = sin(t3 * pwr);
    let c3_ = cos(t3 * pwr);

    let p0 = rp;
    let p1 = p0 * s0;
    let p2 = p1 * s1;
    let p3 = p2 * s2;

    zz = p0 * c0 + cz;
    zx = p1 * c1 + cx;
    zy = p2 * c2 + cy;
    z3 = p3 * c3_ + c3;
    z4 = p3 * s3 + c4;
  }

  return max(0.5 * log(max(r, EPS_5D)) * r / max(dr, EPS_5D), EPS_5D);
}
`
