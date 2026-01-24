/**
 * Polytope Shaders and Scene
 *
 * GLSL shaders for N-dimensional polytope rendering with GPU-accelerated
 * transformations and lighting, plus the PolytopeScene component.
 *
 * @module
 */

export { MAX_EXTRA_DIMS } from './constants'
// Re-export composers as builders for backward compatibility with PolytopeScene
export { composeEdgeFragmentShader as buildEdgeFragmentShader } from '../../shaders/polytope/compose'
export { composeEdgeVertexShader as buildEdgeVertexShader } from '../../shaders/polytope/compose'
export { composeFaceFragmentShader as buildFaceFragmentShader } from '../../shaders/polytope/compose'
export { composeFaceVertexShader as buildFaceVertexShader } from '../../shaders/polytope/compose'
// Screen-space normal variants (for high-dimensional polytopes)
export { composeFaceFragmentShaderScreenSpace as buildFaceFragmentShaderScreenSpace } from '../../shaders/polytope/compose'
export { composeFaceVertexShaderScreenSpace as buildFaceVertexShaderScreenSpace } from '../../shaders/polytope/compose'
export type { PolytopeShaderConfig } from '../../shaders/polytope/compose'
export { PolytopeScene } from './PolytopeScene'
export type { PolytopeSceneProps } from './PolytopeScene'
