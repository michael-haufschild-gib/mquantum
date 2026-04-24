/**
 * WGSL Hyperspherical Harmonics for D-dimensional Coupled Hydrogen
 *
 * Evaluates the D-dimensional hyperspherical harmonics:
 *   Y_{l₁l₂...l_{D-2}}(θ₁,...,θ_{D-2},φ)
 *     = ∏_{k=1}^{D-3} [N_k × sin^{l_{k+1}}(θ_k) × C_{l_k-l_{k+1}}^{α_k}(cos θ_k)]
 *       × Y_{l_{D-2}}^m(θ_{D-2}, φ)
 *
 * where α_k = l_{k+1} + (D-k-1)/2 and C_n^α is the Gegenbauer polynomial.
 *
 * The D-dimensional hydrogen wavefunction is:
 *   ψ(x₁,...,x_D) = R_{n,l₁}^(D)(r_D) × Y_{l₁...l_{D-2}}(Ω)
 *
 * where r_D = |x| is the FULL D-dimensional radius (not r_3D).
 *
 * References:
 * - Dong, S.-H. "Wave Equations in Higher Dimensions" (Springer, 2011), Part I + Ch. 7
 * - Avery, J. "Hyperspherical Harmonics: Applications in Quantum Theory" (Kluwer, 1989)
 * - docs/physics/hydrogen-nd-extension.md — derivation, normalization convention, error analysis
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hypersphericalHarmonics.wgsl
 */

/**
 * Log-gamma for half-integer arguments via LUT.
 *
 * Γ(n/2) for n = 1..30 covers all normalization arguments:
 *   max index = 2*(l₁ + D) ≈ 2*(6+11) = 34, but we only need
 *   ln Γ(x) for x in [0.5, 15], so n/2 ∈ {0.5, 1, 1.5, ..., 15}.
 *
 * Precomputed from f64.
 */
export const LN_GAMMA_HALF_INT_LUT_WGSL = /* wgsl */ `
// ln(Γ(n/2)) for n = 1..30
// Index i → ln(Γ((i+1)/2)), so i=0 → ln(Γ(0.5)) = ln(√π)
const LN_GAMMA_HALF: array<f32, 30> = array<f32, 30>(
  0.5723649,   // ln(Γ(0.5)) = ln(√π)
  0.0,         // ln(Γ(1)) = 0
  -0.1207822,  // ln(Γ(1.5)) = ln(√π/2)
  0.0,         // ln(Γ(2)) = ln(1) = 0
  0.2846829,   // ln(Γ(2.5)) = ln(3√π/4)
  0.6931472,   // ln(Γ(3)) = ln(2)
  1.2009736,   // ln(Γ(3.5))
  1.7917595,   // ln(Γ(4)) = ln(6)
  2.4537365,   // ln(Γ(4.5))
  3.1780539,   // ln(Γ(5)) = ln(24)
  3.9578140,   // ln(Γ(5.5))
  4.7874917,   // ln(Γ(6)) = ln(120)
  5.6625621,   // ln(Γ(6.5))
  6.5792512,   // ln(Γ(7)) = ln(720)
  7.5343642,   // ln(Γ(7.5))
  8.5251614,   // ln(Γ(8)) = ln(5040)
  9.5492673,   // ln(Γ(8.5))
  10.604602,   // ln(Γ(9)) = ln(40320)
  11.689333,   // ln(Γ(9.5))
  12.801827,   // ln(Γ(10))
  13.940625,   // ln(Γ(10.5))
  15.104413,   // ln(Γ(11))
  16.291956,   // ln(Γ(11.5))
  17.502308,   // ln(Γ(12))
  18.734347,   // ln(Γ(12.5))
  19.987214,   // ln(Γ(13))
  21.260076,   // ln(Γ(13.5))
  22.552164,   // ln(Γ(14))
  23.862765,   // ln(Γ(14.5))
  25.191221    // ln(Γ(15))
);

// Lookup ln(Γ(x)) for x = n/2, n >= 1.
// Input: the half-integer index n (so x = n/2).
fn lnGammaHalf(n: i32) -> f32 {
  if (n < 1 || n > 30) { return 0.0; }
  return LN_GAMMA_HALF[n - 1];
}
`

/**
 * Hyperspherical coordinate conversion block.
 *
 * Converts D-dimensional Cartesian coordinates to partial radii and cos(θ_k)
 * WITHOUT calling acos — Gegenbauer polynomials evaluate directly at cos(θ).
 */
