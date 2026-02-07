/**
 * Eigenfunction Cache Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing 1D harmonic oscillator
 * eigenfunctions and their derivatives.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/composeEigenCache
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'
import { constantsBlock } from '../../shared/core/constants.wgsl'
import { hermiteBlock } from '../quantum/hermite.wgsl'
import {
  eigenCacheComputeParamsBlock,
  eigenCacheComputeBindingsBlock,
  eigenCacheComputeMainBlock,
} from './eigenfunctionCache.wgsl'

/**
 * Compose the eigenfunction cache compute shader.
 *
 * This is a minimal shader that only needs:
 * - Mathematical constants (INV_PI)
 * - Hermite polynomial evaluation
 * - The compute entry point with ho1D + derivative computation
 */
export function composeEigenfunctionCacheComputeShader(): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const blocks = [
    { name: 'Constants', content: constantsBlock },
    { name: 'Compute Params', content: eigenCacheComputeParamsBlock },
    { name: 'Compute Bindings', content: eigenCacheComputeBindingsBlock },
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'Compute Main', content: eigenCacheComputeMainBlock },
  ]

  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return {
    wgsl,
    modules,
    features: ['Eigenfunction Cache Compute'],
  }
}
