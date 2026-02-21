/**
 * WebGPU Buffer Preview Pass
 *
 * Debug visualization pass for viewing various G-buffer contents:
 * - Depth buffer (raw, linear, focus zones)
 * - Temporal depth buffer
 * - Generic texture copy
 *
 * Renders directly to canvas, overwriting the final output when a preview
 * is active. Uses textureLoad with unfilterable-float to support all
 * texture types including depth24plus.
 *
 * @module rendering/webgpu/passes/BufferPreviewPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Buffer types that can be previewed.
 */
export type BufferType = 'copy' | 'depth' | 'temporalDepth'

/**
 * Depth visualization modes.
 */
export type DepthMode = 'raw' | 'linear' | 'focusZones'

/**
 * Configuration for BufferPreviewPass.
 */
export interface BufferPreviewPassConfig {
  /** Default input resource to preview */
  bufferInput: string
  /** Additional input resources (for dynamic switching without recompiling) */
  additionalInputs?: string[]
  /** Type of buffer being previewed */
  bufferType?: BufferType
  /** Depth visualization mode (for depth buffers) */
  depthMode?: DepthMode
  /** Camera near plane (for depth linearization) */
  nearClip?: number
  /** Camera far plane (for depth linearization) */
  farClip?: number
  /** Focus distance (for focus zones visualization) */
  focus?: number
  /** Focus range (for focus zones visualization) */
  focusRange?: number
}

/**
 * Store config shape for dynamic buffer preview control.
 */
export interface BufferPreviewStoreConfig {
  bufferType: BufferType
  bufferInput: string
  depthMode?: DepthMode
}

/**
 * WGSL Buffer Preview Fragment Shader
 *
 * Uses textureLoad (not textureSample) to support all texture types
 * including depth24plus bound as unfilterable-float.
 */
const BUFFER_PREVIEW_SHADER = /* wgsl */ `
struct Uniforms {
  bufferType: i32,    // 0=Copy, 1=Depth, 2=TemporalDepth
  depthMode: i32,     // 0=Raw, 1=Linear, 2=FocusZones
  nearClip: f32,
  farClip: f32,
  focus: f32,
  focusRange: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Load texel using integer coordinates (required for unfilterable-float)
fn loadTexel(uv: vec2f) -> vec4f {
  let dims = textureDimensions(tInput);
  let coord = vec2i(uv * vec2f(dims));
  return textureLoad(tInput, coord, 0);
}

// Convert perspective depth to view Z
fn perspectiveDepthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
  return (near * far) / ((far - near) * depth - far);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let texel = loadTexel(uv);

  // Type 1: Depth Buffer
  if (uniforms.bufferType == 1) {
    let depth = texel.x;

    // Mode 0: Raw Depth (Inverted: near=white, far=black)
    if (uniforms.depthMode == 0) {
      return vec4f(vec3f(1.0 - depth), 1.0);
    }

    let viewZ = -perspectiveDepthToViewZ(depth, uniforms.nearClip, uniforms.farClip);

    // Mode 1: Linear Depth (normalized)
    if (uniforms.depthMode == 1) {
      let normalized = (viewZ - uniforms.nearClip) / (uniforms.farClip - uniforms.nearClip);
      return vec4f(vec3f(clamp(normalized, 0.0, 1.0)), 1.0);
    }

    // Mode 2: Focus Zones (Green=In Focus, Red=Behind, Blue=In Front)
    if (uniforms.depthMode == 2) {
      let diff = viewZ - uniforms.focus;
      let absDiff = abs(diff);
      let safeFocusRange = max(uniforms.focusRange, 0.0001);

      // Green: In Focus
      let inFocus = 1.0 - clamp(absDiff / safeFocusRange, 0.0, 1.0);
      // Red: Behind focus
      let behind = clamp(diff / (safeFocusRange * 3.0), 0.0, 1.0);
      // Blue: In front of focus
      let infront = clamp(-diff / (safeFocusRange * 3.0), 0.0, 1.0);

      return vec4f(behind, inFocus, infront, 1.0);
    }
  }

  // Type 2: Temporal Depth
  // gPosition buffer: xyz = model-space position, w = model-space ray distance
  if (uniforms.bufferType == 2) {
    let temporalDepth = texel.w;  // Use .w (ray distance), NOT .r (X position)!

    // 0.0 indicates invalid/empty data (no hit)
    if (temporalDepth < 0.0001) {
      return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    // Normalize linear ray distance to 0-1 range
    let normalized = (temporalDepth - uniforms.nearClip) / (uniforms.farClip - uniforms.nearClip);

    // Invert: Near=White, Far=Black
    return vec4f(vec3f(1.0 - clamp(normalized, 0.0, 1.0)), 1.0);
  }

  // Type 0: Default - just copy
  return texel;
}
`

/**
 * WebGPU Buffer Preview Pass.
 *
 * Provides debug visualization of various G-buffer contents.
 * Renders directly to canvas when a preview is active (overwrites final output).
 * Skips execution when no preview is active (no-op).
 *
 * @example
 * ```typescript
 * const bufferPreview = new BufferPreviewPass({
 *   bufferInput: 'depth-buffer',
 *   bufferType: 'depth',
 *   depthMode: 'linear',
 * });
 * ```
 */
