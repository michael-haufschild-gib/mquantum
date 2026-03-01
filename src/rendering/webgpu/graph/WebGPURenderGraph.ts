/* global GPUComputePassDescriptor, GPUComputePassTimestampWrites, GPURenderPassDescriptor, GPURenderPassTimestampWrites, GPUSamplerDescriptor, GPUTextureFormat */
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

import type {
  ResourceSize,
  WebGPUCapabilities,
  WebGPUFrameContext,
  WebGPUFrameStats,
  WebGPURenderContext,
  WebGPURenderPass,
  WebGPURenderResourceConfig,
  WebGPUResource,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUDevice } from '../core/WebGPUDevice'
import { WebGPUResourcePool } from '../core/WebGPUResourcePool'

// =============================================================================
// Render Graph Context Implementation
// =============================================================================

class RenderContextImpl implements WebGPURenderContext {
  device: GPUDevice
  encoder: GPUCommandEncoder
  frame: WebGPUFrameContext | null
  size: { width: number; height: number }

  private pool: WebGPUResourcePool
  private canvasTextureView: GPUTextureView
  private resourceAliases: Map<string, string>
  private activeTimestampWrites: {
    querySet: GPUQuerySet
    beginningOfPassWriteIndex: number
    endOfPassWriteIndex: number
  } | null = null
  private passUsedTimestampWrites = false

  constructor(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    frame: WebGPUFrameContext | null,
    size: { width: number; height: number },
    pool: WebGPUResourcePool,
    canvasTextureView: GPUTextureView,
    resourceAliases: Map<string, string>
  ) {
    this.device = device
    this.encoder = encoder
    this.frame = frame
    this.size = size
    this.pool = pool
    this.canvasTextureView = canvasTextureView
    this.resourceAliases = resourceAliases
  }

  /**
   * Resolve resource alias chain to find actual resource ID.
   *
   * When a pass is disabled with skipPassthrough=true, its output is aliased
   * to its input. This creates a chain: C → B → A where downstream passes
   * reading from C should actually read from A.
   *
   * @param resourceId - Resource ID to resolve
   * @returns Resolved resource ID (may be same as input if no alias)
   */
  private resolveAlias(resourceId: string): string {
    let current = resourceId
    // Use depth counter for cycle detection
    let depth = 0
    const maxDepth = 16

    while (this.resourceAliases.has(current)) {
      if (depth >= maxDepth) {
        console.warn(`WebGPURenderGraph: Alias chain too long at '${current}' (possible cycle)`)
        return current
      }
      depth++
      current = this.resourceAliases.get(current)!
    }

    return current
  }

  getTexture(resourceId: string): GPUTexture | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getTexture(resolved)
  }

  getTextureView(resourceId: string): GPUTextureView | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getTextureView(resolved)
  }

  getWriteTarget(resourceId: string): GPUTextureView | null {
    // Don't resolve alias for write targets - we want to write to the actual target
    return this.pool.getWriteTextureView(resourceId)
  }

  getReadTextureView(resourceId: string): GPUTextureView | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getReadTextureView(resolved)
  }

  getSampler(resourceId: string): GPUSampler | null {
    return this.pool.getSampler(resourceId)
  }

  getResource(resourceId: string): WebGPUResource | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getResource(resolved)
  }

  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    const renderDescriptor: GPURenderPassDescriptor =
      this.activeTimestampWrites && !descriptor.timestampWrites
        ? {
            ...descriptor,
            timestampWrites: this.activeTimestampWrites as GPURenderPassTimestampWrites,
          }
        : descriptor
    if (renderDescriptor.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginRenderPass(renderDescriptor)
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    const computeDescriptor: GPUComputePassDescriptor | undefined =
      this.activeTimestampWrites && !descriptor?.timestampWrites
        ? {
            ...descriptor,
            timestampWrites: this.activeTimestampWrites as GPUComputePassTimestampWrites,
          }
        : descriptor
    if (computeDescriptor?.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginComputePass(computeDescriptor)
  }

  getCanvasTextureView(): GPUTextureView {
    return this.canvasTextureView
  }

  setPassTimestampWrites(querySet: GPUQuerySet, startIndex: number): void {
    this.activeTimestampWrites = {
      querySet,
      beginningOfPassWriteIndex: startIndex,
      endOfPassWriteIndex: startIndex + 1,
    }
    this.passUsedTimestampWrites = false
  }

  clearPassTimestampWrites(): void {
    this.activeTimestampWrites = null
    this.passUsedTimestampWrites = false
  }

  consumePassUsedTimestampWrites(): boolean {
    const used = this.passUsedTimestampWrites
    this.passUsedTimestampWrites = false
    return used
  }
}

