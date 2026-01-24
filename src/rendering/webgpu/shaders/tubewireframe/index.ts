/**
 * Tube Wireframe WGSL Shaders
 *
 * Exports tube wireframe-specific shader blocks and composition functions.
 *
 * @module rendering/webgpu/shaders/tubewireframe
 */

export { tubeWireframeUniformsBlock } from './uniforms.wgsl'
export { tubeVertexBlock } from './vertex.wgsl'
export { composeTubeWireframeVertexShader, composeTubeWireframeFragmentShader } from './compose'
export type { TubeWireframeWGSLShaderConfig } from './compose'
