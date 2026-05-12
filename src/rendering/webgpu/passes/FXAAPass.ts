/**
 * WebGPU FXAA Pass
 *
 * Fast Approximate Anti-Aliasing for post-process anti-aliasing.
 *
 * @module rendering/webgpu/passes/FXAAPass
 */

import { clampFinite } from '@/lib/math/clamp'

import { BindGroupCache } from '../core/BindGroupCache'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { fxaaShader } from '../shaders/postprocessing/fxaa.wgsl'

/** Configuration for the FXAA anti-aliasing post-processing pass. */
export interface FXAAPassOptions {
  /** Input color resource (default: 'ldr-color') */
  colorInput?: string
  /** Output resource (default: 'final-color') */
  outputResource?: string
  subpixelQuality?: number
  edgeThreshold?: number
  edgeThresholdMin?: number
}

/** Clamp FXAA subpixel quality to shader-supported bounds. */
function sanitizeSubpixelQuality(value: number | undefined, fallback: number): number {
  return clampFinite(value, fallback, 0, 1)
}

/** Prevent non-finite or negative contrast thresholds from reaching WGSL uniforms. */
function sanitizeThreshold(value: number | undefined, fallback: number): number {
  return clampFinite(value, fallback, 0, Number.POSITIVE_INFINITY)
}

/**
 * FXAA (Fast Approximate Anti-Aliasing) pass.
 */
export class FXAAPass extends WebGPUBasePass {
  private uniformBuffer: GPUBuffer | null = null
  private bgCache = new BindGroupCache()
  private sampler: GPUSampler | null = null

  private subpixelQuality = 0.75
  private edgeThreshold = 0.125
  private edgeThresholdMin = 0.0625

  private readonly colorInputId: string
  private readonly outputResourceId: string
  private uniformData = new Float32Array(12)
  private lastUniformWidth = -1
  private lastUniformHeight = -1
  private lastUniformSubpixelQuality = Number.NaN
  private lastUniformEdgeThreshold = Number.NaN
  private lastUniformEdgeThresholdMin = Number.NaN

  constructor(options?: FXAAPassOptions) {
    const colorInput = options?.colorInput ?? 'ldr-color'
    const outputResource = options?.outputResource ?? 'final-color'

    super({
      id: 'fxaa',
      priority: 950, // After tonemapping
      inputs: [{ resourceId: colorInput, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })

    this.colorInputId = colorInput
    this.outputResourceId = outputResource

    this.subpixelQuality = sanitizeSubpixelQuality(options?.subpixelQuality, this.subpixelQuality)
    this.edgeThreshold = sanitizeThreshold(options?.edgeThreshold, this.edgeThreshold)
    this.edgeThresholdMin = sanitizeThreshold(options?.edgeThresholdMin, this.edgeThresholdMin)
  }

  setSubpixelQuality(value: number): void {
    this.subpixelQuality = sanitizeSubpixelQuality(value, this.subpixelQuality)
  }

  setEdgeThreshold(value: number): void {
    this.edgeThreshold = sanitizeThreshold(value, this.edgeThreshold)
  }

  setEdgeThresholdMin(value: number): void {
    this.edgeThresholdMin = sanitizeThreshold(value, this.edgeThresholdMin)
  }

  private updateUniforms(width: number, height: number): void {
    if (!this.device || !this.uniformBuffer) return

    if (
      width === this.lastUniformWidth &&
      height === this.lastUniformHeight &&
      this.subpixelQuality === this.lastUniformSubpixelQuality &&
      this.edgeThreshold === this.lastUniformEdgeThreshold &&
      this.edgeThresholdMin === this.lastUniformEdgeThresholdMin
    ) {
      return
    }

    // Must match FXAAUniforms struct layout (48 bytes total):
    //   offset  0: resolution (vec2f, 8 bytes)
    //   offset  8: subpixelQuality   (f32, 4 bytes)
    //   offset 12: edgeThreshold     (f32, 4 bytes)
    //   offset 16: edgeThresholdMin  (f32, 4 bytes)
    //   offset 20: IMPLICIT PADDING  (12 bytes — vec3f has 16-byte alignment)
    //   offset 32: _padding          (vec3f, 12 bytes)
    //   offset 44: TRAILING PADDING  (4 bytes — struct rounds up to 16-byte alignment)
    // → indices 0..11 of this Float32Array cover all 48 bytes.
    this.uniformData[0] = width
    this.uniformData[1] = height
    this.uniformData[2] = this.subpixelQuality
    this.uniformData[3] = this.edgeThreshold
    this.uniformData[4] = this.edgeThresholdMin
    this.uniformData[5] = 0 // implicit pad
    this.uniformData[6] = 0 // implicit pad
    this.uniformData[7] = 0 // implicit pad
    this.uniformData[8] = 0 // _padding.x
    this.uniformData[9] = 0 // _padding.y
    this.uniformData[10] = 0 // _padding.z
    this.uniformData[11] = 0 // trailing pad

    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformData)

    this.lastUniformWidth = width
    this.lastUniformHeight = height
    this.lastUniformSubpixelQuality = this.subpixelQuality
    this.lastUniformEdgeThreshold = this.edgeThreshold
    this.lastUniformEdgeThresholdMin = this.edgeThresholdMin
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    const shaderModule = this.createShaderModule(device, fxaaShader, 'fxaa-shader')

    // Create bind group layout
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'fxaa-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })

    // Create uniform buffer (48 bytes) — see `updateUniforms` for the full
    // byte-offset layout. The 48-byte size is driven by the trailing `vec3f`
    // member's 16-byte alignment: 20 bytes of real data + 12 bytes implicit
    // padding + 12 bytes vec3f + 4 bytes trailing struct-alignment pad.
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'fxaa-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'fxaa-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.pipeline = this.createFullscreenPipeline(
      device,
      shaderModule,
      [this.bindGroupLayout],
      'rgba8unorm',
      { label: 'fxaa' }
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

    const { width, height } = ctx.size

    this.updateUniforms(width, height)

    // Get textures
    const inputView = ctx.getTextureView(this.colorInputId)
    const outputView = ctx.getWriteTarget(this.outputResourceId) ?? ctx.getCanvasTextureView()

    if (!inputView) return

    const bindGroup = this.bgCache.get([inputView], () =>
      this.createBindGroup(
        this.device!,
        this.bindGroupLayout!,
        [
          { binding: 0, resource: { buffer: this.uniformBuffer! } },
          { binding: 1, resource: inputView },
          { binding: 2, resource: this.sampler! },
        ],
        'fxaa-bindgroup'
      )
    )

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'fxaa-pass',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.pipeline!, [bindGroup])
    passEncoder.end()
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.bgCache.invalidate()
    this.sampler = null
    super.dispose()
  }
}