// =============================================================================
// Setup Context Implementation
// =============================================================================

class SetupContextImpl implements WebGPUSetupContext {
  device: GPUDevice
  format: GPUTextureFormat
  capabilities: WebGPUCapabilities

  private bindGroupLayouts = new Map<string, GPUBindGroupLayout>()
  private samplers = new Map<string, GPUSampler>()

  constructor(device: GPUDevice, format: GPUTextureFormat, capabilities: WebGPUCapabilities) {
    this.device = device
    this.format = format
    this.capabilities = capabilities
  }

  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler {
    const key = JSON.stringify(descriptor ?? {})
    let sampler = this.samplers.get(key)
    if (!sampler) {
      sampler = this.device.createSampler(descriptor)
      this.samplers.set(key, sampler)
    }
    return sampler
  }

  registerBindGroupLayout(id: string, layout: GPUBindGroupLayout): void {
    this.bindGroupLayouts.set(id, layout)
  }

  getBindGroupLayout(id: string): GPUBindGroupLayout | null {
    return this.bindGroupLayouts.get(id) ?? null
  }
}

// =============================================================================
// Render Graph
// =============================================================================

/**
 *
 */
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

  // Frame context
  private frameContext: WebGPUFrameContext | null = null
  private storeGetters: Map<string, () => unknown> = new Map()

  // Setup context
  private setupContext: SetupContextImpl | null = null

  // Debug
  private _lastPassLog: number = 0

  // Resource aliasing for disabled passes
  // When a pass is disabled with skipPassthrough=true, its output is aliased
  // to its input so downstream passes read from the correct source without copying.
  // Map: outputResourceId → inputResourceId
  private resourceAliases: Map<string, string> = new Map()

  // Pass state tracking for lazy resource deallocation
  // Tracks how many frames each pass has been disabled for grace period management
  // Map: passId → disabledFrameCount
  private passStateTracking = new Map<string, number>()

  // PERF: Reusable per-frame collections to avoid GC pressure from allocating every frame
  private _framePassTimings: Map<string, number> = new Map()
  private _frameWrittenByEnabledPass: Set<string> = new Set()
  private _framePassEnabledMemo: Map<string, boolean> = new Map()
  private _frameTimedPassIds: string[] = []
  private _framePassTimingResult: Array<{ passId: string; gpuTimeMs: number; skipped: boolean }> =
    []
  private beforeSubmitHooks: Map<string, (context: WebGPUBeforeSubmitHookContext) => void> =
    new Map()

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

    // Create setup context
    if (!capabilities) {
      throw new Error('WebGPURenderGraph: Capabilities not available')
    }
    this.setupContext = new SetupContextImpl(device, format, capabilities)

    // Enable GPU timing if supported
    if (capabilities?.timestampQuery) {
      this.enableGPUTiming(device)
    }

    this.initialized = true
  }

  private enableGPUTiming(device: GPUDevice): void {
    const maxPasses = 64 // Support up to 64 passes
    const queryCount = maxPasses * 2 // Start and end timestamp per pass

    this.timestampQuerySet = device.createQuerySet({
      type: 'timestamp',
      count: queryCount,
    })

    this.timestampBuffer = device.createBuffer({
      size: queryCount * 8, // 8 bytes per timestamp
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

    const byteLength = measuredPassCount * 16 // 2 timestamps (u64) per pass
    const readBuffer = this.timestampReadBuffer
    const passIds = timedPassIds.slice(0, measuredPassCount)
    this.timestampReadbackInFlight = true

    device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        // Buffer may have been destroyed by dispose() during the async wait
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
        if (!this.initialized) return // Buffer destroyed by dispose() — expected
        console.warn('[WebGPU RenderGraph] Timestamp readback failed:', err)
      })
      .finally(() => {
        this.timestampReadbackInFlight = false
      })
  }

  /**
   * Set viewport size.
   * @param width
   * @param height
   */
  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return

    this.width = width
    this.height = height
    this.pool.setSize(width, height)
    this.compiled = false
  }

  /** Current render width in pixels. */
  getWidth(): number {
    return this.width
  }

  /** Current render height in pixels. */
  getHeight(): number {
    return this.height
  }

  /**
   * Add a resource configuration.
   * @param id
   * @param config
   */
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

  /**
   * Remove a resource.
   * @param id
   */
  removeResource(id: string): void {
    this.resources.delete(id)
    this.pool.removeResource(id)
    this.compiled = false
  }

  /**
   * Expose setup context for external pass pre-initialization (warm swap).
   * Returns null if the graph has not been initialized.
   */
  getSetupContext(): WebGPUSetupContext | null {
    return this.setupContext
  }

  /**
   * Add a render pass.
   * @param pass
   */
  async addPass(pass: WebGPURenderPass): Promise<void> {
    if (this.passes.has(pass.id)) {
      console.warn(`WebGPURenderGraph: Pass '${pass.id}' already exists`)
      return
    }

    // Initialize the pass
    if (this.setupContext) {
      await pass.initialize(this.setupContext)
    }

    this.passes.set(pass.id, pass)
    this.compiled = false
  }

  /**
   * Add a pass that has already been initialized externally.
   * Used for warm swap: the pass was initialized while the old pass was still rendering.
   * Disposes and replaces any existing pass with the same ID.
   */
  addInitializedPass(pass: WebGPURenderPass): void {
    const existing = this.passes.get(pass.id)
    if (existing) {
      existing.dispose()
    }
    this.passes.set(pass.id, pass)
    this.compiled = false
  }

  /**
   * Remove a render pass.
   * @param id
   */
  removePass(id: string): void {
    const pass = this.passes.get(id)
    if (pass) {
      pass.dispose()
      this.passes.delete(id)
      this.compiled = false
    }
  }

  /**
   * Clear all passes and resources.
   * Call this before rebuilding the render graph with new passes.
   */
  clearPasses(): void {
    // Dispose all passes
    for (const pass of this.passes.values()) {
      pass.dispose()
    }
    this.passes.clear()
    this.passOrder = []

    // Dispose graph-owned resources in the pool before clearing bookkeeping.
    // Prevents leaked resource configs/textures across repeated graph rebuilds.
    for (const resourceId of this.resources.keys()) {
      this.pool.removeResource(resourceId)
    }

    // Clear resources (pool resources were disposed above and will be recreated)
    this.resources.clear()

    // Clear state tracking
    this.passStateTracking.clear()
    this.resourceAliases.clear()

    this.compiled = false
  }

  /**
   * Get a pass by ID.
   * @param id
   */
  getPass(id: string): WebGPURenderPass | undefined {
    return this.passes.get(id)
  }

  /**
   * Register a callback executed after all passes are encoded and before submit().
   *
   * Useful for one-off command encoding that must happen on the same frame
   * command encoder (for example, screenshot readback copies from the canvas).
   */
  registerBeforeSubmitHook(
    id: string,
    hook: (context: WebGPUBeforeSubmitHookContext) => void
  ): void {
    this.beforeSubmitHooks.set(id, hook)
  }

  /**
   * Remove a previously-registered before-submit hook.
   */
  unregisterBeforeSubmitHook(id: string): void {
    this.beforeSubmitHooks.delete(id)
  }

  /**
   * Compile the render graph.
   * Resolves pass dependencies and determines execution order.
   */
  compile(): void {
    if (this.compiled) return

    // Build dependency graph
    const outputToPass = new Map<string, string>()

    for (const [id, pass] of this.passes) {
      // Defensive: check if outputs exists and is iterable
      if (!pass.config.outputs || !Array.isArray(pass.config.outputs)) {
        console.error(`WebGPURenderGraph: Pass '${id}' has invalid outputs:`, pass.config.outputs)
        continue
      }
      for (const output of pass.config.outputs) {
        outputToPass.set(output.resourceId, id)
      }
    }

    const sortByPriority = (a: string, b: string): number => {
      const passA = this.passes.get(a)
      const passB = this.passes.get(b)
      const prioA = passA?.config.priority ?? 0
      const prioB = passB?.config.priority ?? 0
      if (prioA !== prioB) return prioA - prioB
      return a.localeCompare(b)
    }

    // Kahn topological sort with priority tie-breakers.
    // This preserves producer->consumer dependencies while keeping deterministic
    // ordering for independent passes.
    const dependents = new Map<string, Set<string>>()
    const indegree = new Map<string, number>()

    for (const passId of this.passes.keys()) {
      dependents.set(passId, new Set())
      indegree.set(passId, 0)
    }

    for (const [id, pass] of this.passes) {
      if (!pass.config.inputs || !Array.isArray(pass.config.inputs)) {
        console.error(`WebGPURenderGraph: Pass '${id}' has invalid inputs:`, pass.config.inputs)
        continue
      }
      for (const input of pass.config.inputs) {
        const producer = outputToPass.get(input.resourceId)
        if (!producer || producer === id) continue

        const producerDependents = dependents.get(producer)
        if (!producerDependents) continue

        // Only count each dependency once.
        if (producerDependents.has(id)) continue
        producerDependents.add(id)
        indegree.set(id, (indegree.get(id) ?? 0) + 1)
      }
    }

    const readyQueue: string[] = []
    for (const [passId, degree] of indegree.entries()) {
      if (degree === 0) readyQueue.push(passId)
    }
    readyQueue.sort(sortByPriority)

    const sorted: string[] = []
    while (readyQueue.length > 0) {
      const nextPassId = readyQueue.shift()!
      sorted.push(nextPassId)

      const nextDependents = dependents.get(nextPassId)
      if (!nextDependents) continue
      for (const dependentId of nextDependents) {
        const nextDegree = (indegree.get(dependentId) ?? 0) - 1
        indegree.set(dependentId, nextDegree)
        if (nextDegree === 0) {
          readyQueue.push(dependentId)
          readyQueue.sort(sortByPriority)
        }
      }
    }

    if (sorted.length !== this.passes.size) {
      const remaining = [...this.passes.keys()].filter((id) => !sorted.includes(id))
      remaining.sort(sortByPriority)
      console.error(
        `WebGPURenderGraph: Cycle detected among passes (${remaining.join(', ')}); appending remaining passes by priority`
      )
      sorted.push(...remaining)
    }

    this.passOrder = sorted

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
    // This prevents memory leaks when passes are removed
    const currentPassIds = new Set(this.passOrder)
    for (const passId of this.passStateTracking.keys()) {
      if (!currentPassIds.has(passId)) {
        this.passStateTracking.delete(passId)
      }
    }

    this.compiled = true
  }

  /**
   * Register a store getter for frame context.
   * @param key
   * @param getter
   */
  setStoreGetter(key: string, getter: () => unknown): void {
    this.storeGetters.set(key, getter)
  }

  /**
   * Capture frame context from stores.
   * @param delta
   */
  private captureFrameContext(delta: number): WebGPUFrameContext {
    const stores: Record<string, unknown> = {}
    for (const [key, getter] of this.storeGetters) {
      try {
        stores[key] = getter()
      } catch (e) {
        console.error(`Failed to capture store '${key}':`, e)
      }
    }

    return {
      frameNumber: this.frameNumber,
      delta,
      time: this.elapsedTime,
      size: { width: this.width, height: this.height },
      stores,
    }
  }

  /**
   * Execute the render graph for one frame.
   * @param delta
   */
  execute(delta: number): WebGPUFrameStats {
    if (!this.initialized) {
      // Graceful skip: during HMR or graph recreation the animation loop may
      // fire on a stale/disposed graph reference before the new one initializes.
      return {
        totalTimeMs: 0,
        passTiming: [],
        commandBufferCount: 0,
        vramUsage: 0,
        drawStats: { calls: 0, triangles: 0, vertices: 0, lines: 0, points: 0 },
      }
    }

    // Ensure compiled
    if (!this.compiled) {
      this.compile()
    }

    this.elapsedTime += delta
    this.frameNumber++

    // Capture frame context
    this.frameContext = this.captureFrameContext(delta)

    const device = this.deviceManager.getDevice()
    const canvasTexture = this.deviceManager.getCurrentTexture()
    const canvasTextureView = canvasTexture.createView()

    // Detect canvas texture vs graph dimension mismatch (dev-only)
    if (import.meta.env.DEV && (canvasTexture.width !== this.width || canvasTexture.height !== this.height)) {
      console.warn(`[RenderGraph] Dimension mismatch: canvasTexture ${canvasTexture.width}×${canvasTexture.height}, graph ${this.width}×${this.height}`)
    }

    // Create command encoder
    const encoder = device.createCommandEncoder({
      label: `frame-${this.frameNumber}`,
    })

    // Clear resource aliases from previous frame
    // Aliases are re-computed each frame based on which passes are enabled
    this.resourceAliases.clear()

    // Create render context
    const ctx = new RenderContextImpl(
      device,
      encoder,
      this.frameContext,
      { width: this.width, height: this.height },
      this.pool,
      canvasTextureView,
      this.resourceAliases
    )

    // Execute passes
    // PERF: Reuse per-frame collections instead of allocating new ones each frame
    const passTimings = this._framePassTimings
    passTimings.clear()
    let timestampIndex = 0
    const timedPassIds = this._frameTimedPassIds
    timedPassIds.length = 0
    const canCollectGpuTimings =
      this.gpuTimingEnabled &&
      !!this.timestampQuerySet &&
      !!this.timestampBuffer &&
      !!this.timestampReadBuffer &&
      !this.timestampReadbackInFlight

    // DEBUG: Log pass execution once per second
    const now = Date.now()
    const shouldLog = import.meta.env.DEV && (!this._lastPassLog || now - this._lastPassLog > 1000)
    if (shouldLog) {
      this._lastPassLog = now
    }

    // Track resources written by enabled passes to prevent passthrough overwriting them
    // PERF: Reuse instance-level collections instead of allocating per frame
    const writtenByEnabledPass = this._frameWrittenByEnabledPass
    writtenByEnabledPass.clear()
    const passEnabledMemo = this._framePassEnabledMemo
    passEnabledMemo.clear()

    const getPassEnabled = (pass: WebGPURenderPass, passId: string): boolean => {
      const cached = passEnabledMemo.get(passId)
      if (cached !== undefined) {
        return cached
      }
      const enabled = pass.config.enabled?.(this.frameContext) ?? true
      passEnabledMemo.set(passId, enabled)
      return enabled
    }

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId)
      if (!pass) {
        if (shouldLog) console.warn(`[WebGPU RenderGraph] Pass '${passId}' not found in map`)
        continue
      }

      // Check if pass is enabled
      const enabled = getPassEnabled(pass, passId)

      // ========================================================================
      // Lazy Resource Deallocation: Track disabled frames and manage grace period
      // ========================================================================
      if (enabled) {
        // Pass is enabled - reset disabled frame counter
        this.passStateTracking.set(passId, 0)
      } else {
        // Pass is disabled - track how long it's been disabled
        const disabledFrameCount = (this.passStateTracking.get(passId) ?? 0) + 1
        this.passStateTracking.set(passId, disabledFrameCount)

        // Check if grace period has elapsed and pass has releaseInternalResources
        const gracePeriod =
          pass.config.disableGracePeriod ?? WebGPURenderGraph.DEFAULT_DISABLE_GRACE_PERIOD
        const keepResources = pass.config.keepResourcesWhenDisabled ?? false

        // Only call releaseInternalResources exactly once when grace period elapses
        if (!keepResources && disabledFrameCount === gracePeriod && pass.releaseInternalResources) {
          pass.releaseInternalResources()
        }
      }
      // ========================================================================

      if (!enabled) {
        // For disabled passes, maintain the resource chain
        const inputs = pass.config.inputs ?? []
        const outputs = pass.config.outputs ?? []

        if (inputs.length >= 1 && outputs.length >= 1) {
          // First input is typically the color/main input
          const inputId = inputs[0]!.resourceId
          const outputId = outputs[0]!.resourceId

          // CRITICAL: Skip if output was already written by an enabled pass
          // This prevents mutually exclusive passes from overwriting each other's output
          if (writtenByEnabledPass.has(outputId)) {
            passTimings.set(passId, 0)
            if (shouldLog)
              console.log(`[WebGPU RenderGraph] Pass '${passId}' skipped (output already written)`)
            continue
          }

          // Check if this pass should use aliasing instead of passthrough
          const skipPassthrough = pass.config.skipPassthrough ?? false

          if (skipPassthrough) {
            // Aliasing: output resolves to input (zero GPU cost)
            this.resourceAliases.set(outputId, inputId)
            if (shouldLog)
              console.log(`[WebGPU RenderGraph] Pass '${passId}' aliasing ${outputId} → ${inputId}`)
          } else {
            // Passthrough: copy input texture to output target using GPU copy
            const inputTexture = this.pool.getTexture(inputId)
            const outputTexture = this.pool.getTexture(outputId)

            if (inputTexture && outputTexture) {
              // WebGPU copyTextureToTexture requires same dimensions AND same format
              // For safety, verify both match
              const inputWidth = inputTexture.width
              const inputHeight = inputTexture.height
              const outputWidth = outputTexture.width
              const outputHeight = outputTexture.height
              const inputFormat = inputTexture.format
              const outputFormat = outputTexture.format

              const dimensionsMatch = inputWidth === outputWidth && inputHeight === outputHeight
              const formatsMatch = inputFormat === outputFormat

              if (dimensionsMatch && formatsMatch) {
                encoder.copyTextureToTexture(
                  { texture: inputTexture },
                  { texture: outputTexture },
                  { width: inputWidth, height: inputHeight }
                )
                if (shouldLog)
                  console.log(
                    `[WebGPU RenderGraph] Pass '${passId}' passthrough copy ${inputId} → ${outputId}`
                  )
              } else {
                // Dimensions or format mismatch - fall back to aliasing
                this.resourceAliases.set(outputId, inputId)
                const reason = !dimensionsMatch
                  ? 'size mismatch'
                  : `format mismatch (${inputFormat} → ${outputFormat})`
                if (shouldLog)
                  console.log(
                    `[WebGPU RenderGraph] Pass '${passId}' aliasing (${reason}) ${outputId} → ${inputId}`
                  )
              }
            }
          }
        }

        passTimings.set(passId, 0)
        if (shouldLog) console.log(`[WebGPU RenderGraph] Pass '${passId}' is disabled`)
        continue
      }

      // Track outputs written by this enabled pass
      for (const output of pass.config.outputs ?? []) {
        writtenByEnabledPass.add(output.resourceId)
      }

      if (canCollectGpuTimings) {
        ctx.setPassTimestampWrites(this.timestampQuerySet!, timestampIndex * 2)
      }

      // Execute pass
      try {
        pass.execute(ctx)
      } catch (e) {
        console.error(`[WebGPU RenderGraph] Error executing pass '${passId}':`, e)
      } finally {
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

    const resolvedTimestampCount = timestampIndex * 2
    // Resolve timestamps
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
      const hookContext: WebGPUBeforeSubmitHookContext = {
        device,
        encoder,
        canvasTexture,
        frame: this.frameContext,
        size: { width: this.width, height: this.height },
      }

      for (const [hookId, hook] of this.beforeSubmitHooks) {
        try {
          hook(hookContext)
        } catch (error) {
          console.error(`[WebGPU RenderGraph] beforeSubmit hook '${hookId}' failed:`, error)
        }
      }
    }

    // Submit command buffer
    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])
    this.scheduleTimestampReadback(device, timestampIndex, timedPassIds)

    // Post-frame hooks
    for (const pass of this.passes.values()) {
      pass.postFrame?.()
    }

    // Swap ping-pong buffers
    for (const [id] of this.resources) {
      this.pool.swapPingPong(id)
    }

    // Aggregate draw statistics from all passes
    let totalCalls = 0
    let totalTriangles = 0
    let totalVertices = 0
    let totalLines = 0
    let totalPoints = 0

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId)
      if (!pass) continue

      // Check if pass was enabled this frame
      const enabled = passEnabledMemo.get(passId) ?? true
      if (!enabled) continue

      // Get draw stats if available
      const passStats = pass.getDrawStats?.()
      if (passStats) {
        totalCalls += passStats.calls
        totalTriangles += passStats.triangles
        totalVertices += passStats.vertices
        totalLines += passStats.lines
        totalPoints += passStats.points
      }
    }

    // Build frame stats
    return {
      totalTimeMs: delta * 1000,
      // PERF: Reuse pre-allocated passTiming array, resize only when pass count changes
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
    }
  }

  /**
   * PERF: Build pass timing results, reusing pre-allocated array when possible.
   */
  private buildPassTimingResult(
    passEnabledMemo: Map<string, boolean>
  ): Array<{ passId: string; gpuTimeMs: number; skipped: boolean }> {
    const result = this._framePassTimingResult
    const passCount = this.passOrder.length

    // Resize array if pass count changed
    while (result.length < passCount) {
      result.push({ passId: '', gpuTimeMs: 0, skipped: false })
    }
    if (result.length > passCount) {
      result.length = passCount
    }

    // Update in-place
    for (let i = 0; i < passCount; i++) {
      const id = this.passOrder[i]!
      const entry = result[i]!
      entry.passId = id
      entry.gpuTimeMs = this.lastPassTimings.get(id) ?? 0
      entry.skipped = !(passEnabledMemo.get(id) ?? true)
    }

    return result
  }

  /**
   * Get frame number.
   */
  getFrameNumber(): number {
    return this.frameNumber
  }

  /**
   * Get VRAM usage estimate.
   */
  getVRAMUsage(): number {
    return this.pool.getVRAMUsage()
  }

  /**
   * Get dimensions of all allocated resources.
   */
  getResourceDimensions(): Map<string, { width: number; height: number }> {
    return this.pool.getAllResourceDimensions()
  }

  /**
   * Check if GPU timing is available.
   */
  isGPUTimingAvailable(): boolean {
    return this.gpuTimingEnabled
  }

  /**
   * Get current resource aliases for debugging.
   *
   * Shows which output resources are aliased to which input resources
   * when passes are disabled with skipPassthrough=true.
   *
   * @returns Map of outputId → resolvedInputId
   */
  getResourceAliases(): Map<string, string> {
    // Return resolved aliases (follow chains to final source)
    const resolved = new Map<string, string>()
    for (const [outputId] of this.resourceAliases) {
      let current = outputId
      const visited = new Set<string>()
      while (this.resourceAliases.has(current) && !visited.has(current)) {
        visited.add(current)
        current = this.resourceAliases.get(current)!
      }
      resolved.set(outputId, current)
    }
    return resolved
  }

  /**
   * Get resource deallocation statistics.
   *
   * Useful for monitoring memory management and debugging.
   *
   * @returns Stats about pass states and pending deallocations
   */
  getResourceDeallocationStats(): {
    enabledPasses: number
    disabledPasses: number
    pendingDeallocations: number
  } {
    let enabled = 0
    let disabled = 0
    let pending = 0

    for (const [passId, disabledFrameCount] of this.passStateTracking) {
      const pass = this.passes.get(passId)
      if (!pass) continue

      if (disabledFrameCount === 0) {
        enabled++
      } else {
        disabled++
        const gracePeriod =
          pass.config.disableGracePeriod ?? WebGPURenderGraph.DEFAULT_DISABLE_GRACE_PERIOD
        const keepResources = pass.config.keepResourcesWhenDisabled ?? false
        if (!keepResources && disabledFrameCount < gracePeriod && pass.releaseInternalResources) {
          pending++
        }
      }
    }

    return { enabledPasses: enabled, disabledPasses: disabled, pendingDeallocations: pending }
  }

  /**
   * Dispose the render graph.
   */
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
