/**
 * WebGPU SMAA Pass
 *
 * Subpixel Morphological Anti-Aliasing for high-quality edge smoothing.
 * A three-pass technique: edge detection, blending weight calculation, and neighborhood blending.
 *
 * Based on the SMAA paper by Jimenez et al. (2012)
 *
 * @module rendering/webgpu/passes/SMAAPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  smaaEdgeDetectionShader,
  smaaBlendingWeightShader,
  smaaNeighborhoodBlendingShader,
} from '../shaders/postprocessing/smaa.wgsl'

export interface SMAAPassOptions {
  /** Edge detection threshold (default: 0.1, range: 0.05-0.5) */
  threshold?: number
  /** Maximum search steps (default: 16, range: 4-32) */
  maxSearchSteps?: number
}

/**
 * SMAA (Subpixel Morphological Anti-Aliasing) pass.
 *
 * Implements a high-quality anti-aliasing technique using three render passes:
 * 1. Edge detection - identifies edges based on luminance differences
 * 2. Blending weight calculation - determines blend factors from edge patterns
 * 3. Neighborhood blending - applies the final anti-aliased result
 */
export class SMAAPass extends WebGPUBasePass {
  // Pipelines for each pass
  private edgeDetectionPipeline: GPURenderPipeline | null = null
  private blendWeightPipeline: GPURenderPipeline | null = null
  private neighborhoodBlendPipeline: GPURenderPipeline | null = null

  // Bind group layouts for each pass (using passBindGroupLayout to avoid base class conflict)
  private edgeDetectionBindGroupLayout: GPUBindGroupLayout | null = null
  private blendWeightBindGroupLayout: GPUBindGroupLayout | null = null
  private neighborhoodBlendBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffers
  private edgeUniformBuffer: GPUBuffer | null = null
  private blendUniformBuffer: GPUBuffer | null = null
  private neighborhoodUniformBuffer: GPUBuffer | null = null

  // Samplers
  private linearSampler: GPUSampler | null = null
  private pointSampler: GPUSampler | null = null

  // Intermediate textures
  private edgesTexture: GPUTexture | null = null
  private blendWeightsTexture: GPUTexture | null = null
  private textureSize = { width: 0, height: 0 }

  // Settings
  private threshold = 0.1
  private maxSearchSteps = 16

  constructor(options?: SMAAPassOptions) {
    super({
      id: 'smaa',
      priority: 950, // After tonemapping, same priority as FXAA
      inputs: [{ resourceId: 'ldr-color', access: 'read' }],
      outputs: [{ resourceId: 'final-color', access: 'write' }],
    })

    if (options?.threshold !== undefined) this.threshold = options.threshold
    if (options?.maxSearchSteps !== undefined) this.maxSearchSteps = options.maxSearchSteps
  }

  /**
   * Set the edge detection threshold.
   * Lower values detect more edges but may introduce artifacts.
   */
  setThreshold(value: number): void {
    this.threshold = Math.max(0.05, Math.min(0.5, value))
  }

