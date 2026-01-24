/**
 * WebGPU GTAO Pass (Ground Truth Ambient Occlusion)
 *
 * Screen-space ambient occlusion based on horizon-based technique.
 * Samples the depth buffer to compute visibility for ambient lighting.
 *
 * @module rendering/webgpu/passes/GTAOPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * GTAO pass configuration.
 */
export interface GTAOPassConfig {
  /** Depth input resource ID */
  depthInput: string
  /** Normal input resource ID */
  normalInput: string
  /** Output resource ID */
  outputResource: string
  /** AO radius in world units */
  radius?: number
  /** AO intensity (0-1) */
  intensity?: number
  /** Number of directions to sample */
  directionCount?: number
  /** Number of steps per direction */
  stepCount?: number
}

/**
 * WGSL GTAO Fragment Shader
 */
const GTAO_SHADER = /* wgsl */ `
struct Uniforms {
  projectionMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  resolution: vec2f,
  radius: f32,
  intensity: f32,
  near: f32,
  far: f32,
  directionCount: f32,
  stepCount: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDepth: texture_2d<f32>;
@group(0) @binding(3) var tNormal: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

const PI: f32 = 3.14159265359;
const TWO_PI: f32 = 6.28318530718;

// Reconstruct view-space position from depth
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
  // NDC position
  let ndc = vec4f(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  // Unproject to view space
  var viewPos = uniforms.inverseProjectionMatrix * ndc;
  viewPos /= viewPos.w;
  return viewPos.xyz;
}

// Linearize depth
fn linearizeDepth(depth: f32) -> f32 {
  let z = depth * 2.0 - 1.0;
  return (2.0 * uniforms.near * uniforms.far) / (uniforms.far + uniforms.near - z * (uniforms.far - uniforms.near));
}

// Simple hash for pseudo-random rotation
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Get rotation angle based on pixel position
fn getRotationAngle(uv: vec2f) -> f32 {
  let pixelPos = uv * uniforms.resolution;
  return hash(pixelPos) * TWO_PI;
}

// Sample occlusion in a direction
fn sampleDirection(viewPos: vec3f, normal: vec3f, direction: vec2f, uv: vec2f) -> f32 {
  var occlusion: f32 = 0.0;
  let stepSize = uniforms.radius / uniforms.stepCount;

  for (var i: f32 = 1.0; i <= uniforms.stepCount; i += 1.0) {
    let sampleOffset = direction * i * stepSize / linearizeDepth(textureSample(tDepth, texSampler, uv).r);
    let sampleUV = uv + sampleOffset;

    // Skip if outside screen
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      continue;
    }

    let sampleDepth = textureSample(tDepth, texSampler, sampleUV).r;
    let samplePos = getViewPosition(sampleUV, sampleDepth);

    // Vector from current position to sample
    let sampleDir = samplePos - viewPos;
    let sampleDist = length(sampleDir);

    // Skip if too far
    if (sampleDist > uniforms.radius) {
      continue;
    }

    // Compute occlusion contribution
    let normalizedDir = sampleDir / sampleDist;
    let NdotS = max(dot(normal, normalizedDir), 0.0);

    // Distance falloff
    let falloff = 1.0 - sampleDist / uniforms.radius;

    occlusion += NdotS * falloff;
  }

  return occlusion / uniforms.stepCount;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample depth and normal
  let depth = textureSample(tDepth, texSampler, uv).r;

  // Skip far plane (sky)
  if (depth >= 0.9999) {
    return vec4f(1.0, 1.0, 1.0, 1.0);
  }

  // Get view-space position and normal
  let viewPos = getViewPosition(uv, depth);

  // Decode normal from G-buffer (assumed to be in view space, packed as RGB)
  let normalSample = textureSample(tNormal, texSampler, uv).rgb;
  let normal = normalize(normalSample * 2.0 - 1.0);

  // Rotation angle for temporal/spatial variation
  let rotationAngle = getRotationAngle(uv);

  // Accumulate occlusion from multiple directions
  var totalOcclusion: f32 = 0.0;

  for (var d: f32 = 0.0; d < uniforms.directionCount; d += 1.0) {
    let angle = (d / uniforms.directionCount) * TWO_PI + rotationAngle;
    let direction = vec2f(cos(angle), sin(angle));
    totalOcclusion += sampleDirection(viewPos, normal, direction, uv);
  }

  totalOcclusion /= uniforms.directionCount;

  // Apply intensity and invert (AO = 1 - occlusion)
  let ao = 1.0 - totalOcclusion * uniforms.intensity;

  return vec4f(ao, ao, ao, 1.0);
}
`

/**
 * WebGPU GTAO Pass.
 *
 * Computes screen-space ambient occlusion using horizon-based technique.
 */
export class GTAOPass extends WebGPUBasePass {
  private passConfig: GTAOPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private radius: number
  private intensity: number
  private directionCount: number
  private stepCount: number

  constructor(config: GTAOPassConfig) {
    super({
      id: 'gtao',
      priority: 150,
      inputs: [
        { resourceId: config.depthInput, access: 'read' as const, binding: 0 },
        { resourceId: config.normalInput, access: 'read' as const, binding: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.radius = config.radius ?? 0.5
    this.intensity = config.intensity ?? 1.0
    this.directionCount = config.directionCount ?? 8
    this.stepCount = config.stepCount ?? 4
  }

  /**
   * Create the rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'gtao-bgl',
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
          texture: { sampleType: 'unfilterable-float' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, GTAO_SHADER, 'gtao-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'gtao' }
    )

    // Create uniform buffer (matrices + params)
    this.uniformBuffer = this.createUniformBuffer(device, 256, 'gtao-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'gtao-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set AO radius.
   */
  setRadius(radius: number): void {
    this.radius = radius
  }

  /**
   * Set AO intensity.
   */
  setIntensity(intensity: number): void {
    this.intensity = intensity
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      aoRadius?: number
      aoIntensity?: number
    }

    if (postProcessing?.aoRadius !== undefined) {
      this.radius = postProcessing.aoRadius
    }
    if (postProcessing?.aoIntensity !== undefined) {
      this.intensity = postProcessing.aoIntensity
    }
  }

  /**
   * Execute the GTAO pass.
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
    const depthView = ctx.getTextureView(this.passConfig.depthInput)
    const normalView = ctx.getTextureView(this.passConfig.normalInput)

    if (!depthView || !normalView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      projectionMatrix?: { elements: number[] }
      inverseProjectionMatrix?: { elements: number[] }
      near?: number
      far?: number
    }

    // Update uniforms
    const data = new Float32Array(64)

    // Projection matrix (16 floats)
    if (camera?.projectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.projectionMatrix.elements[i]
        if (value !== undefined) data[i] = value
      }
    }

    // Inverse projection matrix (16 floats)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseProjectionMatrix.elements[i]
        if (value !== undefined) data[16 + i] = value
      }
    }

    // Resolution (2 floats) at offset 32
    data[32] = ctx.size.width
    data[33] = ctx.size.height

    // Parameters (4 floats) at offset 34
    data[34] = this.radius
    data[35] = this.intensity
    data[36] = camera?.near ?? 0.1
    data[37] = camera?.far ?? 100
    data[38] = this.directionCount
    data[39] = this.stepCount

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'gtao-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: depthView },
        { binding: 3, resource: normalView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'gtao-render',
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
