/**
 * Wigner Cache Compute Pass — Pipeline & Resource Setup
 *
 * Extracted from WignerCacheComputePass to keep file sizes manageable.
 * Contains GPU resource creation, pipeline compilation, and bind group assembly.
 *
 * Functions operate on plain parameter objects rather than class instances,
 * receiving only the GPU resources they need and returning the ones they create.
 */

import { composeWignerCacheComputeShader } from '../shaders/schroedinger/compute/composeWignerCache'
import { composeWignerReconstructComputeShader } from '../shaders/schroedinger/compute/composeWignerReconstruct'
import { composeWignerSpatialComputeShader } from '../shaders/schroedinger/compute/composeWignerSpatial'
import { WIGNER_GRID_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerCache.wgsl'
import { WIGNER_RECONSTRUCT_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerReconstruct.wgsl'
import { WIGNER_SPATIAL_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerSpatial.wgsl'
import {
  BASIS_UNIFORM_SIZE,
  type CrossPairInfo,
  SCHROEDINGER_UNIFORM_SIZE,
} from './wignerCacheTypes'

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by WignerCacheComputePass so standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface WignerPassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipelineAsync: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => Promise<GPUComputePipeline>
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/** Configuration needed for pipeline compilation. */
export interface WignerPipelineConfig {
  dimension: number
  quantumMode?: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/** Shared GPU resources used by all pipeline modes. */
export interface WignerSharedResources {
  cacheTexture: GPUTexture
  cacheTextureView: GPUTextureView
  cacheSampler: GPUSampler
  schroedingerBuffer: GPUBuffer
  basisBuffer: GPUBuffer
  gridParamsBuffer: GPUBuffer
}

/** Legacy single-pass pipeline resources. */
export interface WignerLegacyResources {
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  bindGroupLayout: GPUBindGroupLayout
}

/** Phase 1: Spatial precompute pipeline resources. */
export interface WignerSpatialResources {
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  bindGroupLayout: GPUBindGroupLayout
  spatialParamsBuffer: GPUBuffer
  diagTexture: GPUTexture
  diagTextureView: GPUTextureView
  crossTexArray: GPUTexture
  crossTexArrayView: GPUTextureView
}

/** Phase 2: Reconstruction pipeline resources. */
export interface WignerReconstructResources {
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  bindGroupLayout: GPUBindGroupLayout
  reconstructParamsBuffer: GPUBuffer
}

// ───────────────────────────────────────────────────────────────────────────
// Shared Resources
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create resources shared between both pipeline modes:
 * cache texture, sampler, and uniform buffers.
 */
export function createWignerSharedResources(
  device: GPUDevice,
  gridSize: number,
  helpers: WignerPassHelpers
): WignerSharedResources {
  const cacheTexture = device.createTexture({
    label: 'wigner-cache-final',
    size: { width: gridSize, height: gridSize },
    format: 'rgba16float',
    dimension: '2d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const cacheTextureView = cacheTexture.createView({ label: 'wigner-cache-final-view' })

  const cacheSampler = device.createSampler({
    label: 'wigner-cache-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })

  const schroedingerBuffer = helpers.createUniformBuffer(
    device,
    SCHROEDINGER_UNIFORM_SIZE,
    'wigner-schroedinger'
  )
  const basisBuffer = helpers.createUniformBuffer(device, BASIS_UNIFORM_SIZE, 'wigner-basis')
  const gridParamsBuffer = helpers.createUniformBuffer(
    device,
    WIGNER_GRID_PARAMS_SIZE,
    'wigner-grid-params'
  )

  return {
    cacheTexture,
    cacheTextureView,
    cacheSampler,
    schroedingerBuffer,
    basisBuffer,
    gridParamsBuffer,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy Pipeline
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create the legacy single-pass pipeline.
 * Used for hydrogen mode and single-term HO where two-phase isn't beneficial.
 */
export async function createWignerLegacyPipeline(
  device: GPUDevice,
  config: WignerPipelineConfig,
  shared: WignerSharedResources,
  helpers: WignerPassHelpers
): Promise<WignerLegacyResources> {
  const { wgsl } = composeWignerCacheComputeShader({
    dimension: config.dimension,
    quantumMode: config.quantumMode,
    termCount: config.termCount,
  })

  const shaderModule = helpers.createShaderModule(device, wgsl, 'wigner-cache-legacy')

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'wigner-legacy-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only' as const,
          format: 'rgba16float' as GPUTextureFormat,
          viewDimension: '2d' as GPUTextureViewDimension,
        },
      },
    ],
  })

  const bindGroup = rebuildWignerLegacyBindGroup(device, bindGroupLayout, shared)

  const pipeline = await helpers.createComputePipelineAsync(
    device,
    shaderModule,
    [bindGroupLayout],
    'wigner-legacy'
  )

  return { pipeline, bindGroup, bindGroupLayout }
}

/**
 * Rebuild legacy bind group (e.g., after texture resize).
 */
export function rebuildWignerLegacyBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  shared: WignerSharedResources
): GPUBindGroup {
  return device.createBindGroup({
    label: 'wigner-legacy-bg',
    layout,
    entries: [
      { binding: 0, resource: { buffer: shared.schroedingerBuffer } },
      { binding: 1, resource: { buffer: shared.basisBuffer } },
      { binding: 2, resource: { buffer: shared.gridParamsBuffer } },
      { binding: 3, resource: shared.cacheTextureView },
    ],
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Spatial Textures
// ───────────────────────────────────────────────────────────────────────────

/** Spatial texture bundle returned by createWignerSpatialTextures. */
export interface WignerSpatialTextures {
  diagTexture: GPUTexture
  diagTextureView: GPUTextureView
  crossTexArray: GPUTexture
  crossTexArrayView: GPUTextureView
}

/**
 * Create diagonal + cross-term texture array for spatial precompute.
 * Shared by initial creation and resize.
 */
export function createWignerSpatialTextures(
  device: GPUDevice,
  gridSize: number,
  numCrossLayers: number
): WignerSpatialTextures {
  const diagTexture = device.createTexture({
    label: 'wigner-diag-texture',
    size: { width: gridSize, height: gridSize },
    format: 'rgba16float',
    dimension: '2d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const diagTextureView = diagTexture.createView({ label: 'wigner-diag-view' })

  const numLayers = Math.max(numCrossLayers, 1)
  const crossTexArray = device.createTexture({
    label: 'wigner-cross-tex-array',
    size: { width: gridSize, height: gridSize, depthOrArrayLayers: numLayers },
    format: 'rgba16float',
    dimension: '2d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const crossTexArrayView = crossTexArray.createView({
    label: 'wigner-cross-array-view',
    dimension: '2d-array',
  })

  return { diagTexture, diagTextureView, crossTexArray, crossTexArrayView }
}

// ───────────────────────────────────────────────────────────────────────────
// Spatial Pipeline
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create Phase 1: Spatial precompute pipeline.
 */
export async function createWignerSpatialPipeline(
  device: GPUDevice,
  config: WignerPipelineConfig,
  gridSize: number,
  shared: WignerSharedResources,
  crossPairs: CrossPairInfo[],
  numCrossLayers: number,
  helpers: WignerPassHelpers
): Promise<WignerSpatialResources> {
  const { wgsl } = composeWignerSpatialComputeShader({
    dimension: config.dimension,
    quantumMode: config.quantumMode,
    termCount: config.termCount,
  })

  const shaderModule = helpers.createShaderModule(device, wgsl, 'wigner-spatial')

  const textures = createWignerSpatialTextures(device, gridSize, numCrossLayers)

  const spatialParamsBuffer = helpers.createUniformBuffer(
    device,
    WIGNER_SPATIAL_PARAMS_SIZE,
    'wigner-spatial-params'
  )

  uploadWignerSpatialParams(device, spatialParamsBuffer, crossPairs, numCrossLayers)

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'wigner-spatial-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only' as const,
          format: 'rgba16float' as GPUTextureFormat,
          viewDimension: '2d' as GPUTextureViewDimension,
        },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only' as const,
          format: 'rgba16float' as GPUTextureFormat,
          viewDimension: '2d-array' as GPUTextureViewDimension,
        },
      },
    ],
  })

  const bindGroup = rebuildWignerSpatialBindGroup(
    device,
    bindGroupLayout,
    shared,
    spatialParamsBuffer,
    textures
  )

  const pipeline = await helpers.createComputePipelineAsync(
    device,
    shaderModule,
    [bindGroupLayout],
    'wigner-spatial'
  )

  return { pipeline, bindGroup, bindGroupLayout, spatialParamsBuffer, ...textures }
}

/**
 * Rebuild spatial bind group (e.g., after texture resize).
 */
export function rebuildWignerSpatialBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  shared: WignerSharedResources,
  spatialParamsBuffer: GPUBuffer,
  textures: WignerSpatialTextures
): GPUBindGroup {
  return device.createBindGroup({
    label: 'wigner-spatial-bg',
    layout,
    entries: [
      { binding: 0, resource: { buffer: shared.schroedingerBuffer } },
      { binding: 1, resource: { buffer: shared.basisBuffer } },
      { binding: 2, resource: { buffer: shared.gridParamsBuffer } },
      { binding: 3, resource: { buffer: spatialParamsBuffer } },
      { binding: 4, resource: textures.diagTextureView },
      { binding: 5, resource: textures.crossTexArrayView },
    ],
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Reconstruct Pipeline
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create Phase 2: Reconstruction pipeline.
 */
export async function createWignerReconstructPipeline(
  device: GPUDevice,
  shared: WignerSharedResources,
  spatialTextures: WignerSpatialTextures,
  helpers: WignerPassHelpers
): Promise<WignerReconstructResources> {
  const { wgsl } = composeWignerReconstructComputeShader()
  const shaderModule = helpers.createShaderModule(device, wgsl, 'wigner-reconstruct')

  const reconstructParamsBuffer = helpers.createUniformBuffer(
    device,
    WIGNER_RECONSTRUCT_PARAMS_SIZE,
    'wigner-reconstruct-params'
  )

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'wigner-reconstruct-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float' as const, viewDimension: '2d' as const },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float' as const, viewDimension: '2d-array' as const },
      },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only' as const,
          format: 'rgba16float' as GPUTextureFormat,
          viewDimension: '2d' as GPUTextureViewDimension,
        },
      },
    ],
  })

  const bindGroup = rebuildWignerReconstructBindGroup(
    device,
    bindGroupLayout,
    spatialTextures,
    reconstructParamsBuffer,
    shared.cacheTextureView
  )

  const pipeline = await helpers.createComputePipelineAsync(
    device,
    shaderModule,
    [bindGroupLayout],
    'wigner-reconstruct'
  )

  return { pipeline, bindGroup, bindGroupLayout, reconstructParamsBuffer }
}

