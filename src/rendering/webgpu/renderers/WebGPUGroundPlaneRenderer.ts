/**
 * WebGPU Ground Plane Renderer
 *
 * Renders ground plane walls (floor, back, left, right, top) with procedural grid lines.
 * Port of WebGL GroundPlane.tsx to WebGPU.
 *
 * Each active wall is drawn as a separate quad with its own model matrix,
 * using dynamic uniform buffer offsets for efficient per-wall data.
 *
 * Bind group layout:
 *   Group 0: Vertex uniforms (dynamic offset per wall)
 *   Group 1: Material (binding 0) + Grid (binding 1) — consolidated
 *   Group 2: Lighting
 *   Group 3: IBL (uniform + env map texture + sampler) — optional
 *
 * @module rendering/webgpu/renderers/WebGPUGroundPlaneRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import {
  composeGroundPlaneVertexShader,
  composeGroundPlaneFragmentShader,
  type GroundPlaneShaderConfig,
} from '../shaders/groundplane'
import {
  parseHexColorToLinearRgb,
  parseHexColorToSrgbRgb,
  srgbToLinearChannel,
} from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of walls that can be rendered */
const MAX_WALLS = 5

/**
 * Per-wall vertex uniform size in bytes.
 * Must be a multiple of minUniformBufferOffsetAlignment (typically 256).
 * Contents: modelMatrix(64) + viewMatrix(64) + projectionMatrix(64) + normalMatrix(48) + cameraPosition(12) + pad(4) = 256 bytes
 */
const VERTEX_UNIFORM_SIZE = 256

/** Default base distance from origin for wall placement (matches WebGL calculateWallDistance default) */
const DEFAULT_BASE_DISTANCE = 2.0

// ============================================================================
// Wall Configuration
// ============================================================================

type WallPosition = 'floor' | 'back' | 'left' | 'right' | 'top'

/**
 * Compute the model matrix (column-major, 16 floats) and normal matrix (3×3 padded to 12 floats)
 * for a wall at the given distance from origin.
 *
 * Geometry is an XY plane with normal +Z (matching Three.js PlaneGeometry).
 * Each wall type applies a rotation to orient the plane, then a translation to position it.
 *
 * Rotation logic matches WebGL GroundPlane.tsx getWallConfig() surfaceRotation values.
 *
 * @param wall - Wall position type
 * @param distance - Distance from origin to wall
 * @param modelMatrix - Output array for 16-float column-major model matrix
 * @param normalMatrix - Output array for 12-float padded 3×3 normal matrix
 */
