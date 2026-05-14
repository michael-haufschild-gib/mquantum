/**
 * WebGPU Scene Pass
 *
 * Coordination pass for scene rendering in the WebGPU render graph.
 * Actual scene rendering is handled by dedicated renderers
 * (e.g., WebGPUSchrodingerRenderer) that write directly to textures.
 * This pass provides:
 *
 * - Clear color initialization for scene targets
 * - Pass ordering marker for the render graph
 * - Background color configuration
 * - Optional passthrough/copy from existing scene data
 *
 * @module rendering/webgpu/passes/ScenePass
 */

import { BindGroupCache } from '../core/BindGroupCache'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'

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

const DEFAULT_CLEAR_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const TRANSPARENT_CLEAR_COLOR = { r: 0, g: 0, b: 0, a: 0 } as const

/** Clamp a finite numeric channel into the WebGPU clear-value unit range. */
function clampUnit(value: number, fallback: number): number {
  const safe = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(1, safe))
}

/** Normalize a clear color before it is passed into a WebGPU render-pass descriptor. */
export function normalizeSceneClearColor(color: { r: number; g: number; b: number; a: number }): {
  r: number
  g: number
  b: number
  a: number
} {
  return {
    r: clampUnit(color.r, DEFAULT_CLEAR_COLOR.r),
    g: clampUnit(color.g, DEFAULT_CLEAR_COLOR.g),
    b: clampUnit(color.b, DEFAULT_CLEAR_COLOR.b),
    a: clampUnit(color.a, DEFAULT_CLEAR_COLOR.a),
  }
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

  private bgCache = new BindGroupCache()

  // Configuration
  private clearColor: { r: number; g: number; b: number; a: number }
  private autoClear: boolean
  private renderBackground: boolean
  private mode: 'clear' | 'passthrough'
  private onRenderStats: ((stats: SceneRenderStats) => void) | null

  constructor(config: ScenePassConfig) {
    // Build inputs based on mode
    const inputs =
      config.mode === 'passthrough' && config.sourceResource
        ? [{ resourceId: config.sourceResource, access: 'read' as const, binding: 0 }]
        : []

    // Build outputs
    const outputs = [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }]

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
    this.clearColor = normalizeSceneClearColor(config.clearColor ?? DEFAULT_CLEAR_COLOR)
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
    this.clearColor = normalizeSceneClearColor(color)
  }

  /**
   * Set clear color from a hex value.
   * @param hex - Hex color value (e.g., 0x000000)
   * @param alpha - Alpha value (0-1)
   */
  setClearColorHex(hex: number, alpha = 1): void {
    const safeHex = Number.isFinite(hex) ? Math.max(0, Math.min(0xffffff, Math.round(hex))) : 0
    this.clearColor = {
      r: ((safeHex >> 16) & 255) / 255,
      g: ((safeHex >> 8) & 255) / 255,
      b: (safeHex & 255) / 255,
      a: clampUnit(alpha, DEFAULT_CLEAR_COLOR.a),
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

  /** Resolve the render-pass clear value from background and color settings. */
  private getClearValue(): { r: number; g: number; b: number; a: number } {
    return this.renderBackground ? this.clearColor : { ...TRANSPARENT_CLEAR_COLOR }
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

    const passEncoder = ctx.beginRenderPass({
      label: 'scene-clear',
      colorAttachments: [
        {
          view: outputView,
          loadOp: this.autoClear ? ('clear' as const) : ('load' as const),
          storeOp: 'store' as const,
          clearValue: this.getClearValue(),
        },
      ],
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

    const bindGroup = this.bgCache.get([sourceView], () =>
      this.device!.createBindGroup({
        label: 'scene-bg',
        layout: this.passBindGroupLayout!,
        entries: [
          { binding: 0, resource: this.sampler! },
          { binding: 1, resource: sourceView },
        ],
      })
    )

    const passEncoder = ctx.beginRenderPass({
      label: 'scene-passthrough',
      colorAttachments: [
        {
          view: outputView,
          loadOp: this.autoClear ? ('clear' as const) : ('load' as const),
          storeOp: 'store' as const,
          clearValue: this.getClearValue(),
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
    this.bgCache.invalidate()

    super.dispose()
  }
}
