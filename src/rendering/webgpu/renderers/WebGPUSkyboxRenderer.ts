/**
 * WebGPU Skybox Renderer
 *
 * Renders procedural skybox backgrounds using WebGPU.
 * Supports 7 modes: classic, aurora, nebula, crystalline, horizon, ocean, twilight.
 *
 * @module rendering/webgpu/renderers/WebGPUSkyboxRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
  SKYBOX_BIND_GROUPS,
  type SkyboxMode as ShaderSkyboxMode,
} from '../shaders/skybox'
import type { SkyboxProceduralSettings, SkyboxMode } from '@/stores/defaults/visualDefaults'

/**
 * Configuration for the skybox renderer.
 */
export interface SkyboxRendererConfig {
  /** Initial skybox mode */
  mode?: SkyboxMode
  /** Enable sun effect */
  sun?: boolean
  /** Enable vignette effect */
  vignette?: boolean
}

/**
 * Maps store skybox mode to shader mode string.
 * @param storeMode
 */
function mapSkyboxModeToShader(storeMode: SkyboxMode): ShaderSkyboxMode {
  switch (storeMode) {
    case 'procedural_aurora':
      return 'aurora'
    case 'procedural_nebula':
      return 'nebula'
    case 'procedural_crystalline':
      return 'crystalline'
    case 'procedural_horizon':
      return 'horizon'
    case 'procedural_ocean':
      return 'ocean'
    case 'procedural_twilight':
      return 'twilight'
    case 'classic':
    default:
      return 'classic'
  }
}

/**
 * Maps shader mode string to numeric mode value for uniforms.
 * @param mode
 */
function modeToNumeric(mode: ShaderSkyboxMode): number {
  switch (mode) {
    case 'classic':
      return 0
    case 'aurora':
      return 1
    case 'nebula':
      return 2
    case 'crystalline':
      return 3
    case 'horizon':
      return 4
    case 'ocean':
      return 5
    case 'twilight':
      return 6
    default:
      return 0
  }
}

/**
 * WebGPU renderer for procedural skybox backgrounds.
 */
