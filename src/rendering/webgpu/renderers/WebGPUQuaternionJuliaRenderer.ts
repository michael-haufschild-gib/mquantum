/**
 * WebGPU Quaternion Julia Renderer
 *
 * Renders Quaternion Julia fractals using WebGPU compute and render pipelines.
 * Supports 3D-11D dimensions with full PBR lighting.
 *
 * @module rendering/webgpu/renderers/WebGPUQuaternionJuliaRenderer
 */

import { composeRotations } from '@/lib/math/rotation'
import type { MatrixND } from '@/lib/math/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeJuliaShader, composeJuliaVertexShader } from '../shaders/julia/compose'
import type { WGSLShaderConfig } from '../shaders/shared/compose-helpers'

/** Maximum dimension supported */
const MAX_DIMENSION = 11

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
  private _lastDebugLog: number = 0 // DEBUG: throttle logging
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

  // Bind groups (consolidated layout)
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null // Combined: lighting + material + quality
  private objectBindGroup: GPUBindGroup | null = null
  private iblBindGroup: GPUBindGroup | null = null

  // IBL resources
  private envMapTexture: GPUTexture | null = null
  private envMapSampler: GPUSampler | null = null

  // Configuration (renamed to avoid shadowing base class config)
  private juliaConfig: JuliaRendererConfig
  private shaderConfig: WGSLShaderConfig

  // Geometry
  private indexCount = 0

  // Bind group layouts (consolidated layout)
  private cameraBindGroupLayout: GPUBindGroupLayout | null = null
  private lightingBindGroupLayout: GPUBindGroupLayout | null = null // Combined: lighting + material + quality
  private objectBindGroupLayout: GPUBindGroupLayout | null = null
  private iblBindGroupLayout: GPUBindGroupLayout | null = null

  constructor(config?: JuliaRendererConfig) {
    super({
      id: 'quaternion-julia',
      priority: 100,
      inputs: [],
      outputs: [
        { resourceId: 'object-color', access: 'write', binding: 0 },
        { resourceId: 'normal-buffer', access: 'write', binding: 1 },
        { resourceId: 'depth-buffer', access: 'write', binding: 2 },
      ],
    })

    this.juliaConfig = {
      dimension: 4,
      shadows: true,
      ambientOcclusion: true,
      sss: false,
      ibl: true,
      temporal: false,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.juliaConfig.dimension!,
      shadows: this.juliaConfig.shadows,
      ambientOcclusion: this.juliaConfig.ambientOcclusion,
      sss: this.juliaConfig.sss,
      ibl: this.juliaConfig.ibl,
      temporal: this.juliaConfig.temporal,
    }
  }

  setDimension(dimension: number): void {
    if (this.juliaConfig.dimension === dimension) return
    this.juliaConfig.dimension = dimension
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

    // Create bind group layouts - consolidated to stay within 4-group limit
    // Group 0: Camera
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

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Quality
      ],
    })

    // Group 2: Object (Julia + Basis)
    this.objectBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Julia uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Basis vectors
      ],
    })

    // Group 3: IBL (if enabled)
    // Note: Shader uses texture_2d<f32> for PMREM encoding (cubemap stored as 2D texture)
    if (this.juliaConfig.ibl) {
      this.iblBindGroupLayout = device.createBindGroupLayout({
        label: 'julia-ibl-bgl',
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
      this.cameraBindGroupLayout,
      this.lightingBindGroupLayout, // Now contains combined lighting+material+quality
      this.objectBindGroupLayout,
    ]

    if (this.juliaConfig.ibl && this.iblBindGroupLayout) {
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
          { format: 'rgba16float' }, // HDR color buffer (not canvas format)
          { format: 'rgba16float' }, // Normal buffer
        ],
      },
      primitive: {
        topology: 'triangle-list',
        // CRITICAL: Use 'front' to match THREE.BackSide in WebGL
        // BackSide = render back faces = cull front faces
        cullMode: 'front',
      },
      depthStencil: {
        format: 'depth24plus', // Match the depth buffer created by render graph
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })

    // Create uniform buffers
    // CameraUniforms: 5 mat4x4f (320) + scalars = 368 bytes, round to 384
    // CameraUniforms: 7 mat4x4f (448) + scalars (48) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'julia-camera')
    // LightingUniforms: 8×LightData (512) + ambient/count (32) = 544 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'julia-lighting')
    // MaterialUniforms: 112 bytes (with SSS + Fresnel), round to 128
    this.materialUniformBuffer = this.createUniformBuffer(device, 128, 'julia-material')
    // QualityUniforms: 48 bytes, round to 64
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'julia-quality')
    // JuliaUniforms: ~80 bytes, round to 128
    this.juliaUniformBuffer = this.createUniformBuffer(device, 128, 'julia-uniforms')
    // BasisVectors: 192 bytes, round to 256
    this.basisUniformBuffer = this.createUniformBuffer(device, 256, 'julia-basis')

    if (this.juliaConfig.ibl) {
      // IBLUniforms: 16 bytes
      this.iblUniformBuffer = this.createUniformBuffer(device, 16, 'julia-ibl')
    }

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'julia-camera-bg',
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'julia-combined-bg',
      layout: this.lightingBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: this.materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.qualityUniformBuffer } },
      ],
    })

    // Group 2: Object (Julia + Basis)
    this.objectBindGroup = device.createBindGroup({
      label: 'julia-object-bg',
      layout: this.objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.juliaUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

    // Create placeholder IBL resources if needed
    // Note: PMREM textures are stored as 2D textures with encoded cube faces
    // A proper implementation would load the actual environment map here
    if (this.juliaConfig.ibl && this.iblBindGroupLayout && this.iblUniformBuffer) {
      // Create a placeholder 2D PMREM texture (proper size would be e.g., 768x1024 for 256px faces)
      // Using minimal size for placeholder - will be replaced with real env map later
      this.envMapTexture = device.createTexture({
        label: 'julia-env-placeholder-pmrem',
        size: { width: 64, height: 64 }, // Placeholder size, proper PMREM would be larger
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
          { binding: 1, resource: this.envMapTexture.createView({ dimension: '2d' }) },
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
      // JuliaUniforms struct layout (see uniforms.wgsl.ts):
      // juliaConstant: vec4f (0-3)
      // effectivePower: f32 (4)
      // effectiveBailout: f32 (5)
      // iterations: u32 (6)
      // powerAnimationEnabled: u32 (7)
      // animatedPower: f32 (8)
      // dimensionMixEnabled: u32 (9)
      // mixIntensity: f32 (10)
      // mixTime: f32 (11)
      // lodEnabled: u32 (12)
      // lodDetail: f32 (13)
      // phaseEnabled: u32 (14)
      // phaseTheta: f32 (15)
      // phasePhi: f32 (16)
      // scale: f32 (17)
      // _padding: vec2f (18-19)
      const juliaData = new Float32Array(20)
      juliaData[0] = -0.4 // juliaConstant.x
      juliaData[1] = 0.6 // juliaConstant.y
      juliaData[2] = 0.2 // juliaConstant.z
      juliaData[3] = -0.1 // juliaConstant.w
      juliaData[4] = 2.0 // effectivePower
      juliaData[5] = 4.0 // effectiveBailout
      // iterations (u32), powerAnimationEnabled (u32), etc. set via DataView
      juliaData[8] = 2.0 // animatedPower
      juliaData[10] = 0.0 // mixIntensity
      juliaData[11] = 0.0 // mixTime
      juliaData[13] = 1.0 // lodDetail
      juliaData[15] = 0.0 // phaseTheta
      juliaData[16] = 0.0 // phasePhi
      juliaData[17] = 1.0 // scale

      const dataView = new DataView(juliaData.buffer)
      dataView.setUint32(6 * 4, 20, true) // iterations = 20
      dataView.setUint32(7 * 4, 0, true) // powerAnimationEnabled = false
      dataView.setUint32(9 * 4, 0, true) // dimensionMixEnabled = false
      dataView.setUint32(12 * 4, 0, true) // lodEnabled = false
      dataView.setUint32(14 * 4, 0, true) // phaseEnabled = false

      device.queue.writeBuffer(this.juliaUniformBuffer, 0, juliaData)
    }

    // Initialize basis vectors with identity-like transform
    if (this.basisUniformBuffer) {
      // BasisVectors struct layout (see uniforms.wgsl.ts):
      // basisX: array<vec4f, 3> = 12 floats (offset 0)
      // basisY: array<vec4f, 3> = 12 floats (offset 12)
      // basisZ: array<vec4f, 3> = 12 floats (offset 24)
      // origin: array<vec4f, 3> = 12 floats (offset 36)
      // Total: 48 floats = 192 bytes
      const basisData = new Float32Array(48)
      // basisX = [1,0,0,0,...] - unit vector along first dimension
      basisData[0] = 1.0
      // basisY = [0,1,0,0,...] - unit vector along second dimension
      basisData[12 + 1] = 1.0
      // basisZ = [0,0,1,0,...] - unit vector along third dimension
      basisData[24 + 2] = 1.0
      // origin = [0,0,0,...] - origin at zero (already zeroed)
      device.queue.writeBuffer(this.basisUniformBuffer, 0, basisData)
    }

    // Initialize quality uniforms
    if (this.qualityUniformBuffer) {
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
      const qualityData = new Float32Array(12)
      qualityData[1] = 0.001 // sdfSurfaceDistance
      qualityData[3] = 0.5 // shadowSoftness
      qualityData[6] = 0.5 // aoRadius
      qualityData[7] = 1.0 // aoIntensity
      qualityData[9] = 1.0 // iblIntensity
      qualityData[10] = 1.0 // qualityMultiplier

      const dataView = new DataView(qualityData.buffer)
      dataView.setInt32(0 * 4, 128, true) // sdfMaxIterations = 128
      dataView.setInt32(2 * 4, 2, true) // shadowQuality = 2 (medium)
      dataView.setInt32(4 * 4, 1, true) // aoEnabled = 1 (true)
      dataView.setInt32(5 * 4, 4, true) // aoSamples = 4
      dataView.setInt32(8 * 4, 1, true) // iblQuality = 1 (low)

      device.queue.writeBuffer(this.qualityUniformBuffer, 0, qualityData)
    }

    // Initialize material uniforms
    if (this.materialUniformBuffer) {
      // MaterialUniforms struct layout (see updateMaterialUniforms)
      // Total: 28 floats = 112 bytes, buffer = 128 bytes
      const materialData = new Float32Array(32) // 128 bytes
      // baseColor: vec4f (offset 0-3)
      materialData[0] = 0.8
      materialData[1] = 0.6
      materialData[2] = 0.4
      materialData[3] = 1.0
      // metallic, roughness, reflectance, ao (offset 4-7)
      materialData[4] = 0.0
      materialData[5] = 0.5
      materialData[6] = 0.5
      materialData[7] = 1.0
      // emissive (vec3f) + emissiveIntensity (offset 8-11)
      materialData[8] = 0.0
      materialData[9] = 0.0
      materialData[10] = 0.0
      materialData[11] = 0.0
      // ior, transmission, thickness (offset 12-14)
      materialData[12] = 1.5
      materialData[13] = 0.0
      materialData[14] = 1.0
      // sssEnabled: u32 (offset 15) - use DataView for integer
      const dataView = new DataView(materialData.buffer)
      dataView.setUint32(15 * 4, 1, true) // sssEnabled = true
      // sssIntensity (offset 16)
      materialData[16] = 1.0
      // sssColor: vec3f (offset 17-19) - warm SSS color
      materialData[17] = 1.0 // R
      materialData[18] = 0.53 // G (approx #ff8844)
      materialData[19] = 0.27 // B
      // sssThickness, sssJitter (offset 20-21)
      materialData[20] = 1.0
      materialData[21] = 0.2
      // fresnelEnabled: u32 (offset 22)
      dataView.setUint32(22 * 4, 1, true) // fresnelEnabled = true
      // fresnelIntensity (offset 23)
      materialData[23] = 0.5
      // rimColor: vec3f (offset 24-26)
      materialData[24] = 1.0
      materialData[25] = 1.0
      materialData[26] = 1.0
      // _padding2 (offset 27)
      materialData[27] = 0.0

      device.queue.writeBuffer(this.materialUniformBuffer, 0, materialData)
    }

    // Initialize lighting uniforms
    if (this.lightingUniformBuffer) {
      // LightingUniforms struct layout (see updateLightingUniforms)
      // lights[8] at offset 0 (512 bytes = 128 floats), then ambient/count
      const lightingData = new Float32Array(144)

      // First light: directional from above
      // LightData: position(4) + direction(4) + color(4) + params(4) = 16 floats
      lightingData[0] = 0.3 // position.x
      lightingData[1] = 1.0 // position.y
      lightingData[2] = 0.5 // position.z
      lightingData[3] = 1.0 // position.w = type (1 = directional)
      lightingData[4] = 0.0 // direction.x
      lightingData[5] = -1.0 // direction.y
      lightingData[6] = 0.0 // direction.z
      lightingData[7] = 100.0 // direction.w = range
      lightingData[8] = 1.0 // color.r
      lightingData[9] = 1.0 // color.g
      lightingData[10] = 1.0 // color.b
      lightingData[11] = 1.0 // color.a = intensity
      lightingData[12] = 2.0 // params.x = decay
      lightingData[13] = 0.9 // params.y = spotCosInner
      lightingData[14] = 0.7 // params.z = spotCosOuter
      lightingData[15] = 1.0 // params.w = enabled

      // ambientColor at offset 128
      lightingData[128] = 1.0
      lightingData[129] = 1.0
      lightingData[130] = 1.0
      lightingData[131] = 0.3 // ambientIntensity

      // lightCount at offset 132 (as i32)
      const dataView = new DataView(lightingData.buffer)
      dataView.setInt32(132 * 4, 1, true) // 1 light

      device.queue.writeBuffer(this.lightingUniformBuffer, 0, lightingData)
    }

    // Initialize IBL uniforms
    if (this.iblUniformBuffer) {
      // IBLUniforms struct layout:
      // envMapSize: f32 (0)
      // iblIntensity: f32 (1)
      // iblQuality: i32 (2)
      // _padding: f32 (3)
      const iblData = new Float32Array(4)
      iblData[0] = 256.0 // envMapSize (placeholder)
      iblData[1] = 1.0 // iblIntensity

      const dataView = new DataView(iblData.buffer)
      dataView.setInt32(2 * 4, 1, true) // iblQuality = 1 (low)

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

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Get scale from extended store for model matrix
    const extended = ctx.frame?.stores?.['extended'] as any
    const scale = extended?.julia?.scale ?? 1.0

    // DEBUG: Log camera and scale values once per second
    if (!this._lastDebugLog || Date.now() - this._lastDebugLog > 1000) {
      this._lastDebugLog = Date.now()
      console.log('[WebGPU Julia] Camera uniforms:', {
        hasCamera: !!camera,
        hasViewMatrix: !!camera?.viewMatrix?.elements,
        cameraPosition: camera?.position,
        scale,
        hasExtended: !!extended,
        hasJulia: !!extended?.julia,
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
    // - cameraFar to frameNumber (offset 116-123)
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
   * Update Julia-specific uniforms from extendedObjectStore.
   */
  updateJuliaUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.juliaUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    if (!extended?.quaternionJulia) return

    const julia = extended.quaternionJulia

    // JuliaUniforms struct layout (see uniforms.wgsl.ts):
    // juliaConstant: vec4f (0-3)
    // effectivePower: f32 (4)
    // effectiveBailout: f32 (5)
    // iterations: u32 (6)
    // powerAnimationEnabled: u32 (7)
    // animatedPower: f32 (8)
    // dimensionMixEnabled: u32 (9)
    // mixIntensity: f32 (10)
    // mixTime: f32 (11)
    // lodEnabled: u32 (12)
    // lodDetail: f32 (13)
    // phaseEnabled: u32 (14)
    // phaseTheta: f32 (15)
    // phasePhi: f32 (16)
    // scale: f32 (17)
    // _padding: vec2f (18-19)
    const data = new Float32Array(20)

    // Julia constant (vec4f for quaternion)
    const juliaConstant = julia.juliaConstant ?? [0.28, 0.0113, 0.0, 0.0]
    data[0] = juliaConstant[0] ?? 0.28
    data[1] = juliaConstant[1] ?? 0.0113
    data[2] = juliaConstant[2] ?? 0.0
    data[3] = juliaConstant[3] ?? 0.0

    // effectivePower, effectiveBailout
    data[4] = julia.power ?? 2.0
    data[5] = julia.bailoutRadius ?? 4.0

    // animatedPower
    data[8] = julia.animatedPower ?? julia.power ?? 2.0

    // mixIntensity, mixTime
    data[10] = julia.mixIntensity ?? 0.0
    data[11] = julia.mixTime ?? 0.0

    // lodDetail
    data[13] = julia.lodDetail ?? 1.0

    // phaseTheta, phasePhi
    data[15] = julia.phaseTheta ?? 0.0
    data[16] = julia.phasePhi ?? 0.0

    // scale
    data[17] = julia.scale ?? 1.0

    // Set u32 fields via DataView
    const dataView = new DataView(data.buffer)
    dataView.setUint32(6 * 4, julia.iterations ?? 20, true) // iterations
    dataView.setUint32(7 * 4, julia.powerAnimationEnabled ? 1 : 0, true) // powerAnimationEnabled
    dataView.setUint32(9 * 4, julia.dimensionMixEnabled ? 1 : 0, true) // dimensionMixEnabled
    dataView.setUint32(12 * 4, julia.lodEnabled ? 1 : 0, true) // lodEnabled
    dataView.setUint32(14 * 4, julia.phaseEnabled ? 1 : 0, true) // phaseEnabled

    this.writeUniformBuffer(this.device, this.juliaUniformBuffer, data)
  }

  /**
   * Update N-D basis vectors from rotationStore.
   */
  updateBasisUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const rotation = ctx.frame?.stores?.['rotation'] as any
    const extended = ctx.frame?.stores?.['extended'] as any
    const dimension = this.juliaConfig.dimension ?? 4
    const rotations = rotation?.rotations as Map<string, number> | undefined

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

    // Compute origin: start with parameter values for extra dimensions
    const parameterValues = extended?.quaternionJulia?.parameterValues ?? []
    const originUnrotated = new Float32Array(MAX_DIMENSION)
    for (let i = 3; i < dimension && i < MAX_DIMENSION; i++) {
      originUnrotated[i] = parameterValues[i - 3] ?? 0
    }

    // Apply rotation to origin
    const rotatedOrigin = new Float32Array(MAX_DIMENSION)
    this.applyRotation(rotationMatrix, originUnrotated, rotatedOrigin, dimension)
    for (let i = 0; i < MAX_DIMENSION; i++) {
      data[36 + i] = rotatedOrigin[i] ?? 0 // origin at offset 36
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, data)
  }

  /**
   * Apply rotation matrix to a vector.
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
   */
  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any

    // MaterialUniforms struct layout (with SSS + Fresnel):
    // struct MaterialUniforms {
    //   baseColor: vec4f,        // offset 0-3
    //   metallic: f32,           // offset 4
    //   roughness: f32,          // offset 5
    //   reflectance: f32,        // offset 6
    //   ao: f32,                 // offset 7
    //   emissive: vec3f,         // offset 8-10
    //   emissiveIntensity: f32,  // offset 11
    //   ior: f32,                // offset 12
    //   transmission: f32,       // offset 13
    //   thickness: f32,          // offset 14
    //   sssEnabled: u32,         // offset 15
    //   sssIntensity: f32,       // offset 16
    //   sssColor: vec3f,         // offset 17-19
    //   sssThickness: f32,       // offset 20
    //   sssJitter: f32,          // offset 21
    //   fresnelEnabled: u32,     // offset 22
    //   fresnelIntensity: f32,   // offset 23
    //   rimColor: vec3f,         // offset 24-26
    //   _padding2: f32,          // offset 27
    // }
    // Total: 28 floats = 112 bytes, buffer = 128 bytes
    const data = new Float32Array(32) // 128 bytes
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

    // sssColor: vec3f (offset 17-19)
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    data[17] = sssColor[0]
    data[18] = sssColor[1]
    data[19] = sssColor[2]

    // sssThickness, sssJitter (offset 20-21)
    data[20] = appearance?.sssThickness ?? 1.0
    data[21] = appearance?.sssJitter ?? 0.2

    // fresnelEnabled: u32 (offset 22) - uses edgesVisible from appearance store
    const fresnelEnabled = appearance?.edgesVisible ?? true
    dataView.setUint32(22 * 4, fresnelEnabled ? 1 : 0, true)

    // fresnelIntensity: f32 (offset 23)
    data[23] = appearance?.fresnelIntensity ?? 0.5

    // rimColor: vec3f (offset 24-26) - uses edgeColor from appearance store
    const rimColor = this.parseColor(appearance?.edgeColor ?? '#ffffff')
    data[24] = rimColor[0]
    data[25] = rimColor[1]
    data[26] = rimColor[2]

    // _padding2 (offset 27)
    data[27] = 0.0

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  /**
   * Update lighting uniforms from lightingStore.
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    // LightingUniforms struct layout:
    // struct LightData { position: vec4f, direction: vec4f, color: vec4f, params: vec4f } = 64 bytes
    // struct LightingUniforms {
    //   lights: array<LightData, 8>,  // offset 0, 512 bytes
    //   ambientColor: vec3f,          // offset 512 (128 floats)
    //   ambientIntensity: f32,        // offset 524 (131 floats)
    //   lightCount: i32,              // offset 528 (132 floats)
    //   _padding: vec3f,              // offset 532
    // }
    // Total: 544 bytes = 136 floats, buffer is 576 bytes = 144 floats
    const data = new Float32Array(144)

    const lights = lighting.lights ?? []
    const lightCount = Math.min(lights.length, 8)

    // Pack lights array first (offset 0, each light is 16 floats = 64 bytes)
    for (let i = 0; i < lightCount; i++) {
      const light = lights[i]
      const offset = i * 16 // 16 floats per LightData

      // position: vec4f (xyz = position, w = type)
      // Must match WGSL constants: LIGHT_TYPE_POINT=1, LIGHT_TYPE_DIRECTIONAL=2, LIGHT_TYPE_SPOT=3
      const lightType = light.type === 'directional' ? 2 : light.type === 'spot' ? 3 : 1
      data[offset + 0] = light.position?.[0] ?? 0
      data[offset + 1] = light.position?.[1] ?? 5
      data[offset + 2] = light.position?.[2] ?? 0
      data[offset + 3] = lightType

      // direction: vec4f (xyz = direction, w = range)
      data[offset + 4] = light.direction?.[0] ?? 0
      data[offset + 5] = light.direction?.[1] ?? -1
      data[offset + 6] = light.direction?.[2] ?? 0
      data[offset + 7] = light.range ?? 100.0

      // color: vec4f (rgb = color, a = intensity)
      const lightColor = this.parseColor(light.color ?? '#ffffff')
      data[offset + 8] = lightColor[0]
      data[offset + 9] = lightColor[1]
      data[offset + 10] = lightColor[2]
      data[offset + 11] = light.intensity ?? 1.0

      // params: vec4f (x = decay, y = spotCosInner, z = spotCosOuter, w = enabled)
      data[offset + 12] = light.decay ?? 2.0
      data[offset + 13] = light.spotCosInner ?? 0.9
      data[offset + 14] = light.spotCosOuter ?? 0.7
      data[offset + 15] = light.enabled ? 1.0 : 0.0
    }

    // ambientColor: vec3f at offset 128 (after 8 lights × 16 floats)
    const ambientColor = this.parseColor(lighting.ambientColor ?? '#ffffff')
    data[128] = ambientColor[0]
    data[129] = ambientColor[1]
    data[130] = ambientColor[2]

    // ambientIntensity: f32 at offset 131
    data[131] = (lighting.ambientEnabled ? 1 : 0) * (lighting.ambientIntensity ?? 0.3)

    // lightCount: i32 at offset 132 - use DataView for proper type
    const dataView = new DataView(data.buffer)
    dataView.setInt32(132 * 4, lightCount, true)

    // _padding: vec3f at offset 133-135 (already zeroed)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }


  /**
   * Update quality uniforms from performanceStore.
   */
  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = ctx.frame?.stores?.['performance'] as any
    const lighting = ctx.frame?.stores?.['lighting'] as any
    const environment = ctx.frame?.stores?.['environment'] as any
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as any
    const extended = ctx.frame?.stores?.['extended'] as any
    const julia = extended?.quaternionJulia

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
    const sdfMaxIterations = julia?.sdfMaxIterations ?? 64
    const sdfSurfaceDistance = julia?.sdfSurfaceDistance ?? 0.001
    const qualityMultiplier = julia?.qualityMultiplier ?? performance?.qualityMultiplier ?? 1.0
    const aoSamples = julia?.aoSamples ?? 4

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
    dataView.setInt32(8 * 4, this.shaderConfig.ibl ? (environment?.iblQuality ?? 1) : 0, true) // iblQuality

    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, data)
  }

  /**
   * Update IBL uniforms from environmentStore.
   */
  updateIBLUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.iblUniformBuffer || !this.juliaConfig.ibl) return

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
      console.warn('[WebGPU Julia] Missing resources:', missingResources.join(', '))
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateJuliaUniforms(ctx)
    this.updateBasisUniforms(ctx)
    this.updateMaterialUniforms(ctx)
    this.updateLightingUniforms(ctx)
    this.updateQualityUniforms(ctx)
    if (this.juliaConfig.ibl) {
      this.updateIBLUniforms(ctx)
    }

    // Get render targets
    const colorView = ctx.getWriteTarget('object-color')
    const normalView = ctx.getWriteTarget('normal-buffer')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView || !normalView || !depthView) {
      console.warn('[WebGPU Julia] Missing render targets:', {
        colorView: !!colorView,
        normalView: !!normalView,
        depthView: !!depthView,
      })
      return
    }

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

    // Set pipeline and bind groups - consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Julia + Basis)
    // Group 3: IBL (if enabled)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)

    if (this.juliaConfig.ibl && this.iblBindGroup) {
      passEncoder.setBindGroup(3, this.iblBindGroup)
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
