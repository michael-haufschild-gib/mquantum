/**
 * TDSE Compute Pass — Pipeline & Bind Group Setup
 *
 * Extracted from TDSEComputePass to keep file sizes manageable.
 * Contains pipeline compilation and bind group assembly.
 *
 * These functions operate on plain parameter objects rather than class
 * instances, receiving only the GPU resources they need and returning
 * the resources they create.
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { renormalizeBlock } from '../shaders/schroedinger/compute/renormalize.wgsl'
import { tdseAbsorberBlock } from '../shaders/schroedinger/compute/tdseAbsorber.wgsl'
import { tdseApplyKineticBlock } from '../shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdseApplyPotentialHalfBlock } from '../shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import {
  tdseComplexPackBlock,
  tdseComplexUnpackBlock,
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  tdseDiagNormFinalizeBlock,
  tdseDiagNormReduceBlock,
} from '../shaders/schroedinger/compute/tdseDiagnostics.wgsl'
import { tdseInitBlock } from '../shaders/schroedinger/compute/tdseInit.wgsl'
import { tdsePotentialBlock } from '../shaders/schroedinger/compute/tdsePotential.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '../shaders/schroedinger/compute/tdseWriteGrid.wgsl'

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by TDSEComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface TdsePassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/**
 * Pipeline and bind group layout objects created by {@link buildTdsePipelines}.
 */
export interface TdsePipelineResult {
  initPipeline: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  potentialPipeline: GPUComputePipeline
  potentialBGL: GPUBindGroupLayout
  potentialHalfPipeline: GPUComputePipeline
  potentialHalfBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  packBGL: GPUBindGroupLayout
  unpackPipeline: GPUComputePipeline
  unpackBGL: GPUBindGroupLayout
  fftStagePipeline: GPUComputePipeline
  fftStageBGL: GPUBindGroupLayout
  kineticPipeline: GPUComputePipeline
  kineticBGL: GPUBindGroupLayout
  writeGridPipeline: GPUComputePipeline
  writeGridBGL: GPUBindGroupLayout
  diagReducePipeline: GPUComputePipeline
  diagReduceBGL: GPUBindGroupLayout
  diagFinalizePipeline: GPUComputePipeline
  diagFinalizeBGL: GPUBindGroupLayout
}

/**
 * Bind group objects created by {@link rebuildTdseBindGroups}.
 */
export interface TdseBindGroupResult {
  initBG: GPUBindGroup
  potentialBG: GPUBindGroup
  potentialHalfBG: GPUBindGroup
  packBG: GPUBindGroup
  unpackBG: GPUBindGroup
  fftStageABBG: GPUBindGroup
  fftStageBABG: GPUBindGroup
  kineticBG: GPUBindGroup
  writeGridBG: GPUBindGroup
  diagReduceBG: GPUBindGroup
  diagFinalizeBG: GPUBindGroup
  renormalizeBG: GPUBindGroup
  renormalizeUniformBuffer: GPUBuffer
}

/** Buffers and resources needed to create bind groups. */
export interface TdseBindGroupInputs {
  uniformBuffer: GPUBuffer
  psiReBuffer: GPUBuffer
  psiImBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
}

// ───────────────────────────────────────────────────────────────────────────
// buildTdsePipelines
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compile all GPU compute pipelines and their bind group layouts for the
 * TDSE solver.
 *
 * @param device - WebGPU device
 * @param helpers - Base-class helper methods for shader/pipeline creation
 * @returns All pipelines and their associated bind group layouts
 */
