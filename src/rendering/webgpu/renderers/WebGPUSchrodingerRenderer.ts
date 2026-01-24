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

export interface SchrodingerRendererConfig {
  dimension?: number
  isosurface?: boolean
  quantumMode?: QuantumModeForShader
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
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
  private schroedingerUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null

  // Configuration
  private rendererConfig: SchrodingerRendererConfig
  private shaderConfig: SchroedingerWGSLShaderConfig

  // Geometry
  private indexCount = 0

  constructor(config?: SchrodingerRendererConfig) {
    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'hdr-color', access: 'write', binding: 0 }],
    })

    this.rendererConfig = {
      dimension: 3,
      isosurface: false,
      quantumMode: 'harmonicOscillator',
      ...config,
    }

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      isosurface: this.rendererConfig.isosurface,
      quantumMode: this.rendererConfig.quantumMode,
      termCount: this.rendererConfig.termCount,
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
    const { device, format } = ctx

    // Compose shaders
    const { wgsl: fragmentShader } = composeSchroedingerShader(this.shaderConfig)
    const vertexShader = composeSchroedingerVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'schroedinger-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'schroedinger-fragment')

    // Create bind group layouts
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

    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-lighting-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const materialBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-material-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const qualityBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-quality-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
      ],
    })

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'schroedinger-pipeline-layout',
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
        targets: [
          {
            format,
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
        cullMode: 'back' as const,
      },
    })

    // Create uniform buffers
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'schroedinger-camera')
    this.lightingUniformBuffer = this.createUniformBuffer(device, 512, 'schroedinger-lighting')
    // Schroedinger uniforms: ~1KB for all quantum parameters
    this.schroedingerUniformBuffer = this.createUniformBuffer(device, 1024, 'schroedinger-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'schroedinger-basis')

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'schroedinger-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.lightingBindGroup = device.createBindGroup({
      label: 'schroedinger-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    // Create placeholder bind groups for material and quality
    const placeholderBuffer = this.createUniformBuffer(device, 128, 'schroedinger-placeholder')
    const materialBindGroup = device.createBindGroup({
      label: 'schroedinger-material-bg',
      layout: materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: placeholderBuffer } }],
    })

    const qualityBindGroup = device.createBindGroup({
      label: 'schroedinger-quality-bg',
      layout: qualityBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: placeholderBuffer } }],
    })

    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

    // Store placeholder bind groups for rendering
    ;(this as any).materialBindGroup = materialBindGroup
    ;(this as any).qualityBindGroup = qualityBindGroup

    // Create bounding geometry (sphere for volume)
    this.createBoundingGeometry(device)
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Create a sphere for volume raymarching
    const radius = 3.0
    const segments = 32
    const rings = 16

    const vertices: number[] = []
    const indices: number[] = []

    // Generate sphere vertices
    for (let ring = 0; ring <= rings; ring++) {
      const theta = (ring / rings) * Math.PI
      const sinTheta = Math.sin(theta)
      const cosTheta = Math.cos(theta)

      for (let seg = 0; seg <= segments; seg++) {
        const phi = (seg / segments) * 2 * Math.PI
        const sinPhi = Math.sin(phi)
        const cosPhi = Math.cos(phi)

        const x = radius * sinTheta * cosPhi
        const y = radius * cosTheta
        const z = radius * sinTheta * sinPhi

        vertices.push(x, y, z)
      }
    }

    // Generate sphere indices
    for (let ring = 0; ring < rings; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const first = ring * (segments + 1) + seg
        const second = first + segments + 1

        indices.push(first, second, first + 1)
        indices.push(second, second + 1, first + 1)
      }
    }

    const vertexData = new Float32Array(vertices)
    const indexData = new Uint16Array(indices)

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

    const data = new Float32Array(64)

    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0)
    }
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16)
    }
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32)
    }
    if (camera.position) {
      data[48] = camera.position.x
      data[49] = camera.position.y
      data[50] = camera.position.z
    }
    data[51] = camera.near || 0.1
    data[52] = camera.far || 1000
    data[53] = camera.fov || 50
    data[54] = ctx.size.width
    data[55] = ctx.size.height
    data[56] = ctx.size.width / ctx.size.height
    data[57] = ctx.frame?.time || 0
    data[58] = ctx.frame?.delta || 0.016
    data[59] = ctx.frame?.frameNumber || 0

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger

    // Pack Schroedinger uniforms
    const data = new Float32Array(256) // 1024 bytes / 4
    let offset = 0

    // Quantum mode
    data[offset++] = schroedinger?.quantumMode ?? 0 // quantumMode

    // Harmonic oscillator configuration
    data[offset++] = schroedinger?.termCount ?? 1 // termCount

    // Padding to align omega array
    offset += 2

    // omega array (11 floats)
    for (let i = 0; i < MAX_DIM; i++) {
      data[offset++] = schroedinger?.omega?.[i] ?? 1.0
    }

    // Padding
    offset += 1

    // quantum array (88 ints stored as floats for simplicity)
    for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
      data[offset++] = schroedinger?.quantum?.[i] ?? 0
    }

    // coeff array (8 vec2f = 16 floats)
    for (let i = 0; i < MAX_TERMS; i++) {
      data[offset++] = schroedinger?.coeff?.[i]?.[0] ?? (i === 0 ? 1.0 : 0.0)
      data[offset++] = schroedinger?.coeff?.[i]?.[1] ?? 0.0
    }

    // energy array (8 floats)
    for (let i = 0; i < MAX_TERMS; i++) {
      data[offset++] = schroedinger?.energy?.[i] ?? 0.5
    }

    // Volume rendering parameters
    data[offset++] = schroedinger?.timeScale ?? 1.0
    data[offset++] = schroedinger?.fieldScale ?? 1.0
    data[offset++] = schroedinger?.densityGain ?? 1.0
    data[offset++] = schroedinger?.powderScale ?? 0.5
    data[offset++] = schroedinger?.emissionIntensity ?? 1.0
    data[offset++] = schroedinger?.emissionThreshold ?? 0.01

    // Time
    data[offset++] = ctx.frame?.time ?? 0

    // Sample count
    data[offset++] = schroedinger?.sampleCount ?? 64

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, data)
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger

    const basisData = new Float32Array(48)

    // Default basis vectors
    basisData[0] = 1.0 // X basis: [1, 0, 0, ...]
    basisData[MAX_DIM + 1] = 1.0 // Y basis: [0, 1, 0, ...]
    basisData[MAX_DIM * 2 + 2] = 1.0 // Z basis: [0, 0, 1, ...]

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
        basisData[MAX_DIM + i] = basisY[i] ?? 0
      }
    }
    if (basisZ) {
      for (let i = 0; i < Math.min(basisZ.length, MAX_DIM); i++) {
        basisData[MAX_DIM * 2 + i] = basisZ[i] ?? 0
      }
    }
    if (origin) {
      for (let i = 0; i < Math.min(origin.length, MAX_DIM); i++) {
        basisData[MAX_DIM * 3 + i] = origin[i] ?? 0
      }
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, basisData)
  }

  /**
   * Update lighting uniforms from lightingStore.
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    const data = new Float32Array(128) // 512 bytes

    const lights = lighting.lights ?? []
    data[0] = Math.min(lights.length, 8)

    data[1] = lighting.ambientEnabled ? 1 : 0
    data[2] = lighting.ambientIntensity ?? 0.3
    data[3] = 0.0

    const ambientColor = this.parseColor(lighting.ambientColor ?? '#ffffff')
    data[4] = ambientColor[0]
    data[5] = ambientColor[1]
    data[6] = ambientColor[2]
    data[7] = 1.0

    for (let i = 0; i < Math.min(lights.length, 8); i++) {
      const light = lights[i]
      const offset = 8 + i * 12

      data[offset + 0] = light.type === 'directional' ? 1 : light.type === 'spot' ? 2 : 0
      data[offset + 1] = light.enabled ? 1 : 0
      data[offset + 2] = light.intensity ?? 1.0
      data[offset + 3] = light.range ?? 100.0

      data[offset + 4] = light.position?.[0] ?? 0
      data[offset + 5] = light.position?.[1] ?? 5
      data[offset + 6] = light.position?.[2] ?? 0
      data[offset + 7] = 0.0

      const lightColor = this.parseColor(light.color ?? '#ffffff')
      data[offset + 8] = lightColor[0]
      data[offset + 9] = lightColor[1]
      data[offset + 10] = lightColor[2]
      data[offset + 11] = 1.0
    }

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
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

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateSchroedingerUniforms(ctx)
    this.updateBasisVectors(ctx)
    this.updateLightingUniforms(ctx)

    // Get render target
    const colorView = ctx.getWriteTarget('hdr-color')
    if (!colorView) return

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'schroedinger-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup)
    passEncoder.setBindGroup(2, (this as any).materialBindGroup)
    passEncoder.setBindGroup(3, (this as any).qualityBindGroup)
    passEncoder.setBindGroup(4, this.objectBindGroup)

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16' as const)
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()
  }

  dispose(): void {
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.schroedingerUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
