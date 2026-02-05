/**
 * WebGPU Schrödinger Renderer
 *
 * Renders N-dimensional quantum wavefunctions using WebGPU volume raymarching.
 * Supports harmonic oscillator and hydrogen orbital modes.
 *
 * @module rendering/webgpu/renderers/WebGPUSchrodingerRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
  type SchroedingerWGSLShaderConfig,
  type QuantumModeForShader,
} from '../shaders/schroedinger/compose'
import { MAX_DIM, MAX_TERMS, MAX_EXTRA_DIM } from '../shaders/schroedinger/uniforms.wgsl'
import {
  generateQuantumPreset,
  getNamedPreset,
  flattenPresetForUniforms,
  type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import { DensityGridComputePass } from '../passes/DensityGridComputePass'
import { parseHexColorToLinearRgb } from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'

export interface SchrodingerRendererConfig {
  dimension?: number
  isosurface?: boolean
  quantumMode?: QuantumModeForShader
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Enable temporal accumulation for volumetric mode */
  temporal?: boolean
  /** Enable IBL (Image-Based Lighting) */
  ibl?: boolean
  /**
   * Use pre-computed density grid for 3-6x faster volumetric rendering.
   * Requires compute shader support. Only applies to volumetric mode (not isosurface).
   * Default: false
   */
  useDensityGrid?: boolean
}

/**
 * WebGPU renderer for quantum wavefunctions.
 */
