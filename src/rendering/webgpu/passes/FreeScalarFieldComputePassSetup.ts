/**
 * Free Scalar Field Compute Pass — Pipeline & Bind Group Setup
 *
 * Extracted from FreeScalarFieldComputePass to keep file sizes manageable.
 * Contains pipeline compilation and bind group assembly.
 *
 * These functions operate on plain parameter objects rather than class
 * instances, receiving only the GPU resources they need and returning
 * the resources they create.
 */

import { freeScalarAbsorberBlock } from '../shaders/schroedinger/compute/freeScalarAbsorber.wgsl'
import {
  freeScalarInitBlock,
  freeScalarUniformsBlock,
} from '../shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { freeScalarUpdatePhiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl'
import { freeScalarUpdatePiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePi.wgsl'
import { freeScalarWriteGridBlock } from '../shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by FreeScalarFieldComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface FsfPassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
}

/**
 * Pipeline and bind group layout objects created by {@link buildFsfPipelines}.
 */
export interface FsfPipelineResult {
  initPipeline: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  updatePiPipeline: GPUComputePipeline
  updatePiBGL: GPUBindGroupLayout
  updatePhiPipeline: GPUComputePipeline
  updatePhiBGL: GPUBindGroupLayout
  writeGridPipeline: GPUComputePipeline
  writeGridBGL: GPUBindGroupLayout
}

/**
 * Bind group objects created by {@link rebuildFsfBindGroups}.
 */
export interface FsfBindGroupResult {
  initBG: GPUBindGroup
  updatePiBG: GPUBindGroup
  updatePhiBG: GPUBindGroup
  writeGridBG: GPUBindGroup
}

/** Buffers and resources needed to create bind groups. */
export interface FsfBindGroupInputs {
  uniformBuffer: GPUBuffer
  phiBuffer: GPUBuffer
  piBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  analysisTextureView: GPUTextureView
}

// ───────────────────────────────────────────────────────────────────────────
// buildFsfPipelines
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compile all GPU compute pipelines and their bind group layouts for the
 * free scalar field solver.
 *
 * @param device - WebGPU device
 * @param helpers - Base-class helper methods for shader/pipeline creation
 * @returns All pipelines and their associated bind group layouts
 */
export function buildFsfPipelines(device: GPUDevice, helpers: FsfPassHelpers): FsfPipelineResult {
  const uniformsAndIndex = freeScalarUniformsBlock + freeScalarNDIndexBlock

  // === Init pipeline (phi + pi read_write) ===
  const initBGL = createComputeBGL(device, 'free-scalar-init-bgl', [
    'uniform',
    'storage',
    'storage',
  ])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, uniformsAndIndex + freeScalarInitBlock, 'free-scalar-init'),
    [initBGL],
    'free-scalar-init'
  )

  // === PML absorber pipeline (reuses init bind group layout: uniform + phi + pi) ===
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      uniformsAndIndex + pmlProfileBlock + freeScalarAbsorberBlock,
      'free-scalar-absorber'
    ),
    [initBGL],
    'free-scalar-absorber'
  )

  // === Update Pi pipeline (phi read-only, pi read_write) ===
  const updatePiBGL = createComputeBGL(device, 'free-scalar-update-pi-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const updatePiPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      uniformsAndIndex + freeScalarUpdatePiBlock,
      'free-scalar-update-pi'
    ),
    [updatePiBGL],
    'free-scalar-update-pi'
  )

  // === Update Phi pipeline (phi read_write, pi read-only) ===
  const updatePhiBGL = createComputeBGL(device, 'free-scalar-update-phi-bgl', [
    'uniform',
    'storage',
    'read-only-storage',
  ])
  const updatePhiPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      freeScalarUniformsBlock + freeScalarUpdatePhiBlock,
      'free-scalar-update-phi'
    ),
    [updatePhiBGL],
    'free-scalar-update-phi'
  )

  // === Write Grid pipeline (phi + pi read-only, texture write) ===
  const writeGridBGL = device.createBindGroupLayout({
    label: 'free-scalar-write-grid-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only',
          format: 'rgba16float',
          viewDimension: '3d',
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only',
          format: 'rgba16float',
          viewDimension: '3d',
        },
      },
    ],
  })
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      uniformsAndIndex + freeScalarWriteGridBlock,
      'free-scalar-write-grid'
    ),
    [writeGridBGL],
    'free-scalar-write-grid'
  )

  return {
    initPipeline,
    initBGL,
    absorberPipeline,
    updatePiPipeline,
    updatePiBGL,
    updatePhiPipeline,
    updatePhiBGL,
    writeGridPipeline,
    writeGridBGL,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// rebuildFsfBindGroups
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create all bind groups for the free scalar field compute pass from
 * pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from {@link buildFsfPipelines}
 * @param inputs - GPU buffers and resources
 * @returns All bind groups
 */
export function rebuildFsfBindGroups(
  device: GPUDevice,
  pipelines: FsfPipelineResult,
  inputs: FsfBindGroupInputs
): FsfBindGroupResult {
  const { uniformBuffer, phiBuffer, piBuffer, densityTextureView, analysisTextureView } = inputs

  const initBG = device.createBindGroup({
    label: 'free-scalar-init-bg',
    layout: pipelines.initBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: phiBuffer } },
      { binding: 2, resource: { buffer: piBuffer } },
    ],
  })

  const updatePiBG = device.createBindGroup({
    label: 'free-scalar-update-pi-bg',
    layout: pipelines.updatePiBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: phiBuffer } },
      { binding: 2, resource: { buffer: piBuffer } },
    ],
  })

  const updatePhiBG = device.createBindGroup({
    label: 'free-scalar-update-phi-bg',
    layout: pipelines.updatePhiBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: phiBuffer } },
      { binding: 2, resource: { buffer: piBuffer } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'free-scalar-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: phiBuffer } },
      { binding: 2, resource: { buffer: piBuffer } },
      { binding: 3, resource: densityTextureView },
      { binding: 4, resource: analysisTextureView },
    ],
  })

  return {
    initBG,
    updatePiBG,
    updatePhiBG,
    writeGridBG,
  }
}
