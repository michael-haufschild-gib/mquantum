/**
 * WebGPU Bokeh Pass (Depth of Field)
 *
 * Simulates camera depth of field with bokeh blur effect.
 * Blurs areas outside the focal plane based on circle of confusion.
 *
 * @module rendering/webgpu/passes/BokehPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Bokeh pass configuration.
 */
export interface BokehPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Depth input resource ID */
  depthInput: string
  /** Output resource ID */
  outputResource: string
  /** Focus distance from camera */
  focusDistance?: number
  /** Focal length in mm */
  focalLength?: number
  /** F-stop (aperture) */
  fStop?: number
  /** Maximum blur radius in pixels */
  maxBlur?: number
}

/**
 * WGSL Bokeh Fragment Shader
 */
const BOKEH_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  focusDistance: f32,
  focalLength: f32,
  fStop: f32,
  maxBlur: f32,
  near: f32,
  far: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tColor: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

const PI: f32 = 3.14159265359;

// Linearize depth - WebGPU uses [0, 1] depth range
fn linearizeDepth(depth: f32) -> f32 {
  // WebGPU depth is already in [0, 1], use the correct formula
  return (uniforms.near * uniforms.far) / (uniforms.far - depth * (uniforms.far - uniforms.near));
}

// Calculate circle of confusion
fn calculateCoC(depth: f32) -> f32 {
  let linearDepth = linearizeDepth(depth);

  // CoC formula based on thin lens model
  // CoC = abs(aperture * focalLength * (focusDistance - depth) / (depth * (focusDistance - focalLength)))
  let aperture = uniforms.focalLength / uniforms.fStop;
  let focusDist = uniforms.focusDistance;
  let focalLen = uniforms.focalLength * 0.001; // Convert mm to meters

  // Simplified CoC calculation
  let coc = abs(aperture * (linearDepth - focusDist) / linearDepth) * 100.0;

  return clamp(coc, 0.0, uniforms.maxBlur);
}

