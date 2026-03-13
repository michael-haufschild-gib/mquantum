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
import type { SkyboxProceduralSettings, SkyboxMode, SkyboxTexture } from '@/stores/defaults/visualDefaults'

/**
 * Resolved URLs for skybox face PNG images (eagerly loaded by Vite).
 * Used to load classic cubemap textures for WebGPU without Three.js.
 */
const skyboxFaceAssets = import.meta.glob<string>(
  '/src/assets/skyboxes/*/{right,left,top,bottom,front,back}.png',
  { eager: true, import: 'default', query: '?url' },
)

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
      return 4
    case 'horizon':
      return 5
    case 'ocean':
      return 6
    case 'twilight':
      return 7
    default:
      return 0
  }
}

/**
 * WebGPU renderer for procedural skybox backgrounds.
 * Renders to scene-render buffer with single color output (no MRT needed for skybox).
 */
export class WebGPUSkyboxRenderer extends WebGPUBasePass {
  private renderPipeline: GPURenderPipeline | null = null

  // Uniform buffer for skybox parameters
  private uniformBuffer: GPUBuffer | null = null

  // Persistent vertex buffer (created once, reused every frame)
  private vertexBuffer: GPUBuffer | null = null

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

  // Cached setup context for pipeline recreation
  private cachedSetupCtx: WebGPUSetupContext | null = null

  // Animation time tracking (skybox accumulates its own time, like WebGL Skybox.tsx)
  private skyboxTime = 0
  private lastFrameTime = -1

  // Animation-computed rotation adjustments (set in updateUniforms, consumed in updateVertexUniforms)
  private animRotX = 0
  private animRotY = 0
  private animRotZ = 0

  // Classic cube texture loading state
  private loadedTextureName: string | null = null
  private loadedHighQuality = false
  private cubeTextureLoading = false
  private loadedCubeTexture: GPUTexture | null = null

  // Reused uniform packing buffers to avoid per-frame allocations.
  private skyboxUniformData = new Float32Array(64)
  private skyboxVertexUniformData = new Float32Array(64)

