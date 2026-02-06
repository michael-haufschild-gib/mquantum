/**
 * WebGPU Bloom Pass
 *
 * Multi-scale bloom effect matching Three.js UnrealBloomPass quality.
 * Uses 5 MIP levels with progressive downsampling, per-level Gaussian blur,
 * and weighted composite with lerpBloomFactor.
 *
 * Architecture:
 * 1. Threshold: luminance high-pass extraction
 * 2. Progressive MIP chain: 5 levels at 1/2, 1/4, 1/8, 1/16, 1/32 resolution
 *    Each level does H+V separable Gaussian blur, reading from previous level
 * 3. Composite: Weighted blend of all 5 levels onto scene with 3.0x multiplier
 *
 * @module rendering/webgpu/passes/BloomPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  bloomThresholdShader,
  createBloomBlurShader,
  bloomCompositeShader,
} from '../shaders/postprocessing/bloom.wgsl'

/** Kernel sizes per MIP level matching UnrealBloomPass */
const KERNEL_SIZES = [6, 10, 14, 18, 22] as const

/** Packed coefficient slots (array<vec4f, 6> = 24 floats) */
const COEFF_SLOTS = 24

/** Number of MIP levels */
const NUM_MIPS = 5

/**
 * Configuration options for the bloom pass.
 */
export interface BloomPassOptions {
  /** Input resource ID (default: 'hdr-color') */
  inputResource?: string
  /** Output resource ID (default: 'bloom-output') */
  outputResource?: string
  /** Luminance threshold, normalized 0-1 (default: 0.8) */
  threshold?: number
  /** Threshold smoothing / knee (default: 0.01) */
  knee?: number
  /** Bloom strength / intensity (default: 0.5) */
  intensity?: number
  /** Bloom radius - interpolates MIP level weights (default: 0.4) */
  radius?: number
  /** Number of active blur levels 1-5 (default: 5) */
  levels?: number
}

/**
 * Multi-scale bloom effect with 5 MIP levels.
 * Matches UnrealBloomPass visual quality and parameterization.
 */
export class BloomPass extends WebGPUBasePass {
  // Pipelines
  private thresholdPipeline: GPURenderPipeline | null = null
  private blurPipelines: (GPURenderPipeline | null)[] = new Array(NUM_MIPS).fill(null)
  private compositePipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private thresholdBGL: GPUBindGroupLayout | null = null
  private blurBGL: GPUBindGroupLayout | null = null
  private compositeBGL: GPUBindGroupLayout | null = null

  // Uniform buffers
  private thresholdUB: GPUBuffer | null = null
  private blurUBs: GPUBuffer[] = [] // 10 buffers (5 levels x 2 directions)
  private compositeUB: GPUBuffer | null = null
  private thresholdUniformData = new Float32Array(4)
  private compositeUniformData = new Float32Array(12)
  private blurUniformScratch = new Float32Array(4 + COEFF_SLOTS)

  // Sampler
  private sampler: GPUSampler | null = null

  // MIP chain textures
  private thresholdTexture: GPUTexture | null = null
  private thresholdTextureView: GPUTextureView | null = null
  private horizontalTextures: GPUTexture[] = []
  private verticalTextures: GPUTexture[] = []
  private horizontalTextureViews: GPUTextureView[] = []
  private verticalTextureViews: GPUTextureView[] = []
  private textureSize = { width: 0, height: 0 }

