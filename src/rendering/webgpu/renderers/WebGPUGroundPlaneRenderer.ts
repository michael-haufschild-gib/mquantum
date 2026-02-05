/**
 * WebGPU Ground Plane Renderer
 *
 * Renders a large ground plane at y=0 with procedural grid lines.
 * Port of WebGL GroundPlane to WebGPU.
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
import { parseHexColorToLinearRgb, parseHexColorToSrgbRgb, srgbToLinearChannel } from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'

/**
 * Ground plane renderer configuration.
 */
export interface GroundPlaneRendererConfig {
  /** Enable shadow map sampling */
  shadows?: boolean
  /** Plane size (half-extent in world units) */
  size?: number
}

/**
 * WebGPU Ground Plane Renderer.
 *
 * Renders a large ground plane with procedural grid overlay.
 * Uses PBR GGX lighting consistent with other scene objects.
 */
export class WebGPUGroundPlaneRenderer extends WebGPUBasePass {
  private rendererConfig: GroundPlaneRendererConfig
  private shaderConfig: GroundPlaneShaderConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind groups
  private vertexBindGroup: GPUBindGroup | null = null
  private materialBindGroup: GPUBindGroup | null = null
  private gridBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null

  // Uniform buffers
  private vertexUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private gridUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null

  // Geometry buffers
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null
  private indexCount = 0

  // Plane size
  private planeSize: number

