/**
 * WebGPU Refraction Pass (Screen-Space Refraction)
 *
 * Distorts the scene based on surface normals to simulate refraction.
 * Supports chromatic aberration for a more physically accurate effect.
 *
 * Algorithm:
 * 1. Sample normal from G-buffer (or reconstruct from depth)
 * 2. Calculate UV offset based on normal and IOR
 * 3. Optional: chromatic aberration (sample R/G/B at different offsets)
 * 4. Sample color at offset UV
 *
 * @module rendering/webgpu/passes/RefractionPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Refraction pass configuration.
 */
export interface RefractionPassConfig {
  /** Color input resource ID */
  colorInput: string
  /** Normal buffer input resource ID */
  normalInput: string
  /** Depth buffer input resource ID */
  depthInput: string
  /** Output resource ID */
  outputResource: string
  /** Index of refraction (1.0 = no refraction, 1.5 = glass) */
  ior?: number
  /** Refraction strength multiplier */
  strength?: number
  /** Chromatic aberration amount */
  chromaticAberration?: number
}

/**
 * WGSL Refraction Fragment Shader
 */
const REFRACTION_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  ior: f32,
  strength: f32,
  chromaticAberration: f32,
  nearClip: f32,
  farClip: f32,
  _pad: f32,
  invProjMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;
@group(0) @binding(3) var tNormal: texture_2d<f32>;
@group(0) @binding(4) var tDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Get view-space position from UV and depth
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
  let clipPos = vec4f(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  var viewPos = uniforms.invProjMatrix * clipPos;
  // Guard against w=0
  let safeW = select(viewPos.w, 0.0001, abs(viewPos.w) < 0.0001);
  return viewPos.xyz / safeW;
}

// Reconstruct VIEW-SPACE normal from depth buffer
// Uses neighboring depth samples to compute view-space positions,
// then calculates the surface normal from the cross product of tangent vectors
fn reconstructNormal(coord: vec2f) -> vec3f {
  let texel = 1.0 / uniforms.resolution;

  // Sample depth at center and neighboring pixels
  // In WebGPU: V=0 is bottom, V=1 is top
  let depthC = textureSample(tDepth, texSampler, coord).x;
  let depthL = textureSample(tDepth, texSampler, coord - vec2f(texel.x, 0.0)).x;
  let depthR = textureSample(tDepth, texSampler, coord + vec2f(texel.x, 0.0)).x;
  let depthB = textureSample(tDepth, texSampler, coord - vec2f(0.0, texel.y)).x;
  let depthT = textureSample(tDepth, texSampler, coord + vec2f(0.0, texel.y)).x;

  // Reconstruct view-space positions
  let posC = getViewPosition(coord, depthC);
  let posL = getViewPosition(coord - vec2f(texel.x, 0.0), depthL);
  let posR = getViewPosition(coord + vec2f(texel.x, 0.0), depthR);
  let posB = getViewPosition(coord - vec2f(0.0, texel.y), depthB);
  let posT = getViewPosition(coord + vec2f(0.0, texel.y), depthT);

  // Calculate tangent vectors using central differences for better accuracy
  // Use the smaller difference to avoid artifacts at depth discontinuities
  let ddx = select(posR - posC, posC - posL, abs(posR.z - posC.z) < abs(posC.z - posL.z));
  let ddy = select(posT - posC, posC - posB, abs(posT.z - posC.z) < abs(posC.z - posB.z));

  // Cross product gives the surface normal in view space
  let crossProd = cross(ddy, ddx);
  let crossLen = length(crossProd);
  // Guard against zero-length cross product
  let normal = select(vec3f(0.0, 0.0, 1.0), crossProd / crossLen, crossLen > 0.0001);

  return normal;
}

// Get normal from G-buffer (encoded as RGB = normal * 0.5 + 0.5)
// Falls back to depth reconstruction if normal buffer not available
fn getNormal(coord: vec2f) -> vec3f {
  let normalData = textureSample(tNormal, texSampler, coord);

  // Check if we have valid normal data (non-zero alpha or valid RGB)
  if (length(normalData.rgb) > 0.01) {
    let decoded = normalData.rgb * 2.0 - 1.0;
    let decodedLen = length(decoded);
    // Guard against zero-length normal
    return select(vec3f(0.0, 0.0, 1.0), decoded / decodedLen, decodedLen > 0.0001);
  }

  // Fallback: reconstruct from depth
  return reconstructNormal(coord);
}

