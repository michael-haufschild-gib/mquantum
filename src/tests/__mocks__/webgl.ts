/**
 * WebGL2 context mock for GPU capability detection in tests.
 *
 * Provides a comprehensive WebGL2RenderingContext mock with all constants,
 * shader operations, resource creation, and state management methods.
 * Used by detect-gpu and other GPU capability detection libraries.
 *
 * @module tests/__mocks__/webgl
 */

import { vi } from 'vitest'

/** WebGL2 constants used by the mock */
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
  MAX_VIEWPORT_DIMS: 3379 as const,
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

/** Create a comprehensive WebGL2 mock context */
function createWebGL2ContextMock(): Record<string, unknown> {
  const canvas = document.createElement('canvas')

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
    getShaderPrecisionFormat: vi.fn(() => ({ rangeMin: 127, rangeMax: 127, precision: 23 })),
    getExtension: vi.fn((name: string) => {
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
    // Shader
    createShader: vi.fn(() => {
      const s = { id: Math.random() }
      createdResources.shaders.add(s)
      return s
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn((s) => createdResources.shaders.delete(s)),
    // Program
    createProgram: vi.fn(() => {
      const p = { id: Math.random() }
      createdResources.programs.add(p)
      return p
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn((p) => createdResources.programs.delete(p)),
    validateProgram: vi.fn(),
    // Uniform
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
    // Attribute
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),
    // Buffer
    createBuffer: vi.fn(() => {
      const b = { id: Math.random() }
      createdResources.buffers.add(b)
      return b
    }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    deleteBuffer: vi.fn((b) => createdResources.buffers.delete(b)),
    // Texture
    createTexture: vi.fn(() => {
      const t = { id: Math.random() }
      createdResources.textures.add(t)
      return t
    }),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    texStorage2D: vi.fn(),
    texParameteri: vi.fn(),
    texParameterf: vi.fn(),
    generateMipmap: vi.fn(),
    deleteTexture: vi.fn((t) => createdResources.textures.delete(t)),
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
    // Framebuffer
    createFramebuffer: vi.fn(() => {
      const f = { id: Math.random() }
      createdResources.framebuffers.add(f)
      return f
    }),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => GL.FRAMEBUFFER_COMPLETE),
    deleteFramebuffer: vi.fn((f) => createdResources.framebuffers.delete(f)),
    readBuffer: vi.fn(),
    blitFramebuffer: vi.fn(),
    invalidateFramebuffer: vi.fn(),
    // Renderbuffer
    createRenderbuffer: vi.fn(() => {
      const r = { id: Math.random() }
      createdResources.renderbuffers.add(r)
      return r
    }),
    bindRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),
    renderbufferStorageMultisample: vi.fn(),
    deleteRenderbuffer: vi.fn((r) => createdResources.renderbuffers.delete(r)),
    // VAO
    createVertexArray: vi.fn(() => ({ id: Math.random() })),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    // Draw
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
    // State
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
    // Query
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
    readPixels: vi.fn(),
    flush: vi.fn(),
    finish: vi.fn(),
    // WebGL2 extensions
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
    fenceSync: vi.fn(() => ({})),
    clientWaitSync: vi.fn(() => 37149),
    deleteSync: vi.fn(),
    getSyncParameter: vi.fn(() => 37147),
    createQuery: vi.fn(() => ({})),
    deleteQuery: vi.fn(),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    getQueryParameter: vi.fn(() => 0),
  }

  Object.entries(GL).forEach(([key, value]) => {
    mock[key] = value
  })
  return mock
}

/** Canvas 2D context mock for offscreen canvas operations */
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

const webglContextMock = createWebGL2ContextMock()

/**
 * Install WebGL2 and Canvas 2D context mocks on HTMLCanvasElement.
 * Must be called during test setup before any canvas operations.
 */
export function installWebGLMock(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
    if (contextType === '2d') return canvas2dContextMock
    return webglContextMock
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
}
