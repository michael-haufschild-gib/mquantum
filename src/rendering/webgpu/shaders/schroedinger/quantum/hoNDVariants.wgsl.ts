/**
 * WGSL Dimension-specific Harmonic Oscillator ND Eigenfunction Variants
 *
 * These are fully unrolled versions of hoND() for each dimension 3-11.
 * GPU cannot effectively branch-predict early exit in loops, so we
 * provide compile-time specialized versions that eliminate the overhead.
 *
 * Port of GLSL quantum/hoNDVariants.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hoNDVariants.wgsl
 */

/**
 * Compute dimension-scaled early-exit threshold.
 *
 * The threshold is based on the χ² distribution - in higher dimensions,
 * the sum of squared Gaussians has a higher expected value, so we need
 * a larger threshold to capture the same fraction of the probability mass.
 *
 * Formula: 2 * dimension + ln(dimension) * 3
 *
 * @param dimension - The dimension (3-11)
 * @returns The early-exit threshold for distSq comparison
 */
function computeEarlyExitThreshold(dimension: number): number {
  return 2 * dimension + Math.log(dimension) * 3
}

/**
 * Generate a dimension-specific hoND function for WGSL.
 *
 * @param dimension - The dimension (3-11)
 * @returns WGSL function code for hoND{dimension}D
 */
function generateHoNDBlock(dimension: number): string {
  const threshold = computeEarlyExitThreshold(dimension).toFixed(1)

  // Generate alpha declarations
  const alphaDecls = Array.from(
    { length: dimension },
    (_, i) => `  let alpha${i} = sqrt(max(uniforms.omega[${i}], 0.01));`
  ).join('\n')

  // Generate u calculations
  const uCalcs = Array.from(
    { length: dimension },
    (_, i) => `  let u${i} = alpha${i} * xND[${i}];`
  ).join('\n')

  // Generate distSq sum
  const distSqTerms = Array.from({ length: dimension }, (_, i) => `u${i}*u${i}`).join(' + ')

  // Generate ho1D product chain
  const ho1DChain = Array.from({ length: dimension }, (_, i) => {
    if (i === 0) {
      return `  var p = ho1D(uniforms.quantum[base + 0], xND[0], uniforms.omega[0]);
  if (abs(p) < 1e-10) { return 0.0; }`
    } else if (i === dimension - 1) {
      return `
  p *= ho1D(uniforms.quantum[base + ${i}], xND[${i}], uniforms.omega[${i}]);
  return p;`
    } else {
      return `
  p *= ho1D(uniforms.quantum[base + ${i}], xND[${i}], uniforms.omega[${i}]);
  if (abs(p) < 1e-10) { return 0.0; }`
    }
  }).join('')

  return `
// ============================================
// Harmonic Oscillator ND - ${dimension}D (Unrolled)
// Early-exit threshold: ${threshold} (dimension-scaled)
// ============================================

fn hoND${dimension}D(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
${alphaDecls}

${uCalcs}

  let distSq = ${distSqTerms};
  if (distSq > ${threshold}) { return 0.0; }

  let base = termIdx * 11;
${ho1DChain}
}
`
}

// Pre-generate all dimension-specific blocks with computed thresholds
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
  const dim = Math.min(Math.max(dimension, 3), 11)
  const threshold = computeEarlyExitThreshold(dim).toFixed(1)
  return `
// ============================================
// Harmonic Oscillator ND - Compile-time Dispatch
// Dimension: ${dim}, Early-exit threshold: ${threshold}
// ============================================

// hoNDOptimized: Direct call to dimension-specific unrolled variant
// Generated at shader compile time for dimension ${dim}
fn hoNDOptimized(xND: array<f32, 11>, termIdx: i32, uniforms: SchroedingerUniforms) -> f32 {
  return hoND${dim}D(xND, termIdx, uniforms);
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
  const dim = Math.min(Math.max(dimension, 3), 11)
  switch (dim) {
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
