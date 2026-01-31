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
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
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

    // Group 2: Object (Schroedinger + Basis)
    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
      ],
    })

    // Create pipeline layout - max 3 groups for now (no IBL)
    const pipelineLayout = device.createPipelineLayout({
      label: 'schroedinger-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        combinedBindGroupLayout, // Contains combined lighting+material+quality
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
        // CRITICAL: Use 'front' to match THREE.BackSide in WebGL
        // BackSide = render back faces = cull front faces
        cullMode: 'front' as const,
      },
    })

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'schroedinger-camera')
    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'schroedinger-lighting')
    // Material and Quality buffers for combined bind group
    this.materialUniformBuffer = this.createUniformBuffer(device, 128, 'schroedinger-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'schroedinger-quality')
    // Schroedinger uniforms: ~1KB for all quantum parameters
    this.schroedingerUniformBuffer = this.createUniformBuffer(device, 1024, 'schroedinger-uniforms')
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'schroedinger-basis')

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

    // Group 2: Object (Schroedinger + Basis)
    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

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

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // CameraUniforms layout (512 bytes = 128 floats):
    // 7 mat4x4f (7 × 16 floats = 112) + vec3f+f32 (4) + remaining scalars (12)
    const data = new Float32Array(128)

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
    // For Schrodinger, use identity (no scale transformation needed)
    // modelMatrix (offset 80): identity
    data[80] = 1.0; data[85] = 1.0; data[90] = 1.0; data[95] = 1.0
    // inverseModelMatrix (offset 96): identity
    data[96] = 1.0; data[101] = 1.0; data[106] = 1.0; data[111] = 1.0

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

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger
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
    const baseFrequencySpread = schroedinger?.frequencySpread ?? 0.2

    let spreadScale = 1.0
    if (spreadAnimationEnabled) {
      // Range: 0.01 (tight) to 0.45 (messy fog), like WebGL
      const t = animationTime * spreadAnimationSpeed
      const phase = (Math.sin(t) + 1.0) * 0.5 // 0 to 1
      const effectiveSpread = 0.01 + phase * 0.44
      // Scale factor relative to base spread (avoid divide by zero)
      spreadScale = baseFrequencySpread > 0.001 ? effectiveSpread / baseFrequencySpread : 1.0
    }

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
    // Apply spread animation scaling to omega values
    const omegaOffset = 16 / 4 // offset in float32 units
    for (let i = 0; i < MAX_DIM; i++) {
      const baseOmega = schroedinger?.omega?.[i] ?? 1.0
      floatView[omegaOffset + i] = baseOmega * spreadScale
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
    // Apply spread animation scaling to extra dimension omega values as well
    const extraDimOmegaOffset = 640 / 4
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      const baseOmega = schroedinger?.extraDimOmega?.[i] ?? 1.0
      floatView[extraDimOmegaOffset + i] = baseOmega * spreadScale
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

    // SSS fields (read from global appearance store, not per-object store)
    intView[720 / 4] = appearance?.sssEnabled ? 1 : 0
    floatView[724 / 4] = appearance?.sssIntensity ?? 0.0

    // sssColor (vec3f needs 16-byte alignment, so it's at 736 after implicit padding)
    // Parse hex color from appearance store
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    floatView[736 / 4] = sssColor[0]
    floatView[740 / 4] = sssColor[1]
    floatView[744 / 4] = sssColor[2]
    floatView[748 / 4] = 0.0 // _pad1

    floatView[752 / 4] = appearance?.sssThickness ?? 1.0
    floatView[756 / 4] = appearance?.sssJitter ?? 0.0

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
    floatView[908 / 4] = animationTime // time (respects animation pause state)
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
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return

    // LightingUniforms struct layout (matches Julia/other renderers):
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

    // baseColor: vec4f (offset 0-3) - includes faceOpacity for alpha
    const faceColor = this.parseColor(appearance?.faceColor ?? '#ffffff')
    data[0] = faceColor[0]
    data[1] = faceColor[1]
    data[2] = faceColor[2]
    data[3] = appearance?.faceOpacity ?? 1.0

    // metallic, roughness, reflectance, ao (offset 4-7)
    data[4] = pbr?.face?.metallic ?? 0.0
    data[5] = pbr?.face?.roughness ?? 0.5
    data[6] = pbr?.face?.reflectance ?? 0.5
    data[7] = 1.0 // ao (ambient occlusion factor)

    // emissive: vec3f + emissiveIntensity: f32 (offset 8-11)
    // Use faceColor as emissive color, scaled by faceEmission intensity
    const faceEmission = appearance?.faceEmission ?? 0.0
    data[8] = faceColor[0]
    data[9] = faceColor[1]
    data[10] = faceColor[2]
    data[11] = faceEmission

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

    // fresnelEnabled: u32 (offset 22) - uses fresnelEnabled from appearance store
    const fresnelEnabled = appearance?.fresnelEnabled ?? true
    dataView.setUint32(22 * 4, fresnelEnabled ? 1 : 0, true)

    // fresnelIntensity: f32 (offset 23) - combine with faceRimFalloff for effect strength
    const rimFalloff = appearance?.faceRimFalloff ?? 1.0
    data[23] = (appearance?.fresnelIntensity ?? 0.5) * rimFalloff

    // rimColor: vec3f (offset 24-26) - uses edgeColor from appearance store
    const rimColor = this.parseColor(appearance?.edgeColor ?? '#ffffff')
    data[24] = rimColor[0]
    data[25] = rimColor[1]
    data[26] = rimColor[2]

    // _padding2 (offset 27)
    data[27] = 0.0

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = ctx.frame?.stores?.['performance'] as any
    const lighting = ctx.frame?.stores?.['lighting'] as any
    const environment = ctx.frame?.stores?.['environment'] as any
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as any

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

    // Quality multiplier affects ray march quality
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    data[1] = 0.001 / qualityMultiplier // sdfSurfaceDistance (smaller = more precise)
    data[3] = lighting?.shadowSoftness ?? 0.5 // shadowSoftness
    data[6] = performance?.aoRadius ?? 0.5 // aoRadius
    data[7] = performance?.aoIntensity ?? 1.0 // aoIntensity
    data[9] = environment?.iblIntensity ?? 1.0 // iblIntensity
    data[10] = qualityMultiplier // qualityMultiplier

    const dataView = new DataView(data.buffer)
    dataView.setInt32(0 * 4, Math.floor(128 * qualityMultiplier), true) // sdfMaxIterations
    dataView.setInt32(2 * 4, lighting?.shadowEnabled ? (lighting?.shadowQuality ?? 2) : 0, true) // shadowQuality
    // aoEnabled: Use postProcessing.ssaoEnabled (global toggle) like WebGL
    dataView.setInt32(4 * 4, postProcessing?.ssaoEnabled ? 1 : 0, true) // aoEnabled
    dataView.setInt32(5 * 4, Math.floor(4 * qualityMultiplier), true) // aoSamples
    dataView.setInt32(8 * 4, environment?.iblQuality ?? 1, true) // iblQuality

    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, data)
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
    this.updateMaterialUniforms(ctx)
    this.updateQualityUniforms(ctx)

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

    // Set pipeline and bind groups - consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Schroedinger + Basis)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)

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
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.schroedingerUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
