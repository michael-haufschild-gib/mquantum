/**
 * Resource Pool
 *
 * Manages GPU resources (render targets, textures) for the render graph.
 * Handles allocation, resizing, disposal, and context loss recovery.
 *
 * Key features:
 * - Automatic resize when screen size changes
 * - Ping-pong buffer management for read-while-write hazards
 * - Resource reuse across frames
 * - Context loss handling
 *
 * @module rendering/graph/ResourcePool
 */

// =============================================================================
// Debug Logging
// =============================================================================
const DEBUG_RESOURCE_POOL = () =>
  (window as unknown as { _debugResourcePool?: boolean })._debugResourcePool ?? false

function debugLog(category: string, ...args: unknown[]): void {
  if (DEBUG_RESOURCE_POOL()) {
    console.log(`[ResourcePool:${category}]`, ...args)
  }
}

import * as THREE from 'three'

import type { RenderResourceConfig, ResourceSize } from './types'

// =============================================================================
// Types
// =============================================================================

/**
 * Internal resource entry with GPU object and metadata.
 */
interface ResourceEntry {
  /** Resource configuration */
  config: RenderResourceConfig

  /** Primary GPU resource */
  target: THREE.WebGLRenderTarget | null

  /** Swap buffer for ping-pong (if needed) */
  swapTarget: THREE.WebGLRenderTarget | null

  /** Current ping-pong index (0 or 1) */
  pingPongIndex: number

  /** Last computed dimensions */
  lastWidth: number
  lastHeight: number
}

// =============================================================================
// ResourcePool Class
// =============================================================================

/**
 * Pool for managing GPU resources.
 *
 * Resources are created lazily on first access and automatically
 * resized when screen dimensions change.
 *
 * @example
 * ```typescript
 * const pool = new ResourcePool();
 *
 * // Register resources
 * pool.register({
 *   id: 'sceneColor',
 *   type: 'renderTarget',
 *   size: { mode: 'screen' },
 *   depthBuffer: true,
 * });
 *
 * // Update dimensions each frame
 * pool.updateSize(window.innerWidth, window.innerHeight);
 *
 * // Get resource
 * const target = pool.get('sceneColor');
 * ```
 */
export class ResourcePool {
  private resources = new Map<string, ResourceEntry>()
  private screenWidth = 1
  private screenHeight = 1

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register a resource configuration.
   *
   * The GPU resource is not created until first access.
   * If a resource with this ID exists, it's replaced.
   *
   * @param config - Resource configuration
   */
  register(config: RenderResourceConfig): void {
    // Dispose existing if replacing
    const existing = this.resources.get(config.id)
    if (existing) {
      this.disposeEntry(existing)
    }

    this.resources.set(config.id, {
      config,
      target: null,
      swapTarget: null,
      pingPongIndex: 0,
      lastWidth: 0,
      lastHeight: 0,
    })
  }

  /**
   * Unregister and dispose a resource.
   *
   * @param id - Resource identifier
   * @returns true if resource was found and removed
   */
  unregister(id: string): boolean {
    const entry = this.resources.get(id)
    if (entry) {
      this.disposeEntry(entry)
      this.resources.delete(id)
      return true
    }
    return false
  }

  /**
   * Check if a resource is registered.
   *
   * @param id - Resource identifier
   * @returns True if the resource is registered
   */
  has(id: string): boolean {
    return this.resources.has(id)
  }

  // ==========================================================================
  // Size Management
  // ==========================================================================

  /**
   * Update screen dimensions.
   *
   * Resources with 'screen' or 'fraction' size mode will be resized
   * on next access if dimensions changed.
   *
   * @param width - Screen width in pixels
   * @param height - Screen height in pixels
   */
  // Maximum texture dimension (WebGL guaranteed minimum is 4096, most GPUs support 16384)
  private static readonly MAX_DIMENSION = 16384

  updateSize(width: number, height: number): void {
    if (width !== this.screenWidth || height !== this.screenHeight) {
      this.screenWidth = Math.max(1, Math.min(width, ResourcePool.MAX_DIMENSION))
      this.screenHeight = Math.max(1, Math.min(height, ResourcePool.MAX_DIMENSION))
    }
  }