export const hypersphericalCoordsBlock = /* wgsl */ `
// ============================================
// D-Dimensional Hyperspherical Coordinate Conversion
// ============================================

// Compute partial radii from the bottom up:
//   partialR[k] = sqrt(x_{k+1}^2 + x_{k+2}^2 + ... + x_D^2)
// and cos(θ_k) = x_{D-k} / partialR[k] (no acos needed).
//
// Convention: θ_1 is the "outermost" angle (near x_D),
// θ_{D-2} is the standard polar angle, φ = atan2(x_2, x_1).
//
// We store cosTheta[k] and sinTheta[k] for k=0..D-3.
// The full radius r_D = partialR[0] (if we build from the top).
//
// Actually, for the standard physics convention:
//   x_1 = r sin(θ_1) sin(θ_2) ... sin(θ_{D-2}) cos(φ)
//   x_2 = r sin(θ_1) sin(θ_2) ... sin(θ_{D-2}) sin(φ)
//   x_3 = r sin(θ_1) sin(θ_2) ... cos(θ_{D-2})
//   ...
//   x_D = r cos(θ_1)
//
// So: cos(θ_k) = x_{D-k+1} / sqrt(x_{D-k+1}^2 + ... + x_1^2) for the k-th angle.
// We build partial squared sums from dim 1 upward.

struct HypersphericalCoords {
  rD: f32,                       // Full D-dimensional radius
  cosTheta: array<f32, 9>,       // cos(θ_k) for k=0..D-3 (max 9 angles for D=11)
  sinTheta: array<f32, 9>,       // sin(θ_k), always >= 0
  phi: f32,                      // Azimuthal angle atan2(x_2, x_1)
}
`

/**
 * Generate the Cartesian→hyperspherical conversion function for a specific dimension.
 * Fully unrolled for GPU performance (no runtime loops).
 *
 * @param dimension - Spatial dimension D (3-11)
 */
export function generateHypersphericalConversion(dimension: number): string {
  const D = Math.min(Math.max(dimension, 3), 11)
  const numTheta = D - 2 // Number of θ angles (D-1 total angles: D-2 theta + 1 phi)

  // Build partial sum of squares from x_1 upward
  // partialSqSum[k] = x_1^2 + x_2^2 + ... + x_{k+1}^2
  const lines: string[] = []
  lines.push(`
fn cartesianToHyperspherical${D}D(xND: array<f32, 11>) -> HypersphericalCoords {
  var hs: HypersphericalCoords;

  // Extract coordinates`)

  for (let i = 0; i < D; i++) {
    lines.push(`  let c${i} = xND[${i}];`)
  }

  // Partial sum of squares from bottom (x_1, x_2, ...) upward
  // psq[k] = x_1^2 + ... + x_{k+1}^2
  lines.push('')
  lines.push('  // Partial squared sums (bottom-up)')
  lines.push(`  let psq0 = c0 * c0 + c1 * c1;`) // x_1^2 + x_2^2
  for (let k = 1; k < D - 1; k++) {
    lines.push(`  let psq${k} = psq${k - 1} + c${k + 1} * c${k + 1};`)
  }

  // Full radius
  lines.push('')
  lines.push(`  // Full D-dimensional radius`)
  lines.push(`  hs.rD = sqrt(psq${D - 2});`)

  // Azimuthal angle φ = atan2(x_2, x_1)
  lines.push('')
  lines.push('  // Azimuthal angle')
  lines.push('  hs.phi = atan2(c1, c0);')

  // Theta angles: cos(θ_k) = x_{D-k} / sqrt(psq from x_1 to x_{D-k})
  // Convention: θ_1 is outermost, cos(θ_1) = x_D / r_D
  //             θ_{D-2} is the standard polar angle, cos(θ_{D-2}) = x_3 / sqrt(x_1^2+x_2^2+x_3^2)
  //
  // Mapping: for k=0 (θ_1): cos = x_{D-1} / sqrt(psq_{D-2})  [= x_D / r_D]
  //          for k=1 (θ_2): cos = x_{D-2} / sqrt(psq_{D-3})  [if psq > 0]
  //          ...
  //          for k=D-3 (θ_{D-2}): cos = x_2 / sqrt(psq_1)   [= x_3 / sqrt(x_1^2+x_2^2+x_3^2)]

  lines.push('')
  lines.push('  // Theta angles (cos and sin, no acos needed)')

  for (let k = 0; k < numTheta; k++) {
    const xIdx = D - 1 - k // x_{D-k} (0-indexed: D-1-k)
    const psqIdx = D - 2 - k // partial sum including up to x_{D-k}
    lines.push(`  {`)
    // r itself is unused; cosTheta only needs x/r. Fused sqrt+divide via
    // inverseSqrt saves one divide per theta layer (up to 9 for D=11).
    lines.push(`    let r2 = psq${psqIdx};`)
    lines.push(`    let invR = inverseSqrt(max(r2, 1e-20));`)
    lines.push(`    let ct = clamp(c${xIdx} * invR, -1.0, 1.0);`)
    lines.push(`    hs.cosTheta[${k}] = ct;`)
    lines.push(`    hs.sinTheta[${k}] = sqrt(max(1.0 - ct * ct, 0.0));`)
    lines.push(`  }`)
  }

  // Zero out unused slots
  for (let k = numTheta; k < 9; k++) {
    lines.push(`  hs.cosTheta[${k}] = 0.0;`)
    lines.push(`  hs.sinTheta[${k}] = 0.0;`)
  }

  lines.push('')
  lines.push('  return hs;')
  lines.push('}')

  return lines.join('\n')
}