  constructor(config?: SkyboxRendererConfig) {
    super({
      id: 'skybox',
      priority: 50, // Render before main objects
      inputs: [],
      outputs: [
        { resourceId: 'scene-render', access: 'write', binding: 0 },
        { resourceId: 'depth-buffer', access: 'write', binding: 1 },
      ],
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
    const { device } = ctx

    // Cache setup context for pipeline recreation on mode change
    this.cachedSetupCtx = ctx

    // Create placeholder texture and vertex buffer BEFORE pipeline,
    // because createPipelineForMode() calls recreateBindGroups() which
    // needs the placeholder cube texture to exist.
    this.createPlaceholderTexture(device)
    this.createVertexBuffer(device)

    await this.createPipelineForMode(device, this.currentShaderMode)
  }

  /**
   * Create pipeline for specific skybox mode.
   * Uses rgba16float format to match scene-render resource.
   * Uses depth24plus to match depth-buffer resource.
   * @param device
   * @param mode
   */
  private async createPipelineForMode(
    device: GPUDevice,
    mode: ShaderSkyboxMode
  ): Promise<void> {
    // Compose shaders (non-MRT: single color output for skybox)
    const effects = { sun: this.skyboxConfig.sun, vignette: this.skyboxConfig.vignette }
    const { wgsl: fragmentShader } = composeSkyboxFragmentShader({
      mode,
      effects,
      mrt: false,
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
    // Format: rgba16float to match scene-render resource
    // Depth: depth24plus to match depth-buffer resource
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
        entryPoint: 'main',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'front', // Cull front faces since we're inside the skybox
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less-equal', // Skybox renders at far plane
      },
    })

    // Create uniform buffer
    // SkyboxUniforms: 256 bytes + VertexUniforms: 256 bytes = 512 bytes total
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
   * Load a classic cube texture from PNG face images and bind it.
   * When highQuality is true, generates mipmaps for smoother filtering.
   * @param device - GPU device
   * @param textureName - Skybox texture identifier (e.g. 'space_blue')
   * @param highQuality - Whether to generate mipmaps for higher quality rendering
   */
  private async loadCubeTexture(device: GPUDevice, textureName: string, highQuality: boolean): Promise<void> {
    // Face names in WebGPU cubemap layer order: +X, -X, +Y, -Y, +Z, -Z
    const faceNames = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const

    // Resolve face URLs from Vite glob
    const faceURLs: string[] = []
    for (const face of faceNames) {
      const key = `/src/assets/skyboxes/${textureName}/${face}.png`
      const url = skyboxFaceAssets[key]
      if (!url) {
        console.warn(`[WebGPU Skybox] Missing face asset: ${key}`)
        return
      }
      faceURLs.push(url)
    }

    // Load all 6 face images in parallel
    const bitmaps = await Promise.all(
      faceURLs.map(async (url) => {
        const response = await fetch(url)
        const blob = await response.blob()
        return createImageBitmap(blob, { colorSpaceConversion: 'none' })
      }),
    )

    const width = bitmaps[0]!.width
    const height = bitmaps[0]!.height
    const mipLevelCount = highQuality
      ? Math.floor(Math.log2(Math.max(width, height))) + 1
      : 1

    // Create cube texture
    const cubeTexture = device.createTexture({
      label: `skybox-cube-${textureName}`,
      size: { width, height, depthOrArrayLayers: 6 },
      format: 'rgba8unorm',
      mipLevelCount,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })

    // Upload base level for each face
    for (let i = 0; i < 6; i++) {
      device.queue.copyExternalImageToTexture(
        { source: bitmaps[i]! },
        { texture: cubeTexture, origin: { x: 0, y: 0, z: i } },
        { width, height },
      )
    }

    // Generate mipmaps by progressively downscaling with createImageBitmap
    if (highQuality && mipLevelCount > 1) {
      for (let face = 0; face < 6; face++) {
        let mipW = width
        let mipH = height
        for (let level = 1; level < mipLevelCount; level++) {
          mipW = Math.max(1, mipW >> 1)
          mipH = Math.max(1, mipH >> 1)
          const mipBitmap = await createImageBitmap(bitmaps[face]!, {
            resizeWidth: mipW,
            resizeHeight: mipH,
            resizeQuality: 'high',
            colorSpaceConversion: 'none',
          })
          device.queue.copyExternalImageToTexture(
            { source: mipBitmap },
            { texture: cubeTexture, origin: { x: 0, y: 0, z: face }, mipLevel: level },
            { width: mipW, height: mipH },
          )
          mipBitmap.close()
        }
      }
    }

    // Clean up source ImageBitmaps
    for (const bm of bitmaps) bm.close()

    // Destroy previous loaded texture (not the placeholder — keep it for fallback)
    this.loadedCubeTexture?.destroy()
    this.loadedCubeTexture = cubeTexture

    // Update bind groups to use the new texture
    if (this.textureBindGroupLayout && this.placeholderCubeSampler) {
      this.textureBindGroup = device.createBindGroup({
        label: 'skybox-texture-bg',
        layout: this.textureBindGroupLayout,
        entries: [
          { binding: 0, resource: cubeTexture.createView({ dimension: 'cube' }) },
          { binding: 1, resource: this.placeholderCubeSampler },
        ],
      })
    }

    if (import.meta.env.DEV) {
      console.log(`[WebGPU Skybox] Loaded cube texture: ${textureName} (${width}x${height}, mips: ${mipLevelCount})`)
    }
  }

  /**
   * Create persistent vertex buffer for skybox cube geometry.
   * Created once and reused every frame (not per-frame allocation).
   * @param device
   */
  private createVertexBuffer(device: GPUDevice): void {
    const size = 1.0

    // Cube vertices (position only) - 36 vertices (6 faces x 2 triangles x 3 vertices)
    const vertices = new Float32Array([
      // Front face
      -size, -size, size, size, -size, size, size, size, size,
      -size, -size, size, size, size, size, -size, size, size,
      // Back face
      size, -size, -size, -size, -size, -size, -size, size, -size,
      size, -size, -size, -size, size, -size, size, size, -size,
      // Top face
      -size, size, size, size, size, size, size, size, -size,
      -size, size, size, size, size, -size, -size, size, -size,
      // Bottom face
      -size, -size, -size, size, -size, -size, size, -size, size,
      -size, -size, -size, size, -size, size, -size, -size, size,
      // Right face
      size, -size, size, size, -size, -size, size, size, -size,
      size, -size, size, size, size, -size, size, size, size,
      // Left face
      -size, -size, -size, -size, -size, size, -size, size, size,
      -size, -size, -size, -size, size, size, -size, size, -size,
    ])

    this.vertexBuffer = device.createBuffer({
      label: 'skybox-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices)
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

    // Access stores from frame context
    const env = ctx.frame?.stores?.['environment'] as {
      skyboxMode?: SkyboxMode
      skyboxTexture?: SkyboxTexture
      skyboxIntensity?: number
      skyboxRotation?: number
      skyboxAnimationMode?: string
      skyboxAnimationSpeed?: number
      skyboxHighQuality?: boolean
      proceduralSettings?: SkyboxProceduralSettings
    } | undefined

    const anim = ctx.frame?.stores?.['animation'] as {
      isPlaying?: boolean
    } | undefined

    // Get current mode and check for mode changes
    const storeMode = env?.skyboxMode ?? 'procedural_aurora'
    const shaderMode = mapSkyboxModeToShader(storeMode)

    if (shaderMode !== this.currentShaderMode) {
      this.currentShaderMode = shaderMode
      this.pipelineNeedsRecreation = true
    }

    // Load classic cube texture when mode is 'classic' and texture name or quality changes
    if (shaderMode === 'classic' && this.device) {
      const textureName = env?.skyboxTexture ?? 'space_blue'
      const highQuality = env?.skyboxHighQuality ?? false
      const needsReload =
        textureName !== 'none' &&
        (textureName !== this.loadedTextureName || highQuality !== this.loadedHighQuality) &&
        !this.cubeTextureLoading
      if (needsReload) {
        this.cubeTextureLoading = true
        this.loadedTextureName = textureName
        this.loadedHighQuality = highQuality
        this.loadCubeTexture(this.device, textureName, highQuality)
          .catch((err) => {
            console.error('[WebGPU Skybox] Failed to load cube texture:', err)
            this.loadedTextureName = null // Allow retry
          })
          .finally(() => {
            this.cubeTextureLoading = false
          })
      }
    }

    const settings = env?.proceduralSettings
    const isPlaying = anim?.isPlaying ?? false
    const skyboxAnimationMode = env?.skyboxAnimationMode ?? 'none'
    const skyboxAnimationSpeed = env?.skyboxAnimationSpeed ?? 1.0

    // --- Animation time accumulation (matches WebGL Skybox.tsx pattern) ---
    const frameTime = ctx.frame?.time ?? 0
    if (this.lastFrameTime < 0) {
      this.lastFrameTime = frameTime
    }
    const delta = frameTime - this.lastFrameTime
    this.lastFrameTime = frameTime

    if (isPlaying && delta > 0 && delta < 0.1) {
      // For classic mode with animation: use skyboxAnimationSpeed as multiplier
      // For procedural modes: use timeScale (no special speed multiplier)
      const speed = storeMode === 'classic' && skyboxAnimationMode !== 'none'
        ? skyboxAnimationSpeed
        : 1.0
      this.skyboxTime += delta * speed
    }

    const t = this.skyboxTime

    // --- Compute animation mode effects (classic mode only, matches WebGL) ---
    this.animRotX = 0
    this.animRotY = 0
    this.animRotZ = 0
    let animHue = 0
    let animIntensityMul = 1.0
    let animDistortion = 0

    if (isPlaying && storeMode === 'classic' && skyboxAnimationMode !== 'none') {
      switch (skyboxAnimationMode) {
        case 'cinematic':
          this.animRotY = t * 0.1
          this.animRotX = Math.sin(t * 0.5) * 0.005
          this.animRotZ = Math.cos(t * 0.3) * 0.003
          break
        case 'heatwave':
          animDistortion = 1.0 + Math.sin(t * 0.5) * 0.5
          this.animRotY = t * 0.02
          break
        case 'tumble':
          this.animRotX = t * 0.05
          this.animRotY = t * 0.07
          this.animRotZ = t * 0.03
          break
        case 'ethereal':
          this.animRotY = t * 0.05
          animHue = Math.sin(t * 0.1) * 0.1
          animIntensityMul = 1.0 + Math.sin(t * 10) * 0.02
          break
        case 'nebula':
          animHue = (t * 0.05) % 1.0
          this.animRotY = t * 0.03
          animIntensityMul = 1.1
          break
      }
    }

    // --- Pack SkyboxUniforms (must match WGSL struct layout) ---
    const data = this.skyboxUniformData
    data.fill(0)

    const baseIntensity = env?.skyboxIntensity ?? 1.0
    const baseHue = settings?.hue ?? 0.0
    const baseDistortion = settings?.turbulence ?? 0.3

    // Core uniforms (first 64 bytes / 16 floats)
    data[0] = modeToNumeric(shaderMode) // mode
    data[1] = t // time (raw — shader multiplies by timeScale, matching WebGL)
    data[2] = baseIntensity * animIntensityMul // intensity (with animation)
    data[3] = baseHue + animHue // hue (with animation)

    data[4] = settings?.saturation ?? 1.0 // saturation
    data[5] = settings?.scale ?? 1.0 // scale
    data[6] = settings?.complexity ?? 0.5 // complexity
    data[7] = settings?.timeScale ?? 0.2 // timeScale

    data[8] = settings?.evolution ?? 0.0 // evolution
    data[9] = 0.0 // _padSync (was usePalette, removed)
    data[10] = animDistortion // distortion (animation-driven for heatwave)
    data[11] = 0.0 // vignette

    data[12] = baseDistortion // turbulence
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

    const baseRotation = env?.skyboxRotation ?? 0

    // Compose final rotation: base rotation + animation-driven rotation
    const rotX = this.animRotX
    const rotY = baseRotation + this.animRotY
    const rotZ = this.animRotZ

    // Precompute trig values for Euler rotation (XYZ order)
    const cx = Math.cos(rotX)
    const sx = Math.sin(rotX)
    const cy = Math.cos(rotY)
    const sy = Math.sin(rotY)
    const cz = Math.cos(rotZ)
    const sz = Math.sin(rotZ)

    // Compose rotation matrix (Euler XYZ: Rz * Ry * Rx)
    const m00 = cy * cz
    const m01 = sx * sy * cz - cx * sz
    const m02 = cx * sy * cz + sx * sz
    const m10 = cy * sz
    const m11 = sx * sy * sz + cx * cz
    const m12 = cx * sy * sz - sx * cz
    const m20 = -sy
    const m21 = sx * cy
    const m22 = cx * cy

    // VertexUniforms struct (matrices)
    const data = this.skyboxVertexUniformData
    data.fill(0)

    // modelMatrix (4x4 rotation matrix, column-major)
    data[0] = m00
    data[1] = m10
    data[2] = m20
    data[3] = 0
    data[4] = m01
    data[5] = m11
    data[6] = m21
    data[7] = 0
    data[8] = m02
    data[9] = m12
    data[10] = m22
    data[11] = 0
    data[12] = 0
    data[13] = 0
    data[14] = 0
    data[15] = 1

    // modelViewMatrix (copy view matrix, ignoring translation for skybox)
    if (camera?.viewMatrix?.elements && camera.viewMatrix.elements.length >= 16) {
      const vm = camera.viewMatrix.elements
      // Remove translation from view matrix for skybox
      data[16] = vm[0]!
      data[17] = vm[1]!
      data[18] = vm[2]!
      data[19] = 0
      data[20] = vm[4]!
      data[21] = vm[5]!
      data[22] = vm[6]!
      data[23] = 0
      data[24] = vm[8]!
      data[25] = vm[9]!
      data[26] = vm[10]!
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

    // rotationMatrix (mat3x3 stored as 3 columns with 16-byte alignment each)
    // Uses the same composed rotation as modelMatrix
    data[48] = m00
    data[49] = m10
    data[50] = m20
    data[51] = 0 // padding

    data[52] = m01
    data[53] = m11
    data[54] = m21
    data[55] = 0 // padding

    data[56] = m02
    data[57] = m12
    data[58] = m22
    data[59] = 0 // padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data, 256)
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.uniformBindGroup || !this.textureBindGroup || !this.vertexBuffer) {
      return
    }

    // Handle pipeline recreation for mode changes
    if (this.pipelineNeedsRecreation && this.cachedSetupCtx) {
      this.pipelineNeedsRecreation = false
      // Trigger async recreation - pipeline will update for next frame
      this.createPipelineForMode(this.device, this.currentShaderMode).catch((err) => {
        console.error('[WebGPU Skybox] Failed to recreate pipeline for mode change:', err)
      })
    }

    // Update uniforms from stores
    this.updateUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('scene-render')
    const depthView = ctx.getWriteTarget('depth-buffer')

    if (!colorView) return

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
    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.draw(36, 1, 0, 0) // 6 faces * 2 triangles * 3 vertices

    passEncoder.end()
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.vertexBuffer?.destroy()
    this.placeholderCubeTexture?.destroy()
    this.loadedCubeTexture?.destroy()

    this.uniformBuffer = null
    this.vertexBuffer = null
    this.placeholderCubeTexture = null
    this.placeholderCubeSampler = null
    this.loadedCubeTexture = null
    this.loadedTextureName = null
    this.loadedHighQuality = false
    this.cubeTextureLoading = false
    this.uniformBindGroup = null
    this.textureBindGroup = null
    this.uniformBindGroupLayout = null
    this.textureBindGroupLayout = null
    this.renderPipeline = null
    this.cachedSetupCtx = null

    super.dispose()
  }
}
