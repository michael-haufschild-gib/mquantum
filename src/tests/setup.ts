/* global GPUBufferMapState, GPUQueryType, GPUTextureDimension, GPUTextureFormat */
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Polyfill IndexedDB for happy-dom test environment
import 'fake-indexeddb/auto'

// Note: mdimension-core WASM module is mocked via alias in vitest.config.ts
// The alias points to src/tests/__mocks__/mdimension-core.ts

// Suppress expected warnings in test environment
const originalWarn = console.warn
const originalError = console.error

// Patterns to suppress (these are expected in tests)
const suppressedWarnPatterns = [
  'Multiple instances of Three.js', // Expected when tests import Three.js and @react-three/fiber
]

const suppressedErrorPatterns = [
  'is using incorrect casing', // R3F custom elements appear as lowercase in tests
  'is unrecognized in this browser', // R3F custom elements not recognized outside Canvas
  'for a non-boolean attribute', // R3F material props passed as booleans
  'React does not recognize the', // R3F material props like alphaToCoverage, depthTest
]

console.warn = (...args) => {
  if (typeof args[0] === 'string' && suppressedWarnPatterns.some((p) => args[0].includes(p))) {
    return
  }
  originalWarn.apply(console, args)
}

console.error = (...args) => {
  if (typeof args[0] === 'string' && suppressedErrorPatterns.some((p) => args[0].includes(p))) {
    return
  }
  originalError.apply(console, args)
}

// Mock ResizeObserver for Three.js components
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver

// Mock window.matchMedia for media query hooks (not provided by happy-dom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// In-memory localStorage/sessionStorage mocks for Zustand persist in tests
const storageData = new Map<string, string>()
const storageMock = {
  getItem: (key: string) => (storageData.has(key) ? storageData.get(key)! : null),
  setItem: (key: string, value: string) => {
    storageData.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageData.delete(key)
  },
  clear: () => {
    storageData.clear()
  },
  key: (index: number) => Array.from(storageData.keys())[index] ?? null,
  get length() {
    return storageData.size
  },
}

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: storageMock,
})
Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: storageMock,
})

