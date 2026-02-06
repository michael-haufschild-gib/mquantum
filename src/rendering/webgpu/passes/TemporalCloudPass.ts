/**
 * WebGPU Temporal Cloud Pass
 *
 * Performs temporal accumulation for volumetric cloud rendering.
 * Uses quarter-resolution rendering with Bayer pattern sampling
 * and temporal reprojection for high-quality reconstruction.
 *
 * ## Pipeline Overview
 *
 * 1. **Reprojection Pass**: Reprojects previous frame's accumulated data to current view
 * 2. **Reconstruction Pass**: Combines fresh quarter-res pixels with reprojected history
 *
 * ## MRT Layout
 *
 * ### Accumulation Buffer (Full Resolution, PingPong)
 * | Attachment | Content                | Format       |
 * |------------|------------------------|--------------|
 * | 0          | Accumulated Color      | rgba16float  |
 * | 1          | World Position         | rgba16float  |
 *
 * ### Reprojection Buffer (Full Resolution)
 * | Attachment | Content                | Format       |
 * |------------|------------------------|--------------|
 * | 0          | Reprojected Color      | rgba16float  |
 * | 1          | Validity Mask (R=valid)| rgba16float  |
 *
 * @module rendering/webgpu/passes/TemporalCloudPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'

/**
 * Configuration for the Temporal Cloud Pass.
 */
export interface TemporalCloudPassConfig {
  /** Resource ID for quarter-res cloud color input */
  cloudColorInput: string
  /** Resource ID for quarter-res cloud position input */
  cloudPositionInput: string
  /** Resource ID for accumulation color buffer (ping-pong) */
  accumulationColorBuffer: string
  /** Resource ID for accumulation position buffer (ping-pong) */
  accumulationPositionBuffer: string
  /** Resource ID for reprojection color output */
  reprojectionColorOutput: string
  /** Resource ID for reprojection validity output */
  reprojectionValidityOutput: string
  /** History weight (0 = favor new, 1 = favor history) */
  historyWeight?: number
  /** Disocclusion threshold for validity rejection */
  disocclusionThreshold?: number
}

/** Bayer pattern offsets for 4-frame cycle */
const BAYER_OFFSETS: [number, number][] = [
  [0.0, 0.0],
  [1.0, 1.0],
  [1.0, 0.0],
  [0.0, 1.0],
]

// =============================================================================
// WGSL Shaders
// =============================================================================

/**
 * Reprojection Fragment Shader (WGSL)
 *
 * Takes previous frame's accumulated data and reprojects it to current view.
 * Outputs reprojected color and validity mask.
 */
