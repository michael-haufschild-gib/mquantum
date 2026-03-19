/**
 * WebGPU Temporal Cloud Pass
 *
 * Performs temporal accumulation for volumetric cloud rendering.
 * Uses quarter-resolution rendering with Bayer pattern sampling
 * and temporal reprojection for high-quality reconstruction.
 *
 * ## Pipeline Overview
 *
 * 1. **Reprojection Pass**: Reprojects previous frame's accumulated data to current view
 * 2. **Reconstruction Pass**: Combines fresh quarter-res pixels with reprojected history
 *
 * ## MRT Layout
 *
 * ### Accumulation Buffer (Full Resolution, PingPong)
 * | Attachment | Content                | Format       |
 * |------------|------------------------|--------------|
 * | 0          | Accumulated Color      | rgba16float  |
 * | 1          | World Position         | rgba16float  |
 *
 * ### Reprojection Buffer (Full Resolution)
 * | Attachment | Content                | Format       |
 * |------------|------------------------|--------------|
 * | 0          | Reprojected Color      | rgba16float  |
 * | 1          | Validity Mask (R=valid)| rgba16float  |
 *
 * @module rendering/webgpu/passes/TemporalCloudPass
 */

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import {
  BAYER_OFFSETS,
  FULLSCREEN_VERTEX_SHADER,
  RECONSTRUCTION_SHADER,
  REPROJECTION_SHADER,
} from '../shaders/temporal/temporalCloudShaders.wgsl'

/**
 * Configuration for the Temporal Cloud Pass.
 */
export interface TemporalCloudPassConfig {
  /** Resource ID for quarter-res cloud color input */
  cloudColorInput: string
  /** Resource ID for quarter-res cloud position input */
  cloudPositionInput: string
  /** Resource ID for accumulation color buffer (ping-pong) */
  accumulationColorBuffer: string
  /** Resource ID for accumulation position buffer (ping-pong) */
  accumulationPositionBuffer: string
  /** Resource ID for reprojection color output */
  reprojectionColorOutput: string
  /** Resource ID for reprojection validity output */
  reprojectionValidityOutput: string
  /** History weight (0 = favor new, 1 = favor history) */
  historyWeight?: number
  /** Disocclusion threshold for validity rejection */
  disocclusionThreshold?: number
}

// =============================================================================
// Pass Implementation
// =============================================================================

/**
 * WebGPU Temporal Cloud Pass.
 *
 * Implements temporal accumulation for volumetric cloud rendering using
 * quarter-resolution rendering with Bayer pattern sampling and temporal
 * reprojection for high-quality reconstruction.
 *
 * @example
 * ```typescript
 * const temporalCloudPass = new TemporalCloudPass({
 *   cloudColorInput: 'cloudRenderColor',
 *   cloudPositionInput: 'cloudRenderPosition',
 *   accumulationColorBuffer: 'temporalAccumColor',
 *   accumulationPositionBuffer: 'temporalAccumPosition',
 *   reprojectionColorOutput: 'reprojectedColor',
 *   reprojectionValidityOutput: 'reprojectionValidity',
 *   historyWeight: 0.85,
 * });
 * ```
 */
export class TemporalCloudPass extends WebGPUBasePass {
  private passConfig: TemporalCloudPassConfig

  // Pipelines
  private reprojectionPipeline: GPURenderPipeline | null = null
  private reconstructionPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private reconstructionBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffers
  private reprojectionUniformBuffer: GPUBuffer | null = null
  private reconstructionUniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Pre-allocated uniform staging buffers
  private reprojectionUniformData = new Float32Array(40) // 160 bytes
  private reconstructionUniformData = new Float32Array(12) // 48 bytes
  private reconstructionUniformIntView = new Int32Array(this.reconstructionUniformData.buffer)
  private currentViewProjectionMatrix = new Float32Array(16)

