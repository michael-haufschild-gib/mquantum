/**
 * WebGPU Black Hole Renderer
 *
 * Renders N-dimensional Kerr black holes using WebGPU compute and render pipelines.
 * Supports gravitational lensing, accretion disk, photon shell, and Doppler effects.
 *
 * @module rendering/webgpu/renderers/WebGPUBlackHoleRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeBlackHoleShader,
  composeBlackHoleVertexShader,
  type BlackHoleWGSLShaderConfig,
} from '../shaders/blackhole/compose'
import {
  MAX_DIMENSION,
  PALETTE_MODE_MAP,
  RAY_BENDING_MODE_MAP,
  MANIFOLD_TYPE_MAP,
  LIGHTING_MODE_MAP,
} from '../../renderers/BlackHole/types'

export interface BlackHoleRendererConfig {
  dimension?: number
  doppler?: boolean
  envMap?: boolean
  motionBlur?: boolean
}

/**
 * WebGPU renderer for Kerr black holes with gravitational lensing.
 */
export class WebGPUBlackHoleRenderer extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null
  // Uses fullscreen vertex buffer from base class (no custom geometry needed)

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
  private blackHoleUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null

  // Configuration
  private rendererConfig: BlackHoleRendererConfig
  private shaderConfig: BlackHoleWGSLShaderConfig

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  constructor(config?: BlackHoleRendererConfig) {
    super({
      id: 'blackhole',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'hdr-color', access: 'write', binding: 0 }],
    })

    this.rendererConfig = {
      dimension: 4,
      doppler: true,
      envMap: false,
      motionBlur: false,
      ...config,
    }

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      doppler: this.rendererConfig.doppler,
      envMap: this.rendererConfig.envMap,
      motionBlur: this.rendererConfig.motionBlur,
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

    // Compose shaders
    const { wgsl: fragmentShader } = composeBlackHoleShader(this.shaderConfig)
    const vertexShader = composeBlackHoleVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'blackhole-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'blackhole-fragment')

    // Create bind group layouts - consolidated to stay within 4-group limit
    // Group 0: Camera
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-camera-bgl',
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
      label: 'blackhole-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Quality
      ],
    })

    // Group 2: Object (BlackHole + Basis)
    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // BlackHole uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
      ],
    })

    // Create pipeline layout - max 3 groups for now (no env map)
    const pipelineLayout = device.createPipelineLayout({
      label: 'blackhole-pipeline-layout',
      bindGroupLayouts: [
        cameraBindGroupLayout,
        combinedBindGroupLayout, // Contains combined lighting+material+quality
        objectBindGroupLayout,
      ],
    })

    // Create render pipeline (fullscreen quad)
    this.renderPipeline = device.createRenderPipeline({
      label: 'blackhole-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [this.getFullscreenVertexLayout()],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        // No culling needed for fullscreen quad
        cullMode: 'none' as const,
      },
    })

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + scalars (32) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'blackhole-camera')
    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'blackhole-lighting')
    // Material and Quality buffers for combined bind group
    // MaterialUniforms: 160 bytes (vec3f has 16-byte alignment in WGSL)
    this.materialUniformBuffer = this.createUniformBuffer(device, 160, 'blackhole-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'blackhole-quality')
    // BlackHole uniforms: 672 bytes (matches BlackHoleUniforms struct with color algorithm fields)
    this.blackHoleUniformBuffer = this.createUniformBuffer(device, 672, 'blackhole-uniforms')
    // Basis vectors: 176 bytes (4 * 11 floats * 4 bytes = 176)
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'blackhole-basis')

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'blackhole-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'blackhole-combined-bg',
      layout: combinedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: this.materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.qualityUniformBuffer } },
      ],
    })

    // Group 2: Object (BlackHole + Basis)
    this.objectBindGroup = device.createBindGroup({
      label: 'blackhole-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.blackHoleUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

    // Fullscreen vertex buffer is provided by base class (getFullscreenVertexBuffer)
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

    // Get scale for model matrix (BlackHole uses scale=1 typically)
    const extended = ctx.frame?.stores?.['extended'] as any
    const scale = extended?.blackhole?.scale ?? 1.0

    // Pack camera uniforms (must match shader struct layout)
    // CameraUniforms struct layout:
    // - viewMatrix: mat4x4f (offset 0, 16 floats)
    // - projectionMatrix: mat4x4f (offset 16, 16 floats)
    // - viewProjectionMatrix: mat4x4f (offset 32, 16 floats)
    // - inverseViewMatrix: mat4x4f (offset 48, 16 floats)
    // - inverseProjectionMatrix: mat4x4f (offset 64, 16 floats)
    // - modelMatrix: mat4x4f (offset 80, 16 floats)
    // - inverseModelMatrix: mat4x4f (offset 96, 16 floats)
    // - cameraPosition: vec3f (offset 112, 3 floats)
    // - cameraNear: f32 (offset 115, 1 float)
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

    // modelMatrix (16 floats, offset 80) - scale matrix
    data[80] = scale; data[81] = 0; data[82] = 0; data[83] = 0
    data[84] = 0; data[85] = scale; data[86] = 0; data[87] = 0
    data[88] = 0; data[89] = 0; data[90] = scale; data[91] = 0
    data[92] = 0; data[93] = 0; data[94] = 0; data[95] = 1

    // inverseModelMatrix (16 floats, offset 96)
    const invScale = 1.0 / scale
    data[96] = invScale; data[97] = 0; data[98] = 0; data[99] = 0
    data[100] = 0; data[101] = invScale; data[102] = 0; data[103] = 0
    data[104] = 0; data[105] = 0; data[106] = invScale; data[107] = 0
    data[108] = 0; data[109] = 0; data[110] = 0; data[111] = 1

    // cameraPosition (3 floats) + cameraNear (1 float), offset 112
    if (camera.position) {
      data[112] = camera.position.x ?? 0
      data[113] = camera.position.y ?? 0
      data[114] = camera.position.z ?? 0
    }
    data[115] = camera.near ?? 0.1

    // cameraFar, fov, resolution, aspectRatio, time, deltaTime (offset 116-122)
    data[116] = camera.far ?? 1000
    data[117] = camera.fov ?? 50
    data[118] = ctx.size.width
    data[119] = ctx.size.height
    data[120] = ctx.size.width / ctx.size.height
    data[121] = animationTime
    data[122] = ctx.frame?.delta ?? 0.016

    // frameNumber as u32 - use DataView for proper type
    const dataView = new DataView(data.buffer)
    dataView.setUint32(123 * 4, ctx.frame?.frameNumber ?? 0, true)

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update black hole uniforms from stores.
   * @param ctx
   */
  updateBlackHoleUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.blackHoleUniformBuffer) return

    // Get black hole data from extendedObjectStore
    const extended = ctx.frame?.stores?.['extended'] as any
    const blackhole = extended?.blackhole
    const performance = ctx.frame?.stores?.['performance'] as any
    // Get appearance data for SSS/Fresnel (global appearance controls)
    const appearance = ctx.frame?.stores?.['appearance'] as any
    // Get gravity settings from postProcessing store (controlled by UI slider)
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as any
    // Get dimension from geometry store
    const geometryStore = ctx.frame?.stores?.['geometry'] as any
    const dimension = geometryStore?.dimension ?? this.rendererConfig.dimension ?? 4

    // Pack black hole uniforms (must match BlackHoleUniforms struct layout)
    // Total size: 672 bytes = 168 floats (including color algorithm fields)
    const data = new Float32Array(168)
    const dataView = new DataView(data.buffer) // For proper integer packing
    let offset = 0

    // Physics (Kerr black hole)
    data[offset++] = blackhole?.horizonRadius ?? 0.5 // horizonRadius
    data[offset++] = blackhole?.visualEventHorizon ?? 1.285 // visualEventHorizon
    data[offset++] = blackhole?.spin ?? 0.0 // spin
    data[offset++] = blackhole?.diskTemperature ?? 6500.0 // diskTemperature

    data[offset++] = postProcessing?.gravityStrength ?? 1.0 // gravityStrength (from global postProcessing)
    data[offset++] = blackhole?.manifoldIntensity ?? 1.0 // manifoldIntensity
    data[offset++] = blackhole?.manifoldThickness ?? 0.15 // manifoldThickness
    data[offset++] = blackhole?.photonShellWidth ?? 0.05 // photonShellWidth

    data[offset++] = blackhole?.timeScale ?? 1.0 // timeScale

    // baseColor (vec3f) + paletteMode (i32)
    const baseColor = blackhole?.baseColor ?? { r: 1.0, g: 0.96, b: 0.9 }
    data[offset++] = baseColor.r ?? 1.0
    data[offset++] = baseColor.g ?? 0.96
    data[offset++] = baseColor.b ?? 0.9
    dataView.setInt32(offset * 4, PALETTE_MODE_MAP[blackhole?.paletteMode] ?? 0, true) // paletteMode
    offset++

    data[offset++] = blackhole?.bloomBoost ?? 1.5 // bloomBoost

    // Lensing
    data[offset++] = blackhole?.dimensionEmphasis ?? 0.8 // dimensionEmphasis
    data[offset++] = blackhole?.distanceFalloff ?? 1.6 // distanceFalloff
    data[offset++] = blackhole?.epsilonMul ?? 0.01 // epsilonMul

    data[offset++] = postProcessing?.gravityDistortionScale ?? 1.0 // bendScale (from global postProcessing)
    data[offset++] = blackhole?.bendMaxPerStep ?? 0.25 // bendMaxPerStep
    data[offset++] = blackhole?.lensingClamp ?? 10.0 // lensingClamp
    dataView.setInt32(offset * 4, RAY_BENDING_MODE_MAP[blackhole?.rayBendingMode] ?? 0, true) // rayBendingMode
    offset++

    data[offset++] = blackhole?.dimPower ?? 1.0 // dimPower
    data[offset++] = blackhole?.originOffsetLengthSq ?? 0.0 // originOffsetLengthSq

    // Pre-computed lensing falloff boundaries
    const horizonRadius = blackhole?.horizonRadius ?? 0.5
    data[offset++] = blackhole?.lensingFalloffStart ?? horizonRadius * 3.5 // lensingFalloffStart
    data[offset++] = blackhole?.lensingFalloffEnd ?? horizonRadius * 8.0 // lensingFalloffEnd
    data[offset++] = blackhole?.horizonRadiusInv ?? 1.0 / horizonRadius // horizonRadiusInv

    // Photon shell
    data[offset++] = blackhole?.photonShellRadiusMul ?? 1.3 // photonShellRadiusMul
    data[offset++] = blackhole?.photonShellRadiusDimBias ?? 0.1 // photonShellRadiusDimBias
    data[offset++] = blackhole?.shellGlowStrength ?? 3.0 // shellGlowStrength

    // shellGlowColor (vec3f) + padding
    const shellColor = blackhole?.shellGlowColor ?? { r: 1.0, g: 1.0, b: 1.0 }
    data[offset++] = shellColor.r ?? 1.0
    data[offset++] = shellColor.g ?? 1.0
    data[offset++] = shellColor.b ?? 1.0
    data[offset++] = 0.0 // _padding1

    data[offset++] = blackhole?.shellStepMul ?? 0.35 // shellStepMul
    data[offset++] = blackhole?.shellContrastBoost ?? 1.0 // shellContrastBoost
    data[offset++] = blackhole?.shellRpPrecomputed ?? 1.48 // shellRpPrecomputed
    data[offset++] = blackhole?.shellDeltaPrecomputed ?? 0.32 // shellDeltaPrecomputed

    // Manifold / Accretion
    dataView.setInt32(offset * 4, MANIFOLD_TYPE_MAP[blackhole?.manifoldType] ?? 0, true) // manifoldType (i32)
    offset++
    data[offset++] = blackhole?.densityFalloff ?? 6.0 // densityFalloff
    data[offset++] = blackhole?.diskInnerRadiusMul ?? 4.23 // diskInnerRadiusMul
    data[offset++] = blackhole?.diskOuterRadiusMul ?? 15.0 // diskOuterRadiusMul

    data[offset++] = blackhole?.diskInnerR ?? horizonRadius * 4.23 // diskInnerR
    data[offset++] = blackhole?.diskOuterR ?? horizonRadius * 15.0 // diskOuterR
    data[offset++] = blackhole?.effectiveThickness ?? 0.15 // effectiveThickness
    data[offset++] = blackhole?.radialSoftnessMul ?? 0.2 // radialSoftnessMul

    data[offset++] = blackhole?.thicknessPerDimMax ?? 4.0 // thicknessPerDimMax
    data[offset++] = blackhole?.highDimWScale ?? 2.0 // highDimWScale
    data[offset++] = blackhole?.swirlAmount ?? 0.6 // swirlAmount
    data[offset++] = blackhole?.noiseScale ?? 1.0 // noiseScale

    data[offset++] = blackhole?.noiseAmount ?? 0.25 // noiseAmount
    data[offset++] = blackhole?.multiIntersectionGain ?? 1.0 // multiIntersectionGain

    // Rendering quality (from blackhole store - controlled by UI sliders in BlackHoleAdvanced)
    dataView.setInt32(offset * 4, blackhole?.maxSteps ?? 256, true) // maxSteps (i32)
    offset++
    data[offset++] = blackhole?.stepBase ?? 0.08 // stepBase

    data[offset++] = blackhole?.stepMin ?? 0.01 // stepMin
    data[offset++] = blackhole?.stepMax ?? 0.2 // stepMax
    data[offset++] = blackhole?.stepAdaptG ?? 1.0 // stepAdaptG
    data[offset++] = blackhole?.stepAdaptR ?? 0.2 // stepAdaptR

    dataView.setUint32(offset * 4, blackhole?.enableAbsorption ? 1 : 0, true) // enableAbsorption (u32)
    offset++
    data[offset++] = blackhole?.absorption ?? 1.0 // absorption
    data[offset++] = blackhole?.transmittanceCutoff ?? 0.01 // transmittanceCutoff
    data[offset++] = blackhole?.farRadius ?? 35.0 // farRadius

    dataView.setUint32(offset * 4, blackhole?.ultraFastMode ? 1 : 0, true) // ultraFastMode (u32)
    offset++

    // Lighting
    dataView.setInt32(offset * 4, LIGHTING_MODE_MAP[blackhole?.lightingMode] ?? 0, true) // lightingMode (i32)
    offset++
    data[offset++] = blackhole?.roughness ?? 0.6 // roughness
    data[offset++] = blackhole?.specular ?? 0.2 // specular

    data[offset++] = blackhole?.ambientTint ?? 0.1 // ambientTint
    data[offset++] = blackhole?.envMapReady ?? 0.0 // envMapReady

    // Doppler effect
    dataView.setUint32(offset * 4, blackhole?.dopplerEnabled ? 1 : 0, true) // dopplerEnabled (u32)
    offset++
    data[offset++] = blackhole?.dopplerStrength ?? 0.6 // dopplerStrength

    // Motion blur
    dataView.setUint32(offset * 4, blackhole?.motionBlurEnabled ? 1 : 0, true) // motionBlurEnabled (u32)
    offset++
    data[offset++] = blackhole?.motionBlurStrength ?? 0.5 // motionBlurStrength
    dataView.setInt32(offset * 4, blackhole?.motionBlurSamples ?? 4, true) // motionBlurSamples (i32)
    offset++
    data[offset++] = blackhole?.motionBlurRadialFalloff ?? 1.0 // motionBlurRadialFalloff

    // SSS (from global appearance store, not per-object blackhole store)
    dataView.setUint32(offset * 4, appearance?.sssEnabled ? 1 : 0, true) // sssEnabled (u32)
    offset++
    data[offset++] = appearance?.sssIntensity ?? 1.0 // sssIntensity

    // sssColor (vec3f) + padding - parse from hex string
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    data[offset++] = sssColor[0]
    data[offset++] = sssColor[1]
    data[offset++] = sssColor[2]
    data[offset++] = 0.0 // _padding2

    data[offset++] = appearance?.sssThickness ?? 1.0 // sssThickness
    data[offset++] = appearance?.sssJitter ?? 0.2 // sssJitter

    // Animation state
    dataView.setUint32(offset * 4, blackhole?.pulseEnabled ? 1 : 0, true) // pulseEnabled (u32)
    offset++
    data[offset++] = blackhole?.pulseSpeed ?? 0.3 // pulseSpeed

    data[offset++] = blackhole?.pulseAmount ?? 0.2 // pulseAmount

    // Keplerian disk rotation
    data[offset++] = blackhole?.diskRotationAngle ?? 0.0 // diskRotationAngle
    data[offset++] = blackhole?.keplerianDifferential ?? 0.5 // keplerianDifferential

    // Temporal accumulation
    data[offset++] = blackhole?.bayerOffset?.x ?? 0.0 // bayerOffset.x
    data[offset++] = blackhole?.bayerOffset?.y ?? 0.0 // bayerOffset.y
    data[offset++] = ctx.size.width // fullResolution.x
    data[offset++] = ctx.size.height // fullResolution.y

    // Color algorithm settings
    // Get color settings from color slice if available
    const colorStore = ctx.frame?.stores?.['color'] as any
    dataView.setInt32(offset * 4, colorStore?.colorAlgorithm ?? 0, true) // colorAlgorithm (i32)
    offset++
    dataView.setInt32(offset * 4, dimension, true) // dimension (i32)
    offset++
    dataView.setUint32(offset * 4, blackhole?.fastMode ? 1 : 0, true) // fastMode (u32)
    offset++
    data[offset++] = 0.0 // _padding3

    // Cosine palette coefficients
    const cosineA = colorStore?.cosineA ?? { r: 0.5, g: 0.5, b: 0.5 }
    data[offset++] = cosineA.r ?? 0.5
    data[offset++] = cosineA.g ?? 0.5
    data[offset++] = cosineA.b ?? 0.5
    data[offset++] = 0.0 // _padding4

    const cosineB = colorStore?.cosineB ?? { r: 0.5, g: 0.5, b: 0.5 }
    data[offset++] = cosineB.r ?? 0.5
    data[offset++] = cosineB.g ?? 0.5
    data[offset++] = cosineB.b ?? 0.5
    data[offset++] = 0.0 // _padding5

    const cosineC = colorStore?.cosineC ?? { r: 1.0, g: 1.0, b: 1.0 }
    data[offset++] = cosineC.r ?? 1.0
    data[offset++] = cosineC.g ?? 1.0
    data[offset++] = cosineC.b ?? 1.0
    data[offset++] = 0.0 // _padding6

    const cosineD = colorStore?.cosineD ?? { r: 0.0, g: 0.33, b: 0.67 }
    data[offset++] = cosineD.r ?? 0.0
    data[offset++] = cosineD.g ?? 0.33
    data[offset++] = cosineD.b ?? 0.67
    data[offset++] = 0.0 // _padding7

    // LCH color space settings
    data[offset++] = colorStore?.lchLightness ?? 0.75 // lchLightness
    data[offset++] = colorStore?.lchChroma ?? 0.15 // lchChroma
    data[offset++] = 0.0 // _padding8.x
    data[offset++] = 0.0 // _padding8.y

    this.writeUniformBuffer(this.device, this.blackHoleUniformBuffer, data)
  }

  /**
   * Update basis vectors for N-dimensional projection.
   * @param ctx
   */
  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const blackhole = extended?.blackhole

    // BasisVectors struct uses array<vec4f, 3> for each member (48 floats total)
    // Stride is 12 (not MAX_DIMENSION=11) because array<vec4f, 3> = 3 * 4 = 12 floats
    const STRIDE = 12
    const basisData = new Float32Array(48)

    // Default basis vectors for 3D slice of N-D space
    // X basis: [1, 0, 0, 0, ...]
    basisData[0] = 1.0

    // Y basis: [0, 1, 0, 0, ...]
    basisData[STRIDE + 1] = 1.0

    // Z basis: [0, 0, 1, 0, ...]
    basisData[STRIDE * 2 + 2] = 1.0

    // Origin: [0, 0, 0, ...]
    // Already zero-initialized

    // If basis vectors are provided from stores, use them
    const basisX = blackhole?.basisX as Float32Array | undefined
    const basisY = blackhole?.basisY as Float32Array | undefined
    const basisZ = blackhole?.basisZ as Float32Array | undefined
    const origin = blackhole?.origin as Float32Array | undefined

    if (basisX) {
      for (let i = 0; i < Math.min(basisX.length, MAX_DIMENSION); i++) {
        basisData[i] = basisX[i] ?? 0
      }
    }
    if (basisY) {
      for (let i = 0; i < Math.min(basisY.length, MAX_DIMENSION); i++) {
        basisData[STRIDE + i] = basisY[i] ?? 0
      }
    }
    if (basisZ) {
      for (let i = 0; i < Math.min(basisZ.length, MAX_DIMENSION); i++) {
        basisData[STRIDE * 2 + i] = basisZ[i] ?? 0
      }
    }
    if (origin) {
      for (let i = 0; i < Math.min(origin.length, MAX_DIMENSION); i++) {
        basisData[STRIDE * 3 + i] = origin[i] ?? 0
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
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.objectBindGroup
    ) {
      return
    }

    // Update all uniforms from stores
    this.updateCameraUniforms(ctx)
    this.updateBlackHoleUniforms(ctx)
    this.updateBasisVectors(ctx)
    this.updateLightingUniforms(ctx)
    this.updateMaterialUniforms(ctx)
    this.updateQualityUniforms(ctx)

    // Get render target
    const colorView = ctx.getWriteTarget('hdr-color')
    if (!colorView) return

    // Get fullscreen vertex buffer from base class
    const vertexBuffer = this.getFullscreenVertexBuffer(this.device)

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'blackhole-render',
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
    // Group 2: Object (BlackHole + Basis)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)

    // Draw fullscreen triangle (3 vertices, no index buffer)
    passEncoder.setVertexBuffer(0, vertexBuffer)
    passEncoder.draw(3)

    passEncoder.end()

    // Update draw statistics (fullscreen triangle = 1 triangle covering screen)
    this.lastDrawStats = {
      calls: 1,
      triangles: 1,
      vertices: 3,
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
    // Note: fullscreen vertex buffer is shared and managed by base class
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.blackHoleUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.blackHoleUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
