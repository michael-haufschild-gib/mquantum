/**
 * WebGPU Jets Composite Pass
 *
 * Composites the rendered jet buffer over the scene with additive blending.
 * This pass takes the jet color output from JetsRenderPass and blends it
 * with the scene color to create the final result.
 *
 * @module rendering/webgpu/passes/JetsCompositePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for JetsCompositePass.
 */
export interface JetsCompositePassConfig {
  /** Scene color input resource ID */
  sceneInput: string
  /** Jets color input resource ID */
  jetsInput: string
  /** Output resource ID */
  outputResource: string
}

/**
 * WGSL Jets Composite Fragment Shader
 *
 * Performs additive blending of jet color over scene color.
 */
const JETS_COMPOSITE_SHADER = /* wgsl */ `
struct Uniforms {
  jetOpacity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tScene: texture_2d<f32>;
@group(0) @binding(3) var tJets: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample both layers
  let sceneColor = textureSample(tScene, texSampler, uv);
  let jetColor = textureSample(tJets, texSampler, uv);

  // Additive blending: scene + (jet * jet.alpha * opacity)
  let combined = sceneColor.rgb + jetColor.rgb * jetColor.a * uniforms.jetOpacity;

  return vec4f(combined, sceneColor.a);
}
`

/**
 * WebGPU Jets Composite Pass.
 *
 * Uses additive blending to overlay the emissive jet buffer on top of
 * the scene. The jet opacity can be controlled via blackhole config.
 *
 * @example
 * ```typescript
 * const jetsComposite = new JetsCompositePass({
 *   sceneInput: 'sceneColor',
 *   jetsInput: 'jetsColor',
 *   outputResource: 'sceneWithJets',
 * });
 * ```
 */
export class JetsCompositePass extends WebGPUBasePass {
  private passConfig: JetsCompositePassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout (named passBindGroupLayout to avoid base class conflict)
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  constructor(config: JetsCompositePassConfig) {
    super({
      id: 'jets-composite',
      priority: 210, // After environment composite
      inputs: [
        { resourceId: config.sceneInput, access: 'read' as const, binding: 0 },
        { resourceId: config.jetsInput, access: 'read' as const, binding: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
  }

  /**
   * Create the rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'jets-composite-bgl',
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
      JETS_COMPOSITE_SHADER,
      'jets-composite-fragment'
    )

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'jets-composite' }
    )

    // Create uniform buffer (16 bytes minimum for alignment)
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'jets-composite-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'jets-composite-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Execute the composite pass.
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

    // Get input textures
    const sceneView = ctx.getTextureView(this.passConfig.sceneInput)
    const jetsView = ctx.getTextureView(this.passConfig.jetsInput)

    if (!sceneView) {
      console.warn(`JetsCompositePass: Scene texture '${this.passConfig.sceneInput}' not found`)
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Read jet intensity from frozen frame context
    const blackhole = ctx.frame?.stores?.['blackHole'] as { jetsIntensity?: number } | undefined
    const jetIntensity = blackhole?.jetsIntensity ?? 1.0

    // Calculate opacity - scale with intensity, allow full brightness
    // The shader uses additive blending so we don't need to cap at 1.0
    const opacity = jetsView ? jetIntensity * 0.8 : 0.0

    // Update uniforms
    const data = new Float32Array(4)
    data[0] = opacity
    // data[1-3] are padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group with current textures
    // Use a placeholder texture if jets texture is not available
    const jetsTextureView = jetsView ?? sceneView

    const bindGroup = this.device.createBindGroup({
      label: 'jets-composite-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: sceneView },
        { binding: 3, resource: jetsTextureView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'jets-composite-render',
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

    super.dispose()
  }
}