  constructor(config?: GroundPlaneRendererConfig) {
    super({
      id: 'ground-plane',
      priority: 90, // Render before main objects
      inputs: [],
      outputs: [
        { resourceId: 'scene-render', access: 'write' as const, binding: 0 },
        { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
      ],
    })

    this.rendererConfig = {
      shadows: false,
      size: 100,
      ...config,
    }

    this.planeSize = this.rendererConfig.size ?? 100

    this.shaderConfig = {
      shadows: this.rendererConfig.shadows,
    }
  }

  /**
   * Create the rendering pipeline.
   * @param ctx - WebGPU setup context with device and format
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layouts
    // Group 0: Vertex uniforms (model, view, projection matrices)
    const vertexBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-vertex-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 1: Material uniforms (PBR properties)
    const materialBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-material-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 2: Grid uniforms
    const gridBindGroupLayout = device.createBindGroupLayout({
      label: 'groundplane-grid-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 3: Lighting uniforms (shared multi-light system)
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

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'groundplane-pipeline-layout',
      bindGroupLayouts: [
        vertexBindGroupLayout,
        materialBindGroupLayout,
        gridBindGroupLayout,
        lightingBindGroupLayout,
      ],
    })

    // Compile shaders
    const vertexShader = composeGroundPlaneVertexShader()
    const { wgsl: fragmentShader } = composeGroundPlaneFragmentShader(this.shaderConfig)

    const vertexModule = this.createShaderModule(device, vertexShader, 'groundplane-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'groundplane-fragment')

    // Create render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: 'groundplane-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          // Vertex attributes: position (3), normal (3), uv (2)
          {
            arrayStride: 32, // 8 floats * 4 bytes
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
        targets: [{ format: 'rgba16float' }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: 'none' as const, // Double-sided plane
      },
      depthStencil: {
        // Must match render graph depth buffer format
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    // VertexUniforms: modelMatrix (64) + viewMatrix (64) + projectionMatrix (64) + normalMatrix (48) + cameraPosition (12) + pad (4) = 256 bytes
    this.vertexUniformBuffer = this.createUniformBuffer(device, 256, 'groundplane-vertex-uniforms')

    // GroundPlaneUniforms: color (12) + opacity (4) + metallic (4) + roughness (4) + specularIntensity (4) + pad (4) + specularColor (12) + pad2 (4) + cameraPosition (12) + pad3 (4) = 64 bytes
    this.materialUniformBuffer = this.createUniformBuffer(device, 64, 'groundplane-material-uniforms')

    // GridUniforms: showGrid (4) + gridSpacing (4) + sectionSpacing (4) + gridThickness (4) + sectionThickness (4) + gridFadeDistance (4) + gridFadeStrength (4) + pad (4) + gridColor (12) + pad2 (4) + sectionColor (12) + pad3 (4) = 64 bytes
    this.gridUniformBuffer = this.createUniformBuffer(device, 64, 'groundplane-grid-uniforms')

    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'groundplane-lighting-uniforms')

    // Create bind groups
    this.vertexBindGroup = device.createBindGroup({
      label: 'groundplane-vertex-bg',
      layout: vertexBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.vertexUniformBuffer } }],
    })

    this.materialBindGroup = device.createBindGroup({
      label: 'groundplane-material-bg',
      layout: materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.materialUniformBuffer } }],
    })

    this.gridBindGroup = device.createBindGroup({
      label: 'groundplane-grid-bg',
      layout: gridBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.gridUniformBuffer } }],
    })

    this.lightingBindGroup = device.createBindGroup({
      label: 'groundplane-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    // Create plane geometry
    this.createPlaneGeometry(device, this.planeSize)
  }

  /**
   * Create plane geometry for ground plane rendering.
   * Creates a quad at y=0 with the given half-extent.
   * @param device - GPU device for buffer creation
   * @param size - Half-extent of the plane in world units
   */
  private createPlaneGeometry(device: GPUDevice, size: number): void {
    // 4 corners of a large ground plane at y=0
    // Vertex format: position (3) + normal (3) + uv (2) = 8 floats per vertex
    const vertices = new Float32Array([
      // Position              Normal            UV
      -size, 0, -size,         0, 1, 0,          0, 0,   // bottom-left
       size, 0, -size,         0, 1, 0,          1, 0,   // bottom-right
       size, 0,  size,         0, 1, 0,          1, 1,   // top-right
      -size, 0,  size,         0, 1, 0,          0, 1,   // top-left
    ])

    // Two triangles forming a quad
    const indices = new Uint16Array([
      0, 1, 2,  // First triangle
      0, 2, 3,  // Second triangle
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
   * Update vertex uniforms from render context.
   * @param ctx - WebGPU render context with camera and ground store data
   */
  private updateVertexUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.vertexUniformBuffer) return

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number }
    }
    if (!camera) return

    // Get ground plane settings from stores
    const ground = ctx.frame?.stores?.['environment'] as {
      groundPlaneOffset?: number
    }
    const offset = -(ground?.groundPlaneOffset ?? 0) // Negative Y offset

    // Pack vertex uniforms
    const data = new Float32Array(64) // 256 bytes

    // Model matrix (identity with Y offset translation)
    // Column-major order for mat4x4
    data[0] = 1; data[1] = 0; data[2] = 0; data[3] = 0   // column 0
    data[4] = 0; data[5] = 1; data[6] = 0; data[7] = 0   // column 1
    data[8] = 0; data[9] = 0; data[10] = 1; data[11] = 0 // column 2
    data[12] = 0; data[13] = offset; data[14] = 0; data[15] = 1 // column 3 (translation)

    // View matrix (offset 16)
    if (camera.viewMatrix) {
      for (let i = 0; i < 16 && i < camera.viewMatrix.elements.length; i++) {
        data[16 + i] = camera.viewMatrix.elements[i] ?? 0
      }
    }

    // Projection matrix (offset 32)
    if (camera.projectionMatrix) {
      for (let i = 0; i < 16 && i < camera.projectionMatrix.elements.length; i++) {
        data[32 + i] = camera.projectionMatrix.elements[i] ?? 0
      }
    }

    // Normal matrix (mat3x3 at offset 48, padded to 12 floats for alignment)
    // For a simple identity model matrix, normal matrix is also identity
    data[48] = 1; data[49] = 0; data[50] = 0; data[51] = 0  // row 0 + padding
    data[52] = 0; data[53] = 1; data[54] = 0; data[55] = 0  // row 1 + padding
    data[56] = 0; data[57] = 0; data[58] = 1; data[59] = 0  // row 2 + padding

    // Camera position (offset 60)
    if (camera.position) {
      data[60] = camera.position.x
      data[61] = camera.position.y
      data[62] = camera.position.z
    }
    data[63] = 0 // padding

    this.writeUniformBuffer(this.device, this.vertexUniformBuffer, data)
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
    const specularColor = parseHexColorToLinearRgb(pbr?.ground?.specularColor ?? '#ffffff', [1, 1, 1])

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

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    const data = new Float32Array(144)
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  /**
   * Execute the render pass.
   * @param ctx - WebGPU render context with encoder and render targets
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.vertexBindGroup ||
      !this.materialBindGroup ||
      !this.gridBindGroup ||
      !this.lightingBindGroup
    ) {
      return
    }

    // Check if ground plane is enabled (any walls active)
    const ground = ctx.frame?.stores?.['environment'] as {
      activeWalls?: string[]
    }
    if (!ground?.activeWalls || ground.activeWalls.length === 0) {
      return // No walls active, skip rendering
    }

    // Update uniforms from stores
    this.updateVertexUniforms(ctx)
    this.updateMaterialUniforms(ctx)
    this.updateGridUniforms(ctx)
    this.updateLightingUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('scene-render')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !depthView) return

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'groundplane-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'load' as const, // Load existing content (don't clear)
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
    passEncoder.setBindGroup(0, this.vertexBindGroup)
    passEncoder.setBindGroup(1, this.materialBindGroup)
    passEncoder.setBindGroup(2, this.gridBindGroup)
    passEncoder.setBindGroup(3, this.lightingBindGroup)

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16' as const)

    // Draw the ground plane
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.vertexBindGroup = null
    this.materialBindGroup = null
    this.gridBindGroup = null
    this.lightingBindGroup = null

    this.vertexUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.gridUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()

    this.vertexUniformBuffer = null
    this.materialUniformBuffer = null
    this.gridUniformBuffer = null
    this.lightingUniformBuffer = null
    this.vertexBuffer = null
    this.indexBuffer = null

    super.dispose()
  }
}
