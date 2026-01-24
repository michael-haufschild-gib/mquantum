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
  WebGPUInitResult,
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
export { getWebGPUDevice, isWebGPUSupported, WebGPUDevice } from './WebGPUDevice'

// Resource Pool
export { WebGPUResourcePool } from './WebGPUResourcePool'

// Base Pass
export { FULLSCREEN_VERTEX_SHADER, WebGPUBaseComputePass, WebGPUBasePass } from './WebGPUBasePass'

// Uniform Buffer
export {
  cameraUniformLayout,
  createManagedUniformBuffer,
  lightingUniformLayout,
  materialUniformLayout,
  UniformBufferBuilder,
  UniformBufferWriter,
} from './WebGPUUniformBuffer'
