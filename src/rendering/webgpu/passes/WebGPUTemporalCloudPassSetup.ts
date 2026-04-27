/**
 * WebGPU Temporal Cloud Pass — Pipeline & Bind Group Setup
 *
 * Extracted from WebGPUTemporalCloudPass to keep file sizes manageable.
 * Contains pipeline creation, bind group layout definitions, and
 * cached bind group management.
 */

import { temporalReconstructionShader } from '../shaders/temporal/reconstruction.wgsl'
import { temporalReprojectionShader } from '../shaders/temporal/reprojection.wgsl'

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper callbacks that bridge to the base class's protected methods.
 */
export interface TemporalPassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createFullscreenPipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    format: GPUTextureFormat,
    options: { label: string }
  ) => GPURenderPipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
  createBindGroup: (
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    entries: GPUBindGroupEntry[],
    label: string
  ) => GPUBindGroup
}

/** All pipelines and bind group layouts created during setup. */
export interface TemporalPipelineResult {
  reprojectionPipeline: GPURenderPipeline
  reconstructionPipeline: GPURenderPipeline
  reprojectionBGL0: GPUBindGroupLayout
  reprojectionBGL1: GPUBindGroupLayout
  reconstructionBGL0: GPUBindGroupLayout
  reconstructionBGL1: GPUBindGroupLayout
  temporalUniformBuffer: GPUBuffer
  linearSampler: GPUSampler
  nearestSampler: GPUSampler
}

/** Cached bind group for temporal reprojection texture inputs. */
export interface ReprojectionTextureBindGroupCacheEntry {
  accumulationView: GPUTextureView
  positionView: GPUTextureView
  bindGroup: GPUBindGroup
}

/** Cached bind group for temporal reconstruction texture inputs. */
export interface ReconstructionTextureBindGroupCacheEntry {
  quarterColorView: GPUTextureView
  historyView: GPUTextureView
  bindGroup: GPUBindGroup
}

// ───────────────────────────────────────────────────────────────────────────
// Pipeline Creation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create all pipelines, bind group layouts, samplers, and the uniform buffer.
 */