  /**
   * Compute actual pixel dimensions for a size config.
   * @param size - Size configuration
   * @returns Width and height in pixels
   */
  private computeDimensions(size: ResourceSize): { width: number; height: number } {
    switch (size.mode) {
      case 'screen':
        return { width: this.screenWidth, height: this.screenHeight }

      case 'fraction': {
        const fraction = size.fraction ?? 1
        return {
          width: Math.max(1, Math.floor(this.screenWidth * fraction)),
          height: Math.max(1, Math.floor(this.screenHeight * fraction)),
        }
      }

      case 'fixed':
        return {
          width: size.width ?? 256,
          height: size.height ?? 256,
        }

      default:
        return { width: this.screenWidth, height: this.screenHeight }
    }
  }

  // ==========================================================================
  // Resource Access
  // ==========================================================================

  /**
   * Check if a resource is a Multiple Render Target (MRT).
   *
   * @param id - Resource identifier
   * @returns True if the resource is an MRT with multiple attachments
   */
  isMRT(id: string): boolean {
    const entry = this.resources.get(id)
    if (!entry) return false
    return entry.config.type === 'mrt' && (entry.config.attachmentCount ?? 1) > 1
  }

  /**
   * Get a resource's primary render target.
   *
   * Creates the target if it doesn't exist.
   * Resizes if dimensions changed.
   *
   * @param id - Resource identifier
   * @returns The render target or null if not found
   */
  get(id: string): THREE.WebGLRenderTarget | null {
    const entry = this.resources.get(id)
    if (!entry) {
      console.warn(`ResourcePool: Resource '${id}' not found`)
      return null
    }

    this.ensureAllocated(entry)
    return entry.target
  }

  /**
   * Get a resource's texture (from render target).
   *
   * @param id - Resource identifier
   * @param attachment
   * @returns The texture or null
   */
  getTexture(id: string, attachment?: number | 'depth'): THREE.Texture | null {
    const entry = this.resources.get(id)
    if (!entry) {
      return null
    }

    this.ensureAllocated(entry)

    const target = entry.target
    if (!target) {
      return null
    }

    // Depth attachment request
    if (attachment === 'depth') {
      return target.depthTexture ?? null
    }

    // MRT attachment request
    if (typeof attachment === 'number') {
      if (target.textures && target.textures[attachment]) {
        return target.textures[attachment] ?? null
      }
      return null
    }

    // Default texture role
    if (entry.config.textureRole === 'depth') {
      return target.depthTexture ?? null
    }

    return target.texture ?? null
  }

  /**
   * Get the read target for ping-pong resources.
   *
   * For non-ping-pong resources, returns the primary target.
   *
   * @param id - Resource identifier
   * @returns The read target or null
   */
  getReadTarget(id: string): THREE.WebGLRenderTarget | null {
    const entry = this.resources.get(id)
    if (!entry) return null

    this.ensureAllocated(entry)

    // If no swap buffer, return primary
    if (!entry.swapTarget) {
      return entry.target
    }

    // Return the "read" buffer based on ping-pong index
    return entry.pingPongIndex === 0 ? entry.target : entry.swapTarget
  }

  /**
   * Get the write target for ping-pong resources.
   *
   * For non-ping-pong resources, returns the primary target.
   *
   * @param id - Resource identifier
   * @returns The write target or null
   */
  getWriteTarget(id: string): THREE.WebGLRenderTarget | null {
    const entry = this.resources.get(id)
    if (!entry) return null

    this.ensureAllocated(entry)

    // If no swap buffer, return primary
    if (!entry.swapTarget) {
      return entry.target
    }

    // Return the "write" buffer (opposite of read)
    return entry.pingPongIndex === 0 ? entry.swapTarget : entry.target
  }

  /**
   * Swap ping-pong buffers for a resource.
   *
   * Call this after writing to swap read/write roles.
   *
   * @param id - Resource identifier
   */
  swap(id: string): void {
    const entry = this.resources.get(id)
    if (entry && entry.swapTarget) {
      entry.pingPongIndex = 1 - entry.pingPongIndex
    }
  }

  /**
   * Enable ping-pong mode for a resource.
   *
   * Creates the swap buffer if it doesn't exist.
   *
   * @param id - Resource identifier
   */
  enablePingPong(id: string): void {
    const entry = this.resources.get(id)
    if (!entry) return

    this.ensureAllocated(entry)

    if (!entry.swapTarget && entry.target) {
      // Create swap buffer with same config
      entry.swapTarget = this.createTarget(entry.config, entry.lastWidth, entry.lastHeight)
    }
  }

  // ==========================================================================
  // Internal Allocation
  // ==========================================================================

