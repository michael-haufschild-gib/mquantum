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
import { tdseCurvatureHelpersBlock } from '../shaders/schroedinger/compute/tdseCurvatureHelpers.wgsl'
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

// --- Pure WGSL composers (Phase 2b) ---
// Shared prelude for every shader that indexes an ND lattice with the
// standard TDSE uniform struct.
const tdsePrelude = (): string => tdseUniformsBlock + freeScalarNDIndexBlock

/** Pure WGSL for the TDSE init compute shader. */
export function composeTdseInitShader(): string {
  return tdsePrelude() + tdseInitBlock
}

/** Pure WGSL for the TDSE potential-fill compute shader. */
export function composeTdsePotentialShader(): string {
  return tdsePrelude() + tdsePotentialBlock
}

/** Pure WGSL for the TDSE potential half-step compute shader. */
export function composeTdsePotentialHalfShader(): string {
  return tdsePrelude() + tdseApplyPotentialHalfBlock
}

/** Pure WGSL for the TDSE fused potentialHalf+pack kernel. */
export function composeTdseFusedPotentialPackShader(): string {
  return tdsePrelude() + tdseFusedPotentialPackBlock
}

/** Pure WGSL for the TDSE fused unpack+potentialHalf kernel. */
export function composeTdseFusedUnpackPotentialShader(): string {
  return tdsePrelude() + tdseFusedUnpackPotentialBlock
}

/** Pure WGSL for the TDSE absorber (post-FFT) compute shader. */
export function composeTdseAbsorberShader(): string {
  return tdsePrelude() + pmlProfileBlock + tdseAbsorberBlock
}

/** Pure WGSL for the TDSE renormalization compute shader. */
export function composeTdseRenormalizeShader(): string {
  return renormalizeBlock
}

/** Pure WGSL for the TDSE pack compute shader. */
export function composeTdsePackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexPackShaderBlock]).wgsl
}

/** Pure WGSL for the TDSE unpack compute shader. */
export function composeTdseUnpackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexUnpackShaderBlock]).wgsl
}

/** Pure WGSL for the Stockham FFT stage compute shader. */
export function composeTdseFftStageShader(): string {
  return tdseFFTStageUniformsBlock + tdseStockhamFFTBlock
}

/** Pure WGSL for the shared-memory per-axis FFT compute shader. */
export function composeTdseFftSharedMemShader(): string {
  return fftAxisUniformsBlock + tdseSharedMemFFTBlock
}

/** Pure WGSL for the TDSE kinetic (k-space diagonal phase) compute shader. */
export function composeTdseKineticShader(): string {
  return tdsePrelude() + tdseApplyKineticBlock
}

/** Pure WGSL for the TDSE write-grid compute shader. */
export function composeTdseWriteGridShader(): string {
  return tdsePrelude() + tdseCurvatureHelpersBlock + tdseWriteGridBlock
}

/** Pure WGSL for the TDSE diagnostics norm-reduce compute shader. */
export function composeTdseDiagReduceShader(): string {
  return tdseDiagNormReduceBlock
}

/** Pure WGSL for the TDSE diagnostics norm-finalize compute shader. */
export function composeTdseDiagFinalizeShader(): string {
  return tdseDiagNormFinalizeBlock
}

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
  // Init. Binding 0 is `read-only-storage` because TDSEUniforms embeds scalar
  // arrays (spec-forbidden in uniform address space). See tdseInit.wgsl.ts for
  // the matching `var<storage, read>` declaration.
  const initBGL = createComputeBGL(device, 'tdse-init-bgl', [
    'read-only-storage',
    'storage',
    'storage',
  ])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseInitShader(), 'tdse-init'),
    [initBGL],
    'tdse-init'
  )

  // Potential fill. Binding 0 (TDSEUniforms) — see init BGL comment.
  const potentialBGL = createComputeBGL(device, 'tdse-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdsePotentialShader(), 'tdse-potential'),
    [potentialBGL],
    'tdse-potential'
  )

  // Potential half-step. Binding 0 (TDSEUniforms) — see init BGL comment.
  const potentialHalfBGL = createComputeBGL(device, 'tdse-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const potentialHalfPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdsePotentialHalfShader(), 'tdse-potential-half'),
    [potentialHalfBGL],
    'tdse-potential-half'
  )

  // PERF: Fused potentialHalf + pack kernel.
  // Bindings: TDSEUniforms(storage), psiRe(rw), psiIm(rw), potential(r), complexBuf(rw).
  // Binding 0 (TDSEUniforms) — see init BGL comment.
  const fusedPotentialPackBGL = createComputeBGL(device, 'tdse-fused-potential-pack-bgl', [
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
    'storage',
  ])
  const fusedPotentialPackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      composeTdseFusedPotentialPackShader(),
      'tdse-fused-potential-pack'
    ),
    [fusedPotentialPackBGL],
    'tdse-fused-potential-pack'
  )

  // PERF: Fused unpack + potentialHalf kernel.
  // Bindings: TDSEUniforms(storage), complexBuf(r), psiRe(rw), psiIm(rw), potential(r).
  // Binding 0 (TDSEUniforms) — see init BGL comment.
  const fusedUnpackPotentialBGL = createComputeBGL(device, 'tdse-fused-unpack-potential-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const fusedUnpackPotentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      composeTdseFusedUnpackPotentialShader(),
      'tdse-fused-unpack-potential'
    ),
    [fusedUnpackPotentialBGL],
    'tdse-fused-unpack-potential'
  )

  // Absorber — reuses initBGL layout.
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseAbsorberShader(), 'tdse-absorber'),
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
    helpers.createShaderModule(device, composeTdseRenormalizeShader(), 'tdse-renormalize'),
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
    helpers.createShaderModule(device, composeTdsePackShader(), 'tdse-pack'),
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
    helpers.createShaderModule(device, composeTdseUnpackShader(), 'tdse-unpack'),
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
    helpers.createShaderModule(device, composeTdseFftStageShader(), 'tdse-fft-stage'),
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
    helpers.createShaderModule(device, composeTdseFftSharedMemShader(), 'tdse-fft-shared-mem'),
    [fftSharedMemBGL],
    'tdse-fft-shared-mem'
  )

  // Kinetic (operates on interleaved complex buffer). Binding 0 (TDSEUniforms) — see init BGL comment.
  const kineticBGL = createComputeBGL(device, 'tdse-kinetic-bgl', ['read-only-storage', 'storage'])
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseKineticShader(), 'tdse-kinetic'),
    [kineticBGL],
    'tdse-kinetic'
  )

  // Write grid. Binding 0 (TDSEUniforms) — see init BGL comment.
  const writeGridBGL = createComputeBGL(device, 'tdse-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseWriteGridShader(), 'tdse-write-grid'),
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
    helpers.createShaderModule(device, composeTdseDiagReduceShader(), 'tdse-diag-reduce'),
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
    helpers.createShaderModule(device, composeTdseDiagFinalizeShader(), 'tdse-diag-finalize'),
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
