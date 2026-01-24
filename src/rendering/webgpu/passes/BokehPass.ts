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

// Linearize depth
fn linearizeDepth(depth: f32) -> f32 {
  let z = depth * 2.0 - 1.0;
  return (2.0 * uniforms.near * uniforms.far) / (uniforms.far + uniforms.near - z * (uniforms.far - uniforms.near));
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
fn sampleBokeh(uv: vec2f, cocRadius: f32) -> vec4f {
  if (cocRadius < 0.5) {
    return textureSample(tColor, texSampler, uv);
  }

  var color = vec3f(0.0);
  var weight = 0.0;
  let texelSize = 1.0 / uniforms.resolution;

  // Hexagonal bokeh pattern (6-sided)
  let samples = 16;
  let rings = 3;

  for (var ring = 1; ring <= rings; ring++) {
    let ringRadius = f32(ring) / f32(rings) * cocRadius;
    let pointsInRing = ring * 6;

    for (var i = 0; i < pointsInRing; i++) {
      let angle = f32(i) / f32(pointsInRing) * PI * 2.0;
      let offset = vec2f(cos(angle), sin(angle)) * ringRadius * texelSize;
      let sampleUV = uv + offset;

      // Sample color and depth at this point
      let sampleColor = textureSample(tColor, texSampler, sampleUV);
      let sampleDepth = textureSample(tDepth, texSampler, sampleUV).r;
      let sampleCoC = calculateCoC(sampleDepth);

      // Weight by sample's CoC (foreground should bleed, background should not)
      let sampleWeight = max(sampleCoC, cocRadius) / cocRadius;

      color += sampleColor.rgb * sampleWeight;
      weight += sampleWeight;
    }
  }

  // Add center sample
  let centerColor = textureSample(tColor, texSampler, uv);
  color += centerColor.rgb;
  weight += 1.0;

  return vec4f(color / weight, centerColor.a);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample depth
  let depth = textureSample(tDepth, texSampler, uv).r;

  // Calculate circle of confusion
  let coc = calculateCoC(depth);

  // Apply bokeh blur
  return sampleBokeh(uv, coc);
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
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

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

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'bokeh' }
    )

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, 64, 'bokeh-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'bokeh-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set focus distance.
   */
  setFocusDistance(distance: number): void {
    this.focusDistance = distance
  }

  /**
   * Set aperture (f-stop).
   */
  setFStop(fStop: number): void {
    this.fStop = fStop
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      bokehFocusDistance?: number
      bokehFocalLength?: number
      bokehFStop?: number
      bokehMaxBlur?: number
    }

    if (postProcessing?.bokehFocusDistance !== undefined) {
      this.focusDistance = postProcessing.bokehFocusDistance
    }
    if (postProcessing?.bokehFocalLength !== undefined) {
      this.focalLength = postProcessing.bokehFocalLength
    }
    if (postProcessing?.bokehFStop !== undefined) {
      this.fStop = postProcessing.bokehFStop
    }
    if (postProcessing?.bokehMaxBlur !== undefined) {
      this.maxBlur = postProcessing.bokehMaxBlur
    }
  }

  /**
   * Set focal length.
   */
  setFocalLength(length: number): void {
    this.focalLength = length
  }

  /**
   * Execute the Bokeh pass.
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

    // Update from stores
    this.updateFromStores(ctx)

    // Get input textures
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    const depthView = ctx.getTextureView(this.passConfig.depthInput)

    if (!colorView || !depthView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      near?: number
      far?: number
    }

    // Update uniforms
    const data = new Float32Array(16)
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
