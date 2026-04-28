/** TDSE Compute Pass — Pipeline & Bind Group Setup */
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { tdseRenormalizeVec2Block } from '../shaders/schroedinger/compute/renormalize.wgsl'
import {
  tdseAbsorberBlock,
  tdseAbsorberBlock3D,
} from '../shaders/schroedinger/compute/tdseAbsorber.wgsl'
import {
  tdseApplyKineticBlock,
  tdseApplyKineticBlock3D,
} from '../shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
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
import { tdseQuantumPressureBlock } from '../shaders/schroedinger/compute/tdseQuantumPressure.wgsl'
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
import type {
  ObsGSPipelineResult,
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePassHelpers,
  TdsePipelineResult,
} from './TDSEComputePassTypes'
import { buildObsGSPipelines } from './TDSEObservablesGSPipelines'

export type {
  ObsGSPipelineResult,
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePassHelpers,
  TdsePipelineResult,
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
 * `cos/sin` per thread. See `FFTTwiddle.ts` for table layout. Dirac and
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

/**
 * Pure WGSL for the TDSE kinetic compute shader, 3-D dispatch variant
 * (@workgroup_size(4,4,4), gid.xyz k-coords). Used when latticeDim===3.
 * Bit-identical writes to {@link composeTdseKineticShader}.
 */
export function composeTdseKinetic3DShader(): string {
  return tdsePrelude() + tdseApplyKineticBlock3D
}

/** Pure WGSL for the TDSE write-grid compute shader. */
export function composeTdseWriteGridShader(): string {
  return tdsePrelude() + tdseCurvatureHelpersBlock + tdseWriteGridBlock + tdseQuantumPressureBlock
}

/** Pure WGSL for the TDSE diagnostics norm-reduce compute shader. */
export function composeTdseDiagReduceShader(): string {
  return tdsePrelude() + tdseCurvatureHelpersBlock + tdseDiagNormReduceBlock
}

/** Pure WGSL for the TDSE diagnostics norm-finalize compute shader. */
export function composeTdseDiagFinalizeShader(): string {
  return tdseDiagNormFinalizeBlock
}

/**
 * Compile all TDSE GPU compute pipelines (and their bind group layouts)
 * asynchronously.
 *
 * Why async: WGSL→backend (Metal/HLSL/SPIR-V) compilation can take
 * hundreds of ms total across the ~25 TDSE compute pipelines. The
 * synchronous `device.createComputePipeline` blocks the JS main thread
 * for that whole compile — which freezes the UI on every config change.
 * Issuing all compiles via `createComputePipelineAsync` and
 * `Promise.all`-ing them lets the browser parallelize compilation
 * across worker threads while the main thread keeps rendering.
 *
 * BGL / shader-module / pipeline-layout creation stays synchronous
 * (those are cheap). Only the pipeline objects themselves are awaited.
 *
 * @param device - WebGPU device
 * @param helpers - Base-class helper methods for shader creation
 * @returns Promise resolving to all pipelines and their bind group layouts
 */
export async function buildTdsePipelines(
  device: GPUDevice,
  helpers: TdsePassHelpers
): Promise<TdsePipelineResult> {
  // ── Bind group layouts (sync, cheap) ───────────────────────────────
  // Init. Binding 0 is `read-only-storage` because TDSEUniforms embeds scalar
  // arrays (spec-forbidden in uniform address space). See tdseInit.wgsl.ts for
  // the matching `var<storage, read>` declaration. Binding 1 is the merged ψ
  // (array<vec2f>) — formerly two separate psiRe/psiIm bindings.
  const initBGL = createComputeBGL(device, 'tdse-init-bgl', ['read-only-storage', 'storage'])
  const potentialBGL = createComputeBGL(device, 'tdse-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialHalfBGL = createComputeBGL(device, 'tdse-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  // PERF: Fused potentialHalf + pack kernel.
  // Bindings: TDSEUniforms(storage), psi(vec2f rw), potential(r), complexBuf(rw).
  const fusedPotentialPackBGL = createComputeBGL(device, 'tdse-fused-potential-pack-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
    'storage',
  ])
  // PERF: Fused unpack + potentialHalf kernel.
  // Bindings: TDSEUniforms(storage), complexBuf(r), psi(vec2f rw), potential(r).
  const fusedUnpackPotentialBGL = createComputeBGL(device, 'tdse-fused-unpack-potential-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  // Renormalization layout: uniform(totalElements) + diagResult(read) + psi(vec2f rw).
  const renormalizeBGL = createComputeBGL(device, 'tdse-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const packBGL = createComputeBGL(device, 'tdse-pack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const unpackBGL = createComputeBGL(device, 'tdse-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  // FFT stage. Binding 3 is the twiddle table — precomputed CPU-side, read-only.
  const fftStageBGL = createComputeBGL(device, 'tdse-fft-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  // Shared-memory FFT: binding 2 is the twiddle table.
  const fftSharedMemBGL = createComputeBGL(device, 'tdse-fft-shared-mem-bgl', [
    'uniform',
    'storage',
    'read-only-storage',
  ])
  const kineticBGL = createComputeBGL(device, 'tdse-kinetic-bgl', ['read-only-storage', 'storage'])
  // Write grid: params(r), psi(vec2f r), potential(r), outputTex.
  const writeGridBGL = createComputeBGL(device, 'tdse-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  // Diagnostics: norm reduction (pass 1). Binding 7 is TDSEUniforms so curved
  // metrics can reduce with the proper-volume measure sqrt(|g|).
  const diagReduceBGL = createComputeBGL(device, 'tdse-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const diagFinalizeBGL = createComputeBGL(device, 'tdse-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
  ])

  // Helper: kick off async pipeline compile with the supplied source +
  // BGL stack. Shader module construction stays synchronous (cheap).
  const issuePipeline = (
    label: string,
    code: string,
    bgls: GPUBindGroupLayout[]
  ): Promise<GPUComputePipeline> =>
    device.createComputePipelineAsync({
      label: `${label}-pipeline`,
      layout: device.createPipelineLayout({
        label: `${label}-layout`,
        bindGroupLayouts: bgls,
      }),
      compute: {
        module: helpers.createShaderModule(device, code, label),
        entryPoint: 'main',
      },
    })

  // Issue every pipeline compile in parallel — TDSE core + observables/GS.
  const [
    initPipeline,
    initPipeline3D,
    potentialPipeline,
    potentialPipeline3D,
    potentialHalfPipeline,
    fusedPotentialPackPipeline,
    fusedUnpackPotentialPipeline,
    absorberPipeline,
    absorberPipeline3D,
    renormalizePipeline,
    packPipeline,
    unpackPipeline,
    fftStagePipeline,
    fftSharedMemPipeline,
    kineticPipeline,
    kineticPipeline3D,
    writeGridPipeline,
    diagReducePipeline,
    diagFinalizePipeline,
    obsGS,
  ] = await Promise.all([
    issuePipeline('tdse-init', composeTdseInitShader(), [initBGL]),
    issuePipeline('tdse-init-3d', composeTdseInit3DShader(), [initBGL]),
    issuePipeline('tdse-potential', composeTdsePotentialShader(), [potentialBGL]),
    issuePipeline('tdse-potential-3d', composeTdsePotential3DShader(), [potentialBGL]),
    issuePipeline('tdse-potential-half', composeTdsePotentialHalfShader(), [potentialHalfBGL]),
    issuePipeline('tdse-fused-potential-pack', composeTdseFusedPotentialPackShader(), [
      fusedPotentialPackBGL,
    ]),
    issuePipeline('tdse-fused-unpack-potential', composeTdseFusedUnpackPotentialShader(), [
      fusedUnpackPotentialBGL,
    ]),
    // Absorber — reuses initBGL layout.
    issuePipeline('tdse-absorber', composeTdseAbsorberShader(), [initBGL]),
    issuePipeline('tdse-absorber-3d', composeTdseAbsorber3DShader(), [initBGL]),
    issuePipeline('tdse-renormalize', composeTdseRenormalizeShader(), [renormalizeBGL]),
    issuePipeline('tdse-pack', composeTdsePackShader(), [packBGL]),
    issuePipeline('tdse-unpack', composeTdseUnpackShader(), [unpackBGL]),
    issuePipeline('tdse-fft-stage', composeTdseFftStageShader(), [fftStageBGL]),
    issuePipeline('tdse-fft-shared-mem', composeTdseFftSharedMemShader(), [fftSharedMemBGL]),
    issuePipeline('tdse-kinetic', composeTdseKineticShader(), [kineticBGL]),
    issuePipeline('tdse-kinetic-3d', composeTdseKinetic3DShader(), [kineticBGL]),
    issuePipeline('tdse-write-grid', composeTdseWriteGridShader(), [writeGridBGL]),
    issuePipeline('tdse-diag-reduce', composeTdseDiagReduceShader(), [diagReduceBGL]),
    issuePipeline('tdse-diag-finalize', composeTdseDiagFinalizeShader(), [diagFinalizeBGL]),
    // Observable + Gram-Schmidt pipelines (extracted to separate file).
    buildObsGSPipelines(device, helpers),
  ])

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
    kineticPipeline3D,
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
