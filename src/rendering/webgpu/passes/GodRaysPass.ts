/**
 * WebGPU God Rays Pass (Volumetric Light Scattering)
 *
 * Two-pass implementation matching the WebGL GodRaysPass:
 * Pass 1: GPU Gems 3 radial blur on jet buffer toward light source
 * Pass 2: Composite god rays over scene with adaptive soft light blending
 *
 * Features (matching WebGL):
 * - Blue noise dithering to reduce banding
 * - Luminance-based filtering with soft knee compression
 * - Color preservation (hue-preserving brightness control)
 * - Distance-based exposure falloff (stronger near light)
 * - Saturation boost to counteract desaturation
 * - Radial fade (vignette)
 * - Adaptive composite (soft light + additive based on scene luminance)
 * - Per-frame store reads for dynamic parameters
 * - Camera-projected light position tracking
 *
 * @module rendering/webgpu/passes/GodRaysPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * God rays pass configuration.
 */
export interface GodRaysPassConfig {
  /** Jet buffer input resource ID (just the jet rendering, no scene) */
  jetsInput: string
  /** Scene input resource ID (scene with jets composited) */
  sceneInput: string
  /** Output resource ID */
  outputResource: string
}

// ============================================================
// WGSL Shaders
// ============================================================

/**
 * Pass 1: Radial blur shader (GPU Gems 3 technique)
 * Samples from jet buffer toward light source with exponential decay.
 * Matches WebGL godRaysFragmentShader features.
 */
const GOD_RAYS_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  lightPosition: vec2f,
  exposure: f32,
  decay: f32,
  density: f32,
  weight: f32,
  samples: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tInput: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

const PI: f32 = 3.14159265359;

// High-quality noise for dithering (matches WebGL hash12)
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Blue noise approximation (matches WebGL blueNoise)
fn blueNoise(uv: vec2f) -> f32 {
  var noise = hash12(uv * 1000.0);
  noise += hash12(uv * 1000.0 + 0.5) * 0.5;
  noise += hash12(uv * 1000.0 + 0.25) * 0.25;
  return fract(noise);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Vector from current pixel toward light source
  var deltaTexCoord = uv - uniforms.lightPosition;

  // Distance from light source for intensity falloff
  let distFromLight = length(deltaTexCoord);

  // Scale by density and sample count
  let sampleCount = uniforms.samples;
  deltaTexCoord *= uniforms.density / sampleCount;

  // Start at current pixel
  var texCoord = uv;

  // Apply blue noise dithering to reduce banding
  let jitter = blueNoise(input.position.xy);
  texCoord -= deltaTexCoord * jitter;

  // Accumulate samples with color preservation
  var color = vec3f(0.0);
  var totalWeight: f32 = 0.0;
  var illuminationDecay: f32 = 1.0;

  let iSampleCount = i32(sampleCount);
  for (var i = 0; i < iSampleCount; i++) {
    // Step toward light source
    texCoord -= deltaTexCoord;

    // Clamp to valid UV range
    let sampleCoord = clamp(texCoord, vec2f(0.0), vec2f(1.0));

    // Sample the jet buffer
    let sampleColor = textureSampleLevel(tInput, texSampler, sampleCoord, 0.0);

    // Calculate luminance
    let luminance = dot(sampleColor.rgb, vec3f(0.299, 0.587, 0.114));

    // Only accumulate visible samples (low threshold, matches WebGL 0.005)
    if (luminance > 0.005) {
      // Preserve color saturation while controlling brightness
      // Soft knee compression for HDR values (matches WebGL)
      let knee: f32 = 0.5;
      let compressed = luminance / (1.0 + luminance * knee);

      // Scale sample while preserving hue
      let normalizedColor = sampleColor.rgb / max(luminance, 0.001);
      let processedSample = normalizedColor * compressed;

      let sampleWeight = illuminationDecay * uniforms.weight;
      color += processedSample * sampleWeight;
      totalWeight += sampleWeight;
    }

    // Exponential decay
    illuminationDecay *= uniforms.decay;
  }

  // Normalize by total weight
  if (totalWeight > 0.001) {
    color /= totalWeight;
  }

  // Apply exposure with HDR-aware curve (matches WebGL)
  // Higher exposure near light source for more dramatic effect
  let distanceFalloff = 1.0 - smoothstep(0.0, 1.5, distFromLight);
  let effectiveExposure = uniforms.exposure * (1.0 + distanceFalloff * 0.5);
  color *= effectiveExposure * 2.5;

  // Boost saturation to counteract desaturation from blending (matches WebGL 1.15x)
  let colorLum = dot(color, vec3f(0.299, 0.587, 0.114));
  if (colorLum > 0.01) {
    let gray = vec3f(colorLum);
    color = mix(gray, color, 1.15);
  }

  // Apply soft radial fade (matches WebGL)
  let radialFade = 1.0 - smoothstep(0.3, 1.8, distFromLight);
  color *= mix(0.3, 1.0, radialFade);

  return vec4f(color, 1.0);
}
`

/**
 * Pass 2: Composite shader - adaptive soft light + additive blending
 * Matches WebGL godRaysCompositeFragmentShader.
 */
const GOD_RAYS_COMPOSITE_SHADER = /* wgsl */ `
struct CompositeUniforms {
  intensity: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tScene: texture_2d<f32>;
@group(0) @binding(3) var tGodRays: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Soft light blend mode (matches WebGL softLight function)
fn softLight(base: vec3f, blend: vec3f) -> vec3f {
  return mix(
    sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
    2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
    step(base, vec3f(0.5))
  );
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tScene, texSampler, input.uv);
  let godRaysColor = textureSample(tGodRays, texSampler, input.uv);

