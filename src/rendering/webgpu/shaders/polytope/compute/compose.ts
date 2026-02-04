/**
 * Polytope Compute Shader Composers
 *
 * Assembles compute shaders for polytope rendering:
 * - Transform compute: Pre-computes N-D → 3D vertex transformations
 * - Normal compute: Pre-computes face normals from transformed positions
 *
 * These compute passes replace expensive per-vertex/per-pixel operations
 * with efficient GPU-parallel computation.
 *
 * @module rendering/webgpu/shaders/polytope/compute/compose
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'

import {
  computeParamsBlock,
  transformUniformsBlock,
  ndVertexStructBlock,
  transformBindingsBlock,
  transformNDComputeBlock,
  transformComputeMainBlock,
} from './transform.wgsl'

import {
  normalComputeParamsBlock,
  transformedVertexStructBlock,
  faceNormalStructBlock,
  triangleIndicesStructBlock,
  normalComputeBindingsBlock,
  computeFaceNormalBlock,
  normalComputeMainBlock,
} from './normals.wgsl'

/**
 * Configuration for polytope transform compute shader
 */
export interface PolytopeTransformComputeConfig {
  /** Number of dimensions (3-11) */
  dimension: number
}

/**
 * Compose the polytope transform compute shader.
 *
 * This assembles all modules needed for N-D → 3D vertex transformation
 * into a compute shader that processes vertices in parallel.
 *
 * @param config - Shader configuration
 * @returns Composed WGSL code and metadata
 */
export function composePolytopeTransformComputeShader(config: PolytopeTransformComputeConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { dimension } = config

  const defines: string[] = []
  const features: string[] = []

  // Compile-time dimension (clamped to valid range)
  const actualDim = Math.min(Math.max(dimension, 3), 11)

  // Add dimension defines
  defines.push(`const DIMENSION: i32 = ${actualDim};`)
  features.push(`${actualDim}D Transform Compute`)

  // Build shader blocks in dependency order
  const blocks = [
    // Defines - must come first
    { name: 'Defines', content: defines.join('\n') },

    // Uniform and struct definitions
    { name: 'Compute Params', content: computeParamsBlock },
    { name: 'Transform Uniforms', content: transformUniformsBlock },
    { name: 'Vertex Structures', content: ndVertexStructBlock },

    // Bind group declarations
    { name: 'Compute Bindings', content: transformBindingsBlock },

    // Transform function
    { name: 'Transform ND Compute', content: transformNDComputeBlock },

    // Entry point
    { name: 'Compute Main', content: transformComputeMainBlock },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}

/**
 * Configuration for polytope normal compute shader
 */
export interface PolytopeNormalComputeConfig {
  /** Enable debug output (optional, for development) */
  debug?: boolean
}

/**
 * Compose the polytope normal compute shader.
 *
 * This assembles the compute shader for pre-computing face normals from
 * transformed 3D positions. The shader reads triangle indices and vertex
 * positions, then outputs one normal per triangle.
 *
 * Benefits over vertex/fragment shader normal computation:
 * - Computed once per frame, not per-pixel
 * - No screen-space artifacts (dFdx/dFdy edge issues)
 * - Consistent quality across all dimensions
 * - Reduces vertex shader complexity
 *
 * @param config - Shader configuration (currently optional)
 * @returns Composed WGSL code and metadata
 */
export function composePolytopeNormalComputeShader(config?: PolytopeNormalComputeConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const features: string[] = ['Face Normal Compute']
  const defines: string[] = []

  // Add debug define if enabled
  if (config?.debug) {
    defines.push('const DEBUG_NORMALS: bool = true;')
    features.push('Debug Output')
  } else {
    defines.push('const DEBUG_NORMALS: bool = false;')
  }

  // Build shader blocks in dependency order
  const blocks = [
    // Defines
    { name: 'Defines', content: defines.join('\n') },

    // Struct definitions
    { name: 'Normal Compute Params', content: normalComputeParamsBlock },
    { name: 'Transformed Vertex Struct', content: transformedVertexStructBlock },
    { name: 'Face Normal Struct', content: faceNormalStructBlock },
    { name: 'Triangle Indices Struct', content: triangleIndicesStructBlock },

    // Bind group declarations
    { name: 'Normal Compute Bindings', content: normalComputeBindingsBlock },

    // Helper function
    { name: 'Compute Face Normal', content: computeFaceNormalBlock },

    // Entry point
    { name: 'Normal Compute Main', content: normalComputeMainBlock },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}
