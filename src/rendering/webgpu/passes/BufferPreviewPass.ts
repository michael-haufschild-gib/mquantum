/**
 * WebGPU Buffer Preview Pass
 *
 * Debug visualization of the temporal ray-distance buffer (`quarter-position`),
 * an rgba32float texture where `.xyz` is the model-space ray hit position and
 * `.w` is the model-space ray distance. The pass maps distance linearly into
 * a grayscale image (near = white, far = black) and writes it directly to
 * the canvas, overwriting the final post-processed output when active.
 *
 * Enabled via the `bufferPreview` store getter returning a non-null value.
 *
 * @module rendering/webgpu/passes/BufferPreviewPass
 */

import { BindGroupCache } from '../core/BindGroupCache'
import type { CameraSnapshot } from '../core/storeAccess'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'

/**
 * Configuration for BufferPreviewPass.
 */
export interface BufferPreviewPassConfig {
  /** Input resource ID (must be rgba32float ray-position texture) */
  bufferInput: string
}

/**
 * Store config shape — non-null enables the preview for this frame.
 */
export interface BufferPreviewStoreConfig {
  /** Always the ray-position texture ID; kept as an explicit marker */
  bufferInput: string
}

/**
 * WGSL fragment shader: linear distance → grayscale.
 *
 * Uses textureLoad with unfilterable-float to avoid requiring a filterable
 * float sampler, which not all devices expose for rgba32float.
 */
const BUFFER_PREVIEW_SHADER = /* wgsl */ `
struct Uniforms {
  nearClip: f32,
  farClip: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let dims = textureDimensions(tInput);
  let coord = vec2i(input.uv * vec2f(dims));
  let texel = textureLoad(tInput, coord, 0);

  // .w holds the model-space ray distance; 0 indicates "no hit".
  let rayDistance = texel.w;
  if (rayDistance < 0.0001) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let normalized = (rayDistance - uniforms.nearClip) / (uniforms.farClip - uniforms.nearClip);
  // Near = white, Far = black.
  return vec4f(vec3f(1.0 - clamp(normalized, 0.0, 1.0)), 1.0);
}
`

/**
 * WebGPU Buffer Preview Pass.
 *
 * Renders directly to canvas when the `bufferPreview` store returns a non-null
 * config. Skips silently otherwise.
 */
export class BufferPreviewPass extends WebGPUBasePass {
  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer (2 f32 clip planes + 2 f32 padding = 16 bytes)
  private uniformBuffer: GPUBuffer | null = null
  private uniformArrayBuffer = new ArrayBuffer(16)
  private uniformFloatView = new Float32Array(this.uniformArrayBuffer)
  private bgCache = new BindGroupCache()

  // Camera clip planes (refreshed from camera store each frame)
  private nearClip = 0.1
  private farClip = 10000.0

  // Current input resource
  private bufferInputId: string

  constructor(config: BufferPreviewPassConfig) {
    super({
      id: 'bufferPreview',
      // Run after ToScreenPass (1000) to overwrite canvas when preview is active
      priority: 1100,
      inputs: [{ resourceId: config.bufferInput, access: 'read' as const, binding: 0 }],
      outputs: [], // Renders directly to canvas
    })

    this.bufferInputId = config.bufferInput
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'buffer-preview-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' as const },
        },
      ],
    })

    const fragmentModule = this.createShaderModule(
      device,
      BUFFER_PREVIEW_SHADER,
      'buffer-preview-fragment'
    )

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'buffer-preview' }
    )

    this.uniformBuffer = this.createUniformBuffer(device, 16, 'buffer-preview-uniforms')
  }

  /**
   * Execute the buffer preview pass. Skips when the store returns null.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.device || !this.renderPipeline || !this.uniformBuffer || !this.passBindGroupLayout) {
      return
    }

    // Skip if no preview active
    const previewConfig = getStoreSnapshot<BufferPreviewStoreConfig>(ctx, 'bufferPreview')
    if (!previewConfig) return

    if (previewConfig.bufferInput) {
      this.bufferInputId = previewConfig.bufferInput
    }

    // Refresh camera clip planes
    const camera = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')
    if (camera) {
      this.nearClip = camera.near ?? 0.1
      this.farClip = camera.far ?? 100
    }

    const inputView = ctx.getTextureView(this.bufferInputId)
    if (!inputView) return

    const canvasView = ctx.getCanvasTextureView()

    // Update uniforms
    this.uniformFloatView[0] = this.nearClip
    this.uniformFloatView[1] = this.farClip
    this.uniformFloatView[2] = 0
    this.uniformFloatView[3] = 0
    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformArrayBuffer)

    const bindGroup = this.bgCache.get([inputView], () =>
      this.device!.createBindGroup({
        label: 'buffer-preview-bg',
        layout: this.passBindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer! } },
          { binding: 1, resource: inputView },
        ],
      })
    )

    const passEncoder = ctx.beginRenderPass({
      label: 'buffer-preview-render',
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
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.bgCache.invalidate()

    super.dispose()
  }
}
