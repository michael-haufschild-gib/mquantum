/* global GPURenderPassDepthStencilAttachment */
/**
 * WebGPU Scene Pass
 *
 * Coordination pass for scene rendering in the WebGPU render graph.
 * Unlike the WebGL version which directly renders via Three.js renderer,
 * this pass serves as a marker and initializer for scene rendering.
 *
 * In the WebGPU architecture, actual scene rendering is handled by dedicated
 * renderers (e.g., WebGPUMandelbulbRenderer, WebGPUBlackHoleRenderer) that
 * write directly to textures. This pass provides:
 *
 * - Clear color initialization for scene targets
 * - Pass ordering marker for the render graph
 * - Background color configuration
 * - Optional passthrough/copy from existing scene data
 *
 * @module rendering/webgpu/passes/ScenePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Render stats captured after scene render (for compatibility with WebGL interface).
 */
export interface SceneRenderStats {
  /** Number of draw calls */
  calls: number
  /** Number of triangles rendered */
  triangles: number
  /** Number of points rendered */
  points: number
  /** Number of lines rendered */
  lines: number
}

/**
 * Configuration for ScenePass.
 */
export interface ScenePassConfig {
  /** Output resource ID for scene color */
  outputResource: string

  /** Optional depth output resource ID */
  depthResource?: string

  /** Optional normal output resource ID */
  normalResource?: string

  /** Clear color (RGBA, each component 0-1) */
  clearColor?: { r: number; g: number; b: number; a: number }

  /** Whether to clear before rendering (default: true) */
  autoClear?: boolean

  /** Whether to render background (default: true) */
  renderBackground?: boolean

  /** Mode of operation: 'clear' only clears, 'passthrough' copies from source */
  mode?: 'clear' | 'passthrough'

  /** Source resource ID for passthrough mode */
  sourceResource?: string

  /** Optional callback to receive render stats after scene render */
  onRenderStats?: (stats: SceneRenderStats) => void
}

/**
 * WGSL Copy Fragment Shader for passthrough mode.
 */