export class BufferPreviewPass extends WebGPUBasePass {
  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null
  // PERF: Pre-allocated uniform buffers to avoid per-frame GC pressure
  private uniformArrayBuffer = new ArrayBuffer(32)
  private uniformIntView = new Int32Array(this.uniformArrayBuffer, 0, 2)
  private uniformFloatView = new Float32Array(this.uniformArrayBuffer, 8, 6)
  // PERF: Cached bind group to avoid per-frame GPU driver calls
  private cachedBindGroup: GPUBindGroup | null = null
  private cachedInputView: GPUTextureView | null = null

  // Configuration
  private bufferType: number
  private depthMode: number
  private nearClip: number
  private farClip: number
  private focus: number
  private focusRange: number

  // Current input resource (can be changed dynamically)
  private bufferInputId: string

  constructor(config: BufferPreviewPassConfig) {
    const inputIds = [config.bufferInput, ...(config.additionalInputs ?? [])]
    const uniqueInputs = Array.from(new Set(inputIds))

    super({
      id: 'bufferPreview',
      // Run after ToScreenPass (1000) to overwrite canvas when preview is active
      priority: 1100,
      inputs: uniqueInputs.map((resourceId, index) => ({
        resourceId,
        access: 'read' as const,
        binding: index,
      })),
      outputs: [], // Renders directly to canvas
    })

    this.bufferInputId = config.bufferInput

    // Map buffer type to int
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      temporalDepth: 2,
    }

    // Map depth mode to int
    const depthModeMap: Record<DepthMode, number> = {
      raw: 0,
      linear: 1,
      focusZones: 2,
    }

    this.bufferType = typeMap[config.bufferType ?? 'copy']
    this.depthMode = depthModeMap[config.depthMode ?? 'raw']
    this.nearClip = config.nearClip ?? 0.1
    this.farClip = config.farClip ?? 1000.0
    this.focus = config.focus ?? 10.0
    this.focusRange = config.focusRange ?? 5.0
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    // Use unfilterable-float to support all texture types including depth24plus
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

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, BUFFER_PREVIEW_SHADER, 'buffer-preview-fragment')

    // Create pipeline targeting canvas format (direct-to-screen)
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'buffer-preview' }
    )

    // Create uniform buffer (8 i32/f32 values = 32 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'buffer-preview-uniforms')
  }

  /**
   * Set buffer type to preview.
   * @param type The buffer type
   */
  setBufferType(type: BufferType): void {
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      temporalDepth: 2,
    }
    this.bufferType = typeMap[type]
  }

  /**
   * Set which resource ID to preview.
   * @param resourceId The resource ID
   */
  setBufferInput(resourceId: string): void {
    this.bufferInputId = resourceId
  }

  /**
   * Set depth visualization mode.
   * @param mode The depth mode
   */
  setDepthMode(mode: DepthMode): void {
    const modeMap: Record<DepthMode, number> = {
      raw: 0,
      linear: 1,
      focusZones: 2,
    }
    this.depthMode = modeMap[mode]
  }

  /**
   * Set focus parameters for focus zones visualization.
   * @param focus Focus distance
   * @param focusRange Focus range
   */
  setFocusParams(focus: number, focusRange: number): void {
    this.focus = focus
    this.focusRange = focusRange
  }

  /**
   * Set camera clip planes.
   * @param near Near clip plane
   * @param far Far clip plane
   */
  setClipPlanes(near: number, far: number): void {
    this.nearClip = near
    this.farClip = far
  }

  /**
   * Execute the buffer preview pass.
   * Skips when no preview is active (checks bufferPreview store).
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout
    ) {
      return
    }

    // Dynamic configuration from stores — skip if no preview active
    const previewConfig = ctx.frame?.stores?.['bufferPreview'] as BufferPreviewStoreConfig | null
    if (!previewConfig) return

    // Update buffer type and input based on which debug flag is active
    if (previewConfig.bufferType !== undefined) {
      this.setBufferType(previewConfig.bufferType)
    }
    if (previewConfig.bufferInput !== undefined) {
      this.setBufferInput(previewConfig.bufferInput)
    }
    if (previewConfig.depthMode !== undefined) {
      this.setDepthMode(previewConfig.depthMode)
    }

    // Update camera clip planes from camera store
    const camera = ctx.frame?.stores?.['camera'] as { near?: number; far?: number } | null
    if (camera) {
      this.nearClip = camera.near ?? 0.1
      this.farClip = camera.far ?? 100
    }

    // Get input texture
    const inputView = ctx.getTextureView(this.bufferInputId)
    if (!inputView) return

    // Get canvas for output (renders directly to screen)
    const canvasView = ctx.getCanvasTextureView()

    // Update uniforms
    const intView = this.uniformIntView
    const floatView = this.uniformFloatView

    intView[0] = this.bufferType
    intView[1] = this.depthMode
    floatView[0] = this.nearClip
    floatView[1] = this.farClip
    floatView[2] = this.focus
    floatView[3] = this.focusRange

    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformArrayBuffer)

    // PERF: Cache bind group, invalidate only when input texture view changes
    if (!this.cachedBindGroup || this.cachedInputView !== inputView) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'buffer-preview-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: inputView },
        ],
      })
      this.cachedInputView = inputView
    }
    const bindGroup = this.cachedBindGroup

    // Begin render pass — clear canvas and overwrite with buffer visualization
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
    this.cachedBindGroup = null
    this.cachedInputView = null

    super.dispose()
  }
}
