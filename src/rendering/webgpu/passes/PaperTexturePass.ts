/**
 * WebGPU Paper Texture Pass
 *
 * Applies a realistic paper/cardboard texture overlay to the scene.
 * Port of the WebGL PaperTexturePass to WebGPU.
 *
 * Features:
 * - Fiber noise for paper grain
 * - Crumple patterns for aged paper look
 * - Fold lines for document feel
 * - Water drop marks
 * - Roughness noise for surface texture
 *
 * @module rendering/webgpu/passes/PaperTexturePass
 */

import { clampFinite, clampFiniteInteger } from '@/lib/math/clamp'
import type { PaperQuality } from '@/stores/defaults/visualDefaults'

import { BindGroupCache } from '../core/BindGroupCache'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { parseHexColorToLinearRgb, type Rgb } from '../utils/color'
import { destroyGpuResources } from '../utils/gpuResourceHelpers'

/**
 * Paper texture pass configuration.
 */
export interface PaperTexturePassConfig {
  /** Input color resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string

  /** Contrast - blending behavior (0-1) */
  contrast?: number
  /** Roughness - pixel noise intensity (0-1) */
  roughness?: number
  /** Fiber - curly-shaped noise intensity (0-1) */
  fiber?: number
  /** Fiber size - curly-shaped noise scale (0.1-2) */
  fiberSize?: number
  /** Crumples - cell-based crumple pattern intensity (0-1) */
  crumples?: number
  /** Crumple size - cell-based crumple pattern scale (0.1-2) */
  crumpleSize?: number
  /** Folds - depth of the folds (0-1) */
  folds?: number
  /** Fold count - number of folds (1-15) */
  foldCount?: number
  /** Drops - visibility of speckle pattern (0-1) */
  drops?: number
  /** Fade - big-scale noise mask (0-1) */
  fade?: number
  /** Seed - randomization seed (0-1000) */
  seed?: number
  /** Front color - foreground color (hex) */
  colorFront?: string
  /** Back color - background color (hex) */
  colorBack?: string
  /** Quality level - controls feature complexity */
  quality?: PaperQuality
  /** Effect intensity (0-1) */
  intensity?: number
}

/**
 * WGSL Paper Texture Fragment Shader
 */

export { PAPER_TEXTURE_SHADER } from './paperTextureShader.wgsl'
import { PAPER_TEXTURE_SHADER } from './paperTextureShader.wgsl'

/**
 * Simple noise generator for paper texture.
 * Matches the PaperNoiseGenerator output.
 */
class PaperNoise {
  private p: number[]
  private perm: number[]

  constructor(seed: number) {
    // Initialize permutation table
    this.p = []
    for (let i = 0; i < 256; i++) {
      this.p[i] = i
    }

    // Shuffle using Fisher-Yates with seed
    let random = seed
    for (let i = 255; i > 0; i--) {
      random = (random * 1103515245 + 12345) & 0x7fffffff
      const j = random % (i + 1)
      ;[this.p[i], this.p[j]] = [this.p[j]!, this.p[i]!]
    }

    // Duplicate permutation table
    this.perm = [...this.p, ...this.p]
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a)
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7
    const u = h < 4 ? x : y
    const v = h < 4 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = this.fade(xf)
    const v = this.fade(yf)

    const aa = this.perm[this.perm[xi]! + yi]!
    const ab = this.perm[this.perm[xi]! + yi + 1]!
    const ba = this.perm[this.perm[xi + 1]! + yi]!
    const bb = this.perm[this.perm[xi + 1]! + yi + 1]!

    const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u)
    const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u)

    return (this.lerp(x1, x2, v) + 1) / 2
  }

  fbm(x: number, y: number, octaves: number): number {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= 0.5
      frequency *= 2
    }

    return total / maxValue
  }
}

/**
 * Generate paper noise texture data.
 * @param size - Texture size (width and height)
 * @returns Uint8Array of RGBA data
 */
function generatePaperNoiseData(size: number): Uint8Array {
  const totalSize = size * size
  const data = new Uint8Array(totalSize * 4)

  const noise1 = new PaperNoise(42)
  const noise2 = new PaperNoise(123)
  const noise3 = new PaperNoise(7919)

  let idx = 0
  const scale = 1.0 / size

  for (let y = 0; y < size; y++) {
    const ny = y * scale
    for (let x = 0; x < size; x++) {
      const nx = x * scale

      const r = noise1.noise2D(nx * 8, ny * 8)
      const g = noise2.noise2D(nx * 8 + 100, ny * 8 + 100)
      const b = noise3.fbm(nx * 4, ny * 4, 4)

      data[idx++] = Math.floor(r * 255)
      data[idx++] = Math.floor(g * 255)
      data[idx++] = Math.floor(b * 255)
      data[idx++] = 255
    }
  }

  return data
}

