/**
 * WebGPU Tonemapping Pass
 *
 * Converts HDR image to LDR using various tonemapping operators.
 * Supports Linear, Reinhard, ACES, Filmic, and Cineon tonemapping.
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
  Cineon = 4,
  AgX = 5,
  Neutral = 6,
}

/** Maps store's ToneMappingAlgorithm string to shader mode integer. */
const ALGORITHM_TO_MODE: Record<string, TonemapMode> = {
  none: TonemapMode.Linear,
  linear: TonemapMode.Linear,
  reinhard: TonemapMode.Reinhard,
  cineon: TonemapMode.Cineon,
  aces: TonemapMode.ACES,
  agx: TonemapMode.AgX,
  neutral: TonemapMode.Neutral,
}

export interface TonemappingPassOptions {
  /** HDR input resource name (default: 'hdr-color') */
  inputResource?: string
  /** LDR output resource name (default: 'ldr-color') */
  outputResource?: string
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
  private bindGroupInputView: GPUTextureView | null = null
  private sampler: GPUSampler | null = null

  private exposure = 1.0
  // Keep TonemappingPass output in LINEAR space.
  // The final linear->sRGB conversion happens in ToScreenPass so that all
  // post-tonemapping effects (cinematic, paper, AA) operate in linear space
  // like the WebGL render graph.
  private gamma = 1.0
  private mode = TonemapMode.ACES

  private readonly inputResource: string
  private readonly outputResource: string
  private uniformData = new ArrayBuffer(16)
  private uniformFloatView = new Float32Array(this.uniformData)
  private uniformIntView = new Int32Array(this.uniformData)
  private lastUniformExposure = Number.NaN
  private lastUniformGamma = Number.NaN
  private lastUniformMode = -1

  constructor(options?: TonemappingPassOptions) {
    const inputResource = options?.inputResource ?? 'hdr-color'
    const outputResource = options?.outputResource ?? 'ldr-color'

    super({
      id: 'tonemap',
      priority: 900, // Late in pipeline
      inputs: [{ resourceId: inputResource, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.inputResource = inputResource
    this.outputResource = outputResource

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
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const lighting = ctx.frame?.stores?.['lighting'] as {
      exposure?: number
      toneMappingEnabled?: boolean
      toneMappingAlgorithm?: string
    }

    if (lighting?.exposure !== undefined) {
      this.exposure = lighting.exposure
    }

    // Tone mapping algorithm: read from lighting store (matches WebGL)
    // When toneMappingEnabled is false, use Linear mode (no curve, just clamp)
    if (lighting?.toneMappingEnabled === false) {
      this.mode = TonemapMode.Linear
    } else if (lighting?.toneMappingAlgorithm !== undefined) {
      this.mode = ALGORITHM_TO_MODE[lighting.toneMappingAlgorithm] ?? TonemapMode.ACES
    }
    // Note: gamma is fixed at 1.0 (keep linear; ToScreenPass handles sRGB output)
  }

  setMode(value: TonemapMode): void {
    this.mode = value
  }

  private updateUniforms(): void {
    if (!this.device || !this.uniformBuffer) return

    if (
      this.exposure === this.lastUniformExposure &&
      this.gamma === this.lastUniformGamma &&
      this.mode === this.lastUniformMode
    ) {
      return
    }

    this.uniformFloatView[0] = this.exposure
    this.uniformFloatView[1] = this.gamma
    this.uniformIntView[2] = this.mode // i32 slot
    this.uniformFloatView[3] = 0 // padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, new Uint8Array(this.uniformData))

    this.lastUniformExposure = this.exposure
    this.lastUniformGamma = this.gamma
    this.lastUniformMode = this.mode
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

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

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.pipeline = this.createFullscreenPipeline(
      device,
      shaderModule,
      [this.bindGroupLayout],
      'rgba8unorm',
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

    this.updateUniforms()

    // Get textures (using configurable resource names)
    const inputView = ctx.getTextureView(this.inputResource)
    const outputView = ctx.getWriteTarget(this.outputResource) ?? ctx.getCanvasTextureView()

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
        'tonemap-bindgroup'
      )
      this.bindGroupInputView = inputView
    }

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
    this.bindGroupInputView = null
    this.sampler = null
    super.dispose()
  }
}
