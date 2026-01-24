/**
 * WebGPU Buffer Preview Pass
 *
 * Debug visualization pass for viewing various G-buffer contents:
 * - Depth buffer (raw, linear, focus zones)
 * - Normal buffer
 * - Temporal depth buffer
 * - Generic texture copy
 *
 * @module rendering/webgpu/passes/BufferPreviewPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Buffer types that can be previewed.
 */
export type BufferType = 'copy' | 'depth' | 'normal' | 'temporalDepth'

/**
 * Depth visualization modes.
 */
export type DepthMode = 'raw' | 'linear' | 'focusZones'

/**
 * Configuration for BufferPreviewPass.
 */
export interface BufferPreviewPassConfig {
  /** Input resource to preview */
  bufferInput: string
  /** Additional input resources (for dynamic switching without recompiling) */
  additionalInputs?: string[]
  /** Output resource */
  outputResource: string
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
 * WGSL Buffer Preview Fragment Shader
 */
const BUFFER_PREVIEW_SHADER = /* wgsl */ `
struct Uniforms {
  type: i32,          // 0=Copy, 1=Depth, 2=Normal, 3=TemporalDepth
  depthMode: i32,     // 0=Raw, 1=Linear, 2=FocusZones
  nearClip: f32,
  farClip: f32,
  focus: f32,
  focusRange: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tInput: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Convert perspective depth to view Z
fn perspectiveDepthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
  return (near * far) / ((far - near) * depth - far);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let texel = textureSample(tInput, texSampler, uv);

  // Type 1: Depth Buffer
  if (uniforms.type == 1) {
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

  // Type 2: Normal Buffer
  if (uniforms.type == 2) {
    let normal = texel.rgb;

    // Check for valid data (empty/background = near-zero)
    let hasNormal = step(0.01, length(normal));

    if (hasNormal < 0.5) {
      return vec4f(0.05, 0.05, 0.1, 1.0);
    } else {
      // Map from [-1, 1] to [0, 1] for visualization
      let displayNormal = normal * 0.5 + 0.5;
      return vec4f(displayNormal, 1.0);
    }
  }

  // Type 3: Temporal Depth
  // gPosition buffer: xyz = model-space position, w = model-space ray distance
  if (uniforms.type == 3) {
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
 * Useful for debugging depth, normals, and other intermediate buffers.
 *
 * @example
 * ```typescript
 * const depthPreview = new BufferPreviewPass({
 *   bufferInput: 'sceneDepth',
 *   outputResource: 'previewOutput',
 *   bufferType: 'depth',
 *   depthMode: 'linear',
 *   nearClip: 0.1,
 *   farClip: 1000.0,
 * });
 * ```
 */
export class BufferPreviewPass extends WebGPUBasePass {
  private passConfig: BufferPreviewPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

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
      priority: 200,
      inputs: uniqueInputs.map((resourceId, index) => ({
        resourceId,
        access: 'read' as const,
        binding: index,
      })),
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.bufferInputId = config.bufferInput

    // Map buffer type to int
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      normal: 2,
      temporalDepth: 3,
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
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'buffer-preview-bgl',
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
    const fragmentModule = this.createShaderModule(device, BUFFER_PREVIEW_SHADER, 'buffer-preview-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'buffer-preview' }
    )

    // Create uniform buffer (8 floats = 32 bytes, aligned to 16 = 32 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'buffer-preview-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'buffer-preview-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set buffer type to preview.
   * @param type The buffer type
   */
  setBufferType(type: BufferType): void {
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      normal: 2,
      temporalDepth: 3,
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

    // Get input texture
    const inputView = ctx.getTextureView(this.bufferInputId)
    if (!inputView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Update uniforms
    // Layout: type (i32), depthMode (i32), nearClip (f32), farClip (f32),
    //         focus (f32), focusRange (f32), _pad0 (f32), _pad1 (f32)
    const data = new ArrayBuffer(32)
    const intView = new Int32Array(data, 0, 2)
    const floatView = new Float32Array(data, 8, 6)

    intView[0] = this.bufferType
    intView[1] = this.depthMode
    floatView[0] = this.nearClip
    floatView[1] = this.farClip
    floatView[2] = this.focus
    floatView[3] = this.focusRange

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'buffer-preview-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: inputView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'buffer-preview-render',
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