const COPY_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tSource: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(tSource, texSampler, input.uv);
}
`

/**
 * WebGPU Scene Pass.
 *
 * Coordinates scene rendering in the WebGPU render graph.
 * Provides initialization and clear operations for scene targets.
 *
 * @example
 * ```typescript
 * // Clear mode - initializes the scene buffer with a clear color
 * const scenePass = new ScenePass({
 *   outputResource: 'sceneColor',
 *   clearColor: { r: 0, g: 0, b: 0, a: 1 },
 *   mode: 'clear',
 * });
 *
 * // Passthrough mode - copies from a source texture
 * const scenePass = new ScenePass({
 *   outputResource: 'sceneColor',
 *   sourceResource: 'preRenderedScene',
 *   mode: 'passthrough',
 * });
 *
 * graph.addPass(scenePass);
 * ```
 */
export class ScenePass extends WebGPUBasePass {
  private passConfig: ScenePassConfig

  // Pipeline (only needed for passthrough mode)
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null

  // Configuration
  private clearColor: { r: number; g: number; b: number; a: number }
  private autoClear: boolean
  private renderBackground: boolean
  private mode: 'clear' | 'passthrough'
  private onRenderStats: ((stats: SceneRenderStats) => void) | null

  constructor(config: ScenePassConfig) {
    // Build inputs based on mode
    const inputs = config.mode === 'passthrough' && config.sourceResource
      ? [{ resourceId: config.sourceResource, access: 'read' as const, binding: 0 }]
      : []

    // Build outputs
    const outputs = [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }]

    if (config.depthResource) {
      outputs.push({ resourceId: config.depthResource, access: 'write' as const, binding: 1 })
    }
    if (config.normalResource) {
      outputs.push({ resourceId: config.normalResource, access: 'write' as const, binding: 2 })
    }

    super({
      id: 'scene',
      priority: 0, // Execute first in the pipeline
      inputs,
      outputs,
    })

    this.passConfig = config
    this.clearColor = config.clearColor ?? { r: 0, g: 0, b: 0, a: 1 }
    this.autoClear = config.autoClear ?? true
    this.renderBackground = config.renderBackground ?? true
    this.mode = config.mode ?? 'clear'
    this.onRenderStats = config.onRenderStats ?? null
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    // Only create pipeline for passthrough mode
    if (this.mode !== 'passthrough') return

    const { device, format } = ctx

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'scene-bgl',
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

    const fragmentModule = this.createShaderModule(device, COPY_SHADER, 'scene-fragment')

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'scene' }
    )

    this.sampler = device.createSampler({
      label: 'scene-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })
  }

  /**
   * Dynamically set the clear color.
   * @param color - The new clear color (RGBA, each component 0-1)
   * @param color.r
   * @param color.g
   * @param color.b
   * @param color.a
   */
  setClearColor(color: { r: number; g: number; b: number; a: number }): void {
    this.clearColor = { ...color }
  }

  /**
   * Set clear color from a hex value.
   * @param hex - Hex color value (e.g., 0x000000)
   * @param alpha - Alpha value (0-1)
   */
  setClearColorHex(hex: number, alpha = 1): void {
    this.clearColor = {
      r: ((hex >> 16) & 255) / 255,
      g: ((hex >> 8) & 255) / 255,
      b: (hex & 255) / 255,
      a: alpha,
    }
  }

  /**
   * Get current clear color.
   */
  getClearColor(): { r: number; g: number; b: number; a: number } {
    return { ...this.clearColor }
  }

  /**
   * Set auto clear mode.
   * @param enabled - Whether to clear before rendering
   */
  setAutoClear(enabled: boolean): void {
    this.autoClear = enabled
  }

  /**
   * Get auto clear state.
   */
  getAutoClear(): boolean {
    return this.autoClear
  }

  /**
   * Set background rendering mode.
   * @param enabled - Whether to render background
   */
  setRenderBackground(enabled: boolean): void {
    this.renderBackground = enabled
  }

  /**
   * Get background rendering state.
   */
  getRenderBackground(): boolean {
    return this.renderBackground
  }

  /**
   * Execute the scene pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device) return

    if (this.mode === 'passthrough') {
      this.executePassthrough(ctx)
    } else {
      this.executeClear(ctx)
    }

    // Report empty stats (actual scene rendering happens elsewhere in WebGPU)
    if (this.onRenderStats) {
      this.onRenderStats({
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0,
      })
    }
  }

  /**
   * Execute in clear mode - simply clear the output target.
   * @param ctx
   */
  private executeClear(ctx: WebGPURenderContext): void {
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Check if depth clearing is needed
    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined
    if (this.passConfig.depthResource) {
      const depthView = ctx.getWriteTarget(this.passConfig.depthResource)
      if (depthView) {
        depthStencilAttachment = {
          view: depthView,
          depthLoadOp: 'clear' as const,
          depthStoreOp: 'store' as const,
          depthClearValue: 1.0,
        }
      }
    }

    const passEncoder = ctx.beginRenderPass({
      label: 'scene-clear',
      colorAttachments: [
        {
          view: outputView,
          loadOp: this.autoClear ? ('clear' as const) : ('load' as const),
          storeOp: 'store' as const,
          clearValue: this.clearColor,
        },
      ],
      depthStencilAttachment,
    })

    // End immediately - we just wanted to clear
    passEncoder.end()
  }

  /**
   * Execute in passthrough mode - copy from source to output.
   * @param ctx
   */
  private executePassthrough(ctx: WebGPURenderContext): void {
    if (!this.renderPipeline || !this.passBindGroupLayout || !this.sampler) return

    const sourceResource = this.passConfig.sourceResource
    if (!sourceResource) return

    const sourceView = ctx.getTextureView(sourceResource)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!sourceView || !outputView) return

    const bindGroup = this.device!.createBindGroup({
      label: 'scene-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: sourceView },
      ],
    })

    const passEncoder = ctx.beginRenderPass({
      label: 'scene-passthrough',
      colorAttachments: [
        {
          view: outputView,
          loadOp: this.autoClear ? ('clear' as const) : ('load' as const),
          storeOp: 'store' as const,
          clearValue: this.clearColor,
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])
    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null

    super.dispose()
  }
}
