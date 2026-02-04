/**
 * WebGPU SSR Pass (Screen-Space Reflections)
 *
 * Screen-space ray-traced reflections using hierarchical tracing.
 * Samples the color buffer along reflected rays to compute reflections.
 *
 * @module rendering/webgpu/passes/SSRPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * SSR pass configuration.
 */
export interface SSRPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Depth input resource ID */
  depthInput: string
  /** Normal input resource ID */
  normalInput: string
  /** Output resource ID */
  outputResource: string
  /** Maximum ray distance */
  maxDistance?: number
  /** Ray step size */
  stepSize?: number
  /** Number of refinement steps */
  refinementSteps?: number
  /** Reflection intensity (0-1) */
  intensity?: number
}

/**
 * WGSL SSR Fragment Shader
 */
const SSR_SHADER = /* wgsl */ `
struct Uniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  resolution: vec2f,
  maxDistance: f32,
  stepSize: f32,
  refinementSteps: f32,
  intensity: f32,
  near: f32,
  far: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tColor: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_2d<f32>;
@group(0) @binding(4) var tNormal: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Reconstruct view-space position from depth
// WebGPU uses depth range [0, 1], not [-1, 1] like OpenGL
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
  // UV to NDC: [0,1] -> [-1,1] for X/Y, depth stays [0,1] for WebGPU
  let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
  var viewPos = uniforms.inverseProjectionMatrix * ndc;
  viewPos /= viewPos.w;
  return viewPos.xyz;
}

// Project view-space position to screen UV
// WebGPU clip Z is already [0, 1], no conversion needed
fn projectToScreen(viewPos: vec3f) -> vec3f {
  var clipPos = uniforms.projectionMatrix * vec4f(viewPos, 1.0);
  clipPos /= clipPos.w;
  // X/Y: [-1,1] -> [0,1], Z already in [0,1] for WebGPU
  return vec3f(clipPos.xy * 0.5 + 0.5, clipPos.z);
}

// Load depth using integer coordinates (for unfilterable-float texture)
fn loadDepth(uv: vec2f) -> f32 {
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  return textureLoad(tDepth, depthCoord, 0).r;
}

// Load color using integer coordinates (for uniform control flow safety)
fn loadColor(uv: vec2f) -> vec4f {
  let colorDims = textureDimensions(tColor);
  let colorCoord = vec2i(uv * vec2f(colorDims));
  let clampedCoord = clamp(colorCoord, vec2i(0), vec2i(colorDims) - vec2i(1));
  return textureLoad(tColor, clampedCoord, 0);
}

// Ray march in screen space
// Uses textureLoad instead of textureSample to avoid non-uniform control flow issues
fn rayMarch(origin: vec3f, direction: vec3f) -> vec4f {
  var rayPos = origin;
  let maxSteps = i32(uniforms.maxDistance / uniforms.stepSize);

  // Track hit result to avoid early return (which causes non-uniform control flow)
  var hitResult = vec4f(0.0);
  var foundHit = false;

  for (var i = 0; i < maxSteps; i++) {
    // Skip remaining iterations if we already found a hit
    if (foundHit) {
      continue;
    }

    rayPos += direction * uniforms.stepSize;

    // Project to screen
    let screenPos = projectToScreen(rayPos);

    // Check bounds - use continue instead of break to maintain predictable control flow
    if (screenPos.x < 0.0 || screenPos.x > 1.0 ||
        screenPos.y < 0.0 || screenPos.y > 1.0 ||
        screenPos.z < 0.0 || screenPos.z > 1.0) {
      continue;
    }

    // Sample depth at this screen position (using textureLoad for unfilterable-float)
    let sampleDepth = loadDepth(screenPos.xy);
    let sampleViewPos = getViewPosition(screenPos.xy, sampleDepth);

    // Check if ray is behind surface
    let rayDepth = -rayPos.z;
    let surfaceDepth = -sampleViewPos.z;

    if (rayDepth > surfaceDepth && rayDepth - surfaceDepth < uniforms.stepSize * 2.0) {
      // Hit! Sample color using textureLoad (uniform control flow safe)
      let hitColor = loadColor(screenPos.xy);

      // Fade based on distance
      let dist = length(rayPos - origin);
      let fade = 1.0 - dist / uniforms.maxDistance;

      hitResult = vec4f(hitColor.rgb, fade);
      foundHit = true;
    }
  }

  return hitResult;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample original color
  let originalColor = textureSample(tColor, texSampler, uv);

  // Sample depth (using textureLoad for unfilterable-float)
  let depth = loadDepth(uv);

  // Skip far plane (sky)
  if (depth >= 0.9999) {
    return originalColor;
  }

  // Get view-space position
  let viewPos = getViewPosition(uv, depth);

  // Get view-space normal
  let normalSample = textureSample(tNormal, texSampler, uv).rgb;
  let normal = normalize(normalSample * 2.0 - 1.0);

  // Skip surfaces facing away
  let viewDir = normalize(-viewPos);
  let NdotV = dot(normal, viewDir);
  if (NdotV < 0.01) {
    return originalColor;
  }

  // Compute reflection direction
  let reflectDir = reflect(-viewDir, normal);

  // Ray march for reflection
  let reflection = rayMarch(viewPos, reflectDir);

  // Blend reflection with original
  let reflectionColor = reflection.rgb * reflection.a * uniforms.intensity;
  let finalColor = originalColor.rgb + reflectionColor;

  return vec4f(finalColor, originalColor.a);
}
`