  // Apply intensity to god rays
  let godRays = godRaysColor.rgb * uniforms.intensity;

  // Calculate luminance for adaptive blending
  let rayLum = dot(godRays, vec3f(0.299, 0.587, 0.114));
  let sceneLum = dot(sceneColor.rgb, vec3f(0.299, 0.587, 0.114));

  // Soft compress god rays to prevent harsh blowout (matches WebGL)
  let godRaysCompressed = godRays / (1.0 + godRays * 0.03);

  // Mix between pure additive and soft light for natural look (matches WebGL)
  // More soft light in brighter areas to prevent wash-out
  let blendMode = smoothstep(0.3, 0.8, sceneLum);

  let additive = sceneColor.rgb + godRaysCompressed;
  let softLightBlend = softLight(sceneColor.rgb, godRaysCompressed * 0.5 + 0.5);

  var combined = mix(additive, softLightBlend, blendMode * 0.3);

  // Subtle bloom-like glow in ray areas (matches WebGL)
  let glowMask = smoothstep(0.1, 0.5, rayLum);
  combined += godRaysCompressed * glowMask * 0.2;

  return vec4f(combined, sceneColor.a);
}
`

/**
 * WebGPU God Rays Pass.
 *
 * Two-pass implementation:
 * 1. Radial blur on jet buffer → intermediate texture
 * 2. Composite over scene with adaptive blending → output
 *
 * Reads per-frame from blackHole store: jetsGodRaysIntensity, jetsGodRaysSamples,
 * jetsGodRaysDecay. Projects world origin to screen space for light position.
 */
export class GodRaysPass extends WebGPUBasePass {
  private passConfig: GodRaysPassConfig

  // Pass 1: Radial blur pipeline
  private radialBlurPipeline: GPURenderPipeline | null = null
  private radialBlurBGL: GPUBindGroupLayout | null = null
  private radialBlurUniformBuffer: GPUBuffer | null = null
  private radialBlurSampler: GPUSampler | null = null

  // Pass 2: Composite pipeline
  private compositePipeline: GPURenderPipeline | null = null
  private compositeBGL: GPUBindGroupLayout | null = null
  private compositeUniformBuffer: GPUBuffer | null = null

  // Intermediate render target for radial blur output
  private intermediateTexture: GPUTexture | null = null
  private intermediateView: GPUTextureView | null = null
  private lastWidth = 0
  private lastHeight = 0

  // Light position in screen space (0-1), updated per-frame from camera projection
  private lightPosition: [number, number] = [0.5, 0.5]

  // Parameters from stores
  private intensity: number = 0.8
  private samples: number = 64
  private decay: number = 0.96

  constructor(config: GodRaysPassConfig) {
    // sceneInput first for passthrough (when disabled, copy scene to output)
    super({
      id: 'god-rays',
      priority: 186,
      inputs: [
        { resourceId: config.sceneInput, access: 'read' as const, binding: 0 },
        { resourceId: config.jetsInput, access: 'read' as const, binding: 1 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // --- Pass 1: Radial blur ---
    this.radialBlurBGL = device.createBindGroupLayout({
      label: 'god-rays-blur-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' as const } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' as const } },
      ],
    })

    const blurModule = this.createShaderModule(device, GOD_RAYS_SHADER, 'god-rays-blur')
    this.radialBlurPipeline = this.createFullscreenPipeline(
      device,
      blurModule,
      [this.radialBlurBGL],
      'rgba16float', // HDR intermediate output
      { label: 'god-rays-blur' }
    )

    // 48 bytes: 12 x f32 (9 values + 3 padding)
    this.radialBlurUniformBuffer = this.createUniformBuffer(device, 48, 'god-rays-blur-uniforms')

    this.radialBlurSampler = device.createSampler({
      label: 'god-rays-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // --- Pass 2: Composite ---
    this.compositeBGL = device.createBindGroupLayout({
      label: 'god-rays-composite-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' as const } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' as const } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' as const } },
      ],
    })

    const compositeModule = this.createShaderModule(device, GOD_RAYS_COMPOSITE_SHADER, 'god-rays-composite')
    this.compositePipeline = this.createFullscreenPipeline(
      device,
      compositeModule,
      [this.compositeBGL],
      'rgba16float', // HDR output
      { label: 'god-rays-composite' }
    )

    // 16 bytes: 1 f32 + 3 padding
    this.compositeUniformBuffer = this.createUniformBuffer(device, 16, 'god-rays-composite-uniforms')
  }

  /**
   * Ensure intermediate texture exists at half resolution.
   */
  private ensureIntermediateTexture(device: GPUDevice, width: number, height: number): void {
    const halfWidth = Math.max(1, Math.floor(width / 2))
    const halfHeight = Math.max(1, Math.floor(height / 2))

    if (this.intermediateTexture && this.lastWidth === halfWidth && this.lastHeight === halfHeight) {
      return
    }

    this.intermediateTexture?.destroy()

    this.intermediateTexture = device.createTexture({
      label: 'god-rays-intermediate',
      size: { width: halfWidth, height: halfHeight },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.intermediateView = this.intermediateTexture.createView({ label: 'god-rays-intermediate-view' })

    this.lastWidth = halfWidth
    this.lastHeight = halfHeight
  }

  /**
   * Update from stores per-frame.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const blackhole = ctx.frame?.stores?.['blackHole'] as {
      jetsGodRaysIntensity?: number
      jetsGodRaysSamples?: number
      jetsGodRaysDecay?: number
    }

    if (blackhole?.jetsGodRaysIntensity !== undefined) {
      this.intensity = blackhole.jetsGodRaysIntensity
    }
    if (blackhole?.jetsGodRaysSamples !== undefined) {
      this.samples = blackhole.jetsGodRaysSamples
    }
    if (blackhole?.jetsGodRaysDecay !== undefined) {
      this.decay = blackhole.jetsGodRaysDecay
    }
  }

  /**
   * Project world origin (black hole center) to screen space UV.
   */
  private updateLightPosition(ctx: WebGPURenderContext): void {
    const camera = ctx.frame?.stores?.['camera'] as {
      projectionMatrix?: { elements: number[] }
      viewMatrix?: { elements: number[] }
    }

    if (!camera?.projectionMatrix?.elements || !camera?.viewMatrix?.elements) {
      return
    }

    const p = camera.projectionMatrix.elements
    const v = camera.viewMatrix.elements

    // Transform world origin (0,0,0) by view matrix → view space
    // For origin, this is just the translation column of the view matrix
    const vx = v[12] ?? 0
    const vy = v[13] ?? 0
    const vz = v[14] ?? 0
    const vw = v[15] ?? 1

    // Transform view space by projection matrix → clip space
    const cx = p[0]! * vx + p[4]! * vy + p[8]! * vz + p[12]! * vw
    const cy = p[1]! * vx + p[5]! * vy + p[9]! * vz + p[13]! * vw
    const cw = p[3]! * vx + p[7]! * vy + p[11]! * vz + p[15]! * vw

    // Perspective divide → NDC (-1 to 1)
    if (Math.abs(cw) > 0.0001) {
      const ndcX = cx / cw
      const ndcY = cy / cw

      // Convert NDC to UV (0 to 1)
      // WebGPU UV convention: Y=0 is top, Y=1 is bottom (flip from NDC)
      this.lightPosition = [
        (ndcX + 1) * 0.5,
        (1.0 - ndcY) * 0.5,
      ]
    }
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.radialBlurPipeline ||
      !this.radialBlurBGL ||
      !this.radialBlurUniformBuffer ||
      !this.radialBlurSampler ||
      !this.compositePipeline ||
      !this.compositeBGL ||
      !this.compositeUniformBuffer
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)
    this.updateLightPosition(ctx)

    // Get input textures
    const jetsView = ctx.getTextureView(this.passConfig.jetsInput)
    const sceneView = ctx.getTextureView(this.passConfig.sceneInput)
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)

    if (!jetsView || !sceneView || !outputView) return

    // Ensure intermediate texture at half resolution
    const { width, height } = ctx.size
    this.ensureIntermediateTexture(this.device, width, height)
    if (!this.intermediateView) return

    // === Pass 1: Radial blur on jet buffer → intermediate ===

    const blurData = new Float32Array(12)
    blurData[0] = Math.max(1, Math.floor(width / 2))    // half-res width
    blurData[1] = Math.max(1, Math.floor(height / 2))   // half-res height
    blurData[2] = this.lightPosition[0]                  // lightPosition.x
    blurData[3] = this.lightPosition[1]                  // lightPosition.y
    blurData[4] = 0.3                                    // exposure (matches WebGL fixed 0.3)
    blurData[5] = this.decay                             // decay (from store)
    blurData[6] = 1.0                                    // density (matches WebGL fixed 1.0)
    blurData[7] = 1.0                                    // weight (matches WebGL fixed 1.0)
    blurData[8] = this.samples                           // samples (from store)
    // 9-11: padding

    this.writeUniformBuffer(this.device, this.radialBlurUniformBuffer, blurData)

    const blurBindGroup = this.device.createBindGroup({
      label: 'god-rays-blur-bg',
      layout: this.radialBlurBGL,
      entries: [
        { binding: 0, resource: { buffer: this.radialBlurUniformBuffer } },
        { binding: 1, resource: this.radialBlurSampler },
        { binding: 2, resource: jetsView },
      ],
    })

    const blurPass = ctx.beginRenderPass({
      label: 'god-rays-blur',
      colorAttachments: [
        {
          view: this.intermediateView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(blurPass, this.radialBlurPipeline, [blurBindGroup])
    blurPass.end()

    // === Pass 2: Composite god rays over scene → output ===

    const compositeData = new Float32Array(4)
    compositeData[0] = this.intensity   // intensity (from store)
    // 1-3: padding

    this.writeUniformBuffer(this.device, this.compositeUniformBuffer, compositeData)

    const compositeBindGroup = this.device.createBindGroup({
      label: 'god-rays-composite-bg',
      layout: this.compositeBGL,
      entries: [
        { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
        { binding: 1, resource: this.radialBlurSampler },
        { binding: 2, resource: sceneView },
        { binding: 3, resource: this.intermediateView },
      ],
    })

    const compositePass = ctx.beginRenderPass({
      label: 'god-rays-composite',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })

    this.renderFullscreen(compositePass, this.compositePipeline, [compositeBindGroup])
    compositePass.end()
  }

  dispose(): void {
    this.radialBlurPipeline = null
    this.radialBlurBGL = null
    this.radialBlurUniformBuffer?.destroy()
    this.radialBlurUniformBuffer = null
    this.radialBlurSampler = null

    this.compositePipeline = null
    this.compositeBGL = null
    this.compositeUniformBuffer?.destroy()
    this.compositeUniformBuffer = null

    this.intermediateTexture?.destroy()
    this.intermediateTexture = null
    this.intermediateView = null

    super.dispose()
  }
}