/**
 * Normalization constant for one layer of the hyperspherical harmonic.
 *
 * N_{l_k, l_{k+1}}^{(α)} where α = l_{k+1} + (D-k-1)/2
 *
 * N = sqrt( (2l_k + 2α) × Γ(n_k + 1) × Γ(n_k + 2α) / (Γ(l_k + α + 1) × Γ(l_k + α)) )
 *   ... simplified using the relation for Gegenbauer normalization.
 *
 * For unit-normalized hyperspherical harmonics, the per-layer normalization is:
 *   N_k = sqrt( (2l_k + D-k-1) × (l_k - l_{k+1})! × Γ(l_{k+1} + (D-k-1)/2) /
 *               (2π × Γ(l_k + (D-k+1)/2)) )
 *
 * We compute this in log-space for numerical stability.
 */
export const hypersphericalNormBlock = /* wgsl */ `
// ============================================
// Hyperspherical Harmonic Normalization
// ============================================

// Per-layer normalization for hyperspherical harmonic.
// k: layer index (0 = outermost θ_1, D-3 = innermost before φ)
// l_k, l_kp1: angular momentum at this layer and the next
// D: spatial dimension
// Returns ln(N_k) for numerical stability.
fn lnHypersphericalLayerNorm(lk: i32, lkp1: i32, D: i32, k: i32) -> f32 {
  let nk = lk - lkp1; // Gegenbauer degree
  if (nk < 0) { return -20.0; } // Invalid: return negligible

  // alpha = l_{k+1} + (D - k - 2) / 2
  // For the normalization integral of C_n^alpha(cos theta) * sin^{2*alpha}(theta):
  // ∫_0^pi |C_n^alpha(cos t)|^2 sin^{2alpha}(t) dt = pi * 2^{1-2alpha} * Gamma(n+2alpha) / (n! * (n+alpha) * Gamma(alpha)^2)
  //
  // Simplified normalization (Dong 2011, Part I; Avery 1989):
  // N_k^2 = (2*lk + D - k - 1) * nk! * Gamma(lkp1 + (D-k-1)/2) / (2 * Gamma(lk + (D-k+1)/2))
  //
  // Using half-integer gamma LUT:
  let dMinusKMinus1 = D - k - 1; // this is always >= 2 for valid k
  let prefactor = f32(2 * lk + dMinusKMinus1);

  // nk! via lnFactorial (already available from hydrogen radial)
  let lnNkFact = lnFactorial(nk);

  // Gamma(lkp1 + (D-k-1)/2): argument = (2*lkp1 + D - k - 1) / 2
  let gammaArgNum = 2 * lkp1 + dMinusKMinus1;
  let lnGammaNum = lnGammaHalf(gammaArgNum);

  // Gamma(lk + (D-k+1)/2): argument = (2*lk + D - k + 1) / 2
  let gammaArgDen = 2 * lk + dMinusKMinus1 + 2;
  let lnGammaDen = lnGammaHalf(gammaArgDen);

  // ln(N_k^2) = ln(prefactor) + lnNkFact + lnGammaNum - ln(2) - lnGammaDen
  let lnNormSq = log(max(prefactor, 1e-20)) + lnNkFact + lnGammaNum - 0.6931472 - lnGammaDen;

  return 0.5 * lnNormSq;
}
`

