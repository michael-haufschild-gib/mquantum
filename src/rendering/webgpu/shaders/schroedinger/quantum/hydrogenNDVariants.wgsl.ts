/**
 * WGSL Dimension-specific Hydrogen ND Wavefunction Variants
 *
 * These are fully unrolled versions of hydrogen ND evaluation for each dimension 3-11.
 * Following the hoNDVariants pattern: ALL code is generated at JavaScript level
 * to eliminate runtime loops and enable maximum GPU compiler optimization.
 *
 * Uses the N-dimensional radial correction: the effective angular momentum
 * λ = l + (D-3)/2 shifts the radial wavefunction, energy levels, and
 * orbital extent. At D=3, λ=l and everything reduces to standard hydrogen.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDVariants.wgsl
 */

/**
 * Early-exit threshold for extra dimensions.
 * Uses 3-sigma threshold: sum of squared scaled coords > 18 means contribution < 1e-8
 */
const EXTRA_DIM_THRESHOLD = 18.0

/**
 * Generate coordinate extraction for a given dimension.
 * @param dimension
 */
function generateCoordExtraction(dimension: number): string {
  const coords = Array.from({ length: dimension }, (_, i) => `  let x${i} = xND[${i}];`).join('\n')
  return coords
}

/**
 * Generate the extra-dimension early exit check (fully unrolled).
 * Only for dimensions > 3.
 * @param dimension
 */
function generateExtraDimEarlyExit(dimension: number): string {
  const extraDimCount = dimension - 3
  if (extraDimCount <= 0) {
    return '' // No extra dimensions, no early exit needed
  }

  // Generate alpha and u calculations for extra dimensions only
  const alphaDecls = Array.from(
    { length: extraDimCount },
    (_, i) => `  let alpha_ed${i} = sqrt(max(getExtraDimOmega(uniforms, ${i}), 0.01));`
  ).join('\n')

  const uCalcs = Array.from(
    { length: extraDimCount },
    (_, i) => `  let u_ed${i} = alpha_ed${i} * x${i + 3};`
  ).join('\n')

  // Generate distSq sum for extra dimensions
  const distSqTerms = Array.from({ length: extraDimCount }, (_, i) => `u_ed${i}*u_ed${i}`).join(
    ' + '
  )

  return `
  // EARLY EXIT 1: Check extra dimensions (unrolled, no loops)
${alphaDecls}
${uCalcs}
  let extraDistSq = ${distSqTerms};
  if (extraDistSq > ${EXTRA_DIM_THRESHOLD.toFixed(1)}) {
    return vec2f(0.0, 0.0);
  }
`
}

/**
 * Generate the ND radius calculation (fully unrolled).
 * @param dimension
 */
function generateRadiusCalculation(dimension: number): string {
  const sum3D = 'x0*x0 + x1*x1 + x2*x2'

  // We need sum3D for the squared-threshold early exit, and r3D + invR for the
  // angular + radial paths. A fused inverseSqrt gives us invR directly and
  // reconstructs r3D via sum3D * invR, saving one sqrt + one divide + one max
  // per hydrogen eval vs the separate sqrt() + 1.0/max(r3D, eps) path below.
  if (dimension === 3) {
    return `
  // 3D radius (fused sqrt + reciprocal via inverseSqrt)
  let sum3D = ${sum3D};
  let invR = inverseSqrt(max(sum3D, 1e-20));
  let r3D = sum3D * invR;
`
  }

  return `
  // PERF: Compute sum3D once; reuse for early exit (squared comparison) AND
  // derive both r3D and invR from a single inverseSqrt (no separate sqrt + divide).
  let sum3D = ${sum3D};

  // Deferred until after the squared early exit.
  let invR = inverseSqrt(max(sum3D, 1e-20));
  let r3D = sum3D * invR;
`
}

/**
 * Generate the extra dimension HO product (fully unrolled, inlined ho1D calls).
 * Only for dimensions > 3.
 * @param dimension
 */
