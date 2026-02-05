/**
 * WebGPU Mandelbulb Renderer
 *
 * Renders Mandelbulb fractals using WebGPU compute and render pipelines.
 * Supports 3D-11D dimensions with full PBR lighting.
 *
 * @module rendering/webgpu/renderers/WebGPUMandelbulbRenderer
 */

import { composeRotations } from '@/lib/math/rotation'
import type { MatrixND } from '@/lib/math/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeMandelbulbShader,
  composeMandelbulbVertexShader,
  type MandelbulbShaderConfig,
} from '../shaders/mandelbulb/compose'
import { MandelbulbSDFGridPass } from '../passes/MandelbulbSDFGridPass'
import { parseHexColorToLinearRgb } from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'

/** Maximum dimension supported */
const MAX_DIMENSION = 11

export interface MandelbulbRendererConfig {
  dimension?: number
  shadows?: boolean
  ambientOcclusion?: boolean
  sss?: boolean
  ibl?: boolean
  temporal?: boolean
  /**
   * Enable compute-accelerated SDF grid for 5-10x performance improvement.
   * When true, pre-computes SDF values in a 3D texture using a compute shader.
   * The fragment shader then samples this texture instead of evaluating SDF per-pixel.
   *
   * Requirements:
   * - WebGPU device must support compute shaders
   * - Adds ~2-4MB GPU memory for the SDF texture
   *
   * @default false
   */
  useComputeGrid?: boolean
  /**
   * Resolution of the SDF grid when useComputeGrid is enabled.
   * Higher values improve quality but use more memory and compute time.
   * 64³ = 2MB, 128³ = 16MB
   *
   * @default 64
   */
  sdfGridSize?: number
}

/**
 * WebGPU renderer for Mandelbulb fractals.
 */
export class WebGPUMandelbulbRenderer extends WebGPUBasePass {
  private _lastDebugLog: number = 0 // DEBUG: throttle logging
  private renderPipeline: GPURenderPipeline | null = null
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
  private mandelbulbUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null
  private iblUniformBuffer: GPUBuffer | null = null

  // Bind groups - consolidated layout
  // Group 0: Camera
  // Group 1: Combined (Lighting + Material + Quality)
  // Group 2: Object (Mandelbulb + Basis)
  // Group 3: IBL (if enabled)
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null // Combined bind group
  private objectBindGroup: GPUBindGroup | null = null
  private iblBindGroup: GPUBindGroup | null = null
  private iblBindGroupLayout: GPUBindGroupLayout | null = null
  private envMapTexture: GPUTexture | null = null
  private envMapSampler: GPUSampler | null = null

  // Configuration
  private rendererConfig: MandelbulbRendererConfig
  private shaderConfig: MandelbulbShaderConfig

  // Compute-accelerated SDF grid (optional, for 5-10x performance)
  private sdfGridPass: MandelbulbSDFGridPass | null = null
  private objectBindGroupLayout: GPUBindGroupLayout | null = null

  // Pre-allocated buffers for copying uniform data to compute pass
  private mandelbulbUniformData: ArrayBuffer | null = null
  private basisUniformData: ArrayBuffer | null = null

