/**
 * WebGPU Gravitational Lensing Pass
 *
 * Applies gravitational lensing distortion to the environment layer only.
 * The gravity well is assumed to be at world origin (0,0,0), projected to screen space.
 * This pass is independent of the black hole's internal ray-marched lensing.
 *
 * Unlike ScreenSpaceLensingPass, this pass:
 * - Only distorts the environment (walls, skybox)
 * - Uses global gravity settings from the post-processing store
 * - Has no inner region protection (not needed for environment-only rendering)
 *
 * @module rendering/webgpu/passes/GravitationalLensingPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for GravitationalLensingPass.
 */
export interface GravitationalLensingPassConfig {
  /** Input environment color texture resource ID */
  environmentInput: string
  /** Output resource ID */
  outputResource: string
  /** Initial gravity strength (0.1-10) */
  strength?: number
  /** Initial distortion scale (0.1-5) */
  distortionScale?: number
  /** Chromatic aberration amount (0-1) */
  chromaticAberration?: number
}

/**
 * WGSL Gravitational Lensing Fragment Shader
 */
const GRAVITATIONAL_LENSING_SHADER = /* wgsl */ `
struct Uniforms {
  gravityCenter: vec2f,      // Gravity well center in UV space (projected from world origin)
  strength: f32,             // Gravity strength (0.1-10)
  distortionScale: f32,      // Distortion scale (0.1-5)
  falloff: f32,              // Distance falloff exponent (N-1 in N dimensions)
  chromaticAberration: f32,  // Chromatic aberration amount (0-1)
  ndScale: f32,              // N-D scale factor for higher dimensions
  apparentHorizonRadius: f32, // Apparent horizon radius in UV space
  blackHoleGravity: f32,     // Black hole gravity multiplier
  aspectRatio: f32,          // Screen aspect ratio (width / height)
  _pad: vec2f,               // Padding for 16-byte alignment
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tEnvironment: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Early-exit thresholds
const DEFLECTION_THRESHOLD: f32 = 0.001;
const MIN_EFFECTIVE_STRENGTH: f32 = 0.01;

/**
 * Compute displacement vector for a UV coordinate toward the gravity center.
 * Uses pre-computed magnitude to avoid redundant calculation.
 */
fn computeLensingDisplacementOptimized(
  toCenter: vec2f,
  toCenterCorrected: vec2f,
  r: f32,
  magnitude: f32,
  aspectRatio: f32
) -> vec2f {
  if (r < 0.001) {
    return vec2f(0.0);
  }
  // Compute direction in corrected (square) space
  let dirCorrected = toCenterCorrected / r;
  // Convert displacement back to UV space by dividing X by aspect ratio
  let dirUV = vec2f(dirCorrected.x / aspectRatio, dirCorrected.y);
  return dirUV * magnitude;
}

/**
 * Apply chromatic aberration to lensing by sampling RGB at different offsets.
 * Uses textureSampleLevel with explicit LOD 0.0 to allow non-uniform control flow.
 */
fn applyLensingChromatic(uv: vec2f, displacement: vec2f) -> vec3f {
  let rScale = 1.0 - uniforms.chromaticAberration * 0.02;
  let gScale = 1.0;
  let bScale = 1.0 + uniforms.chromaticAberration * 0.02;

  let r = textureSampleLevel(tEnvironment, texSampler, uv + displacement * rScale, 0.0).r;
  let g = textureSampleLevel(tEnvironment, texSampler, uv + displacement * gScale, 0.0).g;
  let b = textureSampleLevel(tEnvironment, texSampler, uv + displacement * bScale, 0.0).b;

  return vec3f(r, g, b);
}

/**
 * Compute Einstein ring brightness boost near the photon sphere.
 */
fn einsteinRingBoost(r: f32, ringRadius: f32) -> f32 {
  let ringWidth = ringRadius * 0.3;
  let diff = abs(r - ringRadius);
  let safeWidth = max(ringWidth, 0.001);

  // Lorentzian approximation 1/(1+x^2) instead of expensive exp()
  let x = diff / safeWidth;
  let falloffVal = 1.0 / (1.0 + x * x);

  return 1.0 + falloffVal * 0.3;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Compute effective strength combining post-processing and black hole gravity settings
  let effectiveStrength = uniforms.strength * uniforms.distortionScale;

  // Early exit 1: Effect globally disabled or negligible
  // Use textureSampleLevel with explicit LOD to allow non-uniform control flow
  if (effectiveStrength < MIN_EFFECTIVE_STRENGTH) {
    return textureSampleLevel(tEnvironment, texSampler, uv, 0.0);
  }

  // Compute distance from gravity center
  // Apply aspect ratio correction so lensing is circular, not elliptical
  let toCenter = uniforms.gravityCenter - uv;
  let toCenterCorrected = vec2f(toCenter.x * uniforms.aspectRatio, toCenter.y);
  let r = length(toCenterCorrected);
  let safeR = max(r, 0.001);

  // Compute lensing magnitude (deflection) for early-exit check
  let baseCoeff = 0.02;
  let gravityMod = sqrt(max(uniforms.blackHoleGravity, 0.1));
  var zoomMod = sqrt(uniforms.apparentHorizonRadius / 0.1);
  zoomMod = clamp(zoomMod, 0.5, 2.0);

  var deflection = effectiveStrength * baseCoeff * gravityMod * zoomMod * uniforms.ndScale;

  // Optimized falloff calculation for common integer values
  let falloff = uniforms.falloff;
  if (abs(falloff - 2.0) < 0.01) {
    deflection = deflection / (safeR * safeR);
  } else if (abs(falloff - 1.0) < 0.01) {
    deflection = deflection / safeR;
  } else {
    deflection = deflection / pow(safeR, falloff);
  }

  deflection = min(deflection, 0.5); // Clamp to prevent extreme distortion

  // Early exit 2: Deflection is sub-pixel, no visible effect
  if (deflection < DEFLECTION_THRESHOLD) {
    return textureSampleLevel(tEnvironment, texSampler, uv, 0.0);
  }

  // Full lensing computation using pre-computed magnitude
  let displacement = computeLensingDisplacementOptimized(toCenter, toCenterCorrected, r, deflection, uniforms.aspectRatio);
  var distortedUV = uv + displacement;

  // Clamp to valid UV range
  distortedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));

  var color: vec3f;

  if (uniforms.chromaticAberration > 0.01) {
    color = applyLensingChromatic(uv, displacement);
  } else {
    color = textureSampleLevel(tEnvironment, texSampler, distortedUV, 0.0).rgb;
  }

  // Apply subtle Einstein ring boost
  var ringRadius = 0.15 * sqrt(uniforms.apparentHorizonRadius / 0.1);
  ringRadius = clamp(ringRadius, 0.05, 0.4);
  let boost = einsteinRingBoost(r, ringRadius);
  color = color * boost;

  // Preserve alpha from original texture
  let alpha = textureSampleLevel(tEnvironment, texSampler, uv, 0.0).a;
  return vec4f(color, alpha);
}
`