const REPROJECTION_SHADER = /* wgsl */ `
struct Uniforms {
  prevViewProjectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  cameraPosition: vec3f,
  _pad0: f32,
  accumulationResolution: vec2f,
  disocclusionThreshold: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tPrevAccumulation: texture_2d<f32>;
@group(0) @binding(3) var tPrevPositionBuffer: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) validity: vec4f,
}

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.uv;

  // Sample previous frame's data at this screen location
  let prevColor = textureSample(tPrevAccumulation, texSampler, uv);
  let prevPosition = textureSample(tPrevPositionBuffer, texSampler, uv);

  // Early out if no valid history at this location
  if (prevColor.a < 0.001 || prevPosition.w < 0.001) {
    output.color = vec4f(0.0);
    output.validity = vec4f(0.0);
    return output;
  }

  let worldPos = prevPosition.xyz;

  // Project this world position to CURRENT frame to see where it went
  let currentClip = uniforms.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Guard against division by zero in perspective divide
  var safeW = currentClip.w;
  if (abs(safeW) < 0.0001) {
    safeW = select(-0.0001, 0.0001, safeW >= 0.0);
  }

  let currentUV = (currentClip.xy / safeW) * 0.5 + 0.5;

  // Compute how far the content has "moved" on screen
  let screenMotion = currentUV - uv;
  let motionMagnitude = length(screenMotion * uniforms.accumulationResolution);

  // Start with full validity
  var validity: f32 = 1.0;

  // MOTION-BASED REJECTION
  let MOTION_THRESHOLD_MIN: f32 = 2.0;
  let MOTION_THRESHOLD_MAX: f32 = 8.0;

  if (motionMagnitude > MOTION_THRESHOLD_MIN) {
    let motionFactor = 1.0 - smoothstep(MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX, motionMagnitude);
    validity *= motionFactor;
  }

  // OFF-SCREEN REJECTION
  if (currentUV.x < -0.1 || currentUV.x > 1.1 || currentUV.y < -0.1 || currentUV.y > 1.1) {
    validity = 0.0;
  }

  // EDGE DETECTION - check for position discontinuities
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let posL = textureSample(tPrevPositionBuffer, texSampler, uv - vec2f(texelSize.x, 0.0));
  let posR = textureSample(tPrevPositionBuffer, texSampler, uv + vec2f(texelSize.x, 0.0));
  let posU = textureSample(tPrevPositionBuffer, texSampler, uv + vec2f(0.0, texelSize.y));
  let posD = textureSample(tPrevPositionBuffer, texSampler, uv - vec2f(0.0, texelSize.y));

  let maxPosDiff = max(
    max(length(worldPos - posL.xyz), length(worldPos - posR.xyz)),
    max(length(worldPos - posU.xyz), length(worldPos - posD.xyz))
  );

  let POS_DISCONTINUITY_THRESHOLD: f32 = 0.3;
  if (maxPosDiff > POS_DISCONTINUITY_THRESHOLD) {
    validity *= 0.5;
  }

  // ALPHA DISCONTINUITY
  let colorL = textureSample(tPrevAccumulation, texSampler, uv - vec2f(texelSize.x, 0.0));
  let colorR = textureSample(tPrevAccumulation, texSampler, uv + vec2f(texelSize.x, 0.0));
  let colorU = textureSample(tPrevAccumulation, texSampler, uv + vec2f(0.0, texelSize.y));
  let colorD = textureSample(tPrevAccumulation, texSampler, uv - vec2f(0.0, texelSize.y));

  let maxAlphaDiff = max(
    max(abs(prevColor.a - colorL.a), abs(prevColor.a - colorR.a)),
    max(abs(prevColor.a - colorU.a), abs(prevColor.a - colorD.a))
  );

  if (maxAlphaDiff > uniforms.disocclusionThreshold) {
    validity *= 0.5;
  }

  // SCREEN EDGE REJECTION
  let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  if (edgeDist < 0.03) {
    validity *= edgeDist / 0.03;
  }

  output.color = prevColor;
  output.validity = vec4f(validity, 0.0, 0.0, 1.0);
  return output;
}
`

/**
 * Reconstruction Fragment Shader (WGSL)
 *
 * Combines freshly rendered quarter-res pixels with reprojected history
 * to produce full-resolution accumulated cloud image.
 */
