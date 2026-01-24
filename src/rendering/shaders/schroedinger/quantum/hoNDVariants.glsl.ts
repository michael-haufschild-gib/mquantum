/**
 * Dimension-specific Harmonic Oscillator ND Eigenfunction Variants
 *
 * These are fully unrolled versions of hoND() for each dimension 3-11.
 * GPU cannot effectively branch-predict early exit in loops, so we
 * provide compile-time specialized versions that eliminate the overhead.
 *
 * Each function:
 * 1. Computes the dimension-scaled early exit check (unrolled)
 * 2. Computes the product of ho1D eigenfunctions (unrolled)
 *
 * PERFORMANCE OPTIMIZATION: The early-exit threshold is scaled with dimension
 * to equalize work across dimensions. Without this, lower dimensions compute
 * more samples (slower) because the fixed threshold cuts off less of the
 * χ² distribution in lower D.
 *
 * Threshold formula: 2 * D + ln(D) * 3
 * This approximates equal coverage of the χ²(D) distribution across dimensions.
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
 * This gives approximately equal "fill factor" across dimensions:
 * - 3D: 9.3   (was 18.0 - now more aggressive, ~2x faster)
 * - 4D: 12.2  (was 18.0 - now more aggressive, ~1.5x faster)
 * - 5D: 14.8  (was 18.0 - slightly more aggressive)
 * - 6D: 17.4  (was 18.0 - nearly unchanged)
 * - 7D: 19.8  (was 18.0 - slightly less aggressive)
 * - 8D: 22.2  (was 18.0 - less aggressive, captures more)
 * - 9D: 24.6  (was 18.0 - less aggressive)
 * - 10D: 26.9 (was 18.0 - less aggressive)
 * - 11D: 29.2 (was 18.0 - less aggressive)
 *
 * @param dimension - The dimension (3-11)
 * @returns The early-exit threshold for distSq comparison
 */
function computeEarlyExitThreshold(dimension: number): number {
  return 2 * dimension + Math.log(dimension) * 3
}

/**
 * Generate a dimension-specific hoND function.
 *
 * @param dimension - The dimension (3-11)
 * @returns GLSL function code for hoND{dimension}D
 */
function generateHoNDBlock(dimension: number): string {
  const threshold = computeEarlyExitThreshold(dimension).toFixed(1)

  // Generate alpha declarations
  const alphaDecls = Array.from(
    { length: dimension },
    (_, i) => `    float alpha${i} = sqrt(max(uOmega[${i}], 0.01));`
  ).join('\n')

  // Generate u calculations
  const uCalcs = Array.from(
    { length: dimension },
    (_, i) => `    float u${i} = alpha${i} * xND[${i}];`
  ).join('\n')

  // Generate distSq sum
  const distSqTerms = Array.from({ length: dimension }, (_, i) => `u${i}*u${i}`).join(' + ')

  // Generate ho1D product chain
  const ho1DChain = Array.from({ length: dimension }, (_, i) => {
    if (i === 0) {
      return `    float p = ho1D(uQuantum[base + 0], xND[0], uOmega[0]);
    if (abs(p) < 1e-10) return 0.0;`
    } else if (i === dimension - 1) {
      return `
    p *= ho1D(uQuantum[base + ${i}], xND[${i}], uOmega[${i}]);
    return p;`
    } else {
      return `
    p *= ho1D(uQuantum[base + ${i}], xND[${i}], uOmega[${i}]);
    if (abs(p) < 1e-10) return 0.0;`
    }
  }).join('')

  return `
// ============================================
// Harmonic Oscillator ND - ${dimension}D (Unrolled)
// Early-exit threshold: ${threshold} (dimension-scaled)
// ============================================

float hoND${dimension}D(float xND[MAX_DIM], int termIdx) {
${alphaDecls}

${uCalcs}

    float distSq = ${distSqTerms};
    if (distSq > ${threshold}) return 0.0;

    int base = termIdx * MAX_DIM;
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
 * Instead of a #if/#elif chain that references undefined functions,
 * we generate a direct call to the specific dimension's function.
 * @param dimension - The dimension to generate for
 * @returns GLSL dispatch block code
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
float hoNDOptimized(float xND[MAX_DIM], int termIdx) {
    return hoND${dim}D(xND, termIdx);
}
`
}
