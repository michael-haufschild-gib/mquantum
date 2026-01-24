/**
 * WebGPU Quaternion Julia Renderer
 *
 * Renders Quaternion Julia fractals using WebGPU compute and render pipelines.
 * Supports 3D-11D dimensions with full PBR lighting.
 *
 * @module rendering/webgpu/renderers/WebGPUQuaternionJuliaRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeJuliaShader, composeJuliaVertexShader } from '../shaders/julia/compose'
import type { WGSLShaderConfig } from '../shaders/shared/compose-helpers'

export interface JuliaRendererConfig {
  dimension?: number
  shadows?: boolean
  ambientOcclusion?: boolean
  sss?: boolean
  ibl?: boolean
  temporal?: boolean
}

/**
 * WebGPU renderer for Quaternion Julia fractals.
 */
export class WebGPUQuaternionJuliaRenderer extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
  private juliaUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null
  private iblUniformBuffer: GPUBuffer | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private materialBindGroup: GPUBindGroup | null = null
  private qualityBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null
  private iblBindGroup: GPUBindGroup | null = null

  // IBL resources
  private envMapTexture: GPUTexture | null = null
  private envMapSampler: GPUSampler | null = null

  // Configuration
  private config: JuliaRendererConfig
  private shaderConfig: WGSLShaderConfig

  // Geometry
  private indexCount = 0

  // Bind group layouts (stored for recreation)
  private cameraBindGroupLayout: GPUBindGroupLayout | null = null
  private lightingBindGroupLayout: GPUBindGroupLayout | null = null
  private materialBindGroupLayout: GPUBindGroupLayout | null = null
  private qualityBindGroupLayout: GPUBindGroupLayout | null = null
  private objectBindGroupLayout: GPUBindGroupLayout | null = null
  private iblBindGroupLayout: GPUBindGroupLayout | null = null

  constructor(config?: JuliaRendererConfig) {
    super({
      id: 'quaternion-julia',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'hdr-color', access: 'write' },
        { resourceId: 'normal-buffer', access: 'write' },
        { resourceId: 'depth-buffer', access: 'write' },
      ],
    })

    this.config = {
      dimension: 4,
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

  setJuliaConstant(x: number, y: number, z: number, w: number): void {
    if (!this.device || !this.juliaUniformBuffer) return

    // Update Julia constant in uniform buffer
    // The juliaConstant is at offset 0 in JuliaUniforms
    const data = new Float32Array([x, y, z, w])
    this.device.queue.writeBuffer(this.juliaUniformBuffer, 0, data)
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Compose shaders
    const { wgsl: fragmentShader } = composeJuliaShader(this.shaderConfig)
    const vertexShader = composeJuliaVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'julia-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'julia-fragment')

    // Create bind group layouts
    this.cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })

    this.lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-lighting-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    this.materialBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-material-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    this.qualityBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-quality-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    this.objectBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Julia uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Basis vectors
      ],
    })

    // IBL bind group layout (if IBL enabled)
    if (this.config.ibl) {
      this.iblBindGroupLayout = device.createBindGroupLayout({
        label: 'julia-ibl-bgl',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // IBL uniforms
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float', viewDimension: 'cube' },
          }, // Environment map
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }, // Sampler
        ],
      })
    }

    // Create pipeline layout
    const bindGroupLayouts = [
      this.cameraBindGroupLayout,
      this.lightingBindGroupLayout,
      this.materialBindGroupLayout,
      this.qualityBindGroupLayout,
      this.objectBindGroupLayout,
    ]

    if (this.config.ibl && this.iblBindGroupLayout) {
      bindGroupLayouts.push(this.iblBindGroupLayout)
    }

    const pipelineLayout = device.createPipelineLayout({
      label: 'julia-pipeline-layout',
      bindGroupLayouts,
    })

    // Create render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: 'julia-pipeline',
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
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'julia-camera')
    this.lightingUniformBuffer = this.createUniformBuffer(device, 512, 'julia-lighting')
    this.materialUniformBuffer = this.createUniformBuffer(device, 128, 'julia-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'julia-quality')
    this.juliaUniformBuffer = this.createUniformBuffer(device, 128, 'julia-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 256, 'julia-basis')

    if (this.config.ibl) {
      this.iblUniformBuffer = this.createUniformBuffer(device, 64, 'julia-ibl')
    }

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'julia-camera-bg',
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.lightingBindGroup = device.createBindGroup({
      label: 'julia-lighting-bg',
      layout: this.lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    this.materialBindGroup = device.createBindGroup({
      label: 'julia-material-bg',
      layout: this.materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.materialUniformBuffer } }],
    })

    this.qualityBindGroup = device.createBindGroup({
      label: 'julia-quality-bg',
      layout: this.qualityBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.qualityUniformBuffer } }],
    })

    this.objectBindGroup = device.createBindGroup({
      label: 'julia-object-bg',
      layout: this.objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.juliaUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

    // Create placeholder IBL resources if needed
    if (this.config.ibl && this.iblBindGroupLayout && this.iblUniformBuffer) {
      // Create a small placeholder cube texture
      this.envMapTexture = device.createTexture({
        label: 'julia-env-placeholder',
        size: { width: 4, height: 4, depthOrArrayLayers: 6 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '2d',
      })

      this.envMapSampler = device.createSampler({
        label: 'julia-env-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      this.iblBindGroup = device.createBindGroup({
        label: 'julia-ibl-bg',
        layout: this.iblBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.iblUniformBuffer } },
          { binding: 1, resource: this.envMapTexture.createView({ dimension: 'cube' }) },
          { binding: 2, resource: this.envMapSampler },
        ],
      })
    }

    // Create bounding geometry (cube)
    this.createBoundingGeometry(device)

    // Initialize default uniform values
    this.initializeDefaultUniforms(device)
  }

  private initializeDefaultUniforms(device: GPUDevice): void {
    // Initialize Julia uniforms with defaults
    if (this.juliaUniformBuffer) {
      const juliaData = new Float32Array([
        // juliaConstant (vec4f)
        -0.4,
        0.6,
        0.2,
        -0.1,
        // effectivePower, effectiveBailout, iterations (f32, f32, u32)
        2.0,
        4.0,
        0, // iterations as bits
        // powerAnimationEnabled (u32)
        0,
        // animatedPower (f32)
        2.0,
        // dimensionMixEnabled (u32)
        0,
        // mixIntensity, mixTime (f32, f32)
        0.0,
        0.0,
        // lodEnabled (u32)
        0,
        // lodDetail (f32)
        1.0,
        // phaseEnabled (u32)
        0,
        // phaseTheta, phasePhi (f32, f32)
        0.0,
        0.0,
        // scale (f32)
        1.0,
        // padding (vec2f)
        0.0,
        0.0,
      ])

      // Set iterations as u32 at correct byte offset
      const dataView = new DataView(juliaData.buffer)
      dataView.setUint32(6 * 4, 20, true) // iterations at index 6 (after effectiveBailout)

      device.queue.writeBuffer(this.juliaUniformBuffer, 0, juliaData)
    }

    // Initialize basis vectors with identity-like transform
    if (this.basisUniformBuffer) {
      const basisData = new Float32Array(64) // 256 bytes / 4
      // Origin at 0
      // basisX = [1,0,0,0,0,0,0,0,0,0,0]
      basisData[11] = 1.0 // dimension 0
      // basisY = [0,1,0,0,0,0,0,0,0,0,0]
      basisData[22 + 1] = 1.0 // dimension 1
      // basisZ = [0,0,1,0,0,0,0,0,0,0,0]
      basisData[33 + 2] = 1.0 // dimension 2
      device.queue.writeBuffer(this.basisUniformBuffer, 0, basisData)
    }

    // Initialize quality uniforms
    if (this.qualityUniformBuffer) {
      const qualityData = new Float32Array([
        128.0, // sdfMaxIterations
        0.001, // sdfSurfaceDistance
        0.5, // shadowSoftness
        2.0, // shadowQuality
        4.0, // aoSamples
        0.5, // aoRadius
        1.0, // aoIntensity
        0.0, // padding
      ])
      device.queue.writeBuffer(this.qualityUniformBuffer, 0, qualityData)
    }

    // Initialize material uniforms
    if (this.materialUniformBuffer) {
      const materialData = new Float32Array([
        // baseColor (vec4f)
        0.8, 0.6, 0.4, 1.0,
        // emissive (vec3f) + emissiveIntensity (f32)
        0.0, 0.0, 0.0, 0.0,
        // metallic, roughness, reflectance, padding
        0.0, 0.5, 0.5, 0.0,
      ])
      device.queue.writeBuffer(this.materialUniformBuffer, 0, materialData)
    }

    // Initialize lighting uniforms
    if (this.lightingUniformBuffer) {
      const lightingData = new Float32Array(128) // 512 bytes / 4
      // First light: directional from above
      lightingData[0] = 0.3 // position.x
      lightingData[1] = 1.0 // position.y
      lightingData[2] = 0.5 // position.z
      lightingData[3] = 0.0 // position.w (directional)
      lightingData[4] = 1.0 // color.r
      lightingData[5] = 1.0 // color.g
      lightingData[6] = 1.0 // color.b
      lightingData[7] = 1.0 // intensity
      lightingData[8] = 1.0 // numLights
      device.queue.writeBuffer(this.lightingUniformBuffer, 0, lightingData)
    }

    // Initialize IBL uniforms
    if (this.iblUniformBuffer) {
      const iblData = new Float32Array([
        1.0, // intensity
        1.0, // iblQuality
        0.0,
        0.0, // padding
      ])
      device.queue.writeBuffer(this.iblUniformBuffer, 0, iblData)
    }
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
      label: 'julia-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices)

    this.indexBuffer = device.createBuffer({
      label: 'julia-indices',
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
   * Update Julia-specific uniforms.
   */
  updateJuliaUniforms(
    juliaConstant: [number, number, number, number],
    power: number,
    bailout: number,
    iterations: number,
    scale: number = 1.0
  ): void {
    if (!this.device || !this.juliaUniformBuffer) return

    const juliaData = new Float32Array([
      // juliaConstant (vec4f)
      juliaConstant[0],
      juliaConstant[1],
      juliaConstant[2],
      juliaConstant[3],
      // effectivePower, effectiveBailout
      power,
      bailout,
      // iterations placeholder (will be set as u32)
      0,
      // powerAnimationEnabled (u32)
      0,
      // animatedPower (f32)
      power,
      // dimensionMixEnabled (u32)
      0,
      // mixIntensity, mixTime (f32, f32)
      0.0,
      0.0,
      // lodEnabled (u32)
      0,
      // lodDetail (f32)
      1.0,
      // phaseEnabled (u32)
      0,
      // phaseTheta, phasePhi (f32, f32)
      0.0,
      0.0,
      // scale (f32)
      scale,
      // padding (vec2f)
      0.0,
      0.0,
    ])

    // Set iterations as u32 at correct byte offset
    const dataView = new DataView(juliaData.buffer)
    dataView.setUint32(6 * 4, iterations, true)

    this.device.queue.writeBuffer(this.juliaUniformBuffer, 0, juliaData)
  }

  /**
   * Update basis vectors for N-dimensional projection.
   */
  updateBasisVectors(origin: number[], basisX: number[], basisY: number[], basisZ: number[]): void {
    if (!this.device || !this.basisUniformBuffer) return

    // Basis buffer layout: origin[11], basisX[11], basisY[11], basisZ[11]
    const basisData = new Float32Array(64)

    // Copy origin (pad to 12 for alignment)
    for (let i = 0; i < Math.min(origin.length, 11); i++) {
      basisData[i] = origin[i] ?? 0
    }

    // Copy basisX (starting at offset 12)
    for (let i = 0; i < Math.min(basisX.length, 11); i++) {
      basisData[12 + i] = basisX[i] ?? 0
    }

    // Copy basisY (starting at offset 24)
    for (let i = 0; i < Math.min(basisY.length, 11); i++) {
      basisData[24 + i] = basisY[i] ?? 0
    }

    // Copy basisZ (starting at offset 36)
    for (let i = 0; i < Math.min(basisZ.length, 11); i++) {
      basisData[36 + i] = basisZ[i] ?? 0
    }

    this.device.queue.writeBuffer(this.basisUniformBuffer, 0, basisData)
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
      !this.qualityBindGroup ||
      !this.objectBindGroup
    ) {
      return
    }

    // Update uniforms
    this.updateCameraUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('hdr-color')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !normalView || !depthView) return

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'julia-render',
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
    passEncoder.setBindGroup(3, this.qualityBindGroup)
    passEncoder.setBindGroup(4, this.objectBindGroup)

    if (this.config.ibl && this.iblBindGroup) {
      passEncoder.setBindGroup(5, this.iblBindGroup)
    }

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
    this.juliaUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()
    this.iblUniformBuffer?.destroy()
    this.envMapTexture?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.juliaUniformBuffer = null
    this.basisUniformBuffer = null
    this.iblUniformBuffer = null
    this.envMapTexture = null

    super.dispose()
  }
}
