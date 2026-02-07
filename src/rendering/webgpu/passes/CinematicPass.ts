/**
 * WebGPU Cinematic Pass
 *
 * Combines chromatic aberration, vignette, and film grain in a single pass.
 * Provides a film-like look to the rendered image.
 *
 * @module rendering/webgpu/passes/CinematicPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Cinematic pass configuration.
 */
export interface CinematicPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string
  /** Chromatic aberration distortion amount */
  aberration?: number
  /** Vignette darkness (0 = none, 2 = strong) */
  vignette?: number
  /** Film grain intensity */
  grain?: number
}

/**
 * WGSL Cinematic Fragment Shader
 */
const CINEMATIC_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  distortion: f32,
  vignetteDarkness: f32,
  vignetteOffset: f32,
  noiseIntensity: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// High-quality hash for film grain
fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // -- Chromatic Aberration --
  // Calculate distance from center (0.5, 0.5)
  let dist = uv - 0.5;

  // Distort UVs for each channel
  let offset = dist * uniforms.distortion;

  let r = textureSample(tDiffuse, texSampler, uv - offset).r;
  let g = textureSample(tDiffuse, texSampler, uv).g;
  let b = textureSample(tDiffuse, texSampler, uv + offset).b;

  var color = vec3f(r, g, b);

  // -- Vignette --
  let d = length(dist);
  let vignette = smoothstep(uniforms.vignetteOffset, uniforms.vignetteOffset - 0.6, d * uniforms.vignetteDarkness);
  color = color * vignette;

  // -- Film Grain --
  if (uniforms.noiseIntensity > 0.001) {
    let t = fract(uniforms.time * 10.0);
    let p = floor(uv * uniforms.resolution);
    let noise = hash(p + t * 100.0) - 0.5;
    color += vec3f(noise * uniforms.noiseIntensity);
  }

  // Preserve HDR values - only prevent negative
  color = max(color, vec3f(0.0));

  return vec4f(color, 1.0);
}
`

/**
 * WebGPU Cinematic Pass.
 *
 * Applies chromatic aberration, vignette, and film grain effects.
 */
export class CinematicPass extends WebGPUBasePass {
  private passConfig: CinematicPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null
  // PERF: Pre-allocated uniform buffer to avoid per-frame GC pressure
  private uniformData = new Float32Array(8)

  // Sampler
  private sampler: GPUSampler | null = null
  // PERF: Cached bind group to avoid per-frame GPU driver calls
  private cachedBindGroup: GPUBindGroup | null = null
  private cachedColorView: GPUTextureView | null = null

  // Configuration
  private aberration: number
  private vignette: number
  private vignetteOffset: number
  private grain: number

  constructor(config: CinematicPassConfig) {
    super({
      id: 'cinematic',
      priority: 190,
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.aberration = config.aberration ?? 0.005
    this.vignette = config.vignette ?? 1.2
    this.vignetteOffset = 1.0
    this.grain = config.grain ?? 0.05
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'cinematic-bgl',
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
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, CINEMATIC_SHADER, 'cinematic-fragment')

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba8unorm',
      { label: 'cinematic' }
    )

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'cinematic-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'cinematic-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set chromatic aberration intensity.
   * @param value
   */
  setAberration(value: number): void {
    this.aberration = value
  }

  /**
   * Set vignette darkness.
   * @param value
   */
  setVignette(value: number): void {
    this.vignette = value
  }


  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      cinematicVignette?: number
      cinematicAberration?: number
      cinematicGrain?: number
    }

    if (postProcessing?.cinematicVignette !== undefined) {
      this.vignette = postProcessing.cinematicVignette
    }
    // Note: vignetteOffset is not in store - using fixed default of 1.0
    if (postProcessing?.cinematicAberration !== undefined) {
      this.aberration = postProcessing.cinematicAberration
    }
    if (postProcessing?.cinematicGrain !== undefined) {
      this.grain = postProcessing.cinematicGrain
    }
  }

  /**
   * Set film grain intensity.
   * @param value
   */
  setGrain(value: number): void {
    this.grain = value
  }

  /**
   * Execute the cinematic pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.sampler
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

    // Update uniforms (reuse pre-allocated buffer)
    const data = this.uniformData
    data[0] = ctx.size.width
    data[1] = ctx.size.height
    data[2] = ctx.frame?.time ?? 0
    data[3] = this.aberration
    data[4] = this.vignette
    data[5] = this.vignetteOffset
    data[6] = this.grain

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // PERF: Cache bind group, invalidate only when input texture view changes
    if (!this.cachedBindGroup || this.cachedColorView !== colorView) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'cinematic-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: colorView },
        ],
      })
      this.cachedColorView = colorView
    }
    const bindGroup = this.cachedBindGroup

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'cinematic-render',
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
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null
    this.cachedBindGroup = null
    this.cachedColorView = null

    super.dispose()
  }
}
