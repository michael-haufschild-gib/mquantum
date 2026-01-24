/**
 * WebGPU Renderers
 *
 * Exports all object renderers for the WebGPU backend.
 *
 * @module rendering/webgpu/renderers
 */

export { WebGPUMandelbulbRenderer } from './WebGPUMandelbulbRenderer'
export type { MandelbulbRendererConfig } from './WebGPUMandelbulbRenderer'

export { WebGPUQuaternionJuliaRenderer } from './WebGPUQuaternionJuliaRenderer'
export type { JuliaRendererConfig } from './WebGPUQuaternionJuliaRenderer'

export { WebGPUBlackHoleRenderer } from './WebGPUBlackHoleRenderer'
export type { BlackHoleRendererConfig } from './WebGPUBlackHoleRenderer'

export { WebGPUSchrodingerRenderer } from './WebGPUSchrodingerRenderer'
export type { SchrodingerRendererConfig } from './WebGPUSchrodingerRenderer'

export { WebGPUPolytopeRenderer } from './WebGPUPolytopeRenderer'
export type { PolytopeRendererConfig } from './WebGPUPolytopeRenderer'

export { WebGPUTubeWireframeRenderer } from './WebGPUTubeWireframeRenderer'
export type { TubeWireframeRendererConfig } from './WebGPUTubeWireframeRenderer'