/**
 * WebGPU Gravitational Lensing Pass.
 *
 * Reads gravity settings from the frozen frame context and applies
 * gravitational distortion to the environment buffer.
 */
export class GravitationalLensingPass extends WebGPUBasePass {
  private passConfig: GravitationalLensingPassConfig

  // Pipeline resources
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  // Default configuration values
  private strength: number
  private distortionScale: number
  private chromaticAberration: number

  constructor(config: GravitationalLensingPassConfig) {
    super({
      id: 'gravitational-lensing',
      priority: 155, // After environment rendering, before other post-processing
      inputs: [{ resourceId: config.environmentInput, access: 'read' as const, binding: 0 }],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.strength = config.strength ?? 1.0
    this.distortionScale = config.distortionScale ?? 1.0
    this.chromaticAberration = config.chromaticAberration ?? 0.0
  }

  /**
   * Create the rendering pipeline.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'gravitational-lensing-bgl',
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
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(
      device,
      GRAVITATIONAL_LENSING_SHADER,
      'gravitational-lensing-fragment'
    )

    // Create pipeline - use rgba16float for HDR intermediate output
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      'rgba16float',
      { label: 'gravitational-lensing' }
    )

    // Create uniform buffer (48 bytes = 12 floats, aligned to 16 bytes)
    this.uniformBuffer = this.createUniformBuffer(device, 48, 'gravitational-lensing-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'gravitational-lensing-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set gravity strength.
   * @param value
   */
  setStrength(value: number): void {
    this.strength = value
  }

  /**
   * Set distortion scale.
   * @param value
   */
  setDistortionScale(value: number): void {
    this.distortionScale = value
  }

  /**
   * Set chromatic aberration amount.
   * @param value
   */
  setChromaticAberration(value: number): void {
    this.chromaticAberration = value
  }


  /**
   * Update pass properties from Zustand stores.
   * Reads from postProcessing store (gravity* fields), same as WebGL.
   * @param ctx
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const pp = ctx.frame?.stores?.['postProcessing'] as {
      gravityStrength?: number
      gravityDistortionScale?: number
      gravityChromaticAberration?: number
    }

    if (pp?.gravityStrength !== undefined) {
      this.strength = pp.gravityStrength
    }
    if (pp?.gravityDistortionScale !== undefined) {
      this.distortionScale = pp.gravityDistortionScale
    }
    if (pp?.gravityChromaticAberration !== undefined) {
      this.chromaticAberration = pp.gravityChromaticAberration
    }
  }

  /**
   * Execute the gravitational lensing pass.
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
    const environmentView = ctx.getTextureView(this.passConfig.environmentInput)
    if (!environmentView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) {
      return
    }

    // Read settings from frozen frame context stores
    const frame = ctx.frame
    const pp = frame?.stores?.['postProcessing'] as
      | {
          gravityStrength?: number
          gravityDistortionScale?: number
          gravityChromaticAberration?: number
        }
      | undefined
    const geo = frame?.stores?.['geometry'] as
      | {
          dimension?: number
        }
      | undefined
    // Access blackhole settings via 'extended' store (blackHole is nested, not a separate store)
    const extendedForBh = frame?.stores?.['extended'] as { blackhole?: Record<string, unknown> } | undefined
    const bh = extendedForBh?.blackhole as
      | {
          horizonRadius?: number
          gravityStrength?: number
          bendScale?: number
        }
      | undefined
    const camera = frame?.stores?.['camera'] as
      | {
          fov?: number
          position?: { x: number; y: number; z: number }
          viewMatrix?: { elements: number[] }
          projectionMatrix?: { elements: number[] }
          top?: number
          bottom?: number
          isPerspective?: boolean
        }
      | undefined

    // Post-processing gravity settings
    const strength = pp?.gravityStrength ?? this.strength
    const distortionScale = pp?.gravityDistortionScale ?? this.distortionScale
    const chromaticAberration = pp?.gravityChromaticAberration ?? this.chromaticAberration

    // Black hole gravity settings
    const horizonRadius = bh?.horizonRadius ?? 1.0
    const bhGravityStrength = bh?.gravityStrength ?? 1.0
    const bhBendScale = bh?.bendScale ?? 1.0
    const blackHoleGravity = bhGravityStrength * bhBendScale

    // N-Dimensional physics: compute proper falloff and scale from dimension
    const dimension = geo?.dimension ?? 3
    const ndFalloff = dimension - 1 // N-D gravity falloff exponent
    const ndScale = dimension > 3 ? Math.pow(3.0, dimension - 3) : 1.0

    // Compute gravity center and apparent horizon radius
    let gravityCenterX = 0.5
    let gravityCenterY = 0.5
    let apparentHorizonRadiusUV = 0.1

    // Project world origin to screen space for gravity center
    if (camera?.viewMatrix?.elements && camera?.projectionMatrix?.elements) {
      // Transform world origin (0,0,0) through view and projection matrices
      const view = camera.viewMatrix.elements
      const proj = camera.projectionMatrix.elements

      // viewPos = viewMatrix * (0,0,0,1) = last column of view matrix
      const viewX = view[12] ?? 0
      const viewY = view[13] ?? 0
      const viewZ = view[14] ?? 0
      const viewW = view[15] ?? 1

      // clipPos = projectionMatrix * viewPos
      const clipX =
        (proj[0] ?? 1) * viewX +
        (proj[4] ?? 0) * viewY +
        (proj[8] ?? 0) * viewZ +
        (proj[12] ?? 0) * viewW
      const clipY =
        (proj[1] ?? 0) * viewX +
        (proj[5] ?? 1) * viewY +
        (proj[9] ?? 0) * viewZ +
        (proj[13] ?? 0) * viewW
      const clipW =
        (proj[3] ?? 0) * viewX +
        (proj[7] ?? 0) * viewY +
        (proj[11] ?? -1) * viewZ +
        (proj[15] ?? 0) * viewW

      // NDC coordinates
      if (Math.abs(clipW) > 0.0001) {
        const ndcX = clipX / clipW
        const ndcY = clipY / clipW

        // Convert from NDC (-1 to 1) to UV (0 to 1)
        gravityCenterX = (ndcX + 1) * 0.5
        // WebGPU UV convention: Y=0 is top, Y=1 is bottom (opposite of WebGL)
        gravityCenterY = (1.0 - ndcY) * 0.5
      }

      // Calculate apparent horizon radius for zoom scaling
      if (camera.isPerspective !== false && camera.fov && camera.position) {
        const cameraDistance = Math.sqrt(
          camera.position.x * camera.position.x +
            camera.position.y * camera.position.y +
            camera.position.z * camera.position.z
        )
        if (cameraDistance > 0.001) {
          const vFov = camera.fov * (Math.PI / 180)
          apparentHorizonRadiusUV = horizonRadius / (cameraDistance * Math.tan(vFov / 2))
        }
      } else if (camera.top !== undefined && camera.bottom !== undefined) {
        // Orthographic camera
        const viewHeight = camera.top - camera.bottom
        if (viewHeight > 0.001) {
          apparentHorizonRadiusUV = horizonRadius / viewHeight
        }
      }
    }

    // Clamp apparent radius to reasonable range
    apparentHorizonRadiusUV = Math.max(0.005, Math.min(0.8, apparentHorizonRadiusUV))

    // Compute aspect ratio
    const aspectRatio = ctx.size.width / ctx.size.height

    // Update uniforms
    const data = new Float32Array(12)
    data[0] = gravityCenterX
    data[1] = gravityCenterY
    data[2] = strength
    data[3] = distortionScale
    data[4] = ndFalloff
    data[5] = chromaticAberration
    data[6] = ndScale
    data[7] = apparentHorizonRadiusUV
    data[8] = blackHoleGravity
    data[9] = aspectRatio
    // data[10], data[11] are padding

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'gravitational-lensing-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: environmentView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'gravitational-lensing-render',
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
