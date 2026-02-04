/**
 * WebGPU Bloom Pass
 *
 * Multi-pass bloom effect for HDR rendering.
 * Uses brightness threshold, gaussian blur, and compositing.
 *
 * @module rendering/webgpu/passes/BloomPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  bloomThresholdShader,
  bloomBlurShader,
  bloomCompositeShader,
} from '../shaders/postprocessing/bloom.wgsl'

export interface BloomPassOptions {
  threshold?: number
  knee?: number
  intensity?: number
  blurPasses?: number
}

/**
 * Bloom effect pass with threshold, blur, and composite stages.
 */
export class BloomPass extends WebGPUBasePass {
  private thresholdPipeline: GPURenderPipeline | null = null
  private blurPipeline: GPURenderPipeline | null = null
  private compositePipeline: GPURenderPipeline | null = null

  private thresholdBindGroupLayout: GPUBindGroupLayout | null = null
  private blurBindGroupLayout: GPUBindGroupLayout | null = null
  private compositeBindGroupLayout: GPUBindGroupLayout | null = null

  private uniformBuffer: GPUBuffer | null = null
  private blurUniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  // Bloom textures (created dynamically)
  private brightnessTexture: GPUTexture | null = null
  private blurTextureA: GPUTexture | null = null
  private blurTextureB: GPUTexture | null = null
  private textureSize = { width: 0, height: 0 }

  // Settings
  private threshold = 1.0
  private knee = 0.1
  private intensity = 0.5
  private blurPasses = 4

  constructor(options?: BloomPassOptions) {
    super({
      id: 'bloom',
      priority: 800,
      inputs: [{ resourceId: 'hdr-color', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'bloom-output', access: 'write', binding: 0 }],
    })

    if (options?.threshold !== undefined) this.threshold = options.threshold
    if (options?.knee !== undefined) this.knee = options.knee
    if (options?.intensity !== undefined) this.intensity = options.intensity
    if (options?.blurPasses !== undefined) this.blurPasses = options.blurPasses
  }

  setThreshold(value: number): void {
    this.threshold = value
  }

