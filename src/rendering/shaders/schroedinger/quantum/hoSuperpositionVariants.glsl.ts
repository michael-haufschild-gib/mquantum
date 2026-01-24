/**
 * Unrolled Harmonic Oscillator Superposition Evaluation
 *
 * When the number of superposition terms is known at compile time,
 * we can generate fully unrolled evaluation code that eliminates:
 * - Runtime loop with dynamic break condition
 * - Loop overhead and branch misprediction
 *
 * This is particularly effective for single-term evaluation (termCount=1)
 * which is the common case for visualizing individual eigenstates.
 *
 * Generated functions:
 * - evalHOSuperposition1(): Single term (most common)
 * - evalHOSuperposition2(): Two terms
 * - ...up to evalHOSuperposition8(): Eight terms (MAX_TERMS)
 *
 * Each function computes:
 *   ψ(x,t) = Σ_k c_k · Φ_k(x) · e^{-iE_k t}
 */

/**
 * Generate unrolled HO superposition evaluation for a specific term count.
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns GLSL function code
 */
function generateHOSuperpositionBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
    // Term ${k}
    float spatial${k} = hoNDOptimized(xND, ${k});
    float phase${k} = -uEnergy[${k}] * t;
    vec2 timeFactor${k} = cexp_i(phase${k});
    vec2 term${k} = cmul(uCoeff[${k}], timeFactor${k});
    vec2 psi = cscale(spatial${k}, term${k});`
    } else {
      return `
    // Term ${k}
    float spatial${k} = hoNDOptimized(xND, ${k});
    float phase${k} = -uEnergy[${k}] * t;
    vec2 timeFactor${k} = cexp_i(phase${k});
    vec2 term${k} = cmul(uCoeff[${k}], timeFactor${k});
    psi += cscale(spatial${k}, term${k});`
    }
  }).join('\n')

  return `
// ============================================
// HO Superposition - ${termCount} Term${termCount > 1 ? 's' : ''} (Unrolled)
// ============================================

vec2 evalHOSuperposition${termCount}(float xND[MAX_DIM], float t) {${terms}

    return psi;
}
`
}

/**
 * Generate unrolled spatial-only evaluation (for phase calculation).
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns GLSL function code
 */
function generateHOSpatialBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
    float spatial${k} = hoNDOptimized(xND, ${k});
    vec2 psi = cscale(spatial${k}, uCoeff[${k}]);`
    } else {
      return `
    float spatial${k} = hoNDOptimized(xND, ${k});
    psi += cscale(spatial${k}, uCoeff[${k}]);`
    }
  }).join('\n')

  return `
// Spatial-only evaluation for ${termCount} term${termCount > 1 ? 's' : ''}
vec2 evalHOSpatial${termCount}(float xND[MAX_DIM]) {${terms}

    return psi;
}
`
}

/**
 * Generate combined time + spatial evaluation (for evalPsiWithSpatialPhase).
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns GLSL function code
 */
function generateHOCombinedBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
    // Term ${k}: compute spatial ONCE, use for both
    float spatial${k} = hoNDOptimized(xND, ${k});
    vec2 coeff${k} = uCoeff[${k}];

    // Spatial-only accumulation
    vec2 psiSpatial = cscale(spatial${k}, coeff${k});

    // Time-dependent accumulation
    float phase${k} = -uEnergy[${k}] * t;
    vec2 timeFactor${k} = cexp_i(phase${k});
    vec2 term${k} = cmul(coeff${k}, timeFactor${k});
    vec2 psiTime = cscale(spatial${k}, term${k});`
    } else {
      return `
    // Term ${k}
    float spatial${k} = hoNDOptimized(xND, ${k});
    vec2 coeff${k} = uCoeff[${k}];
    psiSpatial += cscale(spatial${k}, coeff${k});
    float phase${k} = -uEnergy[${k}] * t;
    vec2 timeFactor${k} = cexp_i(phase${k});
    vec2 term${k} = cmul(coeff${k}, timeFactor${k});
    psiTime += cscale(spatial${k}, term${k});`
    }
  }).join('\n')

  return `
