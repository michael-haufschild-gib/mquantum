/**
 * WebGPU Temporal Cloud Pass
 *
 * Implements Horizon-style 3-pass temporal accumulation for volumetric rendering:
 * 1. Quarter-res render (with Bayer jitter) - handled by Schrödinger renderer
 * 2. Reprojection - reproject history using motion vectors
 * 3. Reconstruction - blend with neighborhood clamping
 *
 * This reduces per-frame pixel count by 75% while maintaining visual quality
 * through temporal accumulation.
 *
 * @module rendering/webgpu/passes/WebGPUTemporalCloudPass
 */

import type {
  WebGPURenderContext,
  WebGPURenderPassConfig,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { temporalReprojectionShader } from '../shaders/temporal/reprojection.wgsl'
import { temporalReconstructionShader } from '../shaders/temporal/reconstruction.wgsl'

/** Configuration for temporal cloud pass */
export interface TemporalCloudPassConfig {
  /** Color input resource from quarter-res volumetric render */
  quarterColorInput: string
  /** World position input from quarter-res volumetric render */
  quarterPositionInput: string
  /** Output resource for accumulated color */
  outputResource: string
  /** History weight for blending (default: 0.85) */
  historyWeight?: number
}

/** Bayer pattern offsets for 4-frame cycle */
const BAYER_OFFSETS: [number, number][] = [
  [0.0, 0.0], // Frame 0
  [1.0, 1.0], // Frame 1
  [1.0, 0.0], // Frame 2
  [0.0, 1.0], // Frame 3
]

interface ReprojectionTextureBindGroupCacheEntry {
  accumulationView: GPUTextureView
  positionView: GPUTextureView
  bindGroup: GPUBindGroup
}

interface ReconstructionTextureBindGroupCacheEntry {
  quarterColorView: GPUTextureView
  historyView: GPUTextureView
  bindGroup: GPUBindGroup
}

/**
 * Temporal accumulation pass for volumetric rendering.
 * Orchestrates reprojection and reconstruction from quarter-res input.
 */
export class WebGPUTemporalCloudPass extends WebGPUBasePass {
  private passConfig: TemporalCloudPassConfig

  // Pipelines
  private reprojectionPipeline: GPURenderPipeline | null = null
  private reconstructionPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private reprojectionBindGroupLayout0: GPUBindGroupLayout | null = null
  private reprojectionBindGroupLayout1: GPUBindGroupLayout | null = null
  private reconstructionBindGroupLayout0: GPUBindGroupLayout | null = null
  private reconstructionBindGroupLayout1: GPUBindGroupLayout | null = null

  // Uniform buffers
  private temporalUniformBuffer: GPUBuffer | null = null
  private temporalUniformData = new ArrayBuffer(176) // 11 * 16 bytes aligned

  // Internal textures (full resolution)
  private reprojectedHistoryTexture: GPUTexture | null = null
  private reprojectedHistoryView: GPUTextureView | null = null
  private accumulationTextureA: GPUTexture | null = null
  private accumulationTextureB: GPUTexture | null = null
  private accumulationViewA: GPUTextureView | null = null
  private accumulationViewB: GPUTextureView | null = null

  // State
  private frameIndex = 0
  private prevViewProjectionMatrix = new Float32Array(16)
  private prevCameraPosition = { x: 0, y: 0, z: 0 }
  // PERF: Pre-allocated matrix buffers to avoid per-frame GC pressure
  private _viewProjectionMatrix = new Float32Array(16)
  private _inverseViewProjectionMatrix = new Float32Array(16)
  private _fallbackIdentityMatrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
  private hasValidHistory = false
  private lastWidth = 0
  private lastHeight = 0

  // Samplers
  private linearSampler: GPUSampler | null = null
  private nearestSampler: GPUSampler | null = null

  // Cached bind groups to avoid per-frame allocations
  private reprojectionBindGroup0: GPUBindGroup | null = null
  private reprojectionBindGroup1Cache: ReprojectionTextureBindGroupCacheEntry[] = []
  private reconstructionBindGroup0: GPUBindGroup | null = null
  private reconstructionBindGroup1Cache: ReconstructionTextureBindGroupCacheEntry[] = []

  // Configuration
  private historyWeight: number

  // Camera cut detection threshold (squared distance)
  private static readonly CAMERA_CUT_THRESHOLD_SQ = 4.0 // ~2 units of movement

  constructor(config: TemporalCloudPassConfig) {
    const passConfig: WebGPURenderPassConfig = {
      id: 'temporal-cloud',
      name: 'Temporal Cloud Accumulation',
      inputs: [
        { resourceId: config.quarterColorInput, access: 'read', binding: 0, group: 1 },
        { resourceId: config.quarterPositionInput, access: 'read', binding: 1, group: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write', binding: 0, group: 0 }],
      priority: 50, // After volumetric render, before post-processing
    }

    super(passConfig)
    this.passConfig = config
    this.historyWeight = config.historyWeight ?? 0.85
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create samplers
    this.linearSampler = device.createSampler({
      label: 'temporal-linear-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.nearestSampler = device.createSampler({
      label: 'temporal-nearest-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Create temporal uniform buffer (176 bytes aligned)
    this.temporalUniformBuffer = this.createUniformBuffer(device, 176, 'temporal-uniforms')

    // Create reprojection bind group layouts
    this.reprojectionBindGroupLayout0 = device.createBindGroupLayout({
      label: 'temporal-reprojection-bgl0',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })

    this.reprojectionBindGroupLayout1 = device.createBindGroupLayout({
      label: 'temporal-reprojection-bgl1',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          // prevAccumulation is rgba16float - filterable
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          // quarterPosition is rgba32float - UNFILTERABLE (32-bit float textures can't be filtered)
          texture: { sampleType: 'unfilterable-float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })

    // Create reconstruction bind group layouts
    this.reconstructionBindGroupLayout0 = device.createBindGroupLayout({
      label: 'temporal-reconstruction-bgl0',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })

    this.reconstructionBindGroupLayout1 = device.createBindGroupLayout({
      label: 'temporal-reconstruction-bgl1',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'non-filtering' },
        },
      ],
    })

    // Create reprojection pipeline
    const reprojectionShaderModule = this.createShaderModule(
      device,
      temporalReprojectionShader,
      'temporal-reprojection-shader'
    )

    this.reprojectionPipeline = this.createFullscreenPipeline(
      device,
      reprojectionShaderModule,
      [this.reprojectionBindGroupLayout0, this.reprojectionBindGroupLayout1],
      'rgba16float',
      { label: 'temporal-reprojection-pipeline' }
    )

    // Create reconstruction pipeline
    const reconstructionShaderModule = this.createShaderModule(
      device,
      temporalReconstructionShader,
      'temporal-reconstruction-shader'
    )

    this.reconstructionPipeline = this.createFullscreenPipeline(
      device,
      reconstructionShaderModule,
      [this.reconstructionBindGroupLayout0, this.reconstructionBindGroupLayout1],
      'rgba16float',
      { label: 'temporal-reconstruction-pipeline' }
    )
  }

  private getOrCreateReprojectionUniformBindGroup(): GPUBindGroup {
    if (!this.reprojectionBindGroup0) {
      this.reprojectionBindGroup0 = this.createBindGroup(
        this.device,
        this.reprojectionBindGroupLayout0!,
        [{ binding: 0, resource: { buffer: this.temporalUniformBuffer! } }],
        'temporal-reprojection-bg0'
      )
    }

    return this.reprojectionBindGroup0
  }

  private getOrCreateReprojectionTextureBindGroup(
    accumulationView: GPUTextureView,
    positionView: GPUTextureView
  ): GPUBindGroup {
    const cached = this.reprojectionBindGroup1Cache.find(
      (entry) => entry.accumulationView === accumulationView && entry.positionView === positionView
    )
    if (cached) {
      return cached.bindGroup
    }

    const bindGroup = this.createBindGroup(
      this.device,
      this.reprojectionBindGroupLayout1!,
      [
        { binding: 0, resource: accumulationView },
        { binding: 1, resource: positionView },
        { binding: 2, resource: this.linearSampler! },
      ],
      'temporal-reprojection-bg1'
    )
    this.reprojectionBindGroup1Cache.push({ accumulationView, positionView, bindGroup })
    return bindGroup
  }

  private getOrCreateReconstructionUniformBindGroup(): GPUBindGroup {
    if (!this.reconstructionBindGroup0) {
      this.reconstructionBindGroup0 = this.createBindGroup(
        this.device,
        this.reconstructionBindGroupLayout0!,
        [{ binding: 0, resource: { buffer: this.temporalUniformBuffer! } }],
        'temporal-reconstruction-bg0'
      )
    }

    return this.reconstructionBindGroup0
  }

  private getOrCreateReconstructionTextureBindGroup(
    quarterColorView: GPUTextureView,
    historyView: GPUTextureView
  ): GPUBindGroup {
    const cached = this.reconstructionBindGroup1Cache.find(
      (entry) => entry.quarterColorView === quarterColorView && entry.historyView === historyView
    )
    if (cached) {
      return cached.bindGroup
    }

    const bindGroup = this.createBindGroup(
      this.device,
      this.reconstructionBindGroupLayout1!,
      [
        { binding: 0, resource: quarterColorView },
        { binding: 1, resource: historyView },
        { binding: 2, resource: this.nearestSampler! },
      ],
      'temporal-reconstruction-bg1'
    )
    this.reconstructionBindGroup1Cache.push({ quarterColorView, historyView, bindGroup })
    return bindGroup
  }

  private resetBindGroupCaches(): void {
    this.reprojectionBindGroup0 = null
    this.reprojectionBindGroup1Cache = []
    this.reconstructionBindGroup0 = null
    this.reconstructionBindGroup1Cache = []
  }

  /**
   * Ensure internal textures are allocated at correct size.
   * @param device
   * @param width
   * @param height
   */
  private ensureInternalTextures(device: GPUDevice, width: number, height: number): void {
    if (this.lastWidth === width && this.lastHeight === height) {
      return
    }

    // Dispose old textures
    this.reprojectedHistoryTexture?.destroy()
    this.accumulationTextureA?.destroy()
    this.accumulationTextureB?.destroy()

    // Create reprojected history texture (full resolution)
    this.reprojectedHistoryTexture = device.createTexture({
      label: 'temporal-reprojected-history',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.reprojectedHistoryView = this.reprojectedHistoryTexture.createView({
      label: 'temporal-reprojected-history-view',
    })

    // Create ping-pong accumulation textures (full resolution)
    // Add COPY_DST for accumulation buffer copy
    this.accumulationTextureA = device.createTexture({
      label: 'temporal-accumulation-a',
      size: { width, height },
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST,
    })
    this.accumulationViewA = this.accumulationTextureA.createView({
      label: 'temporal-accumulation-a-view',
    })

    this.accumulationTextureB = device.createTexture({
      label: 'temporal-accumulation-b',
      size: { width, height },
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST,
    })
    this.accumulationViewB = this.accumulationTextureB.createView({
      label: 'temporal-accumulation-b-view',
    })

    this.lastWidth = width
    this.lastHeight = height
    this.hasValidHistory = false
    this.resetBindGroupCaches()
  }

  /**
   * Invert a 4x4 matrix in-place (column-major order).
   * Returns false if matrix is singular.
   * @param m
   * @param out
   */
  private invertMatrix4(m: Float32Array, out: Float32Array): boolean {
    // Use non-null assertions since we know m is a 16-element matrix
    const m00 = m[0]!,
      m01 = m[1]!,
      m02 = m[2]!,
      m03 = m[3]!
    const m10 = m[4]!,
      m11 = m[5]!,
      m12 = m[6]!,
      m13 = m[7]!
    const m20 = m[8]!,
      m21 = m[9]!,
      m22 = m[10]!,
      m23 = m[11]!
    const m30 = m[12]!,
      m31 = m[13]!,
      m32 = m[14]!,
      m33 = m[15]!

    const tmp_0 = m22 * m33
    const tmp_1 = m32 * m23
    const tmp_2 = m12 * m33
    const tmp_3 = m32 * m13
    const tmp_4 = m12 * m23
    const tmp_5 = m22 * m13
    const tmp_6 = m02 * m33
    const tmp_7 = m32 * m03
    const tmp_8 = m02 * m23
    const tmp_9 = m22 * m03
    const tmp_10 = m02 * m13
    const tmp_11 = m12 * m03
    const tmp_12 = m20 * m31
    const tmp_13 = m30 * m21
    const tmp_14 = m10 * m31
    const tmp_15 = m30 * m11
    const tmp_16 = m10 * m21
    const tmp_17 = m20 * m11
    const tmp_18 = m00 * m31
    const tmp_19 = m30 * m01
    const tmp_20 = m00 * m21
    const tmp_21 = m20 * m01
    const tmp_22 = m00 * m11
    const tmp_23 = m10 * m01

    const t0 = tmp_0 * m11 + tmp_3 * m21 + tmp_4 * m31 - (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31)
    const t1 = tmp_1 * m01 + tmp_6 * m21 + tmp_9 * m31 - (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31)
    const t2 = tmp_2 * m01 + tmp_7 * m11 + tmp_10 * m31 - (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31)
    const t3 = tmp_5 * m01 + tmp_8 * m11 + tmp_11 * m21 - (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21)

    const d = 1.0 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3)

    if (!isFinite(d)) {
      return false
    }

    out[0] = d * t0
    out[1] = d * t1
    out[2] = d * t2
    out[3] = d * t3
    out[4] =
      d * (tmp_1 * m10 + tmp_2 * m20 + tmp_5 * m30 - (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30))
    out[5] =
      d * (tmp_0 * m00 + tmp_7 * m20 + tmp_8 * m30 - (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30))
    out[6] =
      d * (tmp_3 * m00 + tmp_6 * m10 + tmp_11 * m30 - (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30))
    out[7] =
      d * (tmp_4 * m00 + tmp_9 * m10 + tmp_10 * m20 - (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20))
    out[8] =
      d *
      (tmp_12 * m13 + tmp_15 * m23 + tmp_16 * m33 - (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33))
    out[9] =
      d *
      (tmp_13 * m03 + tmp_18 * m23 + tmp_21 * m33 - (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33))
    out[10] =
      d *
      (tmp_14 * m03 + tmp_19 * m13 + tmp_22 * m33 - (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33))
    out[11] =
      d *
      (tmp_17 * m03 + tmp_20 * m13 + tmp_23 * m23 - (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23))
    out[12] =
      d *
      (tmp_14 * m22 + tmp_17 * m32 + tmp_13 * m12 - (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22))
    out[13] =
      d *
      (tmp_20 * m32 + tmp_12 * m02 + tmp_19 * m22 - (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02))
    out[14] =
      d *
      (tmp_18 * m12 + tmp_23 * m32 + tmp_15 * m02 - (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12))
    out[15] =
      d *
      (tmp_22 * m22 + tmp_16 * m02 + tmp_21 * m12 - (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02))

    return true
  }

  /**
   * Extract camera matrices from frame context.
   * Returns null if camera data is unavailable.
   * @param ctx
   */
  private getCameraMatrices(ctx: WebGPURenderContext): {
    viewProjectionMatrix: Float32Array
    inverseViewProjectionMatrix: Float32Array
    position: { x: number; y: number; z: number }
  } | null {
    const cameraStore = ctx.frame?.stores?.['camera'] as
      | {
          viewProjectionMatrix?: { elements: number[] }
          position?: { x: number; y: number; z: number } | number[]
        }
      | undefined

    if (!cameraStore?.viewProjectionMatrix?.elements) {
      return null
    }

    const vpElements = cameraStore.viewProjectionMatrix.elements
    // PERF: Reuse pre-allocated matrix buffers
    const viewProjectionMatrix = this._viewProjectionMatrix
    viewProjectionMatrix.set(vpElements)

    // Compute inverse view-projection matrix
    const inverseViewProjectionMatrix = this._inverseViewProjectionMatrix
    if (!this.invertMatrix4(viewProjectionMatrix, inverseViewProjectionMatrix)) {
      // If inversion fails, use identity
      inverseViewProjectionMatrix.fill(0)
      inverseViewProjectionMatrix[0] = inverseViewProjectionMatrix[5] = 1
      inverseViewProjectionMatrix[10] = inverseViewProjectionMatrix[15] = 1
    }

    // Extract camera position
    let position: { x: number; y: number; z: number }
    if (Array.isArray(cameraStore.position)) {
      position = {
        x: cameraStore.position[0] ?? 0,
        y: cameraStore.position[1] ?? 0,
        z: cameraStore.position[2] ?? 0,
      }
    } else if (cameraStore.position) {
      position = cameraStore.position
    } else {
      position = { x: 0, y: 0, z: 0 }
    }

    return { viewProjectionMatrix, inverseViewProjectionMatrix, position }
  }

  /**
   * Detect camera cut (large camera movement) that should reset history.
   * @param newPosition
   * @param newPosition.x
   * @param newPosition.y
   * @param newPosition.z
   */
  private detectCameraCut(newPosition: { x: number; y: number; z: number }): boolean {
    const dx = newPosition.x - this.prevCameraPosition.x
    const dy = newPosition.y - this.prevCameraPosition.y
    const dz = newPosition.z - this.prevCameraPosition.z
    const distSq = dx * dx + dy * dy + dz * dz
    return distSq > WebGPUTemporalCloudPass.CAMERA_CUT_THRESHOLD_SQ
  }

  /**
   * Update temporal uniform buffer.
   * @param device
   * @param width
   * @param height
   * @param viewProjectionMatrix
   * @param inverseViewProjectionMatrix
   */
  private updateTemporalUniforms(
    device: GPUDevice,
    width: number,
    height: number,
    viewProjectionMatrix: Float32Array,
    inverseViewProjectionMatrix: Float32Array
  ): void {
    const floatView = new Float32Array(this.temporalUniformData)
    const uintView = new Uint32Array(this.temporalUniformData)

    // Offset 0: prevViewProjection (64 bytes = 16 floats)
    floatView.set(this.prevViewProjectionMatrix, 0)

    // Offset 64: inverseViewProjection (64 bytes = 16 floats)
    floatView.set(inverseViewProjectionMatrix, 16)

    // Offset 128: bayerOffset (8 bytes = 2 floats)
    const bayerOffset = BAYER_OFFSETS[this.frameIndex % 4]!
    floatView[32] = bayerOffset[0]
    floatView[33] = bayerOffset[1]

    // Offset 136: fullResolution (8 bytes = 2 floats)
    floatView[34] = width
    floatView[35] = height

    // Offset 144: historyWeight (4 bytes)
    floatView[36] = this.historyWeight

    // Offset 148: frameIndex (4 bytes)
    uintView[37] = this.frameIndex

    // Write to buffer
    device.queue.writeBuffer(this.temporalUniformBuffer!, 0, this.temporalUniformData)

    // Store current view projection for next frame
    this.prevViewProjectionMatrix.set(viewProjectionMatrix)
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.reprojectionPipeline ||
      !this.reconstructionPipeline ||
      !this.temporalUniformBuffer ||
      !this.reprojectionBindGroupLayout0 ||
      !this.reprojectionBindGroupLayout1 ||
      !this.reconstructionBindGroupLayout0 ||
      !this.reconstructionBindGroupLayout1 ||
      !this.linearSampler ||
      !this.nearestSampler
    ) {
      return
    }

    const { width, height } = ctx.size

    // Ensure internal textures are allocated
    this.ensureInternalTextures(this.device, width, height)

    // Get input textures
    const quarterColorView = ctx.getTextureView(this.passConfig.quarterColorInput)
    const quarterPositionView = ctx.getTextureView(this.passConfig.quarterPositionInput)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)

    if (!quarterColorView || !quarterPositionView || !outputView) {
      console.warn('TemporalCloudPass: Missing input/output textures')
      return
    }

    // Get camera matrices from frame context (BUG-T1, T2, T4 FIX)
    const cameraMatrices = this.getCameraMatrices(ctx)

    let viewProjectionMatrix: Float32Array
    let inverseViewProjectionMatrix: Float32Array
    let cameraPosition: { x: number; y: number; z: number }

    if (cameraMatrices) {
      viewProjectionMatrix = cameraMatrices.viewProjectionMatrix
      inverseViewProjectionMatrix = cameraMatrices.inverseViewProjectionMatrix
      cameraPosition = cameraMatrices.position

      // BUG-T5 FIX: Camera cut detection
      if (this.hasValidHistory && this.detectCameraCut(cameraPosition)) {
        this.hasValidHistory = false
      }
    } else {
      // Fallback to identity if camera data unavailable
      // PERF: Reuse pre-allocated identity matrix
      viewProjectionMatrix = this._fallbackIdentityMatrix
      inverseViewProjectionMatrix = this._fallbackIdentityMatrix
      cameraPosition = { x: 0, y: 0, z: 0 }
    }

    // Determine which accumulation buffer is read/write (ping-pong)
    const readAccumulationView =
      this.frameIndex % 2 === 0 ? this.accumulationViewA! : this.accumulationViewB!
    const writeAccumulationTexture =
      this.frameIndex % 2 === 0 ? this.accumulationTextureB! : this.accumulationTextureA!

    // Update uniforms with real camera matrices
    this.updateTemporalUniforms(
      this.device,
      width,
      height,
      viewProjectionMatrix,
      inverseViewProjectionMatrix
    )

    // ========================================
    // Pass 1: Reprojection (if we have history)
    // ========================================
    if (this.hasValidHistory) {
      const reprojectionBindGroup0 = this.getOrCreateReprojectionUniformBindGroup()
      const reprojectionBindGroup1 = this.getOrCreateReprojectionTextureBindGroup(
        readAccumulationView,
        quarterPositionView
      )

      const reprojectionPass = ctx.beginRenderPass({
        colorAttachments: [
          {
            view: this.reprojectedHistoryView!,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })

      this.renderFullscreen(reprojectionPass, this.reprojectionPipeline!, [
        reprojectionBindGroup0,
        reprojectionBindGroup1,
      ])

      reprojectionPass.end()
    }

    // ========================================
    // Pass 2: Reconstruction
    // ========================================
    const reconstructionBindGroup0 = this.getOrCreateReconstructionUniformBindGroup()

    const reprojectedInput = this.hasValidHistory
      ? this.reprojectedHistoryView!
      : quarterColorView // Use quarter color directly if no history

    const reconstructionBindGroup1 = this.getOrCreateReconstructionTextureBindGroup(
      quarterColorView,
      reprojectedInput
    )

    // Render to output
    const reconstructionPass = ctx.beginRenderPass({
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })

    this.renderFullscreen(reconstructionPass, this.reconstructionPipeline!, [
      reconstructionBindGroup0,
      reconstructionBindGroup1,
    ])

    reconstructionPass.end()

    // ========================================
    // Pass 3: Copy to accumulation buffer (BUG-T3 FIX)
    // ========================================
    // Copy the output to the write accumulation texture for next frame's history
    const outputResource = ctx.getResource(this.passConfig.outputResource)
    if (outputResource?.texture) {
      ctx.encoder.copyTextureToTexture(
        { texture: outputResource.texture },
        { texture: writeAccumulationTexture },
        { width, height }
      )
    }

    // Update state for next frame
    // BUG-T6 FIX: Cycle frame index 0-3
    this.frameIndex = (this.frameIndex + 1) % 4
    this.hasValidHistory = true

    // Store camera position for cut detection (BUG-T5)
    this.prevCameraPosition = { ...cameraPosition }
  }

  /**
   * Get current Bayer offset for external use.
   */
  getBayerOffset(): [number, number] {
    return BAYER_OFFSETS[this.frameIndex % 4]!
  }

  /**
   * Get frame index for external use.
   */
  getFrameIndex(): number {
    return this.frameIndex
  }

  /**
   * Reset temporal history (e.g., on camera cut).
   */
  resetHistory(): void {
    this.hasValidHistory = false
  }

  /**
   * Set history weight.
   * @param weight
   */
  setHistoryWeight(weight: number): void {
    this.historyWeight = Math.max(0, Math.min(1, weight))
  }

  override releaseInternalResources(): void {
    this.reprojectedHistoryTexture?.destroy()
    this.accumulationTextureA?.destroy()
    this.accumulationTextureB?.destroy()
    this.reprojectedHistoryTexture = null
    this.accumulationTextureA = null
    this.accumulationTextureB = null
    this.reprojectedHistoryView = null
    this.accumulationViewA = null
    this.accumulationViewB = null
    this.lastWidth = 0
    this.lastHeight = 0
    this.hasValidHistory = false
    this.resetBindGroupCaches()
  }

  override dispose(): void {
    this.releaseInternalResources()
    this.temporalUniformBuffer?.destroy()
    this.temporalUniformBuffer = null
    this.linearSampler = null
    this.nearestSampler = null
    super.dispose()
  }
}
