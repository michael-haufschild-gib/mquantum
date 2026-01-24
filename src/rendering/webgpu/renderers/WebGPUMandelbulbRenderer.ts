/**
 * WebGPU Mandelbulb Renderer
 *
 * Renders Mandelbulb fractals using WebGPU compute and render pipelines.
 * Supports 3D-11D dimensions with full PBR lighting.
 *
 * @module rendering/webgpu/renderers/WebGPUMandelbulbRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeMandelbulbShader,
  composeMandelbulbVertexShader,
} from '../shaders/mandelbulb/compose'
import type { WGSLShaderConfig } from '../shaders/shared/compose-helpers'

export interface MandelbulbRendererConfig {
  dimension?: number
  shadows?: boolean
  ambientOcclusion?: boolean
  sss?: boolean
  ibl?: boolean
  temporal?: boolean
}

/**
 * WebGPU renderer for Mandelbulb fractals.
 */
export class WebGPUMandelbulbRenderer extends WebGPUBasePass {
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

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private materialBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null

  // Configuration
  private config: MandelbulbRendererConfig
  private shaderConfig: WGSLShaderConfig

  // Geometry
  private indexCount = 0

  constructor(config?: MandelbulbRendererConfig) {
    super({
      id: 'mandelbulb',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'hdr-color', access: 'write' },
        { resourceId: 'normal-buffer', access: 'write' },
        { resourceId: 'depth-buffer', access: 'write' },
      ],
    })

    this.config = {
      dimension: 3,
      shadows: true,
      ambientOcclusion: true,
      sss: false,
      ibl: true,
      temporal: false,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.config.dimension!,
      shadows: this.config.shadows,
      ambientOcclusion: this.config.ambientOcclusion,
      sss: this.config.sss,
      ibl: this.config.ibl,
      temporal: this.config.temporal,
    }
  }

  setDimension(dimension: number): void {
    if (this.config.dimension === dimension) return
    this.config.dimension = dimension
    this.shaderConfig.dimension = dimension
    // Note: Would need to recreate pipeline for dimension change
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Compose shaders
    const { wgsl: fragmentShader } = composeMandelbulbShader(this.shaderConfig)
    const vertexShader = composeMandelbulbVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'mandelbulb-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'mandelbulb-fragment')

    // Create bind group layouts
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

    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-lighting-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    const materialBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-material-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    const qualityBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-quality-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'mandelbulb-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Mandelbulb uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Basis vectors
      ],
    })

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'mandelbulb-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        lightingBindGroupLayout,
        materialBindGroupLayout,
        qualityBindGroupLayout,
        objectBindGroupLayout,
      ],
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
          { format }, // Color output
          { format: 'rgba16float' }, // Normal buffer
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'mandelbulb-camera')
    this.lightingUniformBuffer = this.createUniformBuffer(device, 512, 'mandelbulb-lighting')
    this.materialUniformBuffer = this.createUniformBuffer(device, 128, 'mandelbulb-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'mandelbulb-quality')
    this.mandelbulbUniformBuffer = this.createUniformBuffer(device, 128, 'mandelbulb-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 256, 'mandelbulb-basis')

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'mandelbulb-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.lightingBindGroup = device.createBindGroup({
      label: 'mandelbulb-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    this.materialBindGroup = device.createBindGroup({
      label: 'mandelbulb-material-bg',
      layout: materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.materialUniformBuffer } }],
    })

    this.objectBindGroup = device.createBindGroup({
      label: 'mandelbulb-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.mandelbulbUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

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
   */
  updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as any
    if (!camera) return

    // Pack camera uniforms (must match shader struct layout)
    const data = new Float32Array(64) // 256 bytes / 4

    // viewMatrix (16 floats)
    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0)
    }
    // projectionMatrix (16 floats)
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16)
    }
    // viewProjectionMatrix (16 floats)
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32)
    }
    // cameraPosition (3 floats) + near (1 float)
    if (camera.position) {
      data[48] = camera.position.x
      data[49] = camera.position.y
      data[50] = camera.position.z
    }
    data[51] = camera.near || 0.1

    // far, fov, resolution, aspectRatio, time, deltaTime, frameNumber
    data[52] = camera.far || 1000
    data[53] = camera.fov || 50
    data[54] = ctx.size.width
    data[55] = ctx.size.height
    data[56] = ctx.size.width / ctx.size.height
    data[57] = ctx.frame?.time || 0
    data[58] = ctx.frame?.delta || 0.016
    // frameNumber as uint - we'll treat it as float for simplicity
    data[59] = ctx.frame?.frameNumber || 0

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update mandelbulb-specific uniforms from extendedObjectStore.
   */
  updateMandelbulbUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.mandelbulbUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    if (!extended?.mandelbulb) return

    const mb = extended.mandelbulb
    const data = new Float32Array(32) // 128 bytes / 4

    // Core parameters (matching MandelbulbUniforms struct)
    data[0] = this.config.dimension ?? 3 // dimension: i32 (stored as f32 for alignment)
    data[1] = mb.mandelbulbPower ?? 8.0 // power
    data[2] = mb.maxIterations ?? 48 // iterations
    data[3] = mb.escapeRadius ?? 4.0 // escapeRadius

    // Quality settings
    data[4] = mb.sdfMaxIterations ?? 64 // sdfMaxIterations
    data[5] = mb.sdfSurfaceDistance ?? 0.001 // sdfSurfaceDistance

    // Pre-computed values
    data[6] = mb.mandelbulbPower ?? 8.0 // effectivePower (same as power for now)
    data[7] = Math.max(mb.escapeRadius ?? 4.0, 2.0) // effectiveBailout

    // Power animation
    data[8] = mb.powerAnimationEnabled ? 1 : 0 // powerAnimationEnabled: u32
    data[9] = mb.mandelbulbPower ?? 8.0 // animatedPower (computed elsewhere if animated)

    // Alternate power blending
    data[10] = mb.alternatePowerEnabled ? 1 : 0 // alternatePowerEnabled: u32
    data[11] = mb.alternatePowerValue ?? 8.0 // alternatePowerValue
    data[12] = mb.alternatePowerBlend ?? 0.0 // alternatePowerBlend

    // Phase shift
    data[13] = mb.phaseShiftEnabled ? 1 : 0 // phaseEnabled: u32
    data[14] = 0.0 // phaseTheta (computed from animation)
    data[15] = 0.0 // phasePhi (computed from animation)

    // Scale
    data[16] = mb.scale ?? 1.0

    this.writeUniformBuffer(this.device, this.mandelbulbUniformBuffer, data)
  }

  /**
   * Update N-D basis vectors from rotationStore.
   */
  updateBasisUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const rotation = ctx.frame?.stores?.['rotation'] as any
    const extended = ctx.frame?.stores?.['extended'] as any
    if (!rotation) return

    const dimension = this.config.dimension ?? 3
    const rotations = rotation.rotations as Map<string, number> | undefined

    // Import composeRotations dynamically would be complex, so we'll use a simplified
    // identity basis for now and compute proper rotations when the math module is available
    // Each basis vector is stored as 3 vec4f (12 floats) for up to 11D
    const data = new Float32Array(48) // 192 bytes for 4 vectors × 12 floats

    // Default identity basis vectors (will be properly rotated later)
    // basisX: [1, 0, 0, 0, ...]
    data[0] = 1.0
    // basisY: [0, 1, 0, 0, ...]
    data[12] = 1.0
    // basisZ: [0, 0, 1, 0, ...]
    data[24] = 1.0
    // origin: [0, 0, 0, parameterValues...]
    // Fill in parameter values for extra dimensions
    const parameterValues = extended?.mandelbulb?.parameterValues ?? []
    for (let i = 3; i < dimension && i < 11; i++) {
      data[36 + i] = parameterValues[i - 3] ?? 0
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, data)
  }

  /**
   * Update material uniforms from pbrStore and appearanceStore.
   */
  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any

    const data = new Float32Array(32) // 128 bytes

    // Material properties
    data[0] = pbr?.face?.roughness ?? 0.5
    data[1] = pbr?.face?.metallic ?? 0.0
    data[2] = pbr?.face?.specularIntensity ?? 1.0
    data[3] = 1.0 // alpha

    // Face color (parse hex to RGB)
    const faceColor = this.parseColor(appearance?.faceColor ?? '#ffffff')
    data[4] = faceColor[0]
    data[5] = faceColor[1]
    data[6] = faceColor[2]
    data[7] = 1.0

    // Edge color
    const edgeColor = this.parseColor(appearance?.edgeColor ?? '#000000')
    data[8] = edgeColor[0]
    data[9] = edgeColor[1]
    data[10] = edgeColor[2]
    data[11] = 1.0

    // SSS parameters
    data[12] = appearance?.sssEnabled ? 1 : 0
    data[13] = appearance?.sssIntensity ?? 0.5
    data[14] = appearance?.sssThickness ?? 1.0
    data[15] = 0.0 // padding

    // Fresnel
    data[16] = appearance?.fresnelEnabled ? 1 : 0
    data[17] = appearance?.fresnelIntensity ?? 1.0

    // Color algorithm
    data[18] = appearance?.colorAlgorithm ?? 0

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  /**
   * Update lighting uniforms from lightingStore.
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    const data = new Float32Array(128) // 512 bytes

    // Number of lights
    const lights = lighting.lights ?? []
    data[0] = Math.min(lights.length, 8)

    // Ambient light
    data[1] = lighting.ambientEnabled ? 1 : 0
    data[2] = lighting.ambientIntensity ?? 0.3
    data[3] = 0.0 // padding

    // Ambient color
    const ambientColor = this.parseColor(lighting.ambientColor ?? '#ffffff')
    data[4] = ambientColor[0]
    data[5] = ambientColor[1]
    data[6] = ambientColor[2]
    data[7] = 1.0

    // Per-light data (8 lights max, 12 floats each starting at offset 8)
    for (let i = 0; i < Math.min(lights.length, 8); i++) {
      const light = lights[i]
      const offset = 8 + i * 12

      // Light type (0=point, 1=directional, 2=spot)
      data[offset + 0] = light.type === 'directional' ? 1 : light.type === 'spot' ? 2 : 0
      data[offset + 1] = light.enabled ? 1 : 0
      data[offset + 2] = light.intensity ?? 1.0
      data[offset + 3] = light.range ?? 100.0

      // Position
      data[offset + 4] = light.position?.[0] ?? 0
      data[offset + 5] = light.position?.[1] ?? 5
      data[offset + 6] = light.position?.[2] ?? 0
      data[offset + 7] = 0.0

      // Color
      const lightColor = this.parseColor(light.color ?? '#ffffff')
      data[offset + 8] = lightColor[0]
      data[offset + 9] = lightColor[1]
      data[offset + 10] = lightColor[2]
      data[offset + 11] = 1.0
    }

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  /**
   * Parse hex color string to RGB array [0-1].
   */
  private parseColor(hex: string): [number, number, number] {
    if (!hex || !hex.startsWith('#')) return [1, 1, 1]
    const val = parseInt(hex.slice(1), 16)
    if (isNaN(val)) return [1, 1, 1]
    return [
      ((val >> 16) & 0xff) / 255,
      ((val >> 8) & 0xff) / 255,
      (val & 0xff) / 255,
    ]
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.materialBindGroup ||
      !this.objectBindGroup
    ) {
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateMandelbulbUniforms(ctx)
    this.updateBasisUniforms(ctx)
    this.updateMaterialUniforms(ctx)
    this.updateLightingUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('hdr-color')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !normalView || !depthView) return

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

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup)
    passEncoder.setBindGroup(2, this.materialBindGroup)
    passEncoder.setBindGroup(3, this.objectBindGroup)
    passEncoder.setBindGroup(4, this.objectBindGroup) // Placeholder for quality

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16')
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()
  }

  dispose(): void {
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.mandelbulbUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.mandelbulbUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
