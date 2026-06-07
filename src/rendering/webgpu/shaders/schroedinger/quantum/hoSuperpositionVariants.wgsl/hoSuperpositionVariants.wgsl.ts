/**
 * WGSL Unrolled Harmonic Oscillator Superposition Evaluation
 *
 * When the number of superposition terms is known at compile time,
 * we can generate fully unrolled evaluation code that eliminates:
 * - Runtime loop with dynamic break condition
 * - Loop overhead and branch misprediction
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/hoSuperpositionVariants.wgsl
 */

import { sanitizeShaderTermCount } from '../../../shared/compose-helpers'

export const hermiteCocycleInflationHelpersBlock = /* wgsl */ `
fn isHermiteCocycleInflationActive(uniforms: SchroedingerUniforms) -> bool {
  return uniforms.quantumMode == QUANTUM_MODE_HARMONIC &&
    uniforms.hermiteCocycleInflationEnabled != 0u &&
    uniforms.hermiteCocycleInflationStrength > 0.0 &&
    uniforms.hermiteCocycleShellRadius > 0.0;
}

fn hermiteCocycleInflationPhase(
  xND: array<f32, 11>,
  termIdx: i32,
  uniforms: SchroedingerUniforms
) -> f32 {
  if (!isHermiteCocycleInflationActive(uniforms)) {
    return 0.0;
  }

  let strength = clamp(uniforms.hermiteCocycleInflationStrength, 0.0, 2.0);
  let shellRadius = clamp(uniforms.hermiteCocycleShellRadius, 0.1, 2.0);
  let twist = clamp(uniforms.hermiteCocycleInflationTwist, 0.0, 8.0);
  let invRadius = 1.0 / shellRadius;
  let x = xND[0];
  let y = xND[1];
  let z = select(0.0, xND[2], ACTUAL_DIM >= 3);
  let w = select(0.0, xND[3], ACTUAL_DIM >= 4);
  let px = x * invRadius;
  let py = y * invRadius;
  let pz = z * invRadius;
  let pw = w * invRadius;
  let r = sqrt(max(x * x + y * y + z * z, 1e-10));

  let q0 = f32(getQuantumNumber(uniforms, termIdx, 0) + 1);
  let q1 = f32(getQuantumNumber(uniforms, termIdx, 1) + 1);
  let q2 = f32(getQuantumNumber(uniforms, termIdx, 2) + 1);
  let q3 = f32(getQuantumNumber(uniforms, termIdx, 3) + 1);
  let width = max(0.18 * shellRadius, 0.075);
  let radial = (r - shellRadius) / width;
  let originFade = smoothstep(0.12 * shellRadius, 0.55 * shellRadius, r);
  let farFade = 1.0 - smoothstep(shellRadius + 2.0 * width, shellRadius + 4.0 * width, r);
  let shellGate = clamp(exp(-(radial * radial)) * originFade * farFade, 0.0, 1.0);
  if (shellGate <= 1e-8) {
    return 0.0;
  }

  let branch = 0.173 * f32(termIdx + 1);
  let a = sin(q0 * px + twist * (py - pz) + branch);
  let b = sin(q1 * py + twist * (pz - px) + 0.37 * branch);
  let c = sin(q2 * pz + twist * (px - py) + 0.61 * branch);
  let projectedCocycle = a * b * c;
  let cyclicParity = 0.5 * sin(
    q0 * py * pz + q1 * pz * px + q2 * px * py + twist * (px + 0.5 * py - 0.25 * pz)
  );
  let bulkCocycle = select(
    0.0,
    0.6 * sin(q3 * pw + twist * (px + py - pz) + 0.5 * branch),
    ACTUAL_DIM >= 4
  );
  let obstruction = clamp(tanh(1.45 * (projectedCocycle + cyclicParity + bulkCocycle)), -1.0, 1.0);
  return clamp(strength * shellGate * obstruction, -strength, strength);
}

fn applyHermiteCocycleInflation(
  term: vec2f,
  xND: array<f32, 11>,
  termIdx: i32,
  uniforms: SchroedingerUniforms
) -> vec2f {
  let phase = hermiteCocycleInflationPhase(xND, termIdx, uniforms);
  if (abs(phase) <= 1e-7) {
    return term;
  }
  return cmul(term, cexp_i(phase));
}
`

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
  // Term ${k}: term_k = c_k * exp(-i * E_k * t) is host-precomputed once per frame.
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let term${k} = applyHermiteCocycleInflation(uniforms.precomputedTerm[${k}].xy, xND, ${k}, uniforms);
  var psi = cscale(spatial${k}, term${k});`
    }
    return `
  if (${k} < uniforms.termCount) {
  // Term ${k}
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let term${k} = applyHermiteCocycleInflation(uniforms.precomputedTerm[${k}].xy, xND, ${k}, uniforms);
  psi += cscale(spatial${k}, term${k});
  }`
  }).join('\n')

  // The 't' parameter is retained for ABI stability with the dispatch block but
  // is no longer used inside the unrolled body; the time dependence now lives
  // entirely inside uniforms.precomputedTerm. WGSL allows unused parameters.
  return `