export function buildTdsePipelines(
  device: GPUDevice,
  helpers: TdsePassHelpers
): TdsePipelineResult {
  const unifAndIndex = tdseUniformsBlock + freeScalarNDIndexBlock

  // Init
  const initBGL = device.createBindGroupLayout({
    label: 'tdse-init-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdseInitBlock, 'tdse-init'),
    [initBGL],
    'tdse-init'
  )

  // Potential fill
  const potentialBGL = device.createBindGroupLayout({
    label: 'tdse-potential-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdsePotentialBlock, 'tdse-potential'),
    [potentialBGL],
    'tdse-potential'
  )

  // Potential half-step
  const potentialHalfBGL = device.createBindGroupLayout({
    label: 'tdse-potential-half-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const potentialHalfPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + tdseApplyPotentialHalfBlock,
      'tdse-potential-half'
    ),
    [potentialHalfBGL],
    'tdse-potential-half'
  )

  // Absorber (separate pass after Strang step — NOT merged into potential half-step).
  // Running absorption after the FFT kinetic step prevents the FFT from scattering
  // the spatially-modulated absorber profile across k-space.
  // Reuses initBGL layout (uniform + psiRe + psiIm).
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + pmlProfileBlock + tdseAbsorberBlock,
      'tdse-absorber'
    ),
    [initBGL],
    'tdse-absorber'
  )

  // Renormalization: reads diagResult[0] (totalNorm) and scales ψ by 1/√(totalNorm).
  // Layout: uniform(totalElements) + diagResult(read) + psiRe(rw) + psiIm(rw)
  const renormalizeBGL = device.createBindGroupLayout({
    label: 'tdse-renormalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const renormalizePipeline = device.createComputePipeline({
    label: 'tdse-renormalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
    compute: {
      module: device.createShaderModule({ label: 'tdse-renormalize', code: renormalizeBlock }),
      entryPoint: 'main',
    },
  })

  // Pack
  const packUnifBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}
