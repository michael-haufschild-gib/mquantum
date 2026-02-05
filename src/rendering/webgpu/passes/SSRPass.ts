/**
 * WebGPU SSR Pass (Screen-Space Reflections)
 *
 * Screen-space ray-traced reflections matching WebGL SSRShader.ts algorithm.
 * Uses the complete ssr.wgsl.ts port with:
 * - Normal from G-buffer with depth reconstruction fallback
 * - Reflectivity from G-buffer alpha
 * - Fresnel (Schlick approximation)
 * - Distance and edge fading
 * - Output mode support (composited or reflection-only)
 *
 * @module rendering/webgpu/passes/SSRPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import { ssrShader } from '../shaders/postprocessing/ssr.wgsl'

/**
 * SSR pass configuration.
 */
export interface SSRPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Depth input resource ID (depth24plus format) */
  depthInput: string
  /** Normal input resource ID */
  normalInput: string
  /** Output resource ID */
  outputResource: string
  /** Reflection intensity (0-1). Default: 0.5 */
  intensity?: number
  /** Maximum ray march distance. Default: 20.0 */
  maxDistance?: number
  /** Depth thickness for hit detection. Default: 0.1 */
  thickness?: number
  /** Distance fade start (0-1 relative). Default: 0.5 */
  fadeStart?: number
  /** Distance fade end (0-1 relative). Default: 1.0 */
  fadeEnd?: number
  /** Maximum ray march steps. Default: 32 */
  maxSteps?: number
}

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
 * WebGPU SSR Pass.
 *
 * Computes screen-space reflections using view-space ray marching.
 * Matches the WebGL SSRShader.ts algorithm (fresnel, fades, thickness).
 */
export class SSRPass extends WebGPUBasePass {
  private passConfig: SSRPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Copy pipeline for passthrough
  private copyPipeline: GPURenderPipeline | null = null
  private copyBindGroupLayout: GPUBindGroupLayout | null = null

  // Bind group layout
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration (matching WebGL defaults)
  private intensity: number
  private maxDistance: number
  private thickness: number
  private fadeStart: number
  private fadeEnd: number
  private maxSteps: number

