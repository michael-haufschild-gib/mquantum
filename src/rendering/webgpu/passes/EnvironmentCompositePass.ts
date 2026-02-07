/**
 * WebGPU Environment Composite Pass
 *
 * Composites the lensed environment layer behind the main object layer.
 * Uses premultiplied alpha over operation: the main object texture contains
 * premultiplied RGB (from hardware src-alpha blending onto clear black).
 *
 * @module rendering/webgpu/passes/EnvironmentCompositePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Environment composite pass configuration.
 */
export interface EnvironmentCompositePassConfig {
  /** Lensed environment input resource ID */
  lensedEnvironmentInput: string
  /** Main object input resource ID */
  mainObjectInput: string
  /** Main object depth input resource ID */
  mainObjectDepthInput: string
  /** Output resource ID */
  outputResource: string
}

/**
 * WGSL Environment Composite Fragment Shader
 *
 * Composites premultiplied main object over the environment background.
 * Uses textureLoad for depth (texture_depth_2d cannot use textureSample).
 */
const ENVIRONMENT_COMPOSITE_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tLensedEnvironment: texture_2d<f32>;
@group(0) @binding(2) var tMainObject: texture_2d<f32>;
@group(0) @binding(3) var tMainObjectDepth: texture_depth_2d;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample color textures with filtering sampler
  let envColor = textureSample(tLensedEnvironment, texSampler, uv);
  let objColor = textureSample(tMainObject, texSampler, uv);

  // Use textureLoad for depth (texture_depth_2d can't use textureSample)
  let texDims = textureDimensions(tMainObjectDepth);
  let depthCoord = vec2i(uv * vec2f(texDims));
  let objDepth = textureLoad(tMainObjectDepth, depthCoord, 0);

  // Branchless object/environment compositing
  // objColor.rgb is premultiplied (hardware src-alpha blend onto clear black)
  let noObject = objDepth >= 0.9999 && objColor.a < 0.01;
  let blendedColor = objColor.rgb + envColor.rgb * (1.0 - objColor.a);
  let blendedAlpha = max(envColor.a, objColor.a);
  let finalColor = select(blendedColor, envColor.rgb, noObject);
  let finalAlpha = select(blendedAlpha, envColor.a, noObject);

  return vec4f(finalColor, finalAlpha);
}
`

/**
 * WebGPU Environment Composite Pass.
 *
 * Composites the lensed environment behind the main object layer.
 */
export class EnvironmentCompositePass extends WebGPUBasePass {
  private rendererConfig: EnvironmentCompositePassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Sampler
  private sampler: GPUSampler | null = null
  private bindGroup: GPUBindGroup | null = null
  private bindGroupLensedEnvView: GPUTextureView | null = null
  private bindGroupMainObjectView: GPUTextureView | null = null
  private bindGroupMainObjectDepthView: GPUTextureView | null = null

  constructor(config: EnvironmentCompositePassConfig) {
    super({
      id: 'environment-composite',
      priority: 200,
      inputs: [
        { resourceId: config.lensedEnvironmentInput, access: 'read' as const, binding: 0 },
        { resourceId: config.mainObjectInput, access: 'read' as const, binding: 1 },
        { resourceId: config.mainObjectDepthInput, access: 'read' as const, binding: 2 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.rendererConfig = config
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout (no uniform buffer needed)
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'environment-composite-bgl',
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
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'depth' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(
      device,
      ENVIRONMENT_COMPOSITE_SHADER,
      'environment-composite-fragment'
    )

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'environment-composite' }
    )

    // Create sampler
    this.sampler = device.createSampler({
      label: 'environment-composite-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Execute the composite pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.passBindGroupLayout ||
      !this.sampler
    ) {
      return
    }

    // Get input textures
    const lensedEnvView = ctx.getTextureView(this.rendererConfig.lensedEnvironmentInput)
    const mainObjectView = ctx.getTextureView(this.rendererConfig.mainObjectInput)
    const mainObjectDepthView = ctx.getTextureView(this.rendererConfig.mainObjectDepthInput)

    if (!lensedEnvView || !mainObjectView || !mainObjectDepthView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.rendererConfig.outputResource)
    if (!outputView) return

    // Recreate bind group only when texture views change
    if (
      !this.bindGroup ||
      this.bindGroupLensedEnvView !== lensedEnvView ||
      this.bindGroupMainObjectView !== mainObjectView ||
      this.bindGroupMainObjectDepthView !== mainObjectDepthView
    ) {
      this.bindGroup = this.device.createBindGroup({
        label: 'environment-composite-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: lensedEnvView },
          { binding: 2, resource: mainObjectView },
          { binding: 3, resource: mainObjectDepthView },
        ],
      })
      this.bindGroupLensedEnvView = lensedEnvView
      this.bindGroupMainObjectView = mainObjectView
      this.bindGroupMainObjectDepthView = mainObjectDepthView
    }

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'environment-composite-render',
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
    this.renderFullscreen(passEncoder, this.renderPipeline, [this.bindGroup])

    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.bindGroup = null
    this.bindGroupLensedEnvView = null
    this.bindGroupMainObjectView = null
    this.bindGroupMainObjectDepthView = null
    this.sampler = null

    super.dispose()
  }
}
