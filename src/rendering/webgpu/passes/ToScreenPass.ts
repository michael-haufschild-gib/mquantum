/**
 * WebGPU To Screen Pass
 *
 * Copies a texture to the screen (canvas).
 * Typically the final pass in a render graph.
 *
 * Features:
 * - Simple copy shader (no modifications)
 * - Gamma correction option
 * - Tone mapping option
 * - CAS (Contrast Adaptive Sharpening) for upscaled content
 *
 * @module rendering/webgpu/passes/ToScreenPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for ToScreenPass.
 */
export interface ToScreenPassConfig {
  /** Input texture resource ID */
  inputResource: string

  /** Apply gamma correction (sRGB output) */
  gammaCorrection?: boolean

  /** Apply simple tone mapping */
  toneMapping?: boolean

  /** Exposure for tone mapping */
  exposure?: number

  /** CAS sharpening intensity (0-1, 0 = disabled) */
  sharpness?: number
}

/**
 * WGSL fragment shader for screen output with CAS sharpening.
 */
const TO_SCREEN_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: ToScreenParams;

struct ToScreenParams {
  gammaCorrection: u32,
  toneMapping: u32,
  exposure: f32,
  sharpness: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Simple Reinhard tone mapping
fn toneMap(color: vec3f, exposure: f32) -> vec3f {
  let exposed = color * exposure;
  return exposed / (1.0 + exposed);
}

// Linear to sRGB
fn linearToSRGB(color: vec3f) -> vec3f {
  return pow(color, vec3f(1.0 / 2.2));
}

/**
 * CAS (Contrast Adaptive Sharpening) - adapted from AMD FidelityFX
 *
 * This is a simplified 3x3 version that provides good quality sharpening
 * with minimal artifacts. The algorithm adapts sharpening strength based
 * on local contrast to prevent halo artifacts in high-contrast areas.
 */
fn casFilter(uv: vec2f) -> vec4f {
  let texDim = textureDimensions(tInput);
  let texelSize = vec2f(1.0 / f32(texDim.x), 1.0 / f32(texDim.y));

  // Sample center pixel once (reuse for both sharpening and alpha)
  let center = textureSample(tInput, texSampler, uv);
  let e = center.rgb;

  // Sample 4 cardinal neighbors
  let b = textureSample(tInput, texSampler, uv + vec2f(0.0, -texelSize.y)).rgb;
  let d = textureSample(tInput, texSampler, uv + vec2f(-texelSize.x, 0.0)).rgb;
  let f = textureSample(tInput, texSampler, uv + vec2f(texelSize.x, 0.0)).rgb;
  let h = textureSample(tInput, texSampler, uv + vec2f(0.0, texelSize.y)).rgb;

  // Soft min/max across 4 cardinal neighbors + center
  let minRGB = min(min(min(d, e), min(f, b)), h);
  let maxRGB = max(max(max(d, e), max(f, b)), h);

  // Calculate adaptive sharpening amount per channel
  // Higher local contrast = less sharpening (prevents halo artifacts)
  let rcpM = 1.0 / (maxRGB - minRGB + 0.001);
  var amp = clamp(min(minRGB, 2.0 - maxRGB) * rcpM, vec3f(0.0), vec3f(1.0));
  amp = sqrt(amp);  // Soft curve for smoother transition

  // Sharpening kernel weight (negative Laplacian-like filter)
  // Peak controls maximum sharpening strength
  let peak = -1.0 / (8.0 - 3.0 * params.sharpness);
  let w = amp * peak;

  // Apply sharpening: weighted sum of cardinal neighbors + center
  // Normalized to preserve overall brightness
  var sharpened = (b + d + f + h) * w + e;
  sharpened = sharpened / (1.0 + 4.0 * w);

  return vec4f(sharpened, center.a);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  var color: vec4f;

  // Apply CAS sharpening if enabled (sharpness > 0)
  if (params.sharpness > 0.001) {
    color = casFilter(input.uv);
  } else {
    color = textureSample(tInput, texSampler, input.uv);
  }

  if (params.toneMapping != 0u) {
    color = vec4f(toneMap(color.rgb, params.exposure), color.a);
  }

  if (params.gammaCorrection != 0u) {
    color = vec4f(linearToSRGB(color.rgb), color.a);
  }

  return color;
}
`

/**
 * WebGPU To Screen Pass.
 *
 * Copies a texture to the screen/canvas with optional
 * gamma correction, tone mapping, and CAS sharpening.
 *
 * @example
 * ```typescript
 * const toScreen = new ToScreenPass({
 *   inputResource: 'finalColor',
 *   gammaCorrection: true,
 *   toneMapping: false,
 * });
 *
 * graph.addPass(toScreen);
 * ```
 */
export class ToScreenPass extends WebGPUBasePass {
  private passConfig: ToScreenPassConfig

  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null
  private uniformBuffer: GPUBuffer | null = null

  // Current parameter values
  private gammaCorrection: boolean
  private toneMapping: boolean
  private exposure: number
  private sharpness: number

  constructor(config: ToScreenPassConfig) {
    super({
      id: 'toScreen',
      priority: 1000, // Execute last
      inputs: [{ resourceId: config.inputResource, access: 'read' as const, binding: 0 }],
      outputs: [], // ToScreenPass writes to canvas (no resource output)
    })

    this.passConfig = config
    this.gammaCorrection = config.gammaCorrection ?? false
    this.toneMapping = config.toneMapping ?? false
    this.exposure = config.exposure ?? 1.0
    this.sharpness = config.sharpness ?? 0.0
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'toScreen-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    const fragmentModule = this.createShaderModule(device, TO_SCREEN_SHADER, 'toScreen-fragment')

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'toScreen' }
    )

    this.sampler = device.createSampler({
      label: 'toScreen-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // Create uniform buffer (16-byte aligned: u32 + u32 + f32 + f32 = 16 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'toScreen-uniforms')
    this.updateUniformBuffer()
  }

  /**
   * Update the uniform buffer with current parameter values.
   */
  private updateUniformBuffer(): void {
    if (!this.device || !this.uniformBuffer) return

    const data = new ArrayBuffer(16)
    const view = new DataView(data)
    view.setUint32(0, this.gammaCorrection ? 1 : 0, true)
    view.setUint32(4, this.toneMapping ? 1 : 0, true)
    view.setFloat32(8, this.exposure, true)
    view.setFloat32(12, this.sharpness, true)

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)
  }

  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.passBindGroupLayout || !this.sampler || !this.uniformBuffer) return

    const sourceView = ctx.getTextureView(this.passConfig.inputResource)
    if (!sourceView) {
      console.warn('ToScreenPass: Input texture not found:', this.passConfig.inputResource)
      return
    }

    const canvasView = ctx.getCanvasTextureView()

    const bindGroup = this.device.createBindGroup({
      label: 'toScreen-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: sourceView },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    })

    const passEncoder = ctx.beginRenderPass({
      label: 'toScreen-render',
      colorAttachments: [
        {
          view: canvasView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])
    passEncoder.end()
  }

  /**
   * Set gamma correction.
   * @param enabled
   */
  setGammaCorrection(enabled: boolean): void {
    this.gammaCorrection = enabled
    this.updateUniformBuffer()
  }

  /**
   * Get gamma correction state.
   */
  getGammaCorrection(): boolean {
    return this.gammaCorrection
  }

  /**
   * Set tone mapping.
   * @param enabled
   */
  setToneMapping(enabled: boolean): void {
    this.toneMapping = enabled
    this.updateUniformBuffer()
  }

  /**
   * Get tone mapping state.
   */
  getToneMapping(): boolean {
    return this.toneMapping
  }

  /**
   * Set exposure.
   * @param exposure
   */
  setExposure(exposure: number): void {
    this.exposure = exposure
    this.updateUniformBuffer()
  }

  /**
   * Get exposure value.
   */
  getExposure(): number {
    return this.exposure
  }

  /**
   * Set CAS sharpening intensity.
   *
   * @param sharpness - Sharpening intensity (0-1, 0 = disabled)
   */
  setSharpness(sharpness: number): void {
    this.sharpness = Math.max(0, Math.min(1, sharpness))
    this.updateUniformBuffer()
  }

  /**
   * Get current sharpness value.
   */
  getSharpness(): number {
    return this.sharpness
  }

  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    super.dispose()
  }
}
