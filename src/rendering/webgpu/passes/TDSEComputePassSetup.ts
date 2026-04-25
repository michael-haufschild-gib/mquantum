/** TDSE Compute Pass — Pipeline & Bind Group Setup */
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { tdseRenormalizeVec2Block } from '../shaders/schroedinger/compute/renormalize.wgsl'
import {
  tdseAbsorberBlock,
  tdseAbsorberBlock3D,
} from '../shaders/schroedinger/compute/tdseAbsorber.wgsl'
import { tdseApplyKineticBlock } from '../shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdseApplyPotentialHalfBlock } from '../shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import {
  tdseComplexPackVec2ShaderBlock,
  tdseComplexUnpackVec2ShaderBlock,
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
import { tdseInitBlock, tdseInitBlock3D } from '../shaders/schroedinger/compute/tdseInit.wgsl'
import {
  tdsePotentialBlock,
  tdsePotentialBlock3D,
} from '../shaders/schroedinger/compute/tdsePotential.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTTwiddleBlock,
} from '../shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTTwiddleBlock,
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
  /**
   * 3-D dispatch variant of {@link initPipeline}. Same layout, same output;
   * @workgroup_size(4,4,4) reads gid.xyz directly instead of decomposing
   * the linear gid.x via linearToND. Selected by host when latticeDim===3
   * (see pickSiteDispatch in computePassUtils).
   */
  initPipeline3D: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  potentialPipeline: GPUComputePipeline
  /** 3-D dispatch variant of {@link potentialPipeline}. See initPipeline3D. */
  potentialPipeline3D: GPUComputePipeline
  potentialBGL: GPUBindGroupLayout
  potentialHalfPipeline: GPUComputePipeline
  potentialHalfBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  /** 3-D dispatch variant of {@link absorberPipeline}. See initPipeline3D. */
  absorberPipeline3D: GPUComputePipeline
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
  /** Merged ψ (array<vec2f>). */
  psiBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  /** Per-axis uniform buffer for shared-memory FFT (legacy singular — used by observables path). */
  fftAxisUniformBuffer: GPUBuffer
  /** PERF: per-slot axis uniforms (length = 2 × latticeDim) for batched Strang FFT. */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed radix-2 twiddle table bound to every TDSE FFT dispatch
   * (shared-mem + per-stage kernels). Replaces per-thread `cos/sin` at
   * stages >= 2. See `TDSEFFTTwiddle.ts` for format.
   */
  fftTwiddleBuffer: GPUBuffer
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

/** Pure WGSL for the TDSE init compute shader (1-D dispatch variant). */
export function composeTdseInitShader(): string {
  return tdsePrelude() + tdseInitBlock
}

/**
 * Pure WGSL for the TDSE init compute shader (3-D dispatch variant).
 * Uses @workgroup_size(4, 4, 4) and reads gid.xyz directly. Bit-identical
 * output to {@link composeTdseInitShader}; only the dispatch shape and
 * coord-decomposition path differ.
 */
export function composeTdseInit3DShader(): string {
  return tdsePrelude() + tdseInitBlock3D
}

/** Pure WGSL for the TDSE potential-fill compute shader (1-D variant). */
export function composeTdsePotentialShader(): string {
  return tdsePrelude() + tdsePotentialBlock
}

/** Pure WGSL for the TDSE potential-fill compute shader (3-D variant). */
export function composeTdsePotential3DShader(): string {
  return tdsePrelude() + tdsePotentialBlock3D
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

/** Pure WGSL for the TDSE absorber (post-FFT) compute shader (1-D variant). */
export function composeTdseAbsorberShader(): string {
  return tdsePrelude() + pmlProfileBlock + tdseAbsorberBlock
}

/** Pure WGSL for the TDSE absorber (post-FFT) compute shader (3-D variant). */
export function composeTdseAbsorber3DShader(): string {
  return tdsePrelude() + pmlProfileBlock + tdseAbsorberBlock3D
}

/** Pure WGSL for the TDSE renormalization compute shader (vec2f ψ). */
export function composeTdseRenormalizeShader(): string {
  return tdseRenormalizeVec2Block
}

/** Pure WGSL for the TDSE pack compute shader (vec2f ψ → interleaved complex). */
export function composeTdsePackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexPackVec2ShaderBlock]).wgsl
}

/** Pure WGSL for the TDSE unpack compute shader (interleaved complex → vec2f ψ). */
export function composeTdseUnpackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexUnpackVec2ShaderBlock]).wgsl
}

/**
 * Pure WGSL for the Stockham FFT per-stage compute shader (TDSE variant).
 *
 * Uses the twiddle-table fork of the kernel — stages >= 2 look the complex
 * exponential up in a CPU-precomputed `storage` buffer instead of calling
 * `cos/sin` per thread. See `TDSEFFTTwiddle.ts` for table layout. Dirac and
 * Pauli compile the original `tdseStockhamFFTBlock` elsewhere.
 */
export function composeTdseFftStageShader(): string {
  return tdseFFTStageUniformsBlock + tdseStockhamFFTTwiddleBlock
}