  // Cached bind groups
  private reprojectionBindGroup: GPUBindGroup | null = null
  private reprojectionBindGroupAccumColorView: GPUTextureView | null = null
  private reprojectionBindGroupAccumPositionView: GPUTextureView | null = null
  private reconstructionBindGroup: GPUBindGroup | null = null
  private reconstructionCloudColorView: GPUTextureView | null = null
  private reconstructionCloudPositionView: GPUTextureView | null = null
  private reconstructionHistoryColorView: GPUTextureView | null = null
  private reconstructionHistoryPositionView: GPUTextureView | null = null
  private reconstructionValidityView: GPUTextureView | null = null

  // State
  private frameIndex = 0
  private hasValidHistory = false
  private prevViewProjectionMatrix = new Float32Array(16)
  private textureFormat: GPUTextureFormat = 'rgba16float'

  // Configuration
  private historyWeight: number
  private disocclusionThreshold: number

  constructor(config: TemporalCloudPassConfig) {
    super({
      id: 'temporal-cloud',
      priority: 150,
      inputs: [
        { resourceId: config.cloudColorInput, access: 'read' as const, binding: 0 },
        { resourceId: config.cloudPositionInput, access: 'read' as const, binding: 1 },
        { resourceId: config.accumulationColorBuffer, access: 'read' as const, binding: 2 },
        { resourceId: config.accumulationPositionBuffer, access: 'read' as const, binding: 3 },
      ],
      outputs: [
        { resourceId: config.reprojectionColorOutput, access: 'write' as const, binding: 0 },
        { resourceId: config.reprojectionValidityOutput, access: 'write' as const, binding: 1 },
        { resourceId: config.accumulationColorBuffer, access: 'write' as const, binding: 2 },
        { resourceId: config.accumulationPositionBuffer, access: 'write' as const, binding: 3 },
      ],
    })

    this.passConfig = config
    this.historyWeight = config.historyWeight ?? 0.85
    this.disocclusionThreshold = config.disocclusionThreshold ?? 0.15

    // Initialize identity matrix
    this.prevViewProjectionMatrix[0] = 1
    this.prevViewProjectionMatrix[5] = 1
    this.prevViewProjectionMatrix[10] = 1
    this.prevViewProjectionMatrix[15] = 1
  }

