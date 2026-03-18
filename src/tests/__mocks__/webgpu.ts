/**
 * WebGPU API mock for testing WebGPU renderer components.
 *
 * Provides comprehensive mocks for GPUDevice, GPUAdapter, GPUQueue,
 * and all GPU resource types. Installed on navigator.gpu during test setup.
 *
 * @module tests/__mocks__/webgpu
 */

import { vi } from 'vitest'

/** Create a comprehensive WebGPU mock for testing. */
function createWebGPUMock() {
  const createdResources = {
    buffers: new Set<object>(),
    textures: new Set<object>(),
    samplers: new Set<object>(),
    shaderModules: new Set<object>(),
    bindGroups: new Set<object>(),
    bindGroupLayouts: new Set<object>(),
    pipelineLayouts: new Set<object>(),
    renderPipelines: new Set<object>(),
    computePipelines: new Set<object>(),
    commandEncoders: new Set<object>(),
    querysets: new Set<object>(),
  }

  const createMockBuffer = (): GPUBuffer => {
    const buffer = {
      size: 0,
      usage: 0,
      mapState: 'unmapped' as GPUBufferMapState,
      label: '',
      getMappedRange: vi.fn(() => new ArrayBuffer(0)),
      unmap: vi.fn(),
      destroy: vi.fn(),
      mapAsync: vi.fn().mockResolvedValue(undefined),
    }
    createdResources.buffers.add(buffer)
    return buffer as unknown as GPUBuffer
  }

  const createMockTexture = (): GPUTexture => {
    const texture = {
      width: 1,
      height: 1,
      depthOrArrayLayers: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: '2d' as GPUTextureDimension,
      format: 'rgba8unorm' as GPUTextureFormat,
      usage: 0,
      label: '',
      createView: vi.fn(() => ({ label: '' })),
      destroy: vi.fn(),
    }
    createdResources.textures.add(texture)
    return texture as unknown as GPUTexture
  }

  const createMockSampler = (): GPUSampler => {
    const s = { label: '' }
    createdResources.samplers.add(s)
    return s as unknown as GPUSampler
  }
  const createMockShaderModule = (): GPUShaderModule => {
    const m = { label: '', getCompilationInfo: vi.fn().mockResolvedValue({ messages: [] }) }
    createdResources.shaderModules.add(m)
    return m as unknown as GPUShaderModule
  }
  const createMockBindGroupLayout = (): GPUBindGroupLayout => {
    const l = { label: '' }
    createdResources.bindGroupLayouts.add(l)
    return l as unknown as GPUBindGroupLayout
  }
  const createMockBindGroup = (): GPUBindGroup => {
    const g = { label: '' }
    createdResources.bindGroups.add(g)
    return g as unknown as GPUBindGroup
  }
  const createMockPipelineLayout = (): GPUPipelineLayout => {
    const l = { label: '' }
    createdResources.pipelineLayouts.add(l)
    return l as unknown as GPUPipelineLayout
  }
  const createMockRenderPipeline = (): GPURenderPipeline => {
    const p = { label: '', getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()) }
    createdResources.renderPipelines.add(p)
    return p as unknown as GPURenderPipeline
  }
  const createMockComputePipeline = (): GPUComputePipeline => {
    const p = { label: '', getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()) }
    createdResources.computePipelines.add(p)
    return p as unknown as GPUComputePipeline
  }

  const createMockRenderPassEncoder = (): GPURenderPassEncoder =>
    ({
      label: '',
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      drawIndirect: vi.fn(),
      drawIndexedIndirect: vi.fn(),
      setViewport: vi.fn(),
      setScissorRect: vi.fn(),
      setBlendConstant: vi.fn(),
      setStencilReference: vi.fn(),
      beginOcclusionQuery: vi.fn(),
      endOcclusionQuery: vi.fn(),
      executeBundles: vi.fn(),
      end: vi.fn(),
      pushDebugGroup: vi.fn(),
      popDebugGroup: vi.fn(),
      insertDebugMarker: vi.fn(),
    }) as unknown as GPURenderPassEncoder

  const createMockComputePassEncoder = (): GPUComputePassEncoder =>
    ({
      label: '',
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      dispatchWorkgroupsIndirect: vi.fn(),
      end: vi.fn(),
      pushDebugGroup: vi.fn(),
      popDebugGroup: vi.fn(),
      insertDebugMarker: vi.fn(),
    }) as unknown as GPUComputePassEncoder

  const createMockCommandEncoder = (): GPUCommandEncoder => {
    const encoder = {
      label: '',
      beginRenderPass: vi.fn(() => createMockRenderPassEncoder()),
      beginComputePass: vi.fn(() => createMockComputePassEncoder()),
      copyBufferToBuffer: vi.fn(),
      copyBufferToTexture: vi.fn(),
      copyTextureToBuffer: vi.fn(),
      copyTextureToTexture: vi.fn(),
      clearBuffer: vi.fn(),
      resolveQuerySet: vi.fn(),
      finish: vi.fn(() => ({ label: '' })),
      pushDebugGroup: vi.fn(),
      popDebugGroup: vi.fn(),
      insertDebugMarker: vi.fn(),
    }
    createdResources.commandEncoders.add(encoder)
    return encoder as unknown as GPUCommandEncoder
  }

  const createMockQuerySet = (): GPUQuerySet => {
    const qs = { label: '', type: 'occlusion' as GPUQueryType, count: 0, destroy: vi.fn() }
    createdResources.querysets.add(qs)
    return qs as unknown as GPUQuerySet
  }

  const mockQueue: GPUQueue = {
    label: '',
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
  } as unknown as GPUQueue

  const mockDevice: GPUDevice = {
    label: '',
    features: new Set() as GPUSupportedFeatures,
    limits: {
      maxTextureDimension1D: 8192,
      maxTextureDimension2D: 8192,
      maxTextureDimension3D: 2048,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxBindGroupsPlusVertexBuffers: 24,
      maxBindingsPerBindGroup: 1000,
      maxDynamicUniformBuffersPerPipelineLayout: 8,
      maxDynamicStorageBuffersPerPipelineLayout: 4,
      maxSampledTexturesPerShaderStage: 16,
      maxSamplersPerShaderStage: 16,
      maxStorageBuffersPerShaderStage: 8,
      maxStorageTexturesPerShaderStage: 4,
      maxUniformBuffersPerShaderStage: 12,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256,
      minStorageBufferOffsetAlignment: 256,
      maxVertexBuffers: 8,
      maxBufferSize: 268435456,
      maxVertexAttributes: 16,
      maxVertexBufferArrayStride: 2048,
      maxInterStageShaderComponents: 60,
      maxInterStageShaderVariables: 16,
      maxColorAttachments: 8,
      maxColorAttachmentBytesPerSample: 32,
      maxComputeWorkgroupStorageSize: 16384,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeWorkgroupsPerDimension: 65535,
    } as unknown as GPUSupportedLimits,
    queue: mockQueue,
    lost: new Promise(() => {}),
    createBuffer: vi.fn((desc) => {
      const b = createMockBuffer()
      Object.assign(b, { size: desc.size, usage: desc.usage })
      return b
    }),
    createTexture: vi.fn((desc) => {
      const t = createMockTexture()
      Object.assign(t, {
        width: desc.size.width ?? desc.size,
        height: desc.size.height ?? 1,
        format: desc.format,
        usage: desc.usage,
      })
      return t
    }),
    createSampler: vi.fn(() => createMockSampler()),
    createShaderModule: vi.fn(() => createMockShaderModule()),
    createBindGroupLayout: vi.fn(() => createMockBindGroupLayout()),
    createBindGroup: vi.fn(() => createMockBindGroup()),
    createPipelineLayout: vi.fn(() => createMockPipelineLayout()),
    createRenderPipeline: vi.fn(() => createMockRenderPipeline()),
    createComputePipeline: vi.fn(() => createMockComputePipeline()),
    createRenderPipelineAsync: vi.fn().mockResolvedValue(createMockRenderPipeline()),
    createComputePipelineAsync: vi.fn().mockResolvedValue(createMockComputePipeline()),
    createCommandEncoder: vi.fn(() => createMockCommandEncoder()),
    createRenderBundleEncoder: vi.fn(),
    createQuerySet: vi.fn(() => createMockQuerySet()),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn().mockResolvedValue(null),
    onuncapturederror: null,
    destroy: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as GPUDevice

  const mockAdapterInfo: GPUAdapterInfo = {
    vendor: 'Mock Vendor',
    architecture: 'Mock Architecture',
    device: 'Mock Device',
    description: 'Mock WebGPU Adapter',
  } as GPUAdapterInfo

  const mockAdapter: GPUAdapter = {
    features: new Set() as GPUSupportedFeatures,
    limits: mockDevice.limits,
    info: mockAdapterInfo,
    isFallbackAdapter: false,
    requestDevice: vi.fn().mockResolvedValue(mockDevice),
    requestAdapterInfo: vi.fn().mockResolvedValue(mockAdapterInfo),
  } as unknown as GPUAdapter

  const mockGPU: GPU = {
    requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm' as GPUTextureFormat),
    wgslLanguageFeatures: new Set() as WGSLLanguageFeatures,
  } as unknown as GPU

  return {
    gpu: mockGPU,
    adapter: mockAdapter,
    device: mockDevice,
    queue: mockQueue,
    createdResources,
  }
}

