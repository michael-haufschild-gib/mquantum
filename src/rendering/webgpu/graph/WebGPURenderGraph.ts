/**
 * WebGPU Render Graph
 *
 * Declarative render graph for WebGPU that manages pass execution order,
 * resource allocation, and GPU command encoding.
 *
 * Based on industry patterns from Frostbite, Unity SRP, and Unreal RDG,
 * adapted for WebGPU's command-based architecture.
 *
 * @module rendering/webgpu/graph/WebGPURenderGraph
 */

import { logger } from '@/lib/logger'

import type {
  ResourceSize,
  WebGPUFrameContext,
  WebGPUFrameStats,
  WebGPUPassTiming,
  WebGPURenderPass,
  WebGPURenderResourceConfig,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUDevice } from '../core/WebGPUDevice'
import { WebGPUResourcePool } from '../core/WebGPUResourcePool'
import { sanitizePixelSize } from '../utils/sceneMath'
import { handleDisabledPassthrough } from './disabledPassthrough'
import { RenderContextImpl, SetupContextImpl } from './RenderGraphContexts'
import { computePassOrder } from './topologicalSort'
import { WebGPUTimestampCollector } from './WebGPUTimestampCollector'

/** Context passed to pre-submit hooks for late-stage command buffer injection. */
export interface WebGPUBeforeSubmitHookContext {
  device: GPUDevice
  encoder: GPUCommandEncoder
  canvasTexture: GPUTexture
  frame: WebGPUFrameContext | null
  size: { width: number; height: number }
}

/**
 * WebGPU Render Graph.
 *
 * Orchestrates the rendering pipeline:
 * - Manages render passes and their dependencies
 * - Allocates and tracks GPU resources
 * - Encodes command buffers
 * - Handles frame statistics and timing
 */
export class WebGPURenderGraph {
  private deviceManager: WebGPUDevice
  private pool: WebGPUResourcePool
  private passes: Map<string, WebGPURenderPass> = new Map()
  private passOrder: string[] = []
  private resources: Map<string, WebGPURenderResourceConfig> = new Map()

  // State tracking
  private width = 0
  private height = 0
  private frameNumber = 0
  private elapsedTime = 0
  private compiled = false
  private initialized = false

  // Timing
  private timestampCollector = new WebGPUTimestampCollector()

  // Frame context — pre-allocated to avoid per-frame GC pressure
  private frameContext: WebGPUFrameContext | null = null
  private storeGetters: Map<string, () => unknown> = new Map()
  private _reusableStores: Record<string, unknown> = {}
  private _reusableFrameContext: WebGPUFrameContext = {
    frameNumber: 0,
    delta: 0,
    time: 0,
    size: { width: 0, height: 0 },
    stores: {},
  }

  // Setup context
  private setupContext: SetupContextImpl | null = null
  // PERF: Reusable render context to avoid per-frame class instantiation
  private _reusableRenderCtx: RenderContextImpl | null = null
  private _reusableCtxSize: { width: number; height: number } = { width: 0, height: 0 }

  // Debug
  private _lastPassLog: number = 0

  // Resource aliasing for disabled passes
  private resourceAliases: Map<string, string> = new Map()

  // Pass state tracking for lazy resource deallocation
  private passStateTracking = new Map<string, number>()

  // PERF: Reusable per-frame collections to avoid GC pressure
  private _framePassTimings: Map<string, number> = new Map()
  private _frameWrittenByEnabledPass: Set<string> = new Set()
  private _framePassEnabledMemo: Map<string, boolean> = new Map()
  private _frameTimedPassIds: string[] = []
  private _frameTimedPassPhases: Array<{ hasCompute: boolean; hasRender: boolean }> = []
  // PERF: Pre-allocated phase objects pool to avoid per-frame allocation
  private _phaseObjectPool: Array<{ hasCompute: boolean; hasRender: boolean }> = []
  private _frameCpuPassTimings: Map<string, number> = new Map()
  private _framePassTimingResult: WebGPUPassTiming[] = []
  private beforeSubmitHooks: Map<string, (context: WebGPUBeforeSubmitHookContext) => void> =
    new Map()
  // PERF: Pre-allocated hook context to avoid per-frame allocation.
  // Nullable fields are populated by execute() before any hook reads them.
  private _reusableHookContext: {
    device: GPUDevice | null
    encoder: GPUCommandEncoder | null
    canvasTexture: GPUTexture | null
    frame: WebGPUFrameContext | null
    size: { width: number; height: number }
  } = {
    device: null,
    encoder: null,
    canvasTexture: null,
    frame: null,
    size: { width: 0, height: 0 },
  }