  constructor(config: SSRPassConfig) {
    super({
      id: 'ssr',
      priority: 160,
      inputs: [
        { resourceId: config.colorInput, access: 'read' as const, binding: 0 },
        { resourceId: config.depthInput, access: 'read' as const, binding: 1 },
        { resourceId: config.normalInput, access: 'read' as const, binding: 2 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.intensity = config.intensity ?? 0.5
    this.maxDistance = config.maxDistance ?? 20.0
    this.thickness = config.thickness ?? 0.1
    this.fadeStart = config.fadeStart ?? 0.5
    this.fadeEnd = config.fadeEnd ?? 1.0
    this.maxSteps = config.maxSteps ?? 32
  }

  /**
   * Create the rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Bind group layout matching ssr.wgsl.ts bindings:
    // @group(0) @binding(0) var<uniform> uniforms: SSRUniforms;
    // @group(0) @binding(1) var tDiffuse: texture_2d<f32>;
    // @group(0) @binding(2) var tNormal: texture_2d<f32>;
    // @group(0) @binding(3) var tDepth: texture_depth_2d;
    // @group(0) @binding(4) var linearSampler: sampler;
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'ssr-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
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
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
      ],
    })

    // Create shader module from the complete WGSL port
    const shaderModule = this.createShaderModule(device, ssrShader, 'ssr-shader')

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      label: 'ssr-pipeline-layout',
      bindGroupLayouts: [this.passBindGroupLayout],
    })

    // Create render pipeline (uses vertexMain/fragmentMain from ssr.wgsl.ts)
    this.renderPipeline = device.createRenderPipeline({
      label: 'ssr-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })

    // Uniform buffer: SSRUniforms struct layout
    // resolution: vec2f (8) + intensity: f32 (4) + maxDistance: f32 (4) = 16
    // thickness: f32 (4) + fadeStart: f32 (4) + fadeEnd: f32 (4) + maxSteps: i32 (4) = 32
    // nearClip: f32 (4) + farClip: f32 (4) + outputMode: i32 (4) + _padding: f32 (4) = 48
    // projMatrix: mat4x4f (64) = 112
    // invProjMatrix: mat4x4f (64) = 176
    // viewMat: mat4x4f (64) = 240
    // Total: 240 bytes → round up to 256 for alignment
    this.uniformBuffer = this.createUniformBuffer(device, 256, 'ssr-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'ssr-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Create copy pipeline for passthrough (non-perspective cameras, missing inputs)
    this.copyBindGroupLayout = device.createBindGroupLayout({
      label: 'ssr-copy-bgl',
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

    const copyFragmentModule = this.createShaderModule(device, COPY_SHADER, 'ssr-copy-fragment')
    this.copyPipeline = this.createFullscreenPipeline(
      device,
      copyFragmentModule,
      [this.copyBindGroupLayout],
      'rgba16float',
      { label: 'ssr-copy' }
    )
  }

  /**
   * Set SSR intensity.
   */
  setIntensity(intensity: number): void {
    this.intensity = intensity
  }

  /**
   * Set maximum ray distance.
   */
  setMaxDistance(distance: number): void {
    this.maxDistance = distance
  }

  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      ssrIntensity?: number
      ssrMaxDistance?: number
      ssrThickness?: number
      ssrFadeStart?: number
      ssrFadeEnd?: number
      ssrQuality?: string
    }

    if (postProcessing?.ssrIntensity !== undefined) {
      this.intensity = postProcessing.ssrIntensity
    }
    if (postProcessing?.ssrMaxDistance !== undefined) {
      this.maxDistance = postProcessing.ssrMaxDistance
    }
    if (postProcessing?.ssrThickness !== undefined) {
      this.thickness = postProcessing.ssrThickness
    }
    if (postProcessing?.ssrFadeStart !== undefined) {
      this.fadeStart = postProcessing.ssrFadeStart
    }
    if (postProcessing?.ssrFadeEnd !== undefined) {
      this.fadeEnd = postProcessing.ssrFadeEnd
    }

    // Quality presets map to maxSteps
    if (postProcessing?.ssrQuality !== undefined) {
      switch (postProcessing.ssrQuality) {
        case 'low':
          this.maxSteps = 16
          break
        case 'medium':
          this.maxSteps = 32
          break
        case 'high':
          this.maxSteps = 64
          break
      }
    }
  }

  /**
   * Execute the SSR pass.
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
    const normalView = ctx.getTextureView(this.passConfig.normalInput)

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      inverseProjectionMatrix?: { elements: number[] }
      near?: number
      far?: number
      isPerspective?: boolean
    }

    // Check if camera is perspective
    const isPerspective = camera?.isPerspective ?? (
      camera?.projectionMatrix?.elements &&
      Math.abs((camera.projectionMatrix.elements[11] ?? 0) + 1) < 0.001 &&
      Math.abs(camera.projectionMatrix.elements[15] ?? 1) < 0.001
    )

    // Passthrough if camera is not perspective or required inputs missing
    if (!isPerspective || !colorView || !depthView || !normalView) {
      if (colorView) {
        this.copyToOutput(ctx, colorView, outputView)
      }
      return
    }

    // Pack uniforms matching SSRUniforms struct layout in ssr.wgsl.ts
    // Uses mixed Float32Array and Int32Array views for i32 fields
    const buffer = new ArrayBuffer(256)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    // resolution: vec2f (offset 0-1)
    floatView[0] = ctx.size.width
    floatView[1] = ctx.size.height

    // intensity: f32 (offset 2)
    floatView[2] = this.intensity

    // maxDistance: f32 (offset 3)
    floatView[3] = this.maxDistance

    // thickness: f32 (offset 4)
    floatView[4] = this.thickness

    // fadeStart: f32 (offset 5)
    floatView[5] = this.fadeStart

    // fadeEnd: f32 (offset 6)
    floatView[6] = this.fadeEnd

    // maxSteps: i32 (offset 7)
    intView[7] = this.maxSteps

    // nearClip: f32 (offset 8)
    floatView[8] = camera?.near ?? 0.1

    // farClip: f32 (offset 9)
    floatView[9] = camera?.far ?? 100

    // outputMode: i32 (offset 10) - 0 = composited (full-res), 1 = reflection-only
    intView[10] = 0

    // _padding: f32 (offset 11)
    floatView[11] = 0.0

    // projMatrix: mat4x4f (offset 12-27, 64 bytes at byte offset 48)
    if (camera?.projectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        floatView[12 + i] = camera.projectionMatrix.elements[i] ?? 0
      }
    }

    // invProjMatrix: mat4x4f (offset 28-43, 64 bytes at byte offset 112)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        floatView[28 + i] = camera.inverseProjectionMatrix.elements[i] ?? 0
      }
    }

    // viewMat: mat4x4f (offset 44-59, 64 bytes at byte offset 176)
    if (camera?.viewMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        floatView[44 + i] = camera.viewMatrix.elements[i] ?? 0
      }
    }

    this.writeUniformBuffer(this.device, this.uniformBuffer, new Float32Array(buffer))

    // Create bind group matching ssr.wgsl.ts layout
    const bindGroup = this.device.createBindGroup({
      label: 'ssr-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: colorView },
        { binding: 2, resource: normalView },
        { binding: 3, resource: depthView },
        { binding: 4, resource: this.sampler },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'ssr-render',
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
      label: 'ssr-copy-bg',
      layout: this.copyBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: inputView },
      ],
    })

    const passEncoder = ctx.beginRenderPass({
      label: 'ssr-copy',
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