/**
 * Pure WGSL for the shared-memory per-axis FFT compute shader (TDSE variant).
 *
 * Twiddle-table fork of the kernel (stages >= 2 use the table). Stage-0
 * (W^0 = (1,0)) and stage-1 (twiddles in {(1,0), (0,-dir)}) remain specialized
 * and need no table read.
 */
export function composeTdseFftSharedMemShader(): string {
  return fftAxisUniformsBlock + tdseSharedMemFFTTwiddleBlock
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
  // the matching `var<storage, read>` declaration. Binding 1 is the merged ψ
  // (array<vec2f>) — formerly two separate psiRe/psiIm bindings.
  const initBGL = createComputeBGL(device, 'tdse-init-bgl', ['read-only-storage', 'storage'])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseInitShader(), 'tdse-init'),
    [initBGL],
    'tdse-init'
  )
  // 3-D dispatch sibling — identical bindings, @workgroup_size(4,4,4) body.
  const initPipeline3D = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseInit3DShader(), 'tdse-init-3d'),
    [initBGL],
    'tdse-init-3d'
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
  const potentialPipeline3D = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdsePotential3DShader(), 'tdse-potential-3d'),
    [potentialBGL],
    'tdse-potential-3d'
  )

  // Potential half-step. Binding 0 (TDSEUniforms) — see init BGL comment.
  // Binding 1 = merged ψ (storage), binding 2 = potential (read).
  const potentialHalfBGL = createComputeBGL(device, 'tdse-potential-half-bgl', [
    'read-only-storage',
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
  // Bindings: TDSEUniforms(storage), psi(vec2f rw), potential(r), complexBuf(rw).
  // Binding 0 (TDSEUniforms) — see init BGL comment.
  const fusedPotentialPackBGL = createComputeBGL(device, 'tdse-fused-potential-pack-bgl', [
    'read-only-storage',
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
  // Bindings: TDSEUniforms(storage), complexBuf(r), psi(vec2f rw), potential(r).
  // Binding 0 (TDSEUniforms) — see init BGL comment.
  const fusedUnpackPotentialBGL = createComputeBGL(device, 'tdse-fused-unpack-potential-bgl', [
    'read-only-storage',
    'read-only-storage',
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
  const absorberPipeline3D = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseAbsorber3DShader(), 'tdse-absorber-3d'),
    [initBGL],
    'tdse-absorber-3d'
  )

  // Renormalization: reads diagResult[0] (totalNorm) and scales ψ by 1/√(totalNorm).
  // Layout: uniform(totalElements) + diagResult(read) + psi(vec2f rw).
  const renormalizeBGL = createComputeBGL(device, 'tdse-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const renormalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseRenormalizeShader(), 'tdse-renormalize'),
    [renormalizeBGL],
    'tdse-renormalize'
  )

  // Pack (vec2f ψ → interleaved complex)
  const packBGL = createComputeBGL(device, 'tdse-pack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const packPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdsePackShader(), 'tdse-pack'),
    [packBGL],
    'tdse-pack'
  )

  // Unpack (interleaved complex → vec2f ψ)
  const unpackBGL = createComputeBGL(device, 'tdse-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const unpackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseUnpackShader(), 'tdse-unpack'),
    [unpackBGL],
    'tdse-unpack'
  )

  // FFT stage. Binding 3 is the twiddle table — precomputed CPU-side, read-only.
  // See TDSEFFTTwiddle.ts for the layout. Separate TDSE-only BGL so Dirac/Pauli
  // (which reuse the unforked shader block) keep their 3-entry FFT layout.
  const fftStageBGL = createComputeBGL(device, 'tdse-fft-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const fftStagePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeTdseFftStageShader(), 'tdse-fft-stage'),
    [fftStageBGL],
    'tdse-fft-stage'
  )

  // Shared-memory FFT: one dispatch per axis (all stages in workgroup shared memory).
  // Binding 2 is the twiddle table (same buffer as the per-stage kernel above).
  const fftSharedMemBGL = createComputeBGL(device, 'tdse-fft-shared-mem-bgl', [
    'uniform',
    'storage',
    'read-only-storage',
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
  // Layout: params(r), psi(vec2f r), potential(r), outputTex.
  const writeGridBGL = createComputeBGL(device, 'tdse-write-grid-bgl', [
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

  // Diagnostics: norm reduction (pass 1). ψ is now a single vec2f binding;
  // the 5 partial-sum buffers keep their existing layout.
  const diagReduceBGL = createComputeBGL(device, 'tdse-diag-reduce-bgl', [
    'uniform',
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
    initPipeline3D,
    initBGL,
    potentialPipeline,
    potentialPipeline3D,
    potentialBGL,
    potentialHalfPipeline,
    potentialHalfBGL,
    fusedPotentialPackPipeline,
    fusedPotentialPackBGL,
    fusedUnpackPotentialPipeline,
    fusedUnpackPotentialBGL,
    absorberPipeline,
    absorberPipeline3D,
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
