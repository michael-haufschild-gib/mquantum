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

import type { WebGPURenderContext, WebGPURenderPass, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type {
  QuantumModeForShader,
  SchroedingerWGSLShaderConfig,
} from '../shaders/schroedinger/compose'
import { LIGHTING_UNIFORMS_FLOAT_LENGTH, packLightingUniforms } from '../utils/lighting'
import { BASIS_UNIFORMS_FLOAT_LENGTH } from './basisLayout'
import { CAMERA_UNIFORMS_FLOAT_LENGTH } from './cameraLayout'
import { MATERIAL_UNIFORMS_FLOAT_LENGTH } from './materialLayout'
import {
  applyModeOverrides,
  buildPipelineOutputs,
  buildShaderConfig,
  isComputeQuantumMode,
} from './rendererConfigUtils'
import {
  computeBasisUpdate,
  computeCameraUpdate,
  computeSchroedingerUpdate,
  PRECOMPUTED_TERM_BYTE_OFFSET,
  PRECOMPUTED_TERM_BYTE_SIZE,
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
  type SchrodingerRendererConfig,
  SCHROEDINGER_UNIFORM_SIZE,
} from './schrodingerRendererTypes'
import {
  encodeSchrodingerRenderPass,
  type SchrodingerRenderResources,
} from './schrodingerRenderPass'
import { createVersionTracker, resetVersionTracker } from './stateDiffing'
import { createInitialModeStrategy, createModeStrategy } from './strategies/createStrategy'
import type { CachedPresetData, ModeFrameContext, QuantumModeStrategy } from './strategies/types'
import { packMaterialUniforms } from './uniformPacking'
export type { SchrodingerRendererConfig } from './schrodingerRendererTypes'

type CarpetSliceComputePassInstance =
  import('@/rendering/webgpu/passes/CarpetSliceComputePass').CarpetSliceComputePass
type QuantumCarpetRuntime = typeof import('./quantumCarpetRuntime')

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
  private carpetRuntime: QuantumCarpetRuntime | null = null
  private carpetRuntimePromise: Promise<void> | null = null
  private carpetSlicePass: CarpetSliceComputePassInstance | null = null

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
    prevTemporalWidth: 0,
    prevTemporalHeight: 0,
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
  private cameraUniformData = new Float32Array(CAMERA_UNIFORMS_FLOAT_LENGTH)
  private basisUniformData = new Float32Array(BASIS_UNIFORMS_FLOAT_LENGTH)
  private lightingUniformData = new Float32Array(LIGHTING_UNIFORMS_FLOAT_LENGTH)
  private materialUniformData = new Float32Array(MATERIAL_UNIFORMS_FLOAT_LENGTH)
  private materialDataView = new DataView(this.materialUniformData.buffer)
  private timeUpdateBuffer = new Float32Array(1)
  private readonly clearValueTransparent = { r: 0, g: 0, b: 0, a: 0 }
  private readonly clearValueInvalidPos = { r: 0, g: 0, b: 0, a: -1 }
  private cameraDataView = new DataView(this.cameraUniformData.buffer)
  private readonly cachedPresetFrame: CachedPresetData = {
    preset: null as unknown as CachedPresetData['preset'],
    config: null,
  }
  private modeFrameContext!: ModeFrameContext
  private readonly primaryColorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    loadOp: 'clear',
    storeOp: 'store',
    clearValue: this.clearValueTransparent,
  }
  private readonly secondaryColorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    loadOp: 'clear',
    storeOp: 'store',
    clearValue: this.clearValueInvalidPos,
  }
  private readonly singleColorAttachments: [GPURenderPassColorAttachment] = [
    this.primaryColorAttachment,
  ]
  private readonly dualColorAttachments: [
    GPURenderPassColorAttachment,
    GPURenderPassColorAttachment,
  ] = [this.primaryColorAttachment, this.secondaryColorAttachment]
  private readonly renderPassDescriptor: GPURenderPassDescriptor = {
    label: 'schroedinger-render',
    colorAttachments: this.singleColorAttachments,
  }
  private readonly renderResources: SchrodingerRenderResources = {
    renderPipeline: null as unknown as GPURenderPipeline,
    cameraBindGroup: null as unknown as GPUBindGroup,
    lightingBindGroup: null as unknown as GPUBindGroup,
    objectBindGroup: null as unknown as GPUBindGroup,
    vertexBuffer: null,
    indexBuffer: null,
    indexCount: 0,
    clearValueTransparent: this.clearValueTransparent,
    clearValueInvalidPos: this.clearValueInvalidPos,
    primaryColorAttachment: this.primaryColorAttachment,
    secondaryColorAttachment: this.secondaryColorAttachment,
    singleColorAttachments: this.singleColorAttachments,
    dualColorAttachments: this.dualColorAttachments,
    renderPassDescriptor: this.renderPassDescriptor,
  }

  private readonly rebuildObjectBindGroup = (additionalEntries: GPUBindGroupEntry[]): void => {
    if (this.objectBindGroupLayout && this.schroedingerUniformBuffer && this.basisUniformBuffer) {
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
  }

  constructor(config?: SchrodingerRendererConfig) {
    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs: buildPipelineOutputs(config),
    })

    this.rendererConfig = applyModeOverrides(config)
    this.strategy = createInitialModeStrategy()
    this.shaderConfig = buildShaderConfig(this.rendererConfig)
    this.strategy.configureShader(this.shaderConfig, this.rendererConfig)
    this.modeFrameContext = {
      device: null as unknown as GPUDevice,
      rendererConfig: this.rendererConfig,
      schroedingerUniformData: this.schroedingerUniformData,
      basisUniformData: this.basisUniformData,
      schroedingerFloatView: this.schroedingerFloatView,
      schroedingerIntView: this.schroedingerIntView,
      boundingRadius: this.frameState.boundingRadius,
      colorAlgorithm: 0,
      cachedPreset: null,
      rebuildObjectBindGroup: this.rebuildObjectBindGroup,
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

  // =========================================================================
  // Pipeline creation (delegated to schrodingerPipeline.ts)
  // =========================================================================

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    resetVersionTracker(this.frameState.versions)

    // Destroy previous GPU resources
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()

    // Recreate mode strategy and get mode setup.
    // If a predecessor strategy was stashed (via adoptFrom), transfer its compute
    // state to the new strategy before setup, preserving simulation state.
    this.strategy.dispose()
    try {
      this.strategy = await createModeStrategy(this.rendererConfig)
    } catch (error) {
      logger.error(
        `[WebGPUSchrodingerRenderer] Failed to create mode strategy for quantumMode="${this.rendererConfig.quantumMode}" isPauli=${this.rendererConfig.isPauli}:`,
        error
      )
      this.strategy = createInitialModeStrategy()
    }
    this.strategy.configureShader(this.shaderConfig, this.rendererConfig)
    if (this.predecessorStrategy) {
      this.strategy.adoptComputeState?.(this.predecessorStrategy, this.rendererConfig)
      this.predecessorStrategy = null
    }
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
      // Precomputed HO term_k = c_k * exp(-i * E_k * t) advances every frame.
      // computeSchroedingerUpdate already wrote the new values into floatView;
      // upload the 128-byte region. The 8-cos+sin + 8-cmul cost lifted off the
      // fragment shader dwarfs this tiny per-frame writeBuffer.
      const precomputedFloatStart = PRECOMPUTED_TERM_BYTE_OFFSET / 4
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        PRECOMPUTED_TERM_BYTE_OFFSET,
        this.schroedingerFloatView.buffer,
        precomputedFloatStart * 4,
        PRECOMPUTED_TERM_BYTE_SIZE
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

    // ============================================
    // MODE-SPECIFIC COMPUTE PHASE
    // ============================================
    const colorAlgorithm =
      this.rendererConfig.colorAlgorithm ??
      COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'radialDistance'] ??
      11

    const frameContext = this.modeFrameContext
    frameContext.device = this.device
    frameContext.boundingRadius = this.frameState.boundingRadius
    frameContext.colorAlgorithm = colorAlgorithm
    if (this.frameState.cachedPreset) {
      this.cachedPresetFrame.preset = this.frameState.cachedPreset
      this.cachedPresetFrame.config = this.frameState.cachedPresetConfig
      frameContext.cachedPreset = this.cachedPresetFrame
    } else {
      frameContext.cachedPreset = null
    }
    this.strategy.executeFrame(ctx, frameContext)

    // ============================================
    // QUANTUM CARPET SLICE (after density texture is populated)
    // ============================================
    this.dispatchQuantumCarpetSlice(ctx)

    // ============================================
    // RENDER PASS ENCODING (delegated)
    // ============================================
    const renderResources = this.renderResources
    renderResources.renderPipeline = this.renderPipeline
    renderResources.cameraBindGroup = this.cameraBindGroup
    renderResources.lightingBindGroup = this.lightingBindGroup
    renderResources.objectBindGroup = this.objectBindGroup
    renderResources.vertexBuffer = this.vertexBuffer
    renderResources.indexBuffer = this.indexBuffer
    renderResources.indexCount = this.indexCount

    const drawStats = encodeSchrodingerRenderPass(
      ctx,
      this.rendererConfig,
      renderResources,
      is2D,
      this.lastDrawStats
    )
    if (drawStats) {
      this.lastDrawStats = drawStats
    }
  }

  getDrawStats(): import('../core/types').WebGPUPassDrawStats {
    return this.lastDrawStats
  }

  /**
   * Dispatch the quantum carpet slice pass when active. The carpet records a
   * 2D space×time slice of the density grid for diagnostics; it runs after
   * the strategy's frame compute has populated the density texture.
   *
   * Skips entirely when the carpet is disabled or paused, swallows the
   * post-clear frame so `totalFrames=0` is visible to the UI, and lazily
   * initializes the carpet slice pass on first use.
   */
  private dispatchQuantumCarpetSlice(ctx: WebGPURenderContext): void {
    if (!this.carpetRuntime) {
      this.loadQuantumCarpetRuntime()
      return
    }

    const { CarpetSliceComputePass, useCarpetStore } = this.carpetRuntime
    const carpetState = useCarpetStore.getState()
    if (!carpetState.enabled || carpetState.paused) return

    // After clear(), skip one frame of accumulation so totalFrames=0 is visible
    if (carpetState.needsReset) {
      useCarpetStore.setState({ needsReset: false })
      return
    }

    const densityView = this.strategy.getDensityTextureView?.()
    if (!densityView || !this.device) return

    if (!this.carpetSlicePass) {
      this.carpetSlicePass = new CarpetSliceComputePass()
      this.carpetSlicePass.initialize(this.device)
    }
    // Analytic modes (HO, hydrogen) store density in .r; compute modes store it in .a
    const computeMode = isComputeQuantumMode(this.rendererConfig)
    this.carpetSlicePass.dispatch(
      ctx.encoder,
      densityView,
      {
        ...carpetState,
        readAlpha: computeMode,
        densityGridSize: this.shaderConfig.densityGridSize ?? 96,
      },
      (data, gridSize, wh, tf) => {
        useCarpetStore.getState().setCarpetData(data, gridSize, wh, tf)
      }
    )
    carpetState.advanceHead(ctx.frame?.delta ?? 0.016)
  }

  private loadQuantumCarpetRuntime(): void {
    if (this.carpetRuntime || this.carpetRuntimePromise) return

    this.carpetRuntimePromise = import('./quantumCarpetRuntime')
      .then((runtime) => {
        this.carpetRuntime = runtime
      })
      .catch((error: unknown) => {
        this.carpetRuntimePromise = null
        logger.error('[WebGPUSchrodingerRenderer] quantum carpet runtime load failed:', error)
      })
  }

  /** Expose the density texture view for external consumers (e.g. quantum carpet). */
  getDensityTextureView(): GPUTextureView | null {
    return this.strategy.getDensityTextureView?.() ?? null
  }

  /** Strategy from a predecessor renderer whose compute state should be adopted. */
  private predecessorStrategy: QuantumModeStrategy | null = null

  /**
   * Transfer compute simulation state from a predecessor renderer.
   * Preserves coin buffers, density textures, and evolution state across
   * pipeline rebuilds triggered by non-structural changes (e.g. color algorithm).
   * Only transfers if both renderers use the same quantum mode.
   *
   * Must be called BEFORE initialize() — the state is consumed during createPipeline().
   * Safe to call multiple times (e.g. rapid config changes); any previously stashed
   * predecessor strategy is disposed before accepting the new one.
   */
  adoptFrom(predecessor: WebGPURenderPass): void {
    if (!(predecessor instanceof WebGPUSchrodingerRenderer)) return
    if (predecessor.rendererConfig.quantumMode !== this.rendererConfig.quantumMode) return
    // Dispose any previously stashed predecessor to avoid leaking its compute state.
    if (this.predecessorStrategy) {
      logger.warn(
        '[SchrodingerRenderer] adoptFrom called again before createPipeline — disposing previous predecessor'
      )
      this.predecessorStrategy.dispose()
    }
    this.predecessorStrategy = predecessor.strategy
  }

  /**
   * Revert adopted compute state back to a predecessor renderer after an aborted warm swap.
   *
   * When `adoptFrom()` + `initialize()` have already run, this renderer's strategy owns
   * the predecessor's compute pass (coin buffers, density texture, etc.). If the warm
   * swap is then aborted and this renderer is disposed, `strategy.dispose()` would
   * destroy that GPU state even though the predecessor is still active in the graph
   * and its bind groups reference the (now-destroyed) texture.
   *
   * Call this BEFORE `dispose()` on an aborted warm-swap path so the predecessor
   * reclaims its compute state. A no-op if adoption never happened (e.g. different
   * quantum modes, or `initialize()` hadn't yet reached `adoptComputeState`).
   */
  revertComputeStateTo(predecessor: WebGPURenderPass): void {
    if (!(predecessor instanceof WebGPUSchrodingerRenderer)) return
    if (predecessor.rendererConfig.quantumMode !== this.rendererConfig.quantumMode) return
    // If the stashed predecessorStrategy is still set, init never reached
    // adoptComputeState; nothing to revert.
    if (this.predecessorStrategy) {
      this.predecessorStrategy = null
      return
    }
    // Reverse the transfer: predecessor reclaims the compute pass from this.strategy.
    // After this returns, this.strategy's compute pass is null (source.X = null inside
    // adoptComputeState) so our upcoming dispose() is a no-op on that state.
    // Pass the predecessor's rendererConfig so the adoptee — which is now the
    // *predecessor* — sees its own config as `nextConfig`, mirroring the
    // forward-path semantic at line 195.
    predecessor.strategy.adoptComputeState?.(this.strategy, predecessor.rendererConfig)
  }

  dispose(): void {
    this.carpetSlicePass?.dispose()
    this.carpetSlicePass = null
    // If predecessorStrategy was never consumed by createPipeline, dispose it
    // to avoid leaking its compute state (buffers, textures).
    this.predecessorStrategy?.dispose()
    this.predecessorStrategy = null
    this.strategy.dispose()

    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.schroedingerUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
