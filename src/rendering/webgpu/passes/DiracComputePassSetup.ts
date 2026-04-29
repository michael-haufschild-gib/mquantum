/**
 * Dirac Compute Pass — Pipeline & Bind Group Setup
 *
 * Extracted from DiracComputePass to keep file sizes manageable.
 * Contains pipeline compilation and bind group assembly.
 * Buffer creation lives in DiracComputePassBuffers.ts.
 *
 * These functions operate on plain parameter objects rather than class
 * instances, receiving only the GPU resources they need and returning
 * the resources they create.
 */

import {
  diracAbsorberBlock,
  diracAbsorberBlock3D,
} from '../shaders/schroedinger/compute/diracAbsorber.wgsl'
import { diracAxialChargeBlock } from '../shaders/schroedinger/compute/diracAxialCharge.wgsl'
import {
  diracDiagNormFinalizeBlock,
  diracDiagNormReduceBlock,
} from '../shaders/schroedinger/compute/diracDiagnostics.wgsl'
import { diracInitBlock, diracInitBlock3D } from '../shaders/schroedinger/compute/diracInit.wgsl'
import {
  diracKineticBlock,
  diracKineticBlock3D,
} from '../shaders/schroedinger/compute/diracKinetic.wgsl'
import {
  diracPotentialBlock,
  diracPotentialBlock3D,
} from '../shaders/schroedinger/compute/diracPotential.wgsl'
import { diracPotentialHalfBlock } from '../shaders/schroedinger/compute/diracPotentialHalf.wgsl'
import { diracRenormalizeBlock } from '../shaders/schroedinger/compute/diracRenormalize.wgsl'
import {
  DIRAC_SPARSE_INIT_MAX_DIM,
  generateDiracSparseGammaBlock,
} from '../shaders/schroedinger/compute/diracSparseGammaVariants.wgsl'
import {
  diracSpinorPackShaderBlock,
  diracSpinorUnpackShaderBlock,
} from '../shaders/schroedinger/compute/diracSpinorPack.wgsl'
import { diracUniformsBlock } from '../shaders/schroedinger/compute/diracUniforms.wgsl'
import { diracWriteGridBlock } from '../shaders/schroedinger/compute/diracWriteGrid.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { tdsePackUniformsShaderBlock } from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTTwiddleBlock,
} from '../shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTTwiddleBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { assembleShaderBlocks } from '../shaders/shared/compose-helpers'
import { createComputeBGL } from '../utils/computeBindGroupLayout'
export { rebuildDiracBuffers } from './DiracComputePassBuffers'
export type {
  DiracBindGroupInputs,
  DiracBindGroupResult,
  DiracBufferResult,
  DiracDestroyableBuffers,
  DiracPassHelpers,
  DiracPipelineResult,
} from './DiracComputePassTypes'
import type {
  DiracBindGroupInputs,
  DiracBindGroupResult,
  DiracPassHelpers,
  DiracPipelineResult,
} from './DiracComputePassTypes'

// ───────────────────────────────────────────────────────────────────────────
// rebuildDiracBuffers
// ───────────────────────────────────────────────────────────────────────────
// buildDiracPipelines
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compile all GPU compute pipelines and their bind group layouts for the
 * Dirac equation solver.
 *
 * @param device - WebGPU device
 * @param helpers - Base-class helper methods for shader/pipeline creation
 * @returns All pipelines and their associated bind group layouts
 */
// --- Pure WGSL composers (Phase 2b) ---
const diracPrelude = (): string => diracUniformsBlock + freeScalarNDIndexBlock

/**
 * Maximum lattice dimension at which the 3-D dispatch site-kernel variants
 * (`@workgroup_size(4, 4, 4)`) are emitted. Above this, the kernels fall back
 * to the legacy 1-D dispatch path because `gid.xyz` only exposes three axes.
 */
export const DIRAC_3D_SITE_MAX_DIM = 3

/** Pure WGSL for the Dirac init compute shader (1-D dispatch, workgroup 64). */
export function composeDiracInitShader(latticeDim: number = 3): string {
  return (
    diracPrelude() +
    generateDiracSparseGammaBlock(latticeDim, DIRAC_SPARSE_INIT_MAX_DIM) +
    diracInitBlock
  )
}

