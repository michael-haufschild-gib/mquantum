/**
 * WGSL Mandelbulb High-D SDF Block
 *
 * Generic high-dimensional Mandelbulb signed distance function.
 * Array-based fallback for any dimension up to 11.
 * Port of GLSL sdf-high-d.glsl to WGSL.
 *
 * NOTE: Scale is handled by the dispatch function (GetDist), NOT here.
 * The SDF works on pure fractal coordinates without scale modification.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/sdf-high-d.wgsl
 */

export const sdfHighDBlock = /* wgsl */ `
// ============================================
// High-D Mandelbulb SDF (Array-based fallback)
// Supports dimensions 3-11
// With proper basis transformation (matching WebGL)
// ============================================

const MAX_ITER_HIGH_D: i32 = 256;
const EPS_HIGH_D: f32 = 1e-6;

fn optimizedPowHighD(r: f32, p: f32) -> vec2f {
  let logR = log(max(r, EPS_HIGH_D));
  let rp = exp(logR * p);
  let rpMinus1 = exp(logR * (p - 1.0));
  return vec2f(rp, rpMinus1);
}

/**
 * High-D Mandelbulb SDF with orbital trap.
 * Generic array-based version for any dimension.
 *
 * @param pos 3D world position (already scaled by dispatch)
 * @param dimension The dimension (3-11)
 * @param basis Basis vectors for N-D transformation
 * @param uniforms Mandelbulb uniforms
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn mandelbulbSDFHighD(
  pos: vec3f,
  dimension: i32,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> vec2f {
  // Transform to N-D fractal space using basis vectors (matching WebGL)
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  // Initialize all to 0, then set used dimensions
  for (var j = 0; j < 11; j++) {
    c[j] = 0.0;
    z[j] = 0.0;
  }
  for (var j = 0; j < dimension; j++) {
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
  var minP: f32 = 1000.0;
  var minASq: f32 = 1000000.0;
  var minS: f32 = 1000.0;
  var escIt: i32 = 0;

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  for (var i = 0; i < MAX_ITER_HIGH_D; i++) {
    if (i >= maxIt) { break; }

    // Compute squared values and radius
    var zSq: array<f32, 11>;
    var rSq: f32 = 0.0;
    for (var k = 0; k < dimension; k++) {
      zSq[k] = z[k] * z[k];
      rSq += zSq[k];
    }
    let z01_sq = zSq[0] + zSq[1];
    r = sqrt(rSq);

    if (r > bail) { escIt = i; break; }

    minP = min(minP, abs(z[1]));
    minASq = min(minASq, z01_sq);
    minS = min(minS, abs(r - 0.8));

    let powers = optimizedPowHighD(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    // Compute angles
    var t: array<f32, 10>;
    var tailSq = r * r;
    for (var k = 0; k < dimension - 2; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_HIGH_D * EPS_HIGH_D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[dimension - 2] = atan2(z[dimension - 1], z[dimension - 2]);

    // Pre-compute sin/cos pairs
    var sinT: array<f32, 10>;
    var cosT: array<f32, 10>;
    sinT[0] = sin((t[0] + phaseT) * pwr); cosT[0] = cos((t[0] + phaseT) * pwr);
    sinT[1] = sin((t[1] + phaseP) * pwr); cosT[1] = cos((t[1] + phaseP) * pwr);
    for (var k = 2; k < dimension - 1; k++) {
      sinT[k] = sin(t[k] * pwr);
      cosT[k] = cos(t[k] * pwr);
    }

    // Reconstruct coordinates
    z[0] = rp * cosT[0] + c[0];
    var sp = rp * sinT[0];
    z[1] = sp * cosT[1] + c[1];
    sp *= sinT[1];
    for (var k = 2; k < dimension - 2; k++) {
      z[k] = sp * cosT[k] + c[k];
      sp *= sinT[k];
    }
    z[dimension - 2] = sp * cosT[dimension - 2] + c[dimension - 2];
    z[dimension - 1] = sp * sinT[dimension - 2] + c[dimension - 1];

    escIt = i;
  }

  let minA = sqrt(minASq);
  let trap = exp(-minP * 5.0) * 0.3 +
             exp(-minA * 3.0) * 0.2 +
             exp(-minS * 8.0) * 0.2 +
             f32(escIt) / f32(max(maxIt, 1)) * 0.3;

  // Distance estimator (no scale division - handled by dispatch)
  let dist = max(0.5 * log(max(r, EPS_HIGH_D)) * r / max(dr, EPS_HIGH_D), EPS_HIGH_D);

  return vec2f(dist, trap);
}

/**
 * High-D Mandelbulb SDF - simple version without trap.
 */
fn mandelbulbSDFHighD_simple(
  pos: vec3f,
  dimension: i32,
  basis: BasisVectors,
  uniforms: MandelbulbUniforms
) -> f32 {
  // Transform to N-D fractal space using basis vectors
  var c: array<f32, 11>;
  var z: array<f32, 11>;

  for (var j = 0; j < 11; j++) {
    c[j] = 0.0;
    z[j] = 0.0;
  }
  for (var j = 0; j < dimension; j++) {
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

  let pwr = uniforms.effectivePower;
  let bail = uniforms.effectiveBailout;
  let maxIt = i32(uniforms.iterations);

  for (var i = 0; i < MAX_ITER_HIGH_D; i++) {
    if (i >= maxIt) { break; }

    var zSq: array<f32, 11>;
    var rSq: f32 = 0.0;
    for (var k = 0; k < dimension; k++) {
      zSq[k] = z[k] * z[k];
      rSq += zSq[k];
    }
    r = sqrt(rSq);
    if (r > bail) { break; }

    let powers = optimizedPowHighD(r, pwr);
    let rp = powers.x;
    let rpMinus1 = powers.y;
    dr = rpMinus1 * pwr * dr + 1.0;

    var t: array<f32, 10>;
    var tailSq = r * r;
    for (var k = 0; k < dimension - 2; k++) {
      let invTail = inverseSqrt(max(tailSq, EPS_HIGH_D * EPS_HIGH_D));
      t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
      tailSq = max(tailSq - zSq[k], 0.0);
    }
    t[dimension - 2] = atan2(z[dimension - 1], z[dimension - 2]);

    var sinT: array<f32, 10>;
    var cosT: array<f32, 10>;
    sinT[0] = sin((t[0] + phaseT) * pwr); cosT[0] = cos((t[0] + phaseT) * pwr);
    sinT[1] = sin((t[1] + phaseP) * pwr); cosT[1] = cos((t[1] + phaseP) * pwr);
    for (var k = 2; k < dimension - 1; k++) {
      sinT[k] = sin(t[k] * pwr);
      cosT[k] = cos(t[k] * pwr);
    }

    z[0] = rp * cosT[0] + c[0];
    var sp = rp * sinT[0];
    z[1] = sp * cosT[1] + c[1];
    sp *= sinT[1];
    for (var k = 2; k < dimension - 2; k++) {
      z[k] = sp * cosT[k] + c[k];
      sp *= sinT[k];
    }
    z[dimension - 2] = sp * cosT[dimension - 2] + c[dimension - 2];
    z[dimension - 1] = sp * sinT[dimension - 2] + c[dimension - 1];
  }

  return max(0.5 * log(max(r, EPS_HIGH_D)) * r / max(dr, EPS_HIGH_D), EPS_HIGH_D);
}
`
