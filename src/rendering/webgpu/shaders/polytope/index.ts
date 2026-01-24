/**
 * Polytope WGSL Shaders
 *
 * Exports Polytope-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/polytope
 */

export { transformNDBlock } from './transform-nd.wgsl'
export { polytopeUniformsBlock } from './compose'
export {
  composeFaceVertexShader,
  composeFaceFragmentShader,
  composeEdgeVertexShader,
  composeEdgeFragmentShader,
} from './compose'
export type { PolytopeWGSLShaderConfig } from './compose'
