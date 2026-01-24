/**
 * WebGPU Ground Plane Shaders
 *
 * WGSL port of the ground plane rendering system with:
 * - PBR GGX lighting
 * - Multi-light support
 * - IBL environment reflections
 * - Shadow map sampling
 * - Procedural grid overlay
 */

// Vertex shader
export {
  vertexBlock,
  vertexInputStruct,
  vertexOutputStruct,
  vertexUniformsBlock,
  vertexMainBlock,
} from './vertex.wgsl'

// Grid
export { gridUniformsBlock, gridFunctionsBlock } from './grid.wgsl'

// Fragment shader
export { fragmentUniformsBlock, fragmentOutputStruct, mainBlock } from './main.wgsl'

// Composition
export type { GroundPlaneShaderConfig } from './compose'
export { composeGroundPlaneFragmentShader, composeGroundPlaneVertexShader } from './compose'