function generateExtraDimProduct(dimension: number): string {
  const extraDimCount = dimension - 3
  if (extraDimCount <= 0) {
    return `
  // No extra dimensions
  let extraProduct = 1.0;
`
  }

  // PERF: Precompute alphaNorm per extra dimension (reuse alpha_ed from early exit).
  const alphaNormDecls = Array.from(
    { length: extraDimCount },
    (_, i) => `  let alphaNorm_ed${i} = sqrt(alpha_ed${i} * sqrt(INV_PI));`
  ).join('\n')

  // Generate extra dim product computation with fused-Gaussian fast path.
  // When ALL extra dims are in ground state (n_j=0), fuse individual exp() calls
  // into a single exp(-0.5 * Σ omega_j * x_j²). This replaces D-3 exp() calls
  // with 1 exp() + D-3 multiply-adds, saving (D-4) × ~8 GPU cycles.
  const allGroundCheck = Array.from(
    { length: extraDimCount },
    (_, i) => `getExtraDimN(uniforms, ${i}) == 0`
  ).join(' && ')

  // Fused Gaussian: product of alphaNorms × exp(-0.5 * sum(omega_j * x_j²))
  // omega_j = alpha_ed_j² (since alpha = sqrt(omega))
  const fusedSumTerms = Array.from(
    { length: extraDimCount },
    (_, i) => `alpha_ed${i} * alpha_ed${i} * x${i + 3} * x${i + 3}`
  ).join(' + ')
  const fusedNormProduct = Array.from({ length: extraDimCount }, (_, i) => `alphaNorm_ed${i}`).join(
    ' * '
  )

  // Per-dim evaluation for non-ground states
  function genExtraDimEval(i: number): string {
    const efVar = `ef${i}`
    const coordVar = `x${i + 3}`
    const fullCall = `ho1DFast(getExtraDimN(uniforms, ${i}), ${coordVar}, alpha_ed${i}, alphaNorm_ed${i})`
    return `let ${efVar} = ${fullCall};`
  }

  const perDimCalls = Array.from({ length: extraDimCount }, (_, i) => {
    const efVar = `ef${i}`
    const eval_ = genExtraDimEval(i)
    if (i < extraDimCount - 1) {
      return `    ${eval_}
    if (abs(${efVar}) < 1e-10) { return vec2f(0.0, 0.0); }`
    }
    return `    ${eval_}`
  }).join('\n')
  const perDimProduct = Array.from({ length: extraDimCount }, (_, i) => `ef${i}`).join(' * ')

  return `
  // Extra dimension factors (fused-Gaussian fast path for all-ground-state)
${alphaNormDecls}
  var extraProduct: f32;
  if (${allGroundCheck}) {
    // PERF: Fuse ${extraDimCount} individual exp() into single exp(-0.5 * Σ omega_j * x_j²)
    let fusedExponent = 0.5 * (${fusedSumTerms});
    if (fusedExponent > 20.0) { return vec2f(0.0, 0.0); } // Early exit: below f32 precision
    extraProduct = ${fusedNormProduct} * exp(-fusedExponent);
  } else {
    // Per-dimension evaluation for excited extra dims
${perDimCalls}
    extraProduct = ${perDimProduct};
  }
`
}

/**
 * Generate extra-dimensional HO energy: E_extra = Σ ω_j(n_j + 0.5)
 * @param dimension
 */
function generateExtraDimEnergy(dimension: number): string {
  const extraDimCount = dimension - 3
  if (extraDimCount <= 0) {
    return `
  let extraEnergy: f32 = 0.0;
`
  }
  const terms = Array.from(
    { length: extraDimCount },
    (_, i) => `getExtraDimOmega(uniforms, ${i}) * (f32(getExtraDimN(uniforms, ${i})) + 0.5)`
  )
  return `
  // Extra-dimensional HO energy: Σ ω_j(n_j + 0.5)
  let extraEnergy: f32 = ${terms.join(' + ')};
`
}

/**
 * Generate a complete dimension-specific hydrogenND function.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL function code for evalHydrogenNDPsi{dimension}D
 */
