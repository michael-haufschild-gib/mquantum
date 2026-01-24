/**
 * WebGPU Screen-Space Lensing Pass
 *
 * Post-processing pass that applies gravitational lensing distortion
 * to the scene image. Uses hybrid approach:
 * - Screen-space distortion for nearby objects (walls, floor)
 * - Sky cubemap sampling with bent rays for distant background
 *
 * This pass is specifically designed for black hole visualization.
 * When a sky cubemap is provided, the shader reconstructs 3D ray directions
 * for background pixels and samples the cubemap with gravitationally bent rays.
 *
 * @module rendering/webgpu/passes/ScreenSpaceLensingPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for ScreenSpaceLensingPass.
 */
export interface ScreenSpaceLensingPassConfig {
  /** Input scene color texture resource ID */
  colorInput: string

  /** Input scene depth texture resource ID (optional - lensing works without depth) */
  depthInput?: string

  /** Output resource ID */
  outputResource: string

  /** Lensing intensity/strength (0-5, default: 1.0) */
  intensity?: number

  /** Lens mass parameter affecting distortion (0.1-10, default: 1.0) */
  mass?: number

  /** Distortion scale (0.1-5, default: 1.0) */
  distortionScale?: number

  /** Chromatic aberration amount (0-1, default: 0.5) */
  chromaticAberration?: number

  /** Black hole center X in UV space (0-1, default: 0.5) */
  centerX?: number

  /** Black hole center Y in UV space (0-1, default: 0.5) */
  centerY?: number

  /** Event horizon radius in UV space (0-1, default: 0.05) */
  horizonRadius?: number

  /** Distance falloff exponent (0.5-4, default: 1.5) */
  falloff?: number

  /** Enable hybrid sky cubemap sampling for background */
  hybridSkyEnabled?: boolean
}

/**
 * WGSL Screen-Space Lensing Fragment Shader
 *
 * Hybrid lensing shader that uses screen-space distortion for nearby objects
 * and sky cubemap sampling for distant background.
 */
