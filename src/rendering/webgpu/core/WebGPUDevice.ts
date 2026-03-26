/**
 * WebGPU Device Manager
 *
 * Handles WebGPU adapter/device initialization, capability detection,
 * and context management. Provides a singleton-like interface for
 * accessing the GPU device across the application.
 *
 * @module rendering/webgpu/core/WebGPUDevice
 */

import { logger } from '@/lib/logger'

import type { WebGPUCapabilities, WebGPUInitResult, WebGPUInitSuccess } from './types'

/** Internal type for raw init data (before wrapping with success flag) */
type WebGPUInitData = Omit<WebGPUInitSuccess, 'success'>

// =============================================================================
// Feature Detection
// =============================================================================

/**
 * Check if WebGPU is supported in the current environment.
 */
function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

// =============================================================================
// Device Manager
// =============================================================================

/**
 * WebGPU device manager singleton.
 *
 * Handles device initialization, loss recovery, and capability queries.
 *
 * WHY singleton:
 * A browser page has exactly one GPU adapter and one `GPUDevice`. Creating
 * multiple devices wastes VRAM, risks hitting adapter limits, and complicates
 * device-loss recovery (all passes must reference the same device). The singleton
 * enforces this 1:1 relationship. `resetForTesting()` provides test isolation
 * without the complexity of a factory or DI container.
 *
 * This was evaluated against alternatives:
 * - React Context: would couple the GPU layer to React, but render passes
 *   (non-React classes) also need device access.
 * - Factory function: callers would need to pass the device through every
 *   constructor, increasing coupling for no benefit since the instance is
 *   inherently global.
 */
export class WebGPUDevice {
  private static instance: WebGPUDevice | null = null

  private _adapter: GPUAdapter | null = null
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private format: GPUTextureFormat = 'bgra8unorm'
  private capabilities: WebGPUCapabilities | null = null
  private canvas: HTMLCanvasElement | null = null

