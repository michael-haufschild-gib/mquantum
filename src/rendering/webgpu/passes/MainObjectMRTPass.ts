/**
 * WebGPU Main Object MRT Pass
 *
 * Coordinates Multiple Render Target (MRT) output for the main object layer.
 * This pass manages the render target configuration for scene rendering
 * that outputs to multiple buffers (color, normal, depth, position) in a single pass.
 *
 * ## WebGPU Architecture Notes
 *
 * Unlike the WebGL version which directly calls renderer.render(), this WebGPU
 * version integrates with the WebGPU render graph architecture where:
 * - Scene rendering is handled by dedicated renderer passes (e.g., MandelbulbRenderer)
 * - This pass provides MRT target coordination and state management
 * - Material opacity forcing is handled differently in WebGPU pipelines
 *
 * ## MRT Output Layout
 *
 * | Location | Content              | Format       | Description                    |
 * |----------|----------------------|--------------|--------------------------------|
 * | 0        | Color                | rgba16float  | HDR scene color                |
 * | 1        | Normal               | rgba16float  | World-space normals (encoded)  |
 * | 2        | Depth                | r32float     | Linear depth                   |
 * | 3        | Position             | rgba16float  | World-space position           |
 *
 * ## Usage
 *
 * This pass is typically used in conjunction with object renderers that
 * output to MRT. It configures the render pass with the appropriate
 * color attachments and manages layer-based visibility.
 *
 * @module rendering/webgpu/passes/MainObjectMRTPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext, WebGPUResourceAccess } from '../core/types'

/**
 * Configuration for a single MRT attachment.
 */
export interface MRTAttachmentConfig {
  /** Resource ID for this attachment */
  resourceId: string
  /** Clear color (RGBA) - default: [0, 0, 0, 0] */
  clearValue?: { r: number; g: number; b: number; a: number }
  /** Load operation - default: 'clear' */
  loadOp?: 'load' | 'clear'
  /** Store operation - default: 'store' */
  storeOp?: 'store' | 'discard'
}

/**
 * Configuration for MainObjectMRTPass.
 */
export interface MainObjectMRTPassConfig {
  /** Pass identifier (default: 'main-object-mrt') */
  id?: string
  /** Pass name for debugging */
  name?: string
  /** Priority in render graph (default: 50) */
  priority?: number
  /** MRT color attachments configuration */
  attachments: MRTAttachmentConfig[]
  /** Depth attachment resource ID (optional) */
  depthAttachment?: string
  /** Layers to render (null = all layers) */
  layers?: number[]
  /** Whether to clear depth buffer */
  clearDepth?: boolean
  /** Depth clear value (default: 1.0) */
  depthClearValue?: number
}

/**
 * WebGPU Main Object MRT Pass.
 *
 * Manages MRT output configuration for scene rendering passes.
 * Coordinates multiple color attachments and depth buffer for
 * deferred rendering techniques.
 *
 * @example
 * ```typescript
 * const mrtPass = new MainObjectMRTPass({
 *   attachments: [
 *     { resourceId: 'hdr-color', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
 *     { resourceId: 'normal-buffer', clearValue: { r: 0.5, g: 0.5, b: 1.0, a: 0 } },
 *     { resourceId: 'position-buffer', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
 *   ],
 *   depthAttachment: 'depth-buffer',
 *   layers: [0], // Main object layer
 * });
 * ```
 */
export class MainObjectMRTPass extends WebGPUBasePass {
  private passConfig: MainObjectMRTPassConfig

  // Layer configuration
  private layers: number[] | null

  // Clear configuration
  private clearDepth: boolean
  private depthClearValue: number

  /**
   * Whether the material cache needs rebuilding.
   * Used to track material state for opacity forcing.
   */
  private needsCacheRebuild = true