const SCREEN_SPACE_LENSING_SHADER = /* wgsl */ `
struct Uniforms {
  blackHoleCenter: vec2f,       // Black hole center in UV space
  horizonRadius: f32,           // Event horizon radius in UV space
  intensity: f32,               // Lensing intensity (0-5)
  mass: f32,                    // Lens mass parameter (0.1-10)
  distortionScale: f32,         // Distortion scale (0.1-5)
  falloff: f32,                 // Distance falloff exponent (0.5-4)
  chromaticAberration: f32,     // Chromatic aberration amount (0-1)
  near: f32,                    // Camera near plane
  far: f32,                     // Camera far plane
  depthAvailable: f32,          // 1.0 if depth texture is available
  hybridSkyEnabled: f32,        // 1.0 if hybrid sky mode enabled
  skyCubemapAvailable: f32,     // 1.0 if sky cubemap is available
  resolution: vec2f,            // Screen resolution
  _pad: vec2f,                  // Padding for 16-byte alignment
  inverseViewProjection: mat4x4f, // Inverse view-projection matrix
  cameraPosition: vec3f,        // Camera world position
  _pad2: f32,                   // Padding
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tColor: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

/**
 * Compute radial distortion magnitude based on distance from center.
 * Uses gravitational lensing formula: deflection = strength / r^falloff
 *
 * The falloff exponent controls how lensing intensity changes with distance:
 * - Higher falloff (2.0-4.0): Effect concentrated near center, drops rapidly
 * - Lower falloff (0.5-1.0): Effect extends further from center, more gradual
 */
fn lensingMagnitude(r: f32) -> f32 {
  let safeR = max(r, 0.001);
  let strength = uniforms.intensity * uniforms.mass * uniforms.distortionScale * 0.02;
  let deflection = strength / pow(safeR, uniforms.falloff);
  return min(deflection, 0.5);
}

/**
 * Compute displacement vector for a UV coordinate.
 */
fn computeLensingDisplacement(uv: vec2f, center: vec2f) -> vec2f {
  let toCenter = center - uv;
  let r = length(toCenter);
  if (r < 0.01) {
    return vec2f(0.0);
  }
  let dir = normalize(toCenter);
  let mag = lensingMagnitude(r);
  return dir * mag;
}

/**
 * Reconstruct world ray direction from screen UV.
 */
fn getWorldRayDirection(uv: vec2f) -> vec3f {
  let ndc = uv * 2.0 - 1.0;
  let farClip = vec4f(ndc, 1.0, 1.0);
  var worldPos = uniforms.inverseViewProjection * farClip;
  worldPos = worldPos / worldPos.w;
  return normalize(worldPos.xyz - uniforms.cameraPosition);
}

/**
 * Bend a 3D ray direction toward black hole center.
 */
fn bendRay3D(rayDir: vec3f, center2D: vec2f) -> vec3f {
  let centerNDC = center2D * 2.0 - 1.0;
  let centerClip = vec4f(centerNDC, 0.0, 1.0);
  var centerWorld = uniforms.inverseViewProjection * centerClip;
  centerWorld = centerWorld / centerWorld.w;
  let centerDir = normalize(centerWorld.xyz - uniforms.cameraPosition);

  let cosAngle = dot(rayDir, centerDir);
  let angle = acos(clamp(cosAngle, -1.0, 1.0));

  let strength = uniforms.intensity * uniforms.mass * uniforms.distortionScale * 0.02;
  let safeAngle = max(angle, 0.001);
  var deflection = strength * 10.0 / pow(safeAngle * 10.0, uniforms.falloff);
  deflection = min(deflection, 0.5);

  let bentDir = mix(rayDir, centerDir, deflection);
  return normalize(bentDir);
}

/**
 * Apply chromatic aberration to lensing.
 */
fn applyLensingChromatic(uv: vec2f, displacement: vec2f) -> vec3f {
  let rScale = 1.0 - uniforms.chromaticAberration * 0.02;
  let gScale = 1.0;
  let bScale = 1.0 + uniforms.chromaticAberration * 0.02;

  let r = textureSample(tColor, texSampler, uv + displacement * rScale).r;
  let g = textureSample(tColor, texSampler, uv + displacement * gScale).g;
  let b = textureSample(tColor, texSampler, uv + displacement * bScale).b;

  return vec3f(r, g, b);
}

/**
 * Compute Einstein ring brightness boost.
 */
fn einsteinRingBoost(r: f32, ringRadius: f32, ringWidth: f32) -> f32 {
  let diff = abs(r - ringRadius);
  // Guard against zero ringWidth to prevent NaN
  let safeWidth = max(ringWidth, 0.001);
  let falloffVal = exp(-diff * diff / (safeWidth * safeWidth * 2.0));
  return 1.0 + falloffVal * 0.5;
}

/**
 * Linearize depth from depth buffer.
 * Returns linear depth value clamped to [near, far] range.
 */
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
  let z = depth * 2.0 - 1.0;
  let denominator = far + near - z * (far - near);
  // Guard against division by zero
  return (2.0 * near * far) / max(denominator, 0.0001);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Early exit if effect is disabled
  if (uniforms.intensity < 0.001) {
    return textureSample(tColor, texSampler, uv);
  }

  let displacement = computeLensingDisplacement(uv, uniforms.blackHoleCenter);

  let r = length(uv - uniforms.blackHoleCenter);

  // Sample depth for depth-aware distortion
  var depth: f32 = 1.0;
  var linearDepth: f32 = uniforms.far;
  var isSky: bool = true;

  if (uniforms.depthAvailable > 0.5) {
    depth = textureSample(tDepth, texSampler, uv).r;
    linearDepth = linearizeDepth(depth, uniforms.near, uniforms.far);
    isSky = depth > 0.99;
  }

  // NOTE: No 2D horizon black-out here!
  // The black hole raymarcher handles the event horizon correctly via volumetric absorption.

  var distortedUV = uv + displacement;
  distortedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));

  var depthFactor: f32;
  if (uniforms.depthAvailable > 0.5) {
    depthFactor = smoothstep(1.0, 10.0, linearDepth);
  } else {
    depthFactor = 1.0;
  }

  var color: vec3f;

  // Note: Hybrid sky cubemap sampling is not supported in this WebGPU version
  // since we don't have cubemap texture support in the bind group.
  // Screen-space distortion is applied instead.

  // =======================================================================
  // CRITICAL: Do NOT apply SSL distortion to the inner black hole region!
  // =======================================================================
  //
  // The raymarcher already handles gravitational lensing correctly for the
  // disk and horizon area. Applying SSL here causes:
  //
  // 1. BLACK BAND ARTIFACT: SSL samples horizon blackness and smears it
  //    onto the accretion disk, creating an ugly dark band.
  //
  // 2. DOUBLE LENSING: The raymarcher bends light correctly. SSL on top
  //    creates unrealistic "double vision" layering effects.
  //
  // 3. DESTROYS MOVIE LOOK: The "Interstellar" black hole aesthetic requires
  //    clean Einstein rings and smooth disk gradients. SSL interference
  //    makes this impossible to achieve.
  // =======================================================================
  let distFromCenter = length(uv - uniforms.blackHoleCenter);
  let innerRadius = uniforms.horizonRadius * 2.5;  // No SSL inside this radius
  let outerRadius = uniforms.horizonRadius * 3.5;  // Full SSL outside this radius
  let sslFactor = smoothstep(innerRadius, outerRadius, distFromCenter);

  let finalUV = mix(uv, distortedUV, depthFactor * sslFactor);

  if (uniforms.chromaticAberration > 0.01) {
    let finalDisplacement = displacement * depthFactor * sslFactor;
    color = applyLensingChromatic(uv, finalDisplacement);
  } else {
    color = textureSample(tColor, texSampler, finalUV).rgb;
  }

  let ringRadius = uniforms.horizonRadius * 1.5;
  let boost = einsteinRingBoost(r, ringRadius, uniforms.horizonRadius * 0.3);
  color = color * boost;

  return vec4f(color, 1.0);
}
`

