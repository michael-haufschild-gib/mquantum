/**
 * WGSL Volume rendering shader modules for Schrödinger visualization
 *
 * Provides emission, absorption, and integration functions for
 * volumetric raymarching of quantum wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume
 */

export { absorptionBlock } from './absorption.wgsl'
export { emissionBlock, emissionPreBlock, emissionPostBlock, generateComputeBaseColor, COLOR_ALG_NAMES } from './emission.wgsl'
export { volumeGradientBlock, volumeIntegrationBlock } from './integration.wgsl'