/**
 * Pure WGSL for the Dirac init compute shader, 3-D dispatch variant
 * (workgroup 4x4x4, gid.xyz coords). Used when latticeDim ≤ 3.
 */
export function composeDiracInitShader3D(latticeDim: number = 3): string {
  return (
    diracPrelude() +
    generateDiracSparseGammaBlock(latticeDim, DIRAC_SPARSE_INIT_MAX_DIM) +
    diracInitBlock3D
  )
}

/** Pure WGSL for the Dirac potential-fill compute shader (1-D dispatch). */
export function composeDiracPotentialShader(): string {
  return diracPrelude() + diracPotentialBlock
}

/**
 * Pure WGSL for the Dirac potential-fill compute shader, 3-D dispatch variant
 * (workgroup 4x4x4, gid.xyz coords). Used when latticeDim ≤ 3.
 */
export function composeDiracPotentialShader3D(): string {
  return diracPrelude() + diracPotentialBlock3D
}

/** Pure WGSL for the Dirac potential half-step compute shader. */
export function composeDiracPotentialHalfShader(): string {
  return diracPrelude() + diracPotentialHalfBlock
}

/** Pure WGSL for the Dirac absorber (post-FFT) compute shader (1-D dispatch). */
export function composeDiracAbsorberShader(): string {
  return diracPrelude() + pmlProfileBlock + diracAbsorberBlock
}

/**
 * Pure WGSL for the Dirac absorber compute shader, 3-D dispatch variant
 * (workgroup 4x4x4, gid.xyz coords). Used when latticeDim ≤ 3.
 */
export function composeDiracAbsorberShader3D(): string {
  return diracPrelude() + pmlProfileBlock + diracAbsorberBlock3D
}

/** Pure WGSL for the Dirac renormalization compute shader. */
export function composeDiracRenormalizeShader(): string {
  return diracRenormalizeBlock
}

/**
 * Pure WGSL for the Dirac pack compute shader.
 *
 * Dirac-specific variant operating on the merged `array<vec2f>` spinor
 * layout. The TDSE pack shader cannot serve this layout because it expects
 * two separate f32 buffers — a merged vec2f buffer has no way to expose re
 * and im as two separate f32 bindings (they interleave at stride 8).
 */
export function composeDiracPackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, diracSpinorPackShaderBlock]).wgsl
}

/** Pure WGSL for the Dirac unpack compute shader. */
export function composeDiracUnpackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, diracSpinorUnpackShaderBlock]).wgsl
}

/**
 * Pure WGSL for the Dirac Stockham FFT stage compute shader.
 *
 * Twiddle-table fork of the kernel — stages s >= 2 read precomputed twiddles
 * from a `storage` buffer (binding 3) instead of calling `cos/sin` per thread.
 * Stage 0 (W^0 = (1,0)) and stage 1 (twiddles in {(1,0), (0,-dir)}) remain
 * specialized and need no table read. Same N_MAX_FFT_TWIDDLE = 128 cap as
 * TDSE — Dirac per-axis grid lengths fit in this bound.
 */
export function composeDiracFftStageShader(): string {
  return tdseFFTStageUniformsBlock + tdseStockhamFFTTwiddleBlock
}

/**
 * Pure WGSL for the Dirac shared-memory per-axis FFT compute shader.
 *
 * Twiddle-table fork — stages s >= 2 use the table at binding 2.
 */
export function composeDiracFftSharedMemShader(): string {
  return fftAxisUniformsBlock + tdseSharedMemFFTTwiddleBlock
}

/**
 * Pure WGSL for the Dirac kinetic propagator compute shader (1-D dispatch).
 *
 * Accepts the lattice dimension so the composer can emit a sparse monomial
 * gamma-matrix table (latticeDim ≤ DIRAC_SPARSE_MAX_DIM) that collapses the
 * S-wide col loop to a single lookup per row. Higher dims use a dense
 * fallback. Output is IEEE bit-identical in both paths.
 *
 * @param latticeDim - Spatial lattice dimension (1..11). Defaults to 3 for
 *   call-sites that enumerate without a concrete dim (WGSL validation suite).
 */
