/**
 * WebGPU Frame Blending Pass
 *
 * Blends current frame with previous frame for smoother motion at low frame rates.
 * Uses an internal ping-pong buffer to store frame history.
 *
 * @module rendering/webgpu/passes/FrameBlendingPass
 */

import { BindGroupCache } from '../core/BindGroupCache'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'

const MIN_HORIZON_MEMORY_RADIUS = 0.05
const MAX_HORIZON_MEMORY_RADIUS = 1.5
const MAX_HORIZON_MEMORY_STRENGTH = 1.5
const MAX_HORIZON_MEMORY_SPIN = 1
const MIN_HORIZON_MEMORY_ECHOES = 1
const MAX_HORIZON_MEMORY_ECHOES = 6

function clampFinite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(min, Math.min(max, value))
}

function clampEchoCount(value: number | undefined, fallback: number): number {
  return Math.round(
    clampFinite(value, fallback, MIN_HORIZON_MEMORY_ECHOES, MAX_HORIZON_MEMORY_ECHOES)
  )
}

/**
 * Frame blending pass configuration.
 */
export interface FrameBlendingPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string
  /** Blend factor (0 = current only, 1 = previous only) */
  blendFactor?: number
  /** Horizon memory echo strength (0 = disabled, 1.5 = maximum) */
  horizonMemoryStrength?: number
  /** Center-origin echo radius in screen UV units */
  horizonMemoryRadius?: number
  /** Number of radial echo shells */
  horizonMemoryEchoes?: number
  /** Angular spin/shear applied to echo-shell sampling */
  horizonMemorySpin?: number
}

/**
 * WGSL Frame Blending Fragment Shader
 */