function computeWallMatrices(
  wall: WallPosition,
  distance: number,
  modelMatrix: Float32Array,
  normalMatrix: Float32Array
): void {
  // Start with identity
  modelMatrix.fill(0)
  normalMatrix.fill(0)

  // Shortcuts for sin/cos of 90°
  const S90 = 1.0 // sin(π/2)
  const C90 = 0.0 // cos(π/2) ≈ 0

  switch (wall) {
    case 'floor': {
      // RotX(-π/2): XY plane → XZ plane, normal +Z → +Y
      // Then translate (0, -distance, 0)
      //
      // RotX(θ) =  [1,    0,     0  ]
      //            [0,  cosθ, -sinθ ]
      //            [0,  sinθ,  cosθ ]
      //
      // θ = -π/2: cosθ = 0, sinθ = -1
      modelMatrix[0] = 1 // col0
      modelMatrix[5] = C90 // col1.y = cos(-π/2) = 0
      modelMatrix[6] = -S90 // col1.z = sin(-π/2) = -1
      modelMatrix[9] = S90 // col2.y = -sin(-π/2) = 1
      modelMatrix[10] = C90 // col2.z = cos(-π/2) = 0
      modelMatrix[13] = -distance // translation Y
      modelMatrix[15] = 1

      // Normal matrix (same rotation, 3×3 padded to 4 floats per row)
      normalMatrix[0] = 1
      normalMatrix[5] = C90
      normalMatrix[6] = -S90
      normalMatrix[9] = S90
      normalMatrix[10] = C90
      break
    }
    case 'top': {
      // RotX(+π/2): XY plane → XZ plane, normal +Z → -Y
      // Then translate (0, +distance, 0)
      // θ = π/2: cosθ = 0, sinθ = 1
      modelMatrix[0] = 1
      modelMatrix[5] = C90 // cos(π/2) = 0
      modelMatrix[6] = S90 // sin(π/2) = 1
      modelMatrix[9] = -S90 // -sin(π/2) = -1
      modelMatrix[10] = C90 // cos(π/2) = 0
      modelMatrix[13] = distance // translation Y
      modelMatrix[15] = 1

      normalMatrix[0] = 1
      normalMatrix[5] = C90
      normalMatrix[6] = S90
      normalMatrix[9] = -S90
      normalMatrix[10] = C90
      break
    }
    case 'back': {
      // No rotation (already XY plane, normal +Z)
      // Translate (0, 0, -distance)
      modelMatrix[0] = 1
      modelMatrix[5] = 1
      modelMatrix[10] = 1
      modelMatrix[14] = -distance // translation Z
      modelMatrix[15] = 1

      normalMatrix[0] = 1
      normalMatrix[5] = 1
      normalMatrix[10] = 1
      break
    }
    case 'left': {
      // RotY(+π/2): XY plane → YZ plane, normal +Z → +X
      // Then translate (-distance, 0, 0)
      // RotY(θ) =  [cosθ,  0, sinθ]
      //            [0,     1, 0    ]
      //            [-sinθ, 0, cosθ ]
      // θ = π/2: cosθ = 0, sinθ = 1
      // col0: [cos, 0, -sin] = [0, 0, -1]
      // col1: [0, 1, 0]
      // col2: [sin, 0, cos] = [1, 0, 0]
      modelMatrix[0] = C90 // col0.x
      modelMatrix[2] = -S90 // col0.z
      modelMatrix[5] = 1 // col1.y
      modelMatrix[8] = S90 // col2.x
      modelMatrix[10] = C90 // col2.z
      modelMatrix[12] = -distance // translation X
      modelMatrix[15] = 1

      normalMatrix[0] = C90
      normalMatrix[2] = -S90
      normalMatrix[5] = 1
      normalMatrix[8] = S90
      normalMatrix[10] = C90
      break
    }
    case 'right': {
      // RotY(-π/2): XY plane → YZ plane, normal +Z → -X
      // Then translate (+distance, 0, 0)
      // θ = -π/2: cosθ = 0, sinθ = -1
      // col0: [cos, 0, -sin] = [0, 0, 1]
      // col1: [0, 1, 0]
      // col2: [sin, 0, cos] = [-1, 0, 0]
      modelMatrix[0] = C90
      modelMatrix[2] = S90
      modelMatrix[5] = 1
      modelMatrix[8] = -S90
      modelMatrix[10] = C90
      modelMatrix[12] = distance // translation X
      modelMatrix[15] = 1

      normalMatrix[0] = C90
      normalMatrix[2] = S90
      normalMatrix[5] = 1
      normalMatrix[8] = -S90
      normalMatrix[10] = C90
      break
    }
  }
}

// ============================================================================
// Renderer
// ============================================================================

/**
 * Ground plane renderer configuration.
 */
export interface GroundPlaneRendererConfig {
  /** Enable shadow map sampling */
  shadows?: boolean
  /** Plane size (half-extent in world units) */
  size?: number
  /** Enable image-based lighting / environment reflections */
  ibl?: boolean
}

/**
 * WebGPU Ground Plane Renderer.
 *
 * Renders walls (floor, back, left, right, top) with procedural grid overlay.
 * Uses PBR GGX lighting consistent with other scene objects.
 * Matches WebGL GroundPlane.tsx: one quad per active wall, each with its own model matrix.
 */
export class WebGPUGroundPlaneRenderer extends WebGPUBasePass {
  private rendererConfig: GroundPlaneRendererConfig
  private shaderConfig: GroundPlaneShaderConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind groups
  private vertexBindGroup: GPUBindGroup | null = null
  private materialGridBindGroup: GPUBindGroup | null = null // Consolidated: material + grid
  private lightingBindGroup: GPUBindGroup | null = null
  private iblBindGroup: GPUBindGroup | null = null
  private iblBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffers
  private vertexUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private gridUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private iblUniformBuffer: GPUBuffer | null = null

