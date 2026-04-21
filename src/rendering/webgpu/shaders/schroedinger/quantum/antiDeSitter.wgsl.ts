/**
 * WGSL math for Anti-de Sitter bound-state eigenstates.
 *
 * Self-contained port of `src/lib/physics/antiDeSitter/math.ts` — no
 * dependencies on the fragment-shader quantum math chain. Functions:
 *   - lnGamma(x)            Lanczos log-gamma (g = 7)
 *   - lnFactorial(k)        log(k!) via lnGamma
 *   - jacobiP(n, α, β, x)   Jacobi polynomial via DLMF 18.9.1 recurrence
 *   - adsRadialNorm(...)     normalization coefficient N
 *   - adsAssocLegendre(...)  associated Legendre P_ℓ^m(x)
 *   - adsSphericalY(...)     real-valued Y_ℓm(θ, φ)
 *   - adsAngularHarmonic(...) dimension-aware angular part
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/antiDeSitter.wgsl
 */

export const antiDeSitterMathBlock = /* wgsl */ `
// ============================================
// Anti-de Sitter Math (self-contained)
// ============================================

const ADS_PI: f32 = 3.14159265;
const ADS_TWO_PI: f32 = 6.28318530;
const ADS_SQRT2: f32 = 1.41421356;
const ADS_HALF_PI: f32 = 1.57079632;
const ADS_LN_TWO_PI_HALF: f32 = 0.91893853; // 0.5 * log(2π)

// Lanczos g = 7 coefficients for log-gamma.
const ADS_LANCZOS_G: f32 = 7.0;
const ADS_LANCZOS_C0: f32 = 0.99999999999980993;
const ADS_LANCZOS_C1: f32 = 676.5203681218851;
const ADS_LANCZOS_C2: f32 = -1259.1392167224028;
const ADS_LANCZOS_C3: f32 = 771.32342777653134;
const ADS_LANCZOS_C4: f32 = -176.61502916214059;
const ADS_LANCZOS_C5: f32 = 12.507343278686905;
const ADS_LANCZOS_C6: f32 = -0.13857109526572012;
const ADS_LANCZOS_C7: f32 = 9.9843695780195716e-6;
const ADS_LANCZOS_C8: f32 = 1.5056327351493116e-7;

fn adsLnGammaPositive(x: f32) -> f32 {
  let z = x - 1.0;
  var a = ADS_LANCZOS_C0;
  a += ADS_LANCZOS_C1 / (z + 1.0);
  a += ADS_LANCZOS_C2 / (z + 2.0);
  a += ADS_LANCZOS_C3 / (z + 3.0);
  a += ADS_LANCZOS_C4 / (z + 4.0);
  a += ADS_LANCZOS_C5 / (z + 5.0);
  a += ADS_LANCZOS_C6 / (z + 6.0);
  a += ADS_LANCZOS_C7 / (z + 7.0);
  a += ADS_LANCZOS_C8 / (z + 8.0);
  let t = z + ADS_LANCZOS_G + 0.5;
  return ADS_LN_TWO_PI_HALF + (z + 0.5) * log(t) - t + log(a);
}

fn adsLnGamma(x: f32) -> f32 {
  if (x >= 0.5) {
    return adsLnGammaPositive(x);
  }
  // Reflection: Γ(x)Γ(1-x) = π/sin(πx)
  return log(ADS_PI / abs(sin(ADS_PI * x)))
         - adsLnGammaPositive(1.0 - x);
}

fn adsLnFactorial(k: i32) -> f32 {
  if (k <= 1) { return 0.0; }
  return adsLnGamma(f32(k) + 1.0);
}

// Jacobi P_n^{(α,β)}(x) via DLMF 18.9.1 three-term recurrence.
fn adsJacobiP(n: i32, alpha: f32, beta: f32, x: f32) -> f32 {
  if (n < 0) { return 0.0; }
  if (n == 0) { return 1.0; }
  let p1 = 0.5 * (alpha - beta + (alpha + beta + 2.0) * x);
  if (n == 1) { return p1; }

  var pPrev = 1.0;
  var pCurr = p1;
  let ab = alpha + beta;

  for (var k = 2; k <= n; k++) {
    let fk = f32(k);
    let kNum = 2.0 * fk + ab;
    let denom = 2.0 * fk * (fk + ab) * (kNum - 2.0);
    if (abs(denom) < 1e-14) { return 0.0; }
    let aCoeff = (kNum - 1.0) * (kNum * (kNum - 2.0) * x + alpha * alpha - beta * beta);
    let bCoeff = 2.0 * (fk + alpha - 1.0) * (fk + beta - 1.0) * kNum;
    let pNext = (aCoeff * pCurr - bCoeff * pPrev) / denom;
    pPrev = pCurr;
    pCurr = pNext;
  }
  return pCurr;
}

// Radial normalization N.
fn adsRadialNorm(n: i32, l: i32, delta: f32, d: i32) -> f32 {
  let fn_ = f32(n);
  let fl = f32(l);
  let fd = f32(d);
  let alpha = fl + (fd - 3.0) / 2.0;
  let beta = delta - (fd - 1.0) / 2.0;
  let lnN2 = log(2.0)
    + log(2.0 * fn_ + delta + fl)
    + adsLnFactorial(n)
    + adsLnGamma(fn_ + delta + fl)
    - adsLnGamma(fn_ + alpha + 1.0)
    - adsLnGamma(fn_ + beta + 1.0);
  return exp(lnN2 * 0.5);
}

// Associated Legendre P_l^m(x), m >= 0, Condon-Shortley phase included.
fn adsAssocLegendre(l: i32, m: i32, x: f32) -> f32 {
  let absM = abs(m);
  if (absM > l) { return 0.0; }

  let xc = clamp(x, -1.0, 1.0);
  let somx2 = sqrt(max(0.0, 1.0 - xc * xc));

  var pmm = 1.0;
  if (absM > 0) {
    var fact = 1.0;
    for (var i = 1; i <= absM; i++) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }
  if (l == absM) { return pmm; }

  let fm = f32(absM);
  var pmmp1 = xc * (2.0 * fm + 1.0) * pmm;
  if (l == absM + 1) { return pmmp1; }

  var pll = pmmp1;
  for (var ll = absM + 2; ll <= l; ll++) {
    let fll = f32(ll);
    pll = (xc * (2.0 * fll - 1.0) * pmmp1 - (fll + fm - 1.0) * pmm) / (fll - fm);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

// Real-valued spherical harmonic Y_lm(theta, phi).
fn adsSphericalY(l: i32, m: i32, theta: f32, phi: f32) -> f32 {
  if (l < 0 || abs(m) > l) { return 0.0; }
  let absM = abs(m);
  let fl = f32(l);
  let P = adsAssocLegendre(l, absM, cos(theta));
  let lnNormSq = log((2.0 * fl + 1.0) / (4.0 * ADS_PI))
    + adsLnFactorial(l - absM)
    - adsLnFactorial(l + absM);
  let normBase = exp(lnNormSq * 0.5);
  let norm = select(normBase, ADS_SQRT2 * normBase, m != 0);
  if (m > 0) { return norm * P * cos(f32(m) * phi); }
  if (m < 0) { return norm * P * sin(f32(absM) * phi); }
  return norm * P;
}

// Dimension-aware angular harmonic.
// d=3: S^1 (cylindrical), d>=4: S^2 Y_lm.
fn adsAngularHarmonic(l: i32, m: i32, d: i32, theta: f32, phi: f32) -> f32 {
  if (d <= 3) {
    if (l <= 0) { return 1.0 / sqrt(2.0 * ADS_PI); }
    let inv = 1.0 / sqrt(ADS_PI);
    if (m >= 0) { return inv * cos(f32(l) * phi); }
    return inv * sin(f32(l) * phi);
  }
  return adsSphericalY(l, m, theta, phi);
}
`

