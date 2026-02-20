/**
 * WebGPU Bloom Pass (Progressive Downsample/Upsample)
 *
 * Jimenez 2014 / Call of Duty bloom:
 * 1. Prefilter: luminance threshold + Karis average -> downMips[0] (half-res)
 * 2. Downsample x4: 13-tap box filter through mip chain
 * 3. Upsample x4: 9-tap tent filter + additive blend up the chain
 * 4. Composite: scene + gain * upMips[0]
 * 5. Zero-strength fast path: single copy pass
 *
 * 10 render passes, 0 compute passes. All rgba16float fragment shaders.
 */

import {
  DEFAULT_BLOOM_GAIN,
  DEFAULT_BLOOM_KNEE,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_THRESHOLD,
} from '@/stores/defaults/visualDefaults'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  bloomCompositeShader,
  bloomCopyShader,
  bloomDownsampleShader,
  bloomPrefilterShader,
  bloomUpsampleShader,
} from '../shaders/postprocessing/bloom.wgsl'

/** Number of downsample mip levels (including prefilter output). */
const NUM_DOWN_MIPS = 5
/** Number of upsample mip levels. */
const NUM_UP_MIPS = 4

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

interface BloomStoreState {
  bloomGain?: number
  bloomThreshold?: number
  bloomKnee?: number
  bloomRadius?: number
}

export interface BloomPassOptions {
  /**
   * Base scene color input used for final composite.
   */
  inputResource?: string
  /**
   * Optional bloom extraction source.
   * If omitted, bloom is extracted from `inputResource`.
   */
  bloomInputResource?: string
  outputResource?: string
  gain?: number
  threshold?: number
  knee?: number
  filterRadius?: number
}

export class BloomPass extends WebGPUBasePass {
  // Pipelines
  private prefilterPipeline: GPURenderPipeline | null = null
  private downsamplePipeline: GPURenderPipeline | null = null
  private upsamplePipeline: GPURenderPipeline | null = null
  private compositePipeline: GPURenderPipeline | null = null
  private copyPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private prefilterBGL: GPUBindGroupLayout | null = null
  private downsampleBGL: GPUBindGroupLayout | null = null
  private upsampleBGL: GPUBindGroupLayout | null = null
  private compositeBGL: GPUBindGroupLayout | null = null
  private copyBGL: GPUBindGroupLayout | null = null

  // Uniform buffers
  private prefilterUB: GPUBuffer | null = null
  private upsampleUB: GPUBuffer | null = null
  private compositeUB: GPUBuffer | null = null

  // Scratch data
  private prefilterUniformData = new Float32Array(4)
  private upsampleUniformData = new Float32Array(4)
  private compositeUniformData = new Float32Array(4)

  // Sampler
  private sampler: GPUSampler | null = null

  // Mip textures
  private downMips: GPUTexture[] = []
  private downMipViews: GPUTextureView[] = []
  private upMips: GPUTexture[] = []
  private upMipViews: GPUTextureView[] = []
  private textureSize = { width: 0, height: 0 }