  // IBL textures
  private envMapTexture: GPUTexture | null = null
  private envMapSampler: GPUSampler | null = null

  // Geometry buffers
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null
  private indexCount = 0

  // Plane size
  private planeSize: number

  // Scratch buffers (avoid per-frame allocation)
  private readonly wallModelMatrix = new Float32Array(16)
  private readonly wallNormalMatrix = new Float32Array(12) // 3×3 padded to 4 per row
  private readonly wallVertexData = new Float32Array(64) // 256 bytes = 64 floats

  constructor(config?: GroundPlaneRendererConfig) {
    super({
      id: 'ground-plane',
      priority: 90, // Render before main objects
      inputs: [],
      outputs: [
        { resourceId: 'scene-render', access: 'write' as const, binding: 0 },
        { resourceId: 'normal-buffer', access: 'write' as const, binding: 1 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 2 },
      ],
    })

    this.rendererConfig = {
      shadows: false,
      size: 100,
      ibl: true,
      ...config,
    }

    this.planeSize = this.rendererConfig.size ?? 100

    this.shaderConfig = {
      shadows: this.rendererConfig.shadows,
      ibl: this.rendererConfig.ibl,
    }
  }

  /**
   * Create the rendering pipeline.
   * @param ctx - WebGPU setup context with device and format
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
    const enableIBL = this.rendererConfig.ibl ?? true

    // =========================================================================
    // Bind Group Layouts
    // =========================================================================

    // Group 0: Vertex uniforms — uses dynamic offset for per-wall model matrix
    const vertexBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-vertex-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' as const, hasDynamicOffset: true },
        },
      ],
    })

    // Group 1: Material + Grid (consolidated to free Group 3 for IBL)
    const materialGridBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-material-grid-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const }, // Material
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const }, // Grid
        },
      ],
    })

    // Group 2: Lighting uniforms (shared multi-light system)
    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-lighting-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 3: IBL (optional)
    const bindGroupLayouts: GPUBindGroupLayout[] = [
      vertexBindGroupLayout,
      materialGridBindGroupLayout,
      lightingBindGroupLayout,
    ]

    if (enableIBL) {
      this.iblBindGroupLayout = device.createBindGroupLayout({
        label: 'groundplane-ibl-bgl',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' as const }, // IBL uniforms
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' as const, viewDimension: '2d' as const }, // PMREM env map
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' as const },
          },
        ],
      })
      bindGroupLayouts.push(this.iblBindGroupLayout)
    }

    // =========================================================================
    // Pipeline
    // =========================================================================

    const pipelineLayout = device.createPipelineLayout({
      label: 'groundplane-pipeline-layout',
      bindGroupLayouts,
    })

    // Compile shaders
    const vertexShader = composeGroundPlaneVertexShader()
    const { wgsl: fragmentShader } = composeGroundPlaneFragmentShader(this.shaderConfig)

    const vertexModule = this.createShaderModule(device, vertexShader, 'groundplane-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'groundplane-fragment')

    // Create render pipeline with depth bias for z-fighting prevention
    // Matches WebGL polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    this.renderPipeline = device.createRenderPipeline({
      label: 'groundplane-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          // Vertex attributes: position (3), normal (3), uv (2)
          {
            arrayStride: 32, // 8 floats × 4 bytes
            stepMode: 'vertex' as const,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' as const }, // normal
              { shaderLocation: 2, offset: 24, format: 'float32x2' as const }, // uv
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: 'none' as const, // Double-sided plane
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
        // Depth bias to prevent z-fighting (matches WebGL polygonOffset)
        depthBias: 1,
        depthBiasSlopeScale: 1,
        depthBiasClamp: 0,
      },
    })

    // =========================================================================
    // Uniform Buffers
    // =========================================================================

    // Vertex uniforms: 256 bytes per wall × MAX_WALLS = 1280 bytes (for dynamic offsets)
    this.vertexUniformBuffer = this.createUniformBuffer(
      device,
      VERTEX_UNIFORM_SIZE * MAX_WALLS,
      'groundplane-vertex-uniforms'
    )

    // GroundPlaneUniforms: color(12) + opacity(4) + metallic(4) + roughness(4) + specularIntensity(4) + pad(4) + specularColor(12) + pad2(4) + cameraPosition(12) + pad3(4) = 64 bytes
    this.materialUniformBuffer = this.createUniformBuffer(
      device,
      64,
      'groundplane-material-uniforms'
    )

    // GridUniforms: showGrid(4) + gridSpacing(4) + sectionSpacing(4) + gridThickness(4) + sectionThickness(4) + gridFadeDistance(4) + gridFadeStrength(4) + pad(4) + gridColor(12) + pad2(4) + sectionColor(12) + pad3(4) = 64 bytes
    this.gridUniformBuffer = this.createUniformBuffer(device, 64, 'groundplane-grid-uniforms')

    // LightingUniforms: 8×LightData(512) + vec3f+f32(16) + i32+pad+vec3f(32) = 560 bytes → 576 aligned
    this.lightingUniformBuffer = this.createUniformBuffer(
      device,
      576,
      'groundplane-lighting-uniforms'
    )

    // =========================================================================
    // Bind Groups
    // =========================================================================

    // Group 0: Vertex (dynamic offset)
    this.vertexBindGroup = device.createBindGroup({
      label: 'groundplane-vertex-bg',
      layout: vertexBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.vertexUniformBuffer,
            offset: 0,
            size: VERTEX_UNIFORM_SIZE,
          },
        },
      ],
    })

    // Group 1: Material + Grid (consolidated)
    this.materialGridBindGroup = device.createBindGroup({
      label: 'groundplane-material-grid-bg',
      layout: materialGridBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.materialUniformBuffer } },
        { binding: 1, resource: { buffer: this.gridUniformBuffer } },
      ],
    })

    // Group 2: Lighting
    this.lightingBindGroup = device.createBindGroup({
      label: 'groundplane-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    // Group 3: IBL (optional)
    if (enableIBL && this.iblBindGroupLayout) {
      // IBLUniforms: envMapSize(4) + iblIntensity(4) + iblQuality(4) + padding(4) = 16 bytes
      this.iblUniformBuffer = this.createUniformBuffer(device, 16, 'groundplane-ibl-uniforms')

      // Placeholder 2D PMREM texture (will be replaced with real env map later)
      this.envMapTexture = device.createTexture({
        label: 'groundplane-env-placeholder-pmrem',
        size: { width: 64, height: 64 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '2d',
      })

      this.envMapSampler = device.createSampler({
        label: 'groundplane-env-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      this.iblBindGroup = device.createBindGroup({
        label: 'groundplane-ibl-bg',
        layout: this.iblBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.iblUniformBuffer } },
          { binding: 1, resource: this.envMapTexture.createView({ dimension: '2d' }) },
          { binding: 2, resource: this.envMapSampler },
        ],
      })
    }

    // Create plane geometry — XY plane matching Three.js PlaneGeometry
    this.createPlaneGeometry(device, this.planeSize)
  }

  /**
   * Create plane geometry in the XY plane with normal +Z.
   * Matches Three.js PlaneGeometry default orientation.
   * The model matrix rotates/translates for each wall position.
   *
   * @param device - GPU device for buffer creation
   * @param size - Half-extent of the plane in world units
   */
  private createPlaneGeometry(device: GPUDevice, size: number): void {
    // 4 corners of a quad in the XY plane at z=0 with normal +Z
    // Vertex format: position(3) + normal(3) + uv(2) = 8 floats per vertex
    const vertices = new Float32Array([
      // Position              Normal         UV
      -size,
      -size,
      0,
      0,
      0,
      1,
      0,
      0, // bottom-left
      size,
      -size,
      0,
      0,
      0,
      1,
      1,
      0, // bottom-right
      size,
      size,
      0,
      0,
      0,
      1,
      1,
      1, // top-right
      -size,
      size,
      0,
      0,
      0,
      1,
      0,
      1, // top-left
    ])

    // Two triangles forming a quad
    const indices = new Uint16Array([
      0,
      1,
      2, // First triangle
      0,
      2,
      3, // Second triangle
    ])

    // Create vertex buffer
    this.vertexBuffer = device.createBuffer({
      label: 'groundplane-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      vertices.buffer as ArrayBuffer,
      vertices.byteOffset,
      vertices.byteLength
    )

    // Create index buffer
    this.indexBuffer = device.createBuffer({
      label: 'groundplane-indices',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      this.indexBuffer,
      0,
      indices.buffer as ArrayBuffer,
      indices.byteOffset,
      indices.byteLength
    )

    this.indexCount = indices.length
  }

  /**
   * Set the plane size.
   * @param size - New half-extent of the plane in world units
   */
  setSize(size: number): void {
    if (size !== this.planeSize && this.device) {
      this.planeSize = size
      this.createPlaneGeometry(this.device, size)
    }
  }

  /**
   * Write vertex uniforms for a single wall at the given buffer offset.
   *
   * @param wall - Wall position type
   * @param distance - Distance from origin
   * @param camera - Camera data from stores
   * @param bufferOffset - Byte offset into the vertex uniform buffer
   */
  private writeWallVertexUniforms(
    wall: WallPosition,
    distance: number,
    camera: {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number } | number[]
    },
    bufferOffset: number
  ): void {
    if (!this.device || !this.vertexUniformBuffer) return

    const data = this.wallVertexData
    data.fill(0)

    // Compute model matrix and normal matrix for this wall
    computeWallMatrices(wall, distance, this.wallModelMatrix, this.wallNormalMatrix)

    // Model matrix (16 floats at offset 0)
    data.set(this.wallModelMatrix, 0)

    // View matrix (16 floats at offset 16)
    if (camera.viewMatrix) {
      for (let i = 0; i < 16 && i < camera.viewMatrix.elements.length; i++) {
        data[16 + i] = camera.viewMatrix.elements[i] ?? 0
      }
    }

    // Projection matrix (16 floats at offset 32)
    if (camera.projectionMatrix) {
      for (let i = 0; i < 16 && i < camera.projectionMatrix.elements.length; i++) {
        data[32 + i] = camera.projectionMatrix.elements[i] ?? 0
      }
    }

    // Normal matrix (mat3×3 padded to 12 floats at offset 48)
    data.set(this.wallNormalMatrix, 48)

    // Camera position (vec3 at offset 60)
    if (camera.position) {
      if (Array.isArray(camera.position)) {
        data[60] = camera.position[0] ?? 0
        data[61] = camera.position[1] ?? 0
        data[62] = camera.position[2] ?? 0
      } else {
        data[60] = camera.position.x
        data[61] = camera.position.y
        data[62] = camera.position.z
      }
    }
    data[63] = 0 // padding

    this.writeUniformBuffer(this.device, this.vertexUniformBuffer, data, bufferOffset)
  }

  /**
   * Update material uniforms from stores.
   * @param ctx - WebGPU render context with PBR and ground store data
   */
  private updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    // Get ground plane settings from stores
    const ground = ctx.frame?.stores?.['environment'] as {
      groundPlaneColor?: string
    }
    const pbr = ctx.frame?.stores?.['pbr'] as {
      ground?: {
        roughness?: number
        metallic?: number
        specularIntensity?: number
        specularColor?: string
      }
    }
    const camera = ctx.frame?.stores?.['camera'] as {
      position?: { x: number; y: number; z: number }
    }

    const groundColor = parseHexColorToLinearRgb(ground?.groundPlaneColor ?? '#ead6e8', [1, 1, 1])
    const specularColor = parseHexColorToLinearRgb(
      pbr?.ground?.specularColor ?? '#ffffff',
      [1, 1, 1]
    )

    // Pack material uniforms
    const data = new Float32Array(16) // 64 bytes

    // color (vec3) + opacity (f32)
    data[0] = groundColor[0]
    data[1] = groundColor[1]
    data[2] = groundColor[2]
    data[3] = 1.0 // opacity

    // metallic + roughness + specularIntensity + pad
    data[4] = pbr?.ground?.metallic ?? 0.6
    data[5] = pbr?.ground?.roughness ?? 0.2
    data[6] = pbr?.ground?.specularIntensity ?? 0.8
    data[7] = 0 // padding

    // specularColor (vec3) + pad
    data[8] = specularColor[0]
    data[9] = specularColor[1]
    data[10] = specularColor[2]
    data[11] = 0 // padding

    // cameraPosition (vec3) + pad
    data[12] = camera?.position?.x ?? 0
    data[13] = camera?.position?.y ?? 10
    data[14] = camera?.position?.z ?? 20
    data[15] = 0 // padding

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  /**
   * Update grid uniforms from stores.
   * @param ctx - WebGPU render context with ground grid store data
   */
  private updateGridUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.gridUniformBuffer) return

