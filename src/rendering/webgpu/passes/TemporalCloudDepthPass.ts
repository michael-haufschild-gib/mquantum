/**
 * WebGPU Temporal Cloud Depth Pass
 *
 * Extracts depth from the temporal cloud accumulation buffer's world position data.
 * This enables post-processing effects (SSR, Bokeh, Refraction) to work with
 * Schroedinger when temporal cloud accumulation is active.
 *
 * The temporal accumulation buffer stores world position in attachment [1].
 * This pass converts world position to NDC depth for compatibility with
 * standard depth-based post-processing effects.
 *
 * @module rendering/webgpu/passes/TemporalCloudDepthPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for TemporalCloudDepthPass.
 */
export interface TemporalCloudDepthPassConfig {
  /** World position input resource (temporal accumulation buffer) */
  positionInput: string
  /** Output depth resource */
  outputResource: string
  /** Camera near plane (for depth calculation) */
  cameraNear?: number
  /** Camera far plane */
  cameraFar?: number
}

/**
 * WGSL Temporal Cloud Depth Fragment Shader
 *
 * Converts world position from temporal accumulation buffer to NDC depth.
 * Reads world position and transforms it using the view-projection matrix
 * to produce standard depth values compatible with post-processing effects.
 */
const TEMPORAL_CLOUD_DEPTH_SHADER = /* wgsl */ `
struct Uniforms {
  viewProjectionMatrix: mat4x4f,
  near: f32,
  far: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tWorldPosition: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample world position from temporal accumulation buffer
  let worldPosSample = textureSample(tWorldPosition, texSampler, uv);
  let worldPos = worldPosSample.xyz;

  // Check if we have valid position data (alpha > 0 means valid sample)
  // The temporal accumulation stores alpha as accumulated weight
  let validity = worldPosSample.w;

  if (validity < 0.001 || length(worldPos) < 0.001) {
    // No valid data - output far depth (1.0)
    return vec4f(1.0, 0.0, 0.0, 0.0);
  }

  // Transform world position to clip space
  let clipPos = uniforms.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Convert to NDC depth (0-1 range)
  // clipPos.z is in [-near, -far] for view space, but after projection
  // it's in [-w, w] range. Dividing by w gives NDC in [-1, 1].
  // We then remap to [0, 1] for depth buffer compatibility.
  var ndcDepth = (clipPos.z / clipPos.w) * 0.5 + 0.5;

  // Clamp to valid depth range
  ndcDepth = clamp(ndcDepth, 0.0, 1.0);

  // Output depth in all channels (matches how depth textures are read)
  return vec4f(ndcDepth, ndcDepth, ndcDepth, 1.0);
}
`

/**
 * WebGPU Temporal Cloud Depth Pass.
 *
 * Extracts depth from temporal cloud accumulation's world position buffer.
 *
 * This pass is needed because when Schroedinger uses temporal cloud accumulation,
 * it renders to the VOLUMETRIC layer at 1/4 resolution and doesn't write to the
 * standard depth buffer. Post-processing effects that need depth (SSR, Bokeh,
 * Refraction) can use the output of this pass instead.
 *
 * @example
 * ```typescript
 * const temporalCloudDepth = new TemporalCloudDepthPass({
 *   positionInput: 'temporalAccumulation',
 *   outputResource: 'temporalCloudDepth',
 * });
 * ```
 */
export class TemporalCloudDepthPass extends WebGPUBasePass {
  private passConfig: TemporalCloudDepthPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout (named passBindGroupLayout to avoid base class conflict)
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private cameraNear: number
  private cameraFar: number

  constructor(config: TemporalCloudDepthPassConfig) {
    super({
      id: 'temporalCloudDepth',
      priority: 100, // Early in post-processing chain
      inputs: [{ resourceId: config.positionInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.cameraNear = config.cameraNear ?? 0.1
    this.cameraFar = config.cameraFar ?? 1000.0
  }

  /**
   * Create the rendering pipeline.
   * @param ctx WebGPU setup context
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-cloud-depth-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
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
    const fragmentModule = this.createShaderModule(
      device,
      TEMPORAL_CLOUD_DEPTH_SHADER,
      'temporal-cloud-depth-fragment'
    )

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'temporal-cloud-depth' }
    )

    // Create uniform buffer
    // Layout: mat4x4f (64 bytes) + near (4 bytes) + far (4 bytes) + padding (8 bytes) = 80 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 80, 'temporal-cloud-depth-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'temporal-cloud-depth-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
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
   * Execute the temporal cloud depth pass.
   * @param ctx WebGPU render context
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

    // Get input world position texture
    const positionView = ctx.getTextureView(this.passConfig.positionInput)
    if (!positionView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Try to get camera data from frame context (consistent with other passes)
    const camera = ctx.frame?.stores?.['camera'] as {
      near?: number
      far?: number
      viewProjectionMatrix?: { elements: number[] }
    }

    // Use camera data if available, otherwise use configured values
    const near = camera?.near ?? this.cameraNear
    const far = camera?.far ?? this.cameraFar

    // Update uniforms
    // Layout: viewProjectionMatrix (mat4x4f, 64 bytes) + near (f32, 4 bytes) + far (f32, 4 bytes) + padding (8 bytes)
    const data = new ArrayBuffer(80)
    const floatView = new Float32Array(data)

    // Write view-projection matrix (first 16 floats = 64 bytes)
    if (camera?.viewProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        floatView[i] = camera.viewProjectionMatrix.elements[i] ?? 0
      }
    } else {
      // Identity matrix as fallback
      floatView[0] = 1
      floatView[5] = 1
      floatView[10] = 1
      floatView[15] = 1
    }

    // Write near and far (floats 16 and 17)
    floatView[16] = near
    floatView[17] = far

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'temporal-cloud-depth-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: positionView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'temporal-cloud-depth-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, // Clear to far depth (white)
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