  /**
   * Create the rendering pipelines.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx
    this.textureFormat = format

    // Create reprojection bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-cloud-reprojection-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create reconstruction bind group layout
    this.reconstructionBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-cloud-reconstruction-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create shader modules
    const reprojectionFragmentModule = this.createShaderModule(
      device,
      REPROJECTION_SHADER,
      'temporal-cloud-reprojection-fragment'
    )

    const reconstructionFragmentModule = this.createShaderModule(
      device,
      RECONSTRUCTION_SHADER,
      'temporal-cloud-reconstruction-fragment'
    )

    // Create reprojection pipeline (MRT: 2 outputs)
    this.reprojectionPipeline = this.createMRTPipeline(
      device,
      reprojectionFragmentModule,
      [this.passBindGroupLayout],
      [this.textureFormat, this.textureFormat],
      { label: 'temporal-cloud-reprojection' }
    )

    // Create reconstruction pipeline (MRT: 2 outputs)
    this.reconstructionPipeline = this.createMRTPipeline(
      device,
      reconstructionFragmentModule,
      [this.reconstructionBindGroupLayout],
      [this.textureFormat, this.textureFormat],
      { label: 'temporal-cloud-reconstruction' }
    )

    // Create uniform buffers
    // Reprojection: 2x mat4 (128) + vec3 + pad (16) + vec2 + f32 + pad (16) = 160 bytes
    this.reprojectionUniformBuffer = this.createUniformBuffer(
      device,
      160,
      'temporal-cloud-reprojection-uniforms'
    )

    // Reconstruction: vec2 + i32 + i32 (16) + vec2 + vec2 (16) + f32 + 3xpad (16) = 48 bytes
    this.reconstructionUniformBuffer = this.createUniformBuffer(
      device,
      48,
      'temporal-cloud-reconstruction-uniforms'
    )

    // Create sampler
    this.sampler = device.createSampler({
      label: 'temporal-cloud-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Create a render pipeline with multiple render targets (MRT).
   * @param device
   * @param fragmentShader
   * @param bindGroupLayouts
   * @param colorFormats
   * @param options
   * @param options.label
   */
  private createMRTPipeline(
    device: GPUDevice,
    fragmentShader: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    colorFormats: GPUTextureFormat[],
    options?: { label?: string }
  ): GPURenderPipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: options?.label ? `${options.label}-layout` : `${this.id}-mrt-layout`,
      bindGroupLayouts,
    })

    // Standard fullscreen vertex shader
    const vertexShader = device.createShaderModule({
      label: `${this.id}-vertex`,
      code: FULLSCREEN_VERTEX_SHADER,
    })

    const colorTargets: GPUColorTargetState[] = colorFormats.map((format) => ({
      format,
      writeMask: GPUColorWrite.ALL,
    }))

    return device.createRenderPipeline({
      label: options?.label ?? `${this.id}-mrt-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: vertexShader,
        entryPoint: 'main',
        buffers: [this.getFullscreenVertexLayout()],
      },
      fragment: {
        module: fragmentShader,
        entryPoint: 'main',
        targets: colorTargets,
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  /**
   * Set history weight.
   * @param value
   */
  setHistoryWeight(value: number): void {
    this.historyWeight = value
  }

  /**
   * Set disocclusion threshold.
   * @param value
   */
  setDisocclusionThreshold(value: number): void {
    this.disocclusionThreshold = value
  }

  /**
   * Reset temporal history (e.g., on camera teleport).
   */
  resetHistory(): void {
    this.hasValidHistory = false
    this.frameIndex = 0
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null
  }

  /**
   * Update camera state from external source.
   * Call this each frame before execute() with the current view-projection matrix.
   * @param viewProjectionMatrix
   */
  updateCameraState(viewProjectionMatrix: Float32Array): void {
    // Store previous matrix
    this.prevViewProjectionMatrix.set(viewProjectionMatrix)
  }

  /**
   * Execute the temporal cloud pass.
   * @param ctx
   */
  /** Extract VP matrix and camera position from store snapshot. */
  private extractCameraState(
    camera:
      | {
          viewProjectionMatrix?: { elements: number[] }
          position?: { x: number; y: number; z: number } | [number, number, number]
        }
      | undefined
  ): { currentVP: Float32Array; camPos: [number, number, number] } {
    const currentVP = this.currentViewProjectionMatrix
    currentVP.fill(0)
    if (camera?.viewProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        currentVP[i] = camera.viewProjectionMatrix.elements[i] ?? 0
      }
    } else {
      currentVP[0] = 1
      currentVP[5] = 1
      currentVP[10] = 1
      currentVP[15] = 1
    }

    let camPos: [number, number, number] = [0, 0, 0]
    if (camera?.position) {
      if (Array.isArray(camera.position)) {
        camPos = [camera.position[0] ?? 0, camera.position[1] ?? 0, camera.position[2] ?? 0]
      } else {
        camPos = [camera.position.x ?? 0, camera.position.y ?? 0, camera.position.z ?? 0]
      }
    }

    return { currentVP, camPos }
  }

  /** Acquire all required resources for temporal cloud execution. Returns null if any are missing. */
  private acquireResources(ctx: WebGPURenderContext) {
    if (
      !this.device ||
      !this.reprojectionPipeline ||
      !this.reconstructionPipeline ||
      !this.reprojectionUniformBuffer ||
      !this.reconstructionUniformBuffer ||
      !this.passBindGroupLayout ||
      !this.reconstructionBindGroupLayout ||
      !this.sampler
    ) {
      return null
    }

    const cloudColorView = ctx.getTextureView(this.passConfig.cloudColorInput)
    const cloudPositionView = ctx.getTextureView(this.passConfig.cloudPositionInput)
    if (!cloudColorView || !cloudPositionView) return null

    const accumColorReadView = ctx.getReadTextureView(this.passConfig.accumulationColorBuffer)
    const accumPositionReadView = ctx.getReadTextureView(this.passConfig.accumulationPositionBuffer)
    const accumColorWriteView = ctx.getWriteTarget(this.passConfig.accumulationColorBuffer)
    const accumPositionWriteView = ctx.getWriteTarget(this.passConfig.accumulationPositionBuffer)
    const reprojColorView = ctx.getWriteTarget(this.passConfig.reprojectionColorOutput)
    const reprojValidityView = ctx.getWriteTarget(this.passConfig.reprojectionValidityOutput)

    if (
      !accumColorReadView ||
      !accumPositionReadView ||
      !accumColorWriteView ||
      !accumPositionWriteView ||
      !reprojColorView ||
      !reprojValidityView
    ) {
      return null
    }

    return {
      cloudColorView,
      cloudPositionView,
      accumColorReadView,
      accumPositionReadView,
      accumColorWriteView,
      accumPositionWriteView,
      reprojColorView,
      reprojValidityView,
    }
  }

  execute(ctx: WebGPURenderContext): void {
    const resources = this.acquireResources(ctx)
    if (!resources) return

    // acquireResources verified all required resources are non-null

    const {
      cloudColorView,
      cloudPositionView,
      accumColorReadView,
      accumPositionReadView,
      accumColorWriteView,
      accumPositionWriteView,
      reprojColorView,
      reprojValidityView,
    } = resources

    const { width, height } = ctx.size
    const bayerOffset = BAYER_OFFSETS[this.frameIndex] ?? [0, 0]

    // Get cloud resource to determine quarter resolution
    const cloudResource = ctx.getResource(this.passConfig.cloudColorInput)
    const cloudWidth = cloudResource?.width ?? width / 2
    const cloudHeight = cloudResource?.height ?? height / 2

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      viewProjectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number } | [number, number, number]
    }

    // Extract camera state
    const { currentVP, camPos } = this.extractCameraState(camera)

    // === REPROJECTION PASS ===
    if (this.hasValidHistory) {
      const reprojData = this.reprojectionUniformData

      // prevViewProjectionMatrix (offset 0, 64 bytes)
      for (let i = 0; i < 16; i++) {
        reprojData[i] = this.prevViewProjectionMatrix[i] ?? 0
      }

      // viewProjectionMatrix (offset 64, 64 bytes) - current frame's matrix
      for (let i = 0; i < 16; i++) {
        reprojData[16 + i] = currentVP[i] ?? 0
      }

      // cameraPosition (offset 128, 12 bytes) + pad
      reprojData[32] = camPos[0]
      reprojData[33] = camPos[1]
      reprojData[34] = camPos[2]
      reprojData[35] = 0

      // accumulationResolution (offset 144, 8 bytes) + disocclusionThreshold + pad
      reprojData[36] = width
      reprojData[37] = height
      reprojData[38] = this.disocclusionThreshold
      reprojData[39] = 0

      this.writeUniformBuffer(this.device!, this.reprojectionUniformBuffer!, reprojData)

      if (
        !this.reprojectionBindGroup ||
        this.reprojectionBindGroupAccumColorView !== accumColorReadView ||
        this.reprojectionBindGroupAccumPositionView !== accumPositionReadView
      ) {
        this.reprojectionBindGroup = this.device!.createBindGroup({
          label: 'temporal-cloud-reprojection-bg',
          layout: this.passBindGroupLayout!,
          entries: [
            { binding: 0, resource: { buffer: this.reprojectionUniformBuffer! } },
            { binding: 1, resource: this.sampler! },
            { binding: 2, resource: accumColorReadView },
            { binding: 3, resource: accumPositionReadView },
          ],
        })
        this.reprojectionBindGroupAccumColorView = accumColorReadView
        this.reprojectionBindGroupAccumPositionView = accumPositionReadView
      }

      const reprojPassEncoder = ctx.beginRenderPass({
        label: 'temporal-cloud-reprojection',
        colorAttachments: [
          {
            view: reprojColorView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
          {
            view: reprojValidityView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })

      this.renderFullscreen(reprojPassEncoder, this.reprojectionPipeline!, [
        this.reprojectionBindGroup!,
      ])
      reprojPassEncoder.end()
    }

    // === RECONSTRUCTION PASS ===
    const reconData = this.reconstructionUniformData
    const reconInts = this.reconstructionUniformIntView

    // bayerOffset (offset 0, 8 bytes) + frameIndex + hasValidHistory
    reconData[0] = bayerOffset[0]
    reconData[1] = bayerOffset[1]
    reconInts[2] = this.frameIndex
    reconInts[3] = this.hasValidHistory ? 1 : 0

    // cloudResolution (offset 16, 8 bytes) + accumulationResolution (8 bytes)
    reconData[4] = cloudWidth
    reconData[5] = cloudHeight
    reconData[6] = width
    reconData[7] = height

    // historyWeight (offset 32, 4 bytes) + padding (12 bytes)
    reconData[8] = this.historyWeight
    reconData[9] = 0
    reconData[10] = 0
    reconData[11] = 0

    this.writeUniformBuffer(this.device!, this.reconstructionUniformBuffer!, reconData)

    // For reconstruction, we need reprojection outputs as inputs
    // IMPORTANT: Use getTextureView() for reading, not the write targets, to avoid read-after-write hazard
    // If no valid history, use cloud textures as fallback
    const reprojHistoryReadView = this.hasValidHistory
      ? ctx.getTextureView(this.passConfig.reprojectionColorOutput)
      : cloudColorView
    const reprojPositionView = this.hasValidHistory ? accumPositionReadView : cloudPositionView
    const validityReadView = this.hasValidHistory
      ? ctx.getTextureView(this.passConfig.reprojectionValidityOutput)
      : cloudColorView

    // Guard against missing read views
    if (!reprojHistoryReadView || !validityReadView) {
      return
    }

    if (
      !this.reconstructionBindGroup ||
      this.reconstructionCloudColorView !== cloudColorView ||
      this.reconstructionCloudPositionView !== cloudPositionView ||
      this.reconstructionHistoryColorView !== reprojHistoryReadView ||
      this.reconstructionHistoryPositionView !== reprojPositionView ||
      this.reconstructionValidityView !== validityReadView
    ) {
      this.reconstructionBindGroup = this.device!.createBindGroup({
        label: 'temporal-cloud-reconstruction-bg',
        layout: this.reconstructionBindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.reconstructionUniformBuffer! } },
          { binding: 1, resource: this.sampler! },
          { binding: 2, resource: cloudColorView },
          { binding: 3, resource: cloudPositionView },
          { binding: 4, resource: reprojHistoryReadView },
          { binding: 5, resource: reprojPositionView },
          { binding: 6, resource: validityReadView },
        ],
      })
      this.reconstructionCloudColorView = cloudColorView
      this.reconstructionCloudPositionView = cloudPositionView
      this.reconstructionHistoryColorView = reprojHistoryReadView
      this.reconstructionHistoryPositionView = reprojPositionView
      this.reconstructionValidityView = validityReadView
    }

    const reconPassEncoder = ctx.beginRenderPass({
      label: 'temporal-cloud-reconstruction',
      colorAttachments: [
        {
          view: accumColorWriteView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
        {
          view: accumPositionWriteView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })

    this.renderFullscreen(reconPassEncoder, this.reconstructionPipeline!, [
      this.reconstructionBindGroup!,
    ])
    reconPassEncoder.end()

    // Update state for next frame
    this.frameIndex = (this.frameIndex + 1) % 4
    this.hasValidHistory = true

    // Store current viewProjectionMatrix for next frame's reprojection
    this.prevViewProjectionMatrix.set(currentVP)
  }

  /**
   * Post-frame hook for temporal state management.
   */
  postFrame(): void {
    // Frame index is already updated in execute()
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    this.hasValidHistory = false
    this.frameIndex = 0
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.reprojectionPipeline = null
    this.reconstructionPipeline = null
    this.passBindGroupLayout = null
    this.reconstructionBindGroupLayout = null
    this.reprojectionUniformBuffer?.destroy()
    this.reprojectionUniformBuffer = null
    this.reconstructionUniformBuffer?.destroy()
    this.reconstructionUniformBuffer = null
    this.sampler = null
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null

    super.dispose()
  }
}