  // Geometry
  private indexCount = 0

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  constructor(config?: MandelbulbRendererConfig) {
    super({
      id: 'mandelbulb',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'object-color', access: 'write', binding: 0 },
        { resourceId: 'normal-buffer', access: 'write', binding: 1 },
        { resourceId: 'depth-buffer', access: 'write', binding: 2 },
      ],
    })

    this.rendererConfig = {
      dimension: 3,
      shadows: true,
      ambientOcclusion: true,
      sss: false,
      ibl: true,
      temporal: false,
      useComputeGrid: false,
      sdfGridSize: 64,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      shadows: this.rendererConfig.shadows,
      ambientOcclusion: this.rendererConfig.ambientOcclusion,
      sss: this.rendererConfig.sss,
      ibl: this.rendererConfig.ibl,
      temporal: this.rendererConfig.temporal,
      useComputeGrid: this.rendererConfig.useComputeGrid,
    }
  }

  setDimension(dimension: number): void {
    if (this.rendererConfig.dimension === dimension) return
    this.rendererConfig.dimension = dimension
    this.shaderConfig.dimension = dimension
    // Note: Would need to recreate pipeline for dimension change
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx
    const useComputeGrid = this.rendererConfig.useComputeGrid ?? false

    // Create SDF grid compute pass if enabled
    if (useComputeGrid) {
      this.sdfGridPass = new MandelbulbSDFGridPass({
        dimension: this.rendererConfig.dimension ?? 3,
        gridSize: this.rendererConfig.sdfGridSize ?? 64,
      })
      await this.sdfGridPass.initialize(ctx)

      // Allocate buffers for copying uniform data to compute pass
      this.mandelbulbUniformData = new ArrayBuffer(128)
      this.basisUniformData = new ArrayBuffer(256)
    }

    // Compose shaders
    const { wgsl: fragmentShader } = composeMandelbulbShader(this.shaderConfig)
    const vertexShader = composeMandelbulbVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'mandelbulb-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'mandelbulb-fragment')

    // Create bind group layouts - consolidated to stay within 4-group limit
    // Group 0: Camera
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    const combinedBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Quality
      ],
    })

    // Group 2: Object (Mandelbulb + Basis + optional SDF Grid)
    // When using compute grid, add texture and sampler bindings
    const objectBindGroupEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Mandelbulb uniforms
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Basis vectors
    ]

    if (useComputeGrid) {
      // Add SDF grid texture (binding 2) and sampler (binding 3)
      objectBindGroupEntries.push({
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      })
      objectBindGroupEntries.push({
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      })
    }

    this.objectBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-object-bgl',
      entries: objectBindGroupEntries,
    })

    // Group 3: IBL (if enabled)
    if (this.shaderConfig.ibl) {
      this.iblBindGroupLayout = device.createBindGroupLayout({
        label: 'mandelbulb-ibl-bgl',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // IBL uniforms
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float', viewDimension: '2d' }, // PMREM uses 2D texture
          }, // Environment map
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }, // Sampler
        ],
      })
    }

    // Create pipeline layout - max 4 groups
    const bindGroupLayouts: GPUBindGroupLayout[] = [
      cameraBindGroupLayout,
      combinedBindGroupLayout, // Contains combined lighting+material+quality
      this.objectBindGroupLayout,
    ]

    if (this.shaderConfig.ibl && this.iblBindGroupLayout) {
      bindGroupLayouts.push(this.iblBindGroupLayout)
    }

    const pipelineLayout = device.createPipelineLayout({
      label: 'mandelbulb-pipeline-layout',
      bindGroupLayouts,
    })

    // Create render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: 'mandelbulb-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 32, // 3 floats position + 3 floats normal + 2 floats uv
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
              { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: [
          { format: 'rgba16float' }, // HDR color buffer (not canvas format)
          { format: 'rgba16float' }, // Normal buffer
        ],
      },
      primitive: {
        topology: 'triangle-list',
        // CRITICAL: Use 'front' to match THREE.BackSide in WebGL
        // BackSide = render back faces = cull front faces
        // WebGPU cullMode: 'front' = cull front faces = render back faces
        cullMode: 'front',
      },
      depthStencil: {
        format: 'depth24plus', // Match the depth buffer created by render graph
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'mandelbulb-camera')
    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'mandelbulb-lighting')
    // MaterialUniforms: 160 bytes (vec3f has 16-byte alignment in WGSL)
    this.materialUniformBuffer = this.createUniformBuffer(device, 160, 'mandelbulb-material')
    // QualityUniforms: 48 bytes, round to 64
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'mandelbulb-quality')
    // MandelbulbUniforms: ~80 bytes, round to 128
    this.mandelbulbUniformBuffer = this.createUniformBuffer(device, 128, 'mandelbulb-uniforms')
    // BasisVectors: 192 bytes, round to 256
    this.basisUniformBuffer = this.createUniformBuffer(device, 256, 'mandelbulb-basis')

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'mandelbulb-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'mandelbulb-combined-bg',
      layout: combinedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: this.materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.qualityUniformBuffer } },
      ],
    })

    // Group 2: Object (Mandelbulb + Basis + optional SDF Grid)
    const objectBindGroupEntries2: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.mandelbulbUniformBuffer } },
      { binding: 1, resource: { buffer: this.basisUniformBuffer } },
    ]

    if (useComputeGrid && this.sdfGridPass) {
      const sdfTextureView = this.sdfGridPass.getSDFTextureView()
      const sdfSampler = this.sdfGridPass.getSDFSampler()
      if (sdfTextureView && sdfSampler) {
        objectBindGroupEntries2.push({ binding: 2, resource: sdfTextureView })
        objectBindGroupEntries2.push({ binding: 3, resource: sdfSampler })
      }
    }

    this.objectBindGroup = device.createBindGroup({
      label: 'mandelbulb-object-bg',
      layout: this.objectBindGroupLayout,
      entries: objectBindGroupEntries2,
    })

    // Group 3: IBL (if enabled)
    // Create IBL buffer and placeholder environment map
    if (this.shaderConfig.ibl && this.iblBindGroupLayout) {
      // IBLUniforms: envMapSize (f32), iblIntensity (f32), iblQuality (i32), padding (f32) = 16 bytes
      this.iblUniformBuffer = this.createUniformBuffer(device, 16, 'mandelbulb-ibl')

      // Create a placeholder 2D PMREM texture (proper size would be e.g., 768x1024 for 256px faces)
      // Using minimal size for placeholder - will be replaced with real env map later
      this.envMapTexture = device.createTexture({
        label: 'mandelbulb-env-placeholder-pmrem',
        size: { width: 64, height: 64 }, // Placeholder size, proper PMREM would be larger
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '2d',
      })

      this.envMapSampler = device.createSampler({
        label: 'mandelbulb-env-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      this.iblBindGroup = device.createBindGroup({
        label: 'mandelbulb-ibl-bg',
        layout: this.iblBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.iblUniformBuffer } },
          { binding: 1, resource: this.envMapTexture.createView({ dimension: '2d' }) },
          { binding: 2, resource: this.envMapSampler },
        ],
      })
    }

    // Create bounding geometry (cube)
    this.createBoundingGeometry(device)
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Create a unit cube for raymarching
    const size = 2.0

    // Vertices: position (3), normal (3), uv (2)
    const vertices = new Float32Array([
      // Front face
      -size,
      -size,
      size,
      0,
      0,
      1,
      0,
      0,
      size,
      -size,
      size,
      0,
      0,
      1,
      1,
      0,
      size,
      size,
      size,
      0,
      0,
      1,
      1,
      1,
      -size,
      size,
      size,
      0,
      0,
      1,
      0,
      1,
      // Back face
      size,
      -size,
      -size,
      0,
      0,
      -1,
      0,
      0,
      -size,
      -size,
      -size,
      0,
      0,
      -1,
      1,
      0,
      -size,
      size,
      -size,
      0,
      0,
      -1,
      1,
      1,
      size,
      size,
      -size,
      0,
      0,
      -1,
      0,
      1,
      // Top face
      -size,
      size,
      size,
      0,
      1,
      0,
      0,
      0,
      size,
      size,
      size,
      0,
      1,
      0,
      1,
      0,
      size,
      size,
      -size,
      0,
      1,
      0,
      1,
      1,
      -size,
      size,
      -size,
      0,
      1,
      0,
      0,
      1,
      // Bottom face
      -size,
      -size,
      -size,
      0,
      -1,
      0,
      0,
      0,
      size,
      -size,
      -size,
      0,
      -1,
      0,
      1,
      0,
      size,
      -size,
      size,
      0,
      -1,
      0,
      1,
      1,
      -size,
      -size,
      size,
      0,
      -1,
      0,
      0,
      1,
      // Right face
      size,
      -size,
      size,
      1,
      0,
      0,
      0,
      0,
      size,
      -size,
      -size,
      1,
      0,
      0,
      1,
      0,
      size,
      size,
      -size,
      1,
      0,
      0,
      1,
      1,
      size,
      size,
      size,
      1,
      0,
      0,
      0,
      1,
      // Left face
      -size,
      -size,
      -size,
      -1,
      0,
      0,
      0,
      0,
      -size,
      -size,
      size,
      -1,
      0,
      0,
      1,
      0,
      -size,
      size,
      size,
      -1,
      0,
      0,
      1,
      1,
      -size,
      size,
      -size,
      -1,
      0,
      0,
      0,
      1,
    ])

    const indices = new Uint16Array([
      0,
      1,
      2,
      0,
      2,
      3, // front
      4,
      5,
      6,
      4,
      6,
      7, // back
      8,
      9,
      10,
      8,
      10,
      11, // top
      12,
      13,
      14,
      12,
      14,
      15, // bottom
      16,
      17,
      18,
      16,
      18,
      19, // right
      20,
      21,
      22,
      20,
      22,
      23, // left
    ])

    this.vertexBuffer = device.createBuffer({
      label: 'mandelbulb-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices)

    this.indexBuffer = device.createBuffer({
      label: 'mandelbulb-indices',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.indexBuffer, 0, indices)

    this.indexCount = indices.length
  }

  /**
   * Update camera uniforms from frame context.
   * @param ctx
   */
  updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as any
    if (!camera) return

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Get scale from extended store for model matrix
    const extended = ctx.frame?.stores?.['extended'] as any
    const scale = extended?.mandelbulb?.scale ?? 1.0

    // DEBUG: Log camera and scale values once per second
    if (!this._lastDebugLog || Date.now() - this._lastDebugLog > 1000) {
      this._lastDebugLog = Date.now()
      console.log('[WebGPU Mandelbulb] Camera uniforms:', {
        hasCamera: !!camera,
        hasViewMatrix: !!camera?.viewMatrix?.elements,
        cameraPosition: camera?.position,
        scale,
        hasExtended: !!extended,
        hasMandelbulb: !!extended?.mandelbulb,
      })
    }

    // Pack camera uniforms (must match shader struct layout)
    // CameraUniforms struct layout:
    // - viewMatrix: mat4x4f (offset 0, 64 bytes = 16 floats)
    // - projectionMatrix: mat4x4f (offset 16, 64 bytes)
    // - viewProjectionMatrix: mat4x4f (offset 32, 64 bytes)
    // - inverseViewMatrix: mat4x4f (offset 48, 64 bytes)
    // - inverseProjectionMatrix: mat4x4f (offset 64, 64 bytes)
    // - modelMatrix: mat4x4f (offset 80, 64 bytes)
    // - inverseModelMatrix: mat4x4f (offset 96, 64 bytes)
    // - cameraPosition: vec3f (offset 112, 12 bytes)
    // - cameraNear: f32 (offset 115, 4 bytes)
    // - cameraFar: f32 (offset 116, 4 bytes)
    // - fov: f32 (offset 117, 4 bytes)
    // - resolution: vec2f (offset 118, 8 bytes)
    // - aspectRatio: f32 (offset 120, 4 bytes)
    // - time: f32 (offset 121, 4 bytes)
    // - deltaTime: f32 (offset 122, 4 bytes)
    // - frameNumber: u32 (offset 123, 4 bytes)
    // Total: 496 bytes = 124 floats, buffer is 512 bytes
    const data = new Float32Array(128) // 512 bytes

    // viewMatrix (16 floats, offset 0)
    if (camera.viewMatrix?.elements) {
      data.set(camera.viewMatrix.elements, 0)
    }
    // projectionMatrix (16 floats, offset 16)
    if (camera.projectionMatrix?.elements) {
      data.set(camera.projectionMatrix.elements, 16)
    }
    // viewProjectionMatrix (16 floats, offset 32)
    if (camera.viewProjectionMatrix?.elements) {
      data.set(camera.viewProjectionMatrix.elements, 32)
    }
    // inverseViewMatrix (16 floats, offset 48)
    if (camera.inverseViewMatrix?.elements) {
      data.set(camera.inverseViewMatrix.elements, 48)
    } else {
      // Identity matrix as fallback
      data[48] = 1; data[53] = 1; data[58] = 1; data[63] = 1
    }
    // inverseProjectionMatrix (16 floats, offset 64)
    if (camera.inverseProjectionMatrix?.elements) {
      data.set(camera.inverseProjectionMatrix.elements, 64)
    } else {
      // Identity matrix as fallback
      data[64] = 1; data[69] = 1; data[74] = 1; data[79] = 1
    }

    // modelMatrix (16 floats, offset 80) - scale matrix matching WebGL mesh.scale
    // Column-major order: [col0, col1, col2, col3]
    // Scale matrix: diag(scale, scale, scale, 1)
    data[80] = scale; data[81] = 0; data[82] = 0; data[83] = 0  // column 0
    data[84] = 0; data[85] = scale; data[86] = 0; data[87] = 0  // column 1
    data[88] = 0; data[89] = 0; data[90] = scale; data[91] = 0  // column 2
    data[92] = 0; data[93] = 0; data[94] = 0; data[95] = 1      // column 3

    // inverseModelMatrix (16 floats, offset 96) - inverse scale = 1/scale
    const invScale = 1.0 / scale
    data[96] = invScale; data[97] = 0; data[98] = 0; data[99] = 0    // column 0
    data[100] = 0; data[101] = invScale; data[102] = 0; data[103] = 0 // column 1
    data[104] = 0; data[105] = 0; data[106] = invScale; data[107] = 0 // column 2
    data[108] = 0; data[109] = 0; data[110] = 0; data[111] = 1        // column 3

    // cameraPosition (3 floats) + cameraNear (1 float), offset 112
    if (camera.position) {
      data[112] = camera.position.x ?? 0
      data[113] = camera.position.y ?? 0
      data[114] = camera.position.z ?? 0
    }
    data[115] = camera.near ?? 0.1

    // cameraFar, fov, resolution, aspectRatio, time, deltaTime (offset 116-123)
    data[116] = camera.far ?? 1000
    data[117] = camera.fov ?? 50
    data[118] = ctx.size.width
    data[119] = ctx.size.height
    data[120] = ctx.size.width / ctx.size.height
    data[121] = animationTime // time (respects animation pause state)
    data[122] = ctx.frame?.delta ?? 0.016

    // frameNumber as u32 - use DataView for proper type
    const dataView = new DataView(data.buffer)
    dataView.setUint32(123 * 4, ctx.frame?.frameNumber ?? 0, true)

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update mandelbulb-specific uniforms from extendedObjectStore.
   * Computes animated values for power, phase, and slice animations.
   * @param ctx
   */
  updateMandelbulbUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.mandelbulbUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    if (!extended?.mandelbulb) return

    const mb = extended.mandelbulb
    const data = new Float32Array(32) // 128 bytes / 4

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Core parameters (matching MandelbulbUniforms struct)
    data[0] = this.rendererConfig.dimension ?? 3 // dimension: i32 (stored as f32 for alignment)
    data[1] = mb.mandelbulbPower ?? 8.0 // power (static, used when animation disabled)
    data[2] = mb.maxIterations ?? 48 // iterations
    data[3] = mb.escapeRadius ?? 4.0 // escapeRadius

    // Quality settings
    data[4] = mb.sdfMaxIterations ?? 64 // sdfMaxIterations
    data[5] = mb.sdfSurfaceDistance ?? 0.001 // sdfSurfaceDistance

    // Pre-computed values
    data[6] = mb.mandelbulbPower ?? 8.0 // effectivePower (same as power for now)
    data[7] = Math.max(mb.escapeRadius ?? 4.0, 2.0) // effectiveBailout

    // Power animation - compute animated power from time
    const powerAnimationEnabled = mb.powerAnimationEnabled ?? false
    data[8] = powerAnimationEnabled ? 1 : 0 // powerAnimationEnabled: u32

    if (powerAnimationEnabled) {
      // Compute animated power: oscillates between powerMin and powerMax
      const powerMin = mb.powerMin ?? 2.0
      const powerMax = mb.powerMax ?? 12.0
      const powerSpeed = mb.powerSpeed ?? 0.1
      const t = accumulatedTime * powerSpeed * 2 * Math.PI
      const normalized = (Math.sin(t) + 1) / 2 // Maps [-1, 1] to [0, 1]
      data[9] = powerMin + normalized * (powerMax - powerMin) // animatedPower
    } else {
      data[9] = mb.mandelbulbPower ?? 8.0 // animatedPower = static power
    }

    // Alternate power blending
    data[10] = mb.alternatePowerEnabled ? 1 : 0 // alternatePowerEnabled: u32
    data[11] = mb.alternatePowerValue ?? 8.0 // alternatePowerValue
    data[12] = mb.alternatePowerBlend ?? 0.0 // alternatePowerBlend

    // Phase shift animation - compute phase angles from time
    const phaseShiftEnabled = mb.phaseShiftEnabled ?? false
    data[13] = phaseShiftEnabled ? 1 : 0 // phaseEnabled: u32

    if (phaseShiftEnabled) {
      const phaseSpeed = mb.phaseSpeed ?? 0.1
      const phaseAmplitude = mb.phaseAmplitude ?? 0.5
      const t = accumulatedTime * phaseSpeed * 2 * Math.PI
      // Theta and phi use different frequencies for more organic twisting (golden ratio)
      data[14] = phaseAmplitude * Math.sin(t) // phaseTheta
      data[15] = phaseAmplitude * Math.sin(t * 1.618033988749895) // phasePhi (golden ratio frequency)
    } else {
      data[14] = 0.0 // phaseTheta
      data[15] = 0.0 // phasePhi
    }

    // Scale
    data[16] = mb.scale ?? 1.0

    // Slice animation parameters (needed for origin computation in updateBasisUniforms)
    data[17] = mb.sliceAnimationEnabled ? 1 : 0 // sliceAnimationEnabled: u32
    data[18] = mb.sliceSpeed ?? 0.1 // sliceSpeed
    data[19] = mb.sliceAmplitude ?? 0.5 // sliceAmplitude

    this.writeUniformBuffer(this.device, this.mandelbulbUniformBuffer, data)

    // Copy data to compute pass buffer for SDF grid updates
    if (this.mandelbulbUniformData) {
      new Float32Array(this.mandelbulbUniformData).set(data)
    }
  }

  /**
   * Update N-D basis vectors from rotationStore.
   * Computes proper N-dimensional rotation matrices and applies them to basis vectors.
   * Handles slice animation for 4D+ dimensions.
   * @param ctx
   */
  updateBasisUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const rotation = ctx.frame?.stores?.['rotation'] as any
    const extended = ctx.frame?.stores?.['extended'] as any
    if (!rotation) return

    const dimension = this.rendererConfig.dimension ?? 3
    const rotations = rotation.rotations as Map<string, number> | undefined

    // Each basis vector is stored as 3 vec4f (12 floats) for up to 11D
    // Layout: basisX (12 floats) | basisY (12 floats) | basisZ (12 floats) | origin (12 floats)
    const data = new Float32Array(48) // 192 bytes for 4 vectors × 12 floats

    // Compute rotation matrix from store rotations
    const rotationMatrix = composeRotations(dimension, rotations ?? new Map())

    // Create unit vectors
    const unitX = new Float32Array(MAX_DIMENSION)
    const unitY = new Float32Array(MAX_DIMENSION)
    const unitZ = new Float32Array(MAX_DIMENSION)
    unitX[0] = 1.0
    unitY[1] = 1.0
    unitZ[2] = 1.0

    // Apply rotation to basis vectors
    const rotatedX = new Float32Array(MAX_DIMENSION)
    const rotatedY = new Float32Array(MAX_DIMENSION)
    const rotatedZ = new Float32Array(MAX_DIMENSION)
    this.applyRotation(rotationMatrix, unitX, rotatedX, dimension)
    this.applyRotation(rotationMatrix, unitY, rotatedY, dimension)
    this.applyRotation(rotationMatrix, unitZ, rotatedZ, dimension)

    // Copy rotated basis vectors to data buffer
    for (let i = 0; i < MAX_DIMENSION; i++) {
      data[i] = rotatedX[i] ?? 0 // basisX at offset 0
      data[12 + i] = rotatedY[i] ?? 0 // basisY at offset 12
      data[24 + i] = rotatedZ[i] ?? 0 // basisZ at offset 24
    }

    // Get mandelbulb state for slice animation
    const mb = extended?.mandelbulb
    const parameterValues = mb?.parameterValues ?? []
    const sliceAnimationEnabled = mb?.sliceAnimationEnabled ?? false
    const sliceSpeed = mb?.sliceSpeed ?? 0.1
    const sliceAmplitude = mb?.sliceAmplitude ?? 0.5

    // Get animation time for slice animation
    const animation = ctx.frame?.stores?.['animation'] as any
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Compute origin: start with parameter values for extra dimensions
    const originUnrotated = new Float32Array(MAX_DIMENSION)

    if (sliceAnimationEnabled && dimension > 3) {
      // Slice Animation: animate through higher-dimensional cross-sections
      // Use sine waves with golden ratio phase offsets for organic motion
      const PHI = 1.618033988749895 // Golden ratio

      for (let i = 3; i < dimension && i < MAX_DIMENSION; i++) {
        const extraDimIndex = i - 3
        // Each dimension gets a unique phase offset based on golden ratio
        const phase = extraDimIndex * PHI
        // Multi-frequency sine for more interesting motion
        const t1 = accumulatedTime * sliceSpeed * 2 * Math.PI + phase
        const t2 = accumulatedTime * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
        // Blend two frequencies for non-repetitive motion
        const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
        originUnrotated[i] = (parameterValues[extraDimIndex] ?? 0) + offset
      }
    } else {
      // No slice animation - use static parameter values
      for (let i = 3; i < dimension && i < MAX_DIMENSION; i++) {
        originUnrotated[i] = parameterValues[i - 3] ?? 0
      }
    }

    // Apply rotation to origin
    const rotatedOrigin = new Float32Array(MAX_DIMENSION)
    this.applyRotation(rotationMatrix, originUnrotated, rotatedOrigin, dimension)
    for (let i = 0; i < MAX_DIMENSION; i++) {
      data[36 + i] = rotatedOrigin[i] ?? 0 // origin at offset 36
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, data)

    // Copy data to compute pass buffer for SDF grid updates
    if (this.basisUniformData) {
      new Float32Array(this.basisUniformData).set(data)
    }
  }

  /**
   * Apply rotation matrix to a vector.
   * @param matrix
   * @param vec
   * @param out
   * @param dimension
   */
  private applyRotation(
    matrix: MatrixND,
    vec: Float32Array,
    out: Float32Array,
    dimension: number
  ): void {
    out.fill(0)
    for (let i = 0; i < dimension; i++) {
      let sum = 0
      const rowOffset = i * dimension
      for (let j = 0; j < dimension; j++) {
        sum += (matrix[rowOffset + j] ?? 0) * (vec[j] ?? 0)
      }
      out[i] = sum
    }
  }

  /**
   * Update material uniforms from pbrStore and appearanceStore.
   * Includes SSS and Fresnel properties for advanced rendering.
   * @param ctx
   */
  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any

    // MaterialUniforms packing (WGSL host-shareable layout).
    // vec3f has 16-byte alignment, so there are padding gaps. Total size = 160 bytes (40 floats).
    // Packing indices:
    //  0-3:   baseColor (vec4f)
    //  4-7:   metallic, roughness, reflectance, ao (f32)
    //  8-11:  emissive (vec3f) + emissiveIntensity (f32)
    //  12-14: ior, transmission, thickness (f32)
    //  15:    sssEnabled (u32)
    //  16:    sssIntensity (f32)
    //  20-22: sssColor (vec3f)
    //  23-24: sssThickness, sssJitter (f32)
    //  25:    fresnelEnabled (u32)
    //  26:    fresnelIntensity (f32)
    //  28-30: rimColor (vec3f)
    //  32:    specularIntensity (f32)
    //  36-38: specularColor (vec3f)
    const data = new Float32Array(40) // 160 bytes
    const dataView = new DataView(data.buffer)

    // baseColor: vec4f (offset 0-3)
    const faceColor = this.parseColor(appearance?.faceColor ?? '#ffffff')
    data[0] = faceColor[0]
    data[1] = faceColor[1]
    data[2] = faceColor[2]
    data[3] = 1.0

    // metallic, roughness, reflectance, ao (offset 4-7)
    data[4] = pbr?.face?.metallic ?? 0.0
    data[5] = pbr?.face?.roughness ?? 0.5
    data[6] = pbr?.face?.reflectance ?? 0.5
    data[7] = 1.0 // ao (ambient occlusion factor)

    // emissive: vec3f + emissiveIntensity: f32 (offset 8-11)
    const emissiveColor = this.parseColor(appearance?.emissiveColor ?? '#000000')
    data[8] = emissiveColor[0]
    data[9] = emissiveColor[1]
    data[10] = emissiveColor[2]
    data[11] = appearance?.emissiveIntensity ?? 0.0

    // ior, transmission, thickness (offset 12-14)
    data[12] = pbr?.face?.ior ?? 1.5
    data[13] = pbr?.face?.transmission ?? 0.0
    data[14] = pbr?.face?.thickness ?? 1.0

    // sssEnabled: u32 (offset 15)
    const sssEnabled = appearance?.sssEnabled ?? false
    dataView.setUint32(15 * 4, sssEnabled ? 1 : 0, true)

    // sssIntensity: f32 (offset 16)
    data[16] = appearance?.sssIntensity ?? 1.0

    // sssColor: vec3f (idx 20-22)
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    data[20] = sssColor[0]
    data[21] = sssColor[1]
    data[22] = sssColor[2]

    // sssThickness, sssJitter (idx 23-24)
    data[23] = appearance?.sssThickness ?? 1.0
    data[24] = appearance?.sssJitter ?? 0.2

    // fresnelEnabled: u32 (idx 25) - uses edgesVisible from appearance store
    const fresnelEnabled = appearance?.edgesVisible ?? true
    dataView.setUint32(25 * 4, fresnelEnabled ? 1 : 0, true)

    // fresnelIntensity: f32 (idx 26)
    data[26] = appearance?.fresnelIntensity ?? 0.5

    // rimColor: vec3f (idx 28-30) - uses edgeColor from appearance store
    const rimColor = this.parseColor(appearance?.edgeColor ?? '#ffffff')
    data[28] = rimColor[0]
    data[29] = rimColor[1]
    data[30] = rimColor[2]

    // specularIntensity + specularColor (idx 32, 36-38)
    data[32] = pbr?.face?.specularIntensity ?? 0.8
    const specularColor = this.parseColor(pbr?.face?.specularColor ?? '#ffffff')
    data[36] = specularColor[0]
    data[37] = specularColor[1]
    data[38] = specularColor[2]

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }


  /**
   * Update quality uniforms.
   * @param ctx
   */
  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = ctx.frame?.stores?.['performance'] as any
    const lighting = ctx.frame?.stores?.['lighting'] as any
    const environment = ctx.frame?.stores?.['environment'] as any
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as any
    const extended = ctx.frame?.stores?.['extended'] as any
    const mandelbulb = extended?.mandelbulb

    // QualityUniforms struct layout:
    // sdfMaxIterations: i32 (0)
    // sdfSurfaceDistance: f32 (1)
    // shadowQuality: i32 (2)
    // shadowSoftness: f32 (3)
    // aoEnabled: i32 (4)
    // aoSamples: i32 (5)
    // aoRadius: f32 (6)
    // aoIntensity: f32 (7)
    // iblQuality: i32 (8)
    // iblIntensity: f32 (9)
    // qualityMultiplier: f32 (10)
    // _padding: f32 (11)
    const data = new Float32Array(12)

    // Read SDF parameters from store (user-configurable), with fallback defaults
    const sdfMaxIterations = mandelbulb?.sdfMaxIterations ?? 64
    const sdfSurfaceDistance = mandelbulb?.sdfSurfaceDistance ?? 0.001
    const qualityMultiplier = mandelbulb?.qualityMultiplier ?? performance?.qualityMultiplier ?? 1.0
    const aoSamples = mandelbulb?.aoSamples ?? 4

    data[1] = sdfSurfaceDistance / qualityMultiplier // sdfSurfaceDistance (smaller = more precise)
    data[3] = lighting?.shadowSoftness ?? 0.5 // shadowSoftness
    data[6] = performance?.aoRadius ?? 0.5 // aoRadius
    data[7] = performance?.aoIntensity ?? 1.0 // aoIntensity
    data[9] = environment?.iblIntensity ?? 1.0 // iblIntensity
    data[10] = qualityMultiplier // qualityMultiplier

    const dataView = new DataView(data.buffer)
    dataView.setInt32(0 * 4, Math.floor(sdfMaxIterations * qualityMultiplier), true) // sdfMaxIterations
    dataView.setInt32(2 * 4, lighting?.shadowEnabled ? (lighting?.shadowQuality ?? 2) : 0, true) // shadowQuality
    // aoEnabled: Use postProcessing.ssaoEnabled (global toggle) like WebGL
    dataView.setInt32(4 * 4, postProcessing?.ssaoEnabled ? 1 : 0, true) // aoEnabled
    dataView.setInt32(5 * 4, Math.floor(aoSamples * qualityMultiplier), true) // aoSamples
    dataView.setInt32(8 * 4, this.rendererConfig.ibl ? (environment?.iblQuality ?? 1) : 0, true) // iblQuality

    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, data)
  }

  /**
   * Update IBL uniforms from environment store.
   * @param ctx
   */
  updateIBLUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.iblUniformBuffer || !this.rendererConfig.ibl) return

    const environment = ctx.frame?.stores?.['environment'] as any

    // IBLUniforms struct layout:
    // envMapSize: f32 (0)
    // iblIntensity: f32 (1)
    // iblQuality: i32 (2)
    // _padding: f32 (3)
    const data = new Float32Array(4)
    data[0] = environment?.envMapSize ?? 256.0 // envMapSize
    data[1] = environment?.iblIntensity ?? 1.0 // iblIntensity

    const dataView = new DataView(data.buffer)
    dataView.setInt32(2 * 4, environment?.iblQuality ?? 1, true) // iblQuality

    this.writeUniformBuffer(this.device, this.iblUniformBuffer, data)
  }

  /**
   * Update lighting uniforms from lightingStore.
   * @param ctx
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    const data = new Float32Array(144)
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  /**
   * Parse hex color string to RGB array [0-1].
   * @param hex
   */
  private parseColor(hex: string): [number, number, number] {
    const rgb = parseHexColorToLinearRgb(hex, [1, 1, 1])
    return [rgb[0], rgb[1], rgb[2]]
  }

  execute(ctx: WebGPURenderContext): void {
    // DEBUG: Log which resources are missing
    const missingResources: string[] = []
    if (!this.device) missingResources.push('device')
    if (!this.renderPipeline) missingResources.push('renderPipeline')
    if (!this.vertexBuffer) missingResources.push('vertexBuffer')
    if (!this.indexBuffer) missingResources.push('indexBuffer')
    if (!this.cameraBindGroup) missingResources.push('cameraBindGroup')
    if (!this.lightingBindGroup) missingResources.push('lightingBindGroup')
    if (!this.objectBindGroup) missingResources.push('objectBindGroup')

    if (missingResources.length > 0) {
      console.warn('[WebGPU Mandelbulb] Missing resources:', missingResources.join(', '))
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateMandelbulbUniforms(ctx)
    this.updateBasisUniforms(ctx)
    this.updateMaterialUniforms(ctx)
    this.updateLightingUniforms(ctx)
    this.updateQualityUniforms(ctx)
    this.updateIBLUniforms(ctx)

    // Execute SDF grid compute pass if enabled
    // This must happen after uniform updates and before the render pass
    if (this.sdfGridPass && this.device && this.mandelbulbUniformData && this.basisUniformData) {
      // Copy current uniform data to the compute pass
      this.sdfGridPass.updateMandelbulbUniforms(this.device, this.mandelbulbUniformData)
      this.sdfGridPass.updateBasisUniforms(this.device, this.basisUniformData)

      // Execute the compute pass to update the SDF grid
      this.sdfGridPass.execute(ctx)
    }

    // Get render targets
    const colorView = ctx.getWriteTarget('object-color')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !normalView || !depthView) {
      console.warn('[WebGPU Mandelbulb] Missing render targets:', {
        colorView: !!colorView,
        normalView: !!normalView,
        depthView: !!depthView,
      })
      return
    }

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'mandelbulb-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
        {
          view: normalView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.5, g: 0.5, b: 1, a: 0 },
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      },
    })

    // Set pipeline and bind groups - consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Mandelbulb + Basis + optional SDF Grid)
    // Group 3: IBL (if enabled)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)
    if (this.rendererConfig.ibl && this.iblBindGroup) {
      passEncoder.setBindGroup(3, this.iblBindGroup)
    }

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16')
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()

    // Update draw statistics (fullscreen quad = 2 triangles, 6 indices)
    this.lastDrawStats = {
      calls: 1,
      triangles: Math.floor(this.indexCount / 3),
      vertices: this.indexCount,
      lines: 0,
      points: 0,
    }
  }

  /**
   * Get draw statistics from the last execute() call.
   */
  getDrawStats(): import('../core/types').WebGPUPassDrawStats {
    return this.lastDrawStats
  }

  dispose(): void {
    // Dispose SDF grid compute pass
    this.sdfGridPass?.dispose()
    this.sdfGridPass = null
    this.mandelbulbUniformData = null
    this.basisUniformData = null

    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.mandelbulbUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()
    this.iblUniformBuffer?.destroy()
    this.envMapTexture?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.mandelbulbUniformBuffer = null
    this.basisUniformBuffer = null
    this.iblUniformBuffer = null
    this.iblBindGroup = null
    this.iblBindGroupLayout = null
    this.objectBindGroupLayout = null
    this.envMapTexture = null
    this.envMapSampler = null

    super.dispose()
  }
}
