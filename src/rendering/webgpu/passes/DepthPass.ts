/**
 * WebGPU Depth Pass
 *
 * Processes depth buffer for use in post-processing effects.
 * Supports multiple output formats including linear depth and RGBA-packed depth.
 *
 * Unlike the WebGL version which renders the scene with depth material override,
 * this WebGPU pass processes an existing depth texture that was captured during
 * scene rendering. This fits the WebGPU architecture where scene rendering and
 * post-processing are cleanly separated.
 *
 * @module rendering/webgpu/passes/DepthPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Depth output format modes.
 */
export type DepthFormat = 'raw' | 'linear' | 'rgba' | 'linearRgba'

/**
 * Configuration for DepthPass.
 */
export interface DepthPassConfig {
  /** Input depth resource ID */
  depthInput: string
  /** Output resource ID */
  outputResource: string
  /** Output format mode */
  format?: DepthFormat
  /** Camera near plane (for depth linearization) */
  cameraNear?: number
  /** Camera far plane */
  cameraFar?: number
}

/**
 * WGSL Depth Processing Fragment Shader
 *
 * Supports multiple depth output formats:
 * - raw: Direct depth value (0-1 range)
 * - linear: Linearized depth normalized to near/far range
 * - rgba: RGBA-packed depth (compatible with Three.js RGBADepthPacking)
 * - linearRgba: RGBA-packed linear depth
 */
const DEPTH_SHADER = /* wgsl */ `
struct Uniforms {
  near: f32,
  far: f32,
  format: i32,  // 0=raw, 1=linear, 2=rgba, 3=linearRgba
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;  // Kept for potential future use
@group(0) @binding(2) var tDepth: texture_2d<f32>;

// Helper to load depth using integer coordinates (required for unfilterable-float textures)
fn loadDepth(uv: vec2f) -> f32 {
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  return textureLoad(tDepth, depthCoord, 0).r;
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Convert perspective depth to linear view-space Z
fn perspectiveDepthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
  return (near * far) / ((far - near) * depth - far);
}

// Linearize depth to 0-1 range based on near/far planes
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
  let viewZ = -perspectiveDepthToViewZ(depth, near, far);
  return (viewZ - near) / (far - near);
}

// Pack depth into RGBA (compatible with Three.js RGBADepthPacking)
// Uses bit-shifting approach for 32-bit precision across 4 channels
fn packDepthToRGBA(depth: f32) -> vec4f {
  let bitShift = vec4f(
    256.0 * 256.0 * 256.0,
    256.0 * 256.0,
    256.0,
    1.0
  );
  let bitMask = vec4f(
    0.0,
    1.0 / 256.0,
    1.0 / 256.0,
    1.0 / 256.0
  );
  var res = fract(depth * bitShift);
  res -= res.xxyz * bitMask;
  return res;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let depth = loadDepth(uv);

  // Format 0: Raw depth
  if (uniforms.format == 0) {
    return vec4f(depth, depth, depth, 1.0);
  }

  // Format 1: Linear depth
  if (uniforms.format == 1) {
    let linear = linearizeDepth(depth, uniforms.near, uniforms.far);
    return vec4f(linear, linear, linear, 1.0);
  }

  // Format 2: RGBA-packed raw depth
  if (uniforms.format == 2) {
    return packDepthToRGBA(depth);
  }

  // Format 3: RGBA-packed linear depth
  if (uniforms.format == 3) {
    let linear = linearizeDepth(depth, uniforms.near, uniforms.far);
    return packDepthToRGBA(linear);
  }

  // Fallback: raw depth
  return vec4f(depth, depth, depth, 1.0);
}
`

/**
 * WebGPU Depth Pass.
 *
 * Processes depth buffer for post-processing effects. Takes an existing depth
 * texture and outputs processed depth in various formats.
 *
 * Use cases:
 * - Linearizing depth for screen-space effects (SSR)
 * - RGBA packing for effects that need higher precision
 * - Depth-based post-processing (fog)
 *
 * @example
 * ```typescript
 * const depthPass = new DepthPass({
 *   depthInput: 'sceneDepth',
 *   outputResource: 'processedDepth',
 *   format: 'linear',
 *   cameraNear: 0.1,
 *   cameraFar: 1000.0,
 * });
 * ```
 */
export class DepthPass extends WebGPUBasePass {
  private passConfig: DepthPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private format: number
  private cameraNear: number
  private cameraFar: number

  constructor(config: DepthPassConfig) {
    super({
      id: 'depth',
      priority: 100, // Early in post-processing chain
      inputs: [{ resourceId: config.depthInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config

    // Map format to int
    const formatMap: Record<DepthFormat, number> = {
      raw: 0,
      linear: 1,
      rgba: 2,
      linearRgba: 3,
    }

    this.format = formatMap[config.format ?? 'raw']
    this.cameraNear = config.cameraNear ?? 0.1
    this.cameraFar = config.cameraFar ?? 1000.0
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'depth-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'non-filtering' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, DEPTH_SHADER, 'depth-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'depth' }
    )

    // Create uniform buffer (4 floats = 16 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 16, 'depth-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'depth-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set depth output format.
   * @param format The output format
   */
  setFormat(format: DepthFormat): void {
    const formatMap: Record<DepthFormat, number> = {
      raw: 0,
      linear: 1,
      rgba: 2,
      linearRgba: 3,
    }
    this.format = formatMap[format]
  }

  /**
   * Set camera clip planes.
   * @param near Near clip plane
   * @param far Far clip plane
   */
  setCameraClipPlanes(near: number, far: number): void {
    this.cameraNear = near
    this.cameraFar = far
  }

  /**
   * Update camera near plane.
   * @param near Near clip plane
   */
  setCameraNear(near: number): void {
    this.cameraNear = near
  }

  /**
   * Update camera far plane.
   * @param far Far clip plane
   */
  setCameraFar(far: number): void {
    this.cameraFar = far
  }

  /**
   * Execute the depth pass.
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

    // Get input depth texture
    const depthView = ctx.getTextureView(this.passConfig.depthInput)
    if (!depthView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Try to get camera data from frame context
    const camera = ctx.frame?.stores?.['camera'] as {
      near?: number
      far?: number
    }

    // Use camera data if available, otherwise use configured values
    const near = camera?.near ?? this.cameraNear
    const far = camera?.far ?? this.cameraFar

    // Update uniforms
    // Layout: near (f32), far (f32), format (i32), _pad (f32)
    const data = new ArrayBuffer(16)
    const floatView = new Float32Array(data, 0, 2)
    const intView = new Int32Array(data, 8, 1)

    floatView[0] = near
    floatView[1] = far
    intView[0] = this.format

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'depth-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: depthView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'depth-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
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
