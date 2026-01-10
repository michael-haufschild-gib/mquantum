/**
 * Hydrogen ND shader module exports
 *
 * Common utilities for hydrogen orbital visualization in N dimensions.
 * Uses hybrid approach: Y_lm for first 3 dims + HO basis for extra dims.
 *
 * Dimension-specific blocks are generated in hydrogenNDVariants.glsl.ts
 * using JavaScript-level code generation for maximum optimization.
 */

export { hydrogenNDCommonBlock } from './hydrogenNDCommon.glsl'