// Comprehensive WebGL2 mock for Three.js support
const createWebGL2ContextMock = () => {
  const canvas = document.createElement('canvas')

  // WebGL constants
  const GL = {
    MAX_TEXTURE_SIZE: 16384,
    MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
    MAX_TEXTURE_IMAGE_UNITS: 32,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 32,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 64,
    MAX_VERTEX_UNIFORM_VECTORS: 4096,
    MAX_FRAGMENT_UNIFORM_VECTORS: 4096,
    MAX_VARYING_VECTORS: 32,
    MAX_VERTEX_ATTRIBS: 32,
    MAX_RENDERBUFFER_SIZE: 16384,
    MAX_VIEWPORT_DIMS: 3379 as const, // WebGL constant
    MAX_SAMPLES: 8,
    HIGH_FLOAT: 127,
    MEDIUM_FLOAT: 23,
    LOW_FLOAT: 7,
    HIGH_INT: 127,
    MEDIUM_INT: 15,
    LOW_INT: 7,
    FRAGMENT_SHADER: 35632,
    VERTEX_SHADER: 35633,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    DEPTH_TEST: 2929,
    BLEND: 3042,
    CULL_FACE: 2884,
    TEXTURE_2D: 3553,
    TEXTURE_CUBE_MAP: 34067,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    FLOAT: 5126,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    TRIANGLES: 4,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    STENCIL_BUFFER_BIT: 1024,
    FRAMEBUFFER: 36160,
    RENDERBUFFER: 36161,
    RGBA: 6408,
    RGBA8: 32856,
    DEPTH_COMPONENT16: 33189,
    DEPTH_COMPONENT24: 33190,
    DEPTH_COMPONENT32F: 36012,
    COLOR_ATTACHMENT0: 36064,
    DEPTH_ATTACHMENT: 36096,
    FRAMEBUFFER_COMPLETE: 36053,
    TEXTURE0: 33984,
    NEAREST: 9728,
    LINEAR: 9729,
    LINEAR_MIPMAP_LINEAR: 9987,
    CLAMP_TO_EDGE: 33071,
    REPEAT: 10497,
    UNPACK_FLIP_Y_WEBGL: 37440,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
    VERSION: 7938,
    SHADING_LANGUAGE_VERSION: 35724,
    RENDERER: 7937,
    VENDOR: 7936,
  }

  // Track created resources for cleanup verification
  const createdResources = {
    textures: new Set(),
    framebuffers: new Set(),
    renderbuffers: new Set(),
    buffers: new Set(),
    programs: new Set(),
    shaders: new Set(),
  }

  const mock: Record<string, unknown> = {
    canvas,
    drawingBufferWidth: 1920,
    drawingBufferHeight: 1080,

    // Parameter retrieval
    getParameter: vi.fn((param: number) => {
      const params: Record<number, unknown> = {
        [GL.MAX_TEXTURE_SIZE]: GL.MAX_TEXTURE_SIZE,
        [GL.MAX_CUBE_MAP_TEXTURE_SIZE]: GL.MAX_CUBE_MAP_TEXTURE_SIZE,
        [GL.MAX_TEXTURE_IMAGE_UNITS]: GL.MAX_TEXTURE_IMAGE_UNITS,
        [GL.MAX_VERTEX_TEXTURE_IMAGE_UNITS]: GL.MAX_VERTEX_TEXTURE_IMAGE_UNITS,
        [GL.MAX_COMBINED_TEXTURE_IMAGE_UNITS]: GL.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
        [GL.MAX_VERTEX_UNIFORM_VECTORS]: GL.MAX_VERTEX_UNIFORM_VECTORS,
        [GL.MAX_FRAGMENT_UNIFORM_VECTORS]: GL.MAX_FRAGMENT_UNIFORM_VECTORS,
        [GL.MAX_VARYING_VECTORS]: GL.MAX_VARYING_VECTORS,
        [GL.MAX_VERTEX_ATTRIBS]: GL.MAX_VERTEX_ATTRIBS,
        [GL.MAX_RENDERBUFFER_SIZE]: GL.MAX_RENDERBUFFER_SIZE,
        [GL.MAX_VIEWPORT_DIMS]: [16384, 16384],
        [GL.MAX_SAMPLES]: GL.MAX_SAMPLES,
        [GL.VERSION]: 'WebGL 2.0',
        [GL.SHADING_LANGUAGE_VERSION]: 'WebGL GLSL ES 3.00',
        [GL.RENDERER]: 'Mock WebGL2 Renderer',
        [GL.VENDOR]: 'Mock Vendor',
      }
      return params[param] ?? 0
    }),

    // Shader precision format
    getShaderPrecisionFormat: vi.fn(() => ({
      rangeMin: 127,
      rangeMax: 127,
      precision: 23,
    })),

    // Extension support
    getExtension: vi.fn((name: string) => {
      // Return mock extensions that Three.js commonly checks for
      const extensions: Record<string, object | null> = {
        EXT_color_buffer_float: {},
        EXT_color_buffer_half_float: {},
        EXT_texture_filter_anisotropic: { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 16 },
        WEBGL_compressed_texture_s3tc: {},
        WEBGL_compressed_texture_etc1: {},
        WEBGL_compressed_texture_pvrtc: {},
        WEBGL_compressed_texture_astc: {},
        OES_texture_float_linear: {},
        OES_texture_half_float_linear: {},
        WEBGL_multisampled_render_to_texture: { framebufferTexture2DMultisampleEXT: vi.fn() },
        OVR_multiview2: {},
        KHR_parallel_shader_compile: { COMPLETION_STATUS_KHR: 37297 },
        WEBGL_lose_context: { loseContext: vi.fn(), restoreContext: vi.fn() },
      }
      return extensions[name] ?? null
    }),

    getSupportedExtensions: vi.fn(() => [
      'EXT_color_buffer_float',
      'EXT_color_buffer_half_float',
      'EXT_texture_filter_anisotropic',
      'OES_texture_float_linear',
      'OES_texture_half_float_linear',
    ]),

    // Shader operations
    createShader: vi.fn(() => {
      const shader = { id: Math.random() }
      createdResources.shaders.add(shader)
      return shader
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn((shader) => createdResources.shaders.delete(shader)),

    // Program operations
    createProgram: vi.fn(() => {
      const program = { id: Math.random() }
      createdResources.programs.add(program)
      return program
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn((program) => createdResources.programs.delete(program)),
    validateProgram: vi.fn(),

    // Uniform operations
    getUniformLocation: vi.fn(() => ({ id: Math.random() })),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniform1fv: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    getActiveUniform: vi.fn(() => ({ name: 'uMock', type: GL.FLOAT, size: 1 })),
    getActiveAttrib: vi.fn(() => ({ name: 'aMock', type: GL.FLOAT, size: 1 })),

    // Attribute operations
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),

    // Buffer operations
    createBuffer: vi.fn(() => {
      const buffer = { id: Math.random() }
      createdResources.buffers.add(buffer)
      return buffer
    }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    deleteBuffer: vi.fn((buffer) => createdResources.buffers.delete(buffer)),

    // Texture operations
    createTexture: vi.fn(() => {
      const texture = { id: Math.random() }
      createdResources.textures.add(texture)
      return texture
    }),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    texStorage2D: vi.fn(),
    texParameteri: vi.fn(),
    texParameterf: vi.fn(),
    generateMipmap: vi.fn(),
    deleteTexture: vi.fn((texture) => createdResources.textures.delete(texture)),
    activeTexture: vi.fn(),
    pixelStorei: vi.fn(),
    copyTexImage2D: vi.fn(),
    copyTexSubImage2D: vi.fn(),
    texImage3D: vi.fn(),
    texSubImage3D: vi.fn(),
    texStorage3D: vi.fn(),
    copyTexSubImage3D: vi.fn(),
    compressedTexImage2D: vi.fn(),
    compressedTexImage3D: vi.fn(),
    compressedTexSubImage2D: vi.fn(),
    compressedTexSubImage3D: vi.fn(),

    // Framebuffer operations
    createFramebuffer: vi.fn(() => {
      const fb = { id: Math.random() }
      createdResources.framebuffers.add(fb)
      return fb
    }),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => GL.FRAMEBUFFER_COMPLETE),
    deleteFramebuffer: vi.fn((fb) => createdResources.framebuffers.delete(fb)),
    readBuffer: vi.fn(),
    blitFramebuffer: vi.fn(),
    invalidateFramebuffer: vi.fn(),

    // Renderbuffer operations
    createRenderbuffer: vi.fn(() => {
      const rb = { id: Math.random() }
      createdResources.renderbuffers.add(rb)
      return rb
    }),
    bindRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),
    renderbufferStorageMultisample: vi.fn(),
    deleteRenderbuffer: vi.fn((rb) => createdResources.renderbuffers.delete(rb)),

    // VAO operations (WebGL2)
    createVertexArray: vi.fn(() => ({ id: Math.random() })),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),

    // Drawing operations
    viewport: vi.fn(),
    scissor: vi.fn(),
    clearColor: vi.fn(),
    clearDepth: vi.fn(),
    clearStencil: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    drawArraysInstanced: vi.fn(),
    drawElementsInstanced: vi.fn(),
    drawBuffers: vi.fn(),

    // State operations
    enable: vi.fn(),
    disable: vi.fn(),
    isEnabled: vi.fn(() => false),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    blendEquation: vi.fn(),
    blendEquationSeparate: vi.fn(),
    blendColor: vi.fn(),
    depthFunc: vi.fn(),
    depthMask: vi.fn(),
    depthRange: vi.fn(),
    cullFace: vi.fn(),
    frontFace: vi.fn(),
    colorMask: vi.fn(),
    stencilFunc: vi.fn(),
    stencilMask: vi.fn(),
    stencilOp: vi.fn(),
    stencilFuncSeparate: vi.fn(),
    stencilMaskSeparate: vi.fn(),
    stencilOpSeparate: vi.fn(),
    polygonOffset: vi.fn(),
    sampleCoverage: vi.fn(),
    lineWidth: vi.fn(),

    // Query operations
    getContextAttributes: vi.fn(() => ({
      alpha: true,
      antialias: true,
      depth: true,
      stencil: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
    })),
    isContextLost: vi.fn(() => false),
    getError: vi.fn(() => 0),

    // Read operations
    readPixels: vi.fn(),

    // Flush/finish
    flush: vi.fn(),
    finish: vi.fn(),

    // UBO operations (WebGL2)
    createTransformFeedback: vi.fn(() => ({})),
    bindTransformFeedback: vi.fn(),
    deleteTransformFeedback: vi.fn(),
    transformFeedbackVaryings: vi.fn(),
    beginTransformFeedback: vi.fn(),
    endTransformFeedback: vi.fn(),
    getUniformBlockIndex: vi.fn(() => 0),
    uniformBlockBinding: vi.fn(),
    bindBufferBase: vi.fn(),
    bindBufferRange: vi.fn(),

    // Sync objects (WebGL2)
    fenceSync: vi.fn(() => ({})),
    clientWaitSync: vi.fn(() => 37149), // ALREADY_SIGNALED
    deleteSync: vi.fn(),
    getSyncParameter: vi.fn(() => 37147), // SIGNALED

    // Query objects (WebGL2)
    createQuery: vi.fn(() => ({})),
    deleteQuery: vi.fn(),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    getQueryParameter: vi.fn(() => 0),
  }

  // Add GL constants to mock
  Object.entries(GL).forEach(([key, value]) => {
    mock[key] = value
  })

  return mock
}

const webglContextMock = createWebGL2ContextMock()

const canvas2dContextMock = {
  canvas: {},
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  drawImage: vi.fn(),
}

HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
  if (contextType === '2d') {
    return canvas2dContextMock
  }
  // webgl, webgl2, or experimental-webgl
  return webglContextMock
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

// =============================================================================
// WebGPU Mock for WebGPU renderer tests
// =============================================================================

/**
 * Creates a comprehensive WebGPU mock for testing WebGPU renderer components.
 * Mirrors the structure of real WebGPU API for type-safe testing.
 */
const createWebGPUMock = () => {
  // Track created resources for cleanup verification
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

  // Mock GPUBuffer
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

  // Mock GPUTexture
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
      createView: vi.fn(() => ({
        label: '',
      })),
      destroy: vi.fn(),
    }
    createdResources.textures.add(texture)
    return texture as unknown as GPUTexture
  }

  // Mock GPUSampler
  const createMockSampler = (): GPUSampler => {
    const sampler = {
      label: '',
    }
    createdResources.samplers.add(sampler)
    return sampler as unknown as GPUSampler
  }

  // Mock GPUShaderModule
  const createMockShaderModule = (): GPUShaderModule => {
    const module = {
      label: '',
      getCompilationInfo: vi.fn().mockResolvedValue({
        messages: [],
      }),
    }
    createdResources.shaderModules.add(module)
    return module as unknown as GPUShaderModule
  }

  // Mock GPUBindGroupLayout
  const createMockBindGroupLayout = (): GPUBindGroupLayout => {
    const layout = {
      label: '',
    }
    createdResources.bindGroupLayouts.add(layout)
    return layout as unknown as GPUBindGroupLayout
  }

  // Mock GPUBindGroup
  const createMockBindGroup = (): GPUBindGroup => {
    const group = {
      label: '',
    }
    createdResources.bindGroups.add(group)
    return group as unknown as GPUBindGroup
  }

  // Mock GPUPipelineLayout
  const createMockPipelineLayout = (): GPUPipelineLayout => {
    const layout = {
      label: '',
    }
    createdResources.pipelineLayouts.add(layout)
    return layout as unknown as GPUPipelineLayout
  }

  // Mock GPURenderPipeline
  const createMockRenderPipeline = (): GPURenderPipeline => {
    const pipeline = {
      label: '',
      getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()),
    }
    createdResources.renderPipelines.add(pipeline)
    return pipeline as unknown as GPURenderPipeline
  }

  // Mock GPUComputePipeline
  const createMockComputePipeline = (): GPUComputePipeline => {
    const pipeline = {
      label: '',
      getBindGroupLayout: vi.fn(() => createMockBindGroupLayout()),
    }
    createdResources.computePipelines.add(pipeline)
    return pipeline as unknown as GPUComputePipeline
  }

  // Mock GPURenderPassEncoder
  const createMockRenderPassEncoder = (): GPURenderPassEncoder => ({
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

  // Mock GPUComputePassEncoder
  const createMockComputePassEncoder = (): GPUComputePassEncoder => ({
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

  // Mock GPUCommandEncoder
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
      finish: vi.fn(() => ({
        label: '',
      })),
      pushDebugGroup: vi.fn(),
      popDebugGroup: vi.fn(),
      insertDebugMarker: vi.fn(),
    }
    createdResources.commandEncoders.add(encoder)
    return encoder as unknown as GPUCommandEncoder
  }

  // Mock GPUQuerySet
  const createMockQuerySet = (): GPUQuerySet => {
    const querySet = {
      label: '',
      type: 'occlusion' as GPUQueryType,
      count: 0,
      destroy: vi.fn(),
    }
    createdResources.querysets.add(querySet)
    return querySet as unknown as GPUQuerySet
  }

  // Mock GPUQueue
  const mockQueue: GPUQueue = {
    label: '',
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
  } as unknown as GPUQueue

  // Mock GPUDevice
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
    lost: new Promise(() => {}), // Never resolves in tests
    createBuffer: vi.fn((descriptor) => {
      const buffer = createMockBuffer()
      Object.assign(buffer, { size: descriptor.size, usage: descriptor.usage })
      return buffer
    }),
    createTexture: vi.fn((descriptor) => {
      const texture = createMockTexture()
      Object.assign(texture, {
        width: descriptor.size.width ?? descriptor.size,
        height: descriptor.size.height ?? 1,
        format: descriptor.format,
        usage: descriptor.usage,
      })
      return texture
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

  // Mock GPUAdapterInfo
  const mockAdapterInfo: GPUAdapterInfo = {
    vendor: 'Mock Vendor',
    architecture: 'Mock Architecture',
    device: 'Mock Device',
    description: 'Mock WebGPU Adapter',
  } as GPUAdapterInfo

  // Mock GPUAdapter
  const mockAdapter: GPUAdapter = {
    features: new Set() as GPUSupportedFeatures,
    limits: mockDevice.limits,
    info: mockAdapterInfo,
    isFallbackAdapter: false,
    requestDevice: vi.fn().mockResolvedValue(mockDevice),
    requestAdapterInfo: vi.fn().mockResolvedValue(mockAdapterInfo),
  } as unknown as GPUAdapter

  // Mock GPU (navigator.gpu)
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

// Create the WebGPU mock instance
const webgpuMock = createWebGPUMock()

// Install WebGPU mock on navigator
Object.defineProperty(navigator, 'gpu', {
  writable: true,
  configurable: true,
  value: webgpuMock.gpu,
})

// Export for tests that need direct access to mock internals
export const mockWebGPU = webgpuMock

// Mock AudioContext with full SoundManager support
const mockAudioParam = {
  value: 0,
  setValueAtTime: vi.fn().mockReturnThis(),
  linearRampToValueAtTime: vi.fn().mockReturnThis(),
  exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
  cancelScheduledValues: vi.fn().mockReturnThis(),
}

class MockAudioContext {
  sampleRate = 44100
  currentTime = 0
  destination = {}

  createGain = vi.fn().mockReturnValue({
    gain: { ...mockAudioParam, value: 1 },
    connect: vi.fn(),
  })

  createOscillator = vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { ...mockAudioParam },
    type: 'sine',
  })

  // Buffer-based sound support (for noise-based sounds)
  createBuffer = vi
    .fn()
    .mockImplementation((channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
    }))

  createBufferSource = vi.fn().mockReturnValue({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  })

  createBiquadFilter = vi.fn().mockReturnValue({
    type: 'lowpass',
    frequency: { ...mockAudioParam, value: 1000 },
    Q: { ...mockAudioParam, value: 1 },
    gain: { ...mockAudioParam, value: 0 },
    connect: vi.fn(),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.AudioContext = MockAudioContext as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).AudioContext = MockAudioContext
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).webkitAudioContext = MockAudioContext

// Mock Popover API (not fully supported in happy-dom)
// Track popover open state for each element
const popoverOpenState = new WeakMap<HTMLElement, boolean>()
const popoverEscapeListeners = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>()
const popoverClickListeners = new WeakMap<HTMLElement, (e: MouseEvent) => void>()

HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
  if (!this.hasAttribute('popover')) {
    throw new DOMException('Element is not a popover', 'InvalidStateError')
  }
  const wasOpen = popoverOpenState.get(this) ?? false
  if (!wasOpen) {
    popoverOpenState.set(this, true)
    this.setAttribute('data-popover-open', '')

    // Simulate native light-dismiss behavior for popover="auto"
    if (this.getAttribute('popover') === 'auto') {
      // Escape key handling
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && popoverOpenState.get(this)) {
          this.hidePopover()
        }
      }
      popoverEscapeListeners.set(this, escapeHandler)
      document.addEventListener('keydown', escapeHandler)

      // Click outside handling for light-dismiss
      const clickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        // Don't close if clicking inside the popover
        if (this.contains(target)) return
        // Don't close if clicking on a trigger that controls this popover
        if (target.closest(`[popovertarget="${this.id}"]`)) return
        if (target.closest(`[data-dropdown-trigger="${this.id}"]`)) return
        // Don't close if clicking on another dropdown content (submenu)
        if (target.closest('[data-dropdown-content]')) return
        // Close the popover
        if (popoverOpenState.get(this)) {
          this.hidePopover()
        }
      }
      popoverClickListeners.set(this, clickHandler)
      document.addEventListener('mousedown', clickHandler)
    }

    const event = new Event('toggle') as Event & { newState: string; oldState: string }
    Object.defineProperty(event, 'newState', { value: 'open', writable: false })
    Object.defineProperty(event, 'oldState', { value: 'closed', writable: false })
    this.dispatchEvent(event)
  }
})

HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
  if (!this.hasAttribute('popover')) {
    throw new DOMException('Element is not a popover', 'InvalidStateError')
  }
  const wasOpen = popoverOpenState.get(this) ?? false
  if (wasOpen) {
    popoverOpenState.set(this, false)
    this.removeAttribute('data-popover-open')

    // Clean up Escape key listener
    const escapeHandler = popoverEscapeListeners.get(this)
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler)
      popoverEscapeListeners.delete(this)
    }

    // Clean up click listener
    const clickHandler = popoverClickListeners.get(this)
    if (clickHandler) {
      document.removeEventListener('mousedown', clickHandler)
      popoverClickListeners.delete(this)
    }

    const event = new Event('toggle') as Event & { newState: string; oldState: string }
    Object.defineProperty(event, 'newState', { value: 'closed', writable: false })
    Object.defineProperty(event, 'oldState', { value: 'open', writable: false })
    this.dispatchEvent(event)
  }
})

HTMLElement.prototype.togglePopover = vi.fn(function (this: HTMLElement, force?: boolean): boolean {
  if (!this.hasAttribute('popover')) {
    throw new DOMException('Element is not a popover', 'InvalidStateError')
  }
  const isOpen = popoverOpenState.get(this) ?? false
  const shouldOpen = force !== undefined ? force : !isOpen

  if (shouldOpen && !isOpen) {
    this.showPopover()
    return true
  } else if (!shouldOpen && isOpen) {
    this.hidePopover()
    return false
  }
  return isOpen
})

// Override matches to support :popover-open pseudo-selector
const originalMatches = HTMLElement.prototype.matches
HTMLElement.prototype.matches = function (this: HTMLElement, selector: string): boolean {
  if (selector === ':popover-open') {
    return popoverOpenState.get(this) ?? false
  }
  return originalMatches.call(this, selector)
}

// Mock HTMLDialogElement methods (for Modal refactoring)
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
  const event = new Event('open')
  this.dispatchEvent(event)
})

HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement, returnValue?: string) {
  this.removeAttribute('open')
  if (returnValue !== undefined) {
    this.returnValue = returnValue
  }
  const event = new Event('close')
  this.dispatchEvent(event)
})

// Cleanup after each test case
afterEach(() => {
  cleanup()
})

// Add custom matchers
expect.extend({})