const RECONSTRUCTION_SHADER = /* wgsl */ `
struct Uniforms {
  bayerOffset: vec2f,
  frameIndex: i32,
  hasValidHistory: i32,
  cloudResolution: vec2f,
  accumulationResolution: vec2f,
  historyWeight: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tCloudRender: texture_2d<f32>;
@group(0) @binding(3) var tCloudPosition: texture_2d<f32>;
@group(0) @binding(4) var tReprojectedHistory: texture_2d<f32>;
@group(0) @binding(5) var tReprojectedPositionHistory: texture_2d<f32>;
@group(0) @binding(6) var tValidityMask: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) position: vec4f,
}

// Sample color from quarter-res cloud buffer for a given full-res pixel coordinate
fn sampleCloudColorAtPixel(fullResPixel: vec2i) -> vec4f {
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(tCloudRender, texSampler, quarterUV);
}

// Sample position from quarter-res cloud buffer
fn sampleCloudPositionAtPixel(fullResPixel: vec2i) -> vec4f {
  let quarterUV = (vec2f(fullResPixel / 2) + 0.5) / uniforms.cloudResolution;
  return textureSample(tCloudPosition, texSampler, quarterUV);
}

// Spatial interpolation from quarter-res cloud buffer (no history)
fn spatialInterpolationColorFromCloud(fullResPixel: vec2i) -> vec4f {
  let blockBase = (fullResPixel / 2) * 2;
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;
  return sampleCloudColorAtPixel(renderedPixel);
}

fn spatialInterpolationPositionFromCloud(fullResPixel: vec2i) -> vec4f {
  let blockBase = (fullResPixel / 2) * 2;
  let bayerInt = vec2i(uniforms.bayerOffset);
  let renderedPixel = blockBase + bayerInt;
  return sampleCloudPositionAtPixel(renderedPixel);
}

// Spatial interpolation from history buffer
fn spatialInterpolationColorFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let c0 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(-texelSize.x, 0.0));
  let c1 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(texelSize.x, 0.0));
  let c2 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(0.0, -texelSize.y));
  let c3 = textureSample(tReprojectedHistory, texSampler, uv + vec2f(0.0, texelSize.y));

  var sum = vec4f(0.0);
  var count: f32 = 0.0;

  if (c0.a > 0.001) { sum += c0; count += 1.0; }
  if (c1.a > 0.001) { sum += c1; count += 1.0; }
  if (c2.a > 0.001) { sum += c2; count += 1.0; }
  if (c3.a > 0.001) { sum += c3; count += 1.0; }

  if (count > 0.0) {
    return sum / count;
  }
  return vec4f(0.0);
}

fn spatialInterpolationPositionFromHistory(uv: vec2f) -> vec4f {
  let texelSize = 1.0 / uniforms.accumulationResolution;

  let p0 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(-texelSize.x, 0.0));
  let p1 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(texelSize.x, 0.0));
  let p2 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(0.0, -texelSize.y));
  let p3 = textureSample(tReprojectedPositionHistory, texSampler, uv + vec2f(0.0, texelSize.y));

  var sum = vec4f(0.0);
  var count: f32 = 0.0;

  if (p0.w > 0.001) { sum += p0; count += 1.0; }
  if (p1.w > 0.001) { sum += p1; count += 1.0; }
  if (p2.w > 0.001) { sum += p2; count += 1.0; }
  if (p3.w > 0.001) { sum += p3; count += 1.0; }

  if (count > 0.0) {
    return sum / count;
  }
  return vec4f(0.0);
}

// Neighborhood clamping - critical for preventing ghosting
fn computeNeighborhoodBounds(centerPixel: vec2i) -> array<vec4f, 2> {
  var minBound = vec4f(1e10);
  var maxBound = vec4f(-1e10);

  for (var dy: i32 = -1; dy <= 1; dy++) {
    for (var dx: i32 = -1; dx <= 1; dx++) {
      var samplePixel = centerPixel + vec2i(dx, dy) * 2;
      samplePixel = clamp(samplePixel, vec2i(0), vec2i(uniforms.accumulationResolution) - 1);

      let neighborColor = sampleCloudColorAtPixel(samplePixel);

      if (neighborColor.a > 0.001) {
        minBound = min(minBound, neighborColor);
        maxBound = max(maxBound, neighborColor);
      }
    }
  }

  if (minBound.a > 1e9) {
    minBound = vec4f(0.0);
    maxBound = vec4f(1.0);
  }

  return array<vec4f, 2>(minBound, maxBound);
}

fn clampToNeighborhood(color: vec4f, minBound: vec4f, maxBound: vec4f) -> vec4f {
  return clamp(color, minBound, maxBound);
}

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.uv;

  let pixelCoordInt = vec2i(floor(uv * uniforms.accumulationResolution));
  let blockPosInt = pixelCoordInt % 2;
  let bayerOffsetInt = vec2i(uniforms.bayerOffset);

  let renderedThisFrame = (blockPosInt.x == bayerOffsetInt.x && blockPosInt.y == bayerOffsetInt.y);

  var newColor = vec4f(0.0);
  var newPosition = vec4f(0.0);
  var historyColor = vec4f(0.0);
  var historyPosition = vec4f(0.0);
  var validity: f32 = 0.0;

  // Get new rendered color/position for pixels rendered this frame
  if (renderedThisFrame) {
    newColor = sampleCloudColorAtPixel(pixelCoordInt);
    newPosition = sampleCloudPositionAtPixel(pixelCoordInt);
  }

  // Get reprojected history if available
  if (uniforms.hasValidHistory != 0) {
    historyColor = textureSample(tReprojectedHistory, texSampler, uv);
    historyPosition = textureSample(tReprojectedPositionHistory, texSampler, uv);
    validity = textureSample(tValidityMask, texSampler, uv).r;
  }

  var finalColor: vec4f;
  var finalPosition: vec4f;

  let FRESH_PIXEL_HISTORY_REDUCTION: f32 = 0.5;

  // Neighborhood clamping
  let bounds = computeNeighborhoodBounds(pixelCoordInt);
  let neighborMin = bounds[0];
  let neighborMax = bounds[1];

  let clampedHistoryColor = clampToNeighborhood(historyColor, neighborMin, neighborMax);

  if (renderedThisFrame) {
    if (uniforms.hasValidHistory != 0 && validity > 0.5 && historyColor.a > 0.001) {
      let blendWeight = uniforms.historyWeight * validity * FRESH_PIXEL_HISTORY_REDUCTION;
      finalColor = mix(newColor, clampedHistoryColor, blendWeight);
      finalPosition = mix(newPosition, historyPosition, blendWeight);

      if (newColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      finalColor = newColor;
      finalPosition = newPosition;
    }
  } else {
    if (uniforms.hasValidHistory != 0 && validity > 0.5 && historyColor.a > 0.001) {
      finalColor = clampedHistoryColor;
      finalPosition = historyPosition;

      if (historyColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else if (uniforms.hasValidHistory != 0 && historyColor.a > 0.001) {
      let spatialColor = spatialInterpolationColorFromHistory(uv);
      let spatialPosition = spatialInterpolationPositionFromHistory(uv);
      let clampedSpatial = clampToNeighborhood(spatialColor, neighborMin, neighborMax);
      finalColor = mix(clampedSpatial, clampedHistoryColor, validity);
      finalPosition = mix(spatialPosition, historyPosition, validity);

      if (historyColor.a >= 0.99 || spatialColor.a >= 0.99) {
        finalColor.a = 1.0;
      }
    } else {
      finalColor = spatialInterpolationColorFromCloud(pixelCoordInt);
      finalPosition = spatialInterpolationPositionFromCloud(pixelCoordInt);
    }
  }

  finalColor = max(finalColor, vec4f(0.0));
  finalPosition.w = max(finalPosition.w, 0.0);

  output.color = finalColor;
  output.position = finalPosition;
  return output;
}
`