    // Get ground grid settings from stores
    const ground = ctx.frame?.stores?.['environment'] as {
      showGroundGrid?: boolean
      groundGridColor?: string
      groundGridSpacing?: number
    }

    const gridColor = parseHexColorToLinearRgb(ground?.groundGridColor ?? '#dbdcdb', [1, 1, 1])
    // Section color: lighten grid color by ~15% in sRGB space (matches WebGL lightenColor(hex, 15))
    const gridSrgb = parseHexColorToSrgbRgb(ground?.groundGridColor ?? '#dbdcdb')
    const lightenedSrgb: [number, number, number] = gridSrgb
      ? [
          Math.min(1, gridSrgb[0] + 0.15),
          Math.min(1, gridSrgb[1] + 0.15),
          Math.min(1, gridSrgb[2] + 0.15),
        ]
      : [0.65, 0.65, 0.65]
    const sectionColor: [number, number, number] = [
      srgbToLinearChannel(lightenedSrgb[0]),
      srgbToLinearChannel(lightenedSrgb[1]),
      srgbToLinearChannel(lightenedSrgb[2]),
    ]

    // Pack grid uniforms
    const data = new Float32Array(16) // 64 bytes

    // showGrid (u32 as f32 for alignment) + gridSpacing + sectionSpacing + gridThickness
    data[0] = (ground?.showGroundGrid ?? true) ? 1 : 0
    data[1] = ground?.groundGridSpacing ?? 5.0
    data[2] = (ground?.groundGridSpacing ?? 5.0) * 5 // Section every 5 grid lines
    data[3] = 1.5 // gridThickness

