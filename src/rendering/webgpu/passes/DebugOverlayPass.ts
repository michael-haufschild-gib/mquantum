/**
 * WebGPU Debug Overlay Pass
 *
 * Composites debug/gizmo elements onto the screen AFTER all post-processing.
 * This is the WebGPU equivalent of the WebGL DebugOverlayPass.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Debug elements (light gizmos, transform controls, axis helpers) need to be
 * rendered on top of all post-processing effects. In WebGL, this is done by
 * rendering the DEBUG layer directly with Three.js. In WebGPU, we composite
 * a pre-rendered debug texture onto the canvas.
 *
 * USAGE:
 * ------
 * The pass accepts an optional debug texture input. If no texture is provided
 * or it's empty (all transparent), the pass becomes a no-op. When a debug
 * texture is available, it's composited onto the screen using alpha blending.
 *
 * The debug texture should be rendered separately (e.g., by a Three.js WebGPU
 * renderer targeting the DEBUG layer) and passed as a resource.
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
   * @default false
   */
  premultipliedAlpha?: boolean
}

/**
 * WGSL fragment shader for debug overlay compositing.
 *
 * Uses standard alpha blending: output = src * srcAlpha + dst * (1 - srcAlpha)
 * Also supports premultiplied alpha when configured.
 */
const DEBUG_OVERLAY_SHADER = /* wgsl */ `
struct Uniforms {
  premultipliedAlpha: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDebug: texture_2d<f32>;

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

  // For premultiplied alpha, the color channels already include alpha multiplication
  // For non-premultiplied, we need to output as-is for the blend state to handle
  if (uniforms.premultipliedAlpha != 0u) {
    // Premultiplied: output directly, blend state handles the rest
    return debugColor;
  } else {
    // Non-premultiplied: standard alpha output
    return debugColor;
  }
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

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private premultipliedAlpha: boolean

  constructor(config: DebugOverlayPassConfig = {}) {
    super({
      id: 'debugOverlay',
      // CRITICAL: Very high priority ensures this pass runs LAST in the render graph.
      // Must be higher than ToScreenPass (1000) to render after it.
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
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'debug-overlay-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 2,
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
    // Using standard alpha blending: result = src * srcAlpha + dst * (1 - srcAlpha)
    const blendState: GPUBlendState = this.premultipliedAlpha
      ? {
          // Premultiplied alpha blending
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        }
      : {
          // Standard alpha blending (non-premultiplied)
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        }

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'debug-overlay', blendState }
    )

    // Create uniform buffer (16-byte aligned)
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'debug-overlay-uniforms')
    this.updateUniformBuffer()

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
   * Update the uniform buffer with current settings.
   */
  private updateUniformBuffer(): void {
    if (!this.device || !this.uniformBuffer) return

    const data = new Uint32Array(4)
    data[0] = this.premultipliedAlpha ? 1 : 0

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)
  }

  /**
   * Set whether to use premultiplied alpha blending.
   * @param enabled - Whether to use premultiplied alpha
   */
  setPremultipliedAlpha(enabled: boolean): void {
    this.premultipliedAlpha = enabled
    this.updateUniformBuffer()
  }

  /**
   * Get current premultiplied alpha setting.
   */
  getPremultipliedAlpha(): boolean {
    return this.premultipliedAlpha
  }

  /**
   * Execute the debug overlay pass.
   */
  execute(ctx: WebGPURenderContext): void {
    // Skip if no debug input configured
    if (!this.passConfig.debugInput) {
      return
    }

    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.sampler
    ) {
      return
    }

    // Get debug texture
    const debugView = ctx.getTextureView(this.passConfig.debugInput)
    if (!debugView) {
      // No debug texture available, skip
      return
    }

    // Get canvas for output (we composite directly onto it)
    const canvasView = ctx.getCanvasTextureView()

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'debug-overlay-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: debugView },
      ],
    })

    // Begin render pass with 'load' to preserve existing canvas content
    const passEncoder = ctx.beginRenderPass({
      label: 'debug-overlay-render',
      colorAttachments: [
        {
          view: canvasView,
          // CRITICAL: Use 'load' to preserve existing content (from ToScreenPass)
          // This allows us to composite debug elements on top
          loadOp: 'load' as const,
          storeOp: 'store' as const,
        },
      ],
    })

    // Render fullscreen with alpha blending
    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null

    super.dispose()
  }
}
