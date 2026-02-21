/**
 * WebGPU Core Module
 *
 * Exports core WebGPU infrastructure components.
 *
 * @module rendering/webgpu/core
 */

// Types
export type {
  AccessMode,
  CachedComputePipeline,
  CachedRenderPipeline,
  ManagedUniformBuffer,
  ResourceSize,
  ResourceSizeMode,
  UniformBufferDescriptor,
  UniformEntry,
  WebGPUCapabilities,
  WebGPUFrameContext,
  WebGPUFrameStats,
  WebGPUInitFailure,
  WebGPUInitResult,
  WebGPUInitSuccess,
  WebGPUPassTiming,
  WebGPURenderContext,
  WebGPURenderPass,
  WebGPURenderPassConfig,
  WebGPURenderResourceConfig,
  WebGPUResource,
  WebGPUResourceAccess,
  WebGPUResourceType,
  WebGPUSetupContext,
} from './types'

// Device
export { WebGPUDevice } from './WebGPUDevice'

// Resource Pool
export { WebGPUResourcePool } from './WebGPUResourcePool'

// Camera
export { WebGPUCamera, type WebGPUCameraMatrices, type WebGPUCameraState } from './WebGPUCamera'

// Base Pass
export { FULLSCREEN_VERTEX_SHADER, WebGPUBaseComputePass, WebGPUBasePass } from './WebGPUBasePass'

// Uniform Buffer
export {
  createManagedUniformBuffer,
  UniformBufferBuilder,
  UniformBufferWriter,
} from './WebGPUUniformBuffer'