  // Cached bind groups
  private thresholdBindGroup: GPUBindGroup | null = null
  private thresholdBindGroupInputView: GPUTextureView | null = null
  private blurHBindGroups: (GPUBindGroup | null)[] = new Array(NUM_MIPS).fill(null)
  private blurVBindGroups: (GPUBindGroup | null)[] = new Array(NUM_MIPS).fill(null)
  private blurHBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_MIPS).fill(null)
  private blurVBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_MIPS).fill(null)
  private compositeBindGroup: GPUBindGroup | null = null
  private compositeBindGroupInputView: GPUTextureView | null = null

  // Configurable resources
  private inputResource: string
  private outputResource: string

  // Parameters matching WebGL defaults from visualDefaults.ts
  private threshold = 0.8
  private knee = 0.01
  private intensity = 0.5
  private radius = 0.4
  private levels = 5
  private lastThreshold = Number.NaN
  private lastKnee = Number.NaN
  private lastIntensity = Number.NaN
  private lastRadius = Number.NaN
  private lastLevels = -1

  // Precomputed Gaussian coefficients per MIP level
  private gaussianCoefficients: Float32Array[] = []

  constructor(options?: BloomPassOptions) {
    const inputResource = options?.inputResource ?? 'hdr-color'
    const outputResource = options?.outputResource ?? 'bloom-output'

    super({
      id: 'bloom',
      priority: 800,
      inputs: [{ resourceId: inputResource, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.inputResource = inputResource
    this.outputResource = outputResource

    if (options?.threshold !== undefined) this.threshold = options.threshold
    if (options?.knee !== undefined) this.knee = options.knee
    if (options?.intensity !== undefined) this.intensity = options.intensity
    if (options?.radius !== undefined) this.radius = options.radius
    if (options?.levels !== undefined) this.levels = options.levels

    this.precomputeGaussianCoefficients()
  }

  /**
   * Precompute Gaussian coefficients for each MIP level.
   * Matches UnrealBloomPass formula:
   *   gaussian(x) = 0.39894 * exp(-0.5 * x^2 / sigma^2) / sigma
   *   sigma = kernelRadius / 3
   */
  private precomputeGaussianCoefficients(): void {
    this.gaussianCoefficients = []

    for (let level = 0; level < NUM_MIPS; level++) {
      const kernelRadius = KERNEL_SIZES[level]!
      const sigma = kernelRadius / 3.0
      const coeffs = new Float32Array(COEFF_SLOTS)

      // Matches UnrealBloomPass: i in [0, kernelRadius), no post-normalization step.
      for (let i = 0; i < kernelRadius; i++) {
        coeffs[i] = (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma
      }

      // Slots beyond kernelRadius remain 0 (no contribution)
      this.gaussianCoefficients.push(coeffs)
    }
  }

  /**
   * Update pass properties from Zustand stores.
   * @param ctx - Render context with store access
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as
      | {
          bloomIntensity?: number
          bloomThreshold?: number
          bloomSmoothing?: number
          bloomRadius?: number
          bloomLevels?: number
        }
      | undefined

    if (!postProcessing) return

    if (postProcessing.bloomIntensity !== undefined) {
      this.intensity = postProcessing.bloomIntensity
    }
    if (postProcessing.bloomThreshold !== undefined) {
      this.threshold = postProcessing.bloomThreshold
    }
    if (postProcessing.bloomSmoothing !== undefined) {
      this.knee = postProcessing.bloomSmoothing
    }
    if (postProcessing.bloomRadius !== undefined) {
      this.radius = postProcessing.bloomRadius
    }
    if (postProcessing.bloomLevels !== undefined) {
      this.levels = Math.max(1, Math.min(5, Math.round(postProcessing.bloomLevels)))
    }
  }

  /**
   * Create all GPU pipelines, bind group layouts, and uniform buffers.
   * @param ctx - Setup context with device and format
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Sampler for bilinear filtering (handles downsampling between MIP levels)
    this.sampler = device.createSampler({
      label: 'bloom-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // --- Bind Group Layouts ---

    // Threshold: uniform + texture + sampler
    this.thresholdBGL = device.createBindGroupLayout({
      label: 'bloom-threshold-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Blur: uniform + texture + sampler (shared across all 5 blur pipelines)
    this.blurBGL = device.createBindGroupLayout({
      label: 'bloom-blur-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Composite: uniform + scene + 5 mips + sampler (8 bindings)
    this.compositeBGL = device.createBindGroupLayout({
      label: 'bloom-composite-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // --- Uniform Buffers ---

    // Threshold: 16 bytes (threshold, knee, padding, padding)
    this.thresholdUB = this.createUniformBuffer(device, 16, 'bloom-threshold-ub')

    // Composite: 48 bytes (strength, radius, pad, pad, factors[4], factor4+pad[3])
    this.compositeUB = this.createUniformBuffer(device, 48, 'bloom-composite-ub')

    // 10 blur uniform buffers: 5 levels x 2 directions, each 112 bytes
    // Separate buffers avoid queue.writeBuffer overwrite bug
    this.blurUBs = []
    for (let level = 0; level < NUM_MIPS; level++) {
      for (let dir = 0; dir < 2; dir++) {
        const label = `bloom-blur-ub-L${level}-${dir === 0 ? 'H' : 'V'}`
        this.blurUBs.push(this.createUniformBuffer(device, 112, label))
      }
    }

    // --- Pipelines ---

    // Threshold pipeline
    const thresholdModule = this.createShaderModule(
      device,
      bloomThresholdShader,
      'bloom-threshold-shader'
    )
    this.thresholdPipeline = this.createFullscreenPipeline(
      device,
      thresholdModule,
      [this.thresholdBGL],
      'rgba16float',
      { label: 'bloom-threshold' }
    )

    // 5 blur pipelines (one per MIP level, different kernel sizes for optimal perf)
    for (let i = 0; i < NUM_MIPS; i++) {
      const blurCode = createBloomBlurShader(KERNEL_SIZES[i]!)
      const blurModule = this.createShaderModule(device, blurCode, `bloom-blur-L${i}-shader`)
      this.blurPipelines[i] = this.createFullscreenPipeline(
        device,
        blurModule,
        [this.blurBGL],
        'rgba16float',
        { label: `bloom-blur-L${i}` }
      )
    }

    // Composite pipeline
    const compositeModule = this.createShaderModule(
      device,
      bloomCompositeShader,
      'bloom-composite-shader'
    )
    this.compositePipeline = this.createFullscreenPipeline(
      device,
      compositeModule,
      [this.compositeBGL],
      'rgba16float',
      { label: 'bloom-composite' }
    )
  }

  /**
   * Ensure MIP chain textures exist at correct sizes.
   * Creates threshold texture + 5 horizontal/vertical pairs at progressive resolutions.
   * Also writes blur uniform buffers (constant for a given resolution).
   * @param device - GPU device
   * @param width - Canvas width
   * @param height - Canvas height
   */
  private ensureTextures(device: GPUDevice, width: number, height: number): void {
    if (this.textureSize.width === width && this.textureSize.height === height) {
      return
    }

    // Destroy old textures
    this.thresholdTexture?.destroy()
    for (const tex of this.horizontalTextures) tex?.destroy()
    for (const tex of this.verticalTextures) tex?.destroy()

    this.horizontalTextures = []
    this.verticalTextures = []
    this.horizontalTextureViews = []
    this.verticalTextureViews = []

    // Create MIP chain textures at progressively halved resolutions
    // Level 0: width/2, Level 1: width/4, ... Level 4: width/32
    for (let i = 0; i < NUM_MIPS; i++) {
      const mipWidth = Math.max(1, Math.round(width / Math.pow(2, i + 1)))
      const mipHeight = Math.max(1, Math.round(height / Math.pow(2, i + 1)))

      const desc = {
        size: { width: mipWidth, height: mipHeight },
        format: 'rgba16float' as const,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }

      this.horizontalTextures.push(device.createTexture({ ...desc, label: `bloom-H-L${i}` }))
      this.verticalTextures.push(device.createTexture({ ...desc, label: `bloom-V-L${i}` }))
      this.horizontalTextureViews.push(this.horizontalTextures[i]!.createView())
      this.verticalTextureViews.push(this.verticalTextures[i]!.createView())
    }

    // Threshold texture at level 0 resolution (same as MIP 0)
    const threshW = Math.max(1, Math.round(width / 2))
    const threshH = Math.max(1, Math.round(height / 2))
    this.thresholdTexture = device.createTexture({
      label: 'bloom-threshold-tex',
      size: { width: threshW, height: threshH },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.thresholdTextureView = this.thresholdTexture.createView()

    this.textureSize = { width, height }
    this.invalidateBindGroups()

    // Write blur uniforms (constant for this resolution)
    this.writeBlurUniforms(device)
  }

  private invalidateBindGroups(): void {
    this.thresholdBindGroup = null
    this.thresholdBindGroupInputView = null
    this.compositeBindGroup = null
    this.compositeBindGroupInputView = null
    this.blurHBindGroups.fill(null)
    this.blurVBindGroups.fill(null)
    this.blurHBindGroupInputViews.fill(null)
    this.blurVBindGroupInputViews.fill(null)
  }

  /**
   * Write all 10 blur uniform buffers with direction, texel size, and Gaussian coefficients.
   * Called once when textures are (re)created. These values are constant per resize.
   * @param device - GPU device
   */
  private writeBlurUniforms(device: GPUDevice): void {
    for (let level = 0; level < NUM_MIPS; level++) {
      const mipWidth = Math.max(1, Math.round(this.textureSize.width / Math.pow(2, level + 1)))
      const mipHeight = Math.max(1, Math.round(this.textureSize.height / Math.pow(2, level + 1)))

      const coeffs = this.gaussianCoefficients[level]!

      for (let dir = 0; dir < 2; dir++) {
        const bufferIndex = level * 2 + dir
        const buffer = this.blurUBs[bufferIndex]!

        // Layout: direction(vec2f) + texelSize(vec2f) + coefficients(array<vec4f, 6>)
        this.blurUniformScratch.fill(0)
        this.blurUniformScratch[0] = dir === 0 ? 1 : 0
        this.blurUniformScratch[1] = dir === 0 ? 0 : 1
        this.blurUniformScratch[2] = 1 / mipWidth
        this.blurUniformScratch[3] = 1 / mipHeight
        for (let i = 0; i < COEFF_SLOTS; i++) {
          this.blurUniformScratch[4 + i] = coeffs[i]!
        }

        this.writeUniformBuffer(device, buffer, this.blurUniformScratch)
      }
    }
  }

  /**
   * Execute the bloom pass: threshold → progressive blur → composite.
   * @param ctx - Render context
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.thresholdPipeline ||
      !this.compositePipeline ||
      !this.thresholdBGL ||
      !this.blurBGL ||
      !this.compositeBGL ||
      !this.thresholdUB ||
      !this.compositeUB ||
      !this.sampler
    ) {
      return
    }

    // Verify all blur pipelines exist
    for (let i = 0; i < NUM_MIPS; i++) {
      if (!this.blurPipelines[i]) return
    }

    // Update parameters from stores
    this.updateFromStores(ctx)

    const { width, height } = ctx.size
    this.ensureTextures(this.device, width, height)

    if (
      !this.thresholdTexture ||
      !this.thresholdTextureView ||
      this.horizontalTextures.length < NUM_MIPS ||
      this.verticalTextures.length < NUM_MIPS ||
      this.horizontalTextureViews.length < NUM_MIPS ||
      this.verticalTextureViews.length < NUM_MIPS
    ) {
      return
    }

    const inputView = ctx.getTextureView(this.inputResource)
    const outputView = ctx.getWriteTarget(this.outputResource) ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // === Pass 1: Brightness Threshold ===
    if (this.threshold !== this.lastThreshold || this.knee !== this.lastKnee) {
      this.thresholdUniformData[0] = this.threshold
      this.thresholdUniformData[1] = this.knee
      this.thresholdUniformData[2] = 0
      this.thresholdUniformData[3] = 0
      this.writeUniformBuffer(this.device, this.thresholdUB, this.thresholdUniformData)
      this.lastThreshold = this.threshold
      this.lastKnee = this.knee
    }

    if (!this.thresholdBindGroup || this.thresholdBindGroupInputView !== inputView) {
      this.thresholdBindGroup = this.createBindGroup(this.device, this.thresholdBGL, [
        { binding: 0, resource: { buffer: this.thresholdUB } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.sampler },
      ])
      this.thresholdBindGroupInputView = inputView
    }

    const thresholdPass = ctx.beginRenderPass({
      label: 'bloom-threshold',
      colorAttachments: [
        {
          view: this.thresholdTextureView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(thresholdPass, this.thresholdPipeline, [this.thresholdBindGroup])
    thresholdPass.end()

    // === Pass 2: Progressive MIP Chain Blur ===
    // Each level reads from previous level's vertical output (progressive cascade).
    // Level 0 reads from threshold. Resolution halves at each level due to texture size.
    for (let level = 0; level < NUM_MIPS; level++) {
      const pipeline = this.blurPipelines[level]!

      // Horizontal blur input: threshold for level 0, previous vertical for others
      const hReadView = level === 0 ? this.thresholdTextureView : this.verticalTextureViews[level - 1]!

      const hBufferIdx = level * 2
      if (!this.blurHBindGroups[level] || this.blurHBindGroupInputViews[level] !== hReadView) {
        this.blurHBindGroups[level] = this.createBindGroup(this.device, this.blurBGL, [
          { binding: 0, resource: { buffer: this.blurUBs[hBufferIdx]! } },
          { binding: 1, resource: hReadView },
          { binding: 2, resource: this.sampler },
        ])
        this.blurHBindGroupInputViews[level] = hReadView
      }

      const hPass = ctx.beginRenderPass({
        label: `bloom-blur-H-L${level}`,
        colorAttachments: [
          {
            view: this.horizontalTextureViews[level]!,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(hPass, pipeline, [this.blurHBindGroups[level]!])
      hPass.end()

      // Vertical blur: reads horizontal output, writes to vertical
      const vBufferIdx = level * 2 + 1
      const vReadView = this.horizontalTextureViews[level]!
      if (!this.blurVBindGroups[level] || this.blurVBindGroupInputViews[level] !== vReadView) {
        this.blurVBindGroups[level] = this.createBindGroup(this.device, this.blurBGL, [
          { binding: 0, resource: { buffer: this.blurUBs[vBufferIdx]! } },
          { binding: 1, resource: vReadView },
          { binding: 2, resource: this.sampler },
        ])
        this.blurVBindGroupInputViews[level] = vReadView
      }

      const vPass = ctx.beginRenderPass({
        label: `bloom-blur-V-L${level}`,
        colorAttachments: [
          {
            view: this.verticalTextureViews[level]!,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(vPass, pipeline, [this.blurVBindGroups[level]!])
      vPass.end()
    }

    // === Pass 3: Composite ===
    // Compute bloom factors matching UnrealBloomPass base factors.
    // "levels" masks out high mips but does not re-scale remaining factors.
    const baseFactors = [1.0, 0.8, 0.6, 0.4, 0.2]
    const factors = baseFactors.map((f, i) => (i < this.levels ? f : 0.0))

    if (
      this.intensity !== this.lastIntensity ||
      this.radius !== this.lastRadius ||
      this.levels !== this.lastLevels
    ) {
      this.compositeUniformData[0] = this.intensity
      this.compositeUniformData[1] = this.radius
      this.compositeUniformData[2] = 0
      this.compositeUniformData[3] = 0
      this.compositeUniformData[4] = factors[0]!
      this.compositeUniformData[5] = factors[1]!
      this.compositeUniformData[6] = factors[2]!
      this.compositeUniformData[7] = factors[3]!
      this.compositeUniformData[8] = factors[4]!
      this.compositeUniformData[9] = 0
      this.compositeUniformData[10] = 0
      this.compositeUniformData[11] = 0
      this.writeUniformBuffer(this.device, this.compositeUB, this.compositeUniformData)
      this.lastIntensity = this.intensity
      this.lastRadius = this.radius
      this.lastLevels = this.levels
    }

    if (!this.compositeBindGroup || this.compositeBindGroupInputView !== inputView) {
      this.compositeBindGroup = this.createBindGroup(this.device, this.compositeBGL, [
        { binding: 0, resource: { buffer: this.compositeUB } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.verticalTextureViews[0]! },
        { binding: 3, resource: this.verticalTextureViews[1]! },
        { binding: 4, resource: this.verticalTextureViews[2]! },
        { binding: 5, resource: this.verticalTextureViews[3]! },
        { binding: 6, resource: this.verticalTextureViews[4]! },
        { binding: 7, resource: this.sampler },
      ])
      this.compositeBindGroupInputView = inputView
    }

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
    this.renderFullscreen(compositePass, this.compositePipeline, [this.compositeBindGroup])
    compositePass.end()
  }

  /**
   * Release internal GPU resources when pass is disabled.
   * Called by RenderGraph after grace period. Keeps pipelines to avoid recompilation.
   */
  releaseInternalResources(): void {
    this.thresholdTexture?.destroy()
    for (const tex of this.horizontalTextures) tex?.destroy()
    for (const tex of this.verticalTextures) tex?.destroy()

    this.thresholdTexture = null
    this.thresholdTextureView = null
    this.horizontalTextures = []
    this.verticalTextures = []
    this.horizontalTextureViews = []
    this.verticalTextureViews = []
    this.invalidateBindGroups()

    // Reset size tracking to trigger reallocation on next execute()
    this.textureSize = { width: 0, height: 0 }
  }

  /**
   * Cleanup all GPU resources.
   */
  dispose(): void {
    this.thresholdUB?.destroy()
    this.compositeUB?.destroy()
    for (const buf of this.blurUBs) buf?.destroy()
    this.thresholdTexture?.destroy()
    for (const tex of this.horizontalTextures) tex?.destroy()
    for (const tex of this.verticalTextures) tex?.destroy()

    this.thresholdUB = null
    this.compositeUB = null
    this.blurUBs = []
    this.thresholdTexture = null
    this.thresholdTextureView = null
    this.horizontalTextures = []
    this.verticalTextures = []
    this.horizontalTextureViews = []
    this.verticalTextureViews = []
    this.invalidateBindGroups()

    super.dispose()
  }
}