export const frameBlendingShader = /* wgsl */ `
struct Uniforms {
  blendFactor: f32,
  horizonStrength: f32,
  horizonRadius: f32,
  horizonEchoes: f32,
  horizonSpin: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tCurrentFrame: texture_2d<f32>;
@group(0) @binding(3) var tPreviousFrame: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  let current = textureSample(tCurrentFrame, texSampler, uv);
  let previous = textureSample(tPreviousFrame, texSampler, uv);

  let blendFactor = clamp(uniforms.blendFactor, 0.0, 1.0);
  let horizonStrength = clamp(uniforms.horizonStrength, 0.0, 1.5);
  let horizonSpin = clamp(uniforms.horizonSpin, 0.0, 1.0);

  // Disabled horizon memory path preserves exact historical frame blending.
  if (horizonStrength <= 0.0001) {
    return mix(current, previous, blendFactor);
  }

  let dims = vec2f(textureDimensions(tPreviousFrame));
  let texel = 1.0 / max(dims, vec2f(1.0));
  let lowerBound = texel;
  let upperBound = vec2f(1.0) - texel;

  let previousLum = luminance(previous.rgb);
  let currentLum = luminance(current.rgb);
  let changeGate = 1.0 - smoothstep(0.01, 0.25, abs(currentLum - previousLum));
  let memoryStrength = horizonStrength * changeGate;

  let prevLeft = textureSample(tPreviousFrame, texSampler, clamp(uv - vec2f(texel.x, 0.0), lowerBound, upperBound));
  let prevRight = textureSample(tPreviousFrame, texSampler, clamp(uv + vec2f(texel.x, 0.0), lowerBound, upperBound));
  let prevDown = textureSample(tPreviousFrame, texSampler, clamp(uv - vec2f(0.0, texel.y), lowerBound, upperBound));
  let prevUp = textureSample(tPreviousFrame, texSampler, clamp(uv + vec2f(0.0, texel.y), lowerBound, upperBound));
  let previousGradient = vec2f(
    luminance(prevRight.rgb) - luminance(prevLeft.rgb),
    luminance(prevUp.rgb) - luminance(prevDown.rgb)
  );

  let refractedUv = clamp(uv - previousGradient * (0.075 * memoryStrength), lowerBound, upperBound);
  let center = vec2f(0.5);
  let centered = uv - center;
  let radialDistance = length(centered);
  let radialDir = select(centered / max(radialDistance, 0.0001), vec2f(0.0, 1.0), radialDistance < 0.0001);
  let tangentDir = vec2f(-radialDir.y, radialDir.x);
  let gradientMagnitude = length(previousGradient);
  let gradientOrientation = dot(previousGradient, tangentDir) / max(gradientMagnitude, 0.0001);
  let tangentialShear = tangentDir * gradientOrientation * (0.045 * horizonSpin * memoryStrength);
  let spunCurrentUv = clamp(refractedUv + tangentialShear, lowerBound, upperBound);
  let refractedCurrent = textureSample(tCurrentFrame, texSampler, spunCurrentUv);

  let horizonRadius = clamp(uniforms.horizonRadius, 0.05, 1.5);
  let echoCount = i32(clamp(round(uniforms.horizonEchoes), 1.0, 6.0));
  let shellWidth = max(horizonRadius * 0.075, 0.015);

  var echoAccum = vec3f(0.0);
  var shellAccum = 0.0;
  for (var i = 1; i <= 6; i = i + 1) {
    if (i <= echoCount) {
      let echoIndex = f32(i);
      let shellCenter = horizonRadius * (echoIndex / f32(echoCount));
      let shellDelta = (radialDistance - shellCenter) / shellWidth;
      let shell = exp(-shellDelta * shellDelta);
      let shellWeight = shell / echoIndex;
      let echoDistance = max(radialDistance - shellWidth * echoIndex, 0.0);
      let spinDirection = select(sign(gradientOrientation), 1.0, abs(gradientOrientation) < 0.0001);
      let spinAngle = horizonSpin * memoryStrength * spinDirection * shell * (0.65 / sqrt(echoIndex));
      let spinSin = sin(spinAngle);
      let spinCos = cos(spinAngle);
      let spunDir = vec2f(
        radialDir.x * spinCos - radialDir.y * spinSin,
        radialDir.x * spinSin + radialDir.y * spinCos
      );
      let echoUv = clamp(center + spunDir * echoDistance, lowerBound, upperBound);
      let echoSample = textureSample(tPreviousFrame, texSampler, echoUv);
      echoAccum += echoSample.rgb * shellWeight;
      shellAccum += shellWeight;
    }
  }

  let echoColor = echoAccum / max(shellAccum, 0.0001);
  let shellPresence = clamp(shellAccum, 0.0, 1.0);
  let memoryBlend = clamp(blendFactor + 0.18 * memoryStrength, 0.0, 1.0);
  let base = mix(refractedCurrent, previous, memoryBlend);
  let emission = echoColor * shellPresence * memoryStrength * (0.42 + 0.35 * changeGate);

  return vec4f(base.rgb + emission, base.a);
}
`

/**
 * WGSL Copy Shader for history buffer initialization
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
 * WebGPU Frame Blending Pass.
 *
 * Maintains an internal history buffer and blends the current frame
 * with the previous frame based on the blend factor.
 *
 * @example
 * ```typescript
 * const frameBlendingPass = new FrameBlendingPass({
 *   colorInput: 'tonemappedOutput',
 *   outputResource: 'frameBlendingOutput',
 *   blendFactor: 0.3,
 * });
 * ```
 */
export class FrameBlendingPass extends WebGPUBasePass {
  private passConfig: FrameBlendingPassConfig

  // Pipelines
  private blendPipeline: GPURenderPipeline | null = null
  private copyPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private copyBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null
  private uniformData = new Float32Array(5)

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private blendFactor: number
  private horizonMemoryStrength: number
  private horizonMemoryRadius: number
  private horizonMemoryEchoes: number
  private horizonMemorySpin: number

