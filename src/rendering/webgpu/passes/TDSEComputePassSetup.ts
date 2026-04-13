/** TDSE Compute Pass — Pipeline & Bind Group Setup */
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { renormalizeBlock } from '../shaders/schroedinger/compute/renormalize.wgsl'
import { tdseAbsorberBlock } from '../shaders/schroedinger/compute/tdseAbsorber.wgsl'
import { tdseApplyKineticBlock } from '../shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdseApplyPotentialHalfBlock } from '../shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import {
  tdseComplexPackShaderBlock,
  tdseComplexUnpackShaderBlock,
  tdsePackUniformsShaderBlock,
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  tdseDiagNormFinalizeBlock,
  tdseDiagNormReduceBlock,
} from '../shaders/schroedinger/compute/tdseDiagnostics.wgsl'
import {
  tdseFusedPotentialPackBlock,
  tdseFusedUnpackPotentialBlock,
} from '../shaders/schroedinger/compute/tdseFusedKernels.wgsl'
import { tdseInitBlock } from '../shaders/schroedinger/compute/tdseInit.wgsl'
import { tdsePotentialBlock } from '../shaders/schroedinger/compute/tdsePotential.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTBlock,
} from '../shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '../shaders/schroedinger/compute/tdseWriteGrid.wgsl'
import { assembleShaderBlocks } from '../shaders/shared/compose-helpers'
import { createComputeBGL } from '../utils/computeBindGroupLayout'
import type { ObsGSPipelineResult } from './TDSEObservablesGSPipelines'
import { buildObsGSPipelines } from './TDSEObservablesGSPipelines'

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
export interface TdsePipelineResult extends ObsGSPipelineResult {
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
  /** PERF: Fused potentialHalf + pack kernel (saves 1 dispatch per substep) */
  fusedPotentialPackPipeline: GPUComputePipeline
  fusedPotentialPackBGL: GPUBindGroupLayout
  /** PERF: Fused unpack + potentialHalf kernel (saves 1 dispatch per substep) */
  fusedUnpackPotentialPipeline: GPUComputePipeline
  fusedUnpackPotentialBGL: GPUBindGroupLayout
  fftStagePipeline: GPUComputePipeline
  fftStageBGL: GPUBindGroupLayout
  /** Shared-memory FFT: one dispatch per axis (replaces per-stage Stockham for TDSE) */
  fftSharedMemPipeline: GPUComputePipeline
  fftSharedMemBGL: GPUBindGroupLayout
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
  fusedPotentialPackBG: GPUBindGroup
  fusedUnpackPotentialBG: GPUBindGroup
  packBG: GPUBindGroup
  unpackBG: GPUBindGroup
  fftStageABBG: GPUBindGroup
  fftStageBABG: GPUBindGroup
  /** Shared-memory FFT bind group: axis uniforms + complexBuf(rw) */
  fftSharedMemBG: GPUBindGroup
  /** PERF: per-slot FFT bind groups (length = 2 × latticeDim) for batched Strang dispatch. */
  fftSharedMemBGs: GPUBindGroup[]
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
  /** Per-axis uniform buffer for shared-memory FFT (legacy singular — used by observables path). */
  fftAxisUniformBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms (length = 2 × latticeDim) for batched Strang FFT. */
  fftAxisUniformBuffers: GPUBuffer[]
  packUniformBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialSumsBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialLeftBuffer: GPUBuffer
  diagPartialRightBuffer: GPUBuffer
  diagPartialIprBuffer: GPUBuffer
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
  const initBGL = createComputeBGL(device, 'tdse-init-bgl', ['uniform', 'storage', 'storage'])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdseInitBlock, 'tdse-init'),
    [initBGL],
    'tdse-init'
  )

  // Potential fill
  const potentialBGL = createComputeBGL(device, 'tdse-potential-bgl', ['uniform', 'storage'])
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdsePotentialBlock, 'tdse-potential'),
    [potentialBGL],
    'tdse-potential'
  )

  // Potential half-step
  const potentialHalfBGL = createComputeBGL(device, 'tdse-potential-half-bgl', [
    'uniform',
    'storage',
    'storage',
    'read-only-storage',
  ])
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

  // PERF: Fused potentialHalf + pack kernel
  // Bindings: uniform, psiRe(rw), psiIm(rw), potential(r), complexBuf(rw)
  const fusedPotentialPackBGL = createComputeBGL(device, 'tdse-fused-potential-pack-bgl', [
    'uniform',
    'storage',
    'storage',
    'read-only-storage',
    'storage',
  ])
  const fusedPotentialPackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + tdseFusedPotentialPackBlock,
      'tdse-fused-potential-pack'
    ),
    [fusedPotentialPackBGL],
    'tdse-fused-potential-pack'
  )

  // PERF: Fused unpack + potentialHalf kernel
  // Bindings: uniform, complexBuf(r), psiRe(rw), psiIm(rw), potential(r)
  const fusedUnpackPotentialBGL = createComputeBGL(device, 'tdse-fused-unpack-potential-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const fusedUnpackPotentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + tdseFusedUnpackPotentialBlock,
      'tdse-fused-unpack-potential'
    ),
    [fusedUnpackPotentialBGL],
    'tdse-fused-unpack-potential'
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
  const renormalizeBGL = createComputeBGL(device, 'tdse-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const renormalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, renormalizeBlock, 'tdse-renormalize'),
    [renormalizeBGL],
    'tdse-renormalize'
  )

  // Pack
  const packBGL = createComputeBGL(device, 'tdse-pack-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const packPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexPackShaderBlock]).wgsl,
      'tdse-pack'
    ),
    [packBGL],
    'tdse-pack'
  )

  // Unpack
  const unpackBGL = createComputeBGL(device, 'tdse-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const unpackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexUnpackShaderBlock]).wgsl,
      'tdse-unpack'
    ),
    [unpackBGL],
    'tdse-unpack'
  )

  // FFT stage
  const fftStageBGL = createComputeBGL(device, 'tdse-fft-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
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

  // Shared-memory FFT: one dispatch per axis (all stages in workgroup shared memory)
  const fftSharedMemBGL = createComputeBGL(device, 'tdse-fft-shared-mem-bgl', [
    'uniform',
    'storage',
  ])
  const fftSharedMemPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      fftAxisUniformsBlock + tdseSharedMemFFTBlock,
      'tdse-fft-shared-mem'
    ),
    [fftSharedMemBGL],
    'tdse-fft-shared-mem'
  )

  // Kinetic (operates on interleaved complex buffer)
  const kineticBGL = createComputeBGL(device, 'tdse-kinetic-bgl', ['uniform', 'storage'])
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdseApplyKineticBlock, 'tdse-kinetic'),
    [kineticBGL],
    'tdse-kinetic'
  )

  // Write grid
  const writeGridBGL = createComputeBGL(device, 'tdse-write-grid-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + tdseWriteGridBlock, 'tdse-write-grid'),
    [writeGridBGL],
    'tdse-write-grid'
  )

  // Diagnostics: norm reduction (pass 1)
  const diagReduceBGL = createComputeBGL(device, 'tdse-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
    'storage',
    'storage',
  ])
  const diagReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, tdseDiagNormReduceBlock, 'tdse-diag-reduce'),
    [diagReduceBGL],
    'tdse-diag-reduce'
  )

  // Diagnostics: norm finalize (pass 2)
  const diagFinalizeBGL = createComputeBGL(device, 'tdse-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
  ])
  const diagFinalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, tdseDiagNormFinalizeBlock, 'tdse-diag-finalize'),
    [diagFinalizeBGL],
    'tdse-diag-finalize'
  )

  // Observable + Gram-Schmidt pipelines (extracted to separate file for line limit)
  const obsGS = buildObsGSPipelines(device, helpers)

  return {
    initPipeline,
    initBGL,
    potentialPipeline,
    potentialBGL,
    potentialHalfPipeline,
    potentialHalfBGL,
    fusedPotentialPackPipeline,
    fusedPotentialPackBGL,
    fusedUnpackPotentialPipeline,
    fusedUnpackPotentialBGL,
    absorberPipeline,
    renormalizePipeline,
    renormalizeBGL,
    packPipeline,
    packBGL,
    unpackPipeline,
    unpackBGL,
    fftStagePipeline,
    fftStageBGL,
    fftSharedMemPipeline,
    fftSharedMemBGL,
    kineticPipeline,
    kineticBGL,
    writeGridPipeline,
    writeGridBGL,
    diagReducePipeline,
    diagReduceBGL,
    diagFinalizePipeline,
    diagFinalizeBGL,
    ...obsGS,
  }
}

// Bind group creation extracted to TDSEComputePassBindGroups.ts
export { rebuildTdseBindGroups } from './TDSEComputePassBindGroups'