/**
 * Generate the complete hyperspherical harmonic evaluation function for a specific dimension.
 *
 * @param dimension - Spatial dimension D (3-11)
 */
export function generateHypersphericalHarmonicBlock(dimension: number): string {
  const D = Math.min(Math.max(dimension, 3), 11)
  const numTheta = D - 2

  if (D === 3) {
    // D=3: standard spherical harmonics, delegate to existing Y_lm
    return `
// ============================================
// Hyperspherical Harmonic — 3D (standard Y_lm)
// ============================================

fn evalHypersphericalHarmonic3D(
  hs: HypersphericalCoords,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // D=3: only one theta angle (polar) and phi (azimuthal).
  // This is just the standard Y_lm(theta, phi).
  let l = uniforms.azimuthalL;
  let m = uniforms.magneticM;
  let useReal = uniforms.useRealOrbitals != 0u;

  // cos(theta_{D-2}) = cosTheta[0] for D=3
  let cosTheta = hs.cosTheta[0];
  let sinTheta = hs.sinTheta[0];
  let phi = hs.phi;

  return evalHydrogenNDAngularDirect(l, m, cosTheta, sinTheta, phi, useReal);
}
`
  }

  // D >= 4: generate Gegenbauer chain
  const lines: string[] = []
  lines.push(`
// ============================================
// Hyperspherical Harmonic — ${D}D (Gegenbauer chain, ${numTheta} θ-angles)
// Angular chain: l_1 >= l_2 >= ... >= l_{numTheta} >= |m|
// ============================================

fn evalHypersphericalHarmonic${D}D(
  hs: HypersphericalCoords,
  uniforms: SchroedingerUniforms
) -> vec2f {
  // Angular quantum number chain
  // l_1 = azimuthalL (overall angular momentum)
  let l1 = uniforms.azimuthalL;
  let m = uniforms.magneticM;
  let useReal = uniforms.useRealOrbitals != 0u;`)

  // Extract chain quantum numbers
  for (let k = 2; k <= numTheta; k++) {
    lines.push(`  let l${k} = getAngularChainL(uniforms, ${k - 1});`)
  }

  // The innermost angular momentum is |m|
  // l_{D-2} must equal |m| for consistency
  lines.push('')
  lines.push('  // Accumulate product of Gegenbauer layers')
  lines.push('  var product: f32 = 1.0;')

  // Layer k=0 (outermost): θ_1, uses l_1, l_2, alpha = l_2 + (D-2)/2
  // Layer k=1: θ_2, uses l_2, l_3, alpha = l_3 + (D-3)/2
  // ...
  // Layer k=D-4: θ_{D-3}, uses l_{D-3}, l_{D-2}, alpha = l_{D-2} + 1/2
  // Then the innermost layer (k=D-3) is the standard Y_lm with l=l_{D-2}

  for (let k = 0; k < numTheta - 1; k++) {
    const lkVar = k === 0 ? 'l1' : `l${k + 1}`
    const lkp1Var = `l${k + 2}`
    const thetaIdx = k

    lines.push(``)
    lines.push(`  // Layer ${k}: θ_${k + 1}, l_${k + 1} -> l_${k + 2}`)
    lines.push(`  {`)
    lines.push(`    let lk = ${lkVar};`)
    lines.push(`    let lkp1 = ${lkp1Var};`)
    lines.push(`    let nk = lk - lkp1; // Gegenbauer degree`)
    lines.push(`    let alphaF = f32(lkp1) + f32(${D} - ${k} - 2) * 0.5;`)
    lines.push(`    let ct = hs.cosTheta[${thetaIdx}];`)
    lines.push(`    let st = hs.sinTheta[${thetaIdx}];`)
    lines.push(``)
    lines.push(`    // Gegenbauer C_{nk}^{alpha}(cos θ)`)
    lines.push(`    let G = gegenbauer(nk, alphaF, ct);`)
    lines.push(``)
    lines.push(`    // sin^{l_{k+1}}(θ_k) — iterative multiply for integer power`)
    lines.push(`    var sinPow: f32 = 1.0;`)
    lines.push(`    for (var ip = 0; ip < lkp1; ip++) {`)
    lines.push(`      sinPow *= st;`)
    lines.push(`    }`)
    lines.push(``)
    lines.push(`    // Normalization — precomputed on CPU (see uniformPacking.packCoupledNorms)`)
    lines.push(`    let N = getCoupledLayerNorm(uniforms, ${k});`)
    lines.push(``)
    lines.push(`    product *= N * G * sinPow;`)
    lines.push(`    if (abs(product) < 1e-15) { return vec2f(0.0, 0.0); }`)
    lines.push(`  }`)
  }

  // Innermost layer: standard Y_{l_{D-2}}^m(θ_{D-2}, φ) using existing infrastructure
  const innermostThetaIdx = numTheta - 1
  const innermostLVar = numTheta >= 2 ? `l${numTheta}` : 'l1'
  lines.push(``)
  lines.push(`  // Innermost layer: standard Y_lm(θ_{D-2}, φ)`)
  lines.push(`  let innermostL = ${innermostLVar};`)
  lines.push(`  let ct_inner = hs.cosTheta[${innermostThetaIdx}];`)
  lines.push(`  let st_inner = hs.sinTheta[${innermostThetaIdx}];`)
  lines.push(
    `  let Ylm = evalHydrogenNDAngularDirect(innermostL, m, ct_inner, st_inner, hs.phi, useReal);`
  )
  lines.push(``)
  lines.push(`  return vec2f(product * Ylm.x, product * Ylm.y);`)
  lines.push(`}`)

  return lines.join('\n')
}