// Sample with bokeh kernel
// Note: Uses textureLoad instead of textureSample to avoid non-uniform control flow issues
// cocRadius varies per-pixel based on depth, so we can't use textureSample conditionally
fn sampleBokeh(uv: vec2f, cocRadius: f32) -> vec4f {
  let texelSize = 1.0 / uniforms.resolution;
  let colorDims = textureDimensions(tColor);
  let depthDims = textureDimensions(tDepth);

  // Always sample center pixel using textureLoad (uniform control flow safe)
  let centerCoord = vec2i(uv * vec2f(colorDims));
  let centerColor = textureLoad(tColor, centerCoord, 0);

  // For small CoC, just return center color (no blur needed)
  // We use select() instead of early return to maintain uniform control flow
  let needsBlur = cocRadius >= 0.5;

  var color = vec3f(0.0);
  var weight = 0.0;

  // Hexagonal bokeh pattern (6-sided)
  let rings = 3;

  for (var ring = 1; ring <= rings; ring++) {
    let ringRadius = f32(ring) / f32(rings) * cocRadius;
    let pointsInRing = ring * 6;

    for (var i = 0; i < pointsInRing; i++) {
      let angle = f32(i) / f32(pointsInRing) * PI * 2.0;
      let offset = vec2f(cos(angle), sin(angle)) * ringRadius * texelSize;
      let sampleUV = uv + offset;

      // Sample color and depth at this point using textureLoad
      let sampleCoord = vec2i(sampleUV * vec2f(colorDims));
      let clampedColorCoord = clamp(sampleCoord, vec2i(0), vec2i(colorDims) - vec2i(1));
      let sampleColor = textureLoad(tColor, clampedColorCoord, 0);

      let depthCoord = vec2i(sampleUV * vec2f(depthDims));
      let clampedDepthCoord = clamp(depthCoord, vec2i(0), vec2i(depthDims) - vec2i(1));
      let sampleDepth = textureLoad(tDepth, clampedDepthCoord, 0).r;
      let sampleCoC = calculateCoC(sampleDepth);

      // Weight by sample's CoC (foreground should bleed, background should not)
      let sampleWeight = max(sampleCoC, cocRadius) / max(cocRadius, 0.001);

      color += sampleColor.rgb * sampleWeight;
      weight += sampleWeight;
    }
  }

  // Add center sample
  color += centerColor.rgb;
  weight += 1.0;

  let blurredColor = vec4f(color / weight, centerColor.a);

  // Use select for uniform control flow: return center if no blur needed, else blurred
  return select(centerColor, blurredColor, needsBlur);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample depth using textureLoad (depth texture is unfilterable-float)
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  let depth = textureLoad(tDepth, depthCoord, 0).r;

  // Calculate circle of confusion
  let coc = calculateCoC(depth);

  // Apply bokeh blur
  return sampleBokeh(uv, coc);
}
`

/**
 * WGSL Copy Shader for passthrough
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
 * WebGPU Bokeh Pass.
 *
 * Simulates depth of field with bokeh blur effect.
 */
export class BokehPass extends WebGPUBasePass {
  private passConfig: BokehPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Copy pipeline for passthrough
  private copyPipeline: GPURenderPipeline | null = null
  private copyBindGroupLayout: GPUBindGroupLayout | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private focusDistance: number
  private focalLength: number
  private fStop: number
  private maxBlur: number

  constructor(config: BokehPassConfig) {
    super({
      id: 'bokeh',
      priority: 180,
      inputs: [
        { resourceId: config.colorInput, access: 'read' as const, binding: 0 },
        { resourceId: config.depthInput, access: 'read' as const, binding: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.focusDistance = config.focusDistance ?? 10.0
    this.focalLength = config.focalLength ?? 50.0
    this.fStop = config.fStop ?? 2.8
    this.maxBlur = config.maxBlur ?? 10.0
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'bokeh-bgl',
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
          texture: { sampleType: 'unfilterable-float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, BOKEH_SHADER, 'bokeh-fragment')

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'bokeh' }
    )

    // Create uniform buffer (32 bytes: vec2f + 6x f32)
    this.uniformBuffer = this.createUniformBuffer(device, 32, 'bokeh-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'bokeh-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Create copy pipeline for passthrough (non-perspective cameras, missing inputs)
    this.copyBindGroupLayout = device.createBindGroupLayout({
      label: 'bokeh-copy-bgl',
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

    const copyFragmentModule = this.createShaderModule(device, COPY_SHADER, 'bokeh-copy-fragment')
    this.copyPipeline = this.createFullscreenPipeline(
      device,
      copyFragmentModule,
      [this.copyBindGroupLayout],
      'rgba16float',
      { label: 'bokeh-copy' }
    )
  }

  /**
   * Set focus distance.
   * @param distance
   */
  setFocusDistance(distance: number): void {
    this.focusDistance = distance
  }

  /**
   * Set aperture (f-stop).
   * @param fStop
   */
  setFStop(fStop: number): void {
    this.fStop = fStop
  }


  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      bokehWorldFocusDistance?: number
      bokehFocalLength?: number
    }

    if (postProcessing?.bokehWorldFocusDistance !== undefined) {
      this.focusDistance = postProcessing.bokehWorldFocusDistance
    }
    if (postProcessing?.bokehFocalLength !== undefined) {
      this.focalLength = postProcessing.bokehFocalLength
    }
    // Note: bokehFStop and bokehMaxBlur are not in store - using constructor defaults
  }

  /**
   * Set focal length.
   * @param length
   */
  setFocalLength(length: number): void {
    this.focalLength = length
  }

  /**
   * Execute the Bokeh pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.sampler ||
      !this.copyPipeline ||
      !this.copyBindGroupLayout
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)

    // Get input textures
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    const depthView = ctx.getTextureView(this.passConfig.depthInput)

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      near?: number
      far?: number
      projectionMatrix?: { elements: number[] }
      isPerspective?: boolean
    }

    // Check if camera is perspective
    // A perspective projection matrix has elements[11] = -1 and elements[15] = 0
    const isPerspective = camera?.isPerspective ?? (
      camera?.projectionMatrix?.elements &&
      Math.abs((camera.projectionMatrix.elements[11] ?? 0) + 1) < 0.001 &&
      Math.abs(camera.projectionMatrix.elements[15] ?? 1) < 0.001
    )

    // Passthrough if camera is not perspective or required inputs missing
    if (!isPerspective || !colorView || !depthView) {
      if (colorView) {
        this.copyToOutput(ctx, colorView, outputView)
      }
      return
    }

    // Update uniforms (8 floats = 32 bytes)
    const data = new Float32Array(8)
    data[0] = ctx.size.width
    data[1] = ctx.size.height
    data[2] = this.focusDistance
    data[3] = this.focalLength
    data[4] = this.fStop
    data[5] = this.maxBlur
    data[6] = camera?.near ?? 0.1
    data[7] = camera?.far ?? 100

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'bokeh-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
        { binding: 3, resource: depthView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'bokeh-render',
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
   * Copy input directly to output (passthrough for non-perspective cameras)
   * @param ctx
   * @param inputView
   * @param outputView
   */
  private copyToOutput(
    ctx: WebGPURenderContext,
    inputView: GPUTextureView,
    outputView: GPUTextureView
  ): void {
    if (!this.copyPipeline || !this.copyBindGroupLayout || !this.sampler) return

    const copyBindGroup = this.device!.createBindGroup({
      label: 'bokeh-copy-bg',
      layout: this.copyBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: inputView },
      ],
    })

    const passEncoder = ctx.beginRenderPass({
      label: 'bokeh-copy',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.copyPipeline, [copyBindGroup])
    passEncoder.end()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.copyPipeline = null
    this.copyBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null

    super.dispose()
  }
}