`
  const packBGL = device.createBindGroupLayout({
    label: 'tdse-pack-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const packPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      packUnifBlock + tdseComplexPackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''),
      'tdse-pack'
    ),
    [packBGL],
    'tdse-pack'
  )

  // Unpack
  const unpackBGL = device.createBindGroupLayout({
    label: 'tdse-unpack-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const unpackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      packUnifBlock + tdseComplexUnpackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''),
      'tdse-unpack'
    ),
    [unpackBGL],
    'tdse-unpack'
  )

  // FFT stage
  const fftStageBGL = device.createBindGroupLayout({
    label: 'tdse-fft-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const fftStagePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      tdseFFTStageUniformsBlock + tdseStockhamFFTBlock,
      'tdse-fft-stage'
    ),
    [fftStageBGL],
    'tdse-fft-stage'
  )

  // Kinetic (operates on interleaved complex buffer)
  const kineticBGL = device.createBindGroupLayout({
    label: 'tdse-kinetic-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdseApplyKineticBlock, 'tdse-kinetic'),
    [kineticBGL],
    'tdse-kinetic'
  )

  // Write grid
  const writeGridBGL = device.createBindGroupLayout({
    label: 'tdse-write-grid-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
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
    helpers.createShaderModule(device, unifAndIndex + tdseWriteGridBlock, 'tdse-write-grid'),
    [writeGridBGL],
    'tdse-write-grid'
  )

  // Diagnostics: norm reduction (pass 1)
  const diagReduceBGL = device.createBindGroupLayout({
    label: 'tdse-diag-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const diagReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, tdseDiagNormReduceBlock, 'tdse-diag-reduce'),
    [diagReduceBGL],
    'tdse-diag-reduce'
  )

  // Diagnostics: norm finalize (pass 2)
  const diagFinalizeBGL = device.createBindGroupLayout({
    label: 'tdse-diag-finalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const diagFinalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, tdseDiagNormFinalizeBlock, 'tdse-diag-finalize'),
    [diagFinalizeBGL],
    'tdse-diag-finalize'
  )

  return {
    initPipeline,
    initBGL,
    potentialPipeline,
    potentialBGL,
    potentialHalfPipeline,
    potentialHalfBGL,
    absorberPipeline,
    renormalizePipeline,
    renormalizeBGL,
    packPipeline,
    packBGL,
    unpackPipeline,
    unpackBGL,
    fftStagePipeline,
    fftStageBGL,
    kineticPipeline,
    kineticBGL,
    writeGridPipeline,
    writeGridBGL,
    diagReducePipeline,
    diagReduceBGL,
    diagFinalizePipeline,
    diagFinalizeBGL,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// rebuildTdseBindGroups
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create all bind groups for the TDSE compute pass from pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from {@link buildTdsePipelines}
 * @param inputs - GPU buffers and resources
 * @param oldRenormUniformBuffer - Previous renormalize uniform buffer to destroy (may be null)
 * @returns All bind groups and the renormalize uniform buffer
 */
export function rebuildTdseBindGroups(
  device: GPUDevice,
  pipelines: TdsePipelineResult,
  inputs: TdseBindGroupInputs,
  oldRenormUniformBuffer: GPUBuffer | null
): TdseBindGroupResult {
  const {
    uniformBuffer,
    psiReBuffer,
    psiImBuffer,
    potentialBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
    packUniformBuffer,
    densityTextureView,
    diagUniformBuffer,
    diagPartialSumsBuffer,
    diagPartialMaxBuffer,
    diagPartialLeftBuffer,
    diagPartialRightBuffer,
    diagResultBuffer,
    totalSites,
  } = inputs

  const initBG = device.createBindGroup({
    label: 'tdse-init-bg',
    layout: pipelines.initBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
    ],
  })

  const potentialBG = device.createBindGroup({
    label: 'tdse-potential-bg',
    layout: pipelines.potentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
    ],
  })

  const potentialHalfBG = device.createBindGroup({
    label: 'tdse-potential-half-bg',
    layout: pipelines.potentialHalfBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
    ],
  })

  const packBG = device.createBindGroup({
    label: 'tdse-pack-bg',
    layout: pipelines.packBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: fftScratchA } },
    ],
  })

  const unpackBG = device.createBindGroup({
    label: 'tdse-unpack-bg',
    layout: pipelines.unpackBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: psiReBuffer } },
      { binding: 3, resource: { buffer: psiImBuffer } },
    ],
  })

  // FFT bind groups for A->B and B->A ping-pong
  const fftStageABBG = device.createBindGroup({
    label: 'tdse-fft-ab-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'tdse-fft-ba-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
    ],
  })

  const kineticBG = device.createBindGroup({
    label: 'tdse-kinetic-bg',
    layout: pipelines.kineticBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'tdse-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
      { binding: 4, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups
  const diagReduceBG = device.createBindGroup({
    label: 'tdse-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: psiReBuffer } },
      { binding: 2, resource: { buffer: psiImBuffer } },
      { binding: 3, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 4, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 5, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 6, resource: { buffer: diagPartialRightBuffer } },
    ],
  })

  const diagFinalizeBG = device.createBindGroup({
    label: 'tdse-diag-finalize-bg',
    layout: pipelines.diagFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 2, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 3, resource: { buffer: diagResultBuffer } },
      { binding: 4, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 5, resource: { buffer: diagPartialRightBuffer } },
    ],
  })

  // Renormalization bind group
  oldRenormUniformBuffer?.destroy()
  const renormalizeUniformBuffer = device.createBuffer({
    label: 'tdse-renormalize-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // TDSE has 1 component; BEC also has 1 component (shared pass)
  // targetNorm (f32 at offset 4) starts at 0; updated when initialNorm is captured
  const renormBuf = new ArrayBuffer(16)
  new Uint32Array(renormBuf)[0] = totalSites
  new Float32Array(renormBuf)[1] = 0 // targetNorm = 0 → shader skips until set
  device.queue.writeBuffer(renormalizeUniformBuffer, 0, renormBuf)
  const renormalizeBG = device.createBindGroup({
    label: 'tdse-renormalize-bg',
    layout: pipelines.renormalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: renormalizeUniformBuffer } },
      { binding: 1, resource: { buffer: diagResultBuffer } },
      { binding: 2, resource: { buffer: psiReBuffer } },
      { binding: 3, resource: { buffer: psiImBuffer } },
    ],
  })

  return {
    initBG,
    potentialBG,
    potentialHalfBG,
    packBG,
    unpackBG,
    fftStageABBG,
    fftStageBABG,
    kineticBG,
    writeGridBG,
    diagReduceBG,
    diagFinalizeBG,
    renormalizeBG,
    renormalizeUniformBuffer,
  }
}