  /** Default grace period in frames before resource deallocation (~1s at 60fps) */
  private static readonly DEFAULT_DISABLE_GRACE_PERIOD = 60

  constructor() {
    this.deviceManager = WebGPUDevice.getInstance()
    this.pool = new WebGPUResourcePool()
  }

  /**
   * Initialize the render graph.
   * Must be called after WebGPU device is ready.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const device = this.deviceManager.getDevice()
    const format = this.deviceManager.getFormat()
    const capabilities = this.deviceManager.getCapabilities()

    this.pool.initialize(device)

    if (!capabilities) {
      throw new Error('WebGPURenderGraph: Capabilities not available')
    }
    this.setupContext = new SetupContextImpl(device, format, capabilities)

    if (capabilities?.timestampQuery) {
      this.timestampCollector.initialize(device)
    }

    this.initialized = true
  }

  setSize(width: number, height: number): void {
    const safeSize = sanitizePixelSize(width, height)
    if (this.width === safeSize.width && this.height === safeSize.height) return
    this.width = safeSize.width
    this.height = safeSize.height
    this.pool.setSize(safeSize.width, safeSize.height)
    this.compiled = false
  }

  getWidth(): number {
    return this.width
  }

  getHeight(): number {
    return this.height
  }

  addResource(
    id: string,
    config: Omit<WebGPURenderResourceConfig, 'id' | 'size'> & { size?: ResourceSize }
  ): void {
    const fullConfig: WebGPURenderResourceConfig = {
      ...config,
      id,
      size: config.size ?? { mode: 'screen' },
    }
    this.resources.set(id, fullConfig)
    this.pool.addResource(fullConfig)
    this.compiled = false
  }

  removeResource(id: string): void {
    this.resources.delete(id)
    this.pool.removeResource(id)
    this.compiled = false
  }

  getSetupContext(): WebGPUSetupContext | null {
    return this.setupContext
  }

  async addPass(pass: WebGPURenderPass): Promise<void> {
    if (this.passes.has(pass.id)) {
      logger.warn(`WebGPURenderGraph: Pass '${pass.id}' already exists`)
      return
    }

    if (this.setupContext) {
      await pass.initialize(this.setupContext)
    }

    this.passes.set(pass.id, pass)
    this.compiled = false
  }

  addInitializedPass(pass: WebGPURenderPass): void {
    const existing = this.passes.get(pass.id)
    if (existing) {
      existing.dispose()
    }
    this.passes.set(pass.id, pass)
    this.compiled = false
  }

  removePass(id: string): void {
    const pass = this.passes.get(id)
    if (pass) {
      pass.dispose()
      this.passes.delete(id)
      this.compiled = false
    }
  }

  clearPasses(): void {
    for (const pass of this.passes.values()) {
      pass.dispose()
    }
    this.passes.clear()
    this.passOrder = []

    for (const resourceId of this.resources.keys()) {
      this.pool.removeResource(resourceId)
    }

    this.resources.clear()
    this.passStateTracking.clear()
    this.resourceAliases.clear()
    this.compiled = false
  }

  getPass(id: string): WebGPURenderPass | undefined {
    return this.passes.get(id)
  }

  registerBeforeSubmitHook(
    id: string,
    hook: (context: WebGPUBeforeSubmitHookContext) => void
  ): void {
    this.beforeSubmitHooks.set(id, hook)
  }

  unregisterBeforeSubmitHook(id: string): void {
    this.beforeSubmitHooks.delete(id)
  }

  /**
   * Compile the render graph.
   * Resolves pass dependencies and determines execution order via Kahn's topological sort.
   */
  compile(): void {
    if (this.compiled) return

    this.passOrder = computePassOrder(this.passes)

    // Identify ping-pong resources
    for (const pass of this.passes.values()) {
      for (const access of pass.config.inputs) {
        if (access.access === 'readwrite') {
          this.pool.enablePingPong(access.resourceId)
        }
      }
      for (const access of pass.config.outputs) {
        if (access.access === 'readwrite') {
          this.pool.enablePingPong(access.resourceId)
        }
      }
    }

    // Clean up state tracking for passes no longer in the graph
    const currentPassIds = new Set(this.passOrder)
    for (const passId of this.passStateTracking.keys()) {
      if (!currentPassIds.has(passId)) {
        this.passStateTracking.delete(passId)
      }
    }

    this.compiled = true
  }

