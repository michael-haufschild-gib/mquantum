/**
 * AdS Bound-State Density Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing the Anti-de Sitter
 * bound-state density texture on the GPU. Simpler than the HO/Hydrogen
 * composer — no eigenfunction cache, no open-quantum, no term-count
 * variants.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/composeAds
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'
import { constantsBlock } from '../../shared/core/constants.wgsl'
import {
  adsBoundStateComputeBlock,
  adsComputeBindingsBlock,
  adsConfigUniformBlock,
  antiDeSitterMathBlock,
} from '../quantum/antiDeSitter.wgsl'
import { schroedingerUniformsBlock } from '../uniforms.wgsl'
import { gridParamsBlock } from './densityGrid.wgsl'

/**
 * Compose the AdS bound-state density compute shader.
 *
 * @returns Composed WGSL code and metadata
 */
export function composeAdsDensityComputeShader(): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const blocks = [
    { name: 'Constants', content: constantsBlock },
    { name: 'Schrödinger Uniforms', content: schroedingerUniformsBlock },
    { name: 'AdS Config Uniforms', content: adsConfigUniformBlock },
    { name: 'Grid Params', content: gridParamsBlock },
    { name: 'AdS Compute Bindings', content: adsComputeBindingsBlock },
    { name: 'AdS Math', content: antiDeSitterMathBlock },
    { name: 'AdS Compute Main', content: adsBoundStateComputeBlock },
  ]

  const { wgsl, modules } = assembleShaderBlocks(blocks, [])
  return { wgsl, modules, features: ['AdS Bound-State Compute', 'rgba16float'] }
}
