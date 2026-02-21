/* global GPUBlendState */
/**
 * WebGPU Debug Overlay Pass
 *
 * Composites debug/gizmo elements onto the screen AFTER all post-processing.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Debug elements (light gizmos, transform controls, axis helpers) need to be
 * rendered on top of all post-processing effects. This pass composites
 * a pre-rendered debug texture onto the canvas using alpha blending.
 *
 * The debug texture should be rendered separately (e.g., by a light gizmo
 * renderer) and passed as a resource.
 *
 * @module rendering/webgpu/passes/DebugOverlayPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for DebugOverlayPass.
 */
export interface DebugOverlayPassConfig {
  /**
   * Input texture resource ID containing pre-rendered debug elements.
   * The texture should have transparent background where no debug content exists.
   * If not provided, the pass will be a no-op.
   */
  debugInput?: string

  /**
   * Whether to use premultiplied alpha for blending.
   * Controls the pipeline blend state (not the shader).
   * @default false
   */
  premultipliedAlpha?: boolean
}

/**
 * WGSL fragment shader for debug overlay compositing.
 *
 * Alpha blending mode (premultiplied vs standard) is controlled by the
 * pipeline blend state, not the shader — so the shader simply outputs
 * the sampled color.
 */
const DEBUG_OVERLAY_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tDebug: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let debugColor = textureSample(tDebug, texSampler, input.uv);

  // If fully transparent, discard to preserve underlying content
  if (debugColor.a < 0.001) {
    discard;
  }

  // Output as-is — the pipeline blend state handles premultiplied vs non-premultiplied
  return debugColor;
}
`

/**
 * WebGPU Debug Overlay Pass.
 *
 * Composites debug elements (gizmos, helpers) onto the screen after all
 * post-processing effects. Uses alpha blending to overlay debug content
 * on top of the existing canvas content.
 *
 * @example
 * ```typescript
 * const debugOverlay = new DebugOverlayPass({
 *   debugInput: 'debugTexture',
 * });
 *
 * // Add AFTER ToScreenPass in render graph
 * await graph.addPass(debugOverlay);
 * ```
 */
export class DebugOverlayPass extends WebGPUBasePass {
  private passConfig: DebugOverlayPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // PERF: Cached bind group
  private cachedBindGroup: GPUBindGroup | null = null
  private cachedDebugView: GPUTextureView | null = null

  // Configuration
  private premultipliedAlpha: boolean

  constructor(config: DebugOverlayPassConfig = {}) {
    super({
      id: 'debugOverlay',
      // Very high priority ensures this pass runs LAST in the render graph.
      // Must be higher than ToScreenPass (1000) and BufferPreviewPass (1100).
      priority: 10000,
      inputs: config.debugInput
        ? [{ resourceId: config.debugInput, access: 'read' as const, binding: 0 }]
        : [],
      outputs: [], // Renders directly to canvas (no render target output)
    })

    this.passConfig = config
    this.premultipliedAlpha = config.premultipliedAlpha ?? false
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout (no uniform buffer needed)
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'debug-overlay-bgl',
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
      DEBUG_OVERLAY_SHADER,
      'debug-overlay-fragment'
    )

    // Create pipeline with alpha blending to composite over existing content
    const blendState: GPUBlendState = this.premultipliedAlpha
      ? {
          // Premultiplied alpha blending
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        }
      : {
          // Standard alpha blending (non-premultiplied)
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        }

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'debug-overlay', blendState }
    )

    // Create sampler with nearest filtering to preserve sharp debug elements
    this.sampler = device.createSampler({
      label: 'debug-overlay-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Execute the debug overlay pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    // Skip if no debug input configured
    if (!this.passConfig.debugInput) {
      return
    }

    if (
      !this.device ||
      !this.renderPipeline ||
      !this.passBindGroupLayout ||
      !this.sampler
    ) {
      return
    }

    // Get debug texture
    const debugView = ctx.getTextureView(this.passConfig.debugInput)
    if (!debugView) return

    // Get canvas for output (we composite directly onto it)
    const canvasView = ctx.getCanvasTextureView()

    // PERF: Cache bind group, invalidate only when debug texture view changes
    if (!this.cachedBindGroup || this.cachedDebugView !== debugView) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'debug-overlay-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: debugView },
        ],
      })
      this.cachedDebugView = debugView
    }

    // Begin render pass with 'load' to preserve existing canvas content
    const passEncoder = ctx.beginRenderPass({
      label: 'debug-overlay-render',
      colorAttachments: [
        {
          view: canvasView,
          // Use 'load' to preserve existing content (from ToScreenPass/BufferPreviewPass)
          loadOp: 'load' as const,
          storeOp: 'store' as const,
        },
      ],
    })

    // Render fullscreen with alpha blending
    this.renderFullscreen(passEncoder, this.renderPipeline, [this.cachedBindGroup])

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null
    this.cachedBindGroup = null
    this.cachedDebugView = null

    super.dispose()
  }
}