export function composeDiracKineticShader(latticeDim: number = 3): string {
  return diracPrelude() + generateDiracSparseGammaBlock(latticeDim) + diracKineticBlock
}

/**
 * Pure WGSL for the Dirac kinetic propagator compute shader, 3-D dispatch
 * variant (`@workgroup_size(4, 4, 4)`, k-coords from `gid.xyz`). Used when
 * `latticeDim ≤ 3`. Sparse monomial gamma-matrix specialization is emitted
 * the same way as the 1-D variant — the only difference is the entry-point
 * coord setup. The k-space `(coords -> idx)` mapping is identical to the
 * 1-D variant (same row-major strides match the FFT buffer layout), so the
 * mat-vec output is IEEE bit-identical.
 */
export function composeDiracKineticShader3D(latticeDim: number = 3): string {
  return diracPrelude() + generateDiracSparseGammaBlock(latticeDim) + diracKineticBlock3D
}

/**
 * Pure WGSL for the Dirac write-grid compute shader.
 *
 * Same sparse-gamma dispatch as the kinetic shader. Affects field views 4
 * (spin density) and 5 (current density) where S-wide col loops dominate.
 *
 * @param latticeDim - Spatial lattice dimension (1..11). Defaults to 3.
 */
export function composeDiracWriteGridShader(latticeDim: number = 3): string {
  return (
    diracPrelude() +
    generateDiracSparseGammaBlock(latticeDim) +
    diracWriteGridBlock +
    diracAxialChargeBlock
  )
}

/** Pure WGSL for the Dirac diagnostics norm-reduce compute shader. */
export function composeDiracDiagReduceShader(): string {
  return diracDiagNormReduceBlock
}

/** Pure WGSL for the Dirac diagnostics norm-finalize compute shader. */
export function composeDiracDiagFinalizeShader(): string {
  return diracDiagNormFinalizeBlock
}

/**
 * Compile every Dirac compute pipeline asynchronously and return them
 * with their bind group layouts.
 *
 * Kinetic + write-grid pipelines are specialized on latticeDim so the
 * composer can emit sparse monomial gamma-matrix const tables. DiracComputePass
 * rebuilds pipelines whenever its config hash (which includes latticeDim)
 * changes, so the specialization stays in sync with the active state.
 *
 * Init / potential / absorber / kinetic pipelines are additionally specialized
 * on dispatch shape: `latticeDim === 3` selects the 3-D `gid.xyz`-coord
 * variants (`@workgroup_size(4, 4, 4)`). Other dims use the legacy 1-D
 * `linearToND` variants (workgroup 64). The choice mirrors
 * {@link pickSiteDispatch} in `computePassUtils`.
 *
 * Why async: WGSL→backend (Metal/HLSL/SPIR-V) compilation can take
 * hundreds of ms for the larger Dirac kernels (sparse-gamma kinetic
 * + 4-spinor write-grid in particular). The synchronous
 * `device.createComputePipeline` blocks the JS main thread for the
 * full compile — which freezes the UI on every config change.
 * Issuing all compiles via `createComputePipelineAsync` and
 * `Promise.all`-ing them lets the browser parallelize compilation
 * across worker threads while the main thread keeps rendering.
 *
 * @param device - WebGPU device.
 * @param helpers - Shader/pipeline creation helpers from the base pass.
 *   `createShaderModule` is reused for module construction; the sync
 *   `createComputePipeline` callback is intentionally bypassed below
 *   in favour of `device.createComputePipelineAsync`.
 * @param latticeDim - Active spatial lattice dimension (1..11).
 */
