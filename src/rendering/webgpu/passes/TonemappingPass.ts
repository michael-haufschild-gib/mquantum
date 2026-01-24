/**
 * WebGPU Tonemapping Pass
 *
 * Converts HDR image to LDR using various tonemapping operators.
 * Supports Linear, Reinhard, ACES, and Filmic tonemapping.
 *
 * @module rendering/webgpu/passes/TonemappingPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { tonemappingShader } from '../shaders/postprocessing/tonemapping.wgsl'

export enum TonemapMode {
  Linear = 0,
  Reinhard = 1,
  ACES = 2,
  Filmic = 3,
}

export interface TonemappingPassOptions {
  exposure?: number
  gamma?: number
  mode?: TonemapMode
}

/**
 * Tonemapping pass for HDR to LDR conversion.
 */
export class TonemappingPass extends WebGPUBasePass {
  private uniformBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null
  private sampler: GPUSampler | null = null

  private exposure = 1.0
  private gamma = 2.2
  private mode = TonemapMode.ACES

  constructor(options?: TonemappingPassOptions) {
    super({
      id: 'tonemap',
      priority: 900, // Late in pipeline
      inputs: [{ resourceId: 'hdr-color', access: 'read' }],
      outputs: [{ resourceId: 'ldr-color', access: 'write' }],
    })

    if (options?.exposure !== undefined) this.exposure = options.exposure
    if (options?.gamma !== undefined) this.gamma = options.gamma
    if (options?.mode !== undefined) this.mode = options.mode
  }

  setExposure(value: number): void {
    this.exposure = value
  }

  setGamma(value: number): void {
    this.gamma = value
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const lighting = ctx.frame?.stores?.['lighting'] as {
      exposure?: number
      gamma?: number
    }
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      tonemappingMode?: number
    }

    if (lighting?.exposure !== undefined) {
      this.exposure = lighting.exposure
    }
    if (lighting?.gamma !== undefined) {
      this.gamma = lighting.gamma
    }
    if (postProcessing?.tonemappingMode !== undefined) {
      this.mode = postProcessing.tonemappingMode
    }
  }

  setMode(value: TonemapMode): void {
    this.mode = value
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create shader module
    const shaderModule = this.createShaderModule(device, tonemappingShader, 'tonemap-shader')

    // Create bind group layout
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'tonemap-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'tonemap-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'tonemap-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // Create pipeline
    this.pipeline = this.createFullscreenPipeline(
      device,
      shaderModule,
      [this.bindGroupLayout],
      format,
      { label: 'tonemap' }
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

    // Update from stores
    this.updateFromStores(ctx)

    // Update uniforms
    const uniformData = new Float32Array([
      this.exposure,
      this.gamma,
      this.mode,
      0, // padding
    ])
    this.writeUniformBuffer(this.device, this.uniformBuffer, uniformData)

    // Get textures
    const inputView = ctx.getTextureView('hdr-color')
    const outputView = ctx.getWriteTarget('ldr-color') ?? ctx.getCanvasTextureView()

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
      'tonemap-bindgroup'
    )

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'tonemap-pass',
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
