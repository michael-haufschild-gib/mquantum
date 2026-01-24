/**
 * WGSL Volume rendering shader modules for Schrödinger visualization
 *
 * Provides emission, absorption, and integration functions for
 * volumetric raymarching of quantum wavefunctions.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume
 */

export { emissionBlock } from './emission.wgsl'

// Note: absorption.wgsl and integration.wgsl follow similar patterns
// and can be ported as needed for full volumetric rendering support.