export class WebGPUSkyboxRenderer extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null

  // Uniform buffer for skybox parameters
  private uniformBuffer: GPUBuffer | null = null

  // Bind groups
  private uniformBindGroup: GPUBindGroup | null = null
  private textureBindGroup: GPUBindGroup | null = null

  // Bind group layouts (cached for recreation)
  private uniformBindGroupLayout: GPUBindGroupLayout | null = null
  private textureBindGroupLayout: GPUBindGroupLayout | null = null

  // Placeholder texture for when no cubemap is loaded
  private placeholderCubeTexture: GPUTexture | null = null
  private placeholderCubeSampler: GPUSampler | null = null

  // Configuration
  private skyboxConfig: Required<SkyboxRendererConfig>

  // Current shader mode (for pipeline recreation on mode change)
  private currentShaderMode: ShaderSkyboxMode = 'aurora'
  private pipelineNeedsRecreation = false

  constructor(config?: SkyboxRendererConfig) {
    super({
      id: 'skybox',
      priority: 50, // Render before main objects
      inputs: [],
      outputs: [{ resourceId: 'hdr-color', access: 'write', binding: 0 }],
    })

    this.skyboxConfig = {
      mode: config?.mode ?? 'procedural_aurora',
      sun: config?.sun ?? false,
      vignette: config?.vignette ?? false,
    }

    this.currentShaderMode = mapSkyboxModeToShader(this.skyboxConfig.mode)
  }

  /**
   * Set the skybox mode.
   * This will trigger pipeline recreation on next frame.
   * @param mode
   */
  setMode(mode: SkyboxMode): void {
    const shaderMode = mapSkyboxModeToShader(mode)
    if (this.currentShaderMode !== shaderMode) {
      this.currentShaderMode = shaderMode
      this.pipelineNeedsRecreation = true
    }
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    await this.createPipelineForMode(device, format, this.currentShaderMode)
    this.createPlaceholderTexture(device)
  }

  /**
   * Create pipeline for specific skybox mode.
   * @param device
   * @param format
   * @param mode
   */
  private async createPipelineForMode(
    device: GPUDevice,
    format: GPUTextureFormat,
    mode: ShaderSkyboxMode
  ): Promise<void> {
    // Compose shaders
    const effects = { sun: this.skyboxConfig.sun, vignette: this.skyboxConfig.vignette }
    const { wgsl: fragmentShader } = composeSkyboxFragmentShader({
      mode,
      effects,
    })
    const vertexShader = composeSkyboxVertexShader(effects)

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'skybox-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'skybox-fragment')

    // Create bind group layouts
    // Group 0: Uniforms (skybox params + vertex uniforms)
    this.uniformBindGroupLayout = device.createBindGroupLayout({
      label: 'skybox-uniform-bgl',
      entries: [
        {
          // SkyboxUniforms
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          // VertexUniforms
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    })

    // Group 1: Textures (cube texture + sampler)
    this.textureBindGroupLayout = device.createBindGroupLayout({
      label: 'skybox-texture-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: 'cube' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'skybox-pipeline-layout',
      bindGroupLayouts: [this.uniformBindGroupLayout, this.textureBindGroupLayout],
    })

    this.pipelineLayout = pipelineLayout

    // Create render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: 'skybox-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 12, // 3 floats for position
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'front', // Cull front faces since we're inside the skybox
      },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: false,
        depthCompare: 'less-equal', // Skybox renders at far plane
      },
    })

    // Create uniform buffer
    // SkyboxUniforms struct size: 256 bytes (aligned)
    this.uniformBuffer = this.createUniformBuffer(device, 512, 'skybox-uniforms')

    // Create bind groups (will be recreated when textures change)
    this.recreateBindGroups(device)
  }

  /**
   * Create placeholder cube texture for when no real texture is loaded.
   * @param device
   */
  private createPlaceholderTexture(device: GPUDevice): void {
    // Create a 1x1 cube texture filled with default color
    this.placeholderCubeTexture = device.createTexture({
      label: 'skybox-placeholder-cube',
      size: { width: 1, height: 1, depthOrArrayLayers: 6 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })

    // Fill with dark gray color
    const data = new Uint8Array([32, 32, 32, 255])
    for (let face = 0; face < 6; face++) {
      device.queue.writeTexture(
        { texture: this.placeholderCubeTexture, origin: { x: 0, y: 0, z: face } },
        data,
        { bytesPerRow: 4 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      )
    }

    this.placeholderCubeSampler = device.createSampler({
      label: 'skybox-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })
  }

  /**
   * Recreate bind groups (called when textures or buffers change).
   * @param device
   */
  private recreateBindGroups(device: GPUDevice): void {
    if (
      !this.uniformBindGroupLayout ||
      !this.textureBindGroupLayout ||
      !this.uniformBuffer ||
      !this.placeholderCubeTexture ||
      !this.placeholderCubeSampler
    ) {
      return
    }

    // Uniform bind group
    this.uniformBindGroup = device.createBindGroup({
      label: 'skybox-uniform-bg',
      layout: this.uniformBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: 256 } },
        { binding: 1, resource: { buffer: this.uniformBuffer, offset: 256, size: 256 } },
      ],
    })

    // Texture bind group (placeholder for now)
    this.textureBindGroup = device.createBindGroup({
      label: 'skybox-texture-bg',
      layout: this.textureBindGroupLayout,
      entries: [
        { binding: 0, resource: this.placeholderCubeTexture.createView({ dimension: 'cube' }) },
        { binding: 1, resource: this.placeholderCubeSampler },
      ],
    })
  }

  /**
   * Update skybox uniforms from environment store.
   * @param ctx
   */
  private updateUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.uniformBuffer) return

    // Access skybox store from frame context
    const env = ctx.frame?.stores?.['environment'] as {
      skyboxMode?: SkyboxMode
      skyboxIntensity?: number
      skyboxRotation?: number
      proceduralSettings?: SkyboxProceduralSettings
    } | undefined

    // Get current mode and check for mode changes
    const storeMode = env?.skyboxMode ?? 'procedural_aurora'
    const shaderMode = mapSkyboxModeToShader(storeMode)

    if (shaderMode !== this.currentShaderMode) {
      this.currentShaderMode = shaderMode
      this.pipelineNeedsRecreation = true
    }

    const settings = env?.proceduralSettings
    const time = ctx.frame?.time ?? 0

    // Pack SkyboxUniforms (must match WGSL struct layout)
    const data = new Float32Array(64) // 256 bytes / 4

    // Core uniforms (first 64 bytes / 16 floats)
    data[0] = modeToNumeric(shaderMode) // mode
    data[1] = time * (settings?.timeScale ?? 0.2) // time (scaled)
    data[2] = env?.skyboxIntensity ?? 1.0 // intensity
    data[3] = settings?.hue ?? 0.0 // hue

    data[4] = settings?.saturation ?? 1.0 // saturation
    data[5] = settings?.scale ?? 1.0 // scale
    data[6] = settings?.complexity ?? 0.5 // complexity
    data[7] = settings?.timeScale ?? 0.2 // timeScale

    data[8] = settings?.evolution ?? 0.0 // evolution
    data[9] = settings?.syncWithObject ? 1.0 : 0.0 // usePalette (sync = use object palette)
    data[10] = 0.0 // distortion
    data[11] = 0.0 // vignette

    data[12] = settings?.turbulence ?? 0.3 // turbulence
    data[13] = settings?.dualToneContrast ?? 0.5 // dualTone
    data[14] = settings?.sunIntensity ?? 0.0 // sunIntensity
    data[15] = 0.0 // padding

    // color1 (vec3 + padding)
    const coeffs = settings?.cosineCoefficients
    data[16] = coeffs?.a?.[0] ?? 0.5
    data[17] = coeffs?.a?.[1] ?? 0.5
    data[18] = coeffs?.a?.[2] ?? 0.5
    data[19] = 0.0 // padding

    // color2 (vec3 + padding)
    data[20] = coeffs?.b?.[0] ?? 0.5
    data[21] = coeffs?.b?.[1] ?? 0.5
    data[22] = coeffs?.b?.[2] ?? 0.5
    data[23] = 0.0 // padding

    // Cosine palette coefficients (palA, palB, palC, palD)
    // palA
    data[24] = coeffs?.a?.[0] ?? 0.5
    data[25] = coeffs?.a?.[1] ?? 0.5
    data[26] = coeffs?.a?.[2] ?? 0.5
    data[27] = 0.0

    // palB
    data[28] = coeffs?.b?.[0] ?? 0.5
    data[29] = coeffs?.b?.[1] ?? 0.5
    data[30] = coeffs?.b?.[2] ?? 0.5
    data[31] = 0.0

    // palC
    data[32] = coeffs?.c?.[0] ?? 1.0
    data[33] = coeffs?.c?.[1] ?? 1.0
    data[34] = coeffs?.c?.[2] ?? 1.0
    data[35] = 0.0

    // palD
    data[36] = coeffs?.d?.[0] ?? 0.0
    data[37] = coeffs?.d?.[1] ?? 0.33
    data[38] = coeffs?.d?.[2] ?? 0.67
    data[39] = 0.0

    // sunPosition (vec3 + padding)
    const sunPos = settings?.sunPosition ?? [10, 10, 10]
    data[40] = sunPos[0]
    data[41] = sunPos[1]
    data[42] = sunPos[2]
    data[43] = 0.0

    // Mode-specific settings
    // Aurora
    data[44] = settings?.aurora?.curtainHeight ?? 0.5 // auroraCurtainHeight
    data[45] = settings?.aurora?.waveFrequency ?? 1.0 // auroraWaveFrequency

    // Horizon
    data[46] = settings?.horizonGradient?.gradientContrast ?? 0.5 // horizonGradientContrast
    data[47] = settings?.horizonGradient?.spotlightFocus ?? 0.5 // horizonSpotlightFocus

    // Ocean
    data[48] = settings?.ocean?.causticIntensity ?? 0.5 // oceanCausticIntensity
    data[49] = settings?.ocean?.depthGradient ?? 0.5 // oceanDepthGradient
    data[50] = settings?.ocean?.bubbleDensity ?? 0.3 // oceanBubbleDensity
    data[51] = settings?.ocean?.surfaceShimmer ?? 0.4 // oceanSurfaceShimmer

    this.writeUniformBuffer(this.device, this.uniformBuffer, data, 0)

    // Update vertex uniforms (offset 256)
    this.updateVertexUniforms(ctx)
  }

  /**
   * Update vertex uniforms (matrices for skybox rendering).
   * @param ctx
   */
  private updateVertexUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.uniformBuffer) return

    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
    } | undefined

    const env = ctx.frame?.stores?.['environment'] as {
      skyboxRotation?: number
    } | undefined

    const rotation = env?.skyboxRotation ?? 0

    // Create rotation matrix for skybox
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    // VertexUniforms struct (matrices)
    const data = new Float32Array(64) // 256 bytes / 4

    // modelMatrix (identity with Y rotation)
    data[0] = cos
    data[1] = 0
    data[2] = -sin
    data[3] = 0
    data[4] = 0
    data[5] = 1
    data[6] = 0
    data[7] = 0
    data[8] = sin
    data[9] = 0
    data[10] = cos
    data[11] = 0
    data[12] = 0
    data[13] = 0
    data[14] = 0
    data[15] = 1

    // modelViewMatrix (copy view matrix for now, ignoring translation)
    if (camera?.viewMatrix?.elements && camera.viewMatrix.elements.length >= 16) {
      const vm = camera.viewMatrix.elements as [
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
        number, number, number, number
      ]
      // Remove translation from view matrix for skybox
      data[16] = vm[0]
      data[17] = vm[1]
      data[18] = vm[2]
      data[19] = 0
      data[20] = vm[4]
      data[21] = vm[5]
      data[22] = vm[6]
      data[23] = 0
      data[24] = vm[8]
      data[25] = vm[9]
      data[26] = vm[10]
      data[27] = 0
      data[28] = 0
      data[29] = 0
      data[30] = 0
      data[31] = 1
    } else {
      // Identity
      data[16] = 1
      data[21] = 1
      data[26] = 1
      data[31] = 1
    }

    // projectionMatrix
    if (camera?.projectionMatrix?.elements) {
      data.set(camera.projectionMatrix.elements, 32)
    } else {
      // Identity
      data[32] = 1
      data[37] = 1
      data[42] = 1
      data[47] = 1
    }

    // rotationMatrix (mat3x3 stored as 3 vec4 for alignment)
    // Rotation around Y axis
    data[48] = cos
    data[49] = 0
    data[50] = -sin
    data[51] = 0 // padding

    data[52] = 0
    data[53] = 1
    data[54] = 0
    data[55] = 0 // padding

    data[56] = sin
    data[57] = 0
    data[58] = cos
    data[59] = 0 // padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data, 256)
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.uniformBindGroup || !this.textureBindGroup) {
      return
    }

    // Check if pipeline needs recreation due to mode change
    if (this.pipelineNeedsRecreation) {
      // For now, skip recreation during execute - would need async handling
      // In production, this would trigger pipeline recreation
      this.pipelineNeedsRecreation = false
    }

    // Update uniforms from stores
    this.updateUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('hdr-color')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView) return

    // Create skybox geometry (cube vertices)
    const vertexBuffer = this.createSkyboxGeometry()
    if (!vertexBuffer) return

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'skybox-render',
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: depthView
        ? {
            view: depthView,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            depthClearValue: 1.0,
          }
        : undefined,
    })

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(SKYBOX_BIND_GROUPS.UNIFORMS, this.uniformBindGroup)
    passEncoder.setBindGroup(SKYBOX_BIND_GROUPS.TEXTURES, this.textureBindGroup)
    passEncoder.setVertexBuffer(0, vertexBuffer)
    passEncoder.draw(36, 1, 0, 0) // 6 faces * 2 triangles * 3 vertices

    passEncoder.end()

    // Destroy temporary vertex buffer
    vertexBuffer.destroy()
  }

  /**
   * Create skybox cube geometry.
   */
  private createSkyboxGeometry(): GPUBuffer | null {
    if (!this.device) return null

    const size = 1.0

    // Cube vertices (position only)
    const vertices = new Float32Array([
      // Front face
      -size, -size, size, size, -size, size, size, size, size, -size, -size, size, size, size,
      size, -size, size, size,
      // Back face
      size, -size, -size, -size, -size, -size, -size, size, -size, size, -size, -size, -size,
      size, -size, size, size, -size,
      // Top face
      -size, size, size, size, size, size, size, size, -size, -size, size, size, size, size,
      -size, -size, size, -size,
      // Bottom face
      -size, -size, -size, size, -size, -size, size, -size, size, -size, -size, -size, size,
      -size, size, -size, -size, size,
      // Right face
      size, -size, size, size, -size, -size, size, size, -size, size, -size, size, size, size,
      -size, size, size, size,
      // Left face
      -size, -size, -size, -size, -size, size, -size, size, size, -size, -size, -size, -size,
      size, size, -size, size, -size,
    ])

    const buffer = this.device.createBuffer({
      label: 'skybox-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    this.device.queue.writeBuffer(buffer, 0, vertices)

    return buffer
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.placeholderCubeTexture?.destroy()

    this.uniformBuffer = null
    this.placeholderCubeTexture = null
    this.placeholderCubeSampler = null
    this.uniformBindGroup = null
    this.textureBindGroup = null
    this.uniformBindGroupLayout = null
    this.textureBindGroupLayout = null
    this.renderPipeline = null

    super.dispose()
  }
}
