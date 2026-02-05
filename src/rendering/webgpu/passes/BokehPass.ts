/**
 * WebGPU Bokeh Pass (Depth of Field)
 *
 * Simulates camera depth of field with bokeh blur effect.
 * Matches the WebGL BokehShader implementation:
 * - Focus range "dead zone" for sharp in-focus regions
 * - Hexagonal bokeh blur pattern (37 samples)
 * - Aspect ratio correction
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
}

/**
 * WGSL Bokeh Fragment Shader
 *
 * Matches WebGL BokehShader: dead zone CoC model, hexagonal blur, aspect correction.
 * Uses textureSampleLevel for color (linear filtering), textureLoad for depth.
 */
const BOKEH_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  focus: f32,
  focusRange: f32,
  aperture: f32,
  maxblur: f32,
  near: f32,
  far: f32,
  aspect: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tColor: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_depth_2d;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Linearize depth from [0,1] NDC to view-space Z (positive distance from camera)
// Matches Three.js perspectiveDepthToViewZ then negated:
//   viewZ = near * far / (far - depth * (far - near))
fn linearizeDepth(depth: f32) -> f32 {
  return (uniforms.near * uniforms.far) / (uniforms.far - depth * (uniforms.far - uniforms.near));
}

// Hexagonal bokeh blur (matches WebGL BokehShader hexagonalBlur)
// 3 rings + center = 37 total samples with distance-based weighting
fn hexagonalBlur(uv: vec2f, blur: vec2f) -> vec4f {
  var col = vec4f(0.0);
  var total: f32 = 0.0;

  // Ring 0: center
  col += textureSampleLevel(tColor, texSampler, uv, 0.0) * 1.0;
  total += 1.0;

  // Ring 1: 6 samples at distance 0.33
  let r1: f32 = 0.33;
  for (var i = 0; i < 6; i++) {
    let angle = f32(i) * 1.0472; // 60 degrees = PI/3
    let offset = vec2f(cos(angle), sin(angle)) * r1;
    col += textureSampleLevel(tColor, texSampler, uv + blur * offset, 0.0) * 0.9;
    total += 0.9;
  }

  // Ring 2: 12 samples at distance 0.67
  let r2: f32 = 0.67;
  for (var i = 0; i < 12; i++) {
    let angle = f32(i) * 0.5236; // 30 degrees = PI/6
    let offset = vec2f(cos(angle), sin(angle)) * r2;
    col += textureSampleLevel(tColor, texSampler, uv + blur * offset, 0.0) * 0.7;
    total += 0.7;
  }

  // Ring 3: 18 samples at distance 1.0
  let r3: f32 = 1.0;
  for (var i = 0; i < 18; i++) {
    let angle = f32(i) * 0.349; // 20 degrees
    let offset = vec2f(cos(angle), sin(angle)) * r3;
    col += textureSampleLevel(tColor, texSampler, uv + blur * offset, 0.0) * 0.5;
    total += 0.5;
  }

  return col / max(total, 0.0001);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample depth using textureLoad (texture_depth_2d returns f32 directly)
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  let clampedCoord = clamp(depthCoord, vec2i(0), vec2i(depthDims) - vec2i(1));
  let depth = textureLoad(tDepth, clampedCoord, 0);

  // Linearize depth to view-space distance (positive, away from camera)
  let viewZ = linearizeDepth(depth);

  // Calculate blur factor with focus range dead zone (matches WebGL BokehShader)
  // Objects within ±focusRange of the focus point stay sharp
  let diff = viewZ - uniforms.focus;
  let absDiff = abs(diff);
  var blurFactor = max(0.0, absDiff - uniforms.focusRange) * uniforms.aperture;
  blurFactor = min(blurFactor, uniforms.maxblur);

  // Apply blur with aspect ratio correction (matches WebGL)
  let dofblur = vec2f(blurFactor, blurFactor * uniforms.aspect);

  // Apply hexagonal bokeh blur
  var col = hexagonalBlur(uv, dofblur);
  col.a = 1.0;
  return col;
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
 * Reads bokehWorldFocusDistance, bokehWorldFocusRange, bokehScale from the
 * postProcessing store to match WebGL behavior.
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

  // Configuration — matches WebGL BokehPass fields
  private focus: number = 15.0
  private focusRange: number = 10.0
  private aperture: number = 0.0    // bokehScale * 0.005
  private maxBlur: number = 0.0     // bokehScale * 0.02

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
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    // Depth uses texture_depth_2d + sampleType:'depth' to match depth24plus format
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
          texture: { sampleType: 'depth' as const },
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

    // Create uniform buffer (48 bytes: 12 x f32, includes padding)
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'bokeh-uniforms')

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
   * Set focus distance (world units).
   */
  setFocus(distance: number): void {
    this.focus = distance
  }

  /**
   * Set focus range (dead zone, world units).
   */
  setFocusRange(range: number): void {
    this.focusRange = range
  }

  /**
   * Set aperture (derived from bokehScale * 0.005).
   */
  setAperture(value: number): void {
    this.aperture = value
  }

  /**
   * Set maximum blur (derived from bokehScale * 0.02).
   */
  setMaxBlur(value: number): void {
    this.maxBlur = value
  }

  /**
   * Update pass properties from Zustand stores.
   * Reads the same fields as WebGL: bokehWorldFocusDistance, bokehWorldFocusRange, bokehScale.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      bokehWorldFocusDistance?: number
      bokehWorldFocusRange?: number
      bokehScale?: number
    }

    if (postProcessing?.bokehWorldFocusDistance !== undefined) {
      this.focus = postProcessing.bokehWorldFocusDistance
    }
    if (postProcessing?.bokehWorldFocusRange !== undefined) {
      this.focusRange = postProcessing.bokehWorldFocusRange
    }
    if (postProcessing?.bokehScale !== undefined) {
      // Match WebGL: aperture = bokehScale * 0.005, maxBlur = bokehScale * 0.02
      this.aperture = postProcessing.bokehScale * 0.005
      this.maxBlur = postProcessing.bokehScale * 0.02
    }
  }

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

    const { width, height } = ctx.size

    // Update uniforms (12 floats = 48 bytes, matches WGSL struct)
    const data = new Float32Array(12)
    data[0] = width                       // resolution.x
    data[1] = height                      // resolution.y
    data[2] = this.focus                  // focus (world units)
    data[3] = this.focusRange             // focusRange (dead zone, world units)
    data[4] = this.aperture               // aperture (bokehScale * 0.005)
    data[5] = this.maxBlur                // maxblur (bokehScale * 0.02)
    data[6] = camera?.near ?? 0.1         // near clip
    data[7] = camera?.far ?? 100          // far clip
    data[8] = height / width              // aspect (height/width, matches WebGL)
    data[9] = 0                           // _pad1
    data[10] = 0                          // _pad2
    data[11] = 0                          // _pad3

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
