/**
 * WebGPU Skybox Renderer
 *
 * Renders procedural skybox backgrounds using WebGPU.
 * Supports 7 modes: classic, aurora, nebula, crystalline, horizon, ocean, twilight.
 *
 * @module rendering/webgpu/renderers/WebGPUSkyboxRenderer
 */

import { logger } from '@/lib/logger'
import type {
  SkyboxMode,
  SkyboxProceduralSettings,
  SkyboxTexture,
} from '@/stores/defaults/visualDefaults'

import type { AnimationSnapshot, CameraSnapshot } from '../core/storeAccess'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { composeSkyboxFragmentShader, composeSkyboxVertexShader } from '../shaders/skybox/compose'
import { SKYBOX_BIND_GROUPS, type SkyboxMode as ShaderSkyboxMode } from '../shaders/skybox/types'
import { generateSkyboxCubeVertices, loadSkyboxKTX2Texture } from './skyboxVertexData'

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

// Skybox helper functions extracted to skyboxVertexData.ts
import {
  computeSkyboxAnimationEffects,
  mapSkyboxModeToShader,
  packSkyboxCoreUniforms,
  packSkyboxModeSettings,
  packSkyboxPalette,
  packSkyboxPrecomputedPalettes,
} from './skyboxVertexData'

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
  private pipelineRecreationRetries = 0
  private static readonly MAX_PIPELINE_RETRIES = 3

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
  // SkyboxUniforms grew from 256 → 512 bytes when 14 dispatch-uniform palette
  // samples were hoisted off the per-pixel hot path (see skyboxVertexData.ts
  // packSkyboxPrecomputedPalettes). 128 floats = 512 bytes.
  private skyboxUniformData = new Float32Array(128)
  private skyboxVertexUniformData = new Float32Array(64)

  constructor(config?: SkyboxRendererConfig) {
    super({
      id: 'skybox',
      priority: 50, // Render before main objects
      inputs: [],
      outputs: [{ resourceId: 'scene-render', access: 'write', binding: 0 }],
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
      this.pipelineRecreationRetries = 0
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
   * @param device
   * @param mode
   */
  private async createPipelineForMode(device: GPUDevice, mode: ShaderSkyboxMode): Promise<void> {
    // Compose shaders (non-MRT: single color output for skybox)
    const effects = {
      sun: this.skyboxConfig.sun && mode !== 'classic',
      vignette: this.skyboxConfig.vignette,
    }
    const { wgsl: fragmentShader } = composeSkyboxFragmentShader({
      mode,
      effects,
      mrt: false,
    })
    const vertexShader = composeSkyboxVertexShader(effects)

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'skybox-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'skybox-fragment')

    // Hold reference to old buffer — destroyed after successful replacement
    const oldUniformBuffer = this.uniformBuffer

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
    })

    // Create uniform buffer
    // SkyboxUniforms: 512 bytes + VertexUniforms: 256 bytes = 768 bytes total.
    // SkyboxUniforms grew from 256 → 512 to host CPU-precomputed palette samples
    // hoisted off the per-pixel skybox shader hot path.
    this.uniformBuffer = this.createUniformBuffer(device, 768, 'skybox-uniforms')

    // Create bind groups (will be recreated when textures change)
    this.recreateBindGroups(device)

    // Safe to destroy old buffer now that new resources are wired up
    oldUniformBuffer?.destroy()
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
   * Load a classic cube texture from a KTX2 cubemap asset.
   * Transcodes via Basis Universal to the best GPU-native compressed format.
   * @param device - GPU device
   * @param textureName - Skybox texture identifier (e.g. 'space_blue')
   * @param highQuality - When true, loads the higher-fidelity cubemap_hq.ktx2
   */
  private async loadCubeTexture(
    device: GPUDevice,
    textureName: string,
    highQuality: boolean
  ): Promise<void> {
    const cubeTexture = await loadSkyboxKTX2Texture(device, textureName, highQuality)
    if (!cubeTexture) {
      logger.warn(`[WebGPU Skybox] Missing KTX2 asset for: ${textureName}`)
      return
    }

    // Guard against dispose() racing with the async load: if the renderer
    // was torn down while the KTX2 fetch was in flight, destroy the newly
    // loaded texture immediately to prevent a GPU memory leak.
    if (!this.device) {
      cubeTexture.destroy()
      return
    }

    this.loadedCubeTexture?.destroy()
    this.loadedCubeTexture = cubeTexture

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
  }

  /**
   * Create persistent vertex buffer for skybox cube geometry.
   * Created once and reused every frame (not per-frame allocation).
   * @param device
   */
  private createVertexBuffer(device: GPUDevice): void {
    const vertices = generateSkyboxCubeVertices()
    this.vertexBuffer = device.createBuffer({
      label: 'skybox-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices as Float32Array<ArrayBuffer>)
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
        // binding 0 = SkyboxUniforms (512 bytes); binding 1 = VertexUniforms (256 bytes at offset 512)
        { binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: 512 } },
        { binding: 1, resource: { buffer: this.uniformBuffer, offset: 512, size: 256 } },
      ],
    })

    const textureForBindGroup = this.loadedCubeTexture ?? this.placeholderCubeTexture

    // Texture bind group. If a classic cubemap was already loaded, preserve it
    // across pipeline/bind-group recreation instead of falling back to placeholder.
    this.textureBindGroup = device.createBindGroup({
      label: 'skybox-texture-bg',
      layout: this.textureBindGroupLayout,
      entries: [
        { binding: 0, resource: textureForBindGroup.createView({ dimension: 'cube' }) },
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
    const env = getStoreSnapshot<{
      skyboxMode?: SkyboxMode
      skyboxTexture?: SkyboxTexture
      skyboxIntensity?: number
      skyboxRotation?: number
      skyboxAnimationMode?: string
      skyboxAnimationSpeed?: number
      skyboxHighQuality?: boolean
      proceduralSettings?: SkyboxProceduralSettings
    }>(ctx, 'environment')

    const anim = getStoreSnapshot<AnimationSnapshot>(ctx, 'animation')

    // Get current mode and check for mode changes
    const storeMode = env?.skyboxMode ?? 'procedural_aurora'
    const shaderMode = mapSkyboxModeToShader(storeMode)

    if (shaderMode !== this.currentShaderMode) {
      this.currentShaderMode = shaderMode
      this.pipelineNeedsRecreation = true
      this.pipelineRecreationRetries = 0
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
            logger.error('[WebGPU Skybox] Failed to load cube texture:', err)
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
      const speed =
        storeMode === 'classic' && skyboxAnimationMode !== 'none' ? skyboxAnimationSpeed : 1.0
      this.skyboxTime += delta * speed
    }

    const t = this.skyboxTime

    // Compute animation mode effects (classic mode only, matches WebGL)
    const animFx = computeSkyboxAnimationEffects(isPlaying, storeMode, skyboxAnimationMode, t)
    this.animRotX = animFx.rotX
    this.animRotY = animFx.rotY
    this.animRotZ = animFx.rotZ

    // Pack and write skybox uniform data
    this.packSkyboxData(
      shaderMode,
      env?.skyboxIntensity ?? 1.0,
      settings,
      t,
      animFx.hue,
      animFx.intensityMul,
      animFx.distortion
    )

    // Update vertex uniforms (offset 256)
    this.updateVertexUniforms(ctx)
  }

  /** Pack all skybox fragment uniform values into the typed array and write to GPU. */
  private packSkyboxData(
    shaderMode: ShaderSkyboxMode,
    baseIntensity: number,
    settings: SkyboxProceduralSettings | undefined,
    t: number,
    animHue: number,
    animIntensityMul: number,
    animDistortion: number
  ): void {
    const data = this.skyboxUniformData
    data.fill(0)

    // Core uniforms (first 64 bytes / 16 floats)
    packSkyboxCoreUniforms(
      data,
      shaderMode,
      settings,
      t,
      baseIntensity * animIntensityMul,
      (settings?.hue ?? 0.0) + animHue,
      animDistortion
    )

    // Cosine palette (indices 16-39)
    packSkyboxPalette(data, settings?.cosineCoefficients)

    // Sun position + mode-specific settings (indices 40-51)
    packSkyboxModeSettings(data, settings)

    // CPU-precomputed dispatch-uniform palette samples (indices 52-107).
    // Hoists 14 cosinePalette() calls off the per-pixel skybox hot path.
    // Effective time matches main.wgsl.ts line 64: time = uniforms.time * uniforms.timeScale.
    const timeScale = settings?.timeScale ?? 0.2
    packSkyboxPrecomputedPalettes(data, settings?.cosineCoefficients, t * timeScale)

    this.writeUniformBuffer(this.device!, this.uniformBuffer!, data, 0)
  }

  /**
   * Update vertex uniforms (matrices for skybox rendering).
   * @param ctx
   */
  private updateVertexUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.uniformBuffer) return

    const camera = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')

    const env = getStoreSnapshot<{
      skyboxRotation?: number
    }>(ctx, 'environment')

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

    // VertexUniforms now live at offset 512 (was 256) since SkyboxUniforms grew.
    this.writeUniformBuffer(this.device, this.uniformBuffer, data, 512)
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBindGroup ||
      !this.textureBindGroup ||
      !this.vertexBuffer
    ) {
      return
    }

    // Handle pipeline recreation for mode changes
    if (this.pipelineNeedsRecreation && this.cachedSetupCtx) {
      this.pipelineNeedsRecreation = false
      this.createPipelineForMode(this.device, this.currentShaderMode)
        .then(() => {
          this.pipelineRecreationRetries = 0
        })
        .catch((err) => {
          this.pipelineRecreationRetries++
          if (this.pipelineRecreationRetries < WebGPUSkyboxRenderer.MAX_PIPELINE_RETRIES) {
            logger.warn(
              `[WebGPU Skybox] Pipeline recreation failed (attempt ${this.pipelineRecreationRetries}/${WebGPUSkyboxRenderer.MAX_PIPELINE_RETRIES}), retrying:`,
              err
            )
            this.pipelineNeedsRecreation = true
          } else {
            logger.error(
              `[WebGPU Skybox] Pipeline recreation failed after ${WebGPUSkyboxRenderer.MAX_PIPELINE_RETRIES} attempts, giving up:`,
              err
            )
          }
        })
    }

    // Update uniforms from stores
    this.updateUniforms(ctx)

    // Get render targets
    const colorView = ctx.getWriteTarget('scene-render')

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