  // Cached bind groups
  private prefilterBindGroup: GPUBindGroup | null = null
  private prefilterBindGroupInputView: GPUTextureView | null = null
  private downsampleBindGroups: (GPUBindGroup | null)[] = new Array(NUM_DOWN_MIPS - 1).fill(null)
  private downsampleBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_DOWN_MIPS - 1).fill(null)
  private upsampleBindGroups: (GPUBindGroup | null)[] = new Array(NUM_UP_MIPS).fill(null)
  private upsampleBindGroupInputViews: (GPUTextureView | null)[] = new Array(NUM_UP_MIPS).fill(null)
  private compositeBindGroup: GPUBindGroup | null = null
  private compositeBindGroupSceneView: GPUTextureView | null = null
  private copyBindGroup: GPUBindGroup | null = null
  private copyBindGroupInputView: GPUTextureView | null = null

  // Configurable resources
  private sceneInputResource: string
  private bloomInputResource: string
  private outputResource: string

  // Parameters
  private gain = DEFAULT_BLOOM_GAIN
  private threshold = DEFAULT_BLOOM_THRESHOLD
  private knee = DEFAULT_BLOOM_KNEE
  private filterRadius = DEFAULT_BLOOM_RADIUS

  // Cached uniform keys for dirty-flag optimization
  private lastPrefilterKey = ''
  private lastUpsampleKey = ''
  private lastCompositeKey = ''

  constructor(options?: BloomPassOptions) {
    const inputResource = options?.inputResource ?? 'hdr-color'
    const bloomInputResource = options?.bloomInputResource ?? inputResource
    const outputResource = options?.outputResource ?? 'bloom-output'
    const inputs = [
      { resourceId: inputResource, access: 'read' as const, binding: 0 },
      ...(bloomInputResource !== inputResource
        ? [{ resourceId: bloomInputResource, access: 'read' as const, binding: 1 }]
        : []),
    ]

    super({
      id: 'bloom',
      priority: 800,
      inputs,
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.sceneInputResource = inputResource
    this.bloomInputResource = bloomInputResource
    this.outputResource = outputResource

    if (options?.gain !== undefined) this.gain = clamp(options.gain, 0, 3)
    if (options?.threshold !== undefined) this.threshold = clamp(options.threshold, 0, 5)
    if (options?.knee !== undefined) this.knee = clamp(options.knee, 0, 5)
    if (options?.filterRadius !== undefined) this.filterRadius = clamp(options.filterRadius, 0.25, 4)
  }

  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as BloomStoreState | undefined
    if (!postProcessing) return

    if (postProcessing.bloomGain !== undefined) {
      this.gain = clamp(postProcessing.bloomGain, 0, 3)
    }
    if (postProcessing.bloomThreshold !== undefined) {
      this.threshold = clamp(postProcessing.bloomThreshold, 0, 5)
    }
    if (postProcessing.bloomKnee !== undefined) {
      this.knee = clamp(postProcessing.bloomKnee, 0, 5)
    }
    if (postProcessing.bloomRadius !== undefined) {
      this.filterRadius = clamp(postProcessing.bloomRadius, 0.25, 4)
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

    // --- Bind Group Layouts ---

    this.prefilterBGL = device.createBindGroupLayout({
      label: 'bloom-prefilter-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.downsampleBGL = device.createBindGroupLayout({
      label: 'bloom-downsample-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.upsampleBGL = device.createBindGroupLayout({
      label: 'bloom-upsample-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.compositeBGL = device.createBindGroupLayout({
      label: 'bloom-composite-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    this.copyBGL = device.createBindGroupLayout({
      label: 'bloom-copy-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // --- Uniform Buffers ---

    this.prefilterUB = this.createUniformBuffer(device, 16, 'bloom-prefilter-ub')
    this.upsampleUB = this.createUniformBuffer(device, 16, 'bloom-upsample-ub')
    this.compositeUB = this.createUniformBuffer(device, 16, 'bloom-composite-ub')

    // --- Pipelines ---

    const prefilterModule = this.createShaderModule(device, bloomPrefilterShader, 'bloom-prefilter-shader')
    this.prefilterPipeline = this.createFullscreenPipeline(
      device, prefilterModule, [this.prefilterBGL], 'rgba16float', { label: 'bloom-prefilter' }
    )

    const downsampleModule = this.createShaderModule(device, bloomDownsampleShader, 'bloom-downsample-shader')
    this.downsamplePipeline = this.createFullscreenPipeline(
      device, downsampleModule, [this.downsampleBGL], 'rgba16float', { label: 'bloom-downsample' }
    )

    const upsampleModule = this.createShaderModule(device, bloomUpsampleShader, 'bloom-upsample-shader')
    this.upsamplePipeline = this.createFullscreenPipeline(
      device, upsampleModule, [this.upsampleBGL], 'rgba16float', { label: 'bloom-upsample' }
    )

    const compositeModule = this.createShaderModule(device, bloomCompositeShader, 'bloom-composite-shader')
    this.compositePipeline = this.createFullscreenPipeline(
      device, compositeModule, [this.compositeBGL], 'rgba16float', { label: 'bloom-composite' }
    )

    const copyModule = this.createShaderModule(device, bloomCopyShader, 'bloom-copy-shader')
    this.copyPipeline = this.createFullscreenPipeline(
      device, copyModule, [this.copyBGL], 'rgba16float', { label: 'bloom-copy' }
    )
  }

  private invalidateBindGroups(): void {
    this.prefilterBindGroup = null
    this.prefilterBindGroupInputView = null
    this.downsampleBindGroups.fill(null)
    this.downsampleBindGroupInputViews.fill(null)
    this.upsampleBindGroups.fill(null)
    this.upsampleBindGroupInputViews.fill(null)
    this.compositeBindGroup = null
    this.compositeBindGroupSceneView = null
    this.copyBindGroup = null
    this.copyBindGroupInputView = null
  }

  private ensureTextures(device: GPUDevice, width: number, height: number): void {
    if (this.textureSize.width === width && this.textureSize.height === height) {
      return
    }

    // Destroy old textures
    for (const tex of this.downMips) tex?.destroy()
    for (const tex of this.upMips) tex?.destroy()

    this.downMips = []
    this.downMipViews = []
    this.upMips = []
    this.upMipViews = []

    // Create downsample mip chain (5 levels: half, quarter, eighth, sixteenth, 1/32)
    for (let i = 0; i < NUM_DOWN_MIPS; i++) {
      const mipWidth = Math.max(1, Math.round(width / Math.pow(2, i + 1)))
      const mipHeight = Math.max(1, Math.round(height / Math.pow(2, i + 1)))
      const tex = device.createTexture({
        label: `bloom-down-${i}`,
        size: { width: mipWidth, height: mipHeight },
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
      this.downMips.push(tex)
      this.downMipViews.push(tex.createView())
    }

    // Create upsample mip chain (4 levels: matches downMips[3] through downMips[0])
    for (let i = 0; i < NUM_UP_MIPS; i++) {
      const downIndex = NUM_DOWN_MIPS - 2 - i // 3, 2, 1, 0
      const mipWidth = Math.max(1, Math.round(width / Math.pow(2, downIndex + 1)))
      const mipHeight = Math.max(1, Math.round(height / Math.pow(2, downIndex + 1)))
      const tex = device.createTexture({
        label: `bloom-up-${i}`,
        size: { width: mipWidth, height: mipHeight },
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
      this.upMips.push(tex)
      this.upMipViews.push(tex.createView())
    }

    this.textureSize = { width, height }
    this.invalidateBindGroups()
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

  private executeBloom(
    ctx: WebGPURenderContext,
    sceneView: GPUTextureView,
    bloomInputView: GPUTextureView,
    outputView: GPUTextureView
  ): void {
    if (
      !this.device ||
      !this.prefilterPipeline ||
      !this.downsamplePipeline ||
      !this.upsamplePipeline ||
      !this.compositePipeline ||
      !this.prefilterBGL ||
      !this.downsampleBGL ||
      !this.upsampleBGL ||
      !this.compositeBGL ||
      !this.prefilterUB ||
      !this.upsampleUB ||
      !this.compositeUB ||
      !this.sampler
    ) {
      return
    }

    this.ensureTextures(this.device, ctx.size.width, ctx.size.height)

    if (this.downMipViews.length < NUM_DOWN_MIPS || this.upMipViews.length < NUM_UP_MIPS) {
      return
    }

    // --- Write prefilter uniforms ---
    const prefilterKey = `${this.threshold.toFixed(4)}:${this.knee.toFixed(4)}`
    if (prefilterKey !== this.lastPrefilterKey) {
      this.prefilterUniformData[0] = this.threshold
      this.prefilterUniformData[1] = this.knee
      this.prefilterUniformData[2] = 0
      this.prefilterUniformData[3] = 0
      this.writeUniformBuffer(this.device, this.prefilterUB, this.prefilterUniformData)
      this.lastPrefilterKey = prefilterKey
    }

    // --- Write upsample uniforms ---
    const upsampleKey = this.filterRadius.toFixed(4)
    if (upsampleKey !== this.lastUpsampleKey) {
      this.upsampleUniformData[0] = this.filterRadius
      this.upsampleUniformData[1] = 0
      this.upsampleUniformData[2] = 0
      this.upsampleUniformData[3] = 0
      this.writeUniformBuffer(this.device, this.upsampleUB, this.upsampleUniformData)
      this.lastUpsampleKey = upsampleKey
    }

    // --- Write composite uniforms ---
    const compositeKey = this.gain.toFixed(4)
    if (compositeKey !== this.lastCompositeKey) {
      this.compositeUniformData[0] = this.gain
      this.compositeUniformData[1] = 0
      this.compositeUniformData[2] = 0
      this.compositeUniformData[3] = 0
      this.writeUniformBuffer(this.device, this.compositeUB, this.compositeUniformData)
      this.lastCompositeKey = compositeKey
    }

    // === PREFILTER: full-res input -> downMips[0] (half-res) ===
    if (!this.prefilterBindGroup || this.prefilterBindGroupInputView !== bloomInputView) {
      this.prefilterBindGroup = this.createBindGroup(this.device, this.prefilterBGL, [
        { binding: 0, resource: { buffer: this.prefilterUB } },
        { binding: 1, resource: bloomInputView },
        { binding: 2, resource: this.sampler },
      ])
      this.prefilterBindGroupInputView = bloomInputView
    }

    const prefilterPass = ctx.beginRenderPass({
      label: 'bloom-prefilter',
      colorAttachments: [{
        view: this.downMipViews[0]!,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    })
    this.renderFullscreen(prefilterPass, this.prefilterPipeline, [this.prefilterBindGroup])
    prefilterPass.end()

    // === DOWNSAMPLE x4: downMips[0] -> [1] -> [2] -> [3] -> [4] ===
    for (let i = 0; i < NUM_DOWN_MIPS - 1; i++) {
      const srcView = this.downMipViews[i]!
      const dstView = this.downMipViews[i + 1]!

      if (!this.downsampleBindGroups[i] || this.downsampleBindGroupInputViews[i] !== srcView) {
        this.downsampleBindGroups[i] = this.createBindGroup(this.device, this.downsampleBGL, [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this.sampler },
        ])
        this.downsampleBindGroupInputViews[i] = srcView
      }

      const dsPass = ctx.beginRenderPass({
        label: `bloom-downsample-${i}`,
        colorAttachments: [{
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      })
      this.renderFullscreen(dsPass, this.downsamplePipeline, [this.downsampleBindGroups[i]!])
      dsPass.end()
    }

    // === UPSAMPLE x4: blend up the mip chain ===
    // upMips[0]: downMips[4] + downMips[3] -> upMips[0] (at downMips[3] resolution)
    // upMips[1]: upMips[0]   + downMips[2] -> upMips[1] (at downMips[2] resolution)
    // upMips[2]: upMips[1]   + downMips[1] -> upMips[2] (at downMips[1] resolution)
    // upMips[3]: upMips[2]   + downMips[0] -> upMips[3] (at downMips[0] resolution)
    for (let i = 0; i < NUM_UP_MIPS; i++) {
      const lowerMipView = i === 0 ? this.downMipViews[NUM_DOWN_MIPS - 1]! : this.upMipViews[i - 1]!
      const currentDownIndex = NUM_DOWN_MIPS - 2 - i // 3, 2, 1, 0
      const currentMipView = this.downMipViews[currentDownIndex]!
      const dstView = this.upMipViews[i]!

      if (!this.upsampleBindGroups[i] || this.upsampleBindGroupInputViews[i] !== lowerMipView) {
        this.upsampleBindGroups[i] = this.createBindGroup(this.device, this.upsampleBGL, [
          { binding: 0, resource: { buffer: this.upsampleUB } },
          { binding: 1, resource: lowerMipView },
          { binding: 2, resource: currentMipView },
          { binding: 3, resource: this.sampler },
        ])
        this.upsampleBindGroupInputViews[i] = lowerMipView
      }

      const usPass = ctx.beginRenderPass({
        label: `bloom-upsample-${i}`,
        colorAttachments: [{
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      })
      this.renderFullscreen(usPass, this.upsamplePipeline, [this.upsampleBindGroups[i]!])
      usPass.end()
    }

    // === COMPOSITE: scene + gain * upMips[3] (half-res bloom) -> output ===
    const bloomView = this.upMipViews[NUM_UP_MIPS - 1]!
    if (!this.compositeBindGroup || this.compositeBindGroupSceneView !== sceneView) {
      this.compositeBindGroup = this.createBindGroup(this.device, this.compositeBGL, [
        { binding: 0, resource: { buffer: this.compositeUB } },
        { binding: 1, resource: sceneView },
        { binding: 2, resource: bloomView },
        { binding: 3, resource: this.sampler },
      ])
      this.compositeBindGroupSceneView = sceneView
    }

    const compositePass = ctx.beginRenderPass({
      label: 'bloom-composite',
      colorAttachments: [{
        view: outputView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    })
    this.renderFullscreen(compositePass, this.compositePipeline, [this.compositeBindGroup])
    compositePass.end()
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device) return

    this.updateFromStores(ctx)

    const sceneView = ctx.getTextureView(this.sceneInputResource)
    const bloomInputView = ctx.getTextureView(this.bloomInputResource)
    const outputView = ctx.getWriteTarget(this.outputResource) ?? ctx.getCanvasTextureView()
    if (!sceneView || !bloomInputView) return

    if (this.gain <= 0) {
      this.renderCopy(ctx, sceneView, outputView)
      return
    }

    this.executeBloom(ctx, sceneView, bloomInputView, outputView)
  }

  releaseInternalResources(): void {
    for (const tex of this.downMips) tex?.destroy()
    for (const tex of this.upMips) tex?.destroy()

    this.downMips = []
    this.downMipViews = []
    this.upMips = []
    this.upMipViews = []
    this.textureSize = { width: 0, height: 0 }

    this.invalidateBindGroups()
  }

  dispose(): void {
    this.prefilterUB?.destroy()
    this.upsampleUB?.destroy()
    this.compositeUB?.destroy()

    this.releaseInternalResources()

    this.prefilterUB = null
    this.upsampleUB = null
    this.compositeUB = null
    this.invalidateBindGroups()

    super.dispose()
  }
}
