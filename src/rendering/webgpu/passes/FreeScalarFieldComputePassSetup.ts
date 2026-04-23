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
  freeScalarInitShaderBlock,
  freeScalarUniformsBlock,
  freeScalarUniformsShaderBlock,
} from '../shaders/schroedinger/compute/freeScalarInit.wgsl'
import {
  freeScalarNDIndexBlock,
  freeScalarNDIndexShaderBlock,
} from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { freeScalarUpdatePhiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl'
import { freeScalarUpdatePiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePi.wgsl'
import { freeScalarWriteGridBlock } from '../shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { assembleShaderBlocks } from '../shaders/shared/compose-helpers'
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
// --- Pure WGSL composers (Phase 2b) ---
const fsfPrelude = (): string => freeScalarUniformsBlock + freeScalarNDIndexBlock

/** Pure WGSL for the free-scalar-field init compute shader. */
export function composeFsfInitShader(): string {
  return assembleShaderBlocks([
    freeScalarUniformsShaderBlock,
    freeScalarNDIndexShaderBlock,
    freeScalarInitShaderBlock,
  ]).wgsl
}

/** Pure WGSL for the free-scalar-field PML absorber compute shader. */
export function composeFsfAbsorberShader(): string {
  return fsfPrelude() + pmlProfileBlock + freeScalarAbsorberBlock
}

/** Pure WGSL for the free-scalar-field update-π compute shader. */
export function composeFsfUpdatePiShader(): string {
  return fsfPrelude() + freeScalarUpdatePiBlock
}

/** Pure WGSL for the free-scalar-field update-φ compute shader. */
export function composeFsfUpdatePhiShader(): string {
  return freeScalarUniformsBlock + freeScalarUpdatePhiBlock
}

/** Pure WGSL for the free-scalar-field write-grid compute shader. */
export function composeFsfWriteGridShader(): string {
  return fsfPrelude() + freeScalarWriteGridBlock
}

/**
 * Compile every free-scalar-field compute pipeline and return them with
 * their bind group layouts. One-time setup per device.
 */
export function buildFsfPipelines(device: GPUDevice, helpers: FsfPassHelpers): FsfPipelineResult {
  // === Init pipeline (phi + pi read_write) ===
  // Binding 0 is `read-only-storage` (not `uniform`) because `FreeScalarUniforms`
  // embeds scalar arrays (spec-forbidden in uniform address space). See the
  // matching `var<storage, read>` declaration in `freeScalarInit.wgsl.ts`.
  const initBGL = createComputeBGL(device, 'free-scalar-init-bgl', [
    'read-only-storage',
    'storage',
    'storage',
  ])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeFsfInitShader(), 'free-scalar-init'),
    [initBGL],
    'free-scalar-init'
  )

  // === PML absorber pipeline (reuses init bind group layout) ===
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeFsfAbsorberShader(), 'free-scalar-absorber'),
    [initBGL],
    'free-scalar-absorber'
  )

  // === Update Pi pipeline ===
  const updatePiBGL = createComputeBGL(device, 'free-scalar-update-pi-bgl', [
    'read-only-storage', // params — see init BGL comment.
    'read-only-storage',
    'storage',
  ])
  const updatePiPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeFsfUpdatePiShader(), 'free-scalar-update-pi'),
    [updatePiBGL],
    'free-scalar-update-pi'
  )

  // === Update Phi pipeline ===
  const updatePhiBGL = createComputeBGL(device, 'free-scalar-update-phi-bgl', [
    'read-only-storage', // params — see init BGL comment.
    'storage',
    'read-only-storage',
  ])
  const updatePhiPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeFsfUpdatePhiShader(), 'free-scalar-update-phi'),
    [updatePhiBGL],
    'free-scalar-update-phi'
  )

  // === Write Grid pipeline ===
  const tex3dEntry = {
    storageTexture: { format: 'rgba16float' as const, viewDimension: '3d' as const },
  }
  const writeGridBGL = createComputeBGL(device, 'free-scalar-write-grid-bgl', [
    'read-only-storage', // params — see init BGL comment.
    'read-only-storage',
    'read-only-storage',
    tex3dEntry,
    tex3dEntry,
  ])
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeFsfWriteGridShader(), 'free-scalar-write-grid'),
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