// Check if this pixel has valid G-buffer data (not background)
fn hasGBufferData(coord: vec2f) -> bool {
  let depth = textureSample(tDepth, texSampler, coord).x;
  return depth < 0.9999;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Early exit if no G-buffer data at this pixel
  if (!hasGBufferData(uv)) {
    return textureSample(tDiffuse, texSampler, uv);
  }

  // Sample normal
  let normal = getNormal(uv);

  // Calculate refraction offset based on normal deviation from camera-facing
  // Normal facing camera = (0, 0, 1) in view space, deviation causes distortion
  let normalXY = normal.xy;

  // IOR affects the amount of bending
  // IOR > 1 means light bends toward the normal when entering the material
  let iorEffect = (uniforms.ior - 1.0) * 2.0;

  // Base offset from normal
  var offset = normalXY * uniforms.strength * iorEffect;

  // Adjust for aspect ratio
  offset.x *= uniforms.resolution.y / uniforms.resolution.x;

  if (uniforms.chromaticAberration > 0.0) {
    // Chromatic aberration: sample R, G, B at different offsets
    // Red bends less, blue bends more (matches real-world dispersion)
    // Scale by 0.3 to make effect visible while keeping it subtle at low values
    let caOffset = uniforms.chromaticAberration * 0.3;

    let offsetR = offset * (1.0 - caOffset);
    let offsetG = offset;
    let offsetB = offset * (1.0 + caOffset);

    // Clamp UVs to prevent sampling outside texture
    let uvR = clamp(uv + offsetR, vec2f(0.0), vec2f(1.0));
    let uvG = clamp(uv + offsetG, vec2f(0.0), vec2f(1.0));
    let uvB = clamp(uv + offsetB, vec2f(0.0), vec2f(1.0));

    let r = textureSample(tDiffuse, texSampler, uvR).r;
    let g = textureSample(tDiffuse, texSampler, uvG).g;
    let b = textureSample(tDiffuse, texSampler, uvB).b;

    return vec4f(r, g, b, 1.0);
  } else {
    // No chromatic aberration - simple offset
    let refractedUV = clamp(uv + offset, vec2f(0.0), vec2f(1.0));
    return textureSample(tDiffuse, texSampler, refractedUV);
  }
}
`

/**
 * WebGPU Refraction Pass.
 *
 * Applies screen-space refraction based on surface normals.
 * Supports chromatic aberration for more realistic optical effects.
 *
 * @example
 * ```typescript
 * const refractionPass = new RefractionPass({
 *   colorInput: 'sceneColor',
 *   normalInput: 'normalBuffer',
 *   depthInput: 'sceneDepth',
 *   outputResource: 'refractedOutput',
 *   ior: 1.3,
 *   strength: 0.5,
 *   chromaticAberration: 0.02,
 * });
 * ```
 */
export class RefractionPass extends WebGPUBasePass {
  private passConfig: RefractionPassConfig

  // Pipeline
  private renderPipeline: GPURenderPipeline | null = null

  // Bind group
  private passBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffer
  private uniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Configuration
  private ior: number
  private strength: number
  private chromaticAberration: number

  constructor(config: RefractionPassConfig) {
    super({
      id: 'refraction',
      priority: 155, // After SSR (160), before Bokeh (180)
      inputs: [
        { resourceId: config.colorInput, access: 'read' as const, binding: 0 },
        { resourceId: config.normalInput, access: 'read' as const, binding: 1 },
        { resourceId: config.depthInput, access: 'read' as const, binding: 2 },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' as const, binding: 0 }],
    })

    this.passConfig = config
    this.ior = config.ior ?? 1.3
    this.strength = config.strength ?? 0.5
    this.chromaticAberration = config.chromaticAberration ?? 0.02
  }

  /**
   * Create the rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Create bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'refraction-bgl',
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
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' as const },
        },
      ],
    })

    // Create fragment shader module
    const fragmentModule = this.createShaderModule(device, REFRACTION_SHADER, 'refraction-fragment')

    // Create pipeline
    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      { label: 'refraction' }
    )

    // Create uniform buffer (aligned to 16 bytes)
    // Uniforms: resolution(8) + ior(4) + strength(4) + chromaticAberration(4) + nearClip(4) + farClip(4) + pad(4) + invProjMatrix(64) = 96 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 96, 'refraction-uniforms')

    // Create sampler
    this.sampler = device.createSampler({
      label: 'refraction-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Set index of refraction.
   * @param value IOR value (1.0 = no refraction, 1.5 = glass)
   */
  setIOR(value: number): void {
    this.ior = value
  }

  /**
   * Set refraction strength.
   * @param value Strength multiplier
   */
  setStrength(value: number): void {
    this.strength = value
  }


  /**
   * Update pass properties from Zustand stores.
   */
  private updateFromStores(ctx: WebGPURenderContext): void {
    const postProcessing = ctx.frame?.stores?.['postProcessing'] as {
      refractionStrength?: number
      refractionIOR?: number
      refractionChromaticAberration?: number
    }

    if (postProcessing?.refractionStrength !== undefined) {
      this.strength = postProcessing.refractionStrength
    }
    if (postProcessing?.refractionIOR !== undefined) {
      this.ior = postProcessing.refractionIOR
    }
    if (postProcessing?.refractionChromaticAberration !== undefined) {
      this.chromaticAberration = postProcessing.refractionChromaticAberration
    }
  }

  /**
   * Set chromatic aberration amount.
   * @param value Chromatic aberration (0 = none)
   */
  setChromaticAberration(value: number): void {
    this.chromaticAberration = value
  }

  /**
   * Execute the refraction pass.
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
    const normalView = ctx.getTextureView(this.passConfig.normalInput)
    const depthView = ctx.getTextureView(this.passConfig.depthInput)

    if (!colorView || !normalView || !depthView) {
      return
    }

    // Get output target
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    // Get camera data
    const camera = ctx.frame?.stores?.['camera'] as {
      near?: number
      far?: number
      inverseProjectionMatrix?: { elements: number[] }
    }

    // Update uniforms
    // Layout: vec2f(8) + f32(4) + f32(4) + f32(4) + f32(4) + f32(4) + f32(4) + mat4x4f(64) = 96 bytes
    const data = new Float32Array(24) // 96 / 4 = 24 floats

    // resolution (offset 0)
    data[0] = ctx.size.width
    data[1] = ctx.size.height

    // ior (offset 8 bytes = 2 floats)
    data[2] = this.ior

    // strength (offset 12 bytes = 3 floats)
    data[3] = this.strength

    // chromaticAberration (offset 16 bytes = 4 floats)
    data[4] = this.chromaticAberration

    // nearClip (offset 20 bytes = 5 floats)
    data[5] = camera?.near ?? 0.1

    // farClip (offset 24 bytes = 6 floats)
    data[6] = camera?.far ?? 100

    // _pad (offset 28 bytes = 7 floats)
    data[7] = 0

    // invProjMatrix (offset 32 bytes = 8 floats, 64 bytes total)
    if (camera?.inverseProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        const value = camera.inverseProjectionMatrix.elements[i]
        if (value !== undefined) data[8 + i] = value
      }
    } else {
      // Identity matrix as fallback
      data[8] = 1
      data[9] = 0
      data[10] = 0
      data[11] = 0
      data[12] = 0
      data[13] = 1
      data[14] = 0
      data[15] = 0
      data[16] = 0
      data[17] = 0
      data[18] = 1
      data[19] = 0
      data[20] = 0
      data[21] = 0
      data[22] = 0
      data[23] = 1
    }

    this.writeUniformBuffer(this.device, this.uniformBuffer, data)

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'refraction-bg',
      layout: this.passBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: colorView },
        { binding: 3, resource: normalView },
        { binding: 4, resource: depthView },
      ],
    })

    // Begin render pass
    const passEncoder = ctx.beginRenderPass({
      label: 'refraction-render',
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