  setStoreGetter(key: string, getter: () => unknown): void {
    this.storeGetters.set(key, getter)
  }

  private captureFrameContext(delta: number): WebGPUFrameContext {
    const stores = this._reusableStores
    for (const [key, getter] of this.storeGetters) {
      try {
        stores[key] = getter()
      } catch (e) {
        delete stores[key]
        logger.error(`Failed to capture store '${key}':`, e)
      }
    }

    const ctx = this._reusableFrameContext
    ctx.frameNumber = this.frameNumber
    ctx.delta = delta
    ctx.time = this.elapsedTime
    ctx.size.width = this.width
    ctx.size.height = this.height
    ctx.stores = stores
    return ctx
  }

  /** Track pass disable/enable state for lazy resource deallocation. */
  private trackPassDisableState(pass: WebGPURenderPass, passId: string, enabled: boolean): void {
    if (enabled) {
      this.passStateTracking.set(passId, 0)
      return
    }
    const disabledFrameCount = (this.passStateTracking.get(passId) ?? 0) + 1
    this.passStateTracking.set(passId, disabledFrameCount)
    const gracePeriod =
      pass.config.disableGracePeriod ?? WebGPURenderGraph.DEFAULT_DISABLE_GRACE_PERIOD
    const keepResources = pass.config.keepResourcesWhenDisabled ?? false
    if (!keepResources && disabledFrameCount === gracePeriod && pass.releaseInternalResources) {
      pass.releaseInternalResources()
    }
  }

