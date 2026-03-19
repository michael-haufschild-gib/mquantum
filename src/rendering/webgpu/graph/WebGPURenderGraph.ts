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
  WebGPURenderPass,
  WebGPURenderResourceConfig,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUDevice } from '../core/WebGPUDevice'
import { WebGPUResourcePool } from '../core/WebGPUResourcePool'
import { handleDisabledPassthrough } from './disabledPassthrough'
import { RenderContextImpl, SetupContextImpl } from './RenderGraphContexts'
import { computePassOrder } from './topologicalSort'

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
  private gpuTimingEnabled = false
  private timestampQuerySet: GPUQuerySet | null = null
  private timestampBuffer: GPUBuffer | null = null
  private timestampReadBuffer: GPUBuffer | null = null
  private lastPassTimings: Map<string, number> = new Map()
  private timestampReadbackInFlight = false

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
  private _frameCpuPassTimings: Map<string, number> = new Map()
  private _framePassTimingResult: Array<{
    passId: string
    gpuTimeMs: number
    cpuTimeMs: number
    skipped: boolean
  }> = []
  private beforeSubmitHooks: Map<string, (context: WebGPUBeforeSubmitHookContext) => void> =
    new Map()
  // PERF: Pre-allocated hook context to avoid per-frame allocation
  private _reusableHookContext: WebGPUBeforeSubmitHookContext = {
    device: null as unknown as GPUDevice,
    encoder: null as unknown as GPUCommandEncoder,
    canvasTexture: null as unknown as GPUTexture,
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
      this.enableGPUTiming(device)
    }

    this.initialized = true
  }

  private enableGPUTiming(device: GPUDevice): void {
    const maxPasses = 64
    const queryCount = maxPasses * 2

    this.timestampQuerySet = device.createQuerySet({
      type: 'timestamp',
      count: queryCount,
    })

    this.timestampBuffer = device.createBuffer({
      size: queryCount * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    })

    this.timestampReadBuffer = device.createBuffer({
      size: queryCount * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.gpuTimingEnabled = true
  }

  private scheduleTimestampReadback(
    device: GPUDevice,
    measuredPassCount: number,
    timedPassIds: string[]
  ): void {
    if (measuredPassCount <= 0 || this.timestampReadbackInFlight || !this.timestampReadBuffer) {
      return
    }

    const byteLength = measuredPassCount * 16
    const readBuffer = this.timestampReadBuffer
    const passIds = timedPassIds.slice(0, measuredPassCount)
    this.timestampReadbackInFlight = true

    device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        if (!this.initialized || this.timestampReadBuffer !== readBuffer) {
          return
        }
        await readBuffer.mapAsync(GPUMapMode.READ, 0, byteLength)
        try {
          const range = readBuffer.getMappedRange(0, byteLength)
          const timestamps = new BigUint64Array(range)
          const nextTimings = new Map<string, number>()

          for (let i = 0; i < passIds.length; i++) {
            const start = timestamps[i * 2]!
            const end = timestamps[i * 2 + 1]!
            const delta = end > start ? Number(end - start) : 0
            nextTimings.set(passIds[i]!, delta / 1_000_000)
          }

          this.lastPassTimings = nextTimings
        } finally {
          readBuffer.unmap()
        }
      })
      .catch((err) => {
        if (!this.initialized) return
        logger.warn('[WebGPU RenderGraph] Timestamp readback failed:', err)
      })
      .finally(() => {
        this.timestampReadbackInFlight = false
      })
  }

  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return
    this.width = width
    this.height = height
    this.pool.setSize(width, height)
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

    const encoder = device.createCommandEncoder({
      label: `frame-${this.frameNumber}`,
    })

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
    const canCollectGpuTimings =
      this.gpuTimingEnabled &&
      !!this.timestampQuerySet &&
      !!this.timestampBuffer &&
      !!this.timestampReadBuffer &&
      !this.timestampReadbackInFlight

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
        ctx.setPassTimestampWrites(this.timestampQuerySet!, timestampIndex * 2)
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
          ctx.clearPassTimestampWrites()
          if (usedTimestampWrites) {
            timedPassIds.push(passId)
            timestampIndex++
          }
        }
      }
    }

    const cpuSubmitStart = performance.now()
    const cpuPassesMs = cpuSubmitStart - cpuPassesStart

    const resolvedTimestampCount = timestampIndex * 2
    if (canCollectGpuTimings && resolvedTimestampCount > 0) {
      encoder.resolveQuerySet(
        this.timestampQuerySet!,
        0,
        resolvedTimestampCount,
        this.timestampBuffer!,
        0
      )
      encoder.copyBufferToBuffer(
        this.timestampBuffer!,
        0,
        this.timestampReadBuffer!,
        0,
        resolvedTimestampCount * 8
      )
    }

    if (this.beforeSubmitHooks.size > 0) {
      const hookContext = this._reusableHookContext
      hookContext.device = device
      hookContext.encoder = encoder
      hookContext.canvasTexture = canvasTexture
      hookContext.frame = this.frameContext
      hookContext.size.width = this.width
      hookContext.size.height = this.height

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
    this.scheduleTimestampReadback(device, timestampIndex, timedPassIds)

    for (const pass of this.passes.values()) {
      pass.postFrame?.()
    }

    for (const [id] of this.resources) {
      this.pool.swapPingPong(id)
    }

    // Aggregate draw statistics
    let totalCalls = 0
    let totalTriangles = 0
    let totalVertices = 0
    let totalLines = 0
    let totalPoints = 0

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId)
      if (!pass) continue
      const enabled = passEnabledMemo.get(passId) ?? true
      if (!enabled) continue
      const passStats = pass.getDrawStats?.()
      if (passStats) {
        totalCalls += passStats.calls
        totalTriangles += passStats.triangles
        totalVertices += passStats.vertices
        totalLines += passStats.lines
        totalPoints += passStats.points
      }
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

  private buildPassTimingResult(
    passEnabledMemo: Map<string, boolean>
  ): Array<{ passId: string; gpuTimeMs: number; cpuTimeMs: number; skipped: boolean }> {
    const result = this._framePassTimingResult
    const passCount = this.passOrder.length

    while (result.length < passCount) {
      result.push({ passId: '', gpuTimeMs: 0, cpuTimeMs: 0, skipped: false })
    }
    if (result.length > passCount) {
      result.length = passCount
    }

    for (let i = 0; i < passCount; i++) {
      const id = this.passOrder[i]!
      const entry = result[i]!
      entry.passId = id
      entry.gpuTimeMs = this.lastPassTimings.get(id) ?? 0
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
    return this.gpuTimingEnabled
  }

  dispose(): void {
    for (const pass of this.passes.values()) {
      pass.dispose()
    }
    this.passes.clear()
    this.passOrder = []
    this.resources.clear()
    this.beforeSubmitHooks.clear()

    this.pool.dispose()

    this.timestampQuerySet = null
    this.timestampBuffer?.destroy()
    this.timestampBuffer = null
    this.timestampReadBuffer?.destroy()
    this.timestampReadBuffer = null

    this.initialized = false
    this.compiled = false
  }
}
