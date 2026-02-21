/**
 * Schrödinger WGSL Shaders
 *
 * Exports Schrödinger-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/schroedinger
 */

export { schroedingerUniformsBlock, MAX_DIM, MAX_TERMS, MAX_EXTRA_DIM } from './uniforms.wgsl'
export { composeSchroedingerShader, composeSchroedingerVertexShader } from './compose'
export type { SchroedingerWGSLShaderConfig, QuantumModeForShader } from './compose'

// Quantum math modules (foundational math functions)
export {
  // Core math
  complexMathBlock,
  hermiteBlock,
  laguerreBlock,
  legendreBlock,
  sphericalHarmonicsBlock,
  ho1dBlock,
  // Hydrogen atom
  hydrogenRadialBlock,
  hydrogenNDCommonBlock,
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
  generateHoNDDispatchBlock,
  getHoNDBlockForDimension,
  // HO superposition variants and generators
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
  getHOCachedUnrolledBlocks,
  generateHOCachedDispatchBlock,
  // HO ND cached variants
  generateHoNDCachedBlock,
  generateHoNDCachedDispatchBlock,
  // Eigenfunction cache
  eigenfunctionCacheBindingsBlock,
  eigenfunctionCacheLookupBlock,
  EIGEN_CACHE_SAMPLES,
  MAX_EIGEN_FUNCS,
  generateAnalyticalGradientBlock,
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
  generateHydrogenNDDispatchBlock,
  getHydrogenNDBlockForDimension,
  // Hydrogen ND cached variants
  generateHydrogenNDCachedBlock,
  generateHydrogenNDCachedDispatchBlock,
  // Mode-switching wavefunction evaluation
  psiBlock,
  psiBlockDynamic,
  psiBlockHarmonic,
  psiBlockDynamicHarmonic,
  psiBlockHydrogenND,
  hydrogenFamilyFallbackBlock,
  // Density field calculations
  densityPreMapBlock,
  generateMapPosToND,
  densityPostMapBlock,
  densityBlock,
} from './quantum'


// Compute shader modules for density grid pre-computation (uncertainty boundary)
export {
  gridParamsBlock,
  densityGridComputeBlock,
  composeDensityGridComputeShader,
  type DensityGridComputeConfig,
  type ComputeQuantumMode,
} from './compute'

// Compute shader modules for eigenfunction cache (HO mode acceleration)
export { composeEigenfunctionCacheComputeShader } from './compute'