  execute(delta: number): WebGPUFrameStats {
    if (!this.initialized) {
      return {
        totalTimeMs: 0,
        passTiming: [],
        commandBufferCount: 0,
        vramUsage: 0,
        drawStats: { calls: 0, triangles: 0, vertices: 0, lines: 0, points: 0 },
        cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
      }
    }

    if (!this.compiled) {
      this.compile()
    }

    const cpuSetupStart = performance.now()

    this.elapsedTime += delta
    this.frameNumber++

    this.frameContext = this.captureFrameContext(delta)

    const device = this.deviceManager.getDevice()
    const canvasTexture = this.deviceManager.getCurrentTexture()
    const canvasTextureView = canvasTexture.createView()

    if (
      import.meta.env.DEV &&
      (canvasTexture.width !== this.width || canvasTexture.height !== this.height)
    ) {
      logger.warn(
        `[RenderGraph] Dimension mismatch: canvasTexture ${canvasTexture.width}×${canvasTexture.height}, graph ${this.width}×${this.height}`
      )
    }

    const encoder = device.createCommandEncoder()

    this.resourceAliases.clear()

    this._reusableCtxSize.width = this.width
    this._reusableCtxSize.height = this.height

    let ctx: RenderContextImpl
    if (this._reusableRenderCtx) {
      ctx = this._reusableRenderCtx
      ctx.reset(
        device,
        encoder,
        this.frameContext,
        this._reusableCtxSize,
        this.pool,
        canvasTextureView,
        this.resourceAliases
      )
    } else {
      ctx = new RenderContextImpl(
        device,
        encoder,
        this.frameContext,
        this._reusableCtxSize,
        this.pool,
        canvasTextureView,
        this.resourceAliases
      )
      this._reusableRenderCtx = ctx
    }

    const cpuPassesStart = performance.now()
    const cpuSetupMs = cpuPassesStart - cpuSetupStart

    const passTimings = this._framePassTimings
    passTimings.clear()
    const cpuPassTimings = this._frameCpuPassTimings
    cpuPassTimings.clear()
    let timestampIndex = 0
    const timedPassIds = this._frameTimedPassIds
    timedPassIds.length = 0
    const timedPassPhases = this._frameTimedPassPhases
    timedPassPhases.length = 0
    const canCollectGpuTimings = this.timestampCollector.canCollect()

    const now = Date.now()
    const shouldLog = import.meta.env.DEV && (!this._lastPassLog || now - this._lastPassLog > 1000)
    if (shouldLog) {
      this._lastPassLog = now
    }

    const writtenByEnabledPass = this._frameWrittenByEnabledPass
    writtenByEnabledPass.clear()
    const passEnabledMemo = this._framePassEnabledMemo
    passEnabledMemo.clear()

    const getPassEnabled = (pass: WebGPURenderPass, passId: string): boolean => {
      const cached = passEnabledMemo.get(passId)
      if (cached !== undefined) return cached
      const enabled = pass.config.enabled?.(this.frameContext) ?? true
      passEnabledMemo.set(passId, enabled)
      return enabled
    }

    // Draw stats — accumulated during main loop to avoid second iteration
    let totalCalls = 0
    let totalTriangles = 0
    let totalVertices = 0
    let totalLines = 0
    let totalPoints = 0

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId)
      if (!pass) {
        if (shouldLog) logger.warn(`[WebGPU RenderGraph] Pass '${passId}' not found in map`)
        continue
      }

      const enabled = getPassEnabled(pass, passId)
      this.trackPassDisableState(pass, passId, enabled)

      if (!enabled) {
        handleDisabledPassthrough(
          this.pool,
          this.resourceAliases,
          pass,
          passId,
          encoder,
          passTimings,
          writtenByEnabledPass,
          shouldLog
        )
        continue
      }

      for (const output of pass.config.outputs ?? []) {
        writtenByEnabledPass.add(output.resourceId)
      }

      if (canCollectGpuTimings) {
        ctx.setPassTimestampWrites(this.timestampCollector.getQuerySet()!, timestampIndex * 4)
      }

      const passCpuStart = performance.now()
      try {
        pass.execute(ctx)
      } catch (e) {
        logger.error(`[WebGPU RenderGraph] Error executing pass '${passId}':`, e)
      } finally {
        cpuPassTimings.set(passId, performance.now() - passCpuStart)
        if (canCollectGpuTimings) {
          const usedTimestampWrites = ctx.consumePassUsedTimestampWrites()
          const phases = ctx.getPassPhases()
          ctx.clearPassTimestampWrites()
          if (usedTimestampWrites) {
            timedPassIds.push(passId)
            // Reuse pooled phase objects to avoid per-frame allocation
            let phaseObj = this._phaseObjectPool[timestampIndex]
            if (!phaseObj) {
              phaseObj = { hasCompute: false, hasRender: false }
              this._phaseObjectPool[timestampIndex] = phaseObj
            }
            phaseObj.hasCompute = phases.hasCompute
            phaseObj.hasRender = phases.hasRender
            timedPassPhases.push(phaseObj)
            timestampIndex++
          }
        }
      }

