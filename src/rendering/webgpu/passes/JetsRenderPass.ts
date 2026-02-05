/**
 * WebGPU Jets Render Pass (Volumetric Polar Jets)
 *
 * Renders black hole polar jets as volumetric cones using ray marching.
 * Uses John Chapman's "Good Enough Volumetrics" technique for soft, realistic jets.
 *
 * Key Features:
 * - Screen-space ray marching through volumetric cones
 * - Soft gaussian density falloff for wispy plasma appearance
 * - Hot white core fading to cooler edges
 * - Animated billowing turbulence using simplex noise
 * - Soft depth intersection for proper occlusion
 *
 * @module rendering/webgpu/passes/JetsRenderPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import { parseHexColorToLinearRgb, srgbToLinearChannel } from '../utils/color'

/**
 * Configuration for JetsRenderPass.
 */
export interface JetsRenderPassConfig {
  /** Scene depth texture for soft depth intersections */
  sceneDepthInput: string
  /** Output resource ID for jet color buffer */
  outputResource: string
  /** Initial jet color (hex) */
  jetColor?: number
  /** Initial jet intensity */
  jetIntensity?: number
  /** Initial jet height */
  jetHeight?: number
  /** Initial jet width */
  jetWidth?: number
}

/**
 * WGSL Jets Fragment Shader
 *
 * Ray marches through two volumetric cones (top and bottom jets)
 * and accumulates density with noise-based turbulence.
 */
