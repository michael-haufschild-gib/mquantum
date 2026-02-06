/**
 * WebGPU Environment Composite Pass
 *
 * Composites the lensed environment layer behind the main object layer.
 * Uses alpha blending to allow transparent objects to show through.
 *
 * @module rendering/webgpu/passes/EnvironmentCompositePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Shell glow configuration.
 */
export interface ShellGlowConfig {
  enabled: boolean
  color: [number, number, number]
  strength: number
}

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
 * Uses textureLoad instead of textureSample for horizon detection to avoid
 * non-uniform control flow issues in WGSL.
 */
const ENVIRONMENT_COMPOSITE_SHADER = /* wgsl */ `
struct Uniforms {
  near: f32,
  far: f32,
  shellEnabled: u32,
  shellGlowStrength: f32,
  shellGlowColor: vec3f,
  _pad0: f32,
  resolution: vec2f,
  _pad1: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tLensedEnvironment: texture_2d<f32>;
@group(0) @binding(3) var tMainObject: texture_2d<f32>;
@group(0) @binding(4) var tMainObjectDepth: texture_depth_2d;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Check if depth value represents the far plane
fn isAtFarPlane(depth: f32) -> bool {
  return depth >= 0.9999;
}

// Detect the visual boundary of the event horizon using textureLoad (uniform control flow safe)
fn detectHorizonEdge(uv: vec2f) -> f32 {
  let texDims = textureDimensions(tMainObject);
  let texCoord = vec2i(uv * vec2f(texDims));

  // Check if current pixel is horizon using textureLoad
  let centerColor = textureLoad(tMainObject, texCoord, 0);
  let centerDepth = textureLoad(tMainObjectDepth, texCoord, 0);
  let centerIsHorizon = centerDepth >= 0.999 && centerColor.a > 0.9;

  // Only glow OUTSIDE the horizon
  if (centerIsHorizon) {
    return 0.0;
  }

  // Check neighbors for horizon pixels using textureLoad with unrolled offsets
  var horizonCount = 0.0;

  // 5x5 grid offsets (excluding center)
  let offsets = array<vec2i, 24>(
    vec2i(-2, -2), vec2i(-1, -2), vec2i(0, -2), vec2i(1, -2), vec2i(2, -2),
    vec2i(-2, -1), vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1), vec2i(2, -1),
    vec2i(-2,  0), vec2i(-1,  0),               vec2i(1,  0), vec2i(2,  0),
    vec2i(-2,  1), vec2i(-1,  1), vec2i(0,  1), vec2i(1,  1), vec2i(2,  1),
    vec2i(-2,  2), vec2i(-1,  2), vec2i(0,  2), vec2i(1,  2), vec2i(2,  2)
  );

  for (var i = 0; i < 24; i++) {
    let sampleCoord = texCoord + offsets[i];
    // Clamp to texture bounds
    let clampedCoord = clamp(sampleCoord, vec2i(0), vec2i(texDims) - vec2i(1));

    let sampleColor = textureLoad(tMainObject, clampedCoord, 0);
    let sampleDepth = textureLoad(tMainObjectDepth, clampedCoord, 0);

    if (sampleDepth >= 0.999 && sampleColor.a > 0.9) {
      let dist = length(vec2f(offsets[i]));
      horizonCount += 1.0 / (dist + 0.5);
    }
  }

  return smoothstep(0.0, 3.0, horizonCount);
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

  var finalColor: vec3f;
  var finalAlpha: f32;

  if (isAtFarPlane(objDepth) && objColor.a < 0.01) {
    // No object at this pixel - show environment
    finalColor = envColor.rgb;
    finalAlpha = envColor.a;
  } else {
    // Object exists - blend based on alpha
    finalColor = objColor.rgb + envColor.rgb * (1.0 - objColor.a);
    finalAlpha = max(envColor.a, objColor.a);
  }

  // === PHOTON SHELL (Screen-space edge glow) ===
  if (uniforms.shellEnabled != 0u && uniforms.shellGlowStrength > 0.0) {
    let edge = detectHorizonEdge(uv);
    let shellGlow = uniforms.shellGlowColor * edge * uniforms.shellGlowStrength;
    finalColor += shellGlow;
  }

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

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null
  private bindGroup: GPUBindGroup | null = null
  private bindGroupLensedEnvView: GPUTextureView | null = null
  private bindGroupMainObjectView: GPUTextureView | null = null
  private bindGroupMainObjectDepthView: GPUTextureView | null = null
  private uniformData = new ArrayBuffer(64)
  private uniformFloatView = new Float32Array(this.uniformData)
  private uniformUintView = new Uint32Array(this.uniformData)

  // Shell glow config
  private shellConfig: ShellGlowConfig = {
    enabled: false,
    color: [1, 1, 1],
    strength: 0,
  }

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

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'environment-composite-bgl',
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
        {
          binding: 4,
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

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, 64, 'environment-composite-uniforms')

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
   * Set shell glow configuration.
   * @param config
   */
  setShellConfig(config: Partial<ShellGlowConfig>): void {
    if (config.enabled !== undefined) this.shellConfig.enabled = config.enabled
    if (config.color !== undefined) this.shellConfig.color = config.color
    if (config.strength !== undefined) this.shellConfig.strength = config.strength
  }

  /**
   * Get current shell glow configuration.
   */
  getShellConfig(): ShellGlowConfig {
    return { ...this.shellConfig }
  }

  private updateUniforms(ctx: WebGPURenderContext, near: number, far: number): void {
    if (!this.device || !this.uniformBuffer) return

    // Uniform layout matches WGSL `Uniforms` struct.
    this.uniformFloatView[0] = near
    this.uniformFloatView[1] = far
    this.uniformUintView[2] = this.shellConfig.enabled ? 1 : 0
    this.uniformFloatView[3] = this.shellConfig.strength
    this.uniformFloatView[4] = this.shellConfig.color[0]
    this.uniformFloatView[5] = this.shellConfig.color[1]
    this.uniformFloatView[6] = this.shellConfig.color[2]
    this.uniformFloatView[7] = 0
    this.uniformFloatView[8] = ctx.size.width
    this.uniformFloatView[9] = ctx.size.height
    this.uniformFloatView[10] = 0
    this.uniformFloatView[11] = 0

    this.writeUniformBuffer(this.device, this.uniformBuffer, new Uint8Array(this.uniformData))
  }

  /**
   * Execute the composite pass.
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

    // Get camera near/far
    const camera = ctx.frame?.stores?.['camera'] as { near?: number; far?: number }
    const near = camera?.near ?? 0.1
    const far = camera?.far ?? 100

    this.updateUniforms(ctx, near, far)

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
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: lensedEnvView },
          { binding: 3, resource: mainObjectView },
          { binding: 4, resource: mainObjectDepthView },
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
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null

    super.dispose()
  }
}
