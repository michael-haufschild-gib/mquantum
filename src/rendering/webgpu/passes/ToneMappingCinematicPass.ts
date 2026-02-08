/**
 * WebGPU Combined Tone Mapping + Cinematic Pass
 *
 * OPTIMIZATION: Merges ToneMappingPass and CinematicPass into a single pass.
 * Eliminates one render target switch and redundant texture fetch.
 *
 * Operations (in order):
 * 1. Chromatic aberration (samples R/G/B at offset UVs)
 * 2. Tone mapping (HDR -> LDR conversion)
 * 3. Vignette
 * 4. Film grain
 *
 * Pipeline position: After all HDR effects, before paper texture and AA.
 *
 * @module rendering/webgpu/passes/ToneMappingCinematicPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Tone mapping mode enumeration (matches Three.js constants).
 */
export enum ToneMappingMode {
  None = 0,
  Linear = 1,
  Reinhard = 2,
  Cineon = 3,
  ACESFilmic = 4,
  Filmic = 5,
  AgX = 6,
  Neutral = 7,
}

/** Maps store's ToneMappingAlgorithm string to shader mode integer. */
const ALGORITHM_TO_MODE: Record<string, ToneMappingMode> = {
  none: ToneMappingMode.Linear,
  linear: ToneMappingMode.Linear,
  reinhard: ToneMappingMode.Reinhard,
  cineon: ToneMappingMode.Cineon,
  aces: ToneMappingMode.ACESFilmic,
  filmic: ToneMappingMode.Filmic,
  agx: ToneMappingMode.AgX,
  neutral: ToneMappingMode.Neutral,
}

/**
 * Configuration for ToneMappingCinematicPass.
 */
export interface ToneMappingCinematicPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Output resource ID */
  outputResource: string

  // Tone mapping settings
  /** Initial tone mapping mode */
  toneMapping?: ToneMappingMode
  /** Initial exposure value */
  exposure?: number

  // Cinematic settings
  /** Chromatic aberration distortion amount */
  aberration?: number
  /** Vignette darkness (0 = none, 2 = strong) */
  vignette?: number
  /** Film grain intensity */
  grain?: number
}

/**
 * WGSL Tone Mapping + Cinematic Fragment Shader
 */
const TONEMAPPING_CINEMATIC_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  toneMapping: i32,
  exposure: f32,
  distortion: f32,
  vignetteDarkness: f32,
  vignetteOffset: f32,
  noiseIntensity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// ============================================================================
// Tone Mapping Functions
// ============================================================================

fn saturate3(a: vec3f) -> vec3f {
  return clamp(a, vec3f(0.0), vec3f(1.0));
}

// Reinhard - https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
fn ReinhardToneMapping(color: vec3f, exposure: f32) -> vec3f {
  let c = color * exposure;
  return saturate3(c / (vec3f(1.0) + c));
}

// Cineon - http://filmicworlds.com/blog/filmic-tonemapping-operators/
fn CineonToneMapping(color: vec3f, exposure: f32) -> vec3f {
  var c = color * exposure;
  c = max(vec3f(0.0), c - 0.004);
  let numerator = c * (6.2 * c + 0.5);
  let denominator = c * (6.2 * c + 1.7) + 0.06;
  return pow(numerator / max(denominator, vec3f(0.0001)), vec3f(2.2));
}

// ACES helper
fn RRTAndODTFit(v: vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / max(b, vec3f(0.0001));
}

// ACES Filmic
fn ACESFilmicToneMapping(color: vec3f, exposure: f32) -> vec3f {
  // ACES Input Matrix (transposed for WGSL column-major)
  let ACESInputMat = mat3x3f(
    vec3f(0.59719, 0.35458, 0.04823),
    vec3f(0.07600, 0.90834, 0.01566),
    vec3f(0.02840, 0.13383, 0.83777)
  );
  // ACES Output Matrix (transposed for WGSL column-major)
  let ACESOutputMat = mat3x3f(
    vec3f( 1.60475, -0.53108, -0.07367),
    vec3f(-0.10208,  1.10813, -0.00605),
    vec3f(-0.00327, -0.07276,  1.07602)
  );

  var c = color * exposure / 0.6;
  c = ACESInputMat * c;
  c = RRTAndODTFit(c);
  c = ACESOutputMat * c;
  return saturate3(c);
}

