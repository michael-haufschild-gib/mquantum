/**
 * WebGPU SMAA Pass
 *
 * Subpixel Morphological Anti-Aliasing for high-quality edge smoothing.
 * A three-pass technique: edge detection, blending weight calculation, and neighborhood blending.
 *
 * Based on the SMAA paper by Jimenez et al. (2012)
 *
 * Uses custom pipeline creation (not the base class createFullscreenPipeline) because
 * each SMAA sub-pass has its own vertex shader with custom inter-stage varyings
 * (offset0, offset1, offset2, pixcoord) that the base class vertex shader doesn't provide.
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
  /** Input color resource (default: 'ldr-color') */
  colorInput?: string
  /** Output resource (default: 'final-color') */
  outputResource?: string
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

  // Bind group layouts for each pass
  private edgeDetectionBindGroupLayout: GPUBindGroupLayout | null = null
  private blendWeightBindGroupLayout: GPUBindGroupLayout | null = null
  private neighborhoodBlendBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffers
  private edgeUniformBuffer: GPUBuffer | null = null
  private blendUniformBuffer: GPUBuffer | null = null
  private neighborhoodUniformBuffer: GPUBuffer | null = null
  private edgeUniformData = new Float32Array(4)
  private blendUniformData = new Float32Array(4)
  private neighborhoodUniformData = new Float32Array(4)

  // Samplers
  private linearSampler: GPUSampler | null = null
  private pointSampler: GPUSampler | null = null

  // Intermediate textures
  private edgesTexture: GPUTexture | null = null
  private blendWeightsTexture: GPUTexture | null = null
  private edgesTextureView: GPUTextureView | null = null
  private blendWeightsTextureView: GPUTextureView | null = null
  private textureSize = { width: 0, height: 0 }
  private edgeBindGroup: GPUBindGroup | null = null
  private edgeBindGroupInputView: GPUTextureView | null = null
  private blendBindGroup: GPUBindGroup | null = null
  private blendBindGroupInputView: GPUTextureView | null = null
  private neighborhoodBindGroup: GPUBindGroup | null = null
  private neighborhoodBindGroupInputView: GPUTextureView | null = null

  // Settings
  private threshold = 0.1
  private maxSearchSteps = 16

  // Configurable resources
  private readonly colorInputId: string
  private readonly outputResourceId: string

  constructor(options?: SMAAPassOptions) {
    const colorInput = options?.colorInput ?? 'ldr-color'
    const outputResource = options?.outputResource ?? 'final-color'

    super({
      id: 'smaa',
      priority: 950, // After tonemapping, same priority as FXAA
      inputs: [{ resourceId: colorInput, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.colorInputId = colorInput
    this.outputResourceId = outputResource

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
   * Create a render pipeline using the shader module's own vertex and fragment entry points.
   * Unlike createFullscreenPipeline, this preserves custom SMAA vertex shaders with
   * inter-stage varyings (offsets, pixcoord) needed by the fragment shaders.
   */
  private createSMAAPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayout: GPUBindGroupLayout,
    colorFormat: GPUTextureFormat,
    label: string
  ): GPURenderPipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: `${label}-pipeline-layout`,
      bindGroupLayouts: [bindGroupLayout],
    })

    return device.createRenderPipeline({
      label: `${label}-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        // No vertex buffer layout - SMAA uses @builtin(vertex_index)
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: colorFormat,
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

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

    this.edgeDetectionPipeline = this.createSMAAPipeline(
      device,
      edgeShaderModule,
      this.edgeDetectionBindGroupLayout,
      'rg8unorm', // Edge texture only needs R and G channels
      'smaa-edge-detection'
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

    this.blendWeightPipeline = this.createSMAAPipeline(
      device,
      blendShaderModule,
      this.blendWeightBindGroupLayout,
      'rgba8unorm', // Blend weights need all 4 channels
      'smaa-blend-weight'
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

    // Use rgba8unorm for LDR final-color output buffer
    this.neighborhoodBlendPipeline = this.createSMAAPipeline(
      device,
      neighborhoodShaderModule,
      this.neighborhoodBlendBindGroupLayout,
      'rgba8unorm',
      'smaa-neighborhood-blend'
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
    this.edgesTextureView = this.edgesTexture.createView()

    // Create blend weights texture (RGBA8 for all blend channels)
    this.blendWeightsTexture = device.createTexture({
      label: 'smaa-blend-weights-texture',
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.blendWeightsTextureView = this.blendWeightsTexture.createView()

    this.textureSize = { width, height }
    this.invalidateBindGroups()
  }

  private invalidateBindGroups(): void {
    this.edgeBindGroup = null
    this.edgeBindGroupInputView = null
    this.blendBindGroup = null
    this.blendBindGroupInputView = null
    this.neighborhoodBindGroup = null
    this.neighborhoodBindGroupInputView = null
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

    const { width, height } = ctx.size
    this.ensureTextures(this.device, width, height)

    if (
      !this.edgesTexture ||
      !this.blendWeightsTexture ||
      !this.edgesTextureView ||
      !this.blendWeightsTextureView
    ) {
      return
    }

    const inputView = ctx.getTextureView(this.colorInputId)
    const outputView = ctx.getWriteTarget(this.outputResourceId) ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // === Pass 1: Edge Detection ===
    this.edgeUniformData[0] = width
    this.edgeUniformData[1] = height
    this.edgeUniformData[2] = this.threshold
    this.edgeUniformData[3] = 0
    this.writeUniformBuffer(this.device, this.edgeUniformBuffer, this.edgeUniformData)

    if (!this.edgeBindGroup || this.edgeBindGroupInputView !== inputView) {
      this.edgeBindGroup = this.createBindGroup(this.device, this.edgeDetectionBindGroupLayout, [
        { binding: 0, resource: { buffer: this.edgeUniformBuffer } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.linearSampler },
      ])
      this.edgeBindGroupInputView = inputView
    }

    const edgePass = ctx.beginRenderPass({
      label: 'smaa-edge-detection',
      colorAttachments: [
        {
          view: this.edgesTextureView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    edgePass.setPipeline(this.edgeDetectionPipeline)
    edgePass.setBindGroup(0, this.edgeBindGroup)
    edgePass.draw(3, 1, 0, 0) // Fullscreen triangle via vertex_index
    edgePass.end()

    // === Pass 2: Blending Weight Calculation ===
    this.blendUniformData[0] = width
    this.blendUniformData[1] = height
    this.blendUniformData[2] = this.threshold
    this.blendUniformData[3] = this.maxSearchSteps
    this.writeUniformBuffer(this.device, this.blendUniformBuffer, this.blendUniformData)

    if (!this.blendBindGroup || this.blendBindGroupInputView !== inputView) {
      this.blendBindGroup = this.createBindGroup(this.device, this.blendWeightBindGroupLayout, [
        { binding: 0, resource: { buffer: this.blendUniformBuffer } },
        { binding: 1, resource: this.edgesTextureView },
        { binding: 2, resource: inputView },
        { binding: 3, resource: this.linearSampler },
        { binding: 4, resource: this.pointSampler },
      ])
      this.blendBindGroupInputView = inputView
    }

    const blendPass = ctx.beginRenderPass({
      label: 'smaa-blend-weight',
      colorAttachments: [
        {
          view: this.blendWeightsTextureView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    blendPass.setPipeline(this.blendWeightPipeline)
    blendPass.setBindGroup(0, this.blendBindGroup)
    blendPass.draw(3, 1, 0, 0) // Fullscreen triangle via vertex_index
    blendPass.end()

    // === Pass 3: Neighborhood Blending ===
    this.neighborhoodUniformData[0] = width
    this.neighborhoodUniformData[1] = height
    this.neighborhoodUniformData[2] = 0
    this.neighborhoodUniformData[3] = 0
    this.writeUniformBuffer(this.device, this.neighborhoodUniformBuffer, this.neighborhoodUniformData)

    if (!this.neighborhoodBindGroup || this.neighborhoodBindGroupInputView !== inputView) {
      this.neighborhoodBindGroup = this.createBindGroup(
        this.device,
        this.neighborhoodBlendBindGroupLayout,
        [
          { binding: 0, resource: { buffer: this.neighborhoodUniformBuffer } },
          { binding: 1, resource: inputView },
          { binding: 2, resource: this.blendWeightsTextureView },
          { binding: 3, resource: this.linearSampler },
        ]
      )
      this.neighborhoodBindGroupInputView = inputView
    }

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
    neighborhoodPass.setPipeline(this.neighborhoodBlendPipeline)
    neighborhoodPass.setBindGroup(0, this.neighborhoodBindGroup)
    neighborhoodPass.draw(3, 1, 0, 0) // Fullscreen triangle via vertex_index
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
    this.edgesTextureView = null
    this.blendWeightsTextureView = null
    this.textureSize = { width: 0, height: 0 }
    this.invalidateBindGroups()
  }

  dispose(): void {
    // Destroy textures
    this.edgesTexture?.destroy()
    this.blendWeightsTexture?.destroy()
    this.edgesTexture = null
    this.blendWeightsTexture = null
    this.edgesTextureView = null
    this.blendWeightsTextureView = null

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
    this.invalidateBindGroups()

    super.dispose()
  }
}
