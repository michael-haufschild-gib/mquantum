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
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private blackHoleUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Bind groups
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null

  // Configuration
  private rendererConfig: BlackHoleRendererConfig
  private shaderConfig: BlackHoleWGSLShaderConfig

  // Geometry
  private indexCount = 0

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

    // Create bind group layouts
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

    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-lighting-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const materialBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-material-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const qualityBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-quality-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      ],
    })

    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'blackhole-object-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // BlackHole uniforms
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
      ],
    })

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'blackhole-pipeline-layout',
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
      label: 'blackhole-pipeline',
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
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: 'back' as const,
      },
    })

    // Create uniform buffers
    // Camera: 256 bytes (matches CameraUniforms struct)
    this.cameraUniformBuffer = this.createUniformBuffer(device, 256, 'blackhole-camera')
    // Lighting: 512 bytes (multi-light system)
    this.lightingUniformBuffer = this.createUniformBuffer(device, 512, 'blackhole-lighting')
    // BlackHole uniforms: 576 bytes (matches BlackHoleUniforms struct - carefully sized)
    this.blackHoleUniformBuffer = this.createUniformBuffer(device, 576, 'blackhole-uniforms')
    // Basis vectors: 176 bytes (4 * 11 floats * 4 bytes = 176)
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'blackhole-basis')

    // Create bind groups
    this.cameraBindGroup = device.createBindGroup({
      label: 'blackhole-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    this.lightingBindGroup = device.createBindGroup({
      label: 'blackhole-lighting-bg',
      layout: lightingBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightingUniformBuffer } }],
    })

    // Create placeholder bind groups for material and quality
    const placeholderBuffer = this.createUniformBuffer(device, 128, 'blackhole-placeholder')
    const materialBindGroup = device.createBindGroup({
      label: 'blackhole-material-bg',
      layout: materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: placeholderBuffer } }],
    })

    const qualityBindGroup = device.createBindGroup({
      label: 'blackhole-quality-bg',
      layout: qualityBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: placeholderBuffer } }],
    })

    this.objectBindGroup = device.createBindGroup({
      label: 'blackhole-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.blackHoleUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
      ],
    })

    // Store placeholder bind groups for rendering
    ;(this as any).materialBindGroup = materialBindGroup
    ;(this as any).qualityBindGroup = qualityBindGroup

    // Create bounding geometry (sphere for black hole)
    this.createBoundingGeometry(device)
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Create a sphere for raymarching
    const radius = 50.0 // Large sphere to contain the far radius
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
      label: 'blackhole-vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData)

    this.indexBuffer = device.createBuffer({
      label: 'blackhole-indices',
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.indexBuffer, 0, indexData)

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
    data[59] = ctx.frame?.frameNumber || 0

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Update black hole uniforms from stores.
   */
  updateBlackHoleUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.blackHoleUniformBuffer) return

    // Get black hole data from extendedObjectStore
    const extended = ctx.frame?.stores?.['extended'] as any
    const blackhole = extended?.blackhole
    const quality = ctx.frame?.stores?.['quality'] as any

    // Pack black hole uniforms (must match BlackHoleUniforms struct layout)
    // Total size: 576 bytes = 144 floats
    const data = new Float32Array(144)
    let offset = 0

    // Physics (Kerr black hole)
    data[offset++] = blackhole?.horizonRadius ?? 0.5 // horizonRadius
    data[offset++] = blackhole?.visualEventHorizon ?? 1.285 // visualEventHorizon
    data[offset++] = blackhole?.spin ?? 0.0 // spin
    data[offset++] = blackhole?.diskTemperature ?? 6500.0 // diskTemperature

    data[offset++] = blackhole?.gravityStrength ?? 1.0 // gravityStrength
    data[offset++] = blackhole?.manifoldIntensity ?? 1.0 // manifoldIntensity
    data[offset++] = blackhole?.manifoldThickness ?? 0.15 // manifoldThickness
    data[offset++] = blackhole?.photonShellWidth ?? 0.05 // photonShellWidth

    data[offset++] = blackhole?.timeScale ?? 1.0 // timeScale

    // baseColor (vec3f) + paletteMode (i32)
    const baseColor = blackhole?.baseColor ?? { r: 1.0, g: 0.96, b: 0.9 }
    data[offset++] = baseColor.r ?? 1.0
    data[offset++] = baseColor.g ?? 0.96
    data[offset++] = baseColor.b ?? 0.9
    data[offset++] = PALETTE_MODE_MAP[blackhole?.paletteMode] ?? 0 // paletteMode

    data[offset++] = blackhole?.bloomBoost ?? 1.5 // bloomBoost

    // Lensing
    data[offset++] = blackhole?.dimensionEmphasis ?? 0.8 // dimensionEmphasis
    data[offset++] = blackhole?.distanceFalloff ?? 1.6 // distanceFalloff
    data[offset++] = blackhole?.epsilonMul ?? 0.01 // epsilonMul

    data[offset++] = blackhole?.bendScale ?? 1.0 // bendScale
    data[offset++] = blackhole?.bendMaxPerStep ?? 0.25 // bendMaxPerStep
    data[offset++] = blackhole?.lensingClamp ?? 10.0 // lensingClamp
    data[offset++] = RAY_BENDING_MODE_MAP[blackhole?.rayBendingMode] ?? 0 // rayBendingMode

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
    data[offset++] = MANIFOLD_TYPE_MAP[blackhole?.manifoldType] ?? 0 // manifoldType (i32)
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

    // Rendering quality
    data[offset++] = quality?.maxSteps ?? 256 // maxSteps (i32)
    data[offset++] = quality?.stepBase ?? 0.08 // stepBase

    data[offset++] = quality?.stepMin ?? 0.01 // stepMin
    data[offset++] = quality?.stepMax ?? 0.2 // stepMax
    data[offset++] = quality?.stepAdaptG ?? 1.0 // stepAdaptG
    data[offset++] = quality?.stepAdaptR ?? 0.2 // stepAdaptR

    data[offset++] = blackhole?.enableAbsorption ? 1 : 0 // enableAbsorption (u32)
    data[offset++] = blackhole?.absorption ?? 1.0 // absorption
    data[offset++] = blackhole?.transmittanceCutoff ?? 0.01 // transmittanceCutoff
    data[offset++] = blackhole?.farRadius ?? 35.0 // farRadius

    data[offset++] = blackhole?.ultraFastMode ? 1 : 0 // ultraFastMode (u32)

    // Lighting
    data[offset++] = LIGHTING_MODE_MAP[blackhole?.lightingMode] ?? 0 // lightingMode (i32)
    data[offset++] = blackhole?.roughness ?? 0.6 // roughness
    data[offset++] = blackhole?.specular ?? 0.2 // specular

    data[offset++] = blackhole?.ambientTint ?? 0.1 // ambientTint
    data[offset++] = blackhole?.envMapReady ?? 0.0 // envMapReady

    // Doppler effect
    data[offset++] = blackhole?.dopplerEnabled ? 1 : 0 // dopplerEnabled (u32)
    data[offset++] = blackhole?.dopplerStrength ?? 0.6 // dopplerStrength

    // Motion blur
    data[offset++] = blackhole?.motionBlurEnabled ? 1 : 0 // motionBlurEnabled (u32)
    data[offset++] = blackhole?.motionBlurStrength ?? 0.5 // motionBlurStrength
    data[offset++] = blackhole?.motionBlurSamples ?? 4 // motionBlurSamples (i32)
    data[offset++] = blackhole?.motionBlurRadialFalloff ?? 1.0 // motionBlurRadialFalloff

    // SSS
    data[offset++] = blackhole?.sssEnabled ? 1 : 0 // sssEnabled (u32)
    data[offset++] = blackhole?.sssIntensity ?? 1.0 // sssIntensity

    // sssColor (vec3f) + padding
    const sssColor = blackhole?.sssColor ?? { r: 1.0, g: 0.53, b: 0.27 }
    data[offset++] = sssColor.r ?? 1.0
    data[offset++] = sssColor.g ?? 0.53
    data[offset++] = sssColor.b ?? 0.27
    data[offset++] = 0.0 // _padding2

    data[offset++] = blackhole?.sssThickness ?? 1.0 // sssThickness
    data[offset++] = blackhole?.sssJitter ?? 0.2 // sssJitter

    // Animation state
    data[offset++] = blackhole?.pulseEnabled ? 1 : 0 // pulseEnabled (u32)
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

    this.writeUniformBuffer(this.device, this.blackHoleUniformBuffer, data)
  }

  /**
   * Update basis vectors for N-dimensional projection.
   */
  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const blackhole = extended?.blackhole
    const dimension = blackhole?.dimension ?? this.rendererConfig.dimension ?? 4

    // Pack basis vectors: basisX, basisY, basisZ, origin (each MAX_DIMENSION floats)
    // With padding to 192 bytes = 48 floats
    const basisData = new Float32Array(48)

    // Default basis vectors for 3D slice of N-D space
    // X basis: [1, 0, 0, 0, ...]
    basisData[0] = 1.0

    // Y basis: [0, 1, 0, 0, ...]
    basisData[MAX_DIMENSION] = 0.0
    basisData[MAX_DIMENSION + 1] = 1.0

    // Z basis: [0, 0, 1, 0, ...]
    basisData[MAX_DIMENSION * 2 + 2] = 1.0

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
        basisData[MAX_DIMENSION + i] = basisY[i] ?? 0
      }
    }
    if (basisZ) {
      for (let i = 0; i < Math.min(basisZ.length, MAX_DIMENSION); i++) {
        basisData[MAX_DIMENSION * 2 + i] = basisZ[i] ?? 0
      }
    }
    if (origin) {
      for (let i = 0; i < Math.min(origin.length, MAX_DIMENSION); i++) {
        basisData[MAX_DIMENSION * 3 + i] = origin[i] ?? 0
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
    this.updateBlackHoleUniforms(ctx)
    this.updateBasisVectors(ctx)
    this.updateLightingUniforms(ctx)

    // Get render target
    const colorView = ctx.getWriteTarget('hdr-color')
    if (!colorView) return

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
    this.blackHoleUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.blackHoleUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