export function buildTemporalPipelines(
  device: GPUDevice,
  helpers: TemporalPassHelpers
): TemporalPipelineResult {
  // Create samplers
  const linearSampler = device.createSampler({
    label: 'temporal-linear-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })

  const nearestSampler = device.createSampler({
    label: 'temporal-nearest-sampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })

  const temporalUniformBuffer = helpers.createUniformBuffer(device, 176, 'temporal-uniforms')

  // Reprojection bind group layouts
  const reprojectionBGL0 = device.createBindGroupLayout({
    label: 'temporal-reprojection-bgl0',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  })

  const reprojectionBGL1 = device.createBindGroupLayout({
    label: 'temporal-reprojection-bgl1',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        // quarterPosition is rgba32float — UNFILTERABLE
        texture: { sampleType: 'unfilterable-float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  })

  // Reconstruction bind group layouts
  const reconstructionBGL0 = device.createBindGroupLayout({
    label: 'temporal-reconstruction-bgl0',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  })

  const reconstructionBGL1 = device.createBindGroupLayout({
    label: 'temporal-reconstruction-bgl1',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'non-filtering' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  })

  // Reprojection pipeline
  const reprojectionShaderModule = helpers.createShaderModule(
    device,
    temporalReprojectionShader,
    'temporal-reprojection-shader'
  )
  const reprojectionPipeline = helpers.createFullscreenPipeline(
    device,
    reprojectionShaderModule,
    [reprojectionBGL0, reprojectionBGL1],
    'rgba16float',
    { label: 'temporal-reprojection-pipeline' }
  )

  // Reconstruction pipeline
  const reconstructionShaderModule = helpers.createShaderModule(
    device,
    temporalReconstructionShader,
    'temporal-reconstruction-shader'
  )
  const reconstructionPipeline = helpers.createFullscreenPipeline(
    device,
    reconstructionShaderModule,
    [reconstructionBGL0, reconstructionBGL1],
    'rgba16float',
    { label: 'temporal-reconstruction-pipeline' }
  )

  return {
    reprojectionPipeline,
    reconstructionPipeline,
    reprojectionBGL0,
    reprojectionBGL1,
    reconstructionBGL0,
    reconstructionBGL1,
    temporalUniformBuffer,
    linearSampler,
    nearestSampler,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Bind Group Caching
// ───────────────────────────────────────────────────────────────────────────

/**
 * Manages cached bind groups for the temporal cloud pass to avoid per-frame allocations.
 */
export class TemporalBindGroupCache {
  private reprojectionBG0: GPUBindGroup | null = null
  private reprojectionBG1Cache: ReprojectionTextureBindGroupCacheEntry[] = []
  private reconstructionBG0: GPUBindGroup | null = null
  private reconstructionBG1Cache: ReconstructionTextureBindGroupCacheEntry[] = []

  /** Reset all cached bind groups (e.g., after texture resize). */
  reset(): void {
    this.reprojectionBG0 = null
    this.reprojectionBG1Cache = []
    this.reconstructionBG0 = null
    this.reconstructionBG1Cache = []
  }

  getOrCreateReprojectionUniformBG(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    uniformBuffer: GPUBuffer,
    helpers: TemporalPassHelpers
  ): GPUBindGroup {
    if (!this.reprojectionBG0) {
      this.reprojectionBG0 = helpers.createBindGroup(
        device,
        layout,
        [{ binding: 0, resource: { buffer: uniformBuffer } }],
        'temporal-reprojection-bg0'
      )
    }
    return this.reprojectionBG0
  }

  getOrCreateReprojectionTextureBG(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    accumulationView: GPUTextureView,
    positionView: GPUTextureView,
    linearSampler: GPUSampler,
    helpers: TemporalPassHelpers
  ): GPUBindGroup {
    const cached = this.reprojectionBG1Cache.find(
      (e) => e.accumulationView === accumulationView && e.positionView === positionView
    )
    if (cached) return cached.bindGroup

    const bindGroup = helpers.createBindGroup(
      device,
      layout,
      [
        { binding: 0, resource: accumulationView },
        { binding: 1, resource: positionView },
        { binding: 2, resource: linearSampler },
      ],
      'temporal-reprojection-bg1'
    )
    this.reprojectionBG1Cache.push({ accumulationView, positionView, bindGroup })
    return bindGroup
  }

  getOrCreateReconstructionUniformBG(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    uniformBuffer: GPUBuffer,
    helpers: TemporalPassHelpers
  ): GPUBindGroup {
    if (!this.reconstructionBG0) {
      this.reconstructionBG0 = helpers.createBindGroup(
        device,
        layout,
        [{ binding: 0, resource: { buffer: uniformBuffer } }],
        'temporal-reconstruction-bg0'
      )
    }
    return this.reconstructionBG0
  }

  getOrCreateReconstructionTextureBG(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    quarterColorView: GPUTextureView,
    historyView: GPUTextureView,
    nearestSampler: GPUSampler,
    linearSampler: GPUSampler,
    helpers: TemporalPassHelpers
  ): GPUBindGroup {
    const cached = this.reconstructionBG1Cache.find(
      (e) => e.quarterColorView === quarterColorView && e.historyView === historyView
    )
    if (cached) return cached.bindGroup

    const bindGroup = helpers.createBindGroup(
      device,
      layout,
      [
        { binding: 0, resource: quarterColorView },
        { binding: 1, resource: historyView },
        { binding: 2, resource: nearestSampler },
        { binding: 3, resource: linearSampler },
      ],
      'temporal-reconstruction-bg1'
    )
    this.reconstructionBG1Cache.push({ quarterColorView, historyView, bindGroup })
    return bindGroup
  }
}