function generateHydrogenNDBlock(dimension: number): string {
  const extraDimCount = dimension - 3

  const coordExtraction = generateCoordExtraction(dimension)
  const extraDimEarlyExit = generateExtraDimEarlyExit(dimension)
  const radiusCalc = generateRadiusCalculation(dimension)
  const extraDimProduct = generateExtraDimProduct(dimension)
  const extraDimEnergy = generateExtraDimEnergy(dimension)

  return `
// ============================================
// Hydrogen ND - ${dimension}D (Fully Unrolled)
// Extra dimensions: ${extraDimCount}
// N-D radial correction: λ = l + ${(dimension - 3) / 2}, n_eff = n + ${(dimension - 3) / 2}
// Generated at JavaScript level for maximum optimization
// ============================================

fn evalHydrogenNDPsi${dimension}D(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Extract coordinates (unrolled)
${coordExtraction}
${extraDimEarlyExit}${radiusCalc}
  // PERF: Squared comparison avoids redundant threshold computation per-sample.
  // Uses precomputed hydrogenRadialThreshold from CPU uniform.
  let _thresh = uniforms.hydrogenRadialThreshold;
  if (sum3D > _thresh * _thresh) {
    return vec2f(0.0, 0.0);
  }

  // Cartesian unit direction -- singularity-free angular evaluation (no atan2).
  // invR already computed above via inverseSqrt(max(sum3D, 1e-20)).
  let nx = x0 * invR;
  let ny = x1 * invR;
  let nz = x2 * invR;

  // Radial part: R_nl^(D)(r_3D) with D-dimensional effective potential
  // PERF: Uses precomputed normalization from uniform (eliminates per-sample log/exp/sqrt)
  let R = hydrogenRadialNDWithNorm(uniforms.principalN, uniforms.azimuthalL, r3D, uniforms.bohrRadius, ${dimension}, uniforms.hydrogenRadialNorm);

  // Angular part: Y_lm as complex vec2f(re, im) from Cartesian direction
  let Y = evalHydrogenNDAngularCartesian(uniforms.azimuthalL, uniforms.magneticM, nx, ny, nz, uniforms.useRealOrbitals != 0u);
${extraDimProduct}
  // Combine: psi0 = R * extraProduct * Y (complex)
  let scale = R * extraProduct;
  let psi0 = vec2f(scale * Y.x, scale * Y.y);
${extraDimEnergy}
  // Time evolution with D-dimensional energy: E = -0.5/n_eff²
  return hydrogenNDTimeEvolutionND(psi0, uniforms.principalN, extraEnergy, t, ${dimension});
}
`
}

/**
 * Generate the unified dispatch function for hydrogen ND.
 * This is called from psi.wgsl.ts based on compile-time dimension.
 *
 * @param dimension - The dimension to generate for
 * @returns WGSL dispatch block code
 */
export function generateHydrogenNDDispatchBlock(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  return `
// ============================================
// Hydrogen ND - Compile-time Dispatch
// Dimension: ${dim}
// Generated at JavaScript level
// ============================================

// hydrogenNDOptimized: Direct call to dimension-specific unrolled variant
// Eliminates runtime dimension branching
fn hydrogenNDOptimized(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHydrogenNDPsi${dim}D(xND, t, uniforms);
}
`
}

// ============================================
// Cached Hydrogen ND Variants
// Uses ho1DCached() for extra dimensions instead of ho1D()
// ============================================

/**
 * Generate cached extra-dimension HO product (uses eigenfunction cache).
 * Extra dims use (termIdx=0, dimIdx=i+3) for cache lookup.
 * @param dimension
 */
function generateExtraDimProductCached(dimension: number): string {
  const extraDimCount = dimension - 3
  if (extraDimCount <= 0) {
    return `
  // No extra dimensions
  let extraProduct = 1.0;
`
  }

  // Generate cached ho1D lookups for each extra dimension
  // Cache index map: (termIdx=0, dimIdx=3+i) for hydrogen ND extra dims
  const hoCallsWithEarlyExit = Array.from({ length: extraDimCount }, (_, i) => {
    const efVar = `ef${i}`
    const coordVar = `x${i + 3}`
    const dimIdx = i + 3
    if (i === 0) {
      return `  let ${efVar} = ho1DCached(getEigenFuncIdx(0, ${dimIdx}), ${coordVar});
  if (abs(${efVar}) < 1e-10) { return vec2f(0.0, 0.0); }`
    } else if (i === extraDimCount - 1) {
      return `  let ${efVar} = ho1DCached(getEigenFuncIdx(0, ${dimIdx}), ${coordVar});`
    } else {
      return `  let ${efVar} = ho1DCached(getEigenFuncIdx(0, ${dimIdx}), ${coordVar});
  if (abs(${efVar}) < 1e-10) { return vec2f(0.0, 0.0); }`
    }
  }).join('\n')

  const productTerms = Array.from({ length: extraDimCount }, (_, i) => `ef${i}`).join(' * ')

  return `
  // Extra dimension factors (cached eigenfunction lookups)
${hoCallsWithEarlyExit}
  let extraProduct = ${productTerms};
`
}