/** Default paper white in linear sRGB. */
const DEFAULT_FRONT: Rgb = [0.96, 0.96, 0.86]
const DEFAULT_BACK: Rgb = [1.0, 1.0, 1.0]
const DEFAULT_CONTRAST = 0.5
const DEFAULT_ROUGHNESS = 0.3
const DEFAULT_FIBER = 0.4
const DEFAULT_FIBER_SIZE = 0.5
const DEFAULT_CRUMPLES = 0.2
const DEFAULT_CRUMPLE_SIZE = 0.5
const DEFAULT_FOLDS = 0.1
const DEFAULT_FOLD_COUNT = 5
const DEFAULT_DROPS = 0
const DEFAULT_FADE = 0
const DEFAULT_SEED = 42
const DEFAULT_INTENSITY = 1

/** Clamp unit interval paper controls while preserving prior value for non-finite input. */
function clampUnit(value: number | undefined, fallback: number): number {
  return clampFinite(value, fallback, 0, 1)
}

/** Clamp paper texture scale controls to shader-supported bounds. */
function clampPaperScale(value: number | undefined, fallback: number): number {
  return clampFinite(value, fallback, 0.1, 2)
}

/** Clamp fold count to the integer range used by the WGSL loop. */
function clampFoldCount(value: number | undefined, fallback: number): number {
  return clampFiniteInteger(value, fallback, 1, 15)
}

/** Clamp deterministic paper-noise seed to the persisted UI range. */
function clampPaperSeed(value: number | undefined, fallback: number): number {
  return clampFinite(value, fallback, 0, 1000)
}

/** Clamp render-context resolution to positive finite shader dimensions. */
function sanitizeResolutionExtent(value: number | undefined): number {
  return clampFinite(value, 1, 1, Number.MAX_SAFE_INTEGER)
}

/** Replace invalid animation time with a deterministic shader-safe value. */
function sanitizeTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Converts quality level to numeric value.
 * @param quality - Quality level ('low', 'medium', 'high')
 * @returns Numeric representation (0, 1, or 2)
 */
function qualityToNumber(quality: PaperQuality): number {
  switch (quality) {
    case 'low':
      return 0
    case 'medium':
      return 1
    case 'high':
      return 2
    default:
      return 1
  }
}

/**
 * WebGPU Paper Texture Pass.
 *
 * Applies realistic paper/cardboard texture overlay to the scene.
 */
export class PaperTexturePass extends WebGPUBasePass {
  private passConfig: PaperTexturePassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null
  // PERF: Pre-allocated uniform buffer to avoid per-frame GC pressure
  private uniformData = new Float32Array(32) // 128 bytes
  private bgCache = new BindGroupCache()

  // Sampler
  private sampler: GPUSampler | null = null

  // Noise texture
  private noiseTexture: GPUTexture | null = null
  private noiseTextureView: GPUTextureView | null = null

  // Configuration
  private contrast: number
  private roughness: number
  private fiber: number
  private fiberSize: number
  private crumples: number
  private crumpleSize: number
  private folds: number
  private foldCount: number
  private drops: number
  private fade: number
  private seed: number
  private colorFront: Rgb
  private colorBack: Rgb
  private quality: number
  private intensity: number

