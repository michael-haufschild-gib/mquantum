/**
 * WGSL Volume rendering shader modules for Schrödinger visualization
 *
 * Provides emission, absorption, and integration functions for
 * volumetric raymarching of quantum wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume
 */

export { absorptionBlock } from './absorption.wgsl'
export {
  COLOR_ALG_NAMES,
  emissionPostBlock,
  generateComputeBaseColor,
  generateEmissionPreBlock,
} from './emission.wgsl'
export {
  volumeCompositingBlock,
  volumeGradientBlock,
  volumeIntegrationBlock,
} from './integration.wgsl'
