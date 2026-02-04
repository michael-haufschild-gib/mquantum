/**
 * Mandelbulb SDF Grid Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing a 3D SDF texture.
 * This is a simplified version of the fragment shader compose - it only
 * includes the SDF evaluation modules needed for distance computation.
 *
 * @module rendering/webgpu/shaders/mandelbulb/compute/compose
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../../shared/core/constants.wgsl'

// Mandelbulb-specific blocks
import { mandelbulbUniformsBlock } from '../uniforms.wgsl'

// SDF blocks by dimension
import { sdf3dBlock } from '../sdf3d.wgsl'
import { sdf4dBlock } from '../sdf4d.wgsl'
import {
  sdf5dBlock,
  sdf6dBlock,
  sdf7dBlock,
  sdf8dBlock,
  sdf9dBlock,
  sdf10dBlock,
  sdf11dBlock,
} from '../sdf'

// Compute-specific blocks
import {
  sdfGridParamsBlock,
  sdfGridBindingsBlock,
  sdfGrid3dComputeBlock,
  sdfGrid4dComputeBlock,
  generateSDFGridComputeBlock,
} from './sdfGrid.wgsl'

/**
 * Configuration for Mandelbulb SDF grid compute shader
 */
export interface MandelbulbSDFGridComputeConfig {
  /** Number of dimensions (3-11) */
  dimension: number
}

/**
 * Map of dimension to SDF block
 */
const sdfBlockMap: Record<number, string> = {
  3: sdf3dBlock,
  4: sdf4dBlock,
  5: sdf5dBlock,
  6: sdf6dBlock,
  7: sdf7dBlock,
  8: sdf8dBlock,
  9: sdf9dBlock,
  10: sdf10dBlock,
  11: sdf11dBlock,
}

/**
 * Map of dimension to compute shader entry point
 */
const computeBlockMap: Record<number, string> = {
  3: sdfGrid3dComputeBlock,
  4: sdfGrid4dComputeBlock,
}

/**
 * Compose the Mandelbulb SDF grid compute shader.
 *
 * This assembles all SDF evaluation modules needed for computing
 * signed distance values into a compute shader that fills a 3D texture.
 *
 * @param config - Shader configuration
 * @returns Composed WGSL code and metadata
 */
export function composeMandelbulbSDFGridShader(config: MandelbulbSDFGridComputeConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { dimension } = config

  const defines: string[] = []
  const features: string[] = []

  // Compile-time dimension (clamped to 3-11)
  const actualDim = Math.min(Math.max(dimension, 3), 11)

  // Add dimension defines
  defines.push(`const DIMENSION: i32 = ${actualDim};`)
  features.push(`${actualDim}D Mandelbulb SDF Grid`)

  // Get dimension-specific SDF block
  const sdfBlock = sdfBlockMap[actualDim] || sdf3dBlock

  // Get dimension-specific compute entry point
  const computeBlock =
    computeBlockMap[actualDim] || generateSDFGridComputeBlock(actualDim)

  // Build blocks array in dependency order
  const blocks = [
    // Defines - must come first
    { name: 'Defines', content: defines.join('\n') },

    // Core constants (includes BOUND_R = 2.0)
    { name: 'Constants', content: constantsBlock },

    // Uniform structs (MandelbulbUniforms, BasisVectors)
    { name: 'Mandelbulb Uniforms', content: mandelbulbUniformsBlock },

    // Grid params struct
    { name: 'Grid Params', content: sdfGridParamsBlock },

    // Compute shader bindings
    { name: 'Compute Bindings', content: sdfGridBindingsBlock },

    // SDF evaluation function for this dimension
    { name: `SDF ${actualDim}D`, content: sdfBlock },

    // Compute shader entry point
    { name: 'Compute Main', content: computeBlock },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  features.push('Compute Shader')

  return { wgsl, modules, features }
}