  /**
   * Set the maximum search steps for pattern detection.
   * Higher values improve quality but increase cost.
   */
  setMaxSearchSteps(value: number): void {
    this.maxSearchSteps = Math.max(4, Math.min(32, value))
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const performance = ctx.frame?.stores?.['performance'] as {
      smaaThreshold?: number
      smaaMaxSearchSteps?: number
    }

    if (performance?.smaaThreshold !== undefined) {
      this.threshold = Math.max(0.05, Math.min(0.5, performance.smaaThreshold))
    }
    if (performance?.smaaMaxSearchSteps !== undefined) {
      this.maxSearchSteps = Math.max(4, Math.min(32, performance.smaaMaxSearchSteps))
    }
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create shader modules
    const edgeShaderModule = this.createShaderModule(
      device,
      smaaEdgeDetectionShader,
      'smaa-edge-detection-shader'
    )
    const blendShaderModule = this.createShaderModule(
      device,
      smaaBlendingWeightShader,
      'smaa-blend-weight-shader'
    )
    const neighborhoodShaderModule = this.createShaderModule(
      device,
      smaaNeighborhoodBlendingShader,
      'smaa-neighborhood-blend-shader'
    )

    // Create samplers
    this.linearSampler = device.createSampler({
      label: 'smaa-linear-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.pointSampler = device.createSampler({
      label: 'smaa-point-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // === Pass 1: Edge Detection ===
    this.edgeDetectionBindGroupLayout = device.createBindGroupLayout({
      label: 'smaa-edge-detection-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
      ],
    })

    this.edgeUniformBuffer = this.createUniformBuffer(device, 16, 'smaa-edge-uniforms')

    this.edgeDetectionPipeline = this.createFullscreenPipeline(
      device,
      edgeShaderModule,
      [this.edgeDetectionBindGroupLayout],
      'rg8unorm', // Edge texture only needs R and G channels
      { label: 'smaa-edge-detection' }
    )

    // === Pass 2: Blending Weight Calculation ===
    this.blendWeightBindGroupLayout = device.createBindGroupLayout({
      label: 'smaa-blend-weight-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        }, // edges
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        }, // input color
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        }, // linear
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'non-filtering' as const },
        }, // point
      ],
    })

    this.blendUniformBuffer = this.createUniformBuffer(device, 16, 'smaa-blend-uniforms')

    this.blendWeightPipeline = this.createFullscreenPipeline(
      device,
      blendShaderModule,
      [this.blendWeightBindGroupLayout],
      'rgba8unorm', // Blend weights need all 4 channels
      { label: 'smaa-blend-weight' }
    )

    // === Pass 3: Neighborhood Blending ===
    this.neighborhoodBlendBindGroupLayout = device.createBindGroupLayout({
      label: 'smaa-neighborhood-blend-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        }, // input color
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        }, // blend weights
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
      ],
    })

    this.neighborhoodUniformBuffer = this.createUniformBuffer(
      device,
      16,
      'smaa-neighborhood-uniforms'
    )

    this.neighborhoodBlendPipeline = this.createFullscreenPipeline(
      device,
      neighborhoodShaderModule,
      [this.neighborhoodBlendBindGroupLayout],
      format, // Final output format
      { label: 'smaa-neighborhood-blend' }
    )
  }

  /**
   * Ensure intermediate textures are created and properly sized.
   */
  private ensureTextures(device: GPUDevice, width: number, height: number): void {
    if (this.textureSize.width === width && this.textureSize.height === height) {
      return
    }

    // Destroy old textures
    this.edgesTexture?.destroy()
    this.blendWeightsTexture?.destroy()

    // Create edge detection texture (RG8 format for horizontal/vertical edges)
    this.edgesTexture = device.createTexture({
      label: 'smaa-edges-texture',
      size: { width, height },
      format: 'rg8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    // Create blend weights texture (RGBA8 for all blend channels)
    this.blendWeightsTexture = device.createTexture({
      label: 'smaa-blend-weights-texture',
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    this.textureSize = { width, height }
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.edgeDetectionPipeline ||
      !this.blendWeightPipeline ||
      !this.neighborhoodBlendPipeline ||
      !this.edgeDetectionBindGroupLayout ||
      !this.blendWeightBindGroupLayout ||
      !this.neighborhoodBlendBindGroupLayout ||
      !this.edgeUniformBuffer ||
      !this.blendUniformBuffer ||
      !this.neighborhoodUniformBuffer ||
      !this.linearSampler ||
      !this.pointSampler
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)

    const { width, height } = ctx.size
    this.ensureTextures(this.device, width, height)

    if (!this.edgesTexture || !this.blendWeightsTexture) {
      return
    }

    const inputView = ctx.getTextureView('ldr-color')
    const outputView = ctx.getWriteTarget('final-color') ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // === Pass 1: Edge Detection ===
    const edgeUniformData = new Float32Array([
      width,
      height,
      this.threshold,
      0, // padding
    ])
    this.writeUniformBuffer(this.device, this.edgeUniformBuffer, edgeUniformData)

    const edgeBindGroup = this.createBindGroup(this.device, this.edgeDetectionBindGroupLayout, [
      { binding: 0, resource: { buffer: this.edgeUniformBuffer } },
      { binding: 1, resource: inputView },
      { binding: 2, resource: this.linearSampler },
    ])

    const edgePass = ctx.beginRenderPass({
      label: 'smaa-edge-detection',
      colorAttachments: [
        {
          view: this.edgesTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(edgePass, this.edgeDetectionPipeline, [edgeBindGroup])
    edgePass.end()

    // === Pass 2: Blending Weight Calculation ===
    const blendUniformData = new Float32Array([width, height, this.threshold, this.maxSearchSteps])
    this.writeUniformBuffer(this.device, this.blendUniformBuffer, blendUniformData)

    const blendBindGroup = this.createBindGroup(this.device, this.blendWeightBindGroupLayout, [
      { binding: 0, resource: { buffer: this.blendUniformBuffer } },
      { binding: 1, resource: this.edgesTexture.createView() },
      { binding: 2, resource: inputView },
      { binding: 3, resource: this.linearSampler },
      { binding: 4, resource: this.pointSampler },
    ])

    const blendPass = ctx.beginRenderPass({
      label: 'smaa-blend-weight',
      colorAttachments: [
        {
          view: this.blendWeightsTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(blendPass, this.blendWeightPipeline, [blendBindGroup])
    blendPass.end()

    // === Pass 3: Neighborhood Blending ===
    const neighborhoodUniformData = new Float32Array([
      width,
      height,
      0, // padding
      0, // padding
    ])
    this.writeUniformBuffer(this.device, this.neighborhoodUniformBuffer, neighborhoodUniformData)

    const neighborhoodBindGroup = this.createBindGroup(
      this.device,
      this.neighborhoodBlendBindGroupLayout,
      [
        { binding: 0, resource: { buffer: this.neighborhoodUniformBuffer } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.blendWeightsTexture.createView() },
        { binding: 3, resource: this.linearSampler },
      ]
    )

    const neighborhoodPass = ctx.beginRenderPass({
      label: 'smaa-neighborhood-blend',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(neighborhoodPass, this.neighborhoodBlendPipeline, [neighborhoodBindGroup])
    neighborhoodPass.end()
  }

  /**
   * Release internal GPU resources when pass is disabled.
   */
  releaseInternalResources(): void {
    this.edgesTexture?.destroy()
    this.blendWeightsTexture?.destroy()
    this.edgesTexture = null
    this.blendWeightsTexture = null
    this.textureSize = { width: 0, height: 0 }
  }

  dispose(): void {
    // Destroy textures
    this.edgesTexture?.destroy()
    this.blendWeightsTexture?.destroy()
    this.edgesTexture = null
    this.blendWeightsTexture = null

    // Destroy uniform buffers
    this.edgeUniformBuffer?.destroy()
    this.blendUniformBuffer?.destroy()
    this.neighborhoodUniformBuffer?.destroy()
    this.edgeUniformBuffer = null
    this.blendUniformBuffer = null
    this.neighborhoodUniformBuffer = null

    // Clear samplers (GPU handles cleanup)
    this.linearSampler = null
    this.pointSampler = null

    // Clear pipelines and layouts
    this.edgeDetectionPipeline = null
    this.blendWeightPipeline = null
    this.neighborhoodBlendPipeline = null
    this.edgeDetectionBindGroupLayout = null
    this.blendWeightBindGroupLayout = null
    this.neighborhoodBlendBindGroupLayout = null

    super.dispose()
  }
}
