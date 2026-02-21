/* global GPUTextureFormat */
/**
 * WebGPU Resource Pool
 *
 * Manages GPU resource allocation, caching, and lifecycle for the render graph.
 * Handles texture creation, resizing, and disposal with automatic ping-pong
 * buffer management for read-write resources.
 *
 * @module rendering/webgpu/core/WebGPUResourcePool
 */

import type { ResourceSize, WebGPURenderResourceConfig, WebGPUResource } from './types'

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_USAGE =
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.RENDER_ATTACHMENT |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST

// =============================================================================
// Resource Pool
// =============================================================================

/**
 * WebGPU resource pool for render graph.
 *
 * Allocates and manages GPU textures, handling:
 * - Automatic resizing when viewport changes
 * - Ping-pong buffers for read-write resources
 * - Resource caching and reuse
 * - Proper cleanup on disposal
 */
export class WebGPUResourcePool {
  private device: GPUDevice | null = null
  private resources = new Map<string, WebGPUResource>()
  private pingPongResources = new Map<string, { read: WebGPUResource; write: WebGPUResource }>()
  private configs = new Map<string, WebGPURenderResourceConfig>()

  // Current viewport size
  private width = 0
  private height = 0

  // Default samplers (cached for reuse)
  private linearSampler: GPUSampler | null = null

  // PERF: Cached VRAM usage to avoid per-frame traversal of all resources
  private cachedVRAMUsage = 0
  private vramUsageDirty = true

  /**
   * Initialize the pool with a GPU device.
   * @param device
   */
  initialize(device: GPUDevice): void {
    this.device = device

    // Create default samplers
    this.linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

  }