// PERF: Precomputed AGX_INPUT_MATRIX = AgXInsetMatrix * LINEAR_SRGB_TO_LINEAR_REC2020
// (transposed for WGSL column-major) — eliminates one matrix multiply per pixel
const AGX_INPUT_MATRIX = mat3x3f(
  vec3f(0.587512206399144, 0.313681468644592, 0.0988063249562637),
  vec3f(0.186722181710028, 0.707402721510485, 0.105775096779487),
  vec3f(0.126348794494964, 0.137330842818871, 0.736320362686164)
);
// Output matrices cannot be combined (pow(2.2) separates them)
const AGX_OUTSET_MATRIX = mat3x3f(
  vec3f( 1.1271005818144368, -0.11060664309660323, -0.016493938717834573),
  vec3f(-0.1413297634984383,  1.157823702216272, -0.016493938717834257),
  vec3f(-0.14132976349843826, -0.11060664309660294, 1.2519364065950405)
);
const LINEAR_REC2020_TO_LINEAR_SRGB = mat3x3f(
  vec3f( 1.6605, -0.5876, -0.0728),
  vec3f(-0.1246,  1.1329, -0.0083),
  vec3f(-0.0182, -0.1006,  1.1187)
);

// AgX contrast approximation
// PERF: Horner form reduces multiplies from ~12 to 6 per component
fn agxDefaultContrastApprox(x: vec3f) -> vec3f {
  return (((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x + 0.1191) * x - 0.00232;
}

// AgX
fn AgXToneMapping(color: vec3f, exposure: f32) -> vec3f {
  let AgxMinEv = -12.47393;
  let AgxMaxEv = 4.026069;

  // PERF: Use precomputed AGX_INPUT_MATRIX = AgXInsetMatrix * LINEAR_SRGB_TO_LINEAR_REC2020
  // Eliminates one matrix multiply per pixel
  var c = AGX_INPUT_MATRIX * (color * exposure);

  c = max(c, vec3f(1e-10));
  c = log2(c);
  c = (c - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  c = clamp(c, vec3f(0.0), vec3f(1.0));

  c = agxDefaultContrastApprox(c);

  c = AGX_OUTSET_MATRIX * c;
  // pow(2.2) is integral to AgX algorithm (converts from AgX internal space to linear)
  c = pow(max(vec3f(0.0), c), vec3f(2.2));
  c = LINEAR_REC2020_TO_LINEAR_SRGB * c;

  return clamp(c, vec3f(0.0), vec3f(1.0));
}

// Filmic (Uncharted 2) - http://filmicworlds.com/blog/filmic-tonemapping-operators/
fn Uncharted2Curve(x: vec3f) -> vec3f {
  let A = 0.15;  // Shoulder Strength
  let B = 0.50;  // Linear Strength
  let C = 0.10;  // Linear Angle
  let D = 0.20;  // Toe Strength
  let E = 0.02;  // Toe Numerator
  let F = 0.30;  // Toe Denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn FilmicToneMapping(color: vec3f, exposure: f32) -> vec3f {
  let W = 11.2;  // Linear White Point
  let curr = Uncharted2Curve(color * exposure * 2.0);
  let whiteScale = vec3f(1.0) / Uncharted2Curve(vec3f(W));
  return saturate3(curr * whiteScale);
}

// Neutral - https://modelviewer.dev/examples/tone-mapping
fn NeutralToneMapping(color: vec3f, exposure: f32) -> vec3f {
  let StartCompression = 0.8 - 0.04;
  let Desaturation = 0.15;

  var c = color * exposure;

  let x = min(c.r, min(c.g, c.b));
  // PERF: Branchless offset selection
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  c = c - offset;

  let peak = max(c.r, max(c.g, c.b));
  if (peak < StartCompression) {
    return c;
  }

  let d = 1.0 - StartCompression;
  let denominator = peak + d - StartCompression;
  let newPeak = 1.0 - d * d / max(denominator, 0.0001);
  let safePeak = max(peak, 0.0001);
  c = c * newPeak / safePeak;

  let g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}

// Main tone mapping dispatcher
fn applyToneMapping(color: vec3f, mode: i32, exposure: f32) -> vec3f {
  if (mode == 0) { return color; } // NoToneMapping
  if (mode == 1) { return saturate3(exposure * color); } // Linear
  if (mode == 2) { return ReinhardToneMapping(color, exposure); }
  if (mode == 3) { return CineonToneMapping(color, exposure); }
  if (mode == 4) { return ACESFilmicToneMapping(color, exposure); }
  if (mode == 5) { return FilmicToneMapping(color, exposure); }
  if (mode == 6) { return AgXToneMapping(color, exposure); }
  if (mode == 7) { return NeutralToneMapping(color, exposure); }
  return color;
}

// ============================================================================
// Cinematic Effects
// ============================================================================

// High-quality hash for film grain
fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ============================================================================
// Main Fragment Shader
// ============================================================================

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  var color: vec3f;

  // -- Step 1: Chromatic Aberration (sample before tone mapping for HDR) --
  let dist = uv - 0.5;

  if (uniforms.distortion > 0.001) {
    let offset = dist * uniforms.distortion;
    let r = textureSample(tDiffuse, texSampler, uv - offset).r;
    let g = textureSample(tDiffuse, texSampler, uv).g;
    let b = textureSample(tDiffuse, texSampler, uv + offset).b;
    color = vec3f(r, g, b);
  } else {
    color = textureSample(tDiffuse, texSampler, uv).rgb;
  }

  // -- Step 2: Tone Mapping (HDR -> LDR) --
  color = applyToneMapping(color, uniforms.toneMapping, uniforms.exposure);

  // -- Step 3: Vignette --
  let d = length(dist);
  let vignette = smoothstep(uniforms.vignetteOffset, uniforms.vignetteOffset - 0.6, d * uniforms.vignetteDarkness);
  color = color * vignette;

  // -- Step 4: Film Grain --
  if (uniforms.noiseIntensity > 0.001) {
    let t = fract(uniforms.time * 10.0);
    let p = floor(uv * uniforms.resolution);
    let noise = hash(p + t * 100.0) - 0.5;
    color = color + vec3f(noise * uniforms.noiseIntensity);
  }

  // Clamp to valid range
  color = max(color, vec3f(0.0));

  return vec4f(color, 1.0);
}
`

/**
 * WebGPU Combined Tone Mapping + Cinematic Pass.
 *
 * OPTIMIZATION: Single pass instead of two separate passes.
 * Saves ~2-3ms per frame by eliminating render target switch and texture fetch overhead.
 *
 * @example
 * ```typescript
 * const pass = new ToneMappingCinematicPass({
 *   colorInput: 'hdrColor',
 *   outputResource: 'ldrColor',
 *   toneMapping: ToneMappingMode.ACESFilmic,
 *   exposure: 1.0,
 *   aberration: 0.005,
 *   vignette: 1.2,
 *   grain: 0.05,
 * });
 * ```
 */
export class ToneMappingCinematicPass extends WebGPUBasePass {
  private passConfig: ToneMappingCinematicPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group layout (named to avoid base class conflict)
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null
  // PERF: Pre-allocated uniform buffers to avoid per-frame GC pressure
  private uniformArrayBuffer = new ArrayBuffer(48)
  private uniformFloatView = new Float32Array(this.uniformArrayBuffer)
  private uniformIntView = new Int32Array(this.uniformArrayBuffer)
  // PERF: Cached bind group to avoid per-frame GPU driver calls
  private cachedBindGroup: GPUBindGroup | null = null
  private cachedColorView: GPUTextureView | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Tone mapping settings
  private toneMapping: ToneMappingMode
  private exposure: number

  // Cinematic settings
  private aberration: number
  private vignette: number
  private vignetteOffset: number
  private grain: number

  constructor(config: ToneMappingCinematicPassConfig) {
    super({
      id: 'tonemapping-cinematic',
      priority: 900, // After HDR effects (bloom, frame-blending), before paper/AA
      inputs: [{ resourceId: config.colorInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config

    // Tone mapping settings
    this.toneMapping = config.toneMapping ?? ToneMappingMode.ACESFilmic
    this.exposure = config.exposure ?? 1.0

    // Cinematic settings
    this.aberration = config.aberration ?? 0.005
    this.vignette = config.vignette ?? 1.2
    this.vignetteOffset = 1.0
    this.grain = config.grain ?? 0.05
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'tonemapping-cinematic-bgl',
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
      TONEMAPPING_CINEMATIC_SHADER,
      'tonemapping-cinematic-fragment'
    )

    // Create pipeline - use rgba8unorm for LDR output buffer
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba8unorm',
      { label: 'tonemapping-cinematic' }
    )

    // Create uniform buffer (48 bytes = 12 floats, aligned to 16 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'tonemapping-cinematic-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'tonemapping-cinematic-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set tone mapping algorithm.
   * @param mode
   */
  setToneMapping(mode: ToneMappingMode): void {
    this.toneMapping = mode
  }

  /**
   * Set exposure value.
   * @param value
   */
  setExposure(value: number): void {
    this.exposure = value
  }

  /**
   * Set chromatic aberration intensity.
   * @param value
   */
  setAberration(value: number): void {
    this.aberration = value
  }

  /**
   * Set vignette darkness.
   * @param value
   */
  setVignette(value: number): void {
    this.vignette = value
  }

  /**
   * Set film grain intensity.
   * @param value
   */
  setGrain(value: number): void {
    this.grain = value
  }

  /**
   * Get current tone mapping settings.
   */
  getToneMappingSettings(): { toneMapping: ToneMappingMode; exposure: number } {
    return {
      toneMapping: this.toneMapping,
      exposure: this.exposure,
    }
  }


  /**
   * Update pass properties from Zustand stores.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const lighting = ctx.frame?.stores?.['lighting'] as {
      exposure?: number
      toneMappingEnabled?: boolean
      toneMappingAlgorithm?: string
    }
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      cinematicEnabled?: boolean
      cinematicVignette?: number
      cinematicAberration?: number
      cinematicGrain?: number
    }

    // Exposure from lighting store
    if (lighting?.exposure !== undefined) {
      this.exposure = lighting.exposure
    }

    // Tonemapping algorithm from lighting store
    // When toneMappingEnabled is false, use Linear mode (no curve, just clamp)
    if (lighting?.toneMappingEnabled === false) {
      this.toneMapping = ToneMappingMode.Linear
    } else if (lighting?.toneMappingAlgorithm !== undefined) {
      const mode = ALGORITHM_TO_MODE[lighting.toneMappingAlgorithm]
      if (mode !== undefined) {
        this.toneMapping = mode
      }
    }

    // Cinematic effects from postProcessing store
    // When cinematicEnabled is false, zero out all effects
    if (postProcessing?.cinematicEnabled === false) {
      this.aberration = 0
      this.vignette = 0
      this.grain = 0
    } else {
      if (postProcessing?.cinematicVignette !== undefined) {
        this.vignette = postProcessing.cinematicVignette
      }
      if (postProcessing?.cinematicAberration !== undefined) {
        this.aberration = postProcessing.cinematicAberration
      }
      if (postProcessing?.cinematicGrain !== undefined) {
        this.grain = postProcessing.cinematicGrain
      }
    }
  }

  /**
   * Execute the combined tone mapping + cinematic pass.
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

    // Update from stores
    this.updateFromStores(ctx)

    // Get input texture
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    if (!colorView) return

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Update uniforms
    // Struct layout:
    //   resolution: vec2f (offset 0, 8 bytes)
    //   time: f32 (offset 8, 4 bytes)
    //   toneMapping: i32 (offset 12, 4 bytes)
    //   exposure: f32 (offset 16, 4 bytes)
    //   distortion: f32 (offset 20, 4 bytes)
    //   vignetteDarkness: f32 (offset 24, 4 bytes)
    //   vignetteOffset: f32 (offset 28, 4 bytes)
    //   noiseIntensity: f32 (offset 32, 4 bytes)
    //   _pad0-2: f32 (offset 36-44, 12 bytes padding to 48)
    // PERF: Reuse pre-allocated uniform views
    const floatView = this.uniformFloatView
    const intView = this.uniformIntView

    floatView[0] = ctx.size.width
    floatView[1] = ctx.size.height
    // Use animation time (pauses with animation) instead of wall-clock time
    // to prevent film grain noise pattern from jittering when paused
    const animation = ctx.frame?.stores?.['animation'] as any
    floatView[2] = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    intView[3] = this.toneMapping // i32
    floatView[4] = this.exposure
    floatView[5] = this.aberration
    floatView[6] = this.vignette
    floatView[7] = this.vignetteOffset
    floatView[8] = this.grain
    // Padding floatView[9-11] already zeroed from ArrayBuffer init

    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformArrayBuffer)

    // PERF: Cache bind group, invalidate only when input texture view changes
    if (!this.cachedBindGroup || this.cachedColorView !== colorView) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'tonemapping-cinematic-bg',
        layout: this.passBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: colorView },
        ],
      })
      this.cachedColorView = colorView
    }
    const bindGroup = this.cachedBindGroup

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'tonemapping-cinematic-render',
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
    this.cachedBindGroup = null
    this.cachedColorView = null

    super.dispose()
  }
}