// Combined time + spatial for ${termCount} term${termCount > 1 ? 's' : ''}
vec4 evalHOCombined${termCount}(float xND[MAX_DIM], float t) {${terms}

    float spatialPhase = atan(psiSpatial.y, psiSpatial.x);
    return vec4(psiTime, spatialPhase, 0.0);
}
`
}

// Pre-generate blocks for each term count (1-8)
export const hoSuperposition1Block = generateHOSuperpositionBlock(1)
export const hoSuperposition2Block = generateHOSuperpositionBlock(2)
export const hoSuperposition3Block = generateHOSuperpositionBlock(3)
export const hoSuperposition4Block = generateHOSuperpositionBlock(4)
export const hoSuperposition5Block = generateHOSuperpositionBlock(5)
export const hoSuperposition6Block = generateHOSuperpositionBlock(6)
export const hoSuperposition7Block = generateHOSuperpositionBlock(7)
export const hoSuperposition8Block = generateHOSuperpositionBlock(8)

export const hoSpatial1Block = generateHOSpatialBlock(1)
export const hoSpatial2Block = generateHOSpatialBlock(2)
export const hoSpatial3Block = generateHOSpatialBlock(3)
export const hoSpatial4Block = generateHOSpatialBlock(4)
export const hoSpatial5Block = generateHOSpatialBlock(5)
export const hoSpatial6Block = generateHOSpatialBlock(6)
export const hoSpatial7Block = generateHOSpatialBlock(7)
export const hoSpatial8Block = generateHOSpatialBlock(8)

export const hoCombined1Block = generateHOCombinedBlock(1)
export const hoCombined2Block = generateHOCombinedBlock(2)
export const hoCombined3Block = generateHOCombinedBlock(3)
export const hoCombined4Block = generateHOCombinedBlock(4)
export const hoCombined5Block = generateHOCombinedBlock(5)
export const hoCombined6Block = generateHOCombinedBlock(6)
export const hoCombined7Block = generateHOCombinedBlock(7)
export const hoCombined8Block = generateHOCombinedBlock(8)

/**
 * Get all unrolled HO blocks for a specific term count.
 */
export function getHOUnrolledBlocks(termCount: number): {
  superposition: string
  spatial: string
  combined: string
} {
  const tc = Math.min(Math.max(termCount, 1), 8)
  const superpositionBlocks: string[] = [
    hoSuperposition1Block,
    hoSuperposition2Block,
    hoSuperposition3Block,
    hoSuperposition4Block,
    hoSuperposition5Block,
    hoSuperposition6Block,
    hoSuperposition7Block,
    hoSuperposition8Block,
  ]
  const spatialBlocks: string[] = [
    hoSpatial1Block,
    hoSpatial2Block,
    hoSpatial3Block,
    hoSpatial4Block,
    hoSpatial5Block,
    hoSpatial6Block,
    hoSpatial7Block,
    hoSpatial8Block,
  ]
  const combinedBlocks: string[] = [
    hoCombined1Block,
    hoCombined2Block,
    hoCombined3Block,
    hoCombined4Block,
    hoCombined5Block,
    hoCombined6Block,
    hoCombined7Block,
    hoCombined8Block,
  ]
  // tc is guaranteed to be 1-8, so index tc-1 is always valid (0-7)
  return {
    superposition: superpositionBlocks[tc - 1]!,
    spatial: spatialBlocks[tc - 1]!,
    combined: combinedBlocks[tc - 1]!,
  }
}

/**
 * Generate dispatch block that calls the unrolled variant.
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns GLSL dispatch code
 */
export function generateHODispatchBlock(termCount: number): string {
  const tc = Math.min(Math.max(termCount, 1), 8)
  return `
// ============================================
// HO Superposition Dispatch (${tc} term${tc > 1 ? 's' : ''}, unrolled)
// ============================================

// evalHarmonicOscillatorPsi: Direct call to unrolled ${tc}-term variant
vec2 evalHarmonicOscillatorPsi(float xND[MAX_DIM], float t) {
    return evalHOSuperposition${tc}(xND, t);
}

// evalHOSpatialOnly: Direct call to unrolled spatial variant
vec2 evalHOSpatialOnly(float xND[MAX_DIM]) {
    return evalHOSpatial${tc}(xND);
}

// evalHOCombinedPsi: Direct call to unrolled combined variant
vec4 evalHOCombinedPsi(float xND[MAX_DIM], float t) {
    return evalHOCombined${tc}(xND, t);
}
`
}
