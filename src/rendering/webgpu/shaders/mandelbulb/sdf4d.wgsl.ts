/**
 * WGSL Mandelbulb 4D SDF Block
 *
 * 4-dimensional Mandelbulb signed distance function.
 * Port of GLSL sdf4d.glsl to WGSL.
 *
 * NOTE: Scale is handled by the dispatch function (GetDist), NOT here.
 * The SDF works on pure fractal coordinates without scale modification.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf4d.wgsl
 */

export const sdf4dBlock = /* wgsl */ `
// ============================================
// 4D Mandelbulb SDF
// With proper basis transformation (matching WebGL)
// ============================================

// Constants for 4D
const MAX_ITER_4D: i32 = 256;
const EPS_4D: f32 = 1e-6;

/**
 * 4D Mandelbulb SDF with orbital trap.
 *
 * @param pos 3D world position (already scaled by dispatch)
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn mandelbulbSDF4D(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to 4D fractal space using basis vectors (matching WebGL)
  // c = origin + pos.x*basisX + pos.y*basisY + pos.z*basisZ
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
  let cw = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);

  // Mandelbulb mode: z starts at c (sample point)
  var zx = cx;
  var zy = cy;
  var zz = cz;
  var zw = cw;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  // Orbit traps (matching WebGL optimization)
  var minPlane: f32 = 1000.0;
  var minAxisSq: f32 = 1000000.0;
  var minSphere: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  // Phase shifts
  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_4D; i++) {
    if (i >= maxIt) { break; }

    // Cache zxzy_sq for r and minAxisSq calculations (OPT-M1)
    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + zw * zw);

    if (r > bail) {
      escIt = i;
      break;
    }

    // Orbit traps (using z-axis primary convention)
    minPlane = min(minPlane, abs(zy));
    minAxisSq = min(minAxisSq, zxzy_sq);
    minSphere = min(minSphere, abs(r - 0.8));

    // Optimized power calculation
    let rPowMinus1 = pow(max(r, EPS_4D), pwr - 1.0);
    dr = rPowMinus1 * pwr * dr + 1.0;

    // To hyperspherical: z-axis primary (like Mandelbulb)
    let theta = acos(clamp(zz / max(r, EPS_4D), -1.0, 1.0));

    // OPT-M1: Cache z values for angle calculations
    let rxyw = sqrt(max(0.0, zxzy_sq + zw * zw));
    let phi = select(0.0, acos(clamp(zx / max(rxyw, EPS_4D), -1.0, 1.0)), rxyw > EPS_4D);
    let psi = atan2(zw, zy);

    // Power map: angles * n (with phase shift)
    let thetaN = (theta + phaseT) * pwr;
    let phiN = (phi + phaseP) * pwr;
    let psiN = psi * pwr;

    // From hyperspherical: z-axis primary reconstruction
    let rp = rPowMinus1 * r;  // r^power
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);
    let cPsi = cos(psiN);
    let sPsi = sin(psiN);

    let rSinTheta = rp * sTheta;
    let rSinThetaSinPhi = rSinTheta * sPhi;

    zz = rp * cTheta + cz;
    zx = rSinTheta * cPhi + cx;
    zy = rSinThetaSinPhi * cPsi + cy;
    zw = rSinThetaSinPhi * sPsi + cw;

    escIt = i;
  }

  // Compute trap value (OPT-C5: single sqrt after loop)
  let minAxis = sqrt(minAxisSq);
  let trap = exp(-minPlane * 5.0) * 0.3 +
             exp(-minAxis * 3.0) * 0.2 +
             exp(-minSphere * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  // Distance estimator (no scale division - handled by dispatch)
  let dist = max(0.5 * log(max(r, EPS_4D)) * r / max(dr, EPS_4D), EPS_4D);

  return vec2f(dist, trap);
}

/**
 * 4D Mandelbulb SDF - simple version without trap.
 */
fn mandelbulbSDF4D_simple(
  pos: vec3f,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // Transform to 4D fractal space using basis vectors
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
  let cw = getBasisComponent(basis.origin, 3) +
           pos.x * getBasisComponent(basis.basisX, 3) +
           pos.y * getBasisComponent(basis.basisY, 3) +
           pos.z * getBasisComponent(basis.basisZ, 3);

  var zx = cx;
  var zy = cy;
  var zz = cz;
  var zw = cw;

  var dr: f32 = 1.0;
  var r: f32 = 0.0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  let phaseT = select(0.0, uniforms.phaseTheta, uniforms.phaseEnabled != 0u);
  let phaseP = select(0.0, uniforms.phasePhi, uniforms.phaseEnabled != 0u);

  for (var i = 0; i < MAX_ITER_4D; i++) {
    if (i >= maxIt) { break; }

    let zxzy_sq = zx * zx + zy * zy;
    r = sqrt(zxzy_sq + zz * zz + zw * zw);
    if (r > bail) { break; }

    let rPowMinus1 = pow(max(r, EPS_4D), pwr - 1.0);
    dr = rPowMinus1 * pwr * dr + 1.0;

    let theta = acos(clamp(zz / max(r, EPS_4D), -1.0, 1.0));
    let rxyw = sqrt(max(0.0, zxzy_sq + zw * zw));
    let phi = select(0.0, acos(clamp(zx / max(rxyw, EPS_4D), -1.0, 1.0)), rxyw > EPS_4D);
    let psi = atan2(zw, zy);

    let thetaN = (theta + phaseT) * pwr;
    let phiN = (phi + phaseP) * pwr;
    let psiN = psi * pwr;

    let rp = rPowMinus1 * r;
    let cTheta = cos(thetaN);
    let sTheta = sin(thetaN);
    let cPhi = cos(phiN);
    let sPhi = sin(phiN);
    let cPsi = cos(psiN);
    let sPsi = sin(psiN);

    let rSinThetaSinPhi = rp * sTheta * sPhi;

    zz = rp * cTheta + cz;
    zx = rp * sTheta * cPhi + cx;
    zy = rSinThetaSinPhi * cPsi + cy;
    zw = rSinThetaSinPhi * sPsi + cw;
  }

  return max(0.5 * log(max(r, EPS_4D)) * r / max(dr, EPS_4D), EPS_4D);
}
`