  /**
   * Ensure a resource is allocated and correctly sized.
   * @param entry
   */
  private ensureAllocated(entry: ResourceEntry): void {
    const { width, height } = this.computeDimensions(entry.config.size)

    // Check if we need to (re)allocate
    const needsAllocation = !entry.target
    const dimensionsChanged = width !== entry.lastWidth || height !== entry.lastHeight

    if (needsAllocation || dimensionsChanged) {
      // Store whether we had a swap target before disposal
      const hadSwapTarget = !!entry.swapTarget

      // Dispose old targets
      entry.target?.dispose()
      entry.swapTarget?.dispose()

      // Reset entry state to ensure retry on next frame if allocation fails
      entry.target = null
      entry.swapTarget = null
      entry.lastWidth = 0
      entry.lastHeight = 0

      try {
        // Create new target
        entry.target = this.createTarget(entry.config, width, height)

        // Recreate swap target if it existed before
        if (hadSwapTarget) {
          entry.swapTarget = this.createTarget(entry.config, width, height)
        }

        // Only update dimensions after successful allocation
        entry.lastWidth = width
        entry.lastHeight = height
      } catch (err) {
        // Cleanup partial allocation on failure
        entry.target?.dispose()
        entry.target = null
        entry.swapTarget = null
        throw err
      }
    }
  }

  /**
   * Create a render target from configuration.
   * @param config - Resource configuration
   * @param width - Target width in pixels
   * @param height - Target height in pixels
   * @returns The created render target
   */
  private createTarget(
    config: RenderResourceConfig,
    width: number,
    height: number
  ): THREE.WebGLRenderTarget {
    const options: THREE.RenderTargetOptions = {
      format: config.format ?? THREE.RGBAFormat,
      type: config.dataType ?? THREE.UnsignedByteType,
      minFilter: config.minFilter ?? THREE.LinearFilter,
      magFilter: config.magFilter ?? THREE.LinearFilter,
      wrapS: config.wrapS ?? THREE.ClampToEdgeWrapping,
      wrapT: config.wrapT ?? THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: config.depthTexture ? true : (config.depthBuffer ?? false),
      stencilBuffer: config.stencilBuffer ?? false,
      samples: config.samples ?? 0,
    }

    // Determine color space: HDR targets use LinearSRGBColorSpace for proper color management
    // This is critical for the OutputPass to correctly convert to display color space
    const isHDR = config.dataType === THREE.FloatType || config.dataType === THREE.HalfFloatType
    const colorSpace =
      config.colorSpace ?? (isHDR ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace)

    // Determine internalFormat for HDR targets
    // This is critical for proper HDR rendering - controls GPU-side format
    // Common formats: 'RGBA16F' (half-float), 'RGBA32F' (float), 'RGBA8' (standard)
    const internalFormat: THREE.PixelFormatGPU | null =
      (config.internalFormat as THREE.PixelFormatGPU | undefined) ??
      this.getDefaultInternalFormat(config.dataType)

    // Handle MRT
    if (config.type === 'mrt' && config.attachmentCount && config.attachmentCount > 1) {
      debugLog(
        'createMRT',
        `Creating MRT '${config.id}' with ${config.attachmentCount} attachments, ${width}x${height}`
      )

      const target = new THREE.WebGLRenderTarget(width, height, {
        ...options,
        count: config.attachmentCount,
      })

      const count = config.attachmentCount
      const textures = target.textures ?? []

      debugLog('createMRT', `  Initial textures array length: ${textures.length}`)

      // Ensure textures array has the correct length
      if (textures.length < count) {
        target.textures = new Array(count).fill(null).map(() => new THREE.Texture())
        debugLog('createMRT', `  Created new textures array with ${count} textures`)
      }

      for (let i = 0; i < count; i++) {
        const texture = target.textures[i] ?? new THREE.Texture()
        texture.format = config.attachmentFormats?.[i] ?? THREE.RGBAFormat
        texture.type = config.dataType ?? THREE.UnsignedByteType
        texture.minFilter = config.minFilter ?? THREE.LinearFilter
        texture.magFilter = config.magFilter ?? THREE.LinearFilter
        texture.generateMipmaps = false
        texture.colorSpace = colorSpace
        if (internalFormat) {
          texture.internalFormat = internalFormat
        }
        target.textures[i] = texture
        debugLog(
          'createMRT',
          `  Texture[${i}]: format=${texture.format}, type=${texture.type}, uuid=${texture.uuid.substring(0, 8)}`
        )
      }

      // Ensure target.texture points to attachment 0
      target.texture = target.textures[0] ?? target.texture

      // Apply internalFormat and color space to primary texture as well
      target.texture.colorSpace = colorSpace
      if (internalFormat) {
        target.texture.internalFormat = internalFormat
      }

      // Configure depth texture if requested
      if (config.depthTexture) {
        target.depthTexture = this.createDepthTexture(config, width, height)
      }

      debugLog(
        'createMRT',
        `  Final textures array: ${target.textures.map((t, i) => `[${i}]:${t ? t.uuid.substring(0, 8) : 'NULL'}`).join(', ')}`
      )

      return target
    }

    const target = new THREE.WebGLRenderTarget(width, height, options)
    target.texture.colorSpace = colorSpace
    if (internalFormat) {
      target.texture.internalFormat = internalFormat
    }

    if (config.depthTexture) {
      target.depthTexture = this.createDepthTexture(config, width, height)
    }

    return target
  }