/**
 * Generate a cached hydrogen ND function block.
 * Identical to non-cached except extra dimensions use ho1DCached().
 *
 * @param dimension - The dimension (4-11; 3D has no extra dims so cache doesn't help)
 * @returns WGSL function code
 */
export function generateHydrogenNDCachedBlock(dimension: number): string {
  const extraDimCount = dimension - 3

  const coordExtraction = generateCoordExtraction(dimension)
  const extraDimEarlyExit = generateExtraDimEarlyExit(dimension)
  const radiusCalc = generateRadiusCalculation(dimension)
  const extraDimProduct =
    extraDimCount > 0
      ? generateExtraDimProductCached(dimension)
      : generateExtraDimProduct(dimension)
  const extraDimEnergy = generateExtraDimEnergy(dimension)

  return `
// ============================================
// Hydrogen ND - ${dimension}D (Cached Extra Dimensions)
// Extra dimensions: ${extraDimCount} (using eigenfunction cache)
// N-D radial correction: λ = l + ${(dimension - 3) / 2}, n_eff = n + ${(dimension - 3) / 2}
// Generated at JavaScript level for maximum optimization
// ============================================

fn evalHydrogenNDPsi${dimension}DCached(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Extract coordinates (unrolled)
${coordExtraction}
${extraDimEarlyExit}${radiusCalc}
  // PERF: Squared comparison using precomputed threshold from CPU uniform
  let _thresh = uniforms.hydrogenRadialThreshold;
  if (sum3D > _thresh * _thresh) {
    return vec2f(0.0, 0.0);
  }

  // Cartesian unit direction -- singularity-free angular evaluation (no atan2).
  // invR already computed above via inverseSqrt(max(sum3D, 1e-20)).
  let nx = x0 * invR;
  let ny = x1 * invR;
  let nz = x2 * invR;

  // Radial part: R_nl^(D)(r_3D) with D-dimensional effective potential
  // PERF: Uses precomputed normalization from uniform (eliminates per-sample log/exp/sqrt)
  let R = hydrogenRadialNDWithNorm(uniforms.principalN, uniforms.azimuthalL, r3D, uniforms.bohrRadius, ${dimension}, uniforms.hydrogenRadialNorm);

  // Angular part: Y_lm as complex vec2f(re, im) from Cartesian direction
  let Y = evalHydrogenNDAngularCartesian(uniforms.azimuthalL, uniforms.magneticM, nx, ny, nz, uniforms.useRealOrbitals != 0u);
${extraDimProduct}
  // Combine: psi0 = R * extraProduct * Y (complex)
  let scale = R * extraProduct;
  let psi0 = vec2f(scale * Y.x, scale * Y.y);
${extraDimEnergy}
  // Time evolution with D-dimensional energy: E = -0.5/n_eff²
  return hydrogenNDTimeEvolutionND(psi0, uniforms.principalN, extraEnergy, t, ${dimension});
}
`
}

/**
 * Generate cached hydrogen ND dispatch block.
 * When cache is active, routes to the cached variant.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL dispatch block code
 */
export function generateHydrogenNDCachedDispatchBlock(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  if (dim <= 3) {
    // 2D/3D hydrogen has no extra dimensions to cache, fall back to non-cached
    return generateHydrogenNDDispatchBlock(dim)
  }
  return `
// ============================================
// Hydrogen ND - Cached Compile-time Dispatch
// Dimension: ${dim} (extra dims use eigenfunction cache)
// Generated at JavaScript level
// ============================================

// hydrogenNDOptimized: Direct call to cached dimension-specific variant
fn hydrogenNDOptimized(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHydrogenNDPsi${dim}DCached(xND, t, uniforms);
}
`
}

// ============================================
// 2D Hydrogen (True 2D Coulomb Problem)
// ============================================