  setIntensity(value: number): void {
    this.intensity = value
  }


  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      bloomIntensity?: number
      bloomThreshold?: number
      bloomSmoothing?: number
    }

    if (postProcessing?.bloomIntensity !== undefined) {
      this.intensity = postProcessing.bloomIntensity
    }
    if (postProcessing?.bloomThreshold !== undefined) {
      this.threshold = postProcessing.bloomThreshold
    }
    if (postProcessing?.bloomSmoothing !== undefined) {
      this.knee = postProcessing.bloomSmoothing
    }
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create shader modules
    const thresholdShaderModule = this.createShaderModule(
      device,
      bloomThresholdShader,
      'bloom-threshold-shader'
    )
    const blurShaderModule = this.createShaderModule(device, bloomBlurShader, 'bloom-blur-shader')
    const compositeShaderModule = this.createShaderModule(
      device,
      bloomCompositeShader,
      'bloom-composite-shader'
    )

    // Create sampler
    this.sampler = device.createSampler({
      label: 'bloom-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Threshold bind group layout
    this.thresholdBindGroupLayout = device.createBindGroupLayout({
      label: 'bloom-threshold-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Blur bind group layout
    this.blurBindGroupLayout = device.createBindGroupLayout({
      label: 'bloom-blur-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Composite bind group layout
    this.compositeBindGroupLayout = device.createBindGroupLayout({
      label: 'bloom-composite-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Create uniform buffers
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'bloom-uniforms')
    this.blurUniformBuffer = this.createUniformBuffer(device, 32, 'bloom-blur-uniforms')

    // Create pipelines
    this.thresholdPipeline = this.createFullscreenPipeline(
      device,
      thresholdShaderModule,
      [this.thresholdBindGroupLayout],
      'rgba16float',
      { label: 'bloom-threshold' }
    )

    this.blurPipeline = this.createFullscreenPipeline(
      device,
      blurShaderModule,
      [this.blurBindGroupLayout],
      'rgba16float',
      { label: 'bloom-blur' }
    )

    // Composite also uses rgba16float since bloom-output is HDR
    this.compositePipeline = this.createFullscreenPipeline(
      device,
      compositeShaderModule,
      [this.compositeBindGroupLayout],
      'rgba16float',
      { label: 'bloom-composite' }
    )
  }

  private ensureTextures(device: GPUDevice, width: number, height: number): void {
    // Bloom operates at half resolution
    const bloomWidth = Math.max(1, Math.floor(width / 2))
    const bloomHeight = Math.max(1, Math.floor(height / 2))

    if (this.textureSize.width === bloomWidth && this.textureSize.height === bloomHeight) {
      return
    }

    // Destroy old textures
    this.brightnessTexture?.destroy()
    this.blurTextureA?.destroy()
    this.blurTextureB?.destroy()

    // Create new textures
    const descriptor: GPUTextureDescriptor = {
      size: { width: bloomWidth, height: bloomHeight },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }

    this.brightnessTexture = device.createTexture({ ...descriptor, label: 'bloom-brightness' })
    this.blurTextureA = device.createTexture({ ...descriptor, label: 'bloom-blur-a' })
    this.blurTextureB = device.createTexture({ ...descriptor, label: 'bloom-blur-b' })

    this.textureSize = { width: bloomWidth, height: bloomHeight }
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.thresholdPipeline ||
      !this.blurPipeline ||
      !this.compositePipeline ||
      !this.thresholdBindGroupLayout ||
      !this.blurBindGroupLayout ||
      !this.compositeBindGroupLayout ||
      !this.uniformBuffer ||
      !this.blurUniformBuffer ||
      !this.sampler
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)

    const { width, height } = ctx.size
    this.ensureTextures(this.device, width, height)

    if (!this.brightnessTexture || !this.blurTextureA || !this.blurTextureB) {
      return
    }

    const inputView = ctx.getTextureView('hdr-color')
    const outputView = ctx.getWriteTarget('bloom-output') ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // Update threshold uniforms
    const uniformData = new Float32Array([
      this.threshold,
      this.knee,
      this.intensity,
      0, // padding
      this.textureSize.width,
      this.textureSize.height,
      0,
      0, // padding
    ])
    this.writeUniformBuffer(this.device, this.uniformBuffer, uniformData)

    // === Pass 1: Brightness threshold ===
    const thresholdBindGroup = this.createBindGroup(this.device, this.thresholdBindGroupLayout, [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: inputView },
      { binding: 2, resource: this.sampler },
    ])

    const thresholdPass = ctx.beginRenderPass({
      label: 'bloom-threshold',
      colorAttachments: [
        {
          view: this.brightnessTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(thresholdPass, this.thresholdPipeline, [thresholdBindGroup])
    thresholdPass.end()

    // === Pass 2+: Gaussian blur (ping-pong) ===
    let readTexture = this.brightnessTexture
    let writeTexture = this.blurTextureA

    for (let i = 0; i < this.blurPasses * 2; i++) {
      const isHorizontal = i % 2 === 0

      // Update blur uniforms
      const blurData = new Float32Array([
        isHorizontal ? 1 : 0,
        isHorizontal ? 0 : 1,
        0,
        0, // padding
        this.textureSize.width,
        this.textureSize.height,
        0,
        0, // padding
      ])
      this.writeUniformBuffer(this.device, this.blurUniformBuffer, blurData)

      const blurBindGroup = this.createBindGroup(this.device, this.blurBindGroupLayout, [
        { binding: 0, resource: { buffer: this.blurUniformBuffer } },
        { binding: 1, resource: readTexture.createView() },
        { binding: 2, resource: this.sampler },
      ])

      const blurPass = ctx.beginRenderPass({
        label: `bloom-blur-${i}`,
        colorAttachments: [
          {
            view: writeTexture.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(blurPass, this.blurPipeline, [blurBindGroup])
      blurPass.end()

      // Swap textures
      const _temp = readTexture
      readTexture = writeTexture
      writeTexture = i % 2 === 0 ? this.blurTextureB : this.blurTextureA
    }

    // === Pass 3: Composite ===
    const compositeBindGroup = this.createBindGroup(this.device, this.compositeBindGroupLayout, [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: inputView },
      { binding: 2, resource: readTexture.createView() },
      { binding: 3, resource: this.sampler },
    ])

    const compositePass = ctx.beginRenderPass({
      label: 'bloom-composite',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(compositePass, this.compositePipeline, [compositeBindGroup])
    compositePass.end()
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.blurUniformBuffer?.destroy()
    this.brightnessTexture?.destroy()
    this.blurTextureA?.destroy()
    this.blurTextureB?.destroy()

    this.uniformBuffer = null
    this.blurUniformBuffer = null
    this.brightnessTexture = null
    this.blurTextureA = null
    this.blurTextureB = null

    super.dispose()
  }
}
