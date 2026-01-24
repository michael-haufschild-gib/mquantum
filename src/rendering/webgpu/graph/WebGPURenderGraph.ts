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
  WebGPURenderPassConfig,
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

  constructor(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    frame: WebGPUFrameContext | null,
    size: { width: number; height: number },
    pool: WebGPUResourcePool,
    canvasTextureView: GPUTextureView
  ) {
    this.device = device
    this.encoder = encoder
    this.frame = frame
    this.size = size
    this.pool = pool
    this.canvasTextureView = canvasTextureView
  }

  getTexture(resourceId: string): GPUTexture | null {
    return this.pool.getTexture(resourceId)
  }

  getTextureView(resourceId: string): GPUTextureView | null {
    return this.pool.getTextureView(resourceId)
  }

  getWriteTarget(resourceId: string): GPUTextureView | null {
    return this.pool.getWriteTextureView(resourceId)
  }

  getReadTextureView(resourceId: string): GPUTextureView | null {
    return this.pool.getReadTextureView(resourceId)
  }

  getSampler(resourceId: string): GPUSampler | null {
    return this.pool.getSampler(resourceId)
  }

  getResource(resourceId: string): WebGPUResource | null {
    return this.pool.getResource(resourceId)
  }

  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    return this.encoder.beginRenderPass(descriptor)
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    return this.encoder.beginComputePass(descriptor)
  }

  getCanvasTextureView(): GPUTextureView {
    return this.canvasTextureView
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

  // Frame context
  private frameContext: WebGPUFrameContext | null = null
  private storeGetters: Map<string, () => unknown> = new Map()

  // Setup context
  private setupContext: SetupContextImpl | null = null

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

  /**
   * Set viewport size.
   */
  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return

    this.width = width
    this.height = height
    this.pool.setSize(width, height)
    this.compiled = false
  }

  /**
   * Add a resource configuration.
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
   */
  removeResource(id: string): void {
    this.resources.delete(id)
    this.pool.removeResource(id)
    this.compiled = false
  }

  /**
   * Add a render pass.
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
   * Remove a render pass.
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

    // Clear resources (pool will recreate them)
    this.resources.clear()

    this.compiled = false
  }

  /**
   * Get a pass by ID.
   */
  getPass(id: string): WebGPURenderPass | undefined {
    return this.passes.get(id)
  }

  /**
   * Compile the render graph.
   * Resolves pass dependencies and determines execution order.
   */
  compile(): void {
    if (this.compiled) return

    // Build dependency graph
    const passConfigs = new Map<string, WebGPURenderPassConfig>()
    const outputToPass = new Map<string, string>()

    for (const [id, pass] of this.passes) {
      passConfigs.set(id, pass.config)
      for (const output of pass.config.outputs) {
        outputToPass.set(output.resourceId, id)
      }
    }

    // Topological sort based on resource dependencies
    const sorted: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (id: string): void => {
      if (visited.has(id)) return
      if (visiting.has(id)) {
        console.error(`WebGPURenderGraph: Cycle detected involving pass '${id}'`)
        return
      }

      visiting.add(id)

      const pass = this.passes.get(id)
      if (pass) {
        // Visit dependencies (passes that produce our inputs)
        for (const input of pass.config.inputs) {
          const producer = outputToPass.get(input.resourceId)
          if (producer && producer !== id) {
            visit(producer)
          }
        }
      }

      visiting.delete(id)
      visited.add(id)
      sorted.push(id)
    }

    for (const id of this.passes.keys()) {
      visit(id)
    }

    // Sort by priority within dependency-satisfying order
    this.passOrder = sorted.sort((a, b) => {
      const passA = this.passes.get(a)
      const passB = this.passes.get(b)
      const prioA = passA?.config.priority ?? 0
      const prioB = passB?.config.priority ?? 0
      return prioA - prioB
    })

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

    this.compiled = true
  }

  /**
   * Register a store getter for frame context.
   */
  setStoreGetter(key: string, getter: () => unknown): void {
    this.storeGetters.set(key, getter)
  }

  /**
   * Capture frame context from stores.
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
   */
  execute(delta: number): WebGPUFrameStats {
    if (!this.initialized) {
      throw new Error('WebGPURenderGraph: Not initialized')
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

    // Create command encoder
    const encoder = device.createCommandEncoder({
      label: `frame-${this.frameNumber}`,
    })

    // Create render context
    const ctx = new RenderContextImpl(
      device,
      encoder,
      this.frameContext,
      { width: this.width, height: this.height },
      this.pool,
      canvasTextureView
    )

    // Execute passes
    const passTimings: Map<string, number> = new Map()
    let timestampIndex = 0

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId)
      if (!pass) continue

      // Check if pass is enabled
      const enabled = pass.config.enabled?.(this.frameContext) ?? true
      if (!enabled) {
        passTimings.set(passId, 0)
        continue
      }

      // NOTE: encoder.writeTimestamp() was removed from WebGPU spec (doesn't work on Apple Silicon).
      // Proper timestamp queries require using timestampWrites in beginRenderPass/beginComputePass.
      // For now, timing is disabled until passes are refactored to use timestampWrites.

      // Execute pass
      try {
        pass.execute(ctx)
      } catch (e) {
        console.error(`Error executing pass '${passId}':`, e)
      }

      timestampIndex++
    }

    // Resolve timestamps
    if (this.gpuTimingEnabled && this.timestampQuerySet && this.timestampBuffer) {
      encoder.resolveQuerySet(
        this.timestampQuerySet,
        0,
        timestampIndex * 2,
        this.timestampBuffer,
        0
      )
    }

    // Submit command buffer
    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])

    // Post-frame hooks
    for (const pass of this.passes.values()) {
      pass.postFrame?.()
    }

    // Swap ping-pong buffers
    for (const [id] of this.resources) {
      this.pool.swapPingPong(id)
    }

    // Build frame stats
    return {
      totalTimeMs: delta * 1000,
      passTiming: this.passOrder.map((id) => ({
        passId: id,
        gpuTimeMs: this.lastPassTimings.get(id) ?? 0,
        skipped: !(this.passes.get(id)?.config.enabled?.(this.frameContext) ?? true),
      })),
      commandBufferCount: 1,
      vramUsage: this.pool.getVRAMUsage(),
    }
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
   * Check if GPU timing is available.
   */
  isGPUTimingAvailable(): boolean {
    return this.gpuTimingEnabled
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
