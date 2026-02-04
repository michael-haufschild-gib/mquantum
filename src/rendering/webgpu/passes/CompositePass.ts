/**
 * WebGPU Composite Pass
 *
 * Blends multiple input textures with configurable blend modes.
 * Useful for combining render layers, adding effects, etc.
 *
 * @module rendering/webgpu/passes/CompositePass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Blend modes for compositing.
 */
export type BlendMode = 'add' | 'multiply' | 'screen' | 'alpha' | 'overlay'

/**
 * Input configuration for compositing.
 */
export interface CompositeInput {
  /** Resource ID for the input texture */
  resourceId: string
  /** Blend mode for this input */
  blendMode: BlendMode
  /** Blend weight (0-1) */
  weight?: number
}

/**
 * Configuration for WebGPU CompositePass.
 */
export interface CompositePassConfig {
  /** Unique pass ID */
  id?: string
  /** Input textures to composite */
  compositeInputs: CompositeInput[]
  /** Output resource ID */
  outputResource: string
  /** Background color RGB (0-1 range) */
  backgroundColor?: [number, number, number]
}

/**
 * WGSL Composite Fragment Shader
 *
 * Supports up to 4 input textures with different blend modes:
 * - add (0): Additive blending (glow, lights)
 * - multiply (1): Multiplicative blending (shadows, masks)
 * - screen (2): Screen blending (lightening)
 * - alpha (3): Standard alpha blending
 * - overlay (4): Overlay blending (contrast enhancement)
 */