/**
 * Generate the 2D hydrogen wavefunction evaluator.
 *
 * In 2D, the angular part is circular harmonics e^{imφ}/√(2π)
 * instead of 3D spherical harmonics. The effective angular momentum
 * for the radial function is |m| (not an independent l).
 * Energy: E_n = -0.5 / (n - 0.5)² via n_eff = n + (D-3)/2 = n - 0.5.
 *
 * The shader uses abs(uniforms.magneticM) as the effective l parameter
 * for the radial wavefunction, making the store's azimuthalL irrelevant in 2D.
 */
function generateHydrogenND2DBlock(): string {
  return `
// ============================================
// Hydrogen ND - 2D (True 2D Coulomb Problem)
// Uses circular harmonics Φ_m(φ) = e^{imφ}/√(2π)
// Effective angular momentum: l_eff = |m|
// N-D radial correction: λ = |m| - 0.5, n_eff = n - 0.5
// ============================================

fn evalHydrogenNDPsi2D(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Extract 2D coordinates
  let x0 = xND[0];
  let x1 = xND[1];

  // 2D radius
  let r2D = sqrt(x0 * x0 + x1 * x1);

  // In 2D hydrogen, effective l = |m| (l is not independent)
  let effectiveL = abs(uniforms.magneticM);

  // EARLY EXIT: Check hydrogen radial threshold (2D n_eff)
  if (hydrogenRadialEarlyExitND(r2D, uniforms.principalN, effectiveL, uniforms.bohrRadius, 2)) {
    return vec2f(0.0, 0.0);
  }

  // Azimuthal angle φ = atan2(y, x)
  let phi = atan2(x1, x0);

  // Radial part: R_{n,|m|}^(2D)(r) with D=2 dimensional correction
  // λ = |m| + (2-3)/2 = |m| - 0.5
  let R = hydrogenRadialND(uniforms.principalN, effectiveL, r2D, uniforms.bohrRadius, 2);

  // Angular part: circular harmonic Φ_m(φ)
  let Y = evalCircularHarmonic(uniforms.magneticM, phi, uniforms.useRealOrbitals != 0u);

  // Combine: psi0 = R × Φ_m (complex)
  let psi0 = vec2f(R * Y.x, R * Y.y);

  // No extra dimensions in 2D
  let extraEnergy: f32 = 0.0;

  // Time evolution with 2D energy: E = -0.5/n_eff² where n_eff = n - 0.5
  return hydrogenNDTimeEvolutionND(psi0, uniforms.principalN, extraEnergy, t, 2);
}
`
}

// Pre-generate all dimension-specific blocks
export const hydrogenNDGen2dBlock = generateHydrogenND2DBlock()
export const hydrogenNDGen3dBlock = generateHydrogenNDBlock(3)
export const hydrogenNDGen4dBlock = generateHydrogenNDBlock(4)
export const hydrogenNDGen5dBlock = generateHydrogenNDBlock(5)
export const hydrogenNDGen6dBlock = generateHydrogenNDBlock(6)
export const hydrogenNDGen7dBlock = generateHydrogenNDBlock(7)
export const hydrogenNDGen8dBlock = generateHydrogenNDBlock(8)
export const hydrogenNDGen9dBlock = generateHydrogenNDBlock(9)
export const hydrogenNDGen10dBlock = generateHydrogenNDBlock(10)
export const hydrogenNDGen11dBlock = generateHydrogenNDBlock(11)

/**
 * Get the generated block for a specific dimension.
 *
 * @param dimension - The dimension (2-11)
 * @returns WGSL code for the hydrogen ND function
 */
export function getHydrogenNDBlockForDimension(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  switch (dim) {
    case 2:
      return hydrogenNDGen2dBlock
    case 3:
      return hydrogenNDGen3dBlock
    case 4:
      return hydrogenNDGen4dBlock
    case 5:
      return hydrogenNDGen5dBlock
    case 6:
      return hydrogenNDGen6dBlock
    case 7:
      return hydrogenNDGen7dBlock
    case 8:
      return hydrogenNDGen8dBlock
    case 9:
      return hydrogenNDGen9dBlock
    case 10:
      return hydrogenNDGen10dBlock
    case 11:
      return hydrogenNDGen11dBlock
    default:
      return hydrogenNDGen11dBlock
  }
}
