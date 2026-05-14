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

import { buildWebGPUDeviceDescriptor, requestsWebGPUFeature } from './deviceDescriptor'
import {
  type WebGPUCapabilities,
  WebGPUInitError,
  type WebGPUInitErrorCode,
  type WebGPUInitResult,
  type WebGPUInitSuccess,
} from './types'

/** Internal type for raw init data (before wrapping with success flag) */
type WebGPUInitData = Omit<WebGPUInitSuccess, 'success'>

// =============================================================================
// Feature Detection
// =============================================================================

/**
 * Check if WebGPU is supported in the current environment.
 */
function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.gpu?.requestAdapter === 'function'
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
  private initGeneration = 0

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

    const generation = this.initGeneration + 1
    this.initGeneration = generation
    this.canvas = canvas
    this.initPromise = this.doInitialize(canvas)
      .then((result) => {
        if (!this.isCurrentInitialization(canvas, generation)) {
          this.destroyInitializationResult(result)
          throw new WebGPUInitError(
            'INTERNAL_ERROR',
            'WebGPU initialization was superseded by a newer canvas'
          )
        }

        this.publishInitialization(canvas, result, generation)
        return {
          success: true as const,
          ...result,
        }
      })
      .catch((error) => {
        // `WebGPUInitError` carries an explicit failure code from the
        // throw site so the boundary doesn't have to string-match. Any
        // other thrown error collapses to `INTERNAL_ERROR`.
        const code: WebGPUInitErrorCode =
          error instanceof WebGPUInitError ? error.code : 'INTERNAL_ERROR'
        const message = error instanceof Error ? error.message : String(error)
        return {
          success: false as const,
          code,
          error: message,
          ...(error !== undefined && error !== null ? { cause: error } : {}),
        }
      })
    return this.initPromise
  }

  private isCurrentInitialization(canvas: HTMLCanvasElement, generation: number): boolean {
    return this.initGeneration === generation && this.canvas === canvas
  }

  private destroyInitializationResult(result: WebGPUInitData): void {
    try {
      result.context.unconfigure()
    } catch (cleanupError) {
      logger.warn('[WebGPU] Failed to unconfigure superseded context:', cleanupError)
    }

    try {
      result.device.destroy()
    } catch (cleanupError) {
      logger.warn('[WebGPU] Failed to destroy superseded device:', cleanupError)
    }
  }

  private publishInitialization(
    canvas: HTMLCanvasElement,
    result: WebGPUInitData,
    generation: number
  ): void {
    this._adapter = result.adapter
    this.device = result.device
    this.context = result.context
    this.format = result.format
    this.capabilities = result.capabilities

    // Handle device loss after refs are published so a pre-resolved lost
    // promise cannot race with initialization and leave stale live refs.
    void result.device.lost.then((info) => {
      if (!this.isCurrentInitialization(canvas, generation) || this.device !== result.device) {
        return
      }
      logger.error('WebGPU device lost:', info.message, 'reason:', info.reason)
      this.handleDeviceLost(info.reason)
    })

    logger.log('[WebGPU] Initialized:', {
      adapter: result.capabilities.adapterInfo,
      format: result.format,
      timestampQuery: result.capabilities.timestampQuery,
    })
  }

  private async doInitialize(canvas: HTMLCanvasElement): Promise<WebGPUInitData> {
    if (!isWebGPUSupported()) {
      throw new WebGPUInitError('NO_NAVIGATOR_GPU', 'WebGPU is not supported in this browser')
    }

    // Request adapter with high-performance preference
    let adapter: GPUAdapter | null
    try {
      adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      })
    } catch (cause) {
      throw new WebGPUInitError(
        'ADAPTER_REQUEST_FAILED',
        'navigator.gpu.requestAdapter() threw',
        cause
      )
    }

    if (!adapter) {
      throw new WebGPUInitError(
        'ADAPTER_REQUEST_FAILED',
        'Failed to get WebGPU adapter (requestAdapter returned null)'
      )
    }

    // Query adapter capabilities (use synchronous .info property - requestAdapterInfo() was removed)
    const adapterInfo = adapter.info
    const adapterInfoString =
      [adapterInfo?.vendor, adapterInfo?.architecture, adapterInfo?.device]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ') || 'Unknown GPU Adapter'
    const deviceDescriptor = buildWebGPUDeviceDescriptor(adapter)

    // Request maximum limits
    let device: GPUDevice
    try {
      device = await adapter.requestDevice(deviceDescriptor)
    } catch (cause) {
      throw new WebGPUInitError(
        'DEVICE_REQUEST_FAILED',
        cause instanceof Error
          ? `adapter.requestDevice() rejected: ${cause.message}`
          : 'adapter.requestDevice() rejected',
        cause
      )
    }

    const destroyDeviceAfterInitFailure = () => {
      try {
        device.destroy()
      } catch (cleanupError) {
        logger.warn('[WebGPU] Failed to destroy device after init failure:', cleanupError)
      }
    }

    // Configure canvas context
    let context: GPUCanvasContext | null
    try {
      context = canvas.getContext('webgpu')
    } catch (cause) {
      destroyDeviceAfterInitFailure()
      throw new WebGPUInitError(
        'CONTEXT_CONFIGURE_FAILED',
        cause instanceof Error
          ? `canvas.getContext("webgpu") threw: ${cause.message}`
          : 'canvas.getContext("webgpu") threw',
        cause
      )
    }

    if (!context) {
      destroyDeviceAfterInitFailure()
      throw new WebGPUInitError(
        'CONTEXT_CONFIGURE_FAILED',
        'canvas.getContext("webgpu") returned null'
      )
    }

    // Use preferred format (usually bgra8unorm on most platforms)
    let format: GPUTextureFormat
    try {
      format = navigator.gpu.getPreferredCanvasFormat()
    } catch (cause) {
      destroyDeviceAfterInitFailure()
      throw cause
    }

    try {
      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
        // Required for screenshot capture via copyTextureToBuffer from the swapchain texture.
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      })
    } catch (cause) {
      destroyDeviceAfterInitFailure()
      throw new WebGPUInitError(
        'CONTEXT_CONFIGURE_FAILED',
        cause instanceof Error
          ? `GPUCanvasContext.configure() threw: ${cause.message}`
          : 'GPUCanvasContext.configure() threw',
        cause
      )
    }

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
      timestampQuery: requestsWebGPUFeature(deviceDescriptor, 'timestamp-query'),
      adapterInfo: adapterInfoString,
    }

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
      void this.initialize(this.canvas).then(
        (result) => {
          if (!result.success) {
            logger.error('[WebGPU] Recovery failed:', result.error)
          }
        },
        (err) => {
          logger.error('[WebGPU] Recovery failed:', err)
        }
      )
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
    this.initGeneration += 1
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

  /**
   * Destroy only when the provided canvas still owns this singleton.
   */
  destroyForCanvas(canvas: HTMLCanvasElement): boolean {
    if (this.canvas !== canvas) {
      return false
    }
    this.destroy()
    return true
  }
}