const JETS_SHADER = /* wgsl */ `
struct Uniforms {
  // Camera matrices (16 floats each)
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  // Camera and jet parameters
  cameraPosition: vec3f,
  jetStartRadius: f32,
  jetColor: vec3f,
  jetIntensity: f32,
  resolution: vec2f,
  jetHeight: f32,
  jetWidth: f32,
  jetFalloff: f32,
  jetNoiseAmount: f32,
  jetPulsation: f32,
  time: f32,
  near: f32,
  far: f32,
  softDepthRange: f32,
  depthAvailable: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tSceneDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// =============================================================================
// Simplex Noise Implementation (3D)
// =============================================================================

fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute(x: vec4f) -> vec4f { return mod289_4(((x * 34.0) + 1.0) * x); }
fn taylorInvSqrt(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }

fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);

  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);

  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;

  i = mod289_3(i);
  let p = permute(permute(permute(
            i.z + vec4f(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4f(0.0, i1.x, i2.x, 1.0));

  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);

  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);

  let norm = taylorInvSqrt(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// =============================================================================
// Depth Functions
// =============================================================================

fn linearizeDepth(d: f32) -> f32 {
  let z = d * 2.0 - 1.0;
  return (2.0 * uniforms.near * uniforms.far) / (uniforms.far + uniforms.near - z * (uniforms.far - uniforms.near));
}

fn getSceneDepth(uv: vec2f) -> f32 {
  if (uniforms.depthAvailable < 0.5) {
    return 10000.0; // Very far if no depth
  }
  // Use textureLoad for unfilterable-float textures (cannot use textureSample)
  let depthDims = textureDimensions(tSceneDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  let depth = textureLoad(tSceneDepth, depthCoord, 0).r;
  if (depth < 0.001 || depth > 0.999) {
    return 10000.0;
  }
  return linearizeDepth(depth);
}

// =============================================================================
// Ray-Cone Intersection
// =============================================================================

// Intersect ray with infinite cone aligned along Y axis
// Returns (tNear, tFar) or (-1, -1) if no hit
// Cone apex at origin, axis along +Y, half-angle theta where tan(theta) = width
fn intersectCone(rayOrigin: vec3f, rayDir: vec3f, coneWidth: f32, coneHeight: f32, coneStartY: f32) -> vec2f {
  // Shift cone so apex is at coneStartY
  let ro = vec3f(rayOrigin.x, rayOrigin.y - coneStartY, rayOrigin.z);

  // For cone: x^2 + z^2 = (width * y)^2
  // Rearranged: x^2 + z^2 - (width^2) * y^2 = 0
  let w2 = coneWidth * coneWidth;

  let a = rayDir.x * rayDir.x + rayDir.z * rayDir.z - w2 * rayDir.y * rayDir.y;
  let b = 2.0 * (ro.x * rayDir.x + ro.z * rayDir.z - w2 * ro.y * rayDir.y);
  let c = ro.x * ro.x + ro.z * ro.z - w2 * ro.y * ro.y;

  let discriminant = b * b - 4.0 * a * c;

  if (discriminant < 0.0) {
    return vec2f(-1.0, -1.0);
  }

  let sqrtD = sqrt(discriminant);
  var t1 = (-b - sqrtD) / (2.0 * a);
  var t2 = (-b + sqrtD) / (2.0 * a);

  if (t1 > t2) {
    let temp = t1;
    t1 = t2;
    t2 = temp;
  }

  // Clamp to cone height (y from 0 to coneHeight)
  let y1 = ro.y + t1 * rayDir.y;
  let y2 = ro.y + t2 * rayDir.y;

  var tNear = t1;
  var tFar = t2;

  // Entry point check
  if (y1 < 0.0 || y1 > coneHeight) {
    // Ray enters outside valid range, find intersection with caps
    if (rayDir.y != 0.0) {
      let tBase = (0.0 - ro.y) / rayDir.y;
      let tTop = (coneHeight - ro.y) / rayDir.y;
      tNear = max(tNear, min(tBase, tTop));
    }
  }

  // Exit point check
  if (y2 < 0.0 || y2 > coneHeight) {
    if (rayDir.y != 0.0) {
      let tBase = (0.0 - ro.y) / rayDir.y;
      let tTop = (coneHeight - ro.y) / rayDir.y;
      tFar = min(tFar, max(tBase, tTop));
    }
  }

  if (tNear > tFar || tFar < 0.0) {
    return vec2f(-1.0, -1.0);
  }

  tNear = max(tNear, 0.0);
  return vec2f(tNear, tFar);
}

// =============================================================================
// Volumetric Jet Density
// =============================================================================

fn jetDensity(pos: vec3f, height: f32, coneWidth: f32, coneHeight: f32, isTop: bool) -> f32 {
  // Normalized height along the jet (0 at base, 1 at tip)
  var h: f32;
  if (isTop) {
    h = (pos.y - uniforms.jetStartRadius) / coneHeight;
  } else {
    h = (-pos.y - uniforms.jetStartRadius) / coneHeight;
  }

  if (h < 0.0 || h > 1.0) {
    return 0.0;
  }

  // Expected radius at this height
  let expectedRadius = h * coneWidth * coneHeight;
  let actualRadius = length(vec2f(pos.x, pos.z));

  // Gaussian radial falloff
  let radialDist = abs(actualRadius - expectedRadius) / max(expectedRadius, 0.1);
  let radialFalloff = exp(-radialDist * radialDist * 3.0);

  // Height-based fade (soft at base and tip)
  let baseFade = smoothstep(0.0, 0.1, h);
  let tipFade = 1.0 - smoothstep(0.7, 1.0, h);

  // Noise-based turbulence
  let t = uniforms.time;
  let noiseAmp = uniforms.jetNoiseAmount;

  // Flowing plasma streaks
  var noiseP = vec3f(pos.x * 2.0, h * 3.0 - t * 2.5, pos.z * 2.0);
  let flowNoise = snoise(noiseP * 0.8);
  let streaks = snoise(vec3f(radialDist * 5.0, h * 8.0 - t * 4.0, flowNoise)) * 0.5 + 0.5;

  // Plasma wave pulsation
  let plasmaWave = sin(h * 12.0 - t * 6.0) * 0.5 + 0.5;
  let pulsation = mix(1.0, plasmaWave, uniforms.jetPulsation);

  // Combine factors
  var density = radialFalloff;
  density *= baseFade * tipFade;
  density *= mix(0.6, 1.0, streaks * noiseAmp);
  density *= mix(0.7, 1.0, pulsation);

  return density;
}

// =============================================================================
// Main Fragment Shader
// =============================================================================

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Reconstruct ray from camera
  let ndcX = uv.x * 2.0 - 1.0;
  let ndcY = uv.y * 2.0 - 1.0;

  // Unproject to view space
  var clipPos = vec4f(ndcX, ndcY, 1.0, 1.0);
  var viewPos = uniforms.inverseProjectionMatrix * clipPos;
  viewPos /= viewPos.w;

  // Transform to world space ray direction
  let worldDir4 = uniforms.inverseViewMatrix * vec4f(viewPos.xyz, 0.0);
  let rayDir = normalize(worldDir4.xyz);
  let rayOrigin = uniforms.cameraPosition;

  // Get scene depth for soft occlusion
  let sceneDepth = getSceneDepth(uv);

  // Jet geometry parameters
  let coneWidth = uniforms.jetWidth;
  let coneHeight = uniforms.jetHeight;
  let startRadius = uniforms.jetStartRadius;

  // Accumulate color from both jets
  var totalColor = vec3f(0.0);
  var totalAlpha = 0.0;

  // Number of ray march samples
  let numSamples = 32;

  // ==========================================================================
  // Top Jet (positive Y)
  // ==========================================================================
  let tTop = intersectCone(rayOrigin, rayDir, coneWidth, coneHeight, startRadius);
  if (tTop.x >= 0.0) {
    let tNear = tTop.x;
    let tFar = min(tTop.y, sceneDepth);

    if (tFar > tNear) {
      let stepSize = (tFar - tNear) / f32(numSamples);
      var accumDensity = 0.0;
      var accumColor = vec3f(0.0);

      for (var i = 0; i < numSamples; i++) {
        let t = tNear + (f32(i) + 0.5) * stepSize;
        let samplePos = rayOrigin + rayDir * t;

        let density = jetDensity(samplePos, coneHeight, coneWidth, coneHeight, true);

        if (density > 0.001) {
          // Compute height-based color variation
          let h = (samplePos.y - startRadius) / coneHeight;
          let radialDist = length(vec2f(samplePos.x, samplePos.z)) / (h * coneWidth * coneHeight + 0.001);

          // Core brightness (brighter in center)
          let coreBrightness = exp(-radialDist * radialDist * 2.0);

          // Color: base jet color with white-hot core
          var sampleColor = uniforms.jetColor;
          sampleColor = mix(sampleColor, sampleColor + vec3f(0.3, 0.3, 0.4), coreBrightness * 0.5);

          // Accumulate using front-to-back compositing
          let alpha = density * stepSize * 2.0;
          accumColor += sampleColor * alpha * (1.0 - accumDensity);
          accumDensity += alpha * (1.0 - accumDensity);

          if (accumDensity > 0.95) {
            break;
          }
        }
      }

      totalColor += accumColor * uniforms.jetIntensity * 3.0;
      totalAlpha = max(totalAlpha, accumDensity * 0.4);
    }
  }

  // ==========================================================================
  // Bottom Jet (negative Y) - mirror of top jet
  // ==========================================================================
  // For bottom jet, we flip Y and use same logic
  let flippedOrigin = vec3f(rayOrigin.x, -rayOrigin.y, rayOrigin.z);
  let flippedDir = vec3f(rayDir.x, -rayDir.y, rayDir.z);

  let tBottom = intersectCone(flippedOrigin, flippedDir, coneWidth, coneHeight, startRadius);
  if (tBottom.x >= 0.0) {
    let tNear = tBottom.x;
    let tFar = min(tBottom.y, sceneDepth);

    if (tFar > tNear) {
      let stepSize = (tFar - tNear) / f32(numSamples);
      var accumDensity = 0.0;
      var accumColor = vec3f(0.0);

      for (var i = 0; i < numSamples; i++) {
        let t = tNear + (f32(i) + 0.5) * stepSize;
        let samplePos = flippedOrigin + flippedDir * t;

        let density = jetDensity(samplePos, coneHeight, coneWidth, coneHeight, true);

        if (density > 0.001) {
          let h = (samplePos.y - startRadius) / coneHeight;
          let radialDist = length(vec2f(samplePos.x, samplePos.z)) / (h * coneWidth * coneHeight + 0.001);

          let coreBrightness = exp(-radialDist * radialDist * 2.0);

          var sampleColor = uniforms.jetColor;
          sampleColor = mix(sampleColor, sampleColor + vec3f(0.3, 0.3, 0.4), coreBrightness * 0.5);

          let alpha = density * stepSize * 2.0;
          accumColor += sampleColor * alpha * (1.0 - accumDensity);
          accumDensity += alpha * (1.0 - accumDensity);

          if (accumDensity > 0.95) {
            break;
          }
        }
      }

      totalColor += accumColor * uniforms.jetIntensity * 3.0;
      totalAlpha = max(totalAlpha, accumDensity * 0.4);
    }
  }

  // Clamp alpha
  totalAlpha = min(totalAlpha, 0.6);

  // HDR-friendly output (allow values > 1.0 for bloom)
  return vec4f(totalColor, totalAlpha);
}
`

