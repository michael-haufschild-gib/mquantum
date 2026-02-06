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
  /** Input color resource (default: 'ldr-color') */
  colorInput?: string
  /** Output resource (default: 'final-color') */
  outputResource?: string
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
  private bindGroupInputView: GPUTextureView | null = null
  private sampler: GPUSampler | null = null

  private subpixelQuality = 0.75
  private edgeThreshold = 0.125
  private edgeThresholdMin = 0.0625

  private readonly colorInputId: string
  private readonly outputResourceId: string
  private uniformData = new Float32Array(12)
  private lastUniformWidth = -1
  private lastUniformHeight = -1
  private lastUniformSubpixelQuality = Number.NaN
  private lastUniformEdgeThreshold = Number.NaN
  private lastUniformEdgeThresholdMin = Number.NaN

  constructor(options?: FXAAPassOptions) {
    const colorInput = options?.colorInput ?? 'ldr-color'
    const outputResource = options?.outputResource ?? 'final-color'

    super({
      id: 'fxaa',
      priority: 950, // After tonemapping
      inputs: [{ resourceId: colorInput, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.colorInputId = colorInput
    this.outputResourceId = outputResource

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

  private updateUniforms(width: number, height: number): void {
    if (!this.device || !this.uniformBuffer) return

    if (
      width === this.lastUniformWidth &&
      height === this.lastUniformHeight &&
      this.subpixelQuality === this.lastUniformSubpixelQuality &&
      this.edgeThreshold === this.lastUniformEdgeThreshold &&
      this.edgeThresholdMin === this.lastUniformEdgeThresholdMin
    ) {
      return
    }

    // Must match WGSL struct layout (48 bytes):
    // vec2f(8) + f32(4) + f32(4) + f32(4) + vec3f(12) + trailing padding(8)
    this.uniformData[0] = width
    this.uniformData[1] = height
    this.uniformData[2] = this.subpixelQuality
    this.uniformData[3] = this.edgeThreshold
    this.uniformData[4] = this.edgeThresholdMin
    this.uniformData[5] = 0
    this.uniformData[6] = 0
    this.uniformData[7] = 0
    this.uniformData[8] = 0
    this.uniformData[9] = 0
    this.uniformData[10] = 0
    this.uniformData[11] = 0

    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformData)

    this.lastUniformWidth = width
    this.lastUniformHeight = height
    this.lastUniformSubpixelQuality = this.subpixelQuality
    this.lastUniformEdgeThreshold = this.edgeThreshold
    this.lastUniformEdgeThresholdMin = this.edgeThresholdMin
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

    // Create uniform buffer (48 bytes - WGSL struct with vec3f padding aligns to 16)
    // Layout: vec2f(8) + f32(4) + f32(4) + f32(4) + pad(12) + vec3f(12) = 44, rounded to 48
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'fxaa-uniforms')

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

    this.updateUniforms(width, height)

    // Get textures
    const inputView = ctx.getTextureView(this.colorInputId)
    const outputView = ctx.getWriteTarget(this.outputResourceId) ?? ctx.getCanvasTextureView()

    if (!inputView) return

    if (!this.bindGroup || this.bindGroupInputView !== inputView) {
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
      this.bindGroupInputView = inputView
    }

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
    this.bindGroupInputView = null
    this.sampler = null
    super.dispose()
  }
}