  // Internal history buffer (ping-pong)
  private historyTexture: GPUTexture | null = null
  private historyView: GPUTextureView | null = null
  private historyInitialized = false
  private lastWidth = 0
  private lastHeight = 0
  private lastBlendFactor = Number.NaN
  private lastHorizonMemoryStrength = Number.NaN
  private lastHorizonMemoryRadius = Number.NaN
  private lastHorizonMemoryEchoes = Number.NaN
  private lastHorizonMemorySpin = Number.NaN

  private blendBGCache = new BindGroupCache()
  private copyBGCache = new BindGroupCache()

  // Texture format for history buffer
  private textureFormat: GPUTextureFormat = 'rgba16float'

  constructor(config: FrameBlendingPassConfig) {
    super({
      id: 'frame-blending',
      priority: 200,
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.blendFactor = clampFinite(config.blendFactor, 0.3, 0, 1)
    this.horizonMemoryStrength = clampFinite(
      config.horizonMemoryStrength,
      0,
      0,
      MAX_HORIZON_MEMORY_STRENGTH
    )
    this.horizonMemoryRadius = clampFinite(
      config.horizonMemoryRadius,
      0.62,
      MIN_HORIZON_MEMORY_RADIUS,
      MAX_HORIZON_MEMORY_RADIUS
    )
    this.horizonMemoryEchoes = clampEchoCount(config.horizonMemoryEchoes, 3)
    this.horizonMemorySpin = clampFinite(config.horizonMemorySpin, 0, 0, MAX_HORIZON_MEMORY_SPIN)
  }

  /**
   * Create the rendering pipelines.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Use rgba16float for HDR pipeline - this must match the resource format
    // in WebGPUScene.tsx where frame-blend-output is created as rgba16float
    const hdrFormat: GPUTextureFormat = 'rgba16float'
    this.textureFormat = hdrFormat

    // Create blend pass bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'frame-blending-bgl',
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
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create copy pass bind group layout
    this.copyBindGroupLayout = device.createBindGroupLayout({
      label: 'frame-blending-copy-bgl',
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

    // Create blend fragment shader module
    const blendFragmentModule = this.createShaderModule(
      device,
      frameBlendingShader,
      'frame-blending-fragment'
    )

    // Create copy fragment shader module
    const copyFragmentModule = this.createShaderModule(
      device,
      COPY_SHADER,
      'frame-blending-copy-fragment'
    )

    // Create blend pipeline - uses HDR format to match output texture
    this.blendPipeline = this.createFullscreenPipeline(
      device,
      blendFragmentModule,
      [this.passBindGroupLayout],
      hdrFormat,
      { label: 'frame-blending' }
    )

    // Create copy pipeline - uses HDR format to match output texture
    this.copyPipeline = this.createFullscreenPipeline(
      device,
      copyFragmentModule,
      [this.copyBindGroupLayout],
      hdrFormat,
      { label: 'frame-blending-copy' }
    )

    // Five scalar floats; helper aligns allocation to 16-byte boundary.
    this.uniformBuffer = this.createUniformBuffer(device, 20, 'frame-blending-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'frame-blending-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Create or resize the internal history buffer.
   * @param device
   * @param width
   * @param height
   */
  private ensureHistoryBuffer(device: GPUDevice, width: number, height: number): void {
    if (this.historyTexture && this.lastWidth === width && this.lastHeight === height) {
      return
    }

    // Dispose old buffer
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }

    // Create new texture matching output size
    // COPY_DST is required for copyTextureToTexture() to copy blended output to history
    this.historyTexture = device.createTexture({
      label: 'frame-blending-history',
      size: { width, height },
      format: this.textureFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST,
    })

    this.historyView = this.historyTexture.createView({
      label: 'frame-blending-history-view',
    })

    this.lastWidth = width
    this.lastHeight = height
    this.historyInitialized = false
    this.lastBlendFactor = Number.NaN
    this.lastHorizonMemoryStrength = Number.NaN
    this.lastHorizonMemoryRadius = Number.NaN
    this.lastHorizonMemoryEchoes = Number.NaN
    this.lastHorizonMemorySpin = Number.NaN
    this.blendBGCache.invalidate()
  }

  /**
   * Set blend factor.
   * @param value Blend factor (0 = current only, 1 = previous only)
   */
  setBlendFactor(value: number): void {
    this.blendFactor = clampFinite(value, this.blendFactor, 0, 1)
  }

  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = getStoreSnapshot<{
      frameBlendingFactor?: number
      horizonMemoryEnabled?: boolean
      horizonMemoryStrength?: number
      horizonMemoryRadius?: number
      horizonMemoryEchoes?: number
      horizonMemorySpin?: number
    }>(ctx, 'postProcessing')

    if (postProcessing?.frameBlendingFactor !== undefined) {
      this.blendFactor = clampFinite(postProcessing.frameBlendingFactor, this.blendFactor, 0, 1)
    }

    if (postProcessing?.horizonMemoryRadius !== undefined) {
      this.horizonMemoryRadius = clampFinite(
        postProcessing.horizonMemoryRadius,
        this.horizonMemoryRadius,
        MIN_HORIZON_MEMORY_RADIUS,
        MAX_HORIZON_MEMORY_RADIUS
      )
    }

    if (postProcessing?.horizonMemoryEchoes !== undefined) {
      this.horizonMemoryEchoes = clampEchoCount(
        postProcessing.horizonMemoryEchoes,
        this.horizonMemoryEchoes
      )
    }

    if (postProcessing?.horizonMemoryStrength !== undefined) {
      this.horizonMemoryStrength = clampFinite(
        postProcessing.horizonMemoryStrength,
        this.horizonMemoryStrength,
        0,
        MAX_HORIZON_MEMORY_STRENGTH
      )
    }

    if (postProcessing?.horizonMemorySpin !== undefined) {
      this.horizonMemorySpin = clampFinite(
        postProcessing.horizonMemorySpin,
        this.horizonMemorySpin,
        0,
        MAX_HORIZON_MEMORY_SPIN
      )
    }

    if (postProcessing?.horizonMemoryEnabled === false) {
      this.horizonMemoryStrength = 0
    }
  }