export class WebGPUSchrodingerRenderer extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
  private schroedingerUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Bind groups
  // Group 0: Camera
  // Group 1: Combined (Lighting + Material + Quality)
  // Group 2: Object (Schrödinger + Basis + optional DensityGrid)
  // Group 3: IBL (if enabled)
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null
  private iblBindGroup: GPUBindGroup | null = null
  private iblBindGroupLayout: GPUBindGroupLayout | null = null
  private iblUniformBuffer: GPUBuffer | null = null
  private envMapTexture: GPUTexture | null = null
  private envMapSampler: GPUSampler | null = null

  // Density Grid Compute Pass (for accelerated volumetric rendering)
  private densityGridPass: DensityGridComputePass | null = null
  private densityGridInitialized = false

  // Configuration
  private rendererConfig: SchrodingerRendererConfig
  private shaderConfig: SchroedingerWGSLShaderConfig

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

  // Quantum preset caching (like WebGL SchroedingerMesh)
  private cachedPreset: QuantumPreset | null = null
  private cachedPresetConfig: {
    presetName: string
    seed: number
    termCount: number
    maxQuantumNumber: number
    frequencySpread: number
    dimension: number
  } | null = null
  private flattenedPreset: {
    omega: Float32Array
    quantum: Int32Array
    coeff: Float32Array
    energy: Float32Array
  } | null = null


  // Pre-allocated staging buffers to avoid per-frame GC pressure
  // Schroedinger: 1024 bytes (256 floats)
  private schroedingerUniformData = new ArrayBuffer(1024)
  private schroedingerFloatView = new Float32Array(this.schroedingerUniformData)
  private schroedingerIntView = new Int32Array(this.schroedingerUniformData)
  // Camera: 512 bytes (128 floats)
  private cameraUniformData = new Float32Array(128)
  // Basis: 192 bytes (48 floats)
  private basisUniformData = new Float32Array(48)
  // Lighting: 576 bytes (144 floats)
  private lightingUniformData = new Float32Array(144)
  // Material: 160 bytes (40 floats) - WGSL vec3f has 16-byte alignment
  private materialUniformData = new Float32Array(40)
  private materialDataView = new DataView(this.materialUniformData.buffer)
  // Quality: 48 bytes (12 floats)
  private qualityUniformData = new Float32Array(12)
  private qualityDataView = new DataView(this.qualityUniformData.buffer)
  // IBL: 16 bytes (4 floats)
  private iblUniformData = new Float32Array(4)
  private iblDataView = new DataView(this.iblUniformData.buffer)
  // Time update: 4 bytes (1 float) - for dirty-flag optimization partial writes
  private timeUpdateBuffer = new Float32Array(1)

  // Dirty-flag version tracking - skip uniform updates when unchanged
  // Schroedinger uses partial buffer writes: only time field (4 bytes) when settings unchanged
  private lastSchroedingerVersion = -1
  private lastAppearanceVersion = -1
  private lastIblVersion = -1
  // Separate appearance version tracker for the Schroedinger uniform buffer.
  // Emission/Rim parameters are sourced from the appearance store (matching WebGL),
  // so the Schroedinger buffer must also be updated when appearance changes.
  private lastSchrodingerAppearanceVersion = -1

  // Time field offset in SchroedingerUniforms buffer (bytes)
  // Used for partial buffer writes when only time changes
  private static readonly TIME_FIELD_OFFSET = 908

  // Diagnostic logging throttle
  private lastDiagnosticLog = 0

  constructor(config?: SchrodingerRendererConfig) {
    // Determine outputs based on mode
    // Write to 'object-color' like other renderers (Mandelbulb, Julia, Polytope)
    // EnvironmentCompositePass will composite object-color over environment to produce hdr-color
    // Isosurface mode uses MRT (color + normal + depth) like Mandelbulb
    // Volumetric mode uses color + depth (alpha blending handled by EnvironmentCompositePass)
    // Temporal mode uses quarter-res outputs that get accumulated by WebGPUTemporalCloudPass
    const isIsosurface = config?.isosurface ?? false
    const isTemporal = config?.temporal ?? false
    const outputs = isIsosurface
      ? [
          { resourceId: 'object-color', access: 'write' as const, binding: 0 },
          { resourceId: 'normal-buffer', access: 'write' as const, binding: 1 },
          { resourceId: 'depth-buffer', access: 'write' as const, binding: 2 },
        ]
      : isTemporal
        ? [
            // Temporal volumetric: quarter-res color + position for temporal accumulation
            // No depth buffer needed - all targets are quarter-res, uses alpha blending
            { resourceId: 'quarter-color', access: 'write' as const, binding: 0 },
            { resourceId: 'quarter-position', access: 'write' as const, binding: 1 },
          ]
        : [
            { resourceId: 'object-color', access: 'write' as const, binding: 0 },
            { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
          ]

    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs,
    })

    this.rendererConfig = {
      dimension: 3,
      isosurface: false,
      quantumMode: 'harmonicOscillator',
      temporal: false,
      ibl: true,
      // Density grid disabled by default: while it provides 3-6x FPS improvement via
      // pre-computed 64³ texture lookups, it loses phase data (returns phase=0.0),
      // breaks chromatic dispersion, shimmer, and phase-based coloring.
      // Enable explicitly when performance is prioritized over visual quality.
      useDensityGrid: false,
      ...config,
    }

    // Density grid only makes sense for volumetric mode, not isosurface
    const effectiveUseDensityGrid =
      this.rendererConfig.useDensityGrid && !this.rendererConfig.isosurface

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      isosurface: this.rendererConfig.isosurface,
      quantumMode: this.rendererConfig.quantumMode,
      termCount: this.rendererConfig.termCount,
      temporalAccumulation: this.rendererConfig.temporal,
      ibl: this.rendererConfig.ibl,
      useDensityGrid: effectiveUseDensityGrid,
    }
  }

  setDimension(dimension: number): void {
    if (this.rendererConfig.dimension === dimension) return
    this.rendererConfig.dimension = dimension
    this.shaderConfig.dimension = dimension
  }

  setQuantumMode(mode: QuantumModeForShader): void {
    if (this.rendererConfig.quantumMode === mode) return
    this.rendererConfig.quantumMode = mode
    this.shaderConfig.quantumMode = mode
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose shaders
    const { wgsl: fragmentShader } = composeSchroedingerShader(this.shaderConfig)
    const vertexShader = composeSchroedingerVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'schroedinger-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'schroedinger-fragment')

    // Create bind group layouts - consolidated to stay within 4-group limit
    // Group 0: Camera
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    const combinedBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Quality
      ],
    })

    // Group 2: Object (Schroedinger + Basis + optional DensityGrid texture)
    // When useDensityGrid is enabled, we add texture and sampler bindings
    const useDensityGrid = this.shaderConfig.useDensityGrid && !this.rendererConfig.isosurface

    const objectLayoutEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
    ]

    // Add density grid bindings if enabled
    // Using rgba16float texture which supports hardware filtering
    if (useDensityGrid) {
      objectLayoutEntries.push(
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as GPUTextureSampleType, viewDimension: '3d' as GPUTextureViewDimension },
        }, // Density grid texture (rgba16float)
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' as const } } // Trilinear sampler
      )
    }

    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: objectLayoutEntries,
    })
    // Group 3: IBL (if enabled)
    if (this.shaderConfig.ibl) {
      this.iblBindGroupLayout = device.createBindGroupLayout({
        label: 'schroedinger-ibl-bgl',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // IBL uniforms
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' as GPUTextureSampleType, viewDimension: '2d' as GPUTextureViewDimension }, // PMREM uses 2D texture
          }, // Environment map
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // Sampler
        ],
      })
    }

    // Create pipeline layout - 3-4 groups depending on IBL
    const bindGroupLayouts: GPUBindGroupLayout[] = [
      cameraBindGroupLayout,
      combinedBindGroupLayout, // Contains combined lighting+material+quality
      objectBindGroupLayout,
    ]

    if (this.shaderConfig.ibl && this.iblBindGroupLayout) {
      bindGroupLayouts.push(this.iblBindGroupLayout)
    }

    const pipelineLayout = device.createPipelineLayout({
      label: 'schroedinger-pipeline-layout',
      bindGroupLayouts,
    })

    // Create render pipeline (async to avoid freezing browser during compilation)
    // The Schroedinger shader is 3000-5000 lines of WGSL (quantum math, volume integration,
    // PBR lighting, etc.) and synchronous compilation blocks the main thread for seconds.
    this.renderPipeline = await device.createRenderPipelineAsync({
      label: 'schroedinger-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 12, // 3 floats position
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        // Target configuration depends on mode:
        // - Isosurface: MRT (color + normal), no blend
        // - Temporal volumetric: MRT (color + position), with alpha blend
        // - Standard volumetric: single target with alpha blend
        targets: this.rendererConfig.isosurface
          ? [
              { format: 'rgba16float' as GPUTextureFormat }, // Color buffer (no blend for solid surface)
              { format: 'rgba16float' as GPUTextureFormat }, // Normal buffer
            ]
          : this.rendererConfig.temporal
            ? [
                {
                  // Temporal volumetric color output with alpha blending
                  format: 'rgba16float' as GPUTextureFormat,
                  blend: {
                    color: {
                      srcFactor: 'src-alpha' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                    alpha: {
                      srcFactor: 'one' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                  },
                },
                {
                  // Position buffer (rgba32float for world positions) - no blend
                  format: 'rgba32float' as GPUTextureFormat,
                },
              ]
            : [
                {
                  // Standard volumetric mode needs alpha blending
                  format: 'rgba16float' as GPUTextureFormat,
                  blend: {
                    color: {
                      srcFactor: 'src-alpha' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                    alpha: {
                      srcFactor: 'one' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                  },
                },
              ],
      },
      primitive: {
        topology: 'triangle-list' as const,
        // CRITICAL: Use 'front' to match THREE.BackSide in WebGL
        // BackSide = render back faces = cull front faces
        cullMode: 'front' as const,
      },
      // Depth state: only for modes that use depth buffer (not temporal)
      // Temporal mode renders to quarter-res without depth testing
      depthStencil:
        this.rendererConfig.temporal && !this.rendererConfig.isosurface
          ? undefined
          : {
              format: 'depth24plus' as GPUTextureFormat,
              depthWriteEnabled: true,
              depthCompare: 'less' as GPUCompareFunction,
            },
    })

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'schroedinger-camera')
    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'schroedinger-lighting')
    // Material and Quality buffers for combined bind group
    // 160 bytes due to WGSL vec3f 16-byte alignment requirements
    this.materialUniformBuffer = this.createUniformBuffer(device, 160, 'schroedinger-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'schroedinger-quality')
    // Schroedinger uniforms: ~1KB for all quantum parameters
    this.schroedingerUniformBuffer = this.createUniformBuffer(device, 1024, 'schroedinger-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'schroedinger-basis')

    // Create density grid compute pass if enabled
    if (useDensityGrid) {
      this.densityGridPass = new DensityGridComputePass({
        dimension: this.rendererConfig.dimension ?? 3,
        quantumMode: this.rendererConfig.quantumMode,
        termCount: this.rendererConfig.termCount,
        gridSize: 64, // 64³ grid - balance between quality and compute cost
      })
      // Initialize the compute pass (creates its own pipeline and resources)
      await this.densityGridPass.initialize(ctx)
      this.densityGridInitialized = true
    }

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'schroedinger-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'schroedinger-combined-bg',
      layout: combinedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: this.materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.qualityUniformBuffer } },
      ],
    })

    // Group 2: Object (Schroedinger + Basis + optional DensityGrid)
    const objectBindGroupEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
      { binding: 1, resource: { buffer: this.basisUniformBuffer } },
    ]

    // Add density grid texture and sampler if enabled
    if (useDensityGrid && this.densityGridPass) {
      const densityTextureView = this.densityGridPass.getDensityTextureView()
      const densitySampler = this.densityGridPass.getDensitySampler()
      if (densityTextureView && densitySampler) {
        objectBindGroupEntries.push(
          { binding: 2, resource: densityTextureView },
          { binding: 3, resource: densitySampler }
        )
      }
    }

    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: objectBindGroupEntries,
    })

    // Group 3: IBL (if enabled)
    // Create IBL buffer and placeholder environment map
    if (this.shaderConfig.ibl && this.iblBindGroupLayout) {
      // IBLUniforms: envMapSize (f32), iblIntensity (f32), iblQuality (i32), padding (f32) = 16 bytes
      this.iblUniformBuffer = this.createUniformBuffer(device, 16, 'schroedinger-ibl')

      // Create a placeholder 2D PMREM texture (proper size would be e.g., 768x1024 for 256px faces)
      // Using minimal size for placeholder - will be replaced with real env map later
      this.envMapTexture = device.createTexture({
        label: 'schroedinger-env-placeholder-pmrem',
        size: { width: 64, height: 64 }, // Placeholder size, proper PMREM would be larger
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '2d',
      })

      this.envMapSampler = device.createSampler({
        label: 'schroedinger-env-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      this.iblBindGroup = device.createBindGroup({
        label: 'schroedinger-ibl-bg',
        layout: this.iblBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.iblUniformBuffer } },
          { binding: 1, resource: this.envMapTexture.createView({ dimension: '2d' }) },
          { binding: 2, resource: this.envMapSampler },
        ],
      })
    }

    // Create bounding geometry (sphere for volume)
    this.createBoundingGeometry(device)
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Create a box (4×4×4) for volume raymarching - matches WebGL BoxGeometry(4,4,4)
    const halfSize = 2.0

    // 8 vertices of a cube (each corner)
    // prettier-ignore
    const vertices = new Float32Array([
      // Front face
      -halfSize, -halfSize,  halfSize,
       halfSize, -halfSize,  halfSize,
       halfSize,  halfSize,  halfSize,
      -halfSize,  halfSize,  halfSize,
      // Back face
      -halfSize, -halfSize, -halfSize,
      -halfSize,  halfSize, -halfSize,
       halfSize,  halfSize, -halfSize,
       halfSize, -halfSize, -halfSize,
      // Top face
      -halfSize,  halfSize, -halfSize,
      -halfSize,  halfSize,  halfSize,
       halfSize,  halfSize,  halfSize,
       halfSize,  halfSize, -halfSize,
      // Bottom face
      -halfSize, -halfSize, -halfSize,
       halfSize, -halfSize, -halfSize,
       halfSize, -halfSize,  halfSize,
      -halfSize, -halfSize,  halfSize,
      // Right face
       halfSize, -halfSize, -halfSize,
       halfSize,  halfSize, -halfSize,
       halfSize,  halfSize,  halfSize,
       halfSize, -halfSize,  halfSize,
      // Left face
      -halfSize, -halfSize, -halfSize,
      -halfSize, -halfSize,  halfSize,
      -halfSize,  halfSize,  halfSize,
      -halfSize,  halfSize, -halfSize,
    ])

    // 6 faces × 2 triangles × 3 vertices = 36 indices
    // prettier-ignore
    const indices = new Uint16Array([
      0,  1,  2,    0,  2,  3,   // Front
      4,  5,  6,    4,  6,  7,   // Back
      8,  9,  10,   8,  10, 11,  // Top
      12, 13, 14,   12, 14, 15,  // Bottom
      16, 17, 18,   16, 18, 19,  // Right
      20, 21, 22,   20, 22, 23,  // Left
    ])

    const vertexData = vertices
    const indexData = indices

    this.vertexBuffer = device.createBuffer({
      label: 'schroedinger-vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData)

    this.indexBuffer = device.createBuffer({
      label: 'schroedinger-indices',
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.indexBuffer, 0, indexData)

    this.indexCount = indices.length
  }

  updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    const camera = ctx.frame?.stores?.['camera'] as any
    if (!camera) return

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // CameraUniforms layout (512 bytes = 128 floats):
    // 7 mat4x4f (7 × 16 floats = 112) + vec3f+f32 (4) + remaining scalars (12)
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const data = this.cameraUniformData

    // Matrices at correct offsets (each mat4x4f = 16 floats)
    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0) // offset 0
    }
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16) // offset 16
    }
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32) // offset 32
    }
    if (camera.inverseViewMatrix) {
      data.set(camera.inverseViewMatrix.elements, 48) // offset 48
    }
    if (camera.inverseProjectionMatrix) {
      data.set(camera.inverseProjectionMatrix.elements, 64) // offset 64
    }

    // Model matrices for raymarching coordinate space conversion
    // Read transform from store for position/scale
    const transform = ctx.frame?.stores?.['transform'] as any
    const scale = transform?.uniformScale ?? 1.0
    const position = transform?.position ?? [0, 0, 0]

    // Build model matrix: translation * scale
    // Column-major order for WebGPU (same as Three.js)
    // modelMatrix (offset 80): [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, tx, ty, tz, 1]
    data[80] = scale; data[81] = 0; data[82] = 0; data[83] = 0
    data[84] = 0; data[85] = scale; data[86] = 0; data[87] = 0
    data[88] = 0; data[89] = 0; data[90] = scale; data[91] = 0
    data[92] = position[0]; data[93] = position[1]; data[94] = position[2]; data[95] = 1.0

    // inverseModelMatrix (offset 96): inverse of translation * scale
    // inv(T*S) = inv(S) * inv(T) = [1/s, 0, 0, 0, 0, 1/s, 0, 0, 0, 0, 1/s, 0, -tx/s, -ty/s, -tz/s, 1]
    const invScale = scale !== 0 ? 1.0 / scale : 1.0
    data[96] = invScale; data[97] = 0; data[98] = 0; data[99] = 0
    data[100] = 0; data[101] = invScale; data[102] = 0; data[103] = 0
    data[104] = 0; data[105] = 0; data[106] = invScale; data[107] = 0
    data[108] = -position[0] * invScale; data[109] = -position[1] * invScale; data[110] = -position[2] * invScale; data[111] = 1.0

    // Camera position at offset 112 (after 7 matrices)
    if (camera.position) {
      data[112] = camera.position.x
      data[113] = camera.position.y
      data[114] = camera.position.z
    }
    data[115] = camera.near || 0.1 // cameraNear (packed with cameraPosition)
    data[116] = camera.far || 1000 // cameraFar
    data[117] = camera.fov || 50 // fov
    data[118] = ctx.size.width // resolution.x
    data[119] = ctx.size.height // resolution.y
    data[120] = ctx.size.width / ctx.size.height // aspectRatio
    data[121] = animationTime // time (respects animation pause state)
    data[122] = ctx.frame?.delta || 0.016 // deltaTime
    data[123] = ctx.frame?.frameNumber || 0 // frameNumber

    // Temporal accumulation: Bayer offset for quarter-res rendering
    // Cycles through [0,0], [1,1], [1,0], [0,1] pattern
    const frameIndex = ctx.frame?.frameNumber || 0
    const bayerOffsets: [number, number][] = [[0, 0], [1, 1], [1, 0], [0, 1]]
    const bayerOffset = bayerOffsets[frameIndex % 4]!
    data[124] = bayerOffset[0] // bayerOffset.x
    data[125] = bayerOffset[1] // bayerOffset.y
    data[126] = 0 // padding
    data[127] = 0 // padding

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    // Get PBR data for roughness (WebGL uses 'pbr-face' source via UniformManager)
    const pbr = ctx.frame?.stores?.['pbr'] as any
    // Get appearance data for SSS/Fresnel (global appearance controls)
    const appearance = ctx.frame?.stores?.['appearance'] as any
    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // === Spread Animation ===
    // Wavepacket Dispersion Animation - oscillates spread to show "breathing"
    // between localized (low spread) and delocalized (high spread)
    const spreadAnimationEnabled = schroedinger?.spreadAnimationEnabled ?? false
    const spreadAnimationSpeed = schroedinger?.spreadAnimationSpeed ?? 0.5

    // === DIRTY-FLAG OPTIMIZATION ===
    // When schroedinger settings unchanged AND appearance unchanged AND no spread animation,
    // only update the time field (4 bytes) instead of full buffer (~1KB)
    // Note: Emission/Rim parameters come from the appearance store (matching WebGL),
    // so we must also check appearanceVersion to detect those changes.
    const appearanceVersion = appearance?.appearanceVersion ?? 0
    const versionChanged = schroedingerVersion !== this.lastSchroedingerVersion
    const appearanceChanged = appearanceVersion !== this.lastSchrodingerAppearanceVersion
    if (!versionChanged && !appearanceChanged && !spreadAnimationEnabled && this.lastSchroedingerVersion !== -1) {
      // Partial buffer write: only update time field at offset 908
      // Uses pre-allocated buffer to avoid per-frame allocation
      this.timeUpdateBuffer[0] = animationTime
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        WebGPUSchrodingerRenderer.TIME_FIELD_OFFSET,
        this.timeUpdateBuffer
      )
      return
    }

    // Full buffer update needed - version changed, appearance changed, or spread animation active
    this.lastSchroedingerVersion = schroedingerVersion
    this.lastSchrodingerAppearanceVersion = appearanceVersion

    // Reuse pre-allocated staging buffer to avoid per-frame GC pressure
    // See uniforms.wgsl.ts for the exact layout with packed arrays
    const floatView = this.schroedingerFloatView
    const intView = this.schroedingerIntView
    // NOTE: floatView.fill(0) is NOT needed here because:
    // 1. All shader-read struct fields are explicitly set below with defaults
    // 2. Alignment padding bytes (offsets 728-735, 836-847, 868-879, 956-959)
    //    exist for vec3f→next-field alignment but are never read by the shader
    // 3. Float32Array is zero-initialized by JavaScript on construction
    // IMPORTANT: Any new struct field MUST have an explicit default value assignment

    // Byte offsets based on the WGSL struct layout:
    // struct SchroedingerUniforms {
    //   quantumMode: i32,              // offset 0
    //   termCount: i32,                // offset 4
    //   _padScalar0: i32,              // offset 8
    //   _padScalar1: i32,              // offset 12
    //   omega: array<vec4f, 3>,        // offset 16 (48 bytes, holds 11 values)
    //   quantum: array<vec4<i32>, 22>, // offset 64 (352 bytes, holds 88 values)
    //   coeff: array<vec4f, 8>,        // offset 416 (128 bytes, xy = complex value)
    //   energy: array<vec4f, 2>,       // offset 544 (32 bytes, holds 8 values)
    //   principalN: i32,               // offset 576
    //   azimuthalL: i32,               // offset 580
    //   magneticM: i32,                // offset 584
    //   bohrRadius: f32,               // offset 588
    //   useRealOrbitals: u32,          // offset 592
    //   hydrogenBoost: f32,            // offset 596
    //   hydrogenNDBoost: f32,          // offset 600
    //   hydrogenRadialThreshold: f32,  // offset 604
    //   extraDimN: array<vec4<i32>, 2>, // offset 608 (32 bytes)
    //   extraDimOmega: array<vec4f, 2>, // offset 640 (32 bytes)
    //   phaseAnimationEnabled: u32,    // offset 672
    //   timeScale: f32,                // offset 676
    //   ... (more scalar fields follow)
    // }

    // --- Get geometry store for dimension ---
    const geometry = ctx.frame?.stores?.['geometry'] as any
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3

    // --- Quantum mode mapping (string to int, like WebGL) ---
    const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
    const modeMap: Record<string, number> = {
      harmonicOscillator: 0,
      hydrogenOrbital: 1,
      hydrogenND: 2,
    }
    const quantumModeInt = modeMap[quantumModeStr] ?? 0

    // --- Quantum preset generation (like WebGL SchroedingerMesh.tsx lines 598-638) ---
    // Read config values from store
    const presetName = schroedinger?.presetName ?? 'custom'
    const seed = schroedinger?.seed ?? 42
    const termCount = schroedinger?.termCount ?? 1
    const maxQuantumNumber = schroedinger?.maxQuantumNumber ?? 6
    const baseFrequencySpread = schroedinger?.frequencySpread ?? 0.01

    // Compute effective spread for preset generation (like WebGL)
    let effectiveSpread = baseFrequencySpread
    if (spreadAnimationEnabled) {
      const t = animationTime * spreadAnimationSpeed
      const phase = (Math.sin(t) + 1.0) * 0.5 // 0 to 1
      effectiveSpread = 0.01 + phase * 0.44 // Range: 0.01 to 0.45

      // PERFORMANCE FIX: Quantize spread to 20 discrete steps during animation
      // This reduces preset regeneration from ~60/sec to ~20/cycle (much fewer)
      // Without this, generateQuantumPreset() is called every frame
      const SPREAD_STEPS = 20
      const spreadRange = 0.44
      const quantizedPhase = Math.round(phase * SPREAD_STEPS) / SPREAD_STEPS
      effectiveSpread = 0.01 + quantizedPhase * spreadRange
    }

    // Check if preset needs regeneration
    const currentConfig = {
      presetName,
      seed,
      termCount,
      maxQuantumNumber,
      frequencySpread: effectiveSpread,
      dimension,
    }

    // Use coarser threshold during spread animation (quantized values change in ~0.022 steps)
    // Static mode uses fine threshold for precise control
    const spreadThreshold = spreadAnimationEnabled ? 0.01 : 0.001
    const needsPresetRegen =
      !this.cachedPresetConfig ||
      this.cachedPresetConfig.presetName !== currentConfig.presetName ||
      this.cachedPresetConfig.seed !== currentConfig.seed ||
      this.cachedPresetConfig.termCount !== currentConfig.termCount ||
      this.cachedPresetConfig.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
      Math.abs(this.cachedPresetConfig.frequencySpread - currentConfig.frequencySpread) > spreadThreshold ||
      this.cachedPresetConfig.dimension !== currentConfig.dimension

    if (needsPresetRegen) {
      // Generate or get preset (like WebGL)
      let preset: QuantumPreset
      if (presetName === 'custom') {
        preset = generateQuantumPreset(
          seed,
          dimension,
          termCount,
          maxQuantumNumber,
          effectiveSpread
        )
      } else {
        preset =
          getNamedPreset(presetName, dimension) ??
          generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, effectiveSpread)
      }

      // Cache the preset and its flattened form
      this.cachedPreset = preset
      this.cachedPresetConfig = { ...currentConfig }
      this.flattenedPreset = flattenPresetForUniforms(preset)
    }

    // Use cached flattened preset data
    const presetData = this.flattenedPreset
    const presetTermCount = this.cachedPreset?.termCount ?? 1

    // --- Scalars (offset 0-15) ---
    intView[0] = quantumModeInt // quantumMode (mapped from string)
    intView[1] = presetTermCount // termCount (from generated preset)
    intView[2] = 0 // _padScalar0
    intView[3] = 0 // _padScalar1

    // --- omega array (offset 16, 3 vec4f = 12 floats, use 11) ---
    // Use generated preset omega values (already includes frequency spread from generation)
    const omegaOffset = 16 / 4 // offset in float32 units
    for (let i = 0; i < MAX_DIM; i++) {
      floatView[omegaOffset + i] = presetData?.omega[i] ?? 1.0
    }
    floatView[omegaOffset + 11] = 0.0 // padding slot

    // --- quantum array (offset 64, 22 vec4i = 88 ints) ---
    const quantumOffset = 64 / 4 // offset in int32 units
    for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
      intView[quantumOffset + i] = presetData?.quantum[i] ?? 0
    }

    // --- coeff array (offset 416, 8 vec4f, xy = complex value, zw = padding) ---
    // Note: WebGPU uses vec4f packing, WebGL uses interleaved float pairs
    const coeffOffset = 416 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      const baseIdx = coeffOffset + i * 4
      // presetData.coeff is interleaved: [re0, im0, re1, im1, ...]
      floatView[baseIdx] = presetData?.coeff[i * 2] ?? (i === 0 ? 1.0 : 0.0) // real
      floatView[baseIdx + 1] = presetData?.coeff[i * 2 + 1] ?? 0.0 // imag
      floatView[baseIdx + 2] = 0.0 // padding
      floatView[baseIdx + 3] = 0.0 // padding
    }

    // --- energy array (offset 544, 2 vec4f = 8 floats) ---
    const energyOffset = 544 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      floatView[energyOffset + i] = presetData?.energy[i] ?? 0.5
    }

    // --- Hydrogen scalar fields (offset 576-607) ---
    // Read from correct store field names (WebGL uses principalQuantumNumber, etc.)
    const principalN = schroedinger?.principalQuantumNumber ?? 2
    const azimuthalL = schroedinger?.azimuthalQuantumNumber ?? 1
    const magneticM = schroedinger?.magneticQuantumNumber ?? 0
    const bohrRadius = schroedinger?.bohrRadiusScale ?? 1.0

    // Validate quantum numbers (like WebGL SchroedingerMesh.tsx lines 518-520)
    const validN = Math.max(1, principalN)
    const validL = Math.max(0, Math.min(azimuthalL, validN - 1))
    const validM = Math.max(-validL, Math.min(magneticM, validL))

    intView[576 / 4] = validN
    intView[580 / 4] = validL
    intView[584 / 4] = validM
    floatView[588 / 4] = bohrRadius
    intView[592 / 4] = schroedinger?.useRealOrbitals ? 1 : 0

    // Compute hydrogen boost values (like WebGL SchroedingerMesh.tsx lines 529-544)
    // hydrogenBoost = 50 * n² * 3^l
    const lBoost = Math.pow(3.0, validL)
    const hydrogenBoost = 50.0 * validN * validN * lBoost
    floatView[596 / 4] = hydrogenBoost

    // hydrogenNDBoost = hydrogenBoost * (1 + (dim - 3) * 0.3)
    const dimFactor = 1.0 + (dimension - 3) * 0.3
    const hydrogenNDBoost = hydrogenBoost * dimFactor
    floatView[600 / 4] = hydrogenNDBoost

    // hydrogenRadialThreshold = 25 * n * a0 * (1 + 0.1*l)
    const hydrogenRadialThreshold = 25.0 * validN * bohrRadius * (1.0 + 0.1 * validL)
    floatView[604 / 4] = hydrogenRadialThreshold

    // --- extraDimN array (offset 608, 2 vec4i = 8 ints) ---
    // Read from correct store field name: extraDimQuantumNumbers
    const extraDimNOffset = 608 / 4
    const extraDimQuantumNumbers = schroedinger?.extraDimQuantumNumbers as number[] | undefined
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      intView[extraDimNOffset + i] = extraDimQuantumNumbers?.[i] ?? 0
    }

    // --- extraDimOmega array (offset 640, 2 vec4f = 8 floats) ---
    // Read from correct store field name, apply frequency spread like WebGL
    const extraDimOmegaOffset = 640 / 4
    const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
    const extraDimFrequencySpread = schroedinger?.extraDimFrequencySpread ?? 0
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      const baseOmega = extraDimOmega?.[i] ?? 1.0
      // Apply frequency spread like WebGL (SchroedingerMesh.tsx line 559)
      const spread = 1.0 + (i - 3.5) * extraDimFrequencySpread
      floatView[extraDimOmegaOffset + i] = baseOmega * spread
    }

    // --- More scalar fields (offset 672+) ---
    intView[672 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
    // Volume rendering parameters - defaults match DEFAULT_SCHROEDINGER_CONFIG
    floatView[676 / 4] = schroedinger?.timeScale ?? 0.8 // WebGL default: 0.8
    floatView[680 / 4] = schroedinger?.fieldScale ?? 1.0
    floatView[684 / 4] = schroedinger?.densityGain ?? 2.0 // WebGL default: 2.0
    floatView[688 / 4] = schroedinger?.powderScale ?? 1.0 // WebGL default: 1.0
    // Emission & Rim: read from appearance store (matching WebGL SchroedingerMesh.tsx lines 782-791)
    // The UI (SchroedingerAdvanced.tsx) writes to appearance.faceEmission, etc.
    floatView[692 / 4] = appearance?.faceEmission ?? 0.0
    floatView[696 / 4] = appearance?.faceEmissionThreshold ?? 0.0
    floatView[700 / 4] = appearance?.faceEmissionColorShift ?? 0.0
    intView[704 / 4] = appearance?.faceEmissionPulsing ? 1 : 0
    floatView[708 / 4] = appearance?.faceRimFalloff ?? 3.0
    floatView[712 / 4] = schroedinger?.scatteringAnisotropy ?? 0.0
    floatView[716 / 4] = pbr?.face?.roughness ?? 0.3 // WebGL uses 'pbr-face' source

    // SSS fields (read from global appearance store, not per-object store)
    intView[720 / 4] = appearance?.sssEnabled ? 1 : 0
    floatView[724 / 4] = appearance?.sssIntensity ?? 1.0 // WebGL default: 1.0

    // sssColor (vec3f needs 16-byte alignment, so it's at 736 after implicit padding)
    // Parse hex color from appearance store
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    floatView[736 / 4] = sssColor[0]
    floatView[740 / 4] = sssColor[1]
    floatView[744 / 4] = sssColor[2]
    floatView[748 / 4] = 0.0 // _pad1

    floatView[752 / 4] = appearance?.sssThickness ?? 1.0
    floatView[756 / 4] = appearance?.sssJitter ?? 0.2 // WebGL default: 0.2

    // Erosion fields
    floatView[760 / 4] = schroedinger?.erosionStrength ?? 0.0
    floatView[764 / 4] = schroedinger?.erosionScale ?? 1.0
    floatView[768 / 4] = schroedinger?.erosionTurbulence ?? 0.5 // WebGL default: 0.5
    intView[772 / 4] = schroedinger?.erosionNoiseType ?? 0

    // Curl fields
    intView[776 / 4] = schroedinger?.curlEnabled ? 1 : 0
    floatView[780 / 4] = schroedinger?.curlStrength ?? 0.3 // WebGL default: 0.3
    floatView[784 / 4] = schroedinger?.curlScale ?? 1.0
    floatView[788 / 4] = schroedinger?.curlSpeed ?? 1.0
    intView[792 / 4] = schroedinger?.curlBias ?? 0

    // Dispersion fields
    intView[796 / 4] = schroedinger?.dispersionEnabled ? 1 : 0
    floatView[800 / 4] = schroedinger?.dispersionStrength ?? 0.2 // WebGL default: 0.2
    intView[804 / 4] = schroedinger?.dispersionDirection ?? 0
    intView[808 / 4] = schroedinger?.dispersionQuality ?? 0

    // Shadow fields
    intView[812 / 4] = schroedinger?.shadowsEnabled ? 1 : 0
    floatView[816 / 4] = schroedinger?.shadowStrength ?? 1.0 // WebGL default: 1.0
    intView[820 / 4] = schroedinger?.shadowSteps ?? 4

    // AO fields
    floatView[824 / 4] = schroedinger?.aoStrength ?? 1.0 // WebGL default: 1.0
    intView[828 / 4] = schroedinger?.aoQuality ?? 4
    floatView[832 / 4] = schroedinger?.aoRadius ?? 0.5

    // aoColor (vec3f needs 16-byte alignment at offset 848 after padding)
    const aoColor = this.parseColor(schroedinger?.aoColor ?? '#000000')
    floatView[848 / 4] = aoColor[0]
    floatView[852 / 4] = aoColor[1]
    floatView[856 / 4] = aoColor[2]
    floatView[860 / 4] = 0.0 // _pad2

    // Nodal fields
    intView[864 / 4] = schroedinger?.nodalEnabled ? 1 : 0

    // nodalColor (vec3f at offset 880 after padding) - WebGL default: cyan (#00ffff)
    const nodalColor = this.parseColor(schroedinger?.nodalColor ?? '#00ffff')
    floatView[880 / 4] = nodalColor[0]
    floatView[884 / 4] = nodalColor[1]
    floatView[888 / 4] = nodalColor[2]
    floatView[892 / 4] = schroedinger?.nodalStrength ?? 1.0 // WebGL default: 1.0

    // More fields
    intView[896 / 4] = schroedinger?.energyColorEnabled ? 1 : 0
    intView[900 / 4] = schroedinger?.shimmerEnabled ? 1 : 0
    floatView[904 / 4] = schroedinger?.shimmerStrength ?? 0.5 // WebGL default: 0.5
    floatView[908 / 4] = animationTime // time (respects animation pause state)
    intView[912 / 4] = schroedinger?.isoEnabled ? 1 : 0
    floatView[916 / 4] = schroedinger?.isoThreshold ?? -3.0 // WebGL default: -3.0
    // HQ mode (quality >= 0.75) uses 64 samples, fast mode uses 32
    const performance = ctx.frame?.stores?.['performance'] as any
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const fastMode = qualityMultiplier < 0.75
    const defaultSampleCount = fastMode ? 32 : 64
    intView[920 / 4] = schroedinger?.sampleCount ?? defaultSampleCount

    // Phase shift fields
    intView[924 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
    floatView[928 / 4] = schroedinger?.phaseTheta ?? 0.0
    floatView[932 / 4] = schroedinger?.phasePhi ?? 0.0
    floatView[936 / 4] = 0.0 // _pad3

    // Color algorithm system (offset 940+)
    // Use canonical mapping shared with WebGL (palette/types.ts COLOR_ALGORITHM_TO_INT)
    const colorAlgorithmMap: Record<string, number> = {
      monochromatic: 0,
      analogous: 1,
      cosine: 2,
      normal: 3,
      distance: 4,
      lch: 5,
      multiSource: 6,
      radial: 7,
      phase: 8,
      mixed: 9,
      blackbody: 10,
      accretionGradient: 11,
      gravitationalRedshift: 12,
      dimension: 13,
    }
    const colorAlgorithm = colorAlgorithmMap[appearance?.colorAlgorithm ?? 'mixed'] ?? 9
    intView[940 / 4] = colorAlgorithm
    floatView[944 / 4] = appearance?.distribution?.power ?? 1.0
    floatView[948 / 4] = appearance?.distribution?.cycles ?? 1.0
    floatView[952 / 4] = appearance?.distribution?.offset ?? 0.0

    // Cosine palette coefficients (offset 960-1024)
    // Note: distOffset ends at byte 956, but vec4f requires 16-byte alignment
    // so there's 4 bytes of implicit padding before cosineA at offset 960
    const cosineCoeffs = appearance?.cosineCoefficients ?? {
      a: [0.5, 0.5, 0.5],
      b: [0.5, 0.5, 0.5],
      c: [1.0, 1.0, 1.0],
      d: [0.0, 0.33, 0.67],
    }
    // cosineA (vec4f at offset 960 after alignment padding)
    floatView[960 / 4] = cosineCoeffs.a?.[0] ?? 0.5
    floatView[964 / 4] = cosineCoeffs.a?.[1] ?? 0.5
    floatView[968 / 4] = cosineCoeffs.a?.[2] ?? 0.5
    floatView[972 / 4] = 0.0 // w unused
    // cosineB (vec4f at offset 976)
    floatView[976 / 4] = cosineCoeffs.b?.[0] ?? 0.5
    floatView[980 / 4] = cosineCoeffs.b?.[1] ?? 0.5
    floatView[984 / 4] = cosineCoeffs.b?.[2] ?? 0.5
    floatView[988 / 4] = 0.0 // w unused
    // cosineC (vec4f at offset 992)
    floatView[992 / 4] = cosineCoeffs.c?.[0] ?? 1.0
    floatView[996 / 4] = cosineCoeffs.c?.[1] ?? 1.0
    floatView[1000 / 4] = cosineCoeffs.c?.[2] ?? 1.0
    floatView[1004 / 4] = 0.0 // w unused
    // cosineD (vec4f at offset 1008)
    floatView[1008 / 4] = cosineCoeffs.d?.[0] ?? 0.0
    floatView[1012 / 4] = cosineCoeffs.d?.[1] ?? 0.33
    floatView[1016 / 4] = cosineCoeffs.d?.[2] ?? 0.67
    floatView[1020 / 4] = 0.0 // w unused

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, floatView)
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger
    const geometry = ctx.frame?.stores?.['geometry'] as any
    const animation = ctx.frame?.stores?.['animation'] as any
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Get dimension from geometry store
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 4

    // Slice animation settings
    const sliceAnimationEnabled = schroedinger?.sliceAnimationEnabled ?? false
    const sliceSpeed = schroedinger?.sliceSpeed ?? 0.02
    const sliceAmplitude = schroedinger?.sliceAmplitude ?? 0.3
    const parameterValues = schroedinger?.parameterValues as number[] | undefined

    // BasisVectors struct uses array<vec4f, 3> for each member (48 floats total)
    // Stride is 12 (not 11) because array<vec4f, 3> = 3 * 4 = 12 floats
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const STRIDE = 12
    const basisData = this.basisUniformData
    // Reset to zero for clean slate (values not set will be 0)
    basisData.fill(0)

    // Default basis vectors
    basisData[0] = 1.0 // X basis: [1, 0, 0, ...]
    basisData[STRIDE + 1] = 1.0 // Y basis: [0, 1, 0, ...]
    basisData[STRIDE * 2 + 2] = 1.0 // Z basis: [0, 0, 1, ...]

    // Override with stored basis if available
    const basisX = schroedinger?.basisX as Float32Array | undefined
    const basisY = schroedinger?.basisY as Float32Array | undefined
    const basisZ = schroedinger?.basisZ as Float32Array | undefined
    const origin = schroedinger?.origin as Float32Array | undefined

    if (basisX) {
      for (let i = 0; i < Math.min(basisX.length, MAX_DIM); i++) {
        basisData[i] = basisX[i] ?? 0
      }
    }
    if (basisY) {
      for (let i = 0; i < Math.min(basisY.length, MAX_DIM); i++) {
        basisData[STRIDE + i] = basisY[i] ?? 0
      }
    }
    if (basisZ) {
      for (let i = 0; i < Math.min(basisZ.length, MAX_DIM); i++) {
        basisData[STRIDE * 2 + i] = basisZ[i] ?? 0
      }
    }

    // Origin with slice animation support (4D+ only)
    // Like WebGL SchroedingerMesh.tsx lines 947-965
    const PHI = 1.618033988749895 // Golden ratio for phase offsets
    const originOffset = STRIDE * 3

    if (sliceAnimationEnabled && dimension > 3) {
      // Apply slice animation to dimensions >= 3
      // First 3 dimensions (x, y, z) stay at 0
      for (let i = 0; i < 3; i++) {
        basisData[originOffset + i] = origin?.[i] ?? 0
      }

      // Animate extra dimensions (4D+)
      for (let i = 3; i < Math.min(dimension, MAX_DIM); i++) {
        const extraDimIndex = i - 3
        const phase = extraDimIndex * PHI

        // Two-frequency animation for natural variation
        const t1 = accumulatedTime * sliceSpeed * 2 * Math.PI + phase
        const t2 = accumulatedTime * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5

        // Combined offset with weighted sine waves
        const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))

        // Base value from parameter values (or 0 if not available)
        const baseValue = parameterValues?.[extraDimIndex] ?? 0
        basisData[originOffset + i] = baseValue + offset
      }
    } else if (origin) {
      // No slice animation - use stored origin values directly
      for (let i = 0; i < Math.min(origin.length, MAX_DIM); i++) {
        basisData[originOffset + i] = origin[i] ?? 0
      }
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, basisData)
  }

  /**
   * Update lighting uniforms from lightingStore.
   * @param ctx
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    const data = this.lightingUniformData
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  private parseColor(hex: string): [number, number, number] {
    const rgb = parseHexColorToLinearRgb(hex, [1, 1, 1])
    return [rgb[0], rgb[1], rgb[2]]
  }

  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any

    // MaterialUniforms struct layout - WGSL vec3f has 16-byte alignment!
    // Byte offsets shown in comments (index = byte/4):
    // struct MaterialUniforms {
    //   baseColor: vec4f,        // bytes 0-15   (idx 0-3)
    //   metallic: f32,           // bytes 16-19  (idx 4)
    //   roughness: f32,          // bytes 20-23  (idx 5)
    //   reflectance: f32,        // bytes 24-27  (idx 6)
    //   ao: f32,                 // bytes 28-31  (idx 7)
    //   emissive: vec3f,         // bytes 32-43  (idx 8-10)
    //   emissiveIntensity: f32,  // bytes 44-47  (idx 11)
    //   ior: f32,                // bytes 48-51  (idx 12)
    //   transmission: f32,       // bytes 52-55  (idx 13)
    //   thickness: f32,          // bytes 56-59  (idx 14)
    //   sssEnabled: u32,         // bytes 60-63  (idx 15)
    //   sssIntensity: f32,       // bytes 64-67  (idx 16)
    //   <padding>                // bytes 68-79  (idx 17-19) - alignment gap
    //   sssColor: vec3f,         // bytes 80-91  (idx 20-22)
    //   sssThickness: f32,       // bytes 92-95  (idx 23)
    //   sssJitter: f32,          // bytes 96-99  (idx 24)
    //   fresnelEnabled: u32,     // bytes 100-103 (idx 25)
    //   fresnelIntensity: f32,   // bytes 104-107 (idx 26)
    //   <padding>                // bytes 108-111 (idx 27) - alignment gap
    //   rimColor: vec3f,         // bytes 112-123 (idx 28-30)
    //   _padding2: f32,          // bytes 124-127 (idx 31)
    //   specularIntensity: f32,  // bytes 128-131 (idx 32)
    //   <padding>                // bytes 132-143 (idx 33-35) - alignment gap
    //   specularColor: vec3f,    // bytes 144-155 (idx 36-38)
    //   <struct padding>         // bytes 156-159 (idx 39) - struct alignment
    // }
    // Total: 40 floats = 160 bytes
    const data = this.materialUniformData
    const dataView = this.materialDataView

    // baseColor: vec4f (idx 0-3) - includes faceOpacity for alpha
    const faceColor = this.parseColor(appearance?.faceColor ?? '#ffffff')
    data[0] = faceColor[0]
    data[1] = faceColor[1]
    data[2] = faceColor[2]
    data[3] = appearance?.faceOpacity ?? 1.0

    // metallic, roughness, reflectance, ao (idx 4-7)
    data[4] = pbr?.face?.metallic ?? 0.0
    data[5] = pbr?.face?.roughness ?? 0.5
    data[6] = pbr?.face?.reflectance ?? 0.5
    data[7] = 1.0 // ao (ambient occlusion factor)

    // emissive: vec3f + emissiveIntensity: f32 (idx 8-11)
    const faceEmission = appearance?.faceEmission ?? 0.0
    data[8] = faceColor[0]
    data[9] = faceColor[1]
    data[10] = faceColor[2]
    data[11] = faceEmission

    // ior, transmission, thickness (idx 12-14)
    data[12] = pbr?.face?.ior ?? 1.5
    data[13] = pbr?.face?.transmission ?? 0.0
    data[14] = pbr?.face?.thickness ?? 1.0

    // sssEnabled: u32 (idx 15)
    const sssEnabled = appearance?.sssEnabled ?? false
    dataView.setUint32(15 * 4, sssEnabled ? 1 : 0, true)

    // sssIntensity: f32 (idx 16)
    data[16] = appearance?.sssIntensity ?? 1.0

    // idx 17-19: alignment gap (vec3f requires 16-byte alignment)

    // sssColor: vec3f (idx 20-22) - aligned to byte 80
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    data[20] = sssColor[0]
    data[21] = sssColor[1]
    data[22] = sssColor[2]

    // sssThickness, sssJitter (idx 23-24)
    data[23] = appearance?.sssThickness ?? 1.0
    data[24] = appearance?.sssJitter ?? 0.2

    // fresnelEnabled: u32 (idx 25)
    const fresnelEnabled = appearance?.fresnelEnabled ?? true
    dataView.setUint32(25 * 4, fresnelEnabled ? 1 : 0, true)

    // fresnelIntensity: f32 (idx 26)
    const rimFalloff = appearance?.faceRimFalloff ?? 1.0
    data[26] = (appearance?.fresnelIntensity ?? 0.5) * rimFalloff

    // idx 27: alignment gap

    // rimColor: vec3f (idx 28-30) - aligned to byte 112
    const rimColor = this.parseColor(appearance?.edgeColor ?? '#ffffff')
    data[28] = rimColor[0]
    data[29] = rimColor[1]
    data[30] = rimColor[2]

    // _padding2 (idx 31)
    data[31] = 0.0

    // specularIntensity: f32 (idx 32)
    data[32] = pbr?.face?.specularIntensity ?? 0.8

    // idx 33-35: alignment gap

    // specularColor: vec3f (idx 36-38) - aligned to byte 144
    const specularColor = this.parseColor(pbr?.face?.specularColor ?? '#ffffff')
    data[36] = specularColor[0]
    data[37] = specularColor[1]
    data[38] = specularColor[2]

    // idx 39: struct padding

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = ctx.frame?.stores?.['performance'] as any
    const lighting = ctx.frame?.stores?.['lighting'] as any
    const environment = ctx.frame?.stores?.['environment'] as any
    // Get schroedinger store for aoEnabled (WebGL uses per-object AO toggle from schroedinger store)
    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger

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
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const data = this.qualityUniformData

    // Quality multiplier affects ray march quality
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    data[1] = 0.001 / qualityMultiplier // sdfSurfaceDistance (smaller = more precise)
    data[3] = lighting?.shadowSoftness ?? 0.5 // shadowSoftness
    data[6] = performance?.aoRadius ?? 0.5 // aoRadius
    data[7] = performance?.aoIntensity ?? 1.0 // aoIntensity
    data[9] = environment?.iblIntensity ?? 1.0 // iblIntensity
    data[10] = qualityMultiplier // qualityMultiplier

    // Use pre-allocated DataView for integer writes
    this.qualityDataView.setInt32(0 * 4, Math.floor(128 * qualityMultiplier), true) // sdfMaxIterations
    this.qualityDataView.setInt32(2 * 4, lighting?.shadowEnabled ? (lighting?.shadowQuality ?? 2) : 0, true) // shadowQuality
    // aoEnabled: Use schroedinger store's aoEnabled (WebGL uses per-object AO toggle, not global ssaoEnabled)
    this.qualityDataView.setInt32(4 * 4, schroedinger?.aoEnabled ? 1 : 0, true) // aoEnabled
    this.qualityDataView.setInt32(5 * 4, Math.floor(4 * qualityMultiplier), true) // aoSamples
    this.qualityDataView.setInt32(8 * 4, environment?.iblQuality ?? 1, true) // iblQuality
    this.qualityDataView.setInt32(11 * 4, performance?.debugMode ?? 0, true) // debugMode

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
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const data = this.iblUniformData

    data[0] = 64.0 // envMapSize (placeholder texture is 64x64)
    data[1] = environment?.iblIntensity ?? 1.0 // iblIntensity

    // Use pre-allocated DataView for integer write
    this.iblDataView.setInt32(2 * 4, environment?.iblQuality ?? 1, true) // iblQuality

    this.writeUniformBuffer(this.device, this.iblUniformBuffer, data)
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.objectBindGroup
    ) {
      return
    }

    // ============================================
    // DIRTY-FLAG OPTIMIZATION: Only update changed uniform categories
    // ============================================
    // Get store versions for dirty checking
    const appearance = ctx.frame?.stores?.['appearance'] as any
    const environment = ctx.frame?.stores?.['environment'] as any

    const appearanceVersion = appearance?.appearanceVersion ?? 0
    const iblVersion = environment?.iblVersion ?? 0

    // ALWAYS update: Camera (mouse movement) and Basis (rotation animation)
    this.updateCameraUniforms(ctx)
    this.updateBasisVectors(ctx)

    // ALWAYS update: Schroedinger uniforms contain time-dependent data (animationTime, spreadAnimation)
    // Internal preset regeneration caching uses schroedingerVersion within updateSchroedingerUniforms()
    // but the buffer write must happen each frame for animation to work
    this.updateSchroedingerUniforms(ctx)

    // ALWAYS update: Lighting (no version tracking available, cheap operation)
    this.updateLightingUniforms(ctx)

    // CONDITIONAL: Material uniforms - depends on appearance version
    if (appearanceVersion !== this.lastAppearanceVersion) {
      this.updateMaterialUniforms(ctx)
      this.lastAppearanceVersion = appearanceVersion
    }

    // ALWAYS update: Quality (cheap, needed for fast/slow toggle responsiveness)
    this.updateQualityUniforms(ctx)

    // CONDITIONAL: IBL uniforms - only when environment version changed
    if (iblVersion !== this.lastIblVersion) {
      this.updateIBLUniforms(ctx)
      this.lastIblVersion = iblVersion
    }

    // ============================================
    // DENSITY GRID COMPUTE PASS (if enabled)
    // ============================================
    // Run compute shader to pre-compute density texture before rendering
    // Store local reference before check to prevent TOCTOU race condition
    const gridPass = this.densityGridPass
    if (gridPass && this.densityGridInitialized) {
      // Get versions for dirty tracking - prevents unnecessary grid recomputation
      const extended = ctx.frame?.stores?.['extended'] as any
      const rotation = ctx.frame?.stores?.['rotation'] as any
      const schroedingerVersion = extended?.schroedingerVersion ?? 0
      const rotationVersion = rotation?.version ?? 0

      // Sync uniform data from renderer to compute pass
      // The compute pass needs the same Schroedinger and Basis uniforms
      // Pass versions to enable smart dirty tracking - only recompute when parameters change
      gridPass.updateSchroedingerUniforms(ctx.device, this.schroedingerUniformData, schroedingerVersion)
      gridPass.updateBasisUniforms(ctx.device, this.basisUniformData.buffer, rotationVersion)

      // Execute compute pass - fills the 3D density texture
      gridPass.execute(ctx)
    }

    // DIAGNOSTIC: Log key parameters once per second to help debug performance issues
    if (import.meta.env.DEV) {
      const now = Date.now()
      if (now - this.lastDiagnosticLog > 1000) {
        this.lastDiagnosticLog = now
        const extended = ctx.frame?.stores?.['extended'] as any
        const schroedinger = extended?.schroedinger
        const performance = ctx.frame?.stores?.['performance'] as any
        const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
        const sampleCount = schroedinger?.sampleCount ?? (qualityMultiplier < 0.75 ? 32 : 64)
        console.log('[WebGPU Schrödinger] Diagnostic:', {
          sampleCount,
          qualityMultiplier,
          quantumMode: schroedinger?.quantumMode ?? 'unknown',
          dimension: this.rendererConfig.dimension,
          isosurface: this.rendererConfig.isosurface,
          canvasSize: `${ctx.size.width}x${ctx.size.height}`,
          storesAvailable: Object.keys(ctx.frame?.stores ?? {}),
          schroedingerDefined: !!schroedinger,
        })
      }
    }

    // Get render targets based on mode:
    // - Isosurface: object-color + normal-buffer + depth-buffer
    // - Temporal volumetric: quarter-color + quarter-position (no depth - alpha blending only)
    // - Standard volumetric: object-color + depth-buffer
    const isTemporal = this.rendererConfig.temporal && !this.rendererConfig.isosurface

    // Color output target
    const colorView = isTemporal
      ? ctx.getWriteTarget('quarter-color')
      : ctx.getWriteTarget('object-color')

    // Depth buffer - only needed for non-temporal modes
    // Temporal mode uses alpha blending without depth testing since all targets are quarter-res
    const depthView = isTemporal ? null : ctx.getWriteTarget('depth-buffer')

    if (!colorView) {
      console.warn('[WebGPU Schrödinger] Missing color render target')
      return
    }

    if (!isTemporal && !depthView) {
      console.warn('[WebGPU Schrödinger] Missing depth buffer for non-temporal mode')
      return
    }

    // Secondary MRT output based on mode
    // - Isosurface: normal buffer
    // - Temporal volumetric: world position buffer
    const secondaryView = this.rendererConfig.isosurface
      ? ctx.getWriteTarget('normal-buffer')
      : isTemporal
        ? ctx.getWriteTarget('quarter-position')
        : null

    if (this.rendererConfig.isosurface && !secondaryView) {
      console.warn('[WebGPU Schrödinger] Isosurface mode requires normal-buffer target')
      return
    }

    if (isTemporal && !secondaryView) {
      console.warn('[WebGPU Schrödinger] Temporal mode requires quarter-position target')
      return
    }

    // Build color attachments - MRT for isosurface/temporal, single for standard volumetric
    // Use alpha=0 clear value for proper compositing (transparent where nothing rendered)
    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: colorView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ]

    // Add secondary MRT attachment based on mode
    if (this.rendererConfig.isosurface && secondaryView) {
      // Isosurface mode: normal buffer
      colorAttachments.push({
        view: secondaryView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: { r: 0.5, g: 0.5, b: 1, a: 0 }, // Default normal pointing up (+Z)
      })
    } else if (isTemporal && secondaryView) {
      // Temporal volumetric mode: world position buffer
      colorAttachments.push({
        view: secondaryView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: { r: 0, g: 0, b: 0, a: -1 }, // Invalid position (a < 0 means no hit)
      })
    }

    // Begin render pass - depth buffer only for non-temporal modes
    // Temporal mode renders to quarter-res without depth testing (alpha blending handles compositing)
    const passEncoder = ctx.beginRenderPass({
      label: 'schroedinger-render',
      colorAttachments,
      depthStencilAttachment: depthView
        ? {
            view: depthView,
            depthLoadOp: 'clear' as const,
            depthStoreOp: 'store' as const,
            depthClearValue: 1.0,
          }
        : undefined,
    })

    // Set pipeline and bind groups - consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Schroedinger + Basis)
    // Group 3: IBL (if enabled)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)
    if (this.rendererConfig.ibl && this.iblBindGroup) {
      passEncoder.setBindGroup(3, this.iblBindGroup)
    }

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16' as const)
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()

    // Update draw statistics (fullscreen quad = 2 triangles)
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
    // Dispose density grid compute pass
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false

    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()
    this.iblUniformBuffer?.destroy()
    this.envMapTexture?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.schroedingerUniformBuffer = null
    this.basisUniformBuffer = null
    this.iblUniformBuffer = null
    this.iblBindGroup = null
    this.iblBindGroupLayout = null
    this.envMapTexture = null
    this.envMapSampler = null

    super.dispose()
  }
}
