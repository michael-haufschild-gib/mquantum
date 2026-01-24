/**
 * WebGPU FXAA Pass
 *
 * Fast Approximate Anti-Aliasing for post-process anti-aliasing.
 *
 * @module rendering/webgpu/passes/FXAAPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { fxaaShader } from '../shaders/postprocessing/fxaa.wgsl'

export interface FXAAPassOptions {
  subpixelQuality?: number
  edgeThreshold?: number
  edgeThresholdMin?: number
}

/**
 * FXAA (Fast Approximate Anti-Aliasing) pass.
 */
export class FXAAPass extends WebGPUBasePass {
  private uniformBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null
  private sampler: GPUSampler | null = null

  private subpixelQuality = 0.75
  private edgeThreshold = 0.125
  private edgeThresholdMin = 0.0625

  constructor(options?: FXAAPassOptions) {
    super({
      id: 'fxaa',
      priority: 950, // After tonemapping
      inputs: [{ resourceId: 'ldr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'final-color', access: 'write', binding: 0 }],
    })

    if (options?.subpixelQuality !== undefined) this.subpixelQuality = options.subpixelQuality
    if (options?.edgeThreshold !== undefined) this.edgeThreshold = options.edgeThreshold
    if (options?.edgeThresholdMin !== undefined) this.edgeThresholdMin = options.edgeThresholdMin
  }

  setSubpixelQuality(value: number): void {
    this.subpixelQuality = value
  }

  setEdgeThreshold(value: number): void {
    this.edgeThreshold = value
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    const shaderModule = this.createShaderModule(device, fxaaShader, 'fxaa-shader')

    // Create bind group layout
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'fxaa-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Create uniform buffer (32 bytes for vec2 + 3 floats + padding)
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'fxaa-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'fxaa-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.pipeline = this.createFullscreenPipeline(
      device,
      shaderModule,
      [this.bindGroupLayout],
      'rgba8unorm',
      { label: 'fxaa' }
    )
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.pipeline ||
      !this.bindGroupLayout ||
      !this.uniformBuffer ||
      !this.sampler
    ) {
      return
    }

    const { width, height } = ctx.size

    // Update uniforms
    const uniformData = new Float32Array([
      width,
      height,
      this.subpixelQuality,
      this.edgeThreshold,
      this.edgeThresholdMin,
      0,
      0,
      0, // padding to 32 bytes
    ])
    this.writeUniformBuffer(this.device, this.uniformBuffer, uniformData)

    // Get textures
    const inputView = ctx.getTextureView('ldr-color')
    const outputView = ctx.getWriteTarget('final-color') ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // Create bind group
    this.bindGroup = this.createBindGroup(
      this.device,
      this.bindGroupLayout,
      [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.sampler },
      ],
      'fxaa-bindgroup'
    )

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'fxaa-pass',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.pipeline as GPURenderPipeline, [this.bindGroup])
    passEncoder.end()
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.bindGroup = null
    this.sampler = null
    super.dispose()
  }
}