const COMPOSITE_SHADER = /* wgsl */ `
struct Uniforms {
  weights: vec4f,
  blendModes: vec4<i32>,
  backgroundColor: vec3f,
  inputCount: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tInput0: texture_2d<f32>;
@group(0) @binding(3) var tInput1: texture_2d<f32>;
@group(0) @binding(4) var tInput2: texture_2d<f32>;
@group(0) @binding(5) var tInput3: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Blend functions
fn blendAdd(base: vec3f, blend: vec3f, weight: f32) -> vec3f {
  return base + blend * weight;
}

fn blendMultiply(base: vec3f, blend: vec3f, weight: f32) -> vec3f {
  return mix(base, base * blend, weight);
}

fn blendScreen(base: vec3f, blend: vec3f, weight: f32) -> vec3f {
  let screenResult = 1.0 - (1.0 - base) * (1.0 - blend);
  return mix(base, screenResult, weight);
}

fn blendAlphaColor(base: vec3f, blend: vec3f, alpha: f32, weight: f32) -> vec3f {
  return mix(base, blend, alpha * weight);
}

fn blendOverlay(base: vec3f, blend: vec3f, weight: f32) -> vec3f {
  var result: vec3f;
  // Component-wise overlay calculation
  if (base.r < 0.5) {
    result.r = 2.0 * base.r * blend.r;
  } else {
    result.r = 1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r);
  }
  if (base.g < 0.5) {
    result.g = 2.0 * base.g * blend.g;
  } else {
    result.g = 1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g);
  }
  if (base.b < 0.5) {
    result.b = 2.0 * base.b * blend.b;
  } else {
    result.b = 1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b);
  }
  return mix(base, result, weight);
}

fn applyBlend(base: vec3f, input: vec4f, blendMode: i32, weight: f32) -> vec3f {
  if (blendMode == 0) { return blendAdd(base, input.rgb, weight); }
  if (blendMode == 1) { return blendMultiply(base, input.rgb, weight); }
  if (blendMode == 2) { return blendScreen(base, input.rgb, weight); }
  if (blendMode == 3) { return blendAlphaColor(base, input.rgb, input.a, weight); }
  if (blendMode == 4) { return blendOverlay(base, input.rgb, weight); }
  return base;
}

/**
 * Blend alpha values based on blend mode.
 * - add: Accumulate alpha (clamped to 1)
 * - multiply: Multiply alphas
 * - screen: Screen blend alphas
 * - alpha: Over-compositing (Porter-Duff over)
 * - overlay: Use source alpha weighted by weight
 */
fn blendAlphaValue(baseAlpha: f32, inputAlpha: f32, blendMode: i32, weight: f32) -> f32 {
  if (blendMode == 0) {
    // Add: accumulate
    return min(baseAlpha + inputAlpha * weight, 1.0);
  }
  if (blendMode == 1) {
    // Multiply: multiply alphas
    return mix(baseAlpha, baseAlpha * inputAlpha, weight);
  }
  if (blendMode == 2) {
    // Screen: screen blend alphas
    let screenResult = 1.0 - (1.0 - baseAlpha) * (1.0 - inputAlpha);
    return mix(baseAlpha, screenResult, weight);
  }
  if (blendMode == 3) {
    // Alpha (over): Porter-Duff over compositing
    // Result = src.a + dst.a * (1 - src.a)
    let srcA = inputAlpha * weight;
    return srcA + baseAlpha * (1.0 - srcA);
  }
  if (blendMode == 4) {
    // Overlay: use input alpha weighted
    return mix(baseAlpha, inputAlpha, weight);
  }
  return baseAlpha;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  var result = uniforms.backgroundColor;
  // Start alpha at 0.0 - background is transparent unless we have opaque inputs
  var alpha: f32 = 0.0;

  if (uniforms.inputCount >= 1) {
    let input0 = textureSample(tInput0, texSampler, uv);
    result = applyBlend(result, input0, uniforms.blendModes.x, uniforms.weights.x);
    alpha = blendAlphaValue(alpha, input0.a, uniforms.blendModes.x, uniforms.weights.x);
  }

  if (uniforms.inputCount >= 2) {
    let input1 = textureSample(tInput1, texSampler, uv);
    result = applyBlend(result, input1, uniforms.blendModes.y, uniforms.weights.y);
    alpha = blendAlphaValue(alpha, input1.a, uniforms.blendModes.y, uniforms.weights.y);
  }

  if (uniforms.inputCount >= 3) {
    let input2 = textureSample(tInput2, texSampler, uv);
    result = applyBlend(result, input2, uniforms.blendModes.z, uniforms.weights.z);
    alpha = blendAlphaValue(alpha, input2.a, uniforms.blendModes.z, uniforms.weights.z);
  }

  if (uniforms.inputCount >= 4) {
    let input3 = textureSample(tInput3, texSampler, uv);
    result = applyBlend(result, input3, uniforms.blendModes.w, uniforms.weights.w);
    alpha = blendAlphaValue(alpha, input3.a, uniforms.blendModes.w, uniforms.weights.w);
  }

  return vec4f(result, alpha);
}
`

/**
 * WebGPU Composite Pass.
 *
 * Composites multiple input textures with configurable blend modes.
 * Supports up to 4 input textures.
 *
 * @example
 * ```typescript
 * const composite = new CompositePass({
 *   compositeInputs: [
 *     { resourceId: 'sceneColor', blendMode: 'alpha', weight: 1.0 },
 *     { resourceId: 'bloom', blendMode: 'add', weight: 0.5 },
 *   ],
 *   outputResource: 'final',
 * });
 * ```
 */
export class CompositePass extends WebGPUBasePass {
  private compositeInputs: CompositeInput[]
  private outputResourceId: string
  private backgroundColor: [number, number, number]

  // Pipeline resources
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  // Dummy texture for unused slots
  private dummyTexture: GPUTexture | null = null
  private dummyTextureView: GPUTextureView | null = null