    // sectionThickness + gridFadeDistance + gridFadeStrength + pad
    data[4] = 2.0 // sectionThickness
    data[5] = 100.0 // gridFadeDistance
    data[6] = 2.0 // gridFadeStrength
    data[7] = 0 // padding

    // gridColor (vec3) + pad
    data[8] = gridColor[0]
    data[9] = gridColor[1]
    data[10] = gridColor[2]
    data[11] = 0 // padding

    // sectionColor (vec3) + pad
    data[12] = sectionColor[0]
    data[13] = sectionColor[1]
    data[14] = sectionColor[2]
    data[15] = 0 // padding

    this.writeUniformBuffer(this.device, this.gridUniformBuffer, data)
  }

  /**
   * Update lighting uniforms from lighting store.
   * Matches the shared WebGPU LightingUniforms layout.
   * @param ctx
   */
  private updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as Record<string, unknown>
    if (!lighting) return

    const data = new Float32Array(144)
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  /**
   * Update IBL uniforms from environment store.
   * Matches Mandelbulb renderer's IBLUniforms layout.
   * @param ctx
   */
  private updateIBLUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.iblUniformBuffer || !this.rendererConfig.ibl) return

    const environment = ctx.frame?.stores?.['environment'] as {
      envMapSize?: number
      iblIntensity?: number
      iblQuality?: string // 'off' | 'low' | 'high'
    }

    // IBLUniforms struct layout:
    // envMapSize: f32 (0)
    // iblIntensity: f32 (1)
    // iblQuality: i32 (2) — 0=off, 1=low, 2=high
    // _padding: f32 (3)
    const data = new Float32Array(4)
    data[0] = environment?.envMapSize ?? 256.0
    data[1] = environment?.iblIntensity ?? 1.0

    // Convert string quality to integer (matches WebGPUTubeWireframeRenderer pattern)
    const qualityStr = environment?.iblQuality
    const quality = qualityStr === 'high' ? 2 : qualityStr === 'low' ? 1 : 0
    const dataView = new DataView(data.buffer)
    dataView.setInt32(2 * 4, quality, true)

    this.writeUniformBuffer(this.device, this.iblUniformBuffer, data)
  }

  /**
   * Execute the render pass.
   *
   * Iterates over active walls, writes per-wall vertex uniforms into the dynamic
   * offset buffer, then draws each wall with its own bind group offset.
   *
   * @param ctx - WebGPU render context with encoder and render targets
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.vertexBindGroup ||
      !this.materialGridBindGroup ||
      !this.lightingBindGroup
    ) {
      return
    }

    // Check if ground plane is enabled (any walls active)
    const ground = ctx.frame?.stores?.['environment'] as {
      activeWalls?: string[]
      groundPlaneOffset?: number
      _computedBoundingRadius?: number
    }
    if (!ground?.activeWalls || ground.activeWalls.length === 0) {
      return // No walls active, skip rendering
    }

    const activeWalls = ground.activeWalls as WallPosition[]

    // Compute wall distance: boundingRadius + user offset
    // Matches WebGL calculateWallDistance(vertices, offset, minBoundingRadius)
    const boundingRadius = ground._computedBoundingRadius ?? 0
    const distance =
      boundingRadius > 0
        ? boundingRadius + (ground.groundPlaneOffset ?? 0.5)
        : DEFAULT_BASE_DISTANCE + (ground.groundPlaneOffset ?? 0.5)

    // Get camera data once for all walls
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number }
    }
    if (!camera) return

    // Write vertex uniforms for each active wall at different buffer offsets
    const wallCount = Math.min(activeWalls.length, MAX_WALLS)
    for (let i = 0; i < wallCount; i++) {
      this.writeWallVertexUniforms(activeWalls[i]!, distance, camera, i * VERTEX_UNIFORM_SIZE)
    }

    // Update shared uniforms (material, grid, lighting — same for all walls)
    this.updateMaterialUniforms(ctx)
    this.updateGridUniforms(ctx)
    this.updateLightingUniforms(ctx)
    this.updateIBLUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('scene-render')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !normalView || !depthView) return

    // Begin render pass (MRT: color + normal buffer)
    const passEncoder = ctx.beginRenderPass({
      label: 'groundplane-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'load' as const, // Load existing content (don't clear)
          storeOp: 'store' as const,
        },
        {
          view: normalView,
          loadOp: 'load' as const, // Load existing normals from previous passes
          storeOp: 'store' as const,
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: 'load' as const, // Load existing depth
        depthStoreOp: 'store' as const,
      },
    })

    passEncoder.setPipeline(this.renderPipeline)
    // Group 1: Material + Grid (consolidated)
    passEncoder.setBindGroup(1, this.materialGridBindGroup)
    // Group 2: Lighting
    passEncoder.setBindGroup(2, this.lightingBindGroup)
    // Group 3: IBL (optional)
    if (this.rendererConfig.ibl && this.iblBindGroup) {
      passEncoder.setBindGroup(3, this.iblBindGroup)
    }

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16' as const)

    // Draw each active wall with its own vertex uniform offset
    for (let i = 0; i < wallCount; i++) {
      // Dynamic offset selects this wall's model/view/proj matrices in the buffer
      passEncoder.setBindGroup(0, this.vertexBindGroup, [i * VERTEX_UNIFORM_SIZE])
      passEncoder.drawIndexed(this.indexCount)
    }

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.vertexBindGroup = null
    this.materialGridBindGroup = null
    this.lightingBindGroup = null
    this.iblBindGroup = null
    this.iblBindGroupLayout = null

    this.vertexUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.gridUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.iblUniformBuffer?.destroy()
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.envMapTexture?.destroy()

    this.vertexUniformBuffer = null
    this.materialUniformBuffer = null
    this.gridUniformBuffer = null
    this.lightingUniformBuffer = null
    this.iblUniformBuffer = null
    this.vertexBuffer = null
    this.indexBuffer = null
    this.envMapTexture = null
    this.envMapSampler = null

    super.dispose()
  }
}