const webgpuMock = createWebGPUMock()

/** Exported mock instance for tests that need direct access to mock internals. */
export const mockWebGPU = webgpuMock

/**
 * Install WebGPU mock on navigator.gpu and GPU usage constants on globalThis.
 * Must be called during test setup.
 */
export function installWebGPUMock(): void {
  Object.defineProperty(navigator, 'gpu', {
    writable: true,
    configurable: true,
    value: webgpuMock.gpu,
  })

  // WebGPU usage flag constants — matches the WebGPU spec bitmask values.
  // Installed globally so test files don't need to define them inline.
  if (!('GPUTextureUsage' in globalThis)) {
    ;(globalThis as Record<string, unknown>).GPUTextureUsage = {
      COPY_SRC: 0x01,
      COPY_DST: 0x02,
      TEXTURE_BINDING: 0x04,
      STORAGE_BINDING: 0x08,
      RENDER_ATTACHMENT: 0x10,
    }
  }
  if (!('GPUBufferUsage' in globalThis)) {
    ;(globalThis as Record<string, unknown>).GPUBufferUsage = {
      MAP_READ: 0x0001,
      MAP_WRITE: 0x0002,
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      INDEX: 0x0010,
      VERTEX: 0x0020,
      UNIFORM: 0x0040,
      STORAGE: 0x0080,
      INDIRECT: 0x0100,
      QUERY_RESOLVE: 0x0200,
    }
  }
  if (!('GPUMapMode' in globalThis)) {
    ;(globalThis as Record<string, unknown>).GPUMapMode = {
      READ: 0x0001,
      WRITE: 0x0002,
    }
  }
}
