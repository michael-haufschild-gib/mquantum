/**
 * WebGPU Frame Blending Pass
 *
 * Blends current frame with previous frame for smoother motion at low frame rates.
 * Uses an internal ping-pong buffer to store frame history.
 *
 * @module rendering/webgpu/passes/FrameBlendingPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Frame blending pass configuration.
 */
export interface FrameBlendingPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string
  /** Blend factor (0 = current only, 1 = previous only) */
  blendFactor?: number
}

/**
 * WGSL Frame Blending Fragment Shader
 */
const FRAME_BLENDING_SHADER = /* wgsl */ `
struct Uniforms {
  blendFactor: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tCurrentFrame: texture_2d<f32>;
@group(0) @binding(3) var tPreviousFrame: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  let current = textureSample(tCurrentFrame, texSampler, uv);
  let previous = textureSample(tPreviousFrame, texSampler, uv);

  // Linear blend between current and previous frame
  // blendFactor 0 = fully current, 1 = fully previous
  // Defensive clamp to ensure valid range
  let blendFactor = clamp(uniforms.blendFactor, 0.0, 1.0);
  return mix(current, previous, blendFactor);
}
`

/**
 * WGSL Copy Shader for history buffer initialization
 */
const COPY_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tSource: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(tSource, texSampler, input.uv);
}
`

/**
 * WebGPU Frame Blending Pass.
 *
 * Maintains an internal history buffer and blends the current frame
 * with the previous frame based on the blend factor.
 *
 * @example
 * ```typescript
 * const frameBlendingPass = new FrameBlendingPass({
 *   colorInput: 'tonemappedOutput',
 *   outputResource: 'frameBlendingOutput',
 *   blendFactor: 0.3,
 * });
 * ```
 */
export class FrameBlendingPass extends WebGPUBasePass {
  private passConfig: FrameBlendingPassConfig

  // Pipelines
  private blendPipeline: GPURenderPipeline | null = null
  private copyPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private copyBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private blendFactor: number

  // Internal history buffer (ping-pong)
  private historyTexture: GPUTexture | null = null
  private historyView: GPUTextureView | null = null
  private historyInitialized = false
  private lastWidth = 0
  private lastHeight = 0

  // Texture format for history buffer
  private textureFormat: GPUTextureFormat = 'rgba16float'

  constructor(config: FrameBlendingPassConfig) {
    super({
      id: 'frame-blending',
      priority: 200,
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.blendFactor = config.blendFactor ?? 0.3
  }

  /**
   * Create the rendering pipelines.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    this.textureFormat = format

    // Create blend pass bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'frame-blending-bgl',
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

    // Create copy pass bind group layout
    this.copyBindGroupLayout = device.createBindGroupLayout({
      label: 'frame-blending-copy-bgl',
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
      ],
    })

    // Create blend fragment shader module
    const blendFragmentModule = this.createShaderModule(
      device,
      FRAME_BLENDING_SHADER,
      'frame-blending-fragment'
    )

    // Create copy fragment shader module
    const copyFragmentModule = this.createShaderModule(
      device,
      COPY_SHADER,
      'frame-blending-copy-fragment'
    )

    // Create blend pipeline
    this.blendPipeline = this.createFullscreenPipeline(
      device,
      blendFragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'frame-blending' }
    )

    // Create copy pipeline
    this.copyPipeline = this.createFullscreenPipeline(
      device,
      copyFragmentModule,
      [this.copyBindGroupLayout],
      format,
      { label: 'frame-blending-copy' }
    )

    // Create uniform buffer (16 bytes aligned for vec4-like structure)
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'frame-blending-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'frame-blending-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Create or resize the internal history buffer.
   */
  private ensureHistoryBuffer(device: GPUDevice, width: number, height: number): void {
    if (this.historyTexture && this.lastWidth === width && this.lastHeight === height) {
      return
    }

    // Dispose old buffer
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }

    // Create new texture matching output size
    this.historyTexture = device.createTexture({
      label: 'frame-blending-history',
      size: { width, height },
      format: this.textureFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })

    this.historyView = this.historyTexture.createView({
      label: 'frame-blending-history-view',
    })

    this.lastWidth = width
    this.lastHeight = height
    this.historyInitialized = false
  }

  /**
   * Set blend factor.
   * @param value Blend factor (0 = current only, 1 = previous only)
   */
  setBlendFactor(value: number): void {
    this.blendFactor = value
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      frameBlendFactor?: number
    }

    if (postProcessing?.frameBlendFactor !== undefined) {
      this.blendFactor = postProcessing.frameBlendFactor
    }
  }

  /**
   * Reset history buffer (e.g., on camera teleport or scene change).
   */
  resetHistory(): void {
    this.historyInitialized = false
  }

  /**
   * Check if pass was previously enabled (for detecting re-enable).
   * Call this to reset history when the pass is re-enabled after being disabled.
   */
  onEnabled(): void {
    // Reset history when pass is re-enabled to avoid stale frame blending
    this.historyInitialized = false
  }

  /**
   * Execute the frame blending pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.blendPipeline ||
      !this.copyPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.copyBindGroupLayout ||
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

    // Ensure history buffer exists at correct size
    this.ensureHistoryBuffer(this.device, ctx.size.width, ctx.size.height)

    if (!this.historyView) return

    // If first frame, just copy current to output and initialize history
    if (!this.historyInitialized) {
      // Create copy bind group for copying current to output
      const copyBindGroup = this.device.createBindGroup({
        label: 'frame-blending-copy-to-output-bg',
        layout: this.copyBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: colorView },
        ],
      })

      // Copy current frame to output
      const outputPassEncoder = ctx.beginRenderPass({
        label: 'frame-blending-copy-to-output',
        colorAttachments: [
          {
            view: outputView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })
      this.renderFullscreen(outputPassEncoder, this.copyPipeline, [copyBindGroup])
      outputPassEncoder.end()

      // Create copy bind group for copying output to history
      const historyInitBindGroup = this.device.createBindGroup({
        label: 'frame-blending-copy-to-history-bg',
        layout: this.copyBindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: colorView },
        ],
      })

      // Copy current to history for next frame
      const historyPassEncoder = ctx.beginRenderPass({
        label: 'frame-blending-init-history',
        colorAttachments: [
          {
            view: this.historyView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })
      this.renderFullscreen(historyPassEncoder, this.copyPipeline, [historyInitBindGroup])
      historyPassEncoder.end()

      this.historyInitialized = true
      return
    }

    // Update uniforms
    const data = new Float32Array(4)
    data[0] = this.blendFactor

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create blend bind group
    const blendBindGroup = this.device.createBindGroup({
      label: 'frame-blending-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
        { binding: 3, resource: this.historyView },
      ],
    })

    // Render blended result to output
    const blendPassEncoder = ctx.beginRenderPass({
      label: 'frame-blending-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(blendPassEncoder, this.blendPipeline, [blendBindGroup])
    blendPassEncoder.end()

    // Copy current frame to history for next frame.
    // Note: In WebGPU we can't easily copy the blended output back to history within
    // the same command encoder without introducing additional intermediate textures.
    // The simpler approach of storing the current frame (not the blended result) to
    // history is valid for temporal smoothing purposes, just with slightly different
    // accumulation characteristics than the WebGL version.
    const historyCopyBindGroup = this.device.createBindGroup({
      label: 'frame-blending-history-copy-bg',
      layout: this.copyBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: colorView },
      ],
    })
    const historyUpdateEncoder = ctx.beginRenderPass({
      label: 'frame-blending-update-history',
      colorAttachments: [
        {
          view: this.historyView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(historyUpdateEncoder, this.copyPipeline, [historyCopyBindGroup])
    historyUpdateEncoder.end()
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }
    this.historyInitialized = false
    this.lastWidth = 0
    this.lastHeight = 0
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.blendPipeline = null
    this.copyPipeline = null
    this.passBindGroupLayout = null
    this.copyBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null

    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }

    super.dispose()
  }
}