/**
 * WebGPU SSR Pass.
 *
 * Computes screen-space reflections using ray marching.
 */
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

export class SSRPass extends WebGPUBasePass {
  private passConfig: SSRPassConfig

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
  private maxDistance: number
  private stepSize: number
  private refinementSteps: number
  private intensity: number

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
    this.maxDistance = config.maxDistance ?? 10.0
    this.stepSize = config.stepSize ?? 0.1
    this.refinementSteps = config.refinementSteps ?? 4
    this.intensity = config.intensity ?? 0.5
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'ssr-bgl',
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
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, SSR_SHADER, 'ssr-fragment')

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'ssr' }
    )

    // Create uniform buffer (288 bytes: 4x mat4x4f (256) + vec2f (8) + 6x f32 (24))
    this.uniformBuffer = this.createUniformBuffer(device, 288, 'ssr-uniforms')

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
   * @param intensity
   */
  setIntensity(intensity: number): void {
    this.intensity = intensity
  }

  /**
   * Set maximum ray distance.
   * @param distance
   */
  setMaxDistance(distance: number): void {
    this.maxDistance = distance
  }


  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      ssrIntensity?: number
      ssrMaxDistance?: number
    }

    if (postProcessing?.ssrIntensity !== undefined) {
      this.intensity = postProcessing.ssrIntensity
    }
    if (postProcessing?.ssrMaxDistance !== undefined) {
      this.maxDistance = postProcessing.ssrMaxDistance
    }
  }

  /**
   * Execute the SSR pass.
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
    const normalView = ctx.getTextureView(this.passConfig.normalInput)

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      viewMatrix?: { elements: number[] }
      projectionMatrix?: { elements: number[] }
      inverseViewMatrix?: { elements: number[] }
      inverseProjectionMatrix?: { elements: number[] }
      near?: number
      far?: number
      isPerspective?: boolean
    }

    // Check if camera is perspective
    // A perspective projection matrix has elements[11] = -1 and elements[15] = 0
    // An orthographic projection has elements[11] = 0 and elements[15] = 1
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

    // Update uniforms
    const data = new Float32Array(80)

    // View matrix (16 floats)
    if (camera?.viewMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.viewMatrix.elements[i]
        if (value !== undefined) data[i] = value
      }
    }

    // Projection matrix (16 floats)
    if (camera?.projectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.projectionMatrix.elements[i]
        if (value !== undefined) data[16 + i] = value
      }
    }

    // Inverse view matrix (16 floats)
    if (camera?.inverseViewMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseViewMatrix.elements[i]
        if (value !== undefined) data[32 + i] = value
      }
    }

    // Inverse projection matrix (16 floats)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseProjectionMatrix.elements[i]
        if (value !== undefined) data[48 + i] = value
      }
    }

    // Resolution and parameters (offset 64)
    data[64] = ctx.size.width
    data[65] = ctx.size.height
    data[66] = this.maxDistance
    data[67] = this.stepSize
    data[68] = this.refinementSteps
    data[69] = this.intensity
    data[70] = camera?.near ?? 0.1
    data[71] = camera?.far ?? 100

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'ssr-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
        { binding: 3, resource: depthView },
        { binding: 4, resource: normalView },
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