  /**
   * Set the viewport size and resize resources as needed.
   * @param width
   * @param height
   */
  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) {
      return
    }

    this.width = width
    this.height = height

    // Resize all non-fixed resources
    for (const [id, config] of this.configs) {
      if (config.size.mode !== 'fixed') {
        this.reallocateResource(id, config)
      }
    }
  }

  /**
   * Add a resource configuration.
   * The actual resource is allocated lazily when first accessed.
   * @param config
   */
  addResource(config: WebGPURenderResourceConfig): void {
    this.configs.set(config.id, config)
  }

  /**
   * Remove a resource and free GPU memory.
   * @param id
   */
  removeResource(id: string): void {
    const resource = this.resources.get(id)
    if (resource) {
      this.disposeResource(resource)
      this.resources.delete(id)
    }

    const pingPong = this.pingPongResources.get(id)
    if (pingPong) {
      this.disposeResource(pingPong.read)
      this.disposeResource(pingPong.write)
      this.pingPongResources.delete(id)
    }

    this.configs.delete(id)
  }

  /**
   * Get a resource, allocating if necessary.
   * @param id
   */
  getResource(id: string): WebGPUResource | null {
    // Check if already allocated
    let resource = this.resources.get(id)
    if (resource) {
      return resource
    }

    // Allocate from config
    const config = this.configs.get(id)
    if (!config) {
      return null
    }

    resource = this.allocateResource(config)
    this.resources.set(id, resource)
    return resource
  }

  /**
   * Get the texture for a resource.
   * @param id
   */
  getTexture(id: string): GPUTexture | null {
    return this.getResource(id)?.texture ?? null
  }

  /**
   * Get the texture view for a resource.
   * @param id
   */
  getTextureView(id: string): GPUTextureView | null {
    return this.getResource(id)?.view ?? null
  }

  /**
   * Get the sampler for a resource.
   * @param id
   */
  getSampler(id: string): GPUSampler | null {
    return this.getResource(id)?.sampler ?? null
  }

  /**
   * Mark a resource as needing ping-pong buffers.
   * Called by the graph compiler for read-write resources.
   * @param id
   */
  enablePingPong(id: string): void {
    if (this.pingPongResources.has(id)) {
      return
    }

    const config = this.configs.get(id)
    if (!config) {
      console.warn(`WebGPUResourcePool: Cannot enable ping-pong for unknown resource '${id}'`)
      return
    }

    // Allocate both read and write buffers
    const read = this.allocateResource(config)
    const write = this.allocateResource(config)
    this.pingPongResources.set(id, { read, write })

    // Remove from regular resources if present
    const existing = this.resources.get(id)
    if (existing) {
      this.disposeResource(existing)
      this.resources.delete(id)
    }
  }

  /**
   * Get the read texture view for ping-pong resources.
   * @param id
   */
  getReadTextureView(id: string): GPUTextureView | null {
    const pingPong = this.pingPongResources.get(id)
    if (pingPong) {
      return pingPong.read.view
    }
    return this.getTextureView(id)
  }

  /**
   * Get the write texture view for ping-pong resources.
   * @param id
   */
  getWriteTextureView(id: string): GPUTextureView | null {
    const pingPong = this.pingPongResources.get(id)
    if (pingPong) {
      return pingPong.write.view
    }
    return this.getTextureView(id)
  }

  /**
   * Swap ping-pong buffers after a pass writes to them.
   * @param id
   */
  swapPingPong(id: string): void {
    const pingPong = this.pingPongResources.get(id)
    if (pingPong) {
      const temp = pingPong.read
      pingPong.read = pingPong.write
      pingPong.write = temp
    }
  }

  /**
   * Get resource dimensions.
   * @param id
   */
  getResourceDimensions(id: string): { width: number; height: number } | null {
    const resource = this.getResource(id)
    if (resource) {
      return { width: resource.width, height: resource.height }
    }
    return null
  }

  /**
   * Estimate VRAM usage in bytes.
   */
  getVRAMUsage(): number {
    // PERF: Return cached value when resources haven't changed
    if (!this.vramUsageDirty) {
      return this.cachedVRAMUsage
    }

    let total = 0

    const countResource = (r: WebGPUResource): number => {
      const bytesPerPixel = this.getBytesPerPixel(r.config.format ?? 'rgba16float')
      let size = r.width * r.height * bytesPerPixel
      if (r.depthTexture) {
        size += r.width * r.height * 4 // Assume 4 bytes for depth
      }
      return size
    }

    for (const resource of this.resources.values()) {
      total += countResource(resource)
    }

    for (const pingPong of this.pingPongResources.values()) {
      total += countResource(pingPong.read)
      total += countResource(pingPong.write)
    }

    this.cachedVRAMUsage = total
    this.vramUsageDirty = false
    return total
  }

  /**
   * Get dimensions of all allocated resources.
   *
   * @returns Map of resource ID to { width, height }
   */
  getAllResourceDimensions(): Map<string, { width: number; height: number }> {
    const dimensions = new Map<string, { width: number; height: number }>()

    for (const [id, resource] of this.resources) {
      dimensions.set(id, { width: resource.width, height: resource.height })
    }

    for (const [id, pingPong] of this.pingPongResources) {
      // Use read buffer dimensions (both should be same size)
      dimensions.set(id, { width: pingPong.read.width, height: pingPong.read.height })
    }

    return dimensions
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const resource of this.resources.values()) {
      this.disposeResource(resource)
    }
    this.resources.clear()

    for (const pingPong of this.pingPongResources.values()) {
      this.disposeResource(pingPong.read)
      this.disposeResource(pingPong.write)
    }
    this.pingPongResources.clear()

    this.configs.clear()
    this.device = null
    this.linearSampler = null
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private allocateResource(config: WebGPURenderResourceConfig): WebGPUResource {
    if (!this.device) {
      throw new Error('WebGPUResourcePool: Device not initialized')
    }

    const { width, height } = this.resolveSize(config.size)
    const format = config.format ?? 'rgba16float'
    const usage = config.usage ?? DEFAULT_USAGE

    // Create main texture
    const texture = this.device.createTexture({
      size: {
        width,
        height,
        depthOrArrayLayers: config.arrayLayerCount ?? 1,
      },
      format,
      usage,
      sampleCount: config.sampleCount ?? 1,
      mipLevelCount: config.mipLevelCount ?? 1,
    })

    const view = texture.createView({
      dimension: config.type === 'cubemap' ? 'cube' : '2d',
    })

    // Create depth texture if needed
    let depthTexture: GPUTexture | undefined
    let depthView: GPUTextureView | undefined

    if (config.type === 'depthStencil' || config.depthFormat) {
      const depthFormat = config.depthFormat ?? 'depth24plus'
      depthTexture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        sampleCount: config.sampleCount ?? 1,
      })
      depthView = depthTexture.createView()
    }

    // Use appropriate sampler
    const sampler = this.linearSampler!

    this.vramUsageDirty = true
    return {
      config,
      texture,
      view,
      depthTexture,
      depthView,
      sampler,
      width,
      height,
    }
  }

  private reallocateResource(id: string, config: WebGPURenderResourceConfig): void {
    // Handle ping-pong resources
    const pingPong = this.pingPongResources.get(id)
    if (pingPong) {
      this.disposeResource(pingPong.read)
      this.disposeResource(pingPong.write)
      pingPong.read = this.allocateResource(config)
      pingPong.write = this.allocateResource(config)
      return
    }

    // Handle regular resources
    const existing = this.resources.get(id)
    if (existing) {
      this.disposeResource(existing)
      this.resources.set(id, this.allocateResource(config))
    }
  }

  private disposeResource(resource: WebGPUResource): void {
    resource.texture.destroy()
    resource.depthTexture?.destroy()
    this.vramUsageDirty = true
  }

  private resolveSize(size: ResourceSize): { width: number; height: number } {
    switch (size.mode) {
      case 'screen':
        return { width: this.width || 1, height: this.height || 1 }

      case 'fixed':
        return {
          width: size.width ?? 256,
          height: size.height ?? 256,
        }

      case 'fraction': {
        const fraction = size.fraction ?? 1
        return {
          width: Math.max(1, Math.floor((this.width || 1) * fraction)),
          height: Math.max(1, Math.floor((this.height || 1) * fraction)),
        }
      }

      default:
        return { width: this.width || 1, height: this.height || 1 }
    }
  }

  private getBytesPerPixel(format: GPUTextureFormat): number {
    // Common formats
    switch (format) {
      case 'rgba8unorm':
      case 'rgba8snorm':
      case 'bgra8unorm':
        return 4
      case 'rgba16float':
        return 8
      case 'rgba32float':
        return 16
      case 'r8unorm':
        return 1
      case 'r16float':
        return 2
      case 'r32float':
        return 4
      case 'rg8unorm':
        return 2
      case 'rg16float':
        return 4
      case 'rg32float':
        return 8
      default:
        return 4 // Default assumption
    }
  }
}
