/**
 * Polytope Compute Shaders
 *
 * Exports compute shader composition functions for polytope rendering.
 *
 * @module rendering/webgpu/shaders/polytope/compute
 */

// Transform compute shader
export { composePolytopeTransformComputeShader } from './compose'
export type { PolytopeTransformComputeConfig } from './compose'

export {
  computeParamsBlock,
  transformUniformsBlock,
  ndVertexStructBlock,
  transformBindingsBlock,
  transformNDComputeBlock,
  transformComputeMainBlock,
} from './transform.wgsl'

// Normal compute shader
export { composePolytopeNormalComputeShader } from './compose'
export type { PolytopeNormalComputeConfig } from './compose'

export {
  normalComputeParamsBlock,
  transformedVertexStructBlock,
  faceNormalStructBlock,
  triangleIndicesStructBlock,
  normalComputeBindingsBlock,
  computeFaceNormalBlock,
  normalComputeMainBlock,
  smoothNormalAccumulateBlock,
  vertexNormalStructBlock,
} from './normals.wgsl'
