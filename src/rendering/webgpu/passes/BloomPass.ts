/**
 * WebGPU Bloom Pass
 *
 * Multi-scale bloom effect matching Three.js UnrealBloomPass quality.
 * Uses 5 MIP levels with progressive downsampling, per-level Gaussian blur,
 * and weighted composite with lerpBloomFactor.
 *
 * Architecture:
 * 1. Threshold: HDR-aware brightness extraction (normalized by hdrPeak)
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
const KERNEL_SIZES = [3, 5, 7, 9, 11] as const

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
  /** Threshold smoothing / knee (default: 0.1) */
  knee?: number
  /** Bloom strength / intensity (default: 0.5) */
  intensity?: number
  /** Bloom radius - interpolates MIP level weights (default: 0.4) */
  radius?: number
  /** Number of active blur levels 1-5 (default: 5) */
  levels?: number
  /** HDR peak luminance for normalization (default: 5.0) */
  hdrPeak?: number
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

  // Sampler
  private sampler: GPUSampler | null = null

  // MIP chain textures
  private thresholdTexture: GPUTexture | null = null
  private horizontalTextures: GPUTexture[] = []
  private verticalTextures: GPUTexture[] = []
  private textureSize = { width: 0, height: 0 }

  // Configurable resources
  private inputResource: string
  private outputResource: string

  // Parameters matching WebGL defaults from visualDefaults.ts
  private threshold = 0.8
  private knee = 0.1
  private intensity = 0.5
  private radius = 0.4
  private levels = 5
  private hdrPeak = 5.0

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
    if (options?.hdrPeak !== undefined) this.hdrPeak = options.hdrPeak

    this.precomputeGaussianCoefficients()
  }

  /**
   * Precompute normalized Gaussian coefficients for each MIP level.
   * Matches UnrealBloomPass formula:
   *   gaussian(x) = 0.39894 * exp(-0.5 * x^2 / sigma^2) / sigma
   *   sigma = kernelRadius / 3
   */
  private precomputeGaussianCoefficients(): void {
    this.gaussianCoefficients = []

    for (let level = 0; level < NUM_MIPS; level++) {
      const kernelRadius = KERNEL_SIZES[level]!
      const sigma = kernelRadius / 3.0
      const coeffs = new Float32Array(12) // Max 12 slots (center + 11 offsets)
      let sum = 0

      // Compute Gaussian weights
      for (let i = 0; i <= kernelRadius; i++) {
        coeffs[i] = (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma
        sum += i === 0 ? coeffs[i]! : 2 * coeffs[i]!
      }

      // Normalize so weights sum to 1.0
      if (sum > 0) {
        for (let i = 0; i <= kernelRadius; i++) {
          coeffs[i] = coeffs[i]! / sum
        }
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

    // Threshold: 16 bytes (threshold, knee, hdrPeak, padding)
    this.thresholdUB = this.createUniformBuffer(device, 16, 'bloom-threshold-ub')

    // Composite: 48 bytes (strength, radius, pad, pad, factors[4], factor4+pad[3])
    this.compositeUB = this.createUniformBuffer(device, 48, 'bloom-composite-ub')

    // 10 blur uniform buffers: 5 levels x 2 directions, each 64 bytes
    // Separate buffers avoid queue.writeBuffer overwrite bug
    this.blurUBs = []
    for (let level = 0; level < NUM_MIPS; level++) {
      for (let dir = 0; dir < 2; dir++) {
        const label = `bloom-blur-ub-L${level}-${dir === 0 ? 'H' : 'V'}`
        this.blurUBs.push(this.createUniformBuffer(device, 64, label))
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

    // Create MIP chain textures at progressively halved resolutions
    // Level 0: width/2, Level 1: width/4, ... Level 4: width/32
    for (let i = 0; i < NUM_MIPS; i++) {
      const mipWidth = Math.max(1, Math.floor(width / Math.pow(2, i + 1)))
      const mipHeight = Math.max(1, Math.floor(height / Math.pow(2, i + 1)))

      const desc = {
        size: { width: mipWidth, height: mipHeight },
        format: 'rgba16float' as const,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }

      this.horizontalTextures.push(device.createTexture({ ...desc, label: `bloom-H-L${i}` }))
      this.verticalTextures.push(device.createTexture({ ...desc, label: `bloom-V-L${i}` }))
    }

    // Threshold texture at level 0 resolution (same as MIP 0)
    const threshW = Math.max(1, Math.floor(width / 2))
    const threshH = Math.max(1, Math.floor(height / 2))
    this.thresholdTexture = device.createTexture({
      label: 'bloom-threshold-tex',
      size: { width: threshW, height: threshH },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    this.textureSize = { width, height }

    // Write blur uniforms (constant for this resolution)
    this.writeBlurUniforms(device)
  }

  /**
   * Write all 10 blur uniform buffers with direction, texel size, and Gaussian coefficients.
   * Called once when textures are (re)created. These values are constant per resize.
   * @param device - GPU device
   */
  private writeBlurUniforms(device: GPUDevice): void {
    for (let level = 0; level < NUM_MIPS; level++) {
      const mipWidth = Math.max(1, Math.floor(this.textureSize.width / Math.pow(2, level + 1)))
      const mipHeight = Math.max(1, Math.floor(this.textureSize.height / Math.pow(2, level + 1)))

      const coeffs = this.gaussianCoefficients[level]!

      for (let dir = 0; dir < 2; dir++) {
        const bufferIndex = level * 2 + dir
        const buffer = this.blurUBs[bufferIndex]!

        // Layout: direction(vec2f) + texelSize(vec2f) + coefficients(array<vec4f, 3>)
        const data = new Float32Array([
          dir === 0 ? 1 : 0,
          dir === 0 ? 0 : 1, // direction
          1 / mipWidth,
          1 / mipHeight, // texelSize
          coeffs[0]!,
          coeffs[1]!,
          coeffs[2]!,
          coeffs[3]!, // coefficients[0]
          coeffs[4]!,
          coeffs[5]!,
          coeffs[6]!,
          coeffs[7]!, // coefficients[1]
          coeffs[8]!,
          coeffs[9]!,
          coeffs[10]!,
          coeffs[11]!, // coefficients[2]
        ])

        this.writeUniformBuffer(device, buffer, data)
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
      this.horizontalTextures.length < NUM_MIPS ||
      this.verticalTextures.length < NUM_MIPS
    ) {
      return
    }

    const inputView = ctx.getTextureView(this.inputResource)
    const outputView = ctx.getWriteTarget(this.outputResource) ?? ctx.getCanvasTextureView()

    if (!inputView) return

    // === Pass 1: Brightness Threshold ===
    const thresholdData = new Float32Array([this.threshold, this.knee, this.hdrPeak, 0])
    this.writeUniformBuffer(this.device, this.thresholdUB, thresholdData)

    const thresholdBG = this.createBindGroup(this.device, this.thresholdBGL, [
      { binding: 0, resource: { buffer: this.thresholdUB } },
      { binding: 1, resource: inputView },
      { binding: 2, resource: this.sampler },
    ])

    const thresholdPass = ctx.beginRenderPass({
      label: 'bloom-threshold',
      colorAttachments: [
        {
          view: this.thresholdTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    this.renderFullscreen(thresholdPass, this.thresholdPipeline, [thresholdBG])
    thresholdPass.end()

    // === Pass 2: Progressive MIP Chain Blur ===
    // Each level reads from previous level's vertical output (progressive cascade).
    // Level 0 reads from threshold. Resolution halves at each level due to texture size.
    for (let level = 0; level < NUM_MIPS; level++) {
      const pipeline = this.blurPipelines[level]!

      // Horizontal blur input: threshold for level 0, previous vertical for others
      const hReadTexture = level === 0 ? this.thresholdTexture : this.verticalTextures[level - 1]!

      const hBufferIdx = level * 2
      const hBG = this.createBindGroup(this.device, this.blurBGL, [
        { binding: 0, resource: { buffer: this.blurUBs[hBufferIdx]! } },
        { binding: 1, resource: hReadTexture.createView() },
        { binding: 2, resource: this.sampler },
      ])

      const hPass = ctx.beginRenderPass({
        label: `bloom-blur-H-L${level}`,
        colorAttachments: [
          {
            view: this.horizontalTextures[level]!.createView(),
            loadOp: 'clear' as GPULoadOp,
            storeOp: 'store' as GPUStoreOp,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(hPass, pipeline, [hBG])
      hPass.end()

      // Vertical blur: reads horizontal output, writes to vertical
      const vBufferIdx = level * 2 + 1
      const vBG = this.createBindGroup(this.device, this.blurBGL, [
        { binding: 0, resource: { buffer: this.blurUBs[vBufferIdx]! } },
        { binding: 1, resource: this.horizontalTextures[level]!.createView() },
        { binding: 2, resource: this.sampler },
      ])

      const vPass = ctx.beginRenderPass({
        label: `bloom-blur-V-L${level}`,
        colorAttachments: [
          {
            view: this.verticalTextures[level]!.createView(),
            loadOp: 'clear' as GPULoadOp,
            storeOp: 'store' as GPUStoreOp,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      this.renderFullscreen(vPass, pipeline, [vBG])
      vPass.end()
    }

    // === Pass 3: Composite ===
    // Compute bloom factors matching WebGL: baseFactors * mipScale * levelScale
    const baseFactors = [1.0, 0.8, 0.6, 0.4, 0.2]
    const levelScale = this.levels / 5
    const factors = baseFactors.map((f, i) => {
      const mipScale = i < this.levels ? 1.0 : 0.0
      return f * mipScale * (i === 0 ? 1.0 : levelScale)
    })

    const compositeData = new Float32Array([
      this.intensity, // bloomStrength
      this.radius, // bloomRadius
      0,
      0, // padding
      factors[0]!,
      factors[1]!,
      factors[2]!,
      factors[3]!, // bloomFactors vec4
      factors[4]!,
      0,
      0,
      0, // bloomFactor4 vec4
    ])
    this.writeUniformBuffer(this.device, this.compositeUB, compositeData)

    const compositeBG = this.createBindGroup(this.device, this.compositeBGL, [
      { binding: 0, resource: { buffer: this.compositeUB } },
      { binding: 1, resource: inputView },
      { binding: 2, resource: this.verticalTextures[0]!.createView() },
      { binding: 3, resource: this.verticalTextures[1]!.createView() },
      { binding: 4, resource: this.verticalTextures[2]!.createView() },
      { binding: 5, resource: this.verticalTextures[3]!.createView() },
      { binding: 6, resource: this.verticalTextures[4]!.createView() },
      { binding: 7, resource: this.sampler },
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
    this.renderFullscreen(compositePass, this.compositePipeline, [compositeBG])
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
    this.horizontalTextures = []
    this.verticalTextures = []

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
    this.horizontalTextures = []
    this.verticalTextures = []

    super.dispose()
  }
}
