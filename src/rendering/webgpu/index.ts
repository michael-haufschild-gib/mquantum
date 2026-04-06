/**
 * WebGPU Rendering Backend — React entry points.
 *
 * Import core, passes, renderers, and shaders directly from their
 * own modules (e.g. `@/rendering/webgpu/core/WebGPUDevice`).
 *
 * @module rendering/webgpu
 */

export type { WebGPUCanvasProps } from './WebGPUCanvas'
export { WebGPUCanvas } from './WebGPUCanvas'
export type { WebGPUCanvasContext } from './WebGPUContext'
export { useWebGPU, WebGPUContext } from './WebGPUContext'
export type { WebGPUSceneProps } from './WebGPUScene'
export { WebGPUScene } from './WebGPUScene'