  constructor(config: CompositePassConfig) {
    // Build inputs list from compositeInputs
    const inputs = config.compositeInputs.map((input, index) => ({
      resourceId: input.resourceId,
      access: 'read' as const,
      binding: index,
    }))

    super({
      id: config.id ?? 'composite',
      priority: 500,
      inputs,
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.compositeInputs = config.compositeInputs
    this.outputResourceId = config.outputResource
    this.backgroundColor = config.backgroundColor ?? [0, 0, 0]
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout - supports up to 4 textures
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'composite-bgl',
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
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, COMPOSITE_SHADER, 'composite-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'composite' }
    )

    // Create uniform buffer
    // Layout: vec4f weights (16) + vec4<i32> blendModes (16) + vec3f backgroundColor (12) + i32 inputCount (4) = 48 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'composite-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'composite-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Create dummy texture for unused texture slots
    this.dummyTexture = device.createTexture({
      label: 'composite-dummy-texture',
      size: { width: 1, height: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.dummyTextureView = this.dummyTexture.createView()
  }

  /**
   * Convert blend mode string to integer.
   * @param mode
   */
  private blendModeToInt(mode: BlendMode): number {
    const modeMap: Record<BlendMode, number> = {
      add: 0,
      multiply: 1,
      screen: 2,
      alpha: 3,
      overlay: 4,
    }
    return modeMap[mode]
  }

  /**
   * Update input weight.
   * @param index - Input index (0-3)
   * @param weight - New weight value (0-1)
   */
  setInputWeight(index: number, weight: number): void {
    const input = this.compositeInputs[index]
    if (input) {
      input.weight = weight
    }
  }

  /**
   * Update input blend mode.
   * @param index - Input index (0-3)
   * @param mode - New blend mode
   */
  setInputBlendMode(index: number, mode: BlendMode): void {
    const input = this.compositeInputs[index]
    if (input) {
      input.blendMode = mode
    }
  }

  /**
   * Update background color.
   * @param color - RGB values (0-1 range)
   */
  setBackgroundColor(color: [number, number, number]): void {
    this.backgroundColor = color
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
      !this.sampler ||
      !this.dummyTextureView
    ) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.outputResourceId)
    if (!outputView) return

    // Get input textures (up to 4)
    const inputCount = Math.min(this.compositeInputs.length, 4)
    const textureViews: GPUTextureView[] = []

    // Collect weights and blend modes
    const weights = new Float32Array(4)
    const blendModes = new Int32Array(4)

    for (let i = 0; i < 4; i++) {
      if (i < inputCount) {
        const input = this.compositeInputs[i]!
        const view = ctx.getTextureView(input.resourceId)
        textureViews.push(view ?? this.dummyTextureView)
        weights[i] = input.weight ?? 1.0
        blendModes[i] = this.blendModeToInt(input.blendMode)
      } else {
        textureViews.push(this.dummyTextureView)
        weights[i] = 1.0
        blendModes[i] = 0
      }
    }

    // Update uniforms
    // Layout: vec4f weights (16) + vec4<i32> blendModes (16) + vec3f backgroundColor (12) + i32 inputCount (4)
    const uniformData = new ArrayBuffer(48)
    const floatView = new Float32Array(uniformData)
    const intView = new Int32Array(uniformData)

    // weights (offset 0)
    floatView[0] = weights[0]!
    floatView[1] = weights[1]!
    floatView[2] = weights[2]!
    floatView[3] = weights[3]!

    // blendModes (offset 16 bytes = 4 floats)
    intView[4] = blendModes[0]!
    intView[5] = blendModes[1]!
    intView[6] = blendModes[2]!
    intView[7] = blendModes[3]!

    // backgroundColor (offset 32 bytes = 8 floats)
    floatView[8] = this.backgroundColor[0]
    floatView[9] = this.backgroundColor[1]
    floatView[10] = this.backgroundColor[2]

    // inputCount (offset 44 bytes = 11 floats)
    intView[11] = inputCount

    this.writeUniformBuffer(this.device, this.uniformBuffer, uniformData)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'composite-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: textureViews[0]! },
        { binding: 3, resource: textureViews[1]! },
        { binding: 4, resource: textureViews[2]! },
        { binding: 5, resource: textureViews[3]! },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'composite-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
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
    this.dummyTexture?.destroy()
    this.dummyTexture = null
    this.dummyTextureView = null

    super.dispose()
  }
}