// =============================================================================
// Pass Implementation
// =============================================================================

/**
 * WebGPU Temporal Cloud Pass.
 *
 * Implements temporal accumulation for volumetric cloud rendering using
 * quarter-resolution rendering with Bayer pattern sampling and temporal
 * reprojection for high-quality reconstruction.
 *
 * @example
 * ```typescript
 * const temporalCloudPass = new TemporalCloudPass({
 *   cloudColorInput: 'cloudRenderColor',
 *   cloudPositionInput: 'cloudRenderPosition',
 *   accumulationColorBuffer: 'temporalAccumColor',
 *   accumulationPositionBuffer: 'temporalAccumPosition',
 *   reprojectionColorOutput: 'reprojectedColor',
 *   reprojectionValidityOutput: 'reprojectionValidity',
 *   historyWeight: 0.85,
 * });
 * ```
 */
export class TemporalCloudPass extends WebGPUBasePass {
  private passConfig: TemporalCloudPassConfig

  // Pipelines
  private reprojectionPipeline: GPURenderPipeline | null = null
  private reconstructionPipeline: GPURenderPipeline | null = null

  // Bind group layouts
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private reconstructionBindGroupLayout: GPUBindGroupLayout | null = null

  // Uniform buffers
  private reprojectionUniformBuffer: GPUBuffer | null = null
  private reconstructionUniformBuffer: GPUBuffer | null = null

  // Sampler
  private sampler: GPUSampler | null = null

  // Pre-allocated uniform staging buffers
  private reprojectionUniformData = new Float32Array(40) // 160 bytes
  private reconstructionUniformData = new Float32Array(12) // 48 bytes
  private reconstructionUniformIntView = new Int32Array(this.reconstructionUniformData.buffer)
  private currentViewProjectionMatrix = new Float32Array(16)

