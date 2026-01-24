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
@group(0) @binding(4) var tMainObjectDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Check if depth value represents the far plane
fn isAtFarPlane(depth: f32) -> bool {
  return depth >= 0.9999;
}

// Check if a pixel is part of the event horizon
fn isHorizonPixel(uv: vec2f) -> bool {
  let color = textureSample(tMainObject, texSampler, uv);
  let depth = textureSample(tMainObjectDepth, texSampler, uv).r;
  return depth >= 0.999 && color.a > 0.9;
}

// Detect the visual boundary of the event horizon
fn detectHorizonEdge(uv: vec2f) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;

  // Check if current pixel is horizon
  let centerIsHorizon = isHorizonPixel(uv);

  // Only glow OUTSIDE the horizon
  if (centerIsHorizon) {
    return 0.0;
  }

  // Check neighbors for horizon pixels
  var horizonCount: f32 = 0.0;

  // Sample in a small radius for smooth glow
  for (var x: f32 = -2.0; x <= 2.0; x += 1.0) {
    for (var y: f32 = -2.0; y <= 2.0; y += 1.0) {
      if (x == 0.0 && y == 0.0) { continue; }
      let sampleUv = uv + vec2f(x, y) * texelSize;
      if (isHorizonPixel(sampleUv)) {
        let dist = length(vec2f(x, y));
        horizonCount += 1.0 / (dist + 0.5);
      }
    }
  }

  return smoothstep(0.0, 3.0, horizonCount);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample both layers
  let envColor = textureSample(tLensedEnvironment, texSampler, uv);
  let objColor = textureSample(tMainObject, texSampler, uv);
  let objDepth = textureSample(tMainObjectDepth, texSampler, uv).r;

  var finalColor: vec3f;
  var finalAlpha: f32;

  if (isAtFarPlane(objDepth) && objColor.a < 0.01) {
    // No object at this pixel - show environment
    finalColor = envColor.rgb;
    finalAlpha = envColor.a;
  } else {
    // Object exists - blend based on alpha
    finalColor = objColor.rgb * objColor.a + envColor.rgb * (1.0 - objColor.a);
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
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

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
          texture: { sampleType: 'unfilterable-float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(
      device,
      ENVIRONMENT_COMPOSITE_SHADER,
      'environment-composite-fragment'
    )

    // Create pipeline using fullscreen helper
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
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

    // Update uniforms
    const data = new Float32Array(16)
    data[0] = near
    data[1] = far
    data[2] = this.shellConfig.enabled ? 1 : 0
    data[3] = this.shellConfig.strength
    data[4] = this.shellConfig.color[0]
    data[5] = this.shellConfig.color[1]
    data[6] = this.shellConfig.color[2]
    data[7] = 0 // padding
    data[8] = ctx.size.width
    data[9] = ctx.size.height
    // data[10-11] padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group with current textures
    const bindGroup = this.device.createBindGroup({
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
