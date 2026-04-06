/**
 * WebGPU API mock for testing WebGPU renderer components.
 *
 * Provides comprehensive mocks for GPUDevice, GPUAdapter, GPUQueue,
 * and all GPU resource types. Installed on navigator.gpu during test setup.
 *
 * @module tests/__mocks__/webgpu
 */

import { vi } from 'vitest'

// =============================================================================
// Standalone mock factories — importable by any test file
// =============================================================================

/** Create a mock GPUBuffer with all required methods. */
export function createMockBuffer(label?: string): GPUBuffer {
  return {
    size: 0,
    usage: 0,
    mapState: 'unmapped' as GPUBufferMapState,
    label: label ?? '',
    getMappedRange: vi.fn(() => new ArrayBuffer(0)),
    unmap: vi.fn(),
    destroy: vi.fn(),
    mapAsync: vi.fn().mockResolvedValue(undefined),
  } as unknown as GPUBuffer
}

/** Create a mock GPUTexture with createView and destroy. */
export function createMockTexture(): GPUTexture {
  return {
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
  } as unknown as GPUTexture
}

/** Create a mock GPUSampler. */
export function createMockSampler(): GPUSampler {
  return { label: '' } as unknown as GPUSampler
}

/** Create a mock GPUShaderModule. */
export function createMockShaderModule(): GPUShaderModule {
  return {
    label: '',
    getCompilationInfo: vi.fn().mockResolvedValue({ messages: [] }),
  } as unknown as GPUShaderModule
}

/** Create a mock GPUBindGroupLayout. */
export function createMockBindGroupLayout(): GPUBindGroupLayout {
  return { label: '' } as unknown as GPUBindGroupLayout
}

/** Create a mock GPUBindGroup. */
export function createMockBindGroup(): GPUBindGroup {
  return { label: '' } as unknown as GPUBindGroup
}

/** Create a mock GPUPipelineLayout. */
export function createMockPipelineLayout(): GPUPipelineLayout {
  return { label: '' } as unknown as GPUPipelineLayout
}

/** Create a mock GPURenderPipeline. */
export function createMockRenderPipeline(): GPURenderPipeline {
  return {
    label: '',
    getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()),
  } as unknown as GPURenderPipeline
}

/** Create a mock GPUComputePipeline. */
export function createMockComputePipeline(): GPUComputePipeline {
  return {
    label: '',
    getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()),
  } as unknown as GPUComputePipeline
}

/** Create a mock GPURenderPassEncoder with all methods. */
export function createMockRenderPassEncoder(): GPURenderPassEncoder {
  return {
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
  } as unknown as GPURenderPassEncoder
}

/** Create a mock GPUComputePassEncoder with all methods. */
export function createMockComputePassEncoder(): GPUComputePassEncoder {
  return {
    label: '',
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    dispatchWorkgroupsIndirect: vi.fn(),
    end: vi.fn(),
    pushDebugGroup: vi.fn(),
    popDebugGroup: vi.fn(),
    insertDebugMarker: vi.fn(),
  } as unknown as GPUComputePassEncoder
}

/** Create a mock GPUCommandEncoder. */
export function createMockCommandEncoder(): GPUCommandEncoder {
  return {
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
  } as unknown as GPUCommandEncoder
}

/** Create a mock GPUQuerySet. */
export function createMockQuerySet(
  desc: Partial<GPUQuerySetDescriptor> = {},
): GPUQuerySet {
  return {
    label: desc.label ?? '',
    type: (desc.type ?? 'occlusion') as GPUQueryType,
    count: desc.count ?? 0,
    destroy: vi.fn(),
  } as unknown as GPUQuerySet
}

// =============================================================================
// Comprehensive mock (singleton with resource tracking)
// =============================================================================

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

  /** Buffer factory that tracks in createdResources. */
  const trackedCreateBuffer = (): GPUBuffer => {
    const buffer = createMockBuffer()
    createdResources.buffers.add(buffer)
    return buffer
  }

  /** Texture factory that tracks in createdResources. */
  const trackedCreateTexture = (): GPUTexture => {
    const texture = createMockTexture()
    createdResources.textures.add(texture)
    return texture
  }

  const trackedCreateSampler = (): GPUSampler => {
    const s = createMockSampler()
    createdResources.samplers.add(s)
    return s
  }
  const trackedCreateShaderModule = (): GPUShaderModule => {
    const m = createMockShaderModule()
    createdResources.shaderModules.add(m)
    return m
  }
  const trackedCreateBindGroupLayout = (): GPUBindGroupLayout => {
    const l = createMockBindGroupLayout()
    createdResources.bindGroupLayouts.add(l)
    return l
  }
  const trackedCreateBindGroup = (): GPUBindGroup => {
    const g = createMockBindGroup()
    createdResources.bindGroups.add(g)
    return g
  }
  const trackedCreatePipelineLayout = (): GPUPipelineLayout => {
    const l = createMockPipelineLayout()
    createdResources.pipelineLayouts.add(l)
    return l
  }
  const trackedCreateRenderPipeline = (): GPURenderPipeline => {
    const p = createMockRenderPipeline()
    createdResources.renderPipelines.add(p)
    return p
  }
  const trackedCreateComputePipeline = (): GPUComputePipeline => {
    const p = createMockComputePipeline()
    createdResources.computePipelines.add(p)
    return p
  }
  const trackedCreateCommandEncoder = (): GPUCommandEncoder => {
    const encoder = createMockCommandEncoder()
    createdResources.commandEncoders.add(encoder)
    return encoder
  }
  const trackedCreateQuerySet = (desc: Partial<GPUQuerySetDescriptor> = {}): GPUQuerySet => {
    const qs = createMockQuerySet(desc)
    createdResources.querysets.add(qs)
    return qs
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
      const b = trackedCreateBuffer()
      Object.assign(b, { size: desc.size, usage: desc.usage })
      return b
    }),
    createTexture: vi.fn((desc) => {
      const t = trackedCreateTexture()
      Object.assign(t, {
        width: desc.size.width ?? desc.size,
        height: desc.size.height ?? 1,
        format: desc.format,
        usage: desc.usage,
      })
      return t
    }),
    createSampler: vi.fn(() => trackedCreateSampler()),
    createShaderModule: vi.fn(() => trackedCreateShaderModule()),
    createBindGroupLayout: vi.fn(() => trackedCreateBindGroupLayout()),
    createBindGroup: vi.fn(() => trackedCreateBindGroup()),
    createPipelineLayout: vi.fn(() => trackedCreatePipelineLayout()),
    createRenderPipeline: vi.fn(() => trackedCreateRenderPipeline()),
    createComputePipeline: vi.fn(() => trackedCreateComputePipeline()),
    createRenderPipelineAsync: vi.fn(async () => trackedCreateRenderPipeline()),
    createComputePipelineAsync: vi.fn(async () => trackedCreateComputePipeline()),
    createCommandEncoder: vi.fn(() => trackedCreateCommandEncoder()),
    createRenderBundleEncoder: vi.fn(),
    createQuerySet: vi.fn((desc: Partial<GPUQuerySetDescriptor> = {}) => trackedCreateQuerySet(desc)),
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