/**
 * WebGPU Jets Render Pass.
 *
 * Renders black hole polar jets as volumetric cones using screen-space ray marching.
 * The jets are rendered to a separate buffer for later compositing.
 */
export class JetsRenderPass extends WebGPUBasePass {
  private passConfig: JetsRenderPassConfig

  // Pipeline resources
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  // Default configuration values
  private jetColor: number
  private jetIntensity: number
  private jetHeight: number
  private jetWidth: number

  constructor(config: JetsRenderPassConfig) {
    super({
      id: 'jets-render',
      priority: 175, // After scene rendering, before composition
      inputs: [{ resourceId: config.sceneDepthInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.jetColor = config.jetColor ?? 0x3399ff
    this.jetIntensity = config.jetIntensity ?? 4.0
    this.jetHeight = config.jetHeight ?? 30.0
    this.jetWidth = config.jetWidth ?? 0.25
  }

  /**
   * Create the rendering pipeline.
   * @param ctx - WebGPU setup context
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'jets-render-bgl',
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
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, JETS_SHADER, 'jets-render-fragment')

    // Create pipeline with additive blending for proper jet accumulation
    // Use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      {
        label: 'jets-render',
        blendState: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one',
            operation: 'max',
          },
        },
      }
    )

    // Create uniform buffer
    // Size calculation:
    // - 4 mat4x4f = 4 * 64 = 256 bytes
    // - cameraPosition (vec3f) + jetStartRadius (f32) = 16 bytes
    // - jetColor (vec3f) + jetIntensity (f32) = 16 bytes
    // - resolution (vec2f) + jetHeight (f32) + jetWidth (f32) = 16 bytes
    // - jetFalloff (f32) + jetNoiseAmount (f32) + jetPulsation (f32) + time (f32) = 16 bytes
    // - near (f32) + far (f32) + softDepthRange (f32) + depthAvailable (f32) = 16 bytes
    // - padding (vec2f) = 8 bytes (aligned to 16)
    // Total: 256 + 16 + 16 + 16 + 16 + 16 + 16 = 352 bytes (rounded to 16-byte alignment)
    this.uniformBuffer = this.createUniformBuffer(device, 352, 'jets-render-uniforms')

    // Create sampler for depth texture
    this.sampler = device.createSampler({
      label: 'jets-render-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set jet color.
   * @param color - Hex color value
   */
  setJetColor(color: number): void {
    this.jetColor = color
  }

  /**
   * Set jet intensity.
   * @param intensity - Jet brightness multiplier
   */
  setJetIntensity(intensity: number): void {
    this.jetIntensity = intensity
  }

  /**
   * Set jet height.
   * @param height - Jet length in world units
   */
  setJetHeight(height: number): void {
    this.jetHeight = height
  }

  /**
   * Set jet width.
   * @param width - Jet cone half-angle tangent
   */
  setJetWidth(width: number): void {
    this.jetWidth = width
  }

  /**
   * Execute the jets render pass.
   * @param ctx - WebGPU render context
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

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Read settings from frozen frame context stores
    const frame = ctx.frame
    // Access blackhole settings via 'extended' store (blackHole is nested, not a separate store)
    const extended = frame?.stores?.['extended'] as { blackhole?: Record<string, unknown> } | undefined
    const blackHole = extended?.blackhole as
      | {
          jetsEnabled?: boolean
          jetsColor?: string | number
          jetsIntensity?: number
          jetsHeight?: number
          jetsWidth?: number
          jetsFalloff?: number
          jetsNoiseAmount?: number
          jetsPulsation?: number
          horizonRadius?: number
          spin?: number
          timeScale?: number
        }
      | undefined
    const geometry = frame?.stores?.['geometry'] as
      | {
          objectType?: string
        }
      | undefined
    const camera = frame?.stores?.['camera'] as
      | {
          viewMatrix?: { elements: number[] }
          projectionMatrix?: { elements: number[] }
          inverseViewMatrix?: { elements: number[] }
          inverseProjectionMatrix?: { elements: number[] }
          position?: { x: number; y: number; z: number }
          near?: number
          far?: number
        }
      | undefined

    // Begin render pass - always clear to black (transparent)
    const passEncoder = ctx.beginRenderPass({
      label: 'jets-render',
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })

    // Only render jets if blackhole type AND jets enabled
    if (
      !blackHole ||
      geometry?.objectType !== 'blackhole' ||
      !blackHole.jetsEnabled
    ) {
      passEncoder.end()
      return
    }

    // Get depth texture
    const depthView = ctx.getTextureView(this.passConfig.sceneDepthInput)
    const depthAvailable = depthView ? 1.0 : 0.0

    // Parse jet color
    let jetColorR = 0.2
    let jetColorG = 0.6
    let jetColorB = 1.0
    const colorValue = blackHole.jetsColor ?? this.jetColor
    if (typeof colorValue === 'number') {
      // Treat numeric colors as sRGB hex (matches Three.js Color.set()) and convert to linear.
      const srgbR = ((colorValue >> 16) & 0xff) / 255
      const srgbG = ((colorValue >> 8) & 0xff) / 255
      const srgbB = (colorValue & 0xff) / 255
      jetColorR = srgbToLinearChannel(srgbR)
      jetColorG = srgbToLinearChannel(srgbG)
      jetColorB = srgbToLinearChannel(srgbB)
    } else if (typeof colorValue === 'string') {
      const linear = parseHexColorToLinearRgb(colorValue, [jetColorR, jetColorG, jetColorB])
      jetColorR = linear[0]
      jetColorG = linear[1]
      jetColorB = linear[2]
    }

    // Calculate jet start radius based on black hole shadow radius
    // shadowRadius = 3√3 * M * sqrt(1 - chi²/4) ≈ 5.196 * M for Schwarzschild
    const horizonRadius = blackHole.horizonRadius ?? 1.0
    const spin = blackHole.spin ?? 0.0
    const M = horizonRadius / 2
    const spinFactor = Math.sqrt(1 - (spin * spin) / 4)
    const shadowRadius = 3 * Math.sqrt(3) * M * spinFactor
    const jetStartRadius = shadowRadius * 2.0

    // Animation time
    const timeScale = blackHole.timeScale ?? 1.0
    const time = (frame?.time ?? 0) * timeScale

    // Jet parameters
    const jetIntensity = blackHole.jetsIntensity ?? this.jetIntensity
    const jetHeight = blackHole.jetsHeight ?? this.jetHeight
    const jetWidth = blackHole.jetsWidth ?? this.jetWidth
    const jetFalloff = blackHole.jetsFalloff ?? 1.8
    const jetNoiseAmount = blackHole.jetsNoiseAmount ?? 0.7
    const jetPulsation = blackHole.jetsPulsation ?? 0.8

    // Camera parameters
    const near = camera?.near ?? 0.1
    const far = camera?.far ?? 1000

    // Update uniforms
    const data = new Float32Array(88) // 352 bytes / 4 = 88 floats

    // View matrix (offset 0, 16 floats)
    if (camera?.viewMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.viewMatrix.elements[i]
        if (value !== undefined) data[i] = value
      }
    }

    // Projection matrix (offset 16, 16 floats)
    if (camera?.projectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.projectionMatrix.elements[i]
        if (value !== undefined) data[16 + i] = value
      }
    }

    // Inverse view matrix (offset 32, 16 floats)
    if (camera?.inverseViewMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseViewMatrix.elements[i]
        if (value !== undefined) data[32 + i] = value
      }
    }

    // Inverse projection matrix (offset 48, 16 floats)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseProjectionMatrix.elements[i]
        if (value !== undefined) data[48 + i] = value
      }
    }

    // Camera position + jet start radius (offset 64, 4 floats)
    data[64] = camera?.position?.x ?? 0
    data[65] = camera?.position?.y ?? 0
    data[66] = camera?.position?.z ?? 10
    data[67] = jetStartRadius

    // Jet color + intensity (offset 68, 4 floats)
    data[68] = jetColorR
    data[69] = jetColorG
    data[70] = jetColorB
    data[71] = jetIntensity

    // Resolution + jet height + jet width (offset 72, 4 floats)
    data[72] = ctx.size.width
    data[73] = ctx.size.height
    data[74] = jetHeight
    data[75] = jetWidth

    // Jet falloff + noise + pulsation + time (offset 76, 4 floats)
    data[76] = jetFalloff
    data[77] = jetNoiseAmount
    data[78] = jetPulsation
    data[79] = time

    // Near + far + soft depth range + depth available (offset 80, 4 floats)
    data[80] = near
    data[81] = far
    data[82] = 1.0 // softDepthRange
    data[83] = depthAvailable

    // Padding (offset 84, 4 floats for alignment)
    // data[84-87] are padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // If no depth view, we need to skip rendering
    if (!depthView) {
      passEncoder.end()
      return
    }

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'jets-render-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: depthView },
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