/**
 * AdS config uniform struct for the compute shader.
 * Passed at @group(0) @binding(4) in the compute pass.
 */
export const adsConfigUniformBlock = /* wgsl */ `
// ============================================
// Anti-de Sitter Config Uniforms
// ============================================

struct AdsConfig {
  d: i32,                // Boundary dimension (3-7)
  n: i32,                // Radial quantum number (0-4)
  l: i32,                // Angular momentum (0-3)
  m: i32,                // Magnetic quantum number (-l..+l)
  mL: f32,              // Mass × AdS radius (signed)
  delta: f32,            // Effective conformal dimension Δ
  boundaryOverlay: u32,  // 1 = render boundary primary shell
  _pad: u32,             // 16-byte alignment padding
}
`

/**
 * Compute shader bindings for AdS density pass.
 * Follows the DensityGridComputePass pattern:
 *   binding 0: SchroedingerUniforms (for boundingRadius, time, densityGain)
 *   binding 1: BasisVectors (for rotation)
 *   binding 2: GridParams (grid size, world bounds)
 *   binding 3: Output density texture (rgba16float, write)
 *   binding 4: AdsConfig
 */
export const adsComputeBindingsBlock = /* wgsl */ `
// ============================================
// AdS Compute Shader Bind Groups
// ============================================

@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;
@group(0) @binding(3) var densityGrid: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var<uniform> adsConfig: AdsConfig;
`

