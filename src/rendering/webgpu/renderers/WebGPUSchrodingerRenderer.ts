/**
 * WebGPU Schrödinger Renderer
 *
 * Renders N-dimensional quantum wavefunctions using WebGPU volume raymarching.
 * Supports harmonic oscillator and hydrogen ND modes.
 *
 * This file is the orchestrator — heavy logic is delegated to:
 * - schrodingerPipeline.ts (GPU resource creation)
 * - schrodingerFrameUpdate.ts (per-frame state computation)
 * - schrodingerRenderPass.ts (render pass encoding)
 *
 * @module rendering/webgpu/renderers/WebGPUSchrodingerRenderer
 */

import { logger } from '@/lib/logger'
import { CarpetSliceComputePass } from '@/rendering/webgpu/passes/CarpetSliceComputePass'
import { useCarpetStore } from '@/stores/carpetStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type {
  QuantumModeForShader,
  SchroedingerWGSLShaderConfig,
} from '../shaders/schroedinger/compose'
import { packLightingUniforms } from '../utils/lighting'
import { applyModeOverrides, buildPipelineOutputs, buildShaderConfig } from './rendererConfigUtils'
import {
  computeBasisUpdate,
  computeCameraUpdate,
  computeSchroedingerUpdate,
  type SchrodingerFrameState,
  type SchroedingerUpdateResult,
  TIME_FIELD_OFFSET,
  UNCERTAINTY_THRESHOLD_OFFSET,
} from './schrodingerFrameUpdate'
import {
  clearSchrodingerPipelineCache,
  createBoundingGeometry,
  createSchrodingerPipeline,
} from './schrodingerPipeline'
import {
  type AppearanceStoreState,
  COLOR_ALGORITHM_MAP,
  getStoreSnapshot,
  type LightingSnapshot,
  type PBRSliceState,
  type PerformanceSnapshot,
  type SchrodingerRendererConfig,
  SCHROEDINGER_UNIFORM_SIZE,
} from './schrodingerRendererTypes'
import {
  encodeSchrodingerRenderPass,
  type SchrodingerRenderResources,
} from './schrodingerRenderPass'
import { createVersionTracker, resetVersionTracker } from './stateDiffing'
import { createModeStrategy } from './strategies/createStrategy'
import type { ModeFrameContext, QuantumModeStrategy } from './strategies/types'
import { packMaterialUniforms, packQualityUniforms } from './uniformPacking'
export type { SchrodingerRendererConfig } from './schrodingerRendererTypes'

/**
 * WebGPU renderer for quantum wavefunctions.
 */
export class WebGPUSchrodingerRenderer extends WebGPUBasePass {
  /** Clear the static render pipeline cache (e.g. on device loss). */
  static clearPipelineCache(): void {
    clearSchrodingerPipelineCache()
  }

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
  private objectBindGroupLayout: GPUBindGroupLayout | null = null

  // Mode strategy
  private strategy: QuantumModeStrategy

  // Quantum carpet slice compute (dispatched after strategy executeFrame)
  private carpetSlicePass: CarpetSliceComputePass | null = null

  // Configuration
  private rendererConfig: SchrodingerRendererConfig
  private shaderConfig: SchroedingerWGSLShaderConfig

  // Geometry
  private indexCount = 0

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  // Mutable per-frame state (temporal tracking, preset cache, bounding radius)
  private frameState: SchrodingerFrameState = {
    versions: createVersionTracker(),
    temporalBayerIndex: 0,
    prevTemporalAnimTime: Number.NaN,
    prevTemporalVPMatrix: new Float32Array(16),
    completedTemporalCycle: false,
    cachedPreset: null,
    cachedPresetConfig: null,
    flattenedPreset: null,
    canonicalDensityCompensation: 1.0,
    cachedPeakDensity: 0.1,
    boundingRadius: 2.0,
  }

  // Pre-allocated staging buffers to avoid per-frame GC pressure
  private schroedingerUniformData = new ArrayBuffer(SCHROEDINGER_UNIFORM_SIZE)
  private schroedingerFloatView = new Float32Array(this.schroedingerUniformData)
  private schroedingerIntView = new Int32Array(this.schroedingerUniformData)
  private cameraUniformData = new Float32Array(128)
  private basisUniformData = new Float32Array(48)
  private lightingUniformData = new Float32Array(144)
  private materialUniformData = new Float32Array(40)
  private materialDataView = new DataView(this.materialUniformData.buffer)
  private qualityUniformData = new Float32Array(12)
  private qualityDataView = new DataView(this.qualityUniformData.buffer)
  private timeUpdateBuffer = new Float32Array(1)
  private readonly clearValueTransparent = { r: 0, g: 0, b: 0, a: 0 }
  private readonly clearValueInvalidPos = { r: 0, g: 0, b: 0, a: -1 }
  private cameraDataView = new DataView(this.cameraUniformData.buffer)