      // Accumulate draw stats during main loop (avoids second iteration)
      const passStats = pass.getDrawStats?.()
      if (passStats) {
        totalCalls += passStats.calls
        totalTriangles += passStats.triangles
        totalVertices += passStats.vertices
        totalLines += passStats.lines
        totalPoints += passStats.points
      }
    }

    const cpuSubmitStart = performance.now()
    const cpuPassesMs = cpuSubmitStart - cpuPassesStart

    if (canCollectGpuTimings) {
      this.timestampCollector.resolveAndCopy(encoder, timestampIndex)
    }

    if (this.beforeSubmitHooks.size > 0) {
      // Populate reusable context — all fields are non-null here because
      // execute() has already obtained device, encoder, and canvasTexture.
      const ctx = this._reusableHookContext
      ctx.device = device
      ctx.encoder = encoder
      ctx.canvasTexture = canvasTexture
      ctx.frame = this.frameContext
      ctx.size.width = this.width
      ctx.size.height = this.height
      // Safe cast: all fields were just assigned non-null above.
      const hookContext = ctx as WebGPUBeforeSubmitHookContext

      for (const [hookId, hook] of this.beforeSubmitHooks) {
        try {
          hook(hookContext)
        } catch (error) {
          logger.error(`[WebGPU RenderGraph] beforeSubmit hook '${hookId}' failed:`, error)
        }
      }
    }

    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])
    this.timestampCollector.scheduleReadback(device, timestampIndex, timedPassIds, timedPassPhases)

    for (const pass of this.passes.values()) {
      pass.postFrame?.()
    }

    for (const [id] of this.resources) {
      this.pool.swapPingPong(id)
    }

    const cpuSubmitMs = performance.now() - cpuSubmitStart

    return {
      totalTimeMs: delta * 1000,
      passTiming: this.buildPassTimingResult(passEnabledMemo),
      commandBufferCount: 1,
      vramUsage: this.pool.getVRAMUsage(),
      drawStats: {
        calls: totalCalls,
        triangles: totalTriangles,
        vertices: totalVertices,
        lines: totalLines,
        points: totalPoints,
      },
      cpuBreakdown: {
        setupMs: cpuSetupMs,
        passesMs: cpuPassesMs,
        submitMs: cpuSubmitMs,
      },
    }
  }

  private buildPassTimingResult(passEnabledMemo: Map<string, boolean>): WebGPUPassTiming[] {
    const result = this._framePassTimingResult
    const passCount = this.passOrder.length

    while (result.length < passCount) {
      result.push({
        passId: '',
        gpuTimeMs: 0,
        computeGpuTimeMs: 0,
        renderGpuTimeMs: 0,
        cpuTimeMs: 0,
        skipped: false,
      })
    }
    if (result.length > passCount) {
      result.length = passCount
    }

    for (let i = 0; i < passCount; i++) {
      const id = this.passOrder[i]!
      const entry = result[i]!
      const timing = this.timestampCollector.getLastTimings().get(id)
      entry.passId = id
      entry.gpuTimeMs = timing?.total ?? 0
      entry.computeGpuTimeMs = timing?.compute ?? 0
      entry.renderGpuTimeMs = timing?.render ?? 0
      entry.cpuTimeMs = this._frameCpuPassTimings.get(id) ?? 0
      entry.skipped = !(passEnabledMemo.get(id) ?? true)
    }

    return result
  }

  getFrameNumber(): number {
    return this.frameNumber
  }

  getVRAMUsage(): number {
    return this.pool.getVRAMUsage()
  }

  getResourceDimensions(): Map<string, { width: number; height: number }> {
    return this.pool.getAllResourceDimensions()
  }

  isGPUTimingAvailable(): boolean {
    return this.timestampCollector.isEnabled()
  }

  /**
   * Activate or deactivate per-frame GPU timestamp collection.
   * Call with `true` when a consumer needs per-pass GPU timing data
   * (e.g. expanded performance monitor), `false` otherwise.
   *
   * @param active - Whether to collect GPU timestamps this frame
   */
  setTimestampCollectionActive(active: boolean): void {
    this.timestampCollector.setCollectionActive(active)
  }

  dispose(): void {
    for (const pass of this.passes.values()) {
      pass.dispose()
    }
    this.passes.clear()
    this.passOrder = []
    this.resources.clear()
    this.beforeSubmitHooks.clear()
    this.passStateTracking.clear()
    this.resourceAliases.clear()

    this.pool.dispose()
    this.timestampCollector.dispose()

    this.initialized = false
    this.compiled = false
  }
}
