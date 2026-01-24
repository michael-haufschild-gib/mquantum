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

    // Allocate buffer for the entire SchroedingerUniforms struct
    // See uniforms.wgsl.ts for the exact layout with packed arrays
    const buffer = new ArrayBuffer(1024)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

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

    // --- Scalars (offset 0-15) ---
    intView[0] = schroedinger?.quantumMode ?? 0 // quantumMode
    intView[1] = schroedinger?.termCount ?? 1 // termCount
    intView[2] = 0 // _padScalar0
    intView[3] = 0 // _padScalar1

    // --- omega array (offset 16, 3 vec4f = 12 floats, use 11) ---
    const omegaOffset = 16 / 4 // offset in float32 units
    for (let i = 0; i < MAX_DIM; i++) {
      floatView[omegaOffset + i] = schroedinger?.omega?.[i] ?? 1.0
    }
    floatView[omegaOffset + 11] = 0.0 // padding slot

    // --- quantum array (offset 64, 22 vec4i = 88 ints) ---
    const quantumOffset = 64 / 4 // offset in int32 units
    for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
      intView[quantumOffset + i] = schroedinger?.quantum?.[i] ?? 0
    }

    // --- coeff array (offset 416, 8 vec4f, xy = complex value, zw = padding) ---
    const coeffOffset = 416 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      const baseIdx = coeffOffset + i * 4
      floatView[baseIdx] = schroedinger?.coeff?.[i]?.[0] ?? (i === 0 ? 1.0 : 0.0) // real
      floatView[baseIdx + 1] = schroedinger?.coeff?.[i]?.[1] ?? 0.0 // imag
      floatView[baseIdx + 2] = 0.0 // padding
      floatView[baseIdx + 3] = 0.0 // padding
    }

    // --- energy array (offset 544, 2 vec4f = 8 floats) ---
    const energyOffset = 544 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      floatView[energyOffset + i] = schroedinger?.energy?.[i] ?? 0.5
    }

    // --- Hydrogen scalar fields (offset 576-607) ---
    intView[576 / 4] = schroedinger?.principalN ?? 1
    intView[580 / 4] = schroedinger?.azimuthalL ?? 0
    intView[584 / 4] = schroedinger?.magneticM ?? 0
    floatView[588 / 4] = schroedinger?.bohrRadius ?? 1.0
    intView[592 / 4] = schroedinger?.useRealOrbitals ? 1 : 0
    floatView[596 / 4] = schroedinger?.hydrogenBoost ?? 50.0
    floatView[600 / 4] = schroedinger?.hydrogenNDBoost ?? 50.0
    floatView[604 / 4] = schroedinger?.hydrogenRadialThreshold ?? 25.0

    // --- extraDimN array (offset 608, 2 vec4i = 8 ints) ---
    const extraDimNOffset = 608 / 4
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      intView[extraDimNOffset + i] = schroedinger?.extraDimN?.[i] ?? 0
    }

    // --- extraDimOmega array (offset 640, 2 vec4f = 8 floats) ---
    const extraDimOmegaOffset = 640 / 4
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      floatView[extraDimOmegaOffset + i] = schroedinger?.extraDimOmega?.[i] ?? 1.0
    }

    // --- More scalar fields (offset 672+) ---
    intView[672 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
    floatView[676 / 4] = schroedinger?.timeScale ?? 1.0
    floatView[680 / 4] = schroedinger?.fieldScale ?? 1.0
    floatView[684 / 4] = schroedinger?.densityGain ?? 1.0
    floatView[688 / 4] = schroedinger?.powderScale ?? 0.5
    floatView[692 / 4] = schroedinger?.emissionIntensity ?? 1.0
    floatView[696 / 4] = schroedinger?.emissionThreshold ?? 0.01
    floatView[700 / 4] = schroedinger?.emissionColorShift ?? 0.0
    intView[704 / 4] = schroedinger?.emissionPulsing ? 1 : 0
    floatView[708 / 4] = schroedinger?.rimExponent ?? 3.0
    floatView[712 / 4] = schroedinger?.scatteringAnisotropy ?? 0.0
    floatView[716 / 4] = schroedinger?.roughness ?? 0.5

    // SSS fields
    intView[720 / 4] = schroedinger?.sssEnabled ? 1 : 0
    floatView[724 / 4] = schroedinger?.sssIntensity ?? 0.0

    // sssColor (vec3f needs 16-byte alignment, so it's at 736 after implicit padding)
    floatView[736 / 4] = schroedinger?.sssColor?.[0] ?? 1.0
    floatView[740 / 4] = schroedinger?.sssColor?.[1] ?? 0.8
    floatView[744 / 4] = schroedinger?.sssColor?.[2] ?? 0.6
    floatView[748 / 4] = 0.0 // _pad1

    floatView[752 / 4] = schroedinger?.sssThickness ?? 1.0
    floatView[756 / 4] = schroedinger?.sssJitter ?? 0.0

    // Erosion fields
    floatView[760 / 4] = schroedinger?.erosionStrength ?? 0.0
    floatView[764 / 4] = schroedinger?.erosionScale ?? 1.0
    floatView[768 / 4] = schroedinger?.erosionTurbulence ?? 0.0
    intView[772 / 4] = schroedinger?.erosionNoiseType ?? 0

    // Curl fields
    intView[776 / 4] = schroedinger?.curlEnabled ? 1 : 0
    floatView[780 / 4] = schroedinger?.curlStrength ?? 0.0
    floatView[784 / 4] = schroedinger?.curlScale ?? 1.0
    floatView[788 / 4] = schroedinger?.curlSpeed ?? 1.0
    intView[792 / 4] = schroedinger?.curlBias ?? 0

    // Dispersion fields
    intView[796 / 4] = schroedinger?.dispersionEnabled ? 1 : 0
    floatView[800 / 4] = schroedinger?.dispersionStrength ?? 0.0
    intView[804 / 4] = schroedinger?.dispersionDirection ?? 0
    intView[808 / 4] = schroedinger?.dispersionQuality ?? 0

    // Shadow fields
    intView[812 / 4] = schroedinger?.shadowsEnabled ? 1 : 0
    floatView[816 / 4] = schroedinger?.shadowStrength ?? 0.5
    intView[820 / 4] = schroedinger?.shadowSteps ?? 4

    // AO fields
    floatView[824 / 4] = schroedinger?.aoStrength ?? 0.5
    intView[828 / 4] = schroedinger?.aoSteps ?? 4
    floatView[832 / 4] = schroedinger?.aoRadius ?? 0.5

    // aoColor (vec3f needs 16-byte alignment at offset 848 after padding)
    floatView[848 / 4] = schroedinger?.aoColor?.[0] ?? 0.0
    floatView[852 / 4] = schroedinger?.aoColor?.[1] ?? 0.0
    floatView[856 / 4] = schroedinger?.aoColor?.[2] ?? 0.0
    floatView[860 / 4] = 0.0 // _pad2

    // Nodal fields
    intView[864 / 4] = schroedinger?.nodalEnabled ? 1 : 0

    // nodalColor (vec3f at offset 880 after padding)
    floatView[880 / 4] = schroedinger?.nodalColor?.[0] ?? 1.0
    floatView[884 / 4] = schroedinger?.nodalColor?.[1] ?? 1.0
    floatView[888 / 4] = schroedinger?.nodalColor?.[2] ?? 1.0
    floatView[892 / 4] = schroedinger?.nodalStrength ?? 0.5

    // More fields
    intView[896 / 4] = schroedinger?.energyColorEnabled ? 1 : 0
    intView[900 / 4] = schroedinger?.shimmerEnabled ? 1 : 0
    floatView[904 / 4] = schroedinger?.shimmerStrength ?? 0.1
    floatView[908 / 4] = ctx.frame?.time ?? 0 // time
    intView[912 / 4] = schroedinger?.isoEnabled ? 1 : 0
    floatView[916 / 4] = schroedinger?.isoThreshold ?? -2.0
    intView[920 / 4] = schroedinger?.sampleCount ?? 64

    // Phase shift fields
    intView[924 / 4] = schroedinger?.phaseEnabled ? 1 : 0
    floatView[928 / 4] = schroedinger?.phaseTheta ?? 0.0
    floatView[932 / 4] = schroedinger?.phasePhi ?? 0.0
    floatView[936 / 4] = 0.0 // _pad3

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, floatView)
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger

    // BasisVectors struct uses array<vec4f, 3> for each member (48 floats total)
    // Stride is 12 (not 11) because array<vec4f, 3> = 3 * 4 = 12 floats
    const STRIDE = 12
    const basisData = new Float32Array(48)

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
    if (origin) {
      for (let i = 0; i < Math.min(origin.length, MAX_DIM); i++) {
        basisData[STRIDE * 3 + i] = origin[i] ?? 0
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
