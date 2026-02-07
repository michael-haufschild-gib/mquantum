/**
 * WGSL Unrolled Harmonic Oscillator Superposition Evaluation
 *
 * When the number of superposition terms is known at compile time,
 * we can generate fully unrolled evaluation code that eliminates:
 * - Runtime loop with dynamic break condition
 * - Loop overhead and branch misprediction
 *
 * Port of GLSL quantum/hoSuperpositionVariants.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hoSuperpositionVariants.wgsl
 */

/**
 * Generate unrolled HO superposition evaluation for a specific term count.
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns WGSL function code
 */
function generateHOSuperpositionBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
  // Term ${k}
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let phase${k} = -getEnergy(uniforms, ${k}) * t;
  let timeFactor${k} = cexp_i(phase${k});
  let term${k} = cmul(getCoeff(uniforms, ${k}), timeFactor${k});
  var psi = cscale(spatial${k}, term${k});`
    } else {
      return `
  // Term ${k}
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let phase${k} = -getEnergy(uniforms, ${k}) * t;
  let timeFactor${k} = cexp_i(phase${k});
  let term${k} = cmul(getCoeff(uniforms, ${k}), timeFactor${k});
  psi += cscale(spatial${k}, term${k});`
    }
  }).join('\n')

  return `
// ============================================
// HO Superposition - ${termCount} Term${termCount > 1 ? 's' : ''} (Unrolled)
// ============================================

fn evalHOSuperposition${termCount}(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {${terms}

  return psi;
}
`
}

/**
 * Generate unrolled spatial-only evaluation (for phase calculation).
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns WGSL function code
 */
function generateHOSpatialBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  var psi = cscale(spatial${k}, getCoeff(uniforms, ${k}));`
    } else {
      return `
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  psi += cscale(spatial${k}, getCoeff(uniforms, ${k}));`
    }
  }).join('\n')

  return `
// Spatial-only evaluation for ${termCount} term${termCount > 1 ? 's' : ''}
fn evalHOSpatial${termCount}(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> vec2f {${terms}

  return psi;
}
`
}

/**
 * Generate combined time + spatial evaluation (for evalPsiWithSpatialPhase).
 *
 * @param termCount - Number of superposition terms (1-8)
 * @returns WGSL function code
 */
function generateHOCombinedBlock(termCount: number): string {
  const terms = Array.from({ length: termCount }, (_, k) => {
    if (k === 0) {
      return `
  // Term ${k}: compute spatial ONCE, use for both
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let coeff${k} = getCoeff(uniforms, ${k});

  // Spatial-only accumulation
  var psiSpatial = cscale(spatial${k}, coeff${k});

  // Time-dependent accumulation
  let phase${k} = -getEnergy(uniforms, ${k}) * t;
  let timeFactor${k} = cexp_i(phase${k});
  let term${k} = cmul(coeff${k}, timeFactor${k});
  var psiTime = cscale(spatial${k}, term${k});`
    } else {
      return `
  // Term ${k}
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let coeff${k} = getCoeff(uniforms, ${k});
  psiSpatial += cscale(spatial${k}, coeff${k});
  let phase${k} = -getEnergy(uniforms, ${k}) * t;
  let timeFactor${k} = cexp_i(phase${k});
  let term${k} = cmul(coeff${k}, timeFactor${k});
  psiTime += cscale(spatial${k}, term${k});`
    }
  }).join('\n')

  return `
// Combined time + spatial for ${termCount} term${termCount > 1 ? 's' : ''}
fn evalHOCombined${termCount}(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {${terms}

  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);
  return vec4f(psiTime.x, psiTime.y, spatialPhase, 0.0);
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
 * @param termCount
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
 * @returns WGSL dispatch code
 */
export function generateHODispatchBlock(termCount: number): string {
  const tc = Math.min(Math.max(termCount, 1), 8)
  return `
// ============================================
// HO Superposition Dispatch (${tc} term${tc > 1 ? 's' : ''}, unrolled)
// ============================================

// evalHarmonicOscillatorPsi: Direct call to unrolled ${tc}-term variant
fn evalHarmonicOscillatorPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHOSuperposition${tc}(xND, t, uniforms);
}

// evalHOSpatialOnly: Direct call to unrolled spatial variant
fn evalHOSpatialOnly(xND: array<f32, 11>, uniforms: SchroedingerUniforms) -> vec2f {
  return evalHOSpatial${tc}(xND, uniforms);
}

// evalHOCombinedPsi: Direct call to unrolled combined variant
fn evalHOCombinedPsi(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  return evalHOCombined${tc}(xND, t, uniforms);
}
`
}

/**
 * Get cached HO unrolled blocks.
 * Since the existing superposition variants already call hoNDOptimized(),
 * and the cached dispatch block redefines hoNDOptimized to use the cache,
 * the existing blocks work as-is for the cached path.
 */
export const getHOCachedUnrolledBlocks = getHOUnrolledBlocks

/**
 * Generate cached HO dispatch block.
 * Identical to the standard dispatch since hoNDOptimized handles the routing.
 */
export const generateHOCachedDispatchBlock = generateHODispatchBlock
