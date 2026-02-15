/**
 * WebGPU Bloom Pass (Bloom V2)
 *
 * Features:
 * 1. Gaussian mode: threshold -> progressive blur -> level-specialized composite
 * 2. Convolution mode: optional downsample + convolution composite
 * 3. Zero-strength fast path: single copy pass
 */

import type { BloomBandSettings, BloomMode } from '@/stores/defaults/visualDefaults'
import {
  DEFAULT_BLOOM_BANDS,
  DEFAULT_BLOOM_CONVOLUTION_BOOST,
  DEFAULT_BLOOM_CONVOLUTION_RADIUS,
  DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE,
  DEFAULT_BLOOM_CONVOLUTION_TINT,
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_MODE,
  DEFAULT_BLOOM_THRESHOLD,
} from '@/stores/defaults/visualDefaults'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { parseHexColorToLinearRgb } from '../utils/color'
import {
  bloomConvolutionCompositeShader,
  bloomCopyShader,
  bloomThresholdShader,
  createBloomBlurComputeShader,
  createBloomCompositeShader,
} from '../shaders/postprocessing/bloom.wgsl'

/** Kernel sizes per MIP level matching UnrealBloomPass. */
const KERNEL_SIZES = [6, 10, 14, 18, 22] as const
const NUM_MIPS = 5
/** Packed coefficient slots (array<vec4f, 6> = 24 floats). */
const COEFF_SLOTS = 24
/** Compute shader workgroup tile width. */
const WORKGROUP_SIZE = 256

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cloneDefaultBands(): BloomBandSettings[] {
  return DEFAULT_BLOOM_BANDS.map((band) => ({ ...band }))
}

function sanitizeBand(
  input: Partial<BloomBandSettings> | undefined,
  fallback: BloomBandSettings
): BloomBandSettings {
  if (!input) return { ...fallback }
  const tint =
    typeof input.tint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(input.tint)
      ? input.tint
      : fallback.tint
  return {
    enabled: input.enabled ?? fallback.enabled,
    weight: clamp(input.weight ?? fallback.weight, 0, 4),
    size: clamp(input.size ?? fallback.size, 0.25, 4),
    tint,
  }
}

interface BloomStoreState {
  bloomMode?: BloomMode
  bloomGain?: number
  bloomThreshold?: number
  bloomKnee?: number
  bloomBands?: BloomBandSettings[]
  bloomConvolutionRadius?: number
  bloomConvolutionResolutionScale?: number
  bloomConvolutionBoost?: number
  bloomConvolutionTint?: string
}

export interface BloomPassOptions {
  inputResource?: string
  outputResource?: string
  mode?: BloomMode
  gain?: number
  threshold?: number
  knee?: number
  bands?: BloomBandSettings[]
  convolutionRadius?: number
  convolutionResolutionScale?: number
  convolutionBoost?: number
  convolutionTint?: string
}

export class BloomPass extends WebGPUBasePass {
  // Pipelines
  private thresholdPipeline: GPURenderPipeline | null = null
  private blurPipelines: (GPUComputePipeline | null)[] = new Array(NUM_MIPS).fill(null)
  private compositePipelines: (GPURenderPipeline | null)[] = new Array(NUM_MIPS).fill(null)
  private copyPipeline: GPURenderPipeline | null = null
  private convolutionPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private thresholdBGL: GPUBindGroupLayout | null = null
  private blurBGL: GPUBindGroupLayout | null = null
  private compositeBGLs: (GPUBindGroupLayout | null)[] = new Array(NUM_MIPS).fill(null)
  private copyBGL: GPUBindGroupLayout | null = null
  private convolutionBGL: GPUBindGroupLayout | null = null

  // Uniform buffers
  private thresholdUB: GPUBuffer | null = null
  private blurUBs: GPUBuffer[] = []
  private compositeUB: GPUBuffer | null = null
  private convolutionUB: GPUBuffer | null = null