/**
 * Generate the coupled hydrogen ND wavefunction evaluation for a specific dimension.
 *
 * ψ(x₁,...,x_D) = R_{n,l₁}^(D)(r_D) × Y_{l₁...l_{D-2}}^m(Ω)
 *
 * @param dimension - Spatial dimension D (3-11)
 */
export function generateHydrogenNDCoupledBlock(dimension: number): string {
  const D = Math.min(Math.max(dimension, 3), 11)

  return `
// ============================================
// Hydrogen ND Coupled — ${D}D
// True D-dimensional Coulomb: r_D, hyperspherical harmonics
// ============================================

fn evalHydrogenNDCoupledPsi${D}D(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Convert to hyperspherical coordinates
  let hs = cartesianToHyperspherical${D}D(xND);

  // Early exit: negligible radius
  if (hs.rD < 1e-10) { return vec2f(0.0, 0.0); }

  // Early exit: radial threshold (uses r_D, not r_3D)
  if (hydrogenRadialEarlyExitND(hs.rD, uniforms.principalN, uniforms.azimuthalL, uniforms.bohrRadius, ${D})) {
    return vec2f(0.0, 0.0);
  }

  // PERF: Use precomputed norm to skip per-pixel log/exp/gamma (~60 cycles saved per eval)
  let R = hydrogenRadialNDWithNorm(uniforms.principalN, uniforms.azimuthalL, hs.rD, uniforms.bohrRadius, ${D}, uniforms.hydrogenRadialNorm);
  if (abs(R) < 1e-15) { return vec2f(0.0, 0.0); }

  // Angular part: D-dimensional hyperspherical harmonic
  let Y = evalHypersphericalHarmonic${D}D(hs, uniforms);

  // Combine: ψ₀ = R × Y (complex)
  let psi0 = vec2f(R * Y.x, R * Y.y);

  // Time evolution: E = -0.5 / n_eff² where n_eff = n + (D-3)/2
  // No extra-dim HO energy — all dimensions are coupled
  return hydrogenNDTimeEvolutionND(psi0, uniforms.principalN, 0.0, t, ${D});
}
`
}

/**
 * Generate the dispatch function for coupled hydrogen ND.
 *
 * @param dimension - The dimension to dispatch to
 */
export function generateHydrogenNDCoupledDispatchBlock(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)
  return `
// ============================================
// Hydrogen ND Coupled — Compile-time Dispatch
// Dimension: ${dim}
// ============================================

fn hydrogenNDCoupledOptimized(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHydrogenNDCoupledPsi${dim}D(xND, t, uniforms);
}
`
}