/**
 * Rebuild reconstruct bind group (e.g., after texture resize).
 */
export function rebuildWignerReconstructBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  spatialTextures: WignerSpatialTextures,
  reconstructParamsBuffer: GPUBuffer,
  cacheTextureView: GPUTextureView
): GPUBindGroup {
  return device.createBindGroup({
    label: 'wigner-reconstruct-bg',
    layout,
    entries: [
      { binding: 0, resource: spatialTextures.diagTextureView },
      { binding: 1, resource: spatialTextures.crossTexArrayView },
      { binding: 2, resource: { buffer: reconstructParamsBuffer } },
      { binding: 3, resource: cacheTextureView },
    ],
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Spatial Params Upload
// ───────────────────────────────────────────────────────────────────────────

/**
 * Upload the spatial params buffer (layer-to-pair mapping).
 * Called once during pipeline creation — mapping is static.
 */
export function uploadWignerSpatialParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  crossPairs: CrossPairInfo[],
  numCrossLayers: number
): void {
  const data = new ArrayBuffer(WIGNER_SPATIAL_PARAMS_SIZE)
  const u32View = new Uint32Array(data)
  const i32View = new Int32Array(data)

  // numPairs (offset 0)
  u32View[0] = crossPairs.length
  // numLayers (offset 4)
  u32View[1] = numCrossLayers

  // layerPairs: group pairs by layer, 2 per layer
  // offset 16 = index 4 in i32 view
  const baseOffset = 4

  for (let layerIdx = 0; layerIdx < numCrossLayers; layerIdx++) {
    const pairIdx0 = layerIdx * 2
    const pairIdx1 = layerIdx * 2 + 1
    const layerOffset = baseOffset + layerIdx * 4

    const pair0 = crossPairs[pairIdx0]!
    i32View[layerOffset + 0] = pair0.termJ
    i32View[layerOffset + 1] = pair0.termK

    if (pairIdx1 < crossPairs.length) {
      const pair1 = crossPairs[pairIdx1]!
      i32View[layerOffset + 2] = pair1.termJ
      i32View[layerOffset + 3] = pair1.termK
    } else {
      i32View[layerOffset + 2] = -1
      i32View[layerOffset + 3] = -1
    }
  }

  device.queue.writeBuffer(buffer, 0, data)
}

// ───────────────────────────────────────────────────────────────────────────
// Cache Texture Creation (shared by initial setup and resize)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create the final cache texture. Used by both initial setup and resize.
 */
export function createWignerCacheTexture(
  device: GPUDevice,
  gridSize: number
): { cacheTexture: GPUTexture; cacheTextureView: GPUTextureView } {
  const cacheTexture = device.createTexture({
    label: 'wigner-cache-final',
    size: { width: gridSize, height: gridSize },
    format: 'rgba16float',
    dimension: '2d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const cacheTextureView = cacheTexture.createView({ label: 'wigner-cache-final-view' })
  return { cacheTexture, cacheTextureView }
}