  // Cached bind groups
  private reprojectionBindGroup: GPUBindGroup | null = null
  private reprojectionBindGroupAccumColorView: GPUTextureView | null = null
  private reprojectionBindGroupAccumPositionView: GPUTextureView | null = null
  private reconstructionBindGroup: GPUBindGroup | null = null
  private reconstructionCloudColorView: GPUTextureView | null = null
  private reconstructionCloudPositionView: GPUTextureView | null = null
  private reconstructionHistoryColorView: GPUTextureView | null = null
  private reconstructionHistoryPositionView: GPUTextureView | null = null
  private reconstructionValidityView: GPUTextureView | null = null

  // State
  private frameIndex = 0
  private hasValidHistory = false
  private prevViewProjectionMatrix = new Float32Array(16)
  private textureFormat: GPUTextureFormat = 'rgba16float'

  // Configuration
  private historyWeight: number
  private disocclusionThreshold: number

  constructor(config: TemporalCloudPassConfig) {
    super({
      id: 'temporal-cloud',
      priority: 150,
      inputs: [
        { resourceId: config.cloudColorInput, access: 'read' as const, binding: 0 },
        { resourceId: config.cloudPositionInput, access: 'read' as const, binding: 1 },
        { resourceId: config.accumulationColorBuffer, access: 'read' as const, binding: 2 },
        { resourceId: config.accumulationPositionBuffer, access: 'read' as const, binding: 3 },
      ],
      outputs: [
        { resourceId: config.reprojectionColorOutput, access: 'write' as const, binding: 0 },
        { resourceId: config.reprojectionValidityOutput, access: 'write' as const, binding: 1 },
        { resourceId: config.accumulationColorBuffer, access: 'write' as const, binding: 2 },
        { resourceId: config.accumulationPositionBuffer, access: 'write' as const, binding: 3 },
      ],
    })

    this.passConfig = config
    this.historyWeight = config.historyWeight ?? 0.85
    this.disocclusionThreshold = config.disocclusionThreshold ?? 0.15

    // Initialize identity matrix
    this.prevViewProjectionMatrix[0] = 1
    this.prevViewProjectionMatrix[5] = 1
    this.prevViewProjectionMatrix[10] = 1
    this.prevViewProjectionMatrix[15] = 1
  }

