/**
 * WebGPU Normal Pass
 *
 * Reconstructs world-space normals from a depth buffer using screen-space derivatives.
 * Useful for edge detection and other screen-space effects.
 *
 * **Note:** This pass computes normals from depth buffer reconstruction, which works
 * well for smooth surfaces but may produce artifacts at depth discontinuities.
 * For raymarched objects, normals should ideally come from the shader's SDF gradient
 * evaluation via MRT outputs.
 *
 * @module rendering/webgpu/passes/NormalPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for NormalPass.
 */
export interface NormalPassConfig {
  /** Depth input resource ID */
  depthInput: string
  /** Output normal resource ID */
  outputResource: string
}

/**
 * WGSL Normal Reconstruction Fragment Shader
 *
 * Reconstructs view-space normals from depth using screen-space derivatives.
 * The normals are encoded to [0, 1] range for storage (normal * 0.5 + 0.5).
 */
const NORMAL_SHADER = /* wgsl */ `
struct Uniforms {
  inverseProjectionMatrix: mat4x4f,
  resolution: vec2f,
  near: f32,
  far: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Reconstruct view-space position from UV and depth
// WebGPU uses depth range [0, 1], not [-1, 1] like OpenGL
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
  // Convert to NDC: UV [0,1] -> [-1,1] for X/Y, depth stays [0,1] for WebGPU
  let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
  // Unproject to view space
  var viewPos = uniforms.inverseProjectionMatrix * ndc;
  viewPos /= viewPos.w;
  return viewPos.xyz;
}

// Linearize depth for better precision - WebGPU uses [0, 1] depth range
fn linearizeDepth(depth: f32) -> f32 {
  // WebGPU depth is already in [0, 1], use the correct formula
  return (uniforms.near * uniforms.far) / (uniforms.far - depth * (uniforms.far - uniforms.near));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let texelSize = 1.0 / uniforms.resolution;

  // Get depth texture dimensions and compute integer coordinates
  // Use textureLoad for unfilterable-float depth texture
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));

  // Load depth at current pixel and neighbors using integer coordinates
  let depth = textureLoad(tDepth, depthCoord, 0).r;

  // Skip far plane (sky) - output neutral normal pointing toward camera
  if (depth >= 0.9999) {
    return vec4f(0.5, 0.5, 1.0, 0.0);
  }

  // Load neighboring depths for derivative calculation
  let depthRight = textureLoad(tDepth, depthCoord + vec2i(1, 0), 0).r;
  let depthLeft = textureLoad(tDepth, depthCoord + vec2i(-1, 0), 0).r;
  let depthUp = textureLoad(tDepth, depthCoord + vec2i(0, 1), 0).r;
  let depthDown = textureLoad(tDepth, depthCoord + vec2i(0, -1), 0).r;

  // Reconstruct view-space positions
  let posCenter = getViewPosition(uv, depth);
  let posRight = getViewPosition(uv + vec2f(texelSize.x, 0.0), depthRight);
  let posLeft = getViewPosition(uv - vec2f(texelSize.x, 0.0), depthLeft);
  let posUp = getViewPosition(uv + vec2f(0.0, texelSize.y), depthUp);
  let posDown = getViewPosition(uv - vec2f(0.0, texelSize.y), depthDown);

  // Compute derivatives using central differences where possible
  // Use forward/backward differences at depth discontinuities
  let dxRight = posRight - posCenter;
  let dxLeft = posCenter - posLeft;
  let dyUp = posUp - posCenter;
  let dyDown = posCenter - posDown;

  // Choose the derivative with smaller depth difference to avoid edge artifacts
  let dx = select(dxRight, dxLeft, abs(depthRight - depth) > abs(depth - depthLeft));
  let dy = select(dyUp, dyDown, abs(depthUp - depth) > abs(depth - depthDown));

  // Compute normal via cross product
  var normal = normalize(cross(dy, dx));

  // Ensure normal points towards camera (positive Z in view space)
  normal = select(normal, -normal, normal.z < 0.0);

  // Encode normal to [0, 1] range
  let encodedNormal = normal * 0.5 + 0.5;

  return vec4f(encodedNormal, 1.0);
}
`

/**
 * WebGPU Normal Pass.
 *
 * Reconstructs view-space normals from a depth buffer using screen-space derivatives.
 * Output normals are encoded to [0, 1] range for storage in the G-buffer.
 *
 * @example
 * ```typescript
 * const normalPass = new NormalPass({
 *   depthInput: 'depthBuffer',
 *   outputResource: 'normalBuffer',
 * });
 *
 * graph.addPass(normalPass);
 * ```
 */
export class NormalPass extends WebGPUBasePass {
  private passConfig: NormalPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  constructor(config: NormalPassConfig) {
    super({
      id: 'normal',
      priority: 100, // Run early in the pipeline
      inputs: [{ resourceId: config.depthInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'normal-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
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
    const fragmentModule = this.createShaderModule(device, NORMAL_SHADER, 'normal-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'normal' }
    )

    // Create uniform buffer
    // Layout: mat4x4f (64 bytes) + vec2f (8 bytes) + f32 (4 bytes) + f32 (4 bytes) = 80 bytes
    // Aligned to 16 bytes = 80 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 80, 'normal-uniforms')

    // Create sampler for depth texture
    this.sampler = device.createSampler({
      label: 'normal-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Execute the normal reconstruction pass.
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

    // Get depth texture view
    const depthView = ctx.getTextureView(this.passConfig.depthInput)
    if (!depthView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) {
      return
    }

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      inverseProjectionMatrix?: { elements: number[] }
      near?: number
      far?: number
    }

    // Update uniforms
    const data = new Float32Array(20) // 80 bytes / 4 bytes per float = 20 floats

    // Inverse projection matrix (16 floats at offset 0)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseProjectionMatrix.elements[i]
        if (value !== undefined) data[i] = value
      }
    } else {
      // Identity matrix fallback
      data[0] = 1
      data[5] = 1
      data[10] = 1
      data[15] = 1
    }

    // Resolution (2 floats at offset 16)
    data[16] = ctx.size.width
    data[17] = ctx.size.height

    // Near/far planes (2 floats at offset 18)
    data[18] = camera?.near ?? 0.1
    data[19] = camera?.far ?? 100

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'normal-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: depthView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'normal-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0.5, g: 0.5, b: 1.0, a: 0.0 },
        },
      ],
    })

    // Render fullscreen quad
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
