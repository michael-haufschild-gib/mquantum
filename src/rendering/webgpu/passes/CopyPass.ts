/**
 * WebGPU Copy Pass
 *
 * Simple utility pass that copies one texture to another.
 * Useful for preserving frame history or copying between resources.
 *
 * @module rendering/webgpu/passes/CopyPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Copy pass configuration.
 */
export interface CopyPassConfig {
  /** Source texture resource ID */
  sourceInput: string
  /** Destination resource ID */
  outputResource: string
}

/**
 * WGSL Copy Fragment Shader
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
 * WebGPU Copy Pass.
 *
 * Simple pass that copies a texture to another texture.
 */
export class CopyPass extends WebGPUBasePass {
  private passConfig: CopyPassConfig

  private renderPipeline: GPURenderPipeline | null = null
  // PERF: Cached bind group to avoid per-frame GPU driver calls
  private cachedBindGroup: GPUBindGroup | null = null
  private cachedSourceView: GPUTextureView | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null

  constructor(config: CopyPassConfig) {
    super({
      id: 'copy',
      priority: 999, // Execute when needed
      inputs: [{ resourceId: config.sourceInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'copy-bgl',
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

    const fragmentModule = this.createShaderModule(device, COPY_SHADER, 'copy-fragment')

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'copy' }
    )

    this.sampler = device.createSampler({
      label: 'copy-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.passBindGroupLayout || !this.sampler) return

    const sourceView = ctx.getTextureView(this.passConfig.sourceInput)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!sourceView || !outputView) return

    // PERF: Cache bind group, invalidate only when input texture view changes
    if (!this.cachedBindGroup || this.cachedSourceView !== sourceView) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'copy-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: sourceView },
        ],
      })
      this.cachedSourceView = sourceView
    }
    const bindGroup = this.cachedBindGroup

    const passEncoder = ctx.beginRenderPass({
      label: 'copy-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])
    passEncoder.end()
  }

  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null
    this.cachedBindGroup = null
    this.cachedSourceView = null
    super.dispose()
  }
}