export async function buildDiracPipelines(
  device: GPUDevice,
  helpers: DiracPassHelpers,
  latticeDim: number
): Promise<DiracPipelineResult> {
  // 3-D site-dispatch is restricted to latticeDim === 3 to avoid wasting
  // workgroup threads at lower dims (a 4x4x4=64-thread workgroup at d=1 has
  // 60 idle threads per dispatch). At d ≥ 4 we cannot encode the extra axes
  // in gid.xyz so 1-D is mandatory. See pickSiteDispatch in computePassUtils.
  const use3DSiteDispatch = latticeDim === DIRAC_3D_SITE_MAX_DIM

  // ── Bind group layouts (sync, cheap) ───────────────────────────────
  // Init: uniforms + spinor (vec2f).
  // Binding 0 (DiracUniforms) is `read-only-storage` because the struct embeds
  // scalar arrays (spec-forbidden in uniform address space). See
  // `diracInit.wgsl.ts` for the matching `var<storage, read>` declaration.
  const initBGL = createComputeBGL(device, 'dirac-init-bgl', ['read-only-storage', 'storage'])
  const potentialBGL = createComputeBGL(device, 'dirac-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialHalfBGL = createComputeBGL(device, 'dirac-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const renormalizeBGL = createComputeBGL(device, 'dirac-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const packBGL = createComputeBGL(device, 'dirac-pack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const unpackBGL = createComputeBGL(device, 'dirac-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  // FFT stage (reuses the TDSE twiddle-table fork). Binding 3 is the
  // CPU-precomputed twiddle table that replaces cos/sin at stages >= 2.
  // See FFTTwiddle.ts for the layout.
  const fftStageBGL = createComputeBGL(device, 'dirac-fft-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  // Shared-memory FFT: one dispatch per axis. Binding 2 is the same twiddle
  // table buffer bound to the per-stage kernel above.
  const fftSharedMemBGL = createComputeBGL(device, 'dirac-fft-shared-mem-bgl', [
    'uniform',
    'storage',
    'read-only-storage',
  ])
  // Kinetic propagator: uniforms + spinor(vec2f) + gammaMatrices(read).
  const kineticBGL = createComputeBGL(device, 'dirac-kinetic-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  // Write grid. Bindings: params(0) + spinor(1, vec2f) + potential(2) +
  // gammaMatrices(3) + outputTex(4).
  const writeGridBGL = createComputeBGL(device, 'dirac-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  // Diagnostics: reduce (pass 1). Bindings: diagParams(0) + spinor(1, vec2f)
  // + partialNorm(2) + partialMax(3) + partialParticle(4) + partialAnti(5).
  const diagReduceBGL = createComputeBGL(device, 'dirac-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
    'storage',
  ])
  const diagFinalizeBGL = createComputeBGL(device, 'dirac-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
    'read-only-storage',
  ])

  // Helper: kick off async pipeline compile against the supplied BGL stack.
  // Builds the shader module synchronously (cheap) and the pipeline async.
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

  // Pre-compose dispatch-shape-specialized shader sources.
  const initShader = use3DSiteDispatch
    ? composeDiracInitShader3D(latticeDim)
    : composeDiracInitShader(latticeDim)
  const initLabel = use3DSiteDispatch ? 'dirac-init-3d' : 'dirac-init'
  const potentialShader = use3DSiteDispatch
    ? composeDiracPotentialShader3D()
    : composeDiracPotentialShader()
  const potentialLabel = use3DSiteDispatch ? 'dirac-potential-3d' : 'dirac-potential'
  const absorberShader = use3DSiteDispatch
    ? composeDiracAbsorberShader3D()
    : composeDiracAbsorberShader()
  const absorberLabel = use3DSiteDispatch ? 'dirac-absorber-3d' : 'dirac-absorber'
  const kineticShader = use3DSiteDispatch
    ? composeDiracKineticShader3D(latticeDim)
    : composeDiracKineticShader(latticeDim)
  const kineticLabel = use3DSiteDispatch ? 'dirac-kinetic-3d' : 'dirac-kinetic'

  // Issue every pipeline compile in parallel.
  const [
    initPipeline,
    potentialPipeline,
    potentialHalfPipeline,
    absorberPipeline,
    renormalizePipeline,
    packPipeline,
    unpackPipeline,
    fftStagePipeline,
    fftSharedMemPipeline,
    kineticPipeline,
    writeGridPipeline,
    diagReducePipeline,
    diagFinalizePipeline,
  ] = await Promise.all([
    issuePipeline(initLabel, initShader, [initBGL]),
    issuePipeline(potentialLabel, potentialShader, [potentialBGL]),
    issuePipeline('dirac-potential-half', composeDiracPotentialHalfShader(), [potentialHalfBGL]),
    // Absorber reuses initBGL layout.
    issuePipeline(absorberLabel, absorberShader, [initBGL]),
    issuePipeline('dirac-renormalize', composeDiracRenormalizeShader(), [renormalizeBGL]),
    issuePipeline('dirac-pack', composeDiracPackShader(), [packBGL]),
    issuePipeline('dirac-unpack', composeDiracUnpackShader(), [unpackBGL]),
    issuePipeline('dirac-fft-stage', composeDiracFftStageShader(), [fftStageBGL]),
    issuePipeline('dirac-fft-shared-mem', composeDiracFftSharedMemShader(), [fftSharedMemBGL]),
    issuePipeline(kineticLabel, kineticShader, [kineticBGL]),
    issuePipeline('dirac-write-grid', composeDiracWriteGridShader(latticeDim), [writeGridBGL]),
    issuePipeline('dirac-diag-reduce', composeDiracDiagReduceShader(), [diagReduceBGL]),
    issuePipeline('dirac-diag-finalize', composeDiracDiagFinalizeShader(), [diagFinalizeBGL]),
  ])

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
    use3DSiteDispatch,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// rebuildDiracBindGroups
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create all bind groups for the Dirac compute pass from pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from {@link buildDiracPipelines}
 * @param inputs - GPU buffers and resources from {@link rebuildDiracBuffers}
 * @param oldRenormUniformBuffer - Previous renormalize uniform buffer to destroy (may be null)
 * @returns All bind groups and the per-component cached pack/unpack arrays
 */
export function rebuildDiracBindGroups(
  device: GPUDevice,
  pipelines: DiracPipelineResult,
  inputs: DiracBindGroupInputs,
  oldRenormUniformBuffer: GPUBuffer | null
): DiracBindGroupResult {
  const {
    uniformBuffer,
    spinorBuffer,
    potentialBuffer,
    gammaBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
    fftTwiddleBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    densityTextureView,
    diagUniformBuffer,
    diagPartialNormBuffer,
    diagPartialMaxBuffer,
    diagPartialParticleBuffer,
    diagPartialAntiBuffer,
    diagResultBuffer,
    totalSites,
    currentSpinorSize,
  } = inputs

  const initBG = device.createBindGroup({
    label: 'dirac-init-bg',
    layout: pipelines.initBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
    ],
  })

  const potentialBG = device.createBindGroup({
    label: 'dirac-potential-bg',
    layout: pipelines.potentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
    ],
  })

  const potentialHalfBG = device.createBindGroup({
    label: 'dirac-potential-half-bg',
    layout: pipelines.potentialHalfBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
    ],
  })

  // FFT bind groups. Binding 3 is the twiddle table that replaces cos/sin
  // at stages >= 2 (see FFTTwiddle.ts).
  const fftStageABBG = device.createBindGroup({
    label: 'dirac-fft-ab-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'dirac-fft-ba-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })

  // Shared-memory FFT bind group: per-axis uniforms + complexBuf (read_write on fftScratchA).
  // `fftSharedMemBG` uses the shared single-uniform buffer (legacy dispatchFFTAxisSharedMem
  // path patches it via copyBufferToBuffer and incurs a pass boundary per axis).
  // Binding 2 is the twiddle table shared with the per-stage kernel above.
  const fftSharedMemBG = device.createBindGroup({
    label: 'dirac-fft-shared-mem-bg',
    layout: pipelines.fftSharedMemBGL,
    entries: [
      { binding: 0, resource: { buffer: inputs.fftAxisUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  // PERF: per-slot bind groups (one per axis per direction). Each references a
  // pre-populated per-slot uniform buffer, so the entire Strang step can
  // dispatch its FFT axes inside a single compute pass by just switching
  // bind groups — no copyBufferToBuffer forces a pass boundary.
  const fftSharedMemBGs: GPUBindGroup[] = new Array(inputs.fftAxisUniformBuffers.length)
  for (let slot = 0; slot < inputs.fftAxisUniformBuffers.length; slot++) {
    fftSharedMemBGs[slot] = device.createBindGroup({
      label: `dirac-fft-shared-mem-bg-slot-${slot}`,
      layout: pipelines.fftSharedMemBGL,
      entries: [
        { binding: 0, resource: { buffer: inputs.fftAxisUniformBuffers[slot]! } },
        { binding: 1, resource: { buffer: fftScratchA } },
        { binding: 2, resource: { buffer: fftTwiddleBuffer } },
      ],
    })
  }

  const kineticBG = device.createBindGroup({
    label: 'dirac-kinetic-bg',
    layout: pipelines.kineticBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: gammaBuffer } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'dirac-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
      { binding: 3, resource: { buffer: gammaBuffer } },
      { binding: 4, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups
  const diagReduceBG = device.createBindGroup({
    label: 'dirac-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: diagPartialNormBuffer } },
      { binding: 3, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 4, resource: { buffer: diagPartialParticleBuffer } },
      { binding: 5, resource: { buffer: diagPartialAntiBuffer } },
    ],
  })

  const diagFinalizeBG = device.createBindGroup({
    label: 'dirac-diag-finalize-bg',
    layout: pipelines.diagFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: diagPartialNormBuffer } },
      { binding: 2, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 3, resource: { buffer: diagResultBuffer } },
      { binding: 4, resource: { buffer: diagPartialParticleBuffer } },
      { binding: 5, resource: { buffer: diagPartialAntiBuffer } },
    ],
  })

  // Renormalization bind group (S-component spinor)
  oldRenormUniformBuffer?.destroy()
  const renormalizeUniformBuffer = device.createBuffer({
    label: 'dirac-renormalize-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // Dirac has S components: totalElements = S * totalSites
  const renormBuf = new ArrayBuffer(16)
  new Uint32Array(renormBuf)[0] = currentSpinorSize * totalSites
  new Float32Array(renormBuf)[1] = 0 // targetNorm = 0 → shader skips until set
  device.queue.writeBuffer(renormalizeUniformBuffer, 0, renormBuf)
  const renormalizeBG = device.createBindGroup({
    label: 'dirac-renormalize-bg',
    layout: pipelines.renormalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: renormalizeUniformBuffer } },
      { binding: 1, resource: { buffer: diagResultBuffer } },
      { binding: 2, resource: { buffer: spinorBuffer } },
    ],
  })

  // Build cached per-component pack/unpack bind groups.
  // Merged layout: each vec2f is 8 bytes; component c occupies bytes
  // [c*T*8 .. (c+1)*T*8] of spinorBuffer.
  const cachedPackBGs: GPUBindGroup[] = []
  const cachedUnpackBGs: GPUBindGroup[] = []
  const cachedUnpackBGsNoNorm: GPUBindGroup[] = []
  const S = currentSpinorSize
  for (let c = 0; c < S; c++) {
    const byteOffset = c * totalSites * 8
    const byteSize = totalSites * 8

    cachedPackBGs.push(
      device.createBindGroup({
        label: `dirac-pack-c${c}`,
        layout: pipelines.packBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBuffer } },
          { binding: 1, resource: { buffer: spinorBuffer, offset: byteOffset, size: byteSize } },
          { binding: 2, resource: { buffer: fftScratchA } },
        ],
      })
    )

    cachedUnpackBGs.push(
      device.createBindGroup({
        label: `dirac-unpack-c${c}`,
        layout: pipelines.unpackBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBuffer } },
          { binding: 1, resource: { buffer: fftScratchA } },
          { binding: 2, resource: { buffer: spinorBuffer, offset: byteOffset, size: byteSize } },
        ],
      })
    )

    cachedUnpackBGsNoNorm.push(
      device.createBindGroup({
        label: `dirac-fwd-unpack-c${c}`,
        layout: pipelines.unpackBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBufferNoNorm } },
          { binding: 1, resource: { buffer: fftScratchA } },
          { binding: 2, resource: { buffer: spinorBuffer, offset: byteOffset, size: byteSize } },
        ],
      })
    )
  }

  return {
    initBG,
    potentialBG,
    potentialHalfBG,
    fftStageABBG,
    fftStageBABG,
    fftSharedMemBG,
    fftSharedMemBGs,
    kineticBG,
    writeGridBG,
    diagReduceBG,
    diagFinalizeBG,
    renormalizeBG,
    renormalizeUniformBuffer,
    cachedPackBGs,
    cachedUnpackBGs,
    cachedUnpackBGsNoNorm,
  }
}