  private deviceLostCallbacks: Set<(reason: string) => void> = new Set()
  private initPromise: Promise<WebGPUInitResult> | null = null

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): WebGPUDevice {
    if (!WebGPUDevice.instance) {
      WebGPUDevice.instance = new WebGPUDevice()
    }
    return WebGPUDevice.instance
  }

  /**
   * Reset the singleton for test isolation.
   * Drops the cached instance so the next `getInstance()` creates a fresh one.
   * Does NOT destroy the GPU device — call `dispose()` first if needed.
   */
  static resetForTesting(): void {
    WebGPUDevice.instance = null
  }

  /**
   * Initialize WebGPU with the given canvas.
   *
   * @param canvas - Canvas element to render to
   * @returns Initialization result
   * @throws Error if WebGPU is not supported or initialization fails
   */
  async initialize(canvas: HTMLCanvasElement): Promise<WebGPUInitResult> {
    // Return cached promise if already initializing/initialized
    if (this.initPromise && this.canvas === canvas) {
      return this.initPromise
    }

    this.canvas = canvas
    this.initPromise = this.doInitialize(canvas)
      .then((result) => ({
        success: true as const,
        ...result,
      }))
      .catch((error) => ({
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }))
    return this.initPromise
  }

  private async doInitialize(canvas: HTMLCanvasElement): Promise<WebGPUInitData> {
    if (!isWebGPUSupported()) {
      throw new Error('WebGPU is not supported in this browser')
    }

    // Request adapter with high-performance preference
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })

    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter')
    }

    // Query adapter capabilities (use synchronous .info property - requestAdapterInfo() was removed)
    const adapterInfo = adapter.info
    const adapterInfoString = `${adapterInfo.vendor} ${adapterInfo.architecture} ${adapterInfo.device}`

    // Request device with optional features (only those the adapter supports)
    const requiredFeatures: GPUFeatureName[] = []
    const optionalFeatures: GPUFeatureName[] = [
      'timestamp-query',
      'texture-compression-bc',
      'texture-compression-astc',
    ]
    for (const feature of optionalFeatures) {
      if (adapter.features.has(feature)) {
        requiredFeatures.push(feature)
      }
    }

    // Request maximum limits
    const device = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxUniformBufferBindingSize: adapter.limits.maxUniformBufferBindingSize,
        maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
        maxComputeWorkgroupSizeY: adapter.limits.maxComputeWorkgroupSizeY,
        maxComputeWorkgroupSizeZ: adapter.limits.maxComputeWorkgroupSizeZ,
        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
        maxBindGroups: adapter.limits.maxBindGroups,
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      },
    })

    // Handle device loss
    device.lost.then((info) => {
      logger.error('WebGPU device lost:', info.message, 'reason:', info.reason)
      this.handleDeviceLost(info.reason)
    })

    // Configure canvas context
    const context = canvas.getContext('webgpu')
    if (!context) {
      throw new Error('Failed to get WebGPU canvas context')
    }

    // Use preferred format (usually bgra8unorm on most platforms)
    const format = navigator.gpu.getPreferredCanvasFormat()

    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
      // Required for screenshot capture via copyTextureToBuffer from the swapchain texture.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    })

    // Store capabilities
    const capabilities: WebGPUCapabilities = {
      maxTextureDimension2D: device.limits.maxTextureDimension2D,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxUniformBufferBindingSize: device.limits.maxUniformBufferBindingSize,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: device.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: device.limits.maxComputeWorkgroupSizeZ,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      maxBindGroups: device.limits.maxBindGroups,
      timestampQuery: requiredFeatures.includes('timestamp-query'),
      adapterInfo: adapterInfoString,
    }

    // Store references
    this._adapter = adapter
    this.device = device
    this.context = context
    this.format = format
    this.capabilities = capabilities

    logger.log('[WebGPU] Initialized:', {
      adapter: adapterInfoString,
      format,
      timestampQuery: requiredFeatures.includes('timestamp-query'),
    })

    return { adapter, device, context, format, capabilities }
  }

  private handleDeviceLost(reason: string): void {
    this.device = null
    this.context = null
    this.initPromise = null

    // Notify all registered callbacks
    this.deviceLostCallbacks.forEach((callback) => {
      try {
        callback(reason)
      } catch (e) {
        logger.error('Error in device lost callback:', e)
      }
    })

    // Attempt automatic recovery
    if (this.canvas && reason !== 'destroyed') {
      logger.log('[WebGPU] Attempting device recovery...')
      this.initialize(this.canvas).catch((err) => {
        logger.error('[WebGPU] Recovery failed:', err)
      })
    }
  }

  /**
   * Register a callback for device loss events.
   * @param callback
   */
  onDeviceLost(callback: (reason: string) => void): () => void {
    this.deviceLostCallbacks.add(callback)
    return () => this.deviceLostCallbacks.delete(callback)
  }

  /**
   * Get the GPU adapter.
   * @throws Error if adapter is not available
   */
  getAdapter(): GPUAdapter {
    if (!this._adapter) {
      throw new Error('WebGPU adapter not available')
    }
    return this._adapter
  }

  /**
   * Get the GPU device.
   * @throws Error if device is not initialized
   */
  getDevice(): GPUDevice {
    if (!this.device) {
      throw new Error('WebGPU device not initialized')
    }
    return this.device
  }

  /**
   * Get the canvas context.
   * @throws Error if context is not initialized
   */
  getContext(): GPUCanvasContext {
    if (!this.context) {
      throw new Error('WebGPU context not initialized')
    }
    return this.context
  }

  /**
   * Get the preferred texture format.
   */
  getFormat(): GPUTextureFormat {
    return this.format
  }

  /**
   * Get device capabilities.
   */
  getCapabilities(): WebGPUCapabilities | null {
    return this.capabilities
  }

  /**
   * Check if device is initialized and valid.
   */
  isReady(): boolean {
    return this.device !== null && this.context !== null
  }

  /**
   * Get the current canvas texture for rendering.
   */
  getCurrentTexture(): GPUTexture {
    if (!this.context) {
      throw new Error('WebGPU context not initialized')
    }
    return this.context.getCurrentTexture()
  }

  /**
   * Destroy the device and release resources.
   */
  destroy(): void {
    this.context?.unconfigure()
    this.device?.destroy()

    this._adapter = null
    this.device = null
    this.context = null
    this.canvas = null
    this.initPromise = null
    this.capabilities = null
    this.deviceLostCallbacks.clear()

    WebGPUDevice.instance = null
  }
}
