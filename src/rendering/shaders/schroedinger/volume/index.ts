/**
 * Volumetric rendering shader modules for Schrödinger visualization
 *
 * Module order matters for GLSL dependencies:
 * 1. absorption - Beer-Lambert alpha calculation
 * 2. emission - color computation from density/phase
 * 3. integration - volume raymarch loop (depends on both)
 */

export { absorptionBlock } from './absorption.glsl'
export { emissionBlock } from './emission.glsl'
export { volumeIntegrationBlock } from './integration.glsl'