// ============================================
// HO Superposition - ${termCount} Term${termCount > 1 ? 's' : ''} (Unrolled)
// ============================================

fn evalHOSuperposition${termCount}(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let _t_unused = t; // suppress unused-parameter warnings on strict toolchains${terms}

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
  let coeff${k} = applyHermiteCocycleInflation(getCoeff(uniforms, ${k}), xND, ${k}, uniforms);
  var psi = cscale(spatial${k}, coeff${k});`
    }
    return `
  if (${k} < uniforms.termCount) {
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let coeff${k} = applyHermiteCocycleInflation(getCoeff(uniforms, ${k}), xND, ${k}, uniforms);
  psi += cscale(spatial${k}, coeff${k});
  }`
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
  // Term ${k}: compute spatial ONCE, use for both spatial-only and time-dependent paths.
  // term_k = c_k * exp(-i * E_k * t) is host-precomputed; coeff${k} is still needed
  // for the spatial-only (t = 0) accumulator that drives the spatial reference phase.
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let coeff${k} = applyHermiteCocycleInflation(getCoeff(uniforms, ${k}), xND, ${k}, uniforms);

  // Spatial-only accumulation
  var psiSpatial = cscale(spatial${k}, coeff${k});

  // Time-dependent accumulation (uses host-precomputed term)
  let term${k} = applyHermiteCocycleInflation(uniforms.precomputedTerm[${k}].xy, xND, ${k}, uniforms);
  var psiTime = cscale(spatial${k}, term${k});`
    }
    return `
  if (${k} < uniforms.termCount) {
  // Term ${k}
  let spatial${k} = hoNDOptimized(xND, ${k}, uniforms);
  let coeff${k} = applyHermiteCocycleInflation(getCoeff(uniforms, ${k}), xND, ${k}, uniforms);
  psiSpatial += cscale(spatial${k}, coeff${k});
  let term${k} = applyHermiteCocycleInflation(uniforms.precomputedTerm[${k}].xy, xND, ${k}, uniforms);
  psiTime += cscale(spatial${k}, term${k});
  }`
  }).join('\n')

  // The 't' parameter is retained for ABI stability; the time dependence has
  // been hoisted into uniforms.precomputedTerm and computed on the host.
  return `
// Combined time + spatial for ${termCount} term${termCount > 1 ? 's' : ''}
fn evalHOCombined${termCount}(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec4f {
  let _t_unused = t; // suppress unused-parameter warnings on strict toolchains${terms}

  let spatialPhase = atan2(psiSpatial.y, psiSpatial.x);
  let refNorm2 = dot(psiSpatial, psiSpatial);
  let psiNorm2 = dot(psiTime, psiTime);
  var relativePhase = spatialPhase;
  if (refNorm2 > 1e-12 && psiNorm2 > 1e-12) {
    let imagPart = psiSpatial.x * psiTime.y - psiSpatial.y * psiTime.x;
    let realPart = dot(psiSpatial, psiTime);
    relativePhase = atan2(imagPart, realPart);
  }
  return vec4f(psiTime.x, psiTime.y, spatialPhase, relativePhase);
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
  helpers: string
  superposition: string
  spatial: string
  combined: string
} {
  const tc = sanitizeShaderTermCount(termCount) ?? 1
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
    helpers: hermiteCocycleInflationHelpersBlock,
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
  const tc = sanitizeShaderTermCount(termCount) ?? 1
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
