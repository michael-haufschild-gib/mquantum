/**
 * WGSL Dimension-specific Harmonic Oscillator ND Eigenfunction Variants
 *
 * These are fully unrolled versions of hoND() for each dimension 3-11.
 * GPU cannot effectively branch-predict early exit in loops, so we
 * provide compile-time specialized versions that eliminate the overhead.
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hoNDVariants.wgsl
 */

/**
 * Generate a dimension-specific hoND function for WGSL.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL function code for hoND{dimension}D
 */
function generateHoNDBlock(dimension: number): string {
  // PERF: Precompute alpha, alphaNorm, scaled coordinate u, and Gaussian envelope
  // per dimension ONCE. These depend only on omega[j] and xND[j], both term-invariant.
  // For 8-term superposition at 3D: saves 21 exp() + 21 mul (u²) = ~525 GPU cycles.
  // sqrt(INV_PI) = 1/sqrt(π) — uniform constant for alphaNorm derivation.
  // PERF: alphaNorm = sqrt(sqrt(ω·INV_PI)) = sqrt(α · sqrt(INV_PI)) — saves
  // one sqrt per dim by reusing the alpha = sqrt(ω) we already computed.
  const precomp = Array.from(
    { length: dimension },
    (_, i) => `  let omega_${i} = max(getOmega(uniforms, ${i}), 0.01);
  let alpha_${i} = sqrt(omega_${i});
  let alphaNorm_${i} = sqrt(alpha_${i} * 0.5641895835477563);
  let u_${i} = alpha_${i} * xND[${i}];
  let gauss_${i} = exp(-0.5 * min(u_${i} * u_${i}, 40.0));`
  ).join('\n')

  // Generate ho1DFastPreGauss product chain using precomputed u/gauss/alphaNorm
  const ho1DChain = Array.from({ length: dimension }, (_, i) => {
    const call = `ho1DFastPreGauss(getQuantum(uniforms, base + ${i}), u_${i}, gauss_${i}, alphaNorm_${i})`
    if (i === 0) {
      return `  var p = ${call};
  if (abs(p) < 1e-10) { return 0.0; }`
    } else if (i === dimension - 1) {
      return `
  p *= ${call};
  return p;`
    } else {
      return `
  p *= ${call};
  if (abs(p) < 1e-10) { return 0.0; }`
    }
  }).join('')

  return `
// ============================================
// Harmonic Oscillator ND - ${dimension}D (Unrolled)
// PERF: Precomputed alpha/alphaNorm/u/gauss per dimension
// ============================================

fn hoND${dimension}D(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
  let base = termIdx * 11;
  // Precompute per-dimension constants (invariant across terms)
${precomp}
${ho1DChain}
}
`
}

// Pre-generate all dimension-specific blocks
export const hoND2dBlock = generateHoNDBlock(2)
export const hoND3dBlock = generateHoNDBlock(3)
export const hoND4dBlock = generateHoNDBlock(4)
export const hoND5dBlock = generateHoNDBlock(5)
export const hoND6dBlock = generateHoNDBlock(6)
export const hoND7dBlock = generateHoNDBlock(7)
export const hoND8dBlock = generateHoNDBlock(8)
export const hoND9dBlock = generateHoNDBlock(9)
export const hoND10dBlock = generateHoNDBlock(10)
export const hoND11dBlock = generateHoNDBlock(11)

/**
 * Generate dimension-specific dispatch block.
 * Instead of runtime branching, generate a direct call to the specific dimension's function.
 *
 * @param dimension - The dimension to generate for
 * @returns WGSL dispatch block code
 */
export function generateHoNDDispatchBlock(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  return `
// ============================================
// Harmonic Oscillator ND - Compile-time Dispatch
// Dimension: ${dim}
// ============================================

// hoNDOptimized: Direct call to dimension-specific unrolled variant
// Generated at shader compile time for dimension ${dim}
fn hoNDOptimized(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
  return hoND${dim}D(xND, termIdx, uniforms);
}
`
}

/**
 * Generate a dimension-specific cached hoND function that uses the eigenfunction cache.
 * Uses ho1DCached() instead of ho1D() for ~10x faster evaluation.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL function code for cached hoND{dimension}D
 */
export function generateHoNDCachedBlock(dimension: number): string {
  const ho1DCachedChain = Array.from({ length: dimension }, (_, i) => {
    if (i === 0) {
      return `  var p = ho1DCached(getEigenFuncIdx(termIdx, 0), xND[0]);
  if (abs(p) < 1e-10) { return 0.0; }`
    } else if (i === dimension - 1) {
      return `
  p *= ho1DCached(getEigenFuncIdx(termIdx, ${i}), xND[${i}]);
  return p;`
    } else {
      return `
  p *= ho1DCached(getEigenFuncIdx(termIdx, ${i}), xND[${i}]);
  if (abs(p) < 1e-10) { return 0.0; }`
    }
  }).join('')

  return `
// ============================================
// Harmonic Oscillator ND - ${dimension}D (Cached, Unrolled)
// ============================================

fn hoND${dimension}DCached(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
${ho1DCachedChain}
}
`
}

/**
 * Generate dispatch block for cached hoND.
 * Provides hoNDOptimized() that calls the cached variant.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL dispatch block code
 */
export function generateHoNDCachedDispatchBlock(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  return `
// ============================================
// Harmonic Oscillator ND - Cached Compile-time Dispatch
// Dimension: ${dim}
// ============================================

fn hoNDOptimized(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
  return hoND${dim}DCached(xND, termIdx, uniforms);
}
`
}

/**
 * Get the generated block for a specific dimension.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL code for the hoND function
 */
export function getHoNDBlockForDimension(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 2), 11)
  switch (dim) {
    case 2:
      return hoND2dBlock
    case 3:
      return hoND3dBlock
    case 4:
      return hoND4dBlock
    case 5:
      return hoND5dBlock
    case 6:
      return hoND6dBlock
    case 7:
      return hoND7dBlock
    case 8:
      return hoND8dBlock
    case 9:
      return hoND9dBlock
    case 10:
      return hoND10dBlock
    case 11:
      return hoND11dBlock
    default:
      return hoND11dBlock
  }
}
