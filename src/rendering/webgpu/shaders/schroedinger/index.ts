/**
 * Schrödinger WGSL Shaders
 *
 * Exports Schrödinger-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/schroedinger
 */

export type { QuantumModeForShader, SchroedingerWGSLShaderConfig } from './compose'
export { composeSchroedingerShader, composeSchroedingerVertexShader } from './compose'
export { MAX_DIM, MAX_EXTRA_DIM, MAX_TERMS, schroedingerUniformsBlock } from './uniforms.wgsl'

// Quantum math modules (foundational math functions)
export {
  // Core math
  complexMathBlock,
  densityBlock,
  densityPostMapBlock,
  // Density field calculations
  densityPreMapBlock,
  EIGEN_CACHE_SAMPLES,
  // Eigenfunction cache
  eigenfunctionCacheBindingsBlock,
  eigenfunctionCacheLookupBlock,
  generateAnalyticalGradientBlock,
  generateHOCachedDispatchBlock,
  generateHODispatchBlock,
  // HO ND cached variants
  generateHoNDCachedBlock,
  generateHoNDCachedDispatchBlock,
  generateHoNDDispatchBlock,
  // Hydrogen ND cached variants
  generateHydrogenNDCachedBlock,
  generateHydrogenNDCachedDispatchBlock,
  generateHydrogenNDDispatchBlock,
  generateMapPosToND,
  getHOCachedUnrolledBlocks,
  getHoNDBlockForDimension,
  getHOUnrolledBlocks,
  getHydrogenNDBlockForDimension,
  hermiteBlock,
  ho1dBlock,
  hoCombined1Block,
  hoCombined2Block,
  hoCombined3Block,
  hoCombined4Block,
  hoCombined5Block,
  hoCombined6Block,
  hoCombined7Block,
  hoCombined8Block,
  // HO ND variants and generators
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
  hoSpatial1Block,
  hoSpatial2Block,
  hoSpatial3Block,
  hoSpatial4Block,
  hoSpatial5Block,
  hoSpatial6Block,
  hoSpatial7Block,
  hoSpatial8Block,
  // HO superposition variants and generators
  hoSuperposition1Block,
  hoSuperposition2Block,
  hoSuperposition3Block,
  hoSuperposition4Block,
  hoSuperposition5Block,
  hoSuperposition6Block,
  hoSuperposition7Block,
  hoSuperposition8Block,
  hydrogenFamilyFallbackBlock,
  hydrogenNDCommonBlock,
  // Hydrogen ND variants and generators
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
  // Hydrogen atom
  hydrogenRadialBlock,
  laguerreBlock,
  legendreBlock,
  MAX_EIGEN_FUNCS,
  // Mode-switching wavefunction evaluation
  psiBlock,
  psiBlockDynamic,
  psiBlockDynamicHarmonic,
  psiBlockHarmonic,
  psiBlockHydrogenND,
  sphericalHarmonicsBlock,
} from './quantum'

// Compute shader modules for density grid pre-computation (uncertainty boundary)
export {
  composeDensityGridComputeShader,
  type ComputeQuantumMode,
  densityGridComputeBlock,
  type DensityGridComputeConfig,
  gridParamsBlock,
} from './compute'

// Compute shader modules for eigenfunction cache (HO mode acceleration)
export { composeEigenfunctionCacheComputeShader } from './compute'