// Pre-generate all dimension-specific blocks
export const hydrogenNDCoupledGen3dBlock = generateHydrogenNDCoupledBlock(3)
export const hydrogenNDCoupledGen4dBlock = generateHydrogenNDCoupledBlock(4)
export const hydrogenNDCoupledGen5dBlock = generateHydrogenNDCoupledBlock(5)
export const hydrogenNDCoupledGen6dBlock = generateHydrogenNDCoupledBlock(6)
export const hydrogenNDCoupledGen7dBlock = generateHydrogenNDCoupledBlock(7)
export const hydrogenNDCoupledGen8dBlock = generateHydrogenNDCoupledBlock(8)
export const hydrogenNDCoupledGen9dBlock = generateHydrogenNDCoupledBlock(9)
export const hydrogenNDCoupledGen10dBlock = generateHydrogenNDCoupledBlock(10)
export const hydrogenNDCoupledGen11dBlock = generateHydrogenNDCoupledBlock(11)

// Pre-generate hyperspherical conversion functions
export const hypersphericalConv3d = generateHypersphericalConversion(3)
export const hypersphericalConv4d = generateHypersphericalConversion(4)
export const hypersphericalConv5d = generateHypersphericalConversion(5)
export const hypersphericalConv6d = generateHypersphericalConversion(6)
export const hypersphericalConv7d = generateHypersphericalConversion(7)
export const hypersphericalConv8d = generateHypersphericalConversion(8)
export const hypersphericalConv9d = generateHypersphericalConversion(9)
export const hypersphericalConv10d = generateHypersphericalConversion(10)
export const hypersphericalConv11d = generateHypersphericalConversion(11)

// Pre-generate hyperspherical harmonic functions
export const hypersphericalHarmonic3d = generateHypersphericalHarmonicBlock(3)
export const hypersphericalHarmonic4d = generateHypersphericalHarmonicBlock(4)
export const hypersphericalHarmonic5d = generateHypersphericalHarmonicBlock(5)
export const hypersphericalHarmonic6d = generateHypersphericalHarmonicBlock(6)
export const hypersphericalHarmonic7d = generateHypersphericalHarmonicBlock(7)
export const hypersphericalHarmonic8d = generateHypersphericalHarmonicBlock(8)
export const hypersphericalHarmonic9d = generateHypersphericalHarmonicBlock(9)
export const hypersphericalHarmonic10d = generateHypersphericalHarmonicBlock(10)
export const hypersphericalHarmonic11d = generateHypersphericalHarmonicBlock(11)

/**
 * Get all coupled hydrogen ND blocks for a specific dimension.
 *
 * @param dimension - The dimension (3-11)
 */
export function getHydrogenNDCoupledBlocks(dimension: number): {
  conversion: string
  harmonic: string
  coupled: string
  dispatch: string
} {
  const dim = Math.min(Math.max(dimension, 3), 11)

  const convMap: Record<number, string> = {
    3: hypersphericalConv3d,
    4: hypersphericalConv4d,
    5: hypersphericalConv5d,
    6: hypersphericalConv6d,
    7: hypersphericalConv7d,
    8: hypersphericalConv8d,
    9: hypersphericalConv9d,
    10: hypersphericalConv10d,
    11: hypersphericalConv11d,
  }
  const harmMap: Record<number, string> = {
    3: hypersphericalHarmonic3d,
    4: hypersphericalHarmonic4d,
    5: hypersphericalHarmonic5d,
    6: hypersphericalHarmonic6d,
    7: hypersphericalHarmonic7d,
    8: hypersphericalHarmonic8d,
    9: hypersphericalHarmonic9d,
    10: hypersphericalHarmonic10d,
    11: hypersphericalHarmonic11d,
  }
  const coupledMap: Record<number, string> = {
    3: hydrogenNDCoupledGen3dBlock,
    4: hydrogenNDCoupledGen4dBlock,
    5: hydrogenNDCoupledGen5dBlock,
    6: hydrogenNDCoupledGen6dBlock,
    7: hydrogenNDCoupledGen7dBlock,
    8: hydrogenNDCoupledGen8dBlock,
    9: hydrogenNDCoupledGen9dBlock,
    10: hydrogenNDCoupledGen10dBlock,
    11: hydrogenNDCoupledGen11dBlock,
  }

  return {
    conversion: convMap[dim] ?? convMap[3]!,
    harmonic: harmMap[dim] ?? harmMap[3]!,
    coupled: coupledMap[dim] ?? coupledMap[3]!,
    dispatch: generateHydrogenNDCoupledDispatchBlock(dim),
  }
}
