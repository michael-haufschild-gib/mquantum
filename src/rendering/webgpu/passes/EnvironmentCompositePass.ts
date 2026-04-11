/**
 * WebGPU Environment Composite Pass
 *
 * Composites the premultiplied main-object layer over the background layer.
 * The object buffer contains premultiplied RGB produced by hardware src-alpha
 * blending onto clear black, so we apply the standard premultiplied "over"
 * operator: `out = obj + bg * (1 - obj.a)`.
 *
 * @module rendering/webgpu/passes/EnvironmentCompositePass
 */

import { BindGroupCache } from '../core/BindGroupCache'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'

/**
 * Environment composite pass configuration.
 */
export interface EnvironmentCompositePassConfig {
  /** Background input resource ID (skybox or clear color + measurement cloud) */
  backgroundInput: string
  /** Main object input resource ID (premultiplied) */
  mainObjectInput: string
  /** Output resource ID */
  outputResource: string
}

/**
 * WGSL Environment Composite Fragment Shader
 *
 * Composites premultiplied main object over the background.
 */
const ENVIRONMENT_COMPOSITE_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tBackground: texture_2d<f32>;
@group(0) @binding(2) var tMainObject: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  let bgColor = textureSample(tBackground, texSampler, uv);
  let objColor = textureSample(tMainObject, texSampler, uv);

  // Premultiplied "over": objColor.rgb is already alpha-premultiplied
  // (hardware src-alpha blend onto clear black).
  let finalColor = objColor.rgb + bgColor.rgb * (1.0 - objColor.a);
  let finalAlpha = max(bgColor.a, objColor.a);

  return vec4f(finalColor, finalAlpha);
}
`

/**
 * WebGPU Environment Composite Pass.
 *
 * Composites the main-object layer over the background layer into the HDR buffer.
 */
export class EnvironmentCompositePass extends WebGPUBasePass {
  private rendererConfig: EnvironmentCompositePassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Sampler
  private sampler: GPUSampler | null = null
  private bgCache = new BindGroupCache()

  constructor(config: EnvironmentCompositePassConfig) {
    super({
      id: 'environment-composite',
      priority: 200,
      inputs: [
        { resourceId: config.backgroundInput, access: 'read' as const, binding: 0 },
        { resourceId: config.mainObjectInput, access: 'read' as const, binding: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.rendererConfig = config
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout (no uniform buffer needed)
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'environment-composite-bgl',
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
      ENVIRONMENT_COMPOSITE_SHADER,
      'environment-composite-fragment'
    )

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'environment-composite' }
    )

    // Create sampler
    this.sampler = device.createSampler({
      label: 'environment-composite-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Execute the composite pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.passBindGroupLayout || !this.sampler) {
      return
    }

    // Get input textures
    const backgroundView = ctx.getTextureView(this.rendererConfig.backgroundInput)
    const mainObjectView = ctx.getTextureView(this.rendererConfig.mainObjectInput)

    if (!backgroundView || !mainObjectView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.rendererConfig.outputResource)
    if (!outputView) return

    const bindGroup = this.bgCache.get([backgroundView, mainObjectView], () =>
      this.device!.createBindGroup({
        label: 'environment-composite-bg',
        layout: this.passBindGroupLayout!,
        entries: [
          { binding: 0, resource: this.sampler! },
          { binding: 1, resource: backgroundView },
          { binding: 2, resource: mainObjectView },
        ],
      })
    )

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'environment-composite-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    // Render fullscreen
    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.bgCache.invalidate()
    this.sampler = null

    super.dispose()
  }
}