  constructor(config: PaperTexturePassConfig) {
    super({
      id: 'paper-texture',
      priority: 195, // After tonemapping, before cinematic
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config

    // Initialize parameters
    this.contrast = clampUnit(config.contrast, DEFAULT_CONTRAST)
    this.roughness = clampUnit(config.roughness, DEFAULT_ROUGHNESS)
    this.fiber = clampUnit(config.fiber, DEFAULT_FIBER)
    this.fiberSize = clampPaperScale(config.fiberSize, DEFAULT_FIBER_SIZE)
    this.crumples = clampUnit(config.crumples, DEFAULT_CRUMPLES)
    this.crumpleSize = clampPaperScale(config.crumpleSize, DEFAULT_CRUMPLE_SIZE)
    this.folds = clampUnit(config.folds, DEFAULT_FOLDS)
    this.foldCount = clampFoldCount(config.foldCount, DEFAULT_FOLD_COUNT)
    this.drops = clampUnit(config.drops, DEFAULT_DROPS)
    this.fade = clampUnit(config.fade, DEFAULT_FADE)
    this.seed = clampPaperSeed(config.seed, DEFAULT_SEED)
    this.quality = qualityToNumber(config.quality ?? 'medium')
    this.intensity = clampUnit(config.intensity, DEFAULT_INTENSITY)

    // Set colors
    this.colorFront = config.colorFront
      ? parseHexColorToLinearRgb(config.colorFront, DEFAULT_FRONT)
      : DEFAULT_FRONT
    this.colorBack = config.colorBack
      ? parseHexColorToLinearRgb(config.colorBack, DEFAULT_BACK)
      : DEFAULT_BACK
  }

  /**
   * Create the rendering pipeline.
   * @param ctx - WebGPU setup context
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'paper-texture-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(
      device,
      PAPER_TEXTURE_SHADER,
      'paper-texture-fragment'
    )

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba8unorm',
      { label: 'paper-texture' }
    )

    // Create uniform buffer (needs to be 16-byte aligned)
    // Uniforms struct: 2 + 1 + 1 + 4 + 4 + 13 + 3 padding = 28 floats = 112 bytes, aligned to 128
    this.uniformBuffer = this.createUniformBuffer(device, 128, 'paper-texture-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'paper-texture-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    })

    // Create noise texture
    this.createNoiseTexture(device)
  }

  /**
   * Create the noise texture.
   * @param device - GPU device
   */
  private createNoiseTexture(device: GPUDevice): void {
    const size = 64
    const data = generatePaperNoiseData(size)

    // Create texture
    this.noiseTexture = device.createTexture({
      label: 'paper-noise-texture',
      size: [size, size],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })

    // Write data to texture
    device.queue.writeTexture(
      { texture: this.noiseTexture },
      data.buffer,
      { bytesPerRow: size * 4 },
      { width: size, height: size }
    )

    // Create texture view
    this.noiseTextureView = this.noiseTexture.createView({
      label: 'paper-noise-view',
    })
  }

  // ============================================================================
  // Setter Methods
  // ============================================================================

  setContrast(value: number): void {
    this.contrast = clampUnit(value, this.contrast)
  }

  setRoughness(value: number): void {
    this.roughness = clampUnit(value, this.roughness)
  }

  setFiber(value: number): void {
    this.fiber = clampUnit(value, this.fiber)
  }

  setFiberSize(value: number): void {
    this.fiberSize = clampPaperScale(value, this.fiberSize)
  }

  setCrumples(value: number): void {
    this.crumples = clampUnit(value, this.crumples)
  }

  setCrumpleSize(value: number): void {
    this.crumpleSize = clampPaperScale(value, this.crumpleSize)
  }

  setFolds(value: number): void {
    this.folds = clampUnit(value, this.folds)
  }

  setFoldCount(value: number): void {
    this.foldCount = clampFoldCount(value, this.foldCount)
  }

  setDrops(value: number): void {
    this.drops = clampUnit(value, this.drops)
  }

  setFade(value: number): void {
    this.fade = clampUnit(value, this.fade)
  }

  setSeed(value: number): void {
    this.seed = clampPaperSeed(value, this.seed)
  }

  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = getStoreSnapshot<{
      paperIntensity?: number
      paperRoughness?: number
      paperContrast?: number
      paperFiber?: number
      paperFiberSize?: number
      paperCrumples?: number
      paperCrumpleSize?: number
      paperFolds?: number
      paperFoldCount?: number
      paperDrops?: number
      paperFade?: number
      paperSeed?: number
      paperColorFront?: string
      paperColorBack?: string
      paperQuality?: string
    }>(ctx, 'postProcessing')

    if (postProcessing?.paperIntensity !== undefined) {
      this.intensity = clampUnit(postProcessing.paperIntensity, this.intensity)
    }
    if (postProcessing?.paperRoughness !== undefined) {
      this.roughness = clampUnit(postProcessing.paperRoughness, this.roughness)
    }
    if (postProcessing?.paperContrast !== undefined) {
      this.contrast = clampUnit(postProcessing.paperContrast, this.contrast)
    }
    if (postProcessing?.paperFiber !== undefined) {
      this.fiber = clampUnit(postProcessing.paperFiber, this.fiber)
    }
    if (postProcessing?.paperFiberSize !== undefined) {
      this.fiberSize = clampPaperScale(postProcessing.paperFiberSize, this.fiberSize)
    }
    if (postProcessing?.paperCrumples !== undefined) {
      this.crumples = clampUnit(postProcessing.paperCrumples, this.crumples)
    }
    if (postProcessing?.paperCrumpleSize !== undefined) {
      this.crumpleSize = clampPaperScale(postProcessing.paperCrumpleSize, this.crumpleSize)
    }
    if (postProcessing?.paperFolds !== undefined) {
      this.folds = clampUnit(postProcessing.paperFolds, this.folds)
    }
    if (postProcessing?.paperFoldCount !== undefined) {
      this.foldCount = clampFoldCount(postProcessing.paperFoldCount, this.foldCount)
    }
    if (postProcessing?.paperDrops !== undefined) {
      this.drops = clampUnit(postProcessing.paperDrops, this.drops)
    }
    if (postProcessing?.paperFade !== undefined) {
      this.fade = clampUnit(postProcessing.paperFade, this.fade)
    }
    if (postProcessing?.paperSeed !== undefined) {
      this.seed = clampPaperSeed(postProcessing.paperSeed, this.seed)
    }
    if (postProcessing?.paperColorFront !== undefined) {
      this.colorFront = parseHexColorToLinearRgb(postProcessing.paperColorFront, DEFAULT_FRONT)
    }
    if (postProcessing?.paperColorBack !== undefined) {
      this.colorBack = parseHexColorToLinearRgb(postProcessing.paperColorBack, DEFAULT_BACK)
    }
    if (postProcessing?.paperQuality !== undefined) {
      this.quality = qualityToNumber(postProcessing.paperQuality as PaperQuality)
    }
  }

  setColorFront(hex: string): void {
    this.colorFront = parseHexColorToLinearRgb(hex, DEFAULT_FRONT)
  }

  setColorBack(hex: string): void {
    this.colorBack = parseHexColorToLinearRgb(hex, DEFAULT_BACK)
  }

  setQuality(quality: PaperQuality): void {
    this.quality = qualityToNumber(quality)
  }

  setIntensity(value: number): void {
    this.intensity = clampUnit(value, this.intensity)
  }

  private writeUniformData(ctx: WebGPURenderContext): Float32Array {
    const data = this.uniformData
    data.fill(0)
    data[0] = sanitizeResolutionExtent(ctx.size?.width)
    data[1] = sanitizeResolutionExtent(ctx.size?.height)
    data[2] = sanitizeTime(ctx.frame?.time)
    data[3] = 1.0 // pixelRatio - WebGPU handles DPR internally
    // colorFront (RGBA, alpha always 1.0)
    data[4] = this.colorFront[0]
    data[5] = this.colorFront[1]
    data[6] = this.colorFront[2]
    data[7] = 1.0
    // colorBack (RGBA, alpha always 1.0)
    data[8] = this.colorBack[0]
    data[9] = this.colorBack[1]
    data[10] = this.colorBack[2]
    data[11] = 1.0
    // Parameters
    data[12] = this.contrast
    data[13] = this.roughness
    data[14] = this.fiber
    data[15] = this.fiberSize
    data[16] = this.crumples
    data[17] = this.crumpleSize
    data[18] = this.folds
    data[19] = this.foldCount
    data[20] = this.drops
    data[21] = this.fade
    data[22] = this.seed
    data[23] = this.quality
    data[24] = this.intensity
    return data
  }

  /**
   * Execute the paper texture pass.
   * @param ctx - WebGPU render context
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.sampler ||
      !this.noiseTextureView
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)

    // Get input texture
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    if (!colorView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Update uniforms
    // Layout matches the WGSL struct:
    // vec2f resolution (8), f32 time (4), f32 pixelRatio (4) = 16
    // vec4f colorFront (16) = 32
    // vec4f colorBack (16) = 48
    // f32 contrast, roughness, fiber, fiberSize = 64
    // f32 crumples, crumpleSize, folds, foldCount = 80
    // f32 drops, fade, seed, quality = 96
    // f32 intensity, pad0, pad1, pad2 = 112 -> aligned to 128
    // PERF: Reuse pre-allocated uniform buffer
    const data = this.writeUniformData(ctx)

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    const bindGroup = this.bgCache.get([colorView], () =>
      this.device!.createBindGroup({
        label: 'paper-texture-bg',
        layout: this.passBindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer! } },
          { binding: 1, resource: this.sampler! },
          { binding: 2, resource: colorView },
          { binding: 3, resource: this.noiseTextureView! },
        ],
      })
    )

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'paper-texture-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    // Render fullscreen
    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    destroyGpuResources(this.uniformBuffer, this.noiseTexture)
    this.uniformBuffer = null
    this.sampler = null
    this.noiseTexture = null
    this.noiseTextureView = null
    this.bgCache.invalidate()

    super.dispose()
  }
}
