/* global GPUTextureFormat */
/**
 * WebGPU Temporal Position Capture Pass
 *
 * Captures position buffer (world position + model-space ray distance) into a
 * temporal buffer for raymarching acceleration. Uses position-based reprojection
 * instead of depth-only to correctly handle camera rotation.
 *
 * Key improvement over depth-only approach:
 * - position.xyz = actual world position (for accurate reprojection)
 * - position.w = model-space ray distance (for direct use in raymarcher)
 *
 * @module rendering/webgpu/passes/TemporalDepthCapturePass
 */

import { usePerformanceStore } from '@/stores/performanceStore'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

// =============================================================================
// Temporal Depth Uniforms Interface
// =============================================================================

/**
 *
 */
export interface TemporalDepthUniforms {
  /** Previous frame's position texture (xyz=world pos, w=model-space ray distance) */
  prevPositionTexture: GPUTextureView | null
  /** Previous frame's view-projection matrix (16 floats) */
  prevViewProjectionMatrix: Float32Array
  /** Previous frame's inverse view-projection matrix (16 floats) */
  prevInverseViewProjectionMatrix: Float32Array
  /** Whether temporal reprojection is enabled and valid */
  temporalEnabled: boolean
  /** Buffer resolution for UV calculation */
  depthBufferResolution: [number, number]
}

// =============================================================================
// Pass Configuration
// =============================================================================

/**
 *
 */
export interface TemporalDepthCapturePassConfig {
  /** Position input resource ID (MRT with gPosition) */
  positionInput: string
  /** Output resource ID */
  outputResource: string
  /** Force capture even when temporal reprojection is disabled */
  forceCapture?: () => boolean
}

// =============================================================================
// Position Copy Shader (WGSL)
// =============================================================================

/**
 * Simple shader to copy position data from MRT to temporal buffer.
 * Just passes through the RGBA data (xyz=world pos, w=model-space distance).
 */