  /**
   * Create the rendering pipelines.
   * @param ctx
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx
    this.textureFormat = format

    // Create reprojection bind group layout
    this.passBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-cloud-reprojection-bgl',
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

    // Create reconstruction bind group layout
    this.reconstructionBindGroupLayout = device.createBindGroupLayout({
      label: 'temporal-cloud-reconstruction-bgl',
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
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        },
      ],
    })

    // Create shader modules
    const reprojectionFragmentModule = this.createShaderModule(
      device,
      REPROJECTION_SHADER,
      'temporal-cloud-reprojection-fragment'
    )

    const reconstructionFragmentModule = this.createShaderModule(
      device,
      RECONSTRUCTION_SHADER,
      'temporal-cloud-reconstruction-fragment'
    )

    // Create reprojection pipeline (MRT: 2 outputs)
    this.reprojectionPipeline = this.createMRTPipeline(
      device,
      reprojectionFragmentModule,
      [this.passBindGroupLayout],
      [this.textureFormat, this.textureFormat],
      { label: 'temporal-cloud-reprojection' }
    )

    // Create reconstruction pipeline (MRT: 2 outputs)
    this.reconstructionPipeline = this.createMRTPipeline(
      device,
      reconstructionFragmentModule,
      [this.reconstructionBindGroupLayout],
      [this.textureFormat, this.textureFormat],
      { label: 'temporal-cloud-reconstruction' }
    )

    // Create uniform buffers
    // Reprojection: 2x mat4 (128) + vec3 + pad (16) + vec2 + f32 + pad (16) = 160 bytes
    this.reprojectionUniformBuffer = this.createUniformBuffer(
      device,
      160,
      'temporal-cloud-reprojection-uniforms'
    )

    // Reconstruction: vec2 + i32 + i32 (16) + vec2 + vec2 (16) + f32 + 3xpad (16) = 48 bytes
    this.reconstructionUniformBuffer = this.createUniformBuffer(
      device,
      48,
      'temporal-cloud-reconstruction-uniforms'
    )

    // Create sampler
    this.sampler = device.createSampler({
      label: 'temporal-cloud-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  /**
   * Create a render pipeline with multiple render targets (MRT).
   * @param device
   * @param fragmentShader
   * @param bindGroupLayouts
   * @param colorFormats
   * @param options
   * @param options.label
   */
  private createMRTPipeline(
    device: GPUDevice,
    fragmentShader: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    colorFormats: GPUTextureFormat[],
    options?: { label?: string }
  ): GPURenderPipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: options?.label ? `${options.label}-layout` : `${this.id}-mrt-layout`,
      bindGroupLayouts,
    })

    // Standard fullscreen vertex shader
    const vertexShader = device.createShaderModule({
      label: `${this.id}-vertex`,
      code: FULLSCREEN_VERTEX_SHADER,
    })

    const colorTargets: GPUColorTargetState[] = colorFormats.map((format) => ({
      format,
      writeMask: GPUColorWrite.ALL,
    }))

    return device.createRenderPipeline({
      label: options?.label ?? `${this.id}-mrt-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: vertexShader,
        entryPoint: 'main',
        buffers: [this.getFullscreenVertexLayout()],
      },
      fragment: {
        module: fragmentShader,
        entryPoint: 'main',
        targets: colorTargets,
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  /**
   * Set history weight.
   * @param value
   */
  setHistoryWeight(value: number): void {
    this.historyWeight = value
  }

  /**
   * Set disocclusion threshold.
   * @param value
   */
  setDisocclusionThreshold(value: number): void {
    this.disocclusionThreshold = value
  }

  /**
   * Reset temporal history (e.g., on camera teleport).
   */
  resetHistory(): void {
    this.hasValidHistory = false
    this.frameIndex = 0
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null
  }

  /**
   * Update camera state from external source.
   * Call this each frame before execute() with the current view-projection matrix.
   * @param viewProjectionMatrix
   */
  updateCameraState(viewProjectionMatrix: Float32Array): void {
    // Store previous matrix
    this.prevViewProjectionMatrix.set(viewProjectionMatrix)
  }

  /**
   * Execute the temporal cloud pass.
   * @param ctx
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.reprojectionPipeline ||
      !this.reconstructionPipeline ||
      !this.reprojectionUniformBuffer ||
      !this.reconstructionUniformBuffer ||
      !this.passBindGroupLayout ||
      !this.reconstructionBindGroupLayout ||
      !this.sampler
    ) {
      return
    }

    // Get input textures
    const cloudColorView = ctx.getTextureView(this.passConfig.cloudColorInput)
    const cloudPositionView = ctx.getTextureView(this.passConfig.cloudPositionInput)

    if (!cloudColorView || !cloudPositionView) return

    // Get accumulation buffers (ping-pong)
    const accumColorReadView = ctx.getReadTextureView(this.passConfig.accumulationColorBuffer)
    const accumPositionReadView = ctx.getReadTextureView(
      this.passConfig.accumulationPositionBuffer
    )
    const accumColorWriteView = ctx.getWriteTarget(this.passConfig.accumulationColorBuffer)
    const accumPositionWriteView = ctx.getWriteTarget(this.passConfig.accumulationPositionBuffer)

    // Get reprojection outputs
    const reprojColorView = ctx.getWriteTarget(this.passConfig.reprojectionColorOutput)
    const reprojValidityView = ctx.getWriteTarget(this.passConfig.reprojectionValidityOutput)

    if (
      !accumColorReadView ||
      !accumPositionReadView ||
      !accumColorWriteView ||
      !accumPositionWriteView ||
      !reprojColorView ||
      !reprojValidityView
    ) {
      return
    }

    const { width, height } = ctx.size
    const bayerOffset = BAYER_OFFSETS[this.frameIndex] ?? [0, 0]

    // Get cloud resource to determine quarter resolution
    const cloudResource = ctx.getResource(this.passConfig.cloudColorInput)
    const cloudWidth = cloudResource?.width ?? width / 2
    const cloudHeight = cloudResource?.height ?? height / 2

    // Get camera data from stores
    const camera = ctx.frame?.stores?.['camera'] as {
      viewProjectionMatrix?: { elements: number[] }
      position?: { x: number; y: number; z: number } | [number, number, number]
    }

    // Extract current viewProjectionMatrix from camera store
    const currentViewProjectionMatrix = this.currentViewProjectionMatrix
    currentViewProjectionMatrix.fill(0)
    if (camera?.viewProjectionMatrix?.elements) {
      for (let i = 0; i < 16; i++) {
        currentViewProjectionMatrix[i] = camera.viewProjectionMatrix.elements[i] ?? 0
      }
    } else {
      // Identity matrix fallback
      currentViewProjectionMatrix[0] = 1
      currentViewProjectionMatrix[5] = 1
      currentViewProjectionMatrix[10] = 1
      currentViewProjectionMatrix[15] = 1
    }

    // Extract camera position
    let cameraX = 0,
      cameraY = 0,
      cameraZ = 0
    if (camera?.position) {
      if (Array.isArray(camera.position)) {
        cameraX = camera.position[0] ?? 0
        cameraY = camera.position[1] ?? 0
        cameraZ = camera.position[2] ?? 0
      } else {
        cameraX = camera.position.x ?? 0
        cameraY = camera.position.y ?? 0
        cameraZ = camera.position.z ?? 0
      }
    }

    // === REPROJECTION PASS ===
    if (this.hasValidHistory) {
      const reprojData = this.reprojectionUniformData

      // prevViewProjectionMatrix (offset 0, 64 bytes)
      for (let i = 0; i < 16; i++) {
        reprojData[i] = this.prevViewProjectionMatrix[i] ?? 0
      }

      // viewProjectionMatrix (offset 64, 64 bytes) - current frame's matrix
      for (let i = 0; i < 16; i++) {
        reprojData[16 + i] = currentViewProjectionMatrix[i] ?? 0
      }

      // cameraPosition (offset 128, 12 bytes) + pad
      reprojData[32] = cameraX
      reprojData[33] = cameraY
      reprojData[34] = cameraZ
      reprojData[35] = 0

      // accumulationResolution (offset 144, 8 bytes) + disocclusionThreshold + pad
      reprojData[36] = width
      reprojData[37] = height
      reprojData[38] = this.disocclusionThreshold
      reprojData[39] = 0

      this.writeUniformBuffer(this.device, this.reprojectionUniformBuffer, reprojData)

      if (
        !this.reprojectionBindGroup ||
        this.reprojectionBindGroupAccumColorView !== accumColorReadView ||
        this.reprojectionBindGroupAccumPositionView !== accumPositionReadView
      ) {
        this.reprojectionBindGroup = this.device.createBindGroup({
          label: 'temporal-cloud-reprojection-bg',
          layout: this.passBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.reprojectionUniformBuffer } },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: accumColorReadView },
            { binding: 3, resource: accumPositionReadView },
          ],
        })
        this.reprojectionBindGroupAccumColorView = accumColorReadView
        this.reprojectionBindGroupAccumPositionView = accumPositionReadView
      }

      const reprojPassEncoder = ctx.beginRenderPass({
        label: 'temporal-cloud-reprojection',
        colorAttachments: [
          {
            view: reprojColorView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
          {
            view: reprojValidityView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })

      this.renderFullscreen(reprojPassEncoder, this.reprojectionPipeline, [this.reprojectionBindGroup!])
      reprojPassEncoder.end()
    }

    // === RECONSTRUCTION PASS ===
    const reconData = this.reconstructionUniformData
    const reconInts = this.reconstructionUniformIntView

    // bayerOffset (offset 0, 8 bytes) + frameIndex + hasValidHistory
    reconData[0] = bayerOffset[0]
    reconData[1] = bayerOffset[1]
    reconInts[2] = this.frameIndex
    reconInts[3] = this.hasValidHistory ? 1 : 0

    // cloudResolution (offset 16, 8 bytes) + accumulationResolution (8 bytes)
    reconData[4] = cloudWidth
    reconData[5] = cloudHeight
    reconData[6] = width
    reconData[7] = height

    // historyWeight (offset 32, 4 bytes) + padding (12 bytes)
    reconData[8] = this.historyWeight
    reconData[9] = 0
    reconData[10] = 0
    reconData[11] = 0

    this.writeUniformBuffer(this.device, this.reconstructionUniformBuffer, reconData)

    // For reconstruction, we need reprojection outputs as inputs
    // IMPORTANT: Use getTextureView() for reading, not the write targets, to avoid read-after-write hazard
    // If no valid history, use cloud textures as fallback
    const reprojHistoryReadView = this.hasValidHistory
      ? ctx.getTextureView(this.passConfig.reprojectionColorOutput)
      : cloudColorView
    const reprojPositionView = this.hasValidHistory ? accumPositionReadView : cloudPositionView
    const validityReadView = this.hasValidHistory
      ? ctx.getTextureView(this.passConfig.reprojectionValidityOutput)
      : cloudColorView

    // Guard against missing read views
    if (!reprojHistoryReadView || !validityReadView) {
      return
    }

    if (
      !this.reconstructionBindGroup ||
      this.reconstructionCloudColorView !== cloudColorView ||
      this.reconstructionCloudPositionView !== cloudPositionView ||
      this.reconstructionHistoryColorView !== reprojHistoryReadView ||
      this.reconstructionHistoryPositionView !== reprojPositionView ||
      this.reconstructionValidityView !== validityReadView
    ) {
      this.reconstructionBindGroup = this.device.createBindGroup({
        label: 'temporal-cloud-reconstruction-bg',
        layout: this.reconstructionBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.reconstructionUniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: cloudColorView },
          { binding: 3, resource: cloudPositionView },
          { binding: 4, resource: reprojHistoryReadView },
          { binding: 5, resource: reprojPositionView },
          { binding: 6, resource: validityReadView },
        ],
      })
      this.reconstructionCloudColorView = cloudColorView
      this.reconstructionCloudPositionView = cloudPositionView
      this.reconstructionHistoryColorView = reprojHistoryReadView
      this.reconstructionHistoryPositionView = reprojPositionView
      this.reconstructionValidityView = validityReadView
    }

    const reconPassEncoder = ctx.beginRenderPass({
      label: 'temporal-cloud-reconstruction',
      colorAttachments: [
        {
          view: accumColorWriteView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
        {
          view: accumPositionWriteView,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })

    this.renderFullscreen(reconPassEncoder, this.reconstructionPipeline, [this.reconstructionBindGroup!])
    reconPassEncoder.end()

    // Update state for next frame
    this.frameIndex = (this.frameIndex + 1) % 4
    this.hasValidHistory = true

    // Store current viewProjectionMatrix for next frame's reprojection
    this.prevViewProjectionMatrix.set(currentViewProjectionMatrix)
  }

  /**
   * Post-frame hook for temporal state management.
   */
  postFrame(): void {
    // Frame index is already updated in execute()
  }

  /**
   * Release internal resources when disabled.
   */
  releaseInternalResources(): void {
    this.hasValidHistory = false
    this.frameIndex = 0
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.reprojectionPipeline = null
    this.reconstructionPipeline = null
    this.passBindGroupLayout = null
    this.reconstructionBindGroupLayout = null
    this.reprojectionUniformBuffer?.destroy()
    this.reprojectionUniformBuffer = null
    this.reconstructionUniformBuffer?.destroy()
    this.reconstructionUniformBuffer = null
    this.sampler = null
    this.reprojectionBindGroup = null
    this.reprojectionBindGroupAccumColorView = null
    this.reprojectionBindGroupAccumPositionView = null
    this.reconstructionBindGroup = null
    this.reconstructionCloudColorView = null
    this.reconstructionCloudPositionView = null
    this.reconstructionHistoryColorView = null
    this.reconstructionHistoryPositionView = null
    this.reconstructionValidityView = null

    super.dispose()
  }
}

// =============================================================================
// Shared Shader
// =============================================================================

/**
 * Standard fullscreen vertex shader (WGSL).
 */
const FULLSCREEN_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(
  @location(0) position: vec2f,
  @location(1) uv: vec2f
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}
`
