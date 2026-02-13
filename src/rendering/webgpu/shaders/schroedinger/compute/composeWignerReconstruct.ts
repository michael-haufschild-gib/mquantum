/**
 * Wigner Reconstruction Shader Composer
 *
 * Assembles the compute shader for Phase 2 (per-frame reconstruction) of
 * the two-phase Wigner cache pipeline. Very lightweight — no quantum math,
 * just texture reads and scalar multiply-accumulate.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/composeWignerReconstruct
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'

// Reconstruct-specific blocks
import {
  wignerReconstructParamsBlock,
  generateWignerReconstructBindingsBlock,
  wignerReconstructComputeBlock,
} from './wignerReconstruct.wgsl'

/**
 * Compose the Wigner reconstruction compute shader.
 *
 * Minimal shader: no quantum math modules needed.
 * Just reads textures, multiplies by phased coefficients, writes output.
 *
 * @returns Composed WGSL code and metadata
 */
export function composeWignerReconstructComputeShader(): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const blocks = [
    // Reconstruct params struct
    { name: 'Reconstruct Params', content: wignerReconstructParamsBlock },

    // Bind group declarations
    { name: 'Reconstruct Bindings', content: generateWignerReconstructBindingsBlock() },

    // Entry point
    { name: 'Reconstruct Main', content: wignerReconstructComputeBlock },
  ]

  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return {
    wgsl,
    modules,
    features: ['Wigner Reconstruction'],
  }
}