const POSITION_COPY_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tPosition: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  // Direct copy of position data (xyz=world pos, w=model-space ray distance)
  return textureSample(tPosition, texSampler, input.uv);
}
`

// =============================================================================
// Global Registry for Invalidation
// =============================================================================

/** Registry of all active TemporalDepthCapturePass instances for global invalidation */
const instanceRegistry = new Set<TemporalDepthCapturePass>()

/**
 * Invalidate all registered WebGPU TemporalDepthCapturePass instances.
 * Called when global state changes require resetting temporal data.
 */
export function invalidateAllTemporalDepthWebGPU(): void {
  instanceRegistry.forEach((instance) => {
    instance.invalidate()
  })
}

// =============================================================================
// Pass Implementation
// =============================================================================

/**
 * Captures position data into a temporal buffer for raymarching acceleration.
 *
 * Self-contained state management (like FrameBlendingPass):
 * - Tracks previous frame's camera matrices internally
 * - Exposes getTemporalUniforms() for shader uniform binding
 * - Manages internal history buffer with automatic resize
 *
 * Position-based approach benefits:
 * - Correct reprojection during camera rotation (uses actual world position)
 * - Direct model-space ray distance (no world-to-local conversion needed)
 */
export class TemporalDepthCapturePass extends WebGPUBasePass {
  private passConfig: TemporalDepthCapturePassConfig
  private forceCapture?: () => boolean

  // Pipeline resources
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null

  // Internal history buffer (ping-pong)
  private historyTexture: GPUTexture | null = null
  private historyView: GPUTextureView | null = null
  private lastWidth = 0
  private lastHeight = 0

  // Texture format for history buffer (float16 for position data)
  private textureFormat: GPUTextureFormat = 'rgba16float'

  // Internal state for temporal reprojection
  private hasValidHistory = false
  private prevViewProjectionMatrix = new Float32Array(16)
  private prevInverseViewProjectionMatrix = new Float32Array(16)
  private resolution: [number, number] = [1, 1]

  // Temp matrices to avoid per-frame allocations
  private tempViewProjMatrix = new Float32Array(16)
  private tempInverseViewProjMatrix = new Float32Array(16)

  // Cached bind group for position copy
  private copyBindGroup: GPUBindGroup | null = null
  private copyBindGroupPositionView: GPUTextureView | null = null

  constructor(config: TemporalDepthCapturePassConfig) {
    super({
      id: 'temporal-depth-capture',
      priority: 50, // Early in post-processing chain
      inputs: [{ resourceId: config.positionInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.forceCapture = config.forceCapture

    // Initialize identity matrices
    this.setIdentityMatrix(this.prevViewProjectionMatrix)
    this.setIdentityMatrix(this.prevInverseViewProjectionMatrix)

    // Register for global invalidation
    instanceRegistry.add(this)
  }

  /**
   * Set a Float32Array to identity matrix.
   * @param matrix
   */
  private setIdentityMatrix(matrix: Float32Array): void {
    matrix.fill(0)
    matrix[0] = 1
    matrix[5] = 1
    matrix[10] = 1
    matrix[15] = 1
  }

  /**
   * Multiply two 4x4 matrices: result = a * b
   * @param result
   * @param a
   * @param b
   */
  private multiplyMatrices(result: Float32Array, a: Float32Array, b: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0
        for (let k = 0; k < 4; k++) {
          sum += a[i * 4 + k]! * b[k * 4 + j]!
        }
        result[i * 4 + j] = sum
      }
    }
  }

  /**
   * Invert a 4x4 matrix in-place using Gauss-Jordan elimination.
   * @param result
   * @param m
   */
  private invertMatrix(result: Float32Array, m: Float32Array): boolean {
    const augmented = new Float32Array(32)

    // Build augmented matrix [M | I]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        augmented[i * 8 + j] = m[i * 4 + j]!
        augmented[i * 8 + j + 4] = i === j ? 1 : 0
      }
    }

    // Gauss-Jordan elimination
    for (let col = 0; col < 4; col++) {
      // Find pivot
      let maxRow = col
      for (let row = col + 1; row < 4; row++) {
        if (Math.abs(augmented[row * 8 + col]!) > Math.abs(augmented[maxRow * 8 + col]!)) {
          maxRow = row
        }
      }

      // Swap rows
      if (maxRow !== col) {
        for (let j = 0; j < 8; j++) {
          const temp = augmented[col * 8 + j]!
          augmented[col * 8 + j] = augmented[maxRow * 8 + j]!
          augmented[maxRow * 8 + j] = temp
        }
      }

      // Check for singular matrix
      const pivot = augmented[col * 8 + col]!
      if (Math.abs(pivot) < 1e-10) {
        return false
      }

      // Scale pivot row
      for (let j = 0; j < 8; j++) {
        augmented[col * 8 + j]! /= pivot
      }

      // Eliminate column
      for (let row = 0; row < 4; row++) {
        if (row !== col) {
          const factor = augmented[row * 8 + col]!
          for (let j = 0; j < 8; j++) {
            augmented[row * 8 + j]! -= factor * augmented[col * 8 + j]!
          }
        }
      }
    }

    // Extract inverse
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = augmented[i * 8 + j + 4]!
      }
    }

    return true
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Always use rgba16float for position data (high precision required)
    // Don't use canvas format - position data needs float precision
    this.textureFormat = 'rgba16float'

    // Create bind group layout for position copy
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-depth-capture-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(
      device,
      POSITION_COPY_SHADER,
      'temporal-depth-capture-fragment'
    )

    // Create pipeline - use rgba16float for position data output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      this.textureFormat,
      { label: 'temporal-depth-capture' }
    )

    // Create sampler (nearest filtering for position data)
    this.sampler = device.createSampler({
      label: 'temporal-depth-capture-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Create or resize the internal history buffer.
   * @param device
   * @param width
   * @param height
   */
  private ensureHistoryBuffer(device: GPUDevice, width: number, height: number): void {
    if (this.historyTexture && this.lastWidth === width && this.lastHeight === height) {
      return
    }

    // Dispose old buffer
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }

    // Create new texture matching output size
    this.historyTexture = device.createTexture({
      label: 'temporal-depth-capture-history',
      size: { width, height },
      format: this.textureFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST,
    })

    this.historyView = this.historyTexture.createView({
      label: 'temporal-depth-capture-history-view',
    })

    this.lastWidth = width
    this.lastHeight = height
    this.hasValidHistory = false
    this.copyBindGroup = null
    this.copyBindGroupPositionView = null
  }

  /**
   * Check if temporal reprojection is enabled in settings.
   */
  isEnabled(): boolean {
    return usePerformanceStore.getState().temporalReprojectionEnabled
  }

  /**
   * Get the output resource ID for this pass.
   * Used by external code to get the texture from the graph.
   */
  getOutputResourceId(): string {
    return this.passConfig.outputResource
  }

  /**
   * Get temporal uniforms for shader binding.
   *
   * The mesh's useFrame calls this BEFORE graph.execute(), which is correct:
   * - Before execute: READ texture = last frame's data, matrices = last frame's matrices
   * - Both are synchronized from the same frame
   *
   * @returns Uniforms for temporal reprojection shaders
   */
  getTemporalUniforms(): TemporalDepthUniforms {
    const enabled = this.isEnabled() && this.hasValidHistory

    return {
      // Position texture (xyz=world pos, w=model-space ray distance)
      prevPositionTexture: enabled && this.historyView ? this.historyView : null,
      prevViewProjectionMatrix: this.prevViewProjectionMatrix,
      prevInverseViewProjectionMatrix: this.prevInverseViewProjectionMatrix,
      temporalEnabled: enabled && this.historyView !== null,
      depthBufferResolution: this.resolution,
    }
  }

  /**
   * Invalidate temporal data.
   * Call when scene changes drastically (dimension change, object type change, etc.)
   */
  invalidate(): void {
    this.hasValidHistory = false
    this.setIdentityMatrix(this.prevViewProjectionMatrix)
    this.setIdentityMatrix(this.prevInverseViewProjectionMatrix)
  }

  /**
   * Execute the temporal depth capture pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.passBindGroupLayout || !this.sampler) {
      return
    }

    // Get input position texture
    const positionView = ctx.getTextureView(this.passConfig.positionInput)
    if (!positionView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return
    const outputTexture = ctx.getTexture(this.passConfig.outputResource)

    const force = this.forceCapture ? this.forceCapture() : false

    // Skip if disabled (unless forced)
    if (!force && !this.isEnabled()) {
      this.hasValidHistory = false
      return
    }

    // Update resolution
    this.resolution = [ctx.size.width, ctx.size.height]

    // Ensure history buffer exists at correct size
    this.ensureHistoryBuffer(this.device, ctx.size.width, ctx.size.height)

    if (!this.historyView) return

    if (!this.copyBindGroup || this.copyBindGroupPositionView !== positionView) {
      this.copyBindGroup = this.device.createBindGroup({
        label: 'temporal-depth-capture-copy-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: positionView },
        ],
      })
      this.copyBindGroupPositionView = positionView
    }

    // Copy position data to output
    const outputPassEncoder = ctx.beginRenderPass({
      label: 'temporal-depth-capture-to-output',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(outputPassEncoder, this.renderPipeline, [this.copyBindGroup!])
    outputPassEncoder.end()

    // Copy output into history for next frame.
    // Prefer GPU texture copy to avoid a second fullscreen draw pass.
    if (outputTexture && this.historyTexture) {
      ctx.encoder.copyTextureToTexture(
        { texture: outputTexture },
        { texture: this.historyTexture },
        { width: ctx.size.width, height: ctx.size.height }
      )
    } else {
      const historyPassEncoder = ctx.beginRenderPass({
        label: 'temporal-depth-capture-to-history',
        colorAttachments: [
          {
            view: this.historyView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(historyPassEncoder, this.renderPipeline, [this.copyBindGroup!])
      historyPassEncoder.end()
    }

    // Update camera matrices for next frame
    // Get camera data from stores (consistent with other passes)
    const camera = ctx.frame?.stores?.['camera'] as {
      projectionMatrix?: { elements: number[] }
      viewMatrix?: { elements: number[] }
      matrixWorldInverse?: { elements: number[] }
    }

    // Get view matrix - prefer viewMatrix, fallback to matrixWorldInverse
    const viewMatrixElements = camera?.viewMatrix?.elements ?? camera?.matrixWorldInverse?.elements
    const projMatrixElements = camera?.projectionMatrix?.elements

    if (projMatrixElements && viewMatrixElements) {
      // Convert projection and view matrices to Float32Arrays
      const projMatrix = new Float32Array(16)
      const viewMatrix = new Float32Array(16)

      for (let i = 0; i < 16; i++) {
        projMatrix[i] = projMatrixElements[i] ?? 0
        viewMatrix[i] = viewMatrixElements[i] ?? 0
      }

      // Compute view-projection matrix
      this.multiplyMatrices(this.tempViewProjMatrix, projMatrix, viewMatrix)

      // Copy to previous matrices
      this.prevViewProjectionMatrix.set(this.tempViewProjMatrix)

      // Compute inverse
      this.invertMatrix(this.tempInverseViewProjMatrix, this.tempViewProjMatrix)
      this.prevInverseViewProjectionMatrix.set(this.tempInverseViewProjMatrix)
    }

    this.hasValidHistory = true
  }

  /**
   * Reset history buffer (e.g., on camera teleport or scene change).
   */
  resetHistory(): void {
    this.hasValidHistory = false
    this.copyBindGroup = null
    this.copyBindGroupPositionView = null
  }

  /**
   * Called when pass is re-enabled after being disabled.
   */
  onEnabled(): void {
    // Reset history when pass is re-enabled to avoid stale data
    this.hasValidHistory = false
    this.copyBindGroup = null
    this.copyBindGroupPositionView = null
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }
    this.hasValidHistory = false
    this.lastWidth = 0
    this.lastHeight = 0
    this.copyBindGroup = null
    this.copyBindGroupPositionView = null
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null

    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }
    this.copyBindGroup = null
    this.copyBindGroupPositionView = null

    // Unregister from global invalidation
    instanceRegistry.delete(this)

    super.dispose()
  }
}