  constructor(config?: SchrodingerRendererConfig) {
    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs: buildPipelineOutputs(config),
    })

    this.rendererConfig = applyModeOverrides(config)
    this.strategy = createModeStrategy(this.rendererConfig)
    this.shaderConfig = buildShaderConfig(this.rendererConfig)
    this.strategy.configureShader(this.shaderConfig, this.rendererConfig)
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

  // =========================================================================
  // Pipeline creation (delegated to schrodingerPipeline.ts)
  // =========================================================================

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    resetVersionTracker(this.frameState.versions)

    // Destroy previous GPU resources
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()

    // Recreate mode strategy and get mode setup
    this.strategy.dispose()
    this.strategy = createModeStrategy(this.rendererConfig)
    const modeSetup = this.strategy.setup(ctx, this.rendererConfig)

    const resources = await createSchrodingerPipeline(
      ctx.device,
      this.rendererConfig,
      this.shaderConfig,
      modeSetup,
      this.frameState.boundingRadius,
      {
        createShaderModule: this.createShaderModule.bind(this),
        createUniformBuffer: this.createUniformBuffer.bind(this),
      }
    )

    // Assign resources to instance
    this.renderPipeline = resources.renderPipeline
    this.cameraUniformBuffer = resources.cameraUniformBuffer
    this.lightingUniformBuffer = resources.lightingUniformBuffer
    this.materialUniformBuffer = resources.materialUniformBuffer
    this.qualityUniformBuffer = resources.qualityUniformBuffer
    this.schroedingerUniformBuffer = resources.schroedingerUniformBuffer
    this.basisUniformBuffer = resources.basisUniformBuffer
    this.cameraBindGroup = resources.cameraBindGroup
    this.lightingBindGroup = resources.lightingBindGroup
    this.objectBindGroup = resources.objectBindGroup
    this.objectBindGroupLayout = resources.objectBindGroupLayout
    this.vertexBuffer = resources.vertexBuffer
    this.indexBuffer = resources.indexBuffer
    this.indexCount = resources.indexCount

    // Dispose previous carpet pass — lazy-initialized on first enable
    this.carpetSlicePass?.dispose()
    this.carpetSlicePass = null
  }

  // =========================================================================
  // Per-frame uniform updates
  // =========================================================================

  updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return
    computeCameraUpdate(
      ctx,
      this.rendererConfig,
      this.frameState,
      this.cameraUniformData,
      this.cameraDataView
    )
    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, this.cameraUniformData)
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const result: SchroedingerUpdateResult = computeSchroedingerUpdate(
      ctx,
      this.rendererConfig,
      this.strategy,
      this.frameState,
      this.schroedingerFloatView,
      this.schroedingerIntView
    )

    if (result.writeMode === 'partial') {
      this.timeUpdateBuffer[0] = result.partialTime!
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        TIME_FIELD_OFFSET,
        this.timeUpdateBuffer
      )
      this.timeUpdateBuffer[0] = result.partialUncertaintyThreshold!
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        UNCERTAINTY_THRESHOLD_OFFSET,
        this.timeUpdateBuffer
      )
    } else {
      this.writeUniformBuffer(
        this.device,
        this.schroedingerUniformBuffer,
        this.schroedingerFloatView
      )
    }

    if (result.newBoundingRadius !== undefined && this.device) {
      this.vertexBuffer?.destroy()
      this.indexBuffer?.destroy()
      const geometry = createBoundingGeometry(this.device, result.newBoundingRadius)
      this.vertexBuffer = geometry.vertexBuffer
      this.indexBuffer = geometry.indexBuffer
      this.indexCount = geometry.indexCount
    }
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return
    if (computeBasisUpdate(ctx, this.rendererConfig, this.frameState, this.basisUniformData)) {
      this.writeUniformBuffer(this.device, this.basisUniformBuffer, this.basisUniformData)
    }
  }

  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return
    const lighting = getStoreSnapshot<LightingSnapshot>(ctx, 'lighting')
    if (!lighting) return
    const lightingVersion = lighting?.version ?? 0
    if (lightingVersion === this.frameState.versions.lastLightingVersion) return
    this.frameState.versions.lastLightingVersion = lightingVersion
    packLightingUniforms(this.lightingUniformData, lighting)
    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, this.lightingUniformData)
  }

  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return
    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    packMaterialUniforms(this.materialUniformData, this.materialDataView, { appearance, pbr })
    this.writeUniformBuffer(this.device, this.materialUniformBuffer, this.materialUniformData)
  }

  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return
    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const qualitySignature = qualityMultiplier.toFixed(4)
    if (qualitySignature === this.frameState.versions.lastQualitySignature) return
    this.frameState.versions.lastQualitySignature = qualitySignature
    packQualityUniforms(this.qualityUniformData, this.qualityDataView, qualityMultiplier)
    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, this.qualityUniformData)
  }

  // =========================================================================
  // Frame execution
  // =========================================================================

  private executeNullGuardWarned = false

  execute(ctx: WebGPURenderContext): void {
    const is2D =
      (this.rendererConfig.dimension ?? 3) === 2 || this.rendererConfig.representation === 'wigner'

    if (
      !this.device ||
      !this.renderPipeline ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.objectBindGroup
    ) {
      if (!this.executeNullGuardWarned) {
        this.executeNullGuardWarned = true
        logger.warn(
          `[SchrodingerRenderer] execute() skipped — null resources:`,
          `device=${!!this.device} pipeline=${!!this.renderPipeline}`,
          `camera=${!!this.cameraBindGroup} lighting=${!!this.lightingBindGroup}`,
          `object=${!!this.objectBindGroup}`
        )
      }
      return
    }
    if (!is2D && (!this.vertexBuffer || !this.indexBuffer)) return

    // ============================================
    // DIRTY-FLAG OPTIMIZATION: Only update changed uniform categories
    // ============================================
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearanceVersion = appearance?.appearanceVersion ?? 0
    const pbrVersion = pbr?.pbrVersion ?? 0

    this.updateCameraUniforms(ctx)
    this.updateBasisVectors(ctx)
    this.updateSchroedingerUniforms(ctx)
    this.updateLightingUniforms(ctx)

    if (
      appearanceVersion !== this.frameState.versions.lastAppearanceVersion ||
      pbrVersion !== this.frameState.versions.lastPbrVersion
    ) {
      this.updateMaterialUniforms(ctx)
      this.frameState.versions.lastAppearanceVersion = appearanceVersion
      this.frameState.versions.lastPbrVersion = pbrVersion
    }

    this.updateQualityUniforms(ctx)

    // ============================================
    // MODE-SPECIFIC COMPUTE PHASE
    // ============================================
    const colorAlgorithm =
      this.rendererConfig.colorAlgorithm ??
      COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'radialDistance'] ??
      11

    const frameContext: ModeFrameContext = {
      device: this.device,
      rendererConfig: this.rendererConfig,
      schroedingerUniformData: this.schroedingerUniformData,
      basisUniformData: this.basisUniformData,
      schroedingerFloatView: this.schroedingerFloatView,
      schroedingerIntView: this.schroedingerIntView,
      boundingRadius: this.frameState.boundingRadius,
      colorAlgorithm,
      cachedPreset: this.frameState.cachedPreset
        ? {
            preset: this.frameState.cachedPreset,
            config: this.frameState.cachedPresetConfig,
          }
        : null,
      rebuildObjectBindGroup: (additionalEntries) => {
        if (
          this.objectBindGroupLayout &&
          this.schroedingerUniformBuffer &&
          this.basisUniformBuffer
        ) {
          this.objectBindGroup = this.device!.createBindGroup({
            label: 'schroedinger-object-bg',
            layout: this.objectBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
              { binding: 1, resource: { buffer: this.basisUniformBuffer } },
              ...additionalEntries,
            ],
          })
        }
      },
    }
    this.strategy.executeFrame(ctx, frameContext)

    // ============================================
    // QUANTUM CARPET SLICE (after density texture is populated)
    // ============================================
    const carpetState = useCarpetStore.getState()
    if (carpetState.enabled && !carpetState.paused) {
      // After clear(), skip one frame of accumulation so totalFrames=0 is visible
      if (carpetState.needsReset) {
        useCarpetStore.setState({ needsReset: false })
      } else {
        const densityView = this.strategy.getDensityTextureView?.()
        if (densityView && this.device) {
          if (!this.carpetSlicePass) {
            this.carpetSlicePass = new CarpetSliceComputePass()
            this.carpetSlicePass.initialize(this.device)
          }
          // Analytic modes (HO, hydrogen) store density in .r; compute modes store it in .a
          const qm = this.rendererConfig.quantumMode
          const isAnalyticMode =
            !qm || qm === 'harmonicOscillator' || qm === 'hydrogenND' || qm === 'hydrogenNDCoupled'
          this.carpetSlicePass.dispatch(
            ctx.encoder,
            densityView,
            { ...carpetState, readAlpha: !isAnalyticMode },
            (data, gridSize, wh, tf) => {
              useCarpetStore.getState().setCarpetData(data, gridSize, wh, tf)
            }
          )
          carpetState.advanceHead(ctx.frame?.delta ?? 0.016)
        }
      }
    }

    // ============================================
    // RENDER PASS ENCODING (delegated)
    // ============================================
    const renderResources: SchrodingerRenderResources = {
      renderPipeline: this.renderPipeline,
      cameraBindGroup: this.cameraBindGroup,
      lightingBindGroup: this.lightingBindGroup,
      objectBindGroup: this.objectBindGroup,
      vertexBuffer: this.vertexBuffer,
      indexBuffer: this.indexBuffer,
      indexCount: this.indexCount,
      clearValueTransparent: this.clearValueTransparent,
      clearValueInvalidPos: this.clearValueInvalidPos,
    }

    const drawStats = encodeSchrodingerRenderPass(ctx, this.rendererConfig, renderResources, is2D)
    if (drawStats) {
      this.lastDrawStats = drawStats
    }
  }

  getDrawStats(): import('../core/types').WebGPUPassDrawStats {
    return this.lastDrawStats
  }

  /** Expose the density texture view for external consumers (e.g. quantum carpet). */
  getDensityTextureView(): GPUTextureView | null {
    return this.strategy.getDensityTextureView?.() ?? null
  }

  dispose(): void {
    this.carpetSlicePass?.dispose()
    this.carpetSlicePass = null
    this.strategy.dispose()

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
