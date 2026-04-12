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

import { logger } from '@/lib/logger'

import type { AnimationSnapshot, CameraSnapshot } from '../core/storeAccess'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPURenderPassConfig, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { writeInvertMat4 } from '../utils/mat4'
import {
  buildTemporalPipelines,
  TemporalBindGroupCache,
  type TemporalPassHelpers,
  type TemporalPipelineResult,
} from './WebGPUTemporalCloudPassSetup'

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
  [0.0, 0.0],
  [1.0, 1.0],
  [1.0, 0.0],
  [0.0, 1.0],
]

/**
 * Temporal accumulation pass for volumetric rendering.
 * Orchestrates reprojection and reconstruction from quarter-res input.
 */
export class WebGPUTemporalCloudPass extends WebGPUBasePass {
  private passConfig: TemporalCloudPassConfig

  // Pipeline bundle from setup module
  private pipelines: TemporalPipelineResult | null = null

  // Bind group cache
  private readonly bgCache = new TemporalBindGroupCache()

  // Uniform buffer views (pre-allocated)
  private temporalUniformData = new ArrayBuffer(176)
  private temporalUniformFloatView = new Float32Array(this.temporalUniformData)
  private temporalUniformUintView = new Uint32Array(this.temporalUniformData)

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
  private _viewProjectionMatrix = new Float32Array(16)
  private _inverseViewProjectionMatrix = new Float32Array(16)
  private _fallbackIdentityMatrix = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ])
  private hasValidHistory = false
  private prevAnimationTime = Number.NaN
  private completedFullCycle = false
  private lastWidth = 0
  private lastHeight = 0

  // Configuration
  private readonly historyWeight: number
  private static readonly CAMERA_CUT_THRESHOLD_SQ = 4.0

  /** Helper callbacks bridging base-class protected methods to setup functions. */
  private readonly setupHelpers: TemporalPassHelpers = {
    createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
    createFullscreenPipeline: (d, sm, bgls, fmt, opts) =>
      this.createFullscreenPipeline(d, sm, bgls, fmt, opts),
    createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    createBindGroup: (d, layout, entries, label) => this.createBindGroup(d, layout, entries, label),
  }

  constructor(config: TemporalCloudPassConfig) {
    const passConfig: WebGPURenderPassConfig = {
      id: 'temporal-cloud',
      name: 'Temporal Cloud Accumulation',
      inputs: [
        { resourceId: config.quarterColorInput, access: 'read', binding: 0, group: 1 },
        { resourceId: config.quarterPositionInput, access: 'read', binding: 1, group: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write', binding: 0, group: 0 }],
      priority: 50,
    }

    super(passConfig)
    this.passConfig = config
    const rawWeight = config.historyWeight ?? 0.85
    this.historyWeight = Number.isFinite(rawWeight) ? Math.max(0, Math.min(1, rawWeight)) : 0.85
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    this.pipelines = buildTemporalPipelines(ctx.device, this.setupHelpers)
  }

  private ensureInternalTextures(device: GPUDevice, width: number, height: number): void {
    if (this.lastWidth === width && this.lastHeight === height) return

    this.reprojectedHistoryTexture?.destroy()
    this.accumulationTextureA?.destroy()
    this.accumulationTextureB?.destroy()

    this.reprojectedHistoryTexture = device.createTexture({
      label: 'temporal-reprojected-history',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.reprojectedHistoryView = this.reprojectedHistoryTexture.createView({
      label: 'temporal-reprojected-history-view',
    })

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
    this.bgCache.reset()
  }

  private getCameraMatrices(ctx: WebGPURenderContext): {
    viewProjectionMatrix: Float32Array
    inverseViewProjectionMatrix: Float32Array
    position: { x: number; y: number; z: number }
  } | null {
    const cameraStore = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')

    if (!cameraStore?.viewProjectionMatrix?.elements) return null

    const vpElements = cameraStore.viewProjectionMatrix.elements
    const viewProjectionMatrix = this._viewProjectionMatrix
    viewProjectionMatrix.set(vpElements)

    const inverseViewProjectionMatrix = this._inverseViewProjectionMatrix
    if (!writeInvertMat4(inverseViewProjectionMatrix, viewProjectionMatrix)) {
      inverseViewProjectionMatrix.fill(0)
      inverseViewProjectionMatrix[0] = inverseViewProjectionMatrix[5] = 1
      inverseViewProjectionMatrix[10] = inverseViewProjectionMatrix[15] = 1
    }

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

  private detectCameraCut(newPosition: { x: number; y: number; z: number }): boolean {
    const dx = newPosition.x - this.prevCameraPosition.x
    const dy = newPosition.y - this.prevCameraPosition.y
    const dz = newPosition.z - this.prevCameraPosition.z
    const distSq = dx * dx + dy * dy + dz * dz
    return distSq > WebGPUTemporalCloudPass.CAMERA_CUT_THRESHOLD_SQ
  }

  private updateTemporalUniforms(
    device: GPUDevice,
    width: number,
    height: number,
    viewProjectionMatrix: Float32Array,
    inverseViewProjectionMatrix: Float32Array
  ): void {
    const floatView = this.temporalUniformFloatView
    const uintView = this.temporalUniformUintView

    floatView.set(this.prevViewProjectionMatrix, 0)
    floatView.set(inverseViewProjectionMatrix, 16)

    const bayerOffset = BAYER_OFFSETS[this.frameIndex % 4]!
    floatView[32] = bayerOffset[0]
    floatView[33] = bayerOffset[1]
    floatView[34] = width
    floatView[35] = height
    floatView[36] = this.historyWeight
    uintView[37] = this.frameIndex

    device.queue.writeBuffer(this.pipelines!.temporalUniformBuffer, 0, this.temporalUniformData)
    this.prevViewProjectionMatrix.set(viewProjectionMatrix)
  }

  execute(ctx: WebGPURenderContext): void {
    const p = this.pipelines
    if (!this.device || !p) return

    const { width, height } = ctx.size
    this.ensureInternalTextures(this.device, width, height)

    const quarterColorView = ctx.getTextureView(this.passConfig.quarterColorInput)
    const quarterPositionView = ctx.getTextureView(this.passConfig.quarterPositionInput)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)

    if (!quarterColorView || !quarterPositionView || !outputView) {
      logger.warn(
        `TemporalCloudPass: Missing textures — qColor=${!!quarterColorView} qPos=${!!quarterPositionView} out=${!!outputView}`
      )
      return
    }

    const cameraMatrices = this.getCameraMatrices(ctx)

    let viewProjectionMatrix: Float32Array
    let inverseViewProjectionMatrix: Float32Array
    let cameraPosition: { x: number; y: number; z: number }

    if (cameraMatrices) {
      viewProjectionMatrix = cameraMatrices.viewProjectionMatrix
      inverseViewProjectionMatrix = cameraMatrices.inverseViewProjectionMatrix
      cameraPosition = cameraMatrices.position

      if (this.hasValidHistory && this.detectCameraCut(cameraPosition)) {
        this.hasValidHistory = false
      }
    } else {
      viewProjectionMatrix = this._fallbackIdentityMatrix
      inverseViewProjectionMatrix = this._fallbackIdentityMatrix
      cameraPosition = { x: 0, y: 0, z: 0 }
    }

    const readAccumulationView =
      this.frameIndex % 2 === 0 ? this.accumulationViewA! : this.accumulationViewB!
    const writeAccumulationTexture =
      this.frameIndex % 2 === 0 ? this.accumulationTextureB! : this.accumulationTextureA!

    // Capture camera-change state BEFORE updateTemporalUniforms — that call
    // overwrites this.prevViewProjectionMatrix with the current frame's
    // matrix, after which any post-update comparison would always read
    // current === current and report no change.
    const cameraChanged = !this.matricesEqual(viewProjectionMatrix, this.prevViewProjectionMatrix)

    this.updateTemporalUniforms(
      this.device,
      width,
      height,
      viewProjectionMatrix,
      inverseViewProjectionMatrix
    )

    // Pass 1: Reprojection (if we have history)
    if (this.hasValidHistory) {
      const bg0 = this.bgCache.getOrCreateReprojectionUniformBG(
        this.device,
        p.reprojectionBGL0,
        p.temporalUniformBuffer,
        this.setupHelpers
      )
      const bg1 = this.bgCache.getOrCreateReprojectionTextureBG(
        this.device,
        p.reprojectionBGL1,
        readAccumulationView,
        quarterPositionView,
        p.linearSampler,
        this.setupHelpers
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
      this.renderFullscreen(reprojectionPass, p.reprojectionPipeline, [bg0, bg1])
      reprojectionPass.end()
    } else {
      const clearPass = ctx.beginRenderPass({
        colorAttachments: [
          {
            view: this.reprojectedHistoryView!,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      clearPass.end()
    }

    // Pass 2: Reconstruction
    const reconBG0 = this.bgCache.getOrCreateReconstructionUniformBG(
      this.device,
      p.reconstructionBGL0,
      p.temporalUniformBuffer,
      this.setupHelpers
    )
    const reconBG1 = this.bgCache.getOrCreateReconstructionTextureBG(
      this.device,
      p.reconstructionBGL1,
      quarterColorView,
      this.reprojectedHistoryView!,
      p.nearestSampler,
      this.setupHelpers
    )

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
    this.renderFullscreen(reconstructionPass, p.reconstructionPipeline, [reconBG0, reconBG1])
    reconstructionPass.end()

    // Pass 3: Copy to accumulation buffer
    const outputResource = ctx.getResource(this.passConfig.outputResource)
    if (outputResource?.texture) {
      ctx.encoder.copyTextureToTexture(
        { texture: outputResource.texture },
        { texture: writeAccumulationTexture },
        { width, height }
      )
    }

    // Static scene detection: freeze Bayer cycling when nothing changes.
    // cameraChanged was captured above, before updateTemporalUniforms()
    // overwrote prevViewProjectionMatrix with the current frame's matrix.
    const animation = getStoreSnapshot<AnimationSnapshot>(ctx, 'animation')
    const currentAnimTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const animTimeChanged = currentAnimTime !== this.prevAnimationTime
    const sceneChanged = animTimeChanged || cameraChanged

    if (sceneChanged) {
      this.frameIndex = (this.frameIndex + 1) % 4
      this.completedFullCycle = false
    } else if (!this.completedFullCycle) {
      const nextIndex = (this.frameIndex + 1) % 4
      this.frameIndex = nextIndex
      if (nextIndex === 0) {
        this.completedFullCycle = true
      }
    }
    this.prevAnimationTime = currentAnimTime
    this.hasValidHistory = true

    this.prevCameraPosition.x = cameraPosition.x
    this.prevCameraPosition.y = cameraPosition.y
    this.prevCameraPosition.z = cameraPosition.z
  }

  private matricesEqual(a: Float32Array, b: Float32Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
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
    this.bgCache.reset()
  }

  override dispose(): void {
    this.releaseInternalResources()
    this.pipelines?.temporalUniformBuffer.destroy()
    this.pipelines = null
    super.dispose()
  }
}
