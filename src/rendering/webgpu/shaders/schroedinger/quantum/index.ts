/**
 * WGSL Quantum math shader modules for Schrödinger wavefunction visualization
 *
 * Module order matters for WGSL dependencies:
 * 1. complex - basic complex number operations
 * 2. hermite - Hermite polynomials (no deps)
 * 3. laguerre - Associated Laguerre polynomials (no deps)
 * 4. legendre - Associated Legendre polynomials (no deps)
 * 5. sphericalHarmonics - Y_lm (depends on legendre)
 * 6. ho1d - 1D harmonic oscillator (depends on hermite)
 * 7. hydrogenRadial - Hydrogen radial R_nl (depends on laguerre)
 * 8. hydrogenNDCommon - Shared hydrogen ND utilities
 * 9. hoNDVariants - Dimension-specific HO ND (depends on ho1d)
 * 10. hoSuperpositionVariants - Unrolled HO superposition (depends on hoNDVariants)
 * 11. hydrogenNDVariants - Dimension-specific hydrogen ND (depends on hydrogenNDCommon)
 * 12. psi - Mode-switching wavefunction evaluation (depends on all above)
 * 13. density - Density field calculations (depends on psi)
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum
 */

// Core math modules
export { complexMathBlock } from './complex.wgsl'
export { hermiteBlock } from './hermite.wgsl'
export { laguerreBlock } from './laguerre.wgsl'
export { legendreBlock } from './legendre.wgsl'
export { sphericalHarmonicsBlock } from './sphericalHarmonics.wgsl'
export { ho1dBlock } from './ho1d.wgsl'

// Hydrogen atom modules
export { hydrogenRadialBlock } from './hydrogenRadial.wgsl'
export { hydrogenNDCommonBlock } from './hydrogenNDCommon.wgsl'

// Dimension-specific HO ND variants with generators
export {
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
  generateHoNDDispatchBlock,
  getHoNDBlockForDimension,
} from './hoNDVariants.wgsl'

// Unrolled HO superposition variants with generators
export {
  hoSuperposition1Block,
  hoSuperposition2Block,
  hoSuperposition3Block,
  hoSuperposition4Block,
  hoSuperposition5Block,
  hoSuperposition6Block,
  hoSuperposition7Block,
  hoSuperposition8Block,
  hoSpatial1Block,
  hoSpatial2Block,
  hoSpatial3Block,
  hoSpatial4Block,
  hoSpatial5Block,
  hoSpatial6Block,
  hoSpatial7Block,
  hoSpatial8Block,
  hoCombined1Block,
  hoCombined2Block,
  hoCombined3Block,
  hoCombined4Block,
  hoCombined5Block,
  hoCombined6Block,
  hoCombined7Block,
  hoCombined8Block,
  getHOUnrolledBlocks,
  generateHODispatchBlock,
} from './hoSuperpositionVariants.wgsl'

// Dimension-specific hydrogen ND variants with generators
export {
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
  generateHydrogenNDDispatchBlock,
  getHydrogenNDBlockForDimension,
} from './hydrogenNDVariants.wgsl'

// Mode-switching wavefunction evaluation
export {
  psiBlock,
  psiBlockDynamic,
  psiBlockHarmonic,
  psiBlockDynamicHarmonic,
  psiBlockHydrogenND,
} from './psi.wgsl'

// Hydrogen fallback stubs for family-specialized composition
export { hydrogenFamilyFallbackBlock } from './hydrogenFallback.wgsl'

// Density field calculations
export {
  densityPreMapBlock,
  generateMapPosToND,
  densityPostMapBlock,
  densityBlock,
} from './density.wgsl'