  private thresholdUniformData = new Float32Array(4)
  private blurUniformBuffer = new ArrayBuffer(4 * (4 + COEFF_SLOTS))
  private blurUniformScratch = new Float32Array(this.blurUniformBuffer)
  private blurUniformScratchU32 = new Uint32Array(this.blurUniformBuffer)
  private compositeUniformData = new Float32Array(32)
  private convolutionUniformData = new Float32Array(12)

  // Sampler
  private sampler: GPUSampler | null = null

  // Gaussian textures
  private thresholdTexture: GPUTexture | null = null
  private thresholdTextureView: GPUTextureView | null = null
  private horizontalTextures: GPUTexture[] = []
  private verticalTextures: GPUTexture[] = []
  private horizontalTextureViews: GPUTextureView[] = []
  private verticalTextureViews: GPUTextureView[] = []
  private gaussianTextureSize = { width: 0, height: 0 }

  // Convolution texture
  private convolutionTexture: GPUTexture | null = null
  private convolutionTextureView: GPUTextureView | null = null
  private convolutionTextureSize = { width: 0, height: 0, scale: -1 }

  // Cached bind groups
  private thresholdBindGroup: GPUBindGroup | null = null
  private thresholdBindGroupInputView: GPUTextureView | null = null
  private blurHBindGroups: (GPUBindGroup | null)[] = new Array(NUM_MIPS).fill(null)
  private blurVBindGroups: (GPUBindGroup | null)[] = new Array(NUM_MIPS).fill(null)
  private blurHBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_MIPS).fill(null)
  private blurVBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_MIPS).fill(null)
  private compositeBindGroups: (GPUBindGroup | null)[] = new Array(NUM_MIPS).fill(null)
  private compositeBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_MIPS).fill(null)
  private copyBindGroup: GPUBindGroup | null = null
  private copyBindGroupInputView: GPUTextureView | null = null
  private convolutionBindGroup: GPUBindGroup | null = null
  private convolutionBindGroupSceneView: GPUTextureView | null = null
  private convolutionBindGroupInputView: GPUTextureView | null = null

  // Configurable resources
  private inputResource: string
  private outputResource: string

  // Parameters
  private mode: BloomMode = DEFAULT_BLOOM_MODE
  private gain = DEFAULT_BLOOM_GAIN
  private threshold = DEFAULT_BLOOM_THRESHOLD
  private knee = DEFAULT_BLOOM_KNEE
  private bands: BloomBandSettings[] = cloneDefaultBands()
  private convolutionRadius = DEFAULT_BLOOM_CONVOLUTION_RADIUS
  private convolutionResolutionScale = DEFAULT_BLOOM_CONVOLUTION_RESOLUTION_SCALE
  private convolutionBoost = DEFAULT_BLOOM_CONVOLUTION_BOOST
  private convolutionTint = DEFAULT_BLOOM_CONVOLUTION_TINT

  // Cached state keys
  private lastThreshold = Number.NaN
  private lastKnee = Number.NaN
  private lastBlurSizeKey = ''
  private lastCompositeKey = ''
  private lastConvolutionKey = ''

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

    if (options?.mode) this.mode = options.mode
    if (options?.gain !== undefined) this.gain = clamp(options.gain, 0, 3)
    if (options?.threshold !== undefined) this.threshold = clamp(options.threshold, 0, 20)
    if (options?.knee !== undefined) this.knee = clamp(options.knee, 0, 5)
    if (options?.bands) {
      this.bands = cloneDefaultBands().map((fallback, index) =>
        sanitizeBand(options.bands?.[index], fallback)
      )
    }
    if (options?.convolutionRadius !== undefined) {
      this.convolutionRadius = clamp(options.convolutionRadius, 0.5, 6)
    }
    if (options?.convolutionResolutionScale !== undefined) {
      this.convolutionResolutionScale = clamp(options.convolutionResolutionScale, 0.25, 1)
    }
    if (options?.convolutionBoost !== undefined) {
      this.convolutionBoost = clamp(options.convolutionBoost, 0, 4)
    }
    if (
      options?.convolutionTint !== undefined &&
      /^#[0-9A-Fa-f]{6}$/.test(options.convolutionTint)
    ) {
      this.convolutionTint = options.convolutionTint
    }

    this.precomputeGaussianCoefficients()
  }

  private precomputeGaussianCoefficients(): void {
    this.gaussianCoefficients = []

    for (let level = 0; level < NUM_MIPS; level++) {
      const kernelRadius = KERNEL_SIZES[level]!
      const sigma = kernelRadius / 3.0
      const coeffs = new Float32Array(COEFF_SLOTS)

      for (let i = 0; i < kernelRadius; i++) {
        coeffs[i] = (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma
      }

      this.gaussianCoefficients.push(coeffs)
    }
  }

  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as BloomStoreState | undefined
    if (!postProcessing) return

    if (postProcessing.bloomMode) {
      this.mode = postProcessing.bloomMode
    }
    if (postProcessing.bloomGain !== undefined) {
      this.gain = clamp(postProcessing.bloomGain, 0, 3)
    }
    if (postProcessing.bloomThreshold !== undefined) {
      this.threshold = clamp(postProcessing.bloomThreshold, 0, 5)
    }
    if (postProcessing.bloomKnee !== undefined) {
      this.knee = clamp(postProcessing.bloomKnee, 0, 5)
    }
    if (postProcessing.bloomBands && postProcessing.bloomBands.length > 0) {
      this.bands = cloneDefaultBands().map((fallback, index) =>
        sanitizeBand(postProcessing.bloomBands?.[index], fallback)
      )
    }
    if (postProcessing.bloomConvolutionRadius !== undefined) {
      this.convolutionRadius = clamp(postProcessing.bloomConvolutionRadius, 0.5, 6)
    }
    if (postProcessing.bloomConvolutionResolutionScale !== undefined) {
      this.convolutionResolutionScale = clamp(
        postProcessing.bloomConvolutionResolutionScale,
        0.25,
        1
      )
    }
    if (postProcessing.bloomConvolutionBoost !== undefined) {
      this.convolutionBoost = clamp(postProcessing.bloomConvolutionBoost, 0, 4)
    }
    if (
      postProcessing.bloomConvolutionTint !== undefined &&
      /^#[0-9A-Fa-f]{6}$/.test(postProcessing.bloomConvolutionTint)
    ) {
      this.convolutionTint = postProcessing.bloomConvolutionTint
    }
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    this.sampler = device.createSampler({
      label: 'bloom-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.thresholdBGL = device.createBindGroupLayout({
      label: 'bloom-threshold-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.blurBGL = device.createBindGroupLayout({
      label: 'bloom-blur-compute-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: 'rgba16float' },
        },
      ],
    })

    this.compositeBGLs = new Array(NUM_MIPS).fill(null)
    for (let levelCount = 1; levelCount <= NUM_MIPS; levelCount++) {
      const entries: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ]
      for (let i = 0; i < levelCount; i++) {
        entries.push({
          binding: i + 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        })
      }
      entries.push({
        binding: levelCount + 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      })

      this.compositeBGLs[levelCount - 1] = device.createBindGroupLayout({
        label: `bloom-composite-bgl-L${levelCount}`,
        entries,
      })
    }

    this.copyBGL = device.createBindGroupLayout({
      label: 'bloom-copy-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.convolutionBGL = device.createBindGroupLayout({
      label: 'bloom-convolution-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.thresholdUB = this.createUniformBuffer(device, 16, 'bloom-threshold-ub')
    this.compositeUB = this.createUniformBuffer(device, 128, 'bloom-composite-ub')
    this.convolutionUB = this.createUniformBuffer(device, 48, 'bloom-convolution-ub')

    this.blurUBs = []
    for (let level = 0; level < NUM_MIPS; level++) {
      for (let dir = 0; dir < 2; dir++) {
        this.blurUBs.push(this.createUniformBuffer(device, 112, `bloom-blur-ub-L${level}-${dir}`))
      }
    }

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

    const blurPipelineLayout = device.createPipelineLayout({
      label: 'bloom-blur-compute-layout',
      bindGroupLayouts: [this.blurBGL],
    })
    for (let i = 0; i < NUM_MIPS; i++) {
      const blurCode = createBloomBlurComputeShader(KERNEL_SIZES[i]!)
      const blurModule = this.createShaderModule(device, blurCode, `bloom-blur-compute-L${i}`)
      this.blurPipelines[i] = device.createComputePipeline({
        label: `bloom-blur-compute-L${i}`,
        layout: blurPipelineLayout,
        compute: { module: blurModule, entryPoint: 'main' },
      })
    }

    for (let levelCount = 1; levelCount <= NUM_MIPS; levelCount++) {
      const compositeCode = createBloomCompositeShader(levelCount)
      const compositeModule = this.createShaderModule(
        device,
        compositeCode,
        `bloom-composite-L${levelCount}-shader`
      )
      this.compositePipelines[levelCount - 1] = this.createFullscreenPipeline(
        device,
        compositeModule,
        [this.compositeBGLs[levelCount - 1]!],
        'rgba16float',
        { label: `bloom-composite-L${levelCount}` }
      )
    }

    const copyModule = this.createShaderModule(device, bloomCopyShader, 'bloom-copy-shader')
    this.copyPipeline = this.createFullscreenPipeline(
      device,
      copyModule,
      [this.copyBGL],
      'rgba16float',
      {
        label: 'bloom-copy',
      }
    )

    const convolutionModule = this.createShaderModule(
      device,
      bloomConvolutionCompositeShader,
      'bloom-convolution-shader'
    )
    this.convolutionPipeline = this.createFullscreenPipeline(
      device,
      convolutionModule,
      [this.convolutionBGL],
      'rgba16float',
      { label: 'bloom-convolution' }
    )
  }

  private invalidateBindGroups(): void {
    this.thresholdBindGroup = null
    this.thresholdBindGroupInputView = null
    this.copyBindGroup = null
    this.copyBindGroupInputView = null
    this.convolutionBindGroup = null
    this.convolutionBindGroupSceneView = null
    this.convolutionBindGroupInputView = null
    this.compositeBindGroups.fill(null)
    this.compositeBindGroupInputViews.fill(null)
    this.blurHBindGroups.fill(null)
    this.blurVBindGroups.fill(null)
    this.blurHBindGroupInputViews.fill(null)
    this.blurVBindGroupInputViews.fill(null)
  }

  private ensureGaussianTextures(device: GPUDevice, width: number, height: number): void {
    if (this.gaussianTextureSize.width === width && this.gaussianTextureSize.height === height) {
      return
    }

    this.thresholdTexture?.destroy()
    for (const tex of this.horizontalTextures) tex?.destroy()
    for (const tex of this.verticalTextures) tex?.destroy()

    this.horizontalTextures = []
    this.verticalTextures = []
    this.horizontalTextureViews = []
    this.verticalTextureViews = []

    for (let i = 0; i < NUM_MIPS; i++) {
      const mipWidth = Math.max(1, Math.round(width / Math.pow(2, i + 1)))
      const mipHeight = Math.max(1, Math.round(height / Math.pow(2, i + 1)))
      const desc = {
        size: { width: mipWidth, height: mipHeight },
        format: 'rgba16float' as const,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      }

      this.horizontalTextures.push(device.createTexture({ ...desc, label: `bloom-H-L${i}` }))
      this.verticalTextures.push(device.createTexture({ ...desc, label: `bloom-V-L${i}` }))
      this.horizontalTextureViews.push(this.horizontalTextures[i]!.createView())
      this.verticalTextureViews.push(this.verticalTextures[i]!.createView())
    }

    this.thresholdTexture = device.createTexture({
      label: 'bloom-threshold-tex',
      size: {
        width: Math.max(1, Math.round(width / 2)),
        height: Math.max(1, Math.round(height / 2)),
      },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.thresholdTextureView = this.thresholdTexture.createView()

    this.gaussianTextureSize = { width, height }
    this.lastBlurSizeKey = ''
    this.invalidateBindGroups()
  }

  private ensureConvolutionTexture(device: GPUDevice, width: number, height: number): void {
    const scale = this.convolutionResolutionScale

    if (scale >= 0.999) {
      this.convolutionTexture?.destroy()
      this.convolutionTexture = null
      this.convolutionTextureView = null
      this.convolutionTextureSize = { width: 0, height: 0, scale: -1 }
      this.convolutionBindGroup = null
      this.convolutionBindGroupInputView = null
      return
    }

    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    if (
      this.convolutionTexture &&
      this.convolutionTextureSize.width === targetWidth &&
      this.convolutionTextureSize.height === targetHeight &&
      Math.abs(this.convolutionTextureSize.scale - scale) < 1e-4
    ) {
      return
    }

    this.convolutionTexture?.destroy()
    this.convolutionTexture = device.createTexture({
      label: 'bloom-convolution-input',
      size: { width: targetWidth, height: targetHeight },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.convolutionTextureView = this.convolutionTexture.createView()
    this.convolutionTextureSize = { width: targetWidth, height: targetHeight, scale }
    this.copyBindGroup = null
    this.copyBindGroupInputView = null
    this.convolutionBindGroup = null
    this.convolutionBindGroupInputView = null
  }

  private writeBlurUniformsIfNeeded(device: GPUDevice): void {
    const key = `${this.gaussianTextureSize.width}x${this.gaussianTextureSize.height}:${this.bands
      .map((band) => band.size.toFixed(3))
      .join('|')}`

    if (key === this.lastBlurSizeKey) return

    for (let level = 0; level < NUM_MIPS; level++) {
      const mipWidth = Math.max(
        1,
        Math.round(this.gaussianTextureSize.width / Math.pow(2, level + 1))
      )
      const mipHeight = Math.max(
        1,
        Math.round(this.gaussianTextureSize.height / Math.pow(2, level + 1))
      )
      const coeffs = this.gaussianCoefficients[level]!
      const sizeScale = clamp(this.bands[level]?.size ?? 1, 0.25, 4)

      for (let dir = 0; dir < 2; dir++) {
        const bufferIndex = level * 2 + dir
        const buffer = this.blurUBs[bufferIndex]!

        this.blurUniformScratch.fill(0)
        // outputSize: vec2u (offsets 0, 1 as u32)
        this.blurUniformScratchU32[0] = mipWidth
        this.blurUniformScratchU32[1] = mipHeight
        // direction: u32 (offset 2 as u32)
        this.blurUniformScratchU32[2] = dir
        // sizeScale: f32 (offset 3 as f32)
        this.blurUniformScratch[3] = sizeScale

        for (let i = 0; i < COEFF_SLOTS; i++) {
          this.blurUniformScratch[4 + i] = coeffs[i]!
        }

        this.writeUniformBuffer(device, buffer, this.blurUniformScratch)
      }
    }

    this.lastBlurSizeKey = key
  }

  private computeActiveGaussianLevels(): number {
    let active = 0
    for (let i = 0; i < NUM_MIPS; i++) {
      const band = this.bands[i]!
      if (band.enabled) {
        active = i + 1
      } else {
        break
      }
    }
    return active
  }

  private hasAnyGaussianContribution(activeLevels: number): boolean {
    for (let i = 0; i < activeLevels; i++) {
      if (this.bands[i]!.weight > 0) return true
    }
    return false
  }

  private renderCopy(
    ctx: WebGPURenderContext,
    inputView: GPUTextureView,
    outputView: GPUTextureView
  ): void {
    if (!this.device || !this.copyPipeline || !this.copyBGL || !this.sampler) return

    if (!this.copyBindGroup || this.copyBindGroupInputView !== inputView) {
      this.copyBindGroup = this.createBindGroup(this.device, this.copyBGL, [
        { binding: 0, resource: inputView },
        { binding: 1, resource: this.sampler },
      ])
      this.copyBindGroupInputView = inputView
    }

    const pass = ctx.beginRenderPass({
      label: 'bloom-copy',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(pass, this.copyPipeline, [this.copyBindGroup])
    pass.end()
  }

  private writeCompositeUniformsIfNeeded(activeLevels: number): void {
    if (!this.device || !this.compositeUB) return

    const weights = new Float32Array(NUM_MIPS)
    const tints = new Float32Array(NUM_MIPS * 4)

    for (let i = 0; i < NUM_MIPS; i++) {
      const band = this.bands[i]!
      weights[i] = i < activeLevels && band.enabled ? band.weight : 0
      const linearTint = parseHexColorToLinearRgb(band.tint, [1, 1, 1])
      tints[i * 4 + 0] = linearTint[0]
      tints[i * 4 + 1] = linearTint[1]
      tints[i * 4 + 2] = linearTint[2]
      tints[i * 4 + 3] = 1
    }

    const compositeKey = `${this.gain.toFixed(4)}:${Array.from(weights)
      .map((value) => value.toFixed(4))
      .join('|')}:${Array.from(tints)
      .map((value) => value.toFixed(4))
      .join('|')}`

    if (compositeKey === this.lastCompositeKey) return

    this.compositeUniformData.fill(0)
    this.compositeUniformData[0] = this.gain
    this.compositeUniformData[4] = weights[0]!
    this.compositeUniformData[5] = weights[1]!
    this.compositeUniformData[6] = weights[2]!
    this.compositeUniformData[7] = weights[3]!
    this.compositeUniformData[8] = weights[4]!

    for (let i = 0; i < NUM_MIPS; i++) {
      const base = 12 + i * 4
      this.compositeUniformData[base + 0] = tints[i * 4 + 0]!
      this.compositeUniformData[base + 1] = tints[i * 4 + 1]!
      this.compositeUniformData[base + 2] = tints[i * 4 + 2]!
      this.compositeUniformData[base + 3] = 1
    }

    this.writeUniformBuffer(this.device, this.compositeUB, this.compositeUniformData)
    this.lastCompositeKey = compositeKey
  }

  private executeGaussian(
    ctx: WebGPURenderContext,
    inputView: GPUTextureView,
    outputView: GPUTextureView,
    activeLevels: number
  ): void {
    if (
      !this.device ||
      !this.thresholdPipeline ||
      !this.thresholdBGL ||
      !this.blurBGL ||
      !this.thresholdUB ||
      !this.compositeUB ||
      !this.sampler
    ) {
      return
    }

    if (!this.compositePipelines[activeLevels - 1] || !this.compositeBGLs[activeLevels - 1]) {
      return
    }

    this.ensureGaussianTextures(this.device, ctx.size.width, ctx.size.height)
    this.writeBlurUniformsIfNeeded(this.device)

    if (
      !this.thresholdTextureView ||
      this.horizontalTextureViews.length < NUM_MIPS ||
      this.verticalTextureViews.length < NUM_MIPS
    ) {
      return
    }

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

    const blurInputView: GPUTextureView = this.thresholdTextureView

    for (let level = 0; level < activeLevels; level++) {
      const pipeline = this.blurPipelines[level]
      if (!pipeline) return

      const mipWidth = Math.max(1, Math.round(ctx.size.width / Math.pow(2, level + 1)))
      const mipHeight = Math.max(1, Math.round(ctx.size.height / Math.pow(2, level + 1)))

      const hReadView = level === 0 ? blurInputView : this.verticalTextureViews[level - 1]!
      const hBufferIdx = level * 2

      if (!this.blurHBindGroups[level] || this.blurHBindGroupInputViews[level] !== hReadView) {
        this.blurHBindGroups[level] = this.createBindGroup(this.device, this.blurBGL, [
          { binding: 0, resource: { buffer: this.blurUBs[hBufferIdx]! } },
          { binding: 1, resource: hReadView },
          { binding: 2, resource: this.horizontalTextureViews[level]! },
        ])
        this.blurHBindGroupInputViews[level] = hReadView
      }

      const hPass = ctx.beginComputePass({ label: `bloom-blur-H-L${level}` })
      hPass.setPipeline(pipeline)
      hPass.setBindGroup(0, this.blurHBindGroups[level]!)
      hPass.dispatchWorkgroups(Math.ceil(mipWidth / WORKGROUP_SIZE), mipHeight, 1)
      hPass.end()

      const vBufferIdx = level * 2 + 1
      const vReadView = this.horizontalTextureViews[level]!
      if (!this.blurVBindGroups[level] || this.blurVBindGroupInputViews[level] !== vReadView) {
        this.blurVBindGroups[level] = this.createBindGroup(this.device, this.blurBGL, [
          { binding: 0, resource: { buffer: this.blurUBs[vBufferIdx]! } },
          { binding: 1, resource: vReadView },
          { binding: 2, resource: this.verticalTextureViews[level]! },
        ])
        this.blurVBindGroupInputViews[level] = vReadView
      }

      const vPass = ctx.beginComputePass({ label: `bloom-blur-V-L${level}` })
      vPass.setPipeline(pipeline)
      vPass.setBindGroup(0, this.blurVBindGroups[level]!)
      vPass.dispatchWorkgroups(Math.ceil(mipHeight / WORKGROUP_SIZE), mipWidth, 1)
      vPass.end()
    }

    this.writeCompositeUniformsIfNeeded(activeLevels)

    const pipeline = this.compositePipelines[activeLevels - 1]!
    const bgl = this.compositeBGLs[activeLevels - 1]!

    if (
      !this.compositeBindGroups[activeLevels - 1] ||
      this.compositeBindGroupInputViews[activeLevels - 1] !== inputView
    ) {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.compositeUB } },
        { binding: 1, resource: inputView },
      ]

      for (let i = 0; i < activeLevels; i++) {
        entries.push({ binding: i + 2, resource: this.verticalTextureViews[i]! })
      }

      entries.push({ binding: activeLevels + 2, resource: this.sampler })

      this.compositeBindGroups[activeLevels - 1] = this.createBindGroup(this.device, bgl, entries)
      this.compositeBindGroupInputViews[activeLevels - 1] = inputView
    }

    const compositePass = ctx.beginRenderPass({
      label: `bloom-composite-L${activeLevels}`,
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(compositePass, pipeline, [this.compositeBindGroups[activeLevels - 1]!])
    compositePass.end()
  }

  private executeConvolution(
    ctx: WebGPURenderContext,
    inputView: GPUTextureView,
    outputView: GPUTextureView
  ): void {
    if (
      !this.device ||
      !this.copyPipeline ||
      !this.copyBGL ||
      !this.convolutionPipeline ||
      !this.convolutionBGL ||
      !this.convolutionUB ||
      !this.sampler
    ) {
      return
    }

    this.ensureConvolutionTexture(this.device, ctx.size.width, ctx.size.height)

    let convolutionInputView = inputView

    if (this.convolutionTextureView) {
      if (!this.copyBindGroup || this.copyBindGroupInputView !== inputView) {
        this.copyBindGroup = this.createBindGroup(this.device, this.copyBGL, [
          { binding: 0, resource: inputView },
          { binding: 1, resource: this.sampler },
        ])
        this.copyBindGroupInputView = inputView
      }

      const copyPass = ctx.beginRenderPass({
        label: 'bloom-convolution-downsample',
        colorAttachments: [
          {
            view: this.convolutionTextureView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })
      this.renderFullscreen(copyPass, this.copyPipeline, [this.copyBindGroup])
      copyPass.end()
      convolutionInputView = this.convolutionTextureView
    }

    const convolutionTint = parseHexColorToLinearRgb(this.convolutionTint, [1, 1, 1])
    const convolutionKey = `${this.gain.toFixed(4)}:${this.convolutionRadius.toFixed(4)}:${this.convolutionBoost.toFixed(4)}:${this.threshold.toFixed(4)}:${this.knee.toFixed(4)}:${convolutionTint
      .map((value) => value.toFixed(4))
      .join('|')}`

    if (convolutionKey !== this.lastConvolutionKey) {
      this.convolutionUniformData[0] = this.gain
      this.convolutionUniformData[1] = this.convolutionRadius
      this.convolutionUniformData[2] = this.convolutionBoost
      this.convolutionUniformData[3] = this.threshold
      this.convolutionUniformData[4] = this.knee
      this.convolutionUniformData[5] = 0
      this.convolutionUniformData[6] = 0
      this.convolutionUniformData[7] = 0
      this.convolutionUniformData[8] = convolutionTint[0]
      this.convolutionUniformData[9] = convolutionTint[1]
      this.convolutionUniformData[10] = convolutionTint[2]
      this.convolutionUniformData[11] = 1
      this.writeUniformBuffer(this.device, this.convolutionUB, this.convolutionUniformData)
      this.lastConvolutionKey = convolutionKey
    }

    if (
      !this.convolutionBindGroup ||
      this.convolutionBindGroupSceneView !== inputView ||
      this.convolutionBindGroupInputView !== convolutionInputView
    ) {
      this.convolutionBindGroup = this.createBindGroup(this.device, this.convolutionBGL, [
        { binding: 0, resource: { buffer: this.convolutionUB } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: convolutionInputView },
        { binding: 3, resource: this.sampler },
      ])
      this.convolutionBindGroupSceneView = inputView
      this.convolutionBindGroupInputView = convolutionInputView
    }

    const pass = ctx.beginRenderPass({
      label: 'bloom-convolution',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(pass, this.convolutionPipeline, [this.convolutionBindGroup])
    pass.end()
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device) return

    this.updateFromStores(ctx)

    const inputView = ctx.getTextureView(this.inputResource)
    const outputView = ctx.getWriteTarget(this.outputResource) ?? ctx.getCanvasTextureView()
    if (!inputView) return

    if (this.gain <= 0) {
      this.renderCopy(ctx, inputView, outputView)
      return
    }

    if (this.mode === 'convolution') {
      this.executeConvolution(ctx, inputView, outputView)
      return
    }

    const activeLevels = this.computeActiveGaussianLevels()
    if (activeLevels <= 0 || !this.hasAnyGaussianContribution(activeLevels)) {
      this.renderCopy(ctx, inputView, outputView)
      return
    }

    this.executeGaussian(ctx, inputView, outputView, activeLevels)
  }

  private releaseGaussianTextures(): void {
    this.thresholdTexture?.destroy()
    for (const tex of this.horizontalTextures) tex?.destroy()
    for (const tex of this.verticalTextures) tex?.destroy()

    this.thresholdTexture = null
    this.thresholdTextureView = null
    this.horizontalTextures = []
    this.verticalTextures = []
    this.horizontalTextureViews = []
    this.verticalTextureViews = []
    this.gaussianTextureSize = { width: 0, height: 0 }
    this.lastBlurSizeKey = ''
  }

  private releaseConvolutionTexture(): void {
    this.convolutionTexture?.destroy()
    this.convolutionTexture = null
    this.convolutionTextureView = null
    this.convolutionTextureSize = { width: 0, height: 0, scale: -1 }
  }

  releaseInternalResources(): void {
    this.releaseGaussianTextures()
    this.releaseConvolutionTexture()
    this.invalidateBindGroups()
  }

  dispose(): void {
    this.thresholdUB?.destroy()
    this.compositeUB?.destroy()
    this.convolutionUB?.destroy()
    for (const buf of this.blurUBs) buf?.destroy()

    this.releaseGaussianTextures()
    this.releaseConvolutionTexture()

    this.thresholdUB = null
    this.compositeUB = null
    this.convolutionUB = null
    this.blurUBs = []
    this.invalidateBindGroups()

    super.dispose()
  }
}
