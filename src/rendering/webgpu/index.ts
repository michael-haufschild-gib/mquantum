/**
 * WebGPU Rendering Backend
 *
 * Complete WebGPU rendering infrastructure including:
 * - Device management and resource pooling
 * - Render graph for pass orchestration
 * - WGSL shader composition system
 * - Post-processing passes
 * - Object renderers
 *
 * @module rendering/webgpu
 */

// Core infrastructure
export * from './core'

// Render graph
export * from './graph'

// Render passes
export * from './passes'

// Object renderers
export * from './renderers'

// Shaders
export * from './shaders'

// React Components
export { WebGPUCanvas, WebGPUContext, useWebGPU } from './WebGPUCanvas'
export type { WebGPUCanvasProps, WebGPUCanvasContext } from './WebGPUCanvas'
export { WebGPUScene } from './WebGPUScene'
export type { WebGPUSceneProps } from './WebGPUScene'
