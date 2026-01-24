/**
 * WebGPU God Rays Pass (Volumetric Light Scattering)
 *
 * Creates volumetric light scattering effect (crepuscular rays).
 * Simulates light scattering through atmospheric particles.
 *
 * @module rendering/webgpu/passes/GodRaysPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * God rays pass configuration.
 */
export interface GodRaysPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string
  /** Light position in screen space (0-1) */
  lightPosition?: [number, number]
  /** Exposure (overall brightness) */
  exposure?: number
  /** Decay (falloff rate) */
  decay?: number
  /** Density (number of samples) */
  density?: number
  /** Weight (intensity multiplier) */
  weight?: number
  /** Number of samples */
  samples?: number
}

/**
 * WGSL God Rays Fragment Shader
 */
const GOD_RAYS_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  lightPosition: vec2f,
  exposure: f32,
  decay: f32,
  density: f32,
  weight: f32,
  samples: f32,
  _pad: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Original color
  let originalColor = textureSample(tDiffuse, texSampler, uv).rgb;

  // Vector from current pixel to light source
  var deltaTexCoord = uv - uniforms.lightPosition;
  deltaTexCoord *= 1.0 / uniforms.samples * uniforms.density;

  // Start position
  var texCoord = uv;

  // Accumulate light scattering
  var illuminationDecay = 1.0;
  var godRays = vec3f(0.0);

  let sampleCount = i32(uniforms.samples);
  for (var i = 0; i < sampleCount; i++) {
    texCoord -= deltaTexCoord;

    // Sample the scene
    var sampleColor = textureSample(tDiffuse, texSampler, texCoord).rgb;

    // Extract brightness (only bright areas contribute)
    let luminance = dot(sampleColor, vec3f(0.299, 0.587, 0.114));
    sampleColor *= max(0.0, luminance - 0.5) * 2.0;

    // Apply decay and weight
    sampleColor *= illuminationDecay * uniforms.weight;
    godRays += sampleColor;

    // Decay illumination
    illuminationDecay *= uniforms.decay;
  }

  // Apply exposure
  godRays *= uniforms.exposure;

  // Combine with original (additive)
  let result = originalColor + godRays;

  return vec4f(result, 1.0);
}
`

/**
 * WebGPU God Rays Pass.
 */
export class GodRaysPass extends WebGPUBasePass {
  private passConfig: GodRaysPassConfig

  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  private lightPosition: [number, number]
  private exposure: number
  private decay: number
  private density: number
  private weight: number
  private samples: number

  constructor(config: GodRaysPassConfig) {
    super({
      id: 'god-rays',
      priority: 186,
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.lightPosition = config.lightPosition ?? [0.5, 0.5]
    this.exposure = config.exposure ?? 0.34
    this.decay = config.decay ?? 0.96
    this.density = config.density ?? 0.97
    this.weight = config.weight ?? 0.4
    this.samples = config.samples ?? 100
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'god-rays-bgl',
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

    const fragmentModule = this.createShaderModule(device, GOD_RAYS_SHADER, 'god-rays-fragment')

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'god-rays' }
    )

    this.uniformBuffer = this.createUniformBuffer(device, 48, 'god-rays-uniforms')

    this.sampler = device.createSampler({
      label: 'god-rays-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  setLightPosition(x: number, y: number): void {
    this.lightPosition = [x, y]
  }

  setExposure(value: number): void {
    this.exposure = value
  }

  setDecay(value: number): void {
    this.decay = value
  }

  setDensity(value: number): void {
    this.density = value
  }

  setWeight(value: number): void {
    this.weight = value
  }

  setSamples(value: number): void {
    this.samples = value
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.sampler
    )
      return

    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!colorView || !outputView) return

    const data = new Float32Array(12)
    data[0] = ctx.size.width
    data[1] = ctx.size.height
    data[2] = this.lightPosition[0]
    data[3] = this.lightPosition[1]
    data[4] = this.exposure
    data[5] = this.decay
    data[6] = this.density
    data[7] = this.weight
    data[8] = this.samples

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    const bindGroup = this.device.createBindGroup({
      label: 'god-rays-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
      ],
    })

    const passEncoder = ctx.beginRenderPass({
      label: 'god-rays-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])
    passEncoder.end()
  }

  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.sampler = null
    super.dispose()
  }
}
