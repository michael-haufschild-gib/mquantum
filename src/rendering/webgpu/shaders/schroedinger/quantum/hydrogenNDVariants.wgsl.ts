/**
 * WGSL Dimension-specific Hydrogen ND Wavefunction Variants
 *
 * These are fully unrolled versions of hydrogen ND evaluation for each dimension 3-11.
 * Following the hoNDVariants pattern: ALL code is generated at JavaScript level
 * to eliminate runtime loops and enable maximum GPU compiler optimization.
 *
 * Port of GLSL quantum/hydrogenNDVariants.glsl to WGSL.
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
 */
function generateCoordExtraction(dimension: number): string {
  const coords = Array.from(
    { length: dimension },
    (_, i) => `  let x${i} = xND[${i}];`
  ).join('\n')
  return coords
}

/**
 * Generate the extra-dimension early exit check (fully unrolled).
 * Only for dimensions > 3.
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
  const distSqTerms = Array.from(
    { length: extraDimCount },
    (_, i) => `u_ed${i}*u_ed${i}`
  ).join(' + ')

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
 */
function generateRadiusCalculation(dimension: number): string {
  // First compute sum3D for reuse
  const sum3D = 'x0*x0 + x1*x1 + x2*x2'

  if (dimension === 3) {
    return `
  // 3D radius
  let r3D = sqrt(${sum3D});
  let rND = r3D;
`
  }

  // For dimensions > 3, compute sum of extra dimension squares
  const extraSqTerms = Array.from(
    { length: dimension - 3 },
    (_, i) => `x${i + 3}*x${i + 3}`
  ).join(' + ')

  return `
  // PERF: Compute sum3D once, reuse for both rND and r3D
  let sum3D = ${sum3D};

  // ${dimension}D radius
  let rND = sqrt(sum3D + ${extraSqTerms});

  // 3D radius (reusing sum3D)
  let r3D = sqrt(sum3D);
`
}

/**
 * Generate the extra dimension HO product (fully unrolled, inlined ho1D calls).
 * Only for dimensions > 3.
 */
function generateExtraDimProduct(dimension: number): string {
  const extraDimCount = dimension - 3
  if (extraDimCount <= 0) {
    return `
  // No extra dimensions
  let extraProduct = 1.0;
`
  }

  // Generate inlined ho1D calls for each extra dimension
  const hoCallsWithEarlyExit = Array.from({ length: extraDimCount }, (_, i) => {
    const efVar = `ef${i}`
    const coordVar = `x${i + 3}`
    if (i === 0) {
      return `  let ${efVar} = ho1D(getExtraDimN(uniforms, ${i}), ${coordVar}, getExtraDimOmega(uniforms, ${i}));
  if (abs(${efVar}) < 1e-10) { return vec2f(0.0, 0.0); }`
    } else if (i === extraDimCount - 1) {
      // Last one - no early exit check needed
      return `  let ${efVar} = ho1D(getExtraDimN(uniforms, ${i}), ${coordVar}, getExtraDimOmega(uniforms, ${i}));`
    } else {
      return `  let ${efVar} = ho1D(getExtraDimN(uniforms, ${i}), ${coordVar}, getExtraDimOmega(uniforms, ${i}));
  if (abs(${efVar}) < 1e-10) { return vec2f(0.0, 0.0); }`
    }
  }).join('\n')

  // Generate product calculation
  const productTerms = Array.from({ length: extraDimCount }, (_, i) => `ef${i}`).join(' * ')

  return `
  // Extra dimension factors (unrolled, inlined ho1D calls)
${hoCallsWithEarlyExit}
  let extraProduct = ${productTerms};
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

  return `
// ============================================
// Hydrogen ND - ${dimension}D (Fully Unrolled)
// Extra dimensions: ${extraDimCount}
// Generated at JavaScript level for maximum optimization
// ============================================

fn evalHydrogenNDPsi${dimension}D(xND: array<f32, 11>, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  // Extract coordinates (unrolled)
${coordExtraction}
${extraDimEarlyExit}${radiusCalc}
  // EARLY EXIT 2: Check hydrogen radial threshold
  if (hydrogenRadialEarlyExit(rND, uniforms)) {
    return vec2f(0.0, 0.0);
  }

  // Spherical angles from first 3 dimensions
  let angles = sphericalAngles3D(x0, x1, x2, r3D);
  let theta = angles.x;
  let phi = angles.y;

  // Radial part: R_nl(r_ND) using ND radius
  let R = hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, rND, uniforms.bohrRadius);

  // Angular part: Y_lm(theta, phi) from first 3 dims
  let Y = evalHydrogenNDAngular(uniforms.azimuthalL, uniforms.magneticM, theta, phi, uniforms.useRealOrbitals);
${extraDimProduct}
  // Combine: psi = R * Y * extraProduct
  let psiReal = R * Y * extraProduct;

  // Time evolution
  return hydrogenNDTimeEvolution(psiReal, uniforms.principalN, t);
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
  const dim = Math.min(Math.max(dimension, 3), 11)
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

// Pre-generate all dimension-specific blocks
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
 * @param dimension - The dimension (3-11)
 * @returns WGSL code for the hydrogen ND function
 */
export function getHydrogenNDBlockForDimension(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)
  switch (dim) {
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