  constructor(config: MainObjectMRTPassConfig) {
    // Build resource access declarations
    const outputs: WebGPUResourceAccess[] = config.attachments.map((attachment, index) => ({
      resourceId: attachment.resourceId,
      access: 'write' as const,
      binding: index,
    }))

    // Add depth attachment as output if specified
    if (config.depthAttachment) {
      outputs.push({
        resourceId: config.depthAttachment,
        access: 'write' as const,
        binding: outputs.length,
      })
    }

    super({
      id: config.id ?? 'main-object-mrt',
      name: config.name ?? 'Main Object MRT Pass',
      priority: config.priority ?? 50,
      inputs: [],
      outputs,
    })

    this.passConfig = config
    this.layers = config.layers ?? null
    this.clearDepth = config.clearDepth ?? true
    this.depthClearValue = config.depthClearValue ?? 1.0
  }

  /**
   * Create pass resources.
   * This pass doesn't create its own pipeline - it configures render pass
   * for other renderers that handle the actual scene drawing.
   *
   * @param _ctx - Setup context (unused - no pipeline creation needed)
   */
  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // MainObjectMRTPass doesn't create its own render pipeline.
    // It provides MRT configuration for object renderers that do the actual drawing.
    // Pipeline creation is handled by the specific object renderers
    // (e.g., MandelbulbRenderer, PolytopeRenderer) that output to MRT.
  }

  /**
   * Execute the MRT pass.
   *
   * This method configures and begins the render pass with MRT attachments.
   * Object renderers can then use this configuration to draw scene content.
   *
   * Note: In the current architecture, actual scene rendering is handled by
   * dedicated renderer passes. This pass provides the MRT coordination layer.
   *
   * @param ctx - WebGPU render context
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device) {
      return
    }

    // Reset cache rebuild flag after processing
    if (this.needsCacheRebuild) {
      this.needsCacheRebuild = false
    }

    // Build color attachments array
    const colorAttachments: {
      view: GPUTextureView
      loadOp: 'clear' | 'load'
      storeOp: 'store' | 'discard'
      clearValue: { r: number; g: number; b: number; a: number }
    }[] = []

    for (const attachment of this.passConfig.attachments) {
      const view = ctx.getWriteTarget(attachment.resourceId)
      if (!view) {
        console.warn(`MainObjectMRTPass: Missing output target ${attachment.resourceId}`)
        continue
      }

      const clearValue = attachment.clearValue ?? { r: 0, g: 0, b: 0, a: 0 }
      const loadOp = attachment.loadOp === 'load' ? 'load' : 'clear'
      const storeOp = attachment.storeOp === 'discard' ? 'discard' : 'store'

      colorAttachments.push({
        view,
        loadOp,
        storeOp,
        clearValue,
      })
    }

    if (colorAttachments.length === 0) {
      console.warn('MainObjectMRTPass: No valid color attachments')
      return
    }

    // Build render pass descriptor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderPassDescriptor: any = {
      label: `${this.id}-render`,
      colorAttachments,
    }

    // Add depth attachment if configured
    if (this.passConfig.depthAttachment) {
      const depthView = ctx.getWriteTarget(this.passConfig.depthAttachment)
      if (depthView) {
        renderPassDescriptor.depthStencilAttachment = {
          view: depthView,
          depthLoadOp: this.clearDepth ? 'clear' : 'load',
          depthStoreOp: 'store' as const,
          depthClearValue: this.depthClearValue,
        }
      }
    }

    // Begin render pass
    // Note: In a full implementation, this would coordinate with object
    // renderers to draw the scene. For now, we begin and immediately end
    // the pass to clear the targets to their initial values.
    const passEncoder = ctx.beginRenderPass(renderPassDescriptor)

    // End pass - actual scene rendering is handled by dedicated renderers
    // that may create their own render passes or integrate with this one
    passEncoder.end()
  }

  /**
   * Get the configured layer mask.
   * @returns Array of layer indices or null for all layers
   */
  getLayers(): number[] | null {
    return this.layers
  }

  /**
   * Update which layers are rendered.
   * Also invalidates the material cache since layer filtering affects cached materials.
   *
   * @param layers - The layers to render (null for all layers)
   */
  setLayers(layers: number[] | null): void {
    this.layers = layers
    this.invalidateCache()
  }

  /**
   * Check if a specific layer is enabled for rendering.
   * @param layer - Layer index to check
   * @returns True if layer is enabled
   */
  isLayerEnabled(layer: number): boolean {
    if (this.layers === null) {
      return true // All layers enabled
    }
    return this.layers.includes(layer)
  }

  /**
   * Invalidate the material cache.
   * Call this when scene structure changes (object type change, geometry recreation).
   * The cache will be rebuilt on the next execute() call.
   */
  invalidateCache(): void {
    this.needsCacheRebuild = true
  }

  /**
   * Get the MRT attachment configuration.
   * Useful for other passes that need to know the MRT layout.
   * @returns Array of attachment configurations
   */
  getAttachmentConfigs(): readonly MRTAttachmentConfig[] {
    return this.passConfig.attachments
  }

  /**
   * Get the number of color attachments.
   * @returns Number of MRT color attachments
   */
  getAttachmentCount(): number {
    return this.passConfig.attachments.length
  }

  /**
   * Get the depth attachment resource ID if configured.
   * @returns Depth attachment resource ID or undefined
   */
  getDepthAttachmentId(): string | undefined {
    return this.passConfig.depthAttachment
  }

  /**
   * Create a render pass descriptor for external use.
   * Other renderers can use this to get the MRT configuration.
   *
   * @param ctx - Render context
   * @returns Render pass descriptor or null if configuration fails
   */
  createRenderPassDescriptor(ctx: WebGPURenderContext) {
    const colorAttachments: {
      view: GPUTextureView
      loadOp: 'clear' | 'load'
      storeOp: 'store' | 'discard'
      clearValue: { r: number; g: number; b: number; a: number }
    }[] = []

    for (const attachment of this.passConfig.attachments) {
      const view = ctx.getWriteTarget(attachment.resourceId)
      if (!view) {
        return null
      }

      const clearValue = attachment.clearValue ?? { r: 0, g: 0, b: 0, a: 0 }
      const loadOp = attachment.loadOp === 'load' ? 'load' : 'clear'
      const storeOp = attachment.storeOp === 'discard' ? 'discard' : 'store'

      colorAttachments.push({
        view,
        loadOp,
        storeOp,
        clearValue,
      })
    }

    // Build descriptor with optional depth attachment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const descriptor: any = {
      label: `${this.id}-external`,
      colorAttachments,
    }

    if (this.passConfig.depthAttachment) {
      const depthView = ctx.getWriteTarget(this.passConfig.depthAttachment)
      if (depthView) {
        descriptor.depthStencilAttachment = {
          view: depthView,
          depthLoadOp: this.clearDepth ? 'clear' : 'load',
          depthStoreOp: 'store' as const,
          depthClearValue: this.depthClearValue,
        }
      }
    }

    return descriptor
  }

  /**
   * Get color formats for pipeline creation.
   * Object renderers need this to create compatible render pipelines.
   *
   * @param defaultFormat - Default format if not specified (usually canvas format)
   * @returns Array of texture formats for each color attachment
   */
  getColorFormats(defaultFormat = 'rgba16float') {
    // Return format for each attachment
    // In a full implementation, this would read from resource configuration
    return this.passConfig.attachments.map(() => defaultFormat)
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    this.needsCacheRebuild = true
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.needsCacheRebuild = true
    super.dispose()
  }
}

/**
 * Helper type for MRT pipeline creation.
 * Object renderers use this to configure their fragment outputs.
 */
export interface MRTPipelineConfig {
  /** Color target formats */
  colorFormats: string[]
  /** Depth format (if using depth) */
  depthFormat?: string
  /** Sample count for MSAA */
  sampleCount?: number
}

/**
 * Create MRT pipeline configuration from MainObjectMRTPass.
 *
 * @param pass - The MRT pass
 * @param colorFormat - Default color format
 * @returns Pipeline configuration
 */
export function createMRTPipelineConfig(
  pass: MainObjectMRTPass,
  colorFormat = 'rgba16float'
): MRTPipelineConfig {
  return {
    colorFormats: pass.getColorFormats(colorFormat),
    depthFormat: pass.getDepthAttachmentId() ? 'depth32float' : undefined,
    sampleCount: 1,
  }
}