/**
 * Compute shader entry point for AdS bound-state density.
 *
 * Writes density in world-aligned coordinates (no rotation). Rotation is
 * applied at fragment-shader sample time via SAMPLE_SPACE_ROTATION so
 * ALL AdS sub-modes (bound-state, BTZ, HKLL) rotate uniformly.
 */
export const adsBoundStateComputeBlock = /* wgsl */ `
// ============================================
// AdS Bound-State Density Compute
// ============================================

const ADS_BOUNDARY_SHELL_MIN: f32 = 0.975;
const ADS_BOUNDARY_SHELL_MAX: f32 = 0.995;

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let gridSize = gridParams.gridSize;
  if (any(global_id >= gridSize)) { return; }

  let N = f32(gridSize.x);
  let fid = vec3f(global_id) + 0.5;
  // World pos in [-1, 1] (Poincaré ball is always unit radius).
  // No rotation applied here — rotation lives in the fragment shader
  // (SAMPLE_SPACE_ROTATION) so BTZ/HKLL CPU-packed textures also rotate.
  let worldPos = fid / N * 2.0 - 1.0;

  let rCompact = length(worldPos);

  // Outside the unit ball → zero density.
  if (rCompact >= 1.0) {
    textureStore(densityGrid, global_id, vec4f(0.0));
    return;
  }

  let rho = 2.0 * atan(rCompact);
  if (rho <= 0.0 || rho >= ADS_HALF_PI) {
    textureStore(densityGrid, global_id, vec4f(0.0));
    return;
  }

  let d = adsConfig.d;
  let n = adsConfig.n;
  let l = adsConfig.l;
  let m = adsConfig.m;
  let delta = adsConfig.delta;

  let fd = f32(d);
  let fl = f32(l);
  let alpha = fl + (fd - 3.0) / 2.0;
  let beta = delta - (fd - 1.0) / 2.0;
  let norm = adsRadialNorm(n, l, delta, d);

  // Radial wavefunction R(ρ).
  let cosRho = cos(rho);
  let sinRho = sin(rho);
  let cosPow = pow(abs(cosRho), delta);
  let sinPow = select(pow(abs(sinRho), fl), 1.0, l == 0);
  let jacobi = adsJacobiP(n, alpha, beta, cos(2.0 * rho));
  let R = norm * cosPow * sinPow * jacobi;

  // Angular harmonic Y(Ω).
  var Y: f32;
  if (l == 0 && d >= 4) {
    Y = 1.0 / sqrt(4.0 * ADS_PI);
  } else {
    let invR = select(1.0 / rCompact, 0.0, rCompact < 1e-10);
    let theta = acos(clamp(worldPos.z * invR, -1.0, 1.0));
    let phi = atan2(worldPos.y, worldPos.x);
    Y = adsAngularHarmonic(l, m, d, theta, phi);
  }

  let psi = R * Y;
  let rho2 = psi * psi;
  let logRho = log(rho2 + 1e-10);
  // Phase: real eigenstate at t=0 → 0 (ψ ≥ 0) or π (ψ < 0).
  let phase = select(0.0, ADS_PI, psi < 0.0);

  // Boundary overlay: thin shell at r ≈ 0.98.
  var boundary: f32 = 0.0;
  if (adsConfig.boundaryOverlay != 0u
      && rCompact >= ADS_BOUNDARY_SHELL_MIN
      && rCompact < ADS_BOUNDARY_SHELL_MAX) {
    let bSinRho = sin(rho);
    let bSin2l = select(pow(abs(bSinRho), 2.0 * fl), 1.0, l == 0);
    let bJacobi = adsJacobiP(n, alpha, beta, cos(2.0 * rho));

    var bY: f32;
    if (l == 0 && d >= 4) {
      bY = 1.0 / sqrt(4.0 * ADS_PI);
    } else {
      let bInvR = select(1.0 / rCompact, 0.0, rCompact < 1e-10);
      let bTheta = acos(clamp(worldPos.z * bInvR, -1.0, 1.0));
      let bPhi = atan2(worldPos.y, worldPos.x);
      bY = adsAngularHarmonic(l, m, d, bTheta, bPhi);
    }
    let normSq = norm * norm;
    boundary = normSq * bSin2l * bJacobi * bJacobi * bY * bY;
  }

  textureStore(densityGrid, global_id, vec4f(rho2, logRho, phase, boundary));
}
`