  /**
   * Reset history buffer (e.g., on camera teleport or scene change).
   */
  resetHistory(): void {
    this.historyInitialized = false
    this.lastBlendFactor = Number.NaN
    this.lastHorizonMemoryStrength = Number.NaN
    this.lastHorizonMemoryRadius = Number.NaN
    this.lastHorizonMemoryEchoes = Number.NaN
    this.lastHorizonMemorySpin = Number.NaN
  }

  /**
   * Check if pass was previously enabled (for detecting re-enable).
   * Call this to reset history when the pass is re-enabled after being disabled.
   */
  onEnabled(): void {
    // Reset history when pass is re-enabled to avoid stale frame blending
    this.historyInitialized = false
    this.lastBlendFactor = Number.NaN
    this.lastHorizonMemoryStrength = Number.NaN
    this.lastHorizonMemoryRadius = Number.NaN
    this.lastHorizonMemoryEchoes = Number.NaN
    this.lastHorizonMemorySpin = Number.NaN
  }

  /**
   * Execute the frame blending pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.blendPipeline ||
      !this.copyPipeline ||
      !this.uniformBuffer ||
      !this.passBindGroupLayout ||
      !this.copyBindGroupLayout ||
      !this.sampler
    ) {
      return
    }

    // Update from stores
    this.updateFromStores(ctx)

    // Get input texture
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    if (!colorView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get output texture for copy operation
    const outputTexture = ctx.getTexture(this.passConfig.outputResource)
    if (!outputTexture) return

    // Ensure history buffer exists at correct size
    this.ensureHistoryBuffer(this.device, ctx.size.width, ctx.size.height)

    if (!this.historyView || !this.historyTexture) return

    // If first frame, just copy current to output and initialize history
    if (!this.historyInitialized) {
      const copyBG = this.copyBGCache.get([colorView], () =>
        this.device!.createBindGroup({
          label: 'frame-blending-copy-to-output-bg',
          layout: this.copyBindGroupLayout!,
          entries: [
            { binding: 0, resource: this.sampler! },
            { binding: 1, resource: colorView },
          ],
        })
      )

      // Copy current frame to output
      const outputPassEncoder = ctx.beginRenderPass({
        label: 'frame-blending-copy-to-output',
        colorAttachments: [
          {
            view: outputView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })
      this.renderFullscreen(outputPassEncoder, this.copyPipeline, [copyBG])
      outputPassEncoder.end()

      // Copy output to history for next frame using GPU texture copy
      // This is faster than shader-based copy and matches WebGL behavior
      ctx.encoder.copyTextureToTexture(
        { texture: outputTexture },
        { texture: this.historyTexture },
        { width: ctx.size.width, height: ctx.size.height }
      )

      this.historyInitialized = true
      return
    }

    if (
      this.blendFactor !== this.lastBlendFactor ||
      this.horizonMemoryStrength !== this.lastHorizonMemoryStrength ||
      this.horizonMemoryRadius !== this.lastHorizonMemoryRadius ||
      this.horizonMemoryEchoes !== this.lastHorizonMemoryEchoes ||
      this.horizonMemorySpin !== this.lastHorizonMemorySpin
    ) {
      this.uniformData[0] = this.blendFactor
      this.uniformData[1] = this.horizonMemoryStrength
      this.uniformData[2] = this.horizonMemoryRadius
      this.uniformData[3] = this.horizonMemoryEchoes
      this.uniformData[4] = this.horizonMemorySpin
      this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformData)
      this.lastBlendFactor = this.blendFactor
      this.lastHorizonMemoryStrength = this.horizonMemoryStrength
      this.lastHorizonMemoryRadius = this.horizonMemoryRadius
      this.lastHorizonMemoryEchoes = this.horizonMemoryEchoes
      this.lastHorizonMemorySpin = this.horizonMemorySpin
    }

    const blendBG = this.blendBGCache.get([colorView, this.historyView], () =>
      this.device!.createBindGroup({
        label: 'frame-blending-bg',
        layout: this.passBindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer! } },
          { binding: 1, resource: this.sampler! },
          { binding: 2, resource: colorView },
          { binding: 3, resource: this.historyView! },
        ],
      })
    )

    // Render blended result to output
    const blendPassEncoder = ctx.beginRenderPass({
      label: 'frame-blending-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    this.renderFullscreen(blendPassEncoder, this.blendPipeline, [blendBG])
    blendPassEncoder.end()

    // If blendFactor is ~1.0 the output is already equivalent to history,
    // so copying back is redundant.
    if (this.blendFactor < 0.9999 || this.horizonMemoryStrength > 0.0001) {
      ctx.encoder.copyTextureToTexture(
        { texture: outputTexture },
        { texture: this.historyTexture },
        { width: ctx.size.width, height: ctx.size.height }
      )
    }
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }
    this.historyInitialized = false
    this.lastWidth = 0
    this.lastHeight = 0
    this.lastBlendFactor = Number.NaN
    this.lastHorizonMemoryStrength = Number.NaN
    this.lastHorizonMemoryRadius = Number.NaN
    this.lastHorizonMemoryEchoes = Number.NaN
    this.lastHorizonMemorySpin = Number.NaN
    this.blendBGCache.invalidate()
    this.copyBGCache.invalidate()
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.blendPipeline = null
    this.copyPipeline = null
    this.passBindGroupLayout = null
    this.copyBindGroupLayout = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.sampler = null

    if (this.historyTexture) {
      this.historyTexture.destroy()
      this.historyTexture = null
      this.historyView = null
    }
    this.lastBlendFactor = Number.NaN
    this.lastHorizonMemoryStrength = Number.NaN
    this.lastHorizonMemoryRadius = Number.NaN
    this.lastHorizonMemoryEchoes = Number.NaN
    this.lastHorizonMemorySpin = Number.NaN
    this.blendBGCache.invalidate()
    this.copyBGCache.invalidate()

    super.dispose()
  }
}