/**
 * WebGPU Screen-Space Lensing Pass.
 *
 * Applies gravitational lensing distortion based on distance from
 * the black hole center. Uses depth buffer to distinguish between
 * nearby objects and distant sky.
 */
export class ScreenSpaceLensingPass extends WebGPUBasePass {
  private passConfig: ScreenSpaceLensingPassConfig

  // Pipeline resources
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private uniformBuffer: GPUBuffer | null = null
  private sampler: GPUSampler | null = null

  // Lensing parameters
  private blackHoleCenterX: number
  private blackHoleCenterY: number
  private horizonRadius: number
  private intensity: number
  private mass: number
  private distortionScale: number
  private falloff: number
  private chromaticAberration: number
  private hybridSkyEnabled: boolean

  // Matrices for world ray reconstruction
  private inverseViewProjection: Float32Array = new Float32Array(16)
  private cameraPosition: Float32Array = new Float32Array(3)

  constructor(config: ScreenSpaceLensingPassConfig) {
    // Build inputs list - depth is optional
    const inputs: { resourceId: string; access: 'read'; binding: number }[] = [
      { resourceId: config.colorInput, access: 'read' as const, binding: 0 },
    ]
    if (config.depthInput) {
      inputs.push({
        resourceId: config.depthInput,
        access: 'read' as const,
        binding: 1,
      })
    }

    super({
      id: 'screen-space-lensing',
      priority: 150, // After scene rendering, before other post-processing
      inputs,
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config

    // Initialize parameters
    this.blackHoleCenterX = config.centerX ?? 0.5
    this.blackHoleCenterY = config.centerY ?? 0.5
    this.horizonRadius = config.horizonRadius ?? 0.05
    this.intensity = config.intensity ?? 1.0
    this.mass = config.mass ?? 1.0
    this.distortionScale = config.distortionScale ?? 1.0
    this.falloff = config.falloff ?? 1.5
    this.chromaticAberration = config.chromaticAberration ?? 0.5
    this.hybridSkyEnabled = config.hybridSkyEnabled ?? true
  }

  /**
   * Create the rendering pipeline.
   * @param ctx - WebGPU setup context
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'screen-space-lensing-bgl',
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
    const fragmentModule = this.createShaderModule(
      device,
      SCREEN_SPACE_LENSING_SHADER,
      'screen-space-lensing-fragment'
    )

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'screen-space-lensing' }
    )

    // Create uniform buffer
    // Uniforms struct size: 32 (scalars) + 64 (mat4x4f) + 16 (cameraPosition + pad) = 112 bytes
    // Aligned to 16 bytes = 112 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 128, 'screen-space-lensing-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'screen-space-lensing-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  // === Parameter setters ===

  /**
   * Set black hole center in UV space (0 to 1, where 0.5, 0.5 is screen center).
   * @param x - X coordinate in UV space
   * @param y - Y coordinate in UV space
   */
  setBlackHoleCenter(x: number, y: number): void {
    this.blackHoleCenterX = x
    this.blackHoleCenterY = y
  }

  /**
   * Set black hole center (alias for setBlackHoleCenter).
   * @param x - X coordinate in UV space
   * @param y - Y coordinate in UV space
   */
  setCenter(x: number, y: number): void {
    this.blackHoleCenterX = x
    this.blackHoleCenterY = y
  }

  /**
   * Set event horizon radius in UV space.
   * @param radius - Horizon radius in UV space
   */
  setHorizonRadius(radius: number): void {
    this.horizonRadius = radius
  }

  /**
   * Set lensing intensity (0-5).
   * @param intensity - Lensing intensity value
   */
  setIntensity(intensity: number): void {
    this.intensity = intensity
  }

  /**
   * Set lens mass parameter (0.1-10).
   * @param mass - Lens mass value
   */
  setMass(mass: number): void {
    this.mass = mass
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const extended = ctx.frame?.stores?.['extended'] as {
      blackhole?: {
        mass?: number
        horizonRadius?: number
        lensingIntensity?: number
        lensingFalloff?: number
        lensingScale?: number
        chromaticAberration?: number
      }
    }

    if (extended?.blackhole?.mass !== undefined) {
      this.mass = extended.blackhole.mass
    }
    if (extended?.blackhole?.horizonRadius !== undefined) {
      this.horizonRadius = extended.blackhole.horizonRadius
    }
    if (extended?.blackhole?.lensingIntensity !== undefined) {
      this.intensity = extended.blackhole.lensingIntensity
    }
    if (extended?.blackhole?.lensingFalloff !== undefined) {
      this.falloff = extended.blackhole.lensingFalloff
    }
    if (extended?.blackhole?.lensingScale !== undefined) {
      this.distortionScale = extended.blackhole.lensingScale
    }
    if (extended?.blackhole?.chromaticAberration !== undefined) {
      this.chromaticAberration = extended.blackhole.chromaticAberration
    }
  }

  /**
   * Set distortion scale (0.1-5).
   * @param scale - Distortion scale value
   */
  setDistortionScale(scale: number): void {
    this.distortionScale = scale
  }

  /**
   * Set distance falloff exponent.
   * @param falloff - Distance falloff exponent value
   */
  setFalloff(falloff: number): void {
    this.falloff = falloff
  }

  /**
   * Set chromatic aberration amount (0-1).
   * @param amount - Chromatic aberration amount
   */
  setChromaticAberration(amount: number): void {
    this.chromaticAberration = amount
  }

  /**
   * Enable/disable hybrid sky cubemap sampling.
   * Note: This is a no-op in WebGPU version (cubemap not supported yet).
   * @param enabled - Whether to enable hybrid sky mode
   */
  setHybridSkyEnabled(enabled: boolean): void {
    this.hybridSkyEnabled = enabled
  }

  /**
   * Get current lensing parameters.
   * @returns Object containing all current lensing parameters
   */
  getParameters(): {
    blackHoleCenterX: number
    blackHoleCenterY: number
    horizonRadius: number
    intensity: number
    mass: number
    distortionScale: number
    falloff: number
    chromaticAberration: number
    hybridSkyEnabled: boolean
  } {
    return {
      blackHoleCenterX: this.blackHoleCenterX,
      blackHoleCenterY: this.blackHoleCenterY,
      horizonRadius: this.horizonRadius,
      intensity: this.intensity,
      mass: this.mass,
      distortionScale: this.distortionScale,
      falloff: this.falloff,
      chromaticAberration: this.chromaticAberration,
      hybridSkyEnabled: this.hybridSkyEnabled,
    }
  }

  /**
   * Execute the screen-space lensing pass.
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

    // Update from stores
    this.updateFromStores(ctx)

    // Get input textures
    const colorView = ctx.getTextureView(this.passConfig.colorInput)
    if (!colorView) {
      return
    }

    // Depth texture is optional
    const depthView = this.passConfig.depthInput
      ? ctx.getTextureView(this.passConfig.depthInput)
      : null

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) {
      return
    }

    // Read camera data from frozen frame context stores
    const camera = ctx.frame?.stores?.['camera'] as
      | {
          near?: number
          far?: number
          viewMatrix?: { elements: number[] }
          projectionMatrix?: { elements: number[] }
          position?: { x: number; y: number; z: number }
        }
      | undefined

    // Update camera matrices for world ray reconstruction
    const near = camera?.near ?? 0.1
    const far = camera?.far ?? 100.0

    // Compute inverse view-projection matrix
    if (camera?.viewMatrix?.elements && camera?.projectionMatrix?.elements) {
      const view = camera.viewMatrix.elements
      const proj = camera.projectionMatrix.elements

      // Compute view-projection matrix
      const vp = new Float32Array(16)
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          let sum = 0
          for (let k = 0; k < 4; k++) {
            sum += (proj[i + k * 4] ?? 0) * (view[k + j * 4] ?? 0)
          }
          vp[i + j * 4] = sum
        }
      }

      // Compute inverse
      this.invertMatrix4(vp, this.inverseViewProjection)
    } else {
      // Identity matrix as fallback
      this.inverseViewProjection.fill(0)
      this.inverseViewProjection[0] = 1
      this.inverseViewProjection[5] = 1
      this.inverseViewProjection[10] = 1
      this.inverseViewProjection[15] = 1
    }

    // Camera position
    if (camera?.position) {
      this.cameraPosition[0] = camera.position.x
      this.cameraPosition[1] = camera.position.y
      this.cameraPosition[2] = camera.position.z
    } else {
      this.cameraPosition.fill(0)
    }

    // Update uniforms
    // Layout matches WGSL struct:
    // vec2f blackHoleCenter (8 bytes, offset 0)
    // f32 horizonRadius (4 bytes, offset 8)
    // f32 intensity (4 bytes, offset 12)
    // f32 mass (4 bytes, offset 16)
    // f32 distortionScale (4 bytes, offset 20)
    // f32 falloff (4 bytes, offset 24)
    // f32 chromaticAberration (4 bytes, offset 28)
    // f32 near (4 bytes, offset 32)
    // f32 far (4 bytes, offset 36)
    // f32 depthAvailable (4 bytes, offset 40)
    // f32 hybridSkyEnabled (4 bytes, offset 44)
    // f32 skyCubemapAvailable (4 bytes, offset 48)
    // vec2f resolution (8 bytes, offset 52) - but needs 8-byte alignment, so offset 56
    // vec2f _pad (8 bytes, offset 64)
    // mat4x4f inverseViewProjection (64 bytes, offset 80) - needs 16-byte alignment
    // vec3f cameraPosition (12 bytes, offset 144)
    // f32 _pad2 (4 bytes, offset 156)
    // Total: 160 bytes

    const data = new Float32Array(40) // 160 bytes / 4 = 40 floats
    data[0] = this.blackHoleCenterX
    data[1] = this.blackHoleCenterY
    data[2] = this.horizonRadius
    data[3] = this.intensity
    data[4] = this.mass
    data[5] = this.distortionScale
    data[6] = this.falloff
    data[7] = this.chromaticAberration
    data[8] = near
    data[9] = far
    data[10] = depthView ? 1.0 : 0.0
    data[11] = this.hybridSkyEnabled ? 1.0 : 0.0
    data[12] = 0.0 // skyCubemapAvailable - always false in WebGPU version
    data[13] = 0.0 // padding to align resolution
    data[14] = ctx.size.width
    data[15] = ctx.size.height
    data[16] = 0.0 // _pad[0]
    data[17] = 0.0 // _pad[1]
    data[18] = 0.0 // padding for mat4 alignment
    data[19] = 0.0 // padding for mat4 alignment

    // mat4x4f inverseViewProjection at offset 80 (20 floats)
    for (let i = 0; i < 16; i++) {
      data[20 + i] = this.inverseViewProjection[i] ?? 0
    }

    // vec3f cameraPosition at offset 144 (36 floats)
    data[36] = this.cameraPosition[0] ?? 0
    data[37] = this.cameraPosition[1] ?? 0
    data[38] = this.cameraPosition[2] ?? 0
    data[39] = 0.0 // _pad2

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create or get a placeholder depth texture view if depth is not available
    let depthViewToUse = depthView
    if (!depthViewToUse) {
      // Create a 1x1 placeholder depth texture
      depthViewToUse = this.getPlaceholderDepthView(ctx.device)
    }

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'screen-space-lensing-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
        { binding: 3, resource: depthViewToUse },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'screen-space-lensing-render',
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

  // Placeholder depth texture for when depth is not available
  private placeholderDepthTexture: GPUTexture | null = null
  private placeholderDepthView: GPUTextureView | null = null

  /**
   * Get or create a placeholder depth texture view.
   * @param device - GPU device
   * @returns Placeholder depth texture view
   */
  private getPlaceholderDepthView(device: GPUDevice): GPUTextureView {
    if (!this.placeholderDepthView) {
      this.placeholderDepthTexture = device.createTexture({
        label: 'screen-space-lensing-placeholder-depth',
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'r32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })

      // Write far depth value (1.0)
      const depthData = new Float32Array([1.0])
      device.queue.writeTexture(
        { texture: this.placeholderDepthTexture },
        depthData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 }
      )

      this.placeholderDepthView = this.placeholderDepthTexture.createView({
        label: 'screen-space-lensing-placeholder-depth-view',
      })
    }

    return this.placeholderDepthView
  }

  /**
   * Invert a 4x4 matrix.
   * @param m - Input matrix (16 floats)
   * @param out - Output inverted matrix (16 floats)
   */
  private invertMatrix4(m: Float32Array, out: Float32Array): void {
    const m00 = m[0]!,
      m01 = m[1]!,
      m02 = m[2]!,
      m03 = m[3]!
    const m10 = m[4]!,
      m11 = m[5]!,
      m12 = m[6]!,
      m13 = m[7]!
    const m20 = m[8]!,
      m21 = m[9]!,
      m22 = m[10]!,
      m23 = m[11]!
    const m30 = m[12]!,
      m31 = m[13]!,
      m32 = m[14]!,
      m33 = m[15]!

    const b00 = m00 * m11 - m01 * m10
    const b01 = m00 * m12 - m02 * m10
    const b02 = m00 * m13 - m03 * m10
    const b03 = m01 * m12 - m02 * m11
    const b04 = m01 * m13 - m03 * m11
    const b05 = m02 * m13 - m03 * m12
    const b06 = m20 * m31 - m21 * m30
    const b07 = m20 * m32 - m22 * m30
    const b08 = m20 * m33 - m23 * m30
    const b09 = m21 * m32 - m22 * m31
    const b10 = m21 * m33 - m23 * m31
    const b11 = m22 * m33 - m23 * m32

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06

    if (Math.abs(det) < 1e-10) {
      // Non-invertible, return identity
      out.fill(0)
      out[0] = 1
      out[5] = 1
      out[10] = 1
      out[15] = 1
      return
    }

    det = 1.0 / det

    out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det
    out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det
    out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det
    out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det
    out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det
    out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det
    out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det
    out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det
    out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det
    out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det
    out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det
    out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det
    out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det
    out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det
    out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det
    out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det
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
    this.placeholderDepthTexture?.destroy()
    this.placeholderDepthTexture = null
    this.placeholderDepthView = null

    super.dispose()
  }
}