  /**
   * Create a depth texture based on config.
   * @param config - Resource configuration
   * @param width - Texture width in pixels
   * @param height - Texture height in pixels
   * @returns The created depth texture
   */
  private createDepthTexture(
    config: RenderResourceConfig,
    width: number,
    height: number
  ): THREE.DepthTexture {
    const depthTexture = new THREE.DepthTexture(width, height)
    depthTexture.format = (config.depthTextureFormat ??
      THREE.DepthFormat) as THREE.DepthTexturePixelFormat
    depthTexture.type = config.depthTextureType ?? THREE.UnsignedShortType
    depthTexture.minFilter = config.depthTextureMinFilter ?? THREE.NearestFilter
    depthTexture.magFilter = (config.depthTextureMagFilter ??
      THREE.NearestFilter) as THREE.MagnificationTextureFilter
    depthTexture.generateMipmaps = false
    return depthTexture
  }

  /**
   * Get default internal format based on data type.
   * Returns the appropriate WebGL2 internal format.
   * Uses THREE.PixelFormatGPU type for Three.js r181+ compatibility.
   * @param dataType - The texture data type
   * @returns The appropriate internal format or null
   */
  private getDefaultInternalFormat(dataType?: THREE.TextureDataType): THREE.PixelFormatGPU | null {
    switch (dataType) {
      case THREE.FloatType:
        return 'RGBA32F' as THREE.PixelFormatGPU
      case THREE.HalfFloatType:
        return 'RGBA16F' as THREE.PixelFormatGPU
      case THREE.UnsignedByteType:
        return 'RGBA8' as THREE.PixelFormatGPU
      default:
        return null // Let Three.js use its default
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Mark frame complete.
   *
   * Call this after processing all resources for a frame.
   * Currently a no-op but kept for API consistency and future use.
   */
  endFrame(): void {
    // No-op - resize is now handled lazily per-resource via dimensionsChanged check
  }

  // Pre-allocated arrays for invalidateFramebuffer to avoid per-frame allocation
  // WebGL constants: COLOR_ATTACHMENT0 = 0x8CE0, DEPTH_ATTACHMENT = 0x8D00
  private static readonly INVALIDATE_COLOR_1 = [0x8ce0]
  private static readonly INVALIDATE_COLOR_2 = [0x8ce0, 0x8ce1]
  private static readonly INVALIDATE_COLOR_3 = [0x8ce0, 0x8ce1, 0x8ce2]
  private static readonly INVALIDATE_COLOR_4 = [0x8ce0, 0x8ce1, 0x8ce2, 0x8ce3]
  private static readonly INVALIDATE_DEPTH = [0x8d00]

  /**
   * Invalidate non-persistent framebuffers for TBDR GPU optimization.
   *
   * On Tile-Based Deferred Rendering GPUs (Apple, Mali, Adreno, PowerVR),
   * this signals that intermediate render target data can be discarded,
   * allowing the GPU to skip expensive tile store operations to main memory.
   *
   * @param renderer - The Three.js WebGL renderer
   * @param pingPongResources - Set of resource IDs that need ping-pong (skip these)
   */
  invalidateFramebuffers(renderer: THREE.WebGLRenderer, pingPongResources: Set<string>): void {
    const gl = renderer.getContext() as WebGL2RenderingContext

    // Check WebGL2 availability - invalidateFramebuffer is WebGL2 only
    if (!gl.invalidateFramebuffer) return

    for (const [id, entry] of this.resources) {
      // Skip ping-pong resources (need frame-to-frame history)
      if (pingPongResources.has(id)) continue

      // Skip persistent resources (temporal effects)
      if (entry.config.persistent) continue

      // Skip unallocated resources
      if (!entry.target) continue

      // Get Three.js internal framebuffer handle
      // Three.js stores WebGL objects in renderer.properties (internal API)
      const props = renderer.properties.get(entry.target) as
        | { __webglFramebuffer?: WebGLFramebuffer }
        | undefined
      const framebuffer = props?.__webglFramebuffer
      if (!framebuffer) continue

      // Bind framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)

      // Invalidate all color attachments (MRT targets may have 2-4)
      const attachmentCount = entry.config.attachmentCount ?? 1
      const colorAttachments =
        attachmentCount === 1
          ? ResourcePool.INVALIDATE_COLOR_1
          : attachmentCount === 2
            ? ResourcePool.INVALIDATE_COLOR_2
            : attachmentCount === 3
              ? ResourcePool.INVALIDATE_COLOR_3
              : ResourcePool.INVALIDATE_COLOR_4
      gl.invalidateFramebuffer(gl.FRAMEBUFFER, colorAttachments)

      // Also invalidate depth if present
      if (entry.config.depthBuffer || entry.config.depthTexture) {
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, ResourcePool.INVALIDATE_DEPTH)
      }
    }

    // Restore null binding to prevent state leakage
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /**
   * Dispose a single entry's GPU resources.
   * @param entry
   */
  private disposeEntry(entry: ResourceEntry): void {
    entry.target?.dispose()
    entry.swapTarget?.dispose()
    entry.target = null
    entry.swapTarget = null
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const entry of this.resources.values()) {
      this.disposeEntry(entry)
    }
    this.resources.clear()
  }

  /**
   * Handle WebGL context loss.
   *
   * Nulls out GPU resources without disposing (they're already gone).
   */
  invalidateForContextLoss(): void {
    for (const entry of this.resources.values()) {
      // Don't dispose - GPU resources are already gone
      entry.target = null
      entry.swapTarget = null
      entry.lastWidth = 0
      entry.lastHeight = 0
    }
  }

  /**
   * Reinitialize after context restoration.
   *
   * Resources will be recreated on next access.
   */
  reinitialize(): void {
    // Resources will be recreated lazily on next get()
    // The per-resource dimensionsChanged check handles this automatically
    // since lastWidth/lastHeight are reset by invalidateForContextLoss()
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get estimated VRAM usage in bytes.
   * @returns VRAM usage in bytes
   */
  getVRAMUsage(): number {
    let total = 0

    for (const entry of this.resources.values()) {
      if (!entry.target) continue

      const { width, height } = this.computeDimensions(entry.config.size)
      const bytesPerPixel = this.getBytesPerPixel(entry.config)
      const attachments = entry.config.attachmentCount ?? 1

      let size = width * height * bytesPerPixel * attachments

      // Add depth buffer if present
      if (entry.config.depthBuffer) {
        size += width * height * 4 // Assume 32-bit depth
      }

      // Double for ping-pong
      if (entry.swapTarget) {
        size *= 2
      }

      total += size
    }

    return total
  }

  /**
   * Get bytes per pixel for a resource config.
   * @param config - Resource configuration
   * @returns Bytes per pixel
   */
  private getBytesPerPixel(config: RenderResourceConfig): number {
    const dataType = config.dataType ?? THREE.UnsignedByteType

    switch (dataType) {
      case THREE.FloatType:
        return 16 // RGBA32F
      case THREE.HalfFloatType:
        return 8 // RGBA16F
      case THREE.UnsignedByteType:
      default:
        return 4 // RGBA8
    }
  }

  /**
   * Get list of registered resource IDs.
   * @returns Array of resource IDs
   */
  getResourceIds(): string[] {
    return Array.from(this.resources.keys())
  }

  /**
   * Get resource configuration.
   * @param id - Resource identifier
   * @returns Resource configuration or undefined
   */
  getConfig(id: string): RenderResourceConfig | undefined {
    return this.resources.get(id)?.config
  }

  /**
   * Get dimensions of all allocated resources.
   * Returns a map of resource IDs to their current dimensions.
   * Useful for performance monitoring and debugging.
   * @returns Map of resource IDs to dimensions
   */
  getResourceDimensions(): Map<string, { width: number; height: number }> {
    const result = new Map<string, { width: number; height: number }>()

    for (const [id, entry] of this.resources.entries()) {
      if (entry.target) {
        result.set(id, {
          width: entry.target.width,
          height: entry.target.height,
        })
      }
    }

    return result
  }
}
