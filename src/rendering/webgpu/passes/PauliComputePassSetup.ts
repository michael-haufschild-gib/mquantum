/**
 * Pauli Compute Pass — Pipeline & Bind Group Setup
 *
 * Extracted from PauliComputePass to keep file sizes within the 600-line limit.
 * Contains pipeline compilation and bind group assembly.
 *
 * These functions operate on plain parameter objects rather than class
 * instances, receiving only the GPU resources they need and returning
 * the resources they create.
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import {
  pauliAbsorber3DBlock,
  pauliAbsorberBlock,
} from '../shaders/schroedinger/compute/pauliAbsorber.wgsl'
import {
  pauliDiagFinalizeBlock,
  pauliDiagReduceBlock,
} from '../shaders/schroedinger/compute/pauliDiagnostics.wgsl'
import { pauliInit3DBlock, pauliInitBlock } from '../shaders/schroedinger/compute/pauliInit.wgsl'
import {
  pauliKinetic3DBlock,
  pauliKineticBlock,
} from '../shaders/schroedinger/compute/pauliKinetic.wgsl'
import {
  pauliComplexPackBlock,
  pauliComplexUnpackBlock,
} from '../shaders/schroedinger/compute/pauliPack.wgsl'
import {
  pauliPotential3DBlock,
  pauliPotentialBlock,
} from '../shaders/schroedinger/compute/pauliPotential.wgsl'
import {
  pauliPotentialHalf3DBlock,
  pauliPotentialHalfBlock,
} from '../shaders/schroedinger/compute/pauliPotentialHalf.wgsl'
import { pauliRenormalizeBlock } from '../shaders/schroedinger/compute/pauliRenormalize.wgsl'
import { pauliUniformsBlock } from '../shaders/schroedinger/compute/pauliUniforms.wgsl'
import { pauliWriteGridBlock } from '../shaders/schroedinger/compute/pauliWriteGrid.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTTwiddleBlock,
} from '../shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

// ───────────────────────────────────────────────────────────────────────────
// Type definitions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pipeline and bind group layout objects created by {@link buildPauliPipelines}.
 */
export interface PauliPipelineResult {
  initPipeline: GPUComputePipeline
  /** 3D-dispatch sibling of {@link initPipeline}; used iff latticeDim == 3. */
  init3DPipeline: GPUComputePipeline
  /** Fills the scalar V(x) buffer once per parameter change. */
  potentialPipeline: GPUComputePipeline
  /** 3D-dispatch sibling of {@link potentialPipeline}; used iff latticeDim == 3. */
  potential3DPipeline: GPUComputePipeline
  potentialHalfPipeline: GPUComputePipeline
  /** 3D-dispatch sibling of {@link potentialHalfPipeline}; used iff latticeDim == 3. */
  potentialHalf3DPipeline: GPUComputePipeline
  absorberPipeline: GPUComputePipeline
  /** 3D-dispatch sibling of {@link absorberPipeline}; used iff latticeDim == 3. */
  absorber3DPipeline: GPUComputePipeline
  kineticPipeline: GPUComputePipeline
  /** 3D-dispatch sibling of {@link kineticPipeline}; used iff latticeDim == 3. */
  kinetic3DPipeline: GPUComputePipeline
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  unpackPipeline: GPUComputePipeline
  /**
   * Shared-memory Stockham FFT pipeline. Performs all log2(N) butterfly
   * stages for one pencil inside a single workgroup using workgroup-local
   * shared memory — replaces the per-stage Stockham kernel that needed
   * log2(N) separate dispatches per axis.
   */
  fftSharedMemPipeline: GPUComputePipeline
  writeGridPipeline: GPUComputePipeline
  diagReducePipeline: GPUComputePipeline
  diagFinalizePipeline: GPUComputePipeline
  // Bind group layouts
  /** 2-binding layout (params ro, merged spinor rw) for init/kinetic/absorber. */
  spinorBGL: GPUBindGroupLayout
  /** 2-binding layout (params ro, potential rw) for pauliPotential fill shader. */
  potentialBGL: GPUBindGroupLayout
  /** 3-binding layout (params ro, merged spinor rw, potential ro) for pauliPotentialHalf. */
  potentialHalfBGL: GPUBindGroupLayout
  packBGL: GPUBindGroupLayout
  unpackBGL: GPUBindGroupLayout
  /** BGL for the shared-memory FFT: (axis-uniforms, complexBuf rw, twiddle ro). */
  fftSharedMemBGL: GPUBindGroupLayout
  writeGridBGL: GPUBindGroupLayout
  diagReduceBGL: GPUBindGroupLayout
  diagFinalizeBGL: GPUBindGroupLayout
}

/**
 * Bind group objects created by {@link rebuildPauliBindGroups}.
 */
export interface PauliBindGroupResult {
  spinorBG: GPUBindGroup
  /** Bind group for the pauliPotential fill pipeline (params + potentialBuffer). */
  potentialBG: GPUBindGroup
  /** Bind group for pauliPotentialHalf (adds potential as binding 3). */
  potentialHalfBG: GPUBindGroup
  /**
   * One bind group per (axis, direction) FFT slot. Length = `latticeDim * 2`.
   * Forward axes occupy slots [0, latticeDim); inverse axes occupy
   * [latticeDim, 2·latticeDim). Inside the batched Strang-step compute pass
   * the host iterates this array, calling `setBindGroup(0, fftSharedMemBGs[slot])`
   * + `dispatchWorkgroups(totalSites / axisDim)` for each axis.
   */
  fftSharedMemBGs: GPUBindGroup[]
  writeGridBG: GPUBindGroup
  diagReduceBG: GPUBindGroup
  diagFinalizeBG: GPUBindGroup
  renormalizeBG: GPUBindGroup
  renormalizeUniformBuffer: GPUBuffer
  cachedPackBGs: GPUBindGroup[]
  cachedUnpackBGs: GPUBindGroup[]
  cachedUnpackBGsNoNorm: GPUBindGroup[]
}

/** Buffers and resources needed to create bind groups. */
export interface PauliBindGroupInputs {
  uniformBuffer: GPUBuffer
  /** Merged spinor buffer (`array<vec2f>` of length 2·totalSites). */
  spinorBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  /**
   * Per-(axis, direction) FFT axis-uniform buffers. Length = `latticeDim * 2`.
   * One bind group per slot enables single-pass Strang-step FFT dispatch.
   */
  fftAxisUniformBuffers: GPUBuffer[]
  /**
   * CPU-precomputed twiddle table bound at binding 2 of every shared-memory
   * FFT dispatch. Same buffer shape as the TDSE twiddle table.
   */
  fftTwiddleBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  potentialBuffer: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
}

// ───────────────────────────────────────────────────────────────────────────
// buildPauliPipelines
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compile all GPU compute pipelines and their bind group layouts for the
 * Pauli equation solver.
 *
 * @param device - WebGPU device
 * @returns All pipelines and their associated bind group layouts
 */
// --- Pure WGSL composers (Phase 2b) ---
const pauliPrelude = (): string => `${pauliUniformsBlock}\n${freeScalarNDIndexBlock}\n`

/** Pure WGSL for the Pauli init compute shader. */
export function composePauliInitShader(): string {
  return pauliPrelude() + pauliInitBlock
}

/**
 * 3D-dispatch variant of {@link composePauliInitShader}. Used by the host when
 * `latticeDim === 3` to drop the linearToND() call from the kernel body.
 * The freeScalarNDIndex prelude is still included (linearToND is unused but
 * cheap to leave as dead code; keeping the same prelude across variants
 * minimizes shader-cache divergence).
 */
export function composePauliInit3DShader(): string {
  return pauliPrelude() + pauliInit3DBlock
}

/** Pure WGSL for the Pauli V(x) fill compute shader. Runs once per param change. */
export function composePauliPotentialShader(): string {
  return pauliPrelude() + pauliPotentialBlock
}

/** 3D-dispatch variant of {@link composePauliPotentialShader}. */
export function composePauliPotential3DShader(): string {
  return pauliPrelude() + pauliPotential3DBlock
}

/** Pure WGSL for the Pauli potentialHalf+Zeeman compute shader. */
export function composePauliPotentialHalfShader(): string {
  return pauliPrelude() + pauliPotentialHalfBlock
}

/** 3D-dispatch variant of {@link composePauliPotentialHalfShader}. */
export function composePauliPotentialHalf3DShader(): string {
  return pauliPrelude() + pauliPotentialHalf3DBlock
}

/** Pure WGSL for the Pauli absorber compute shader. */
export function composePauliAbsorberShader(): string {
  return pauliPrelude() + pmlProfileBlock + pauliAbsorberBlock
}

/** 3D-dispatch variant of {@link composePauliAbsorberShader}. */
export function composePauliAbsorber3DShader(): string {
  return pauliPrelude() + pmlProfileBlock + pauliAbsorber3DBlock
}

/** Pure WGSL for the Pauli kinetic phase-kick (k-space) compute shader. */
export function composePauliKineticShader(): string {
  return pauliPrelude() + pauliKineticBlock
}

/**
 * 3D-dispatch variant of {@link composePauliKineticShader} (latticeDim == 3).
 * Reads k-coords from gid.xyz instead of linearToND-decoding the linear idx.
 */
export function composePauliKinetic3DShader(): string {
  return pauliPrelude() + pauliKinetic3DBlock
}

/**
 * Pure WGSL for the Pauli renormalize compute shader. Uses the Pauli-local
 * variant that operates on the merged `array<vec2f>` spinor buffer — the
 * shared `renormalize.wgsl` expects split Re/Im arrays and is no longer
 * compatible with Pauli's merged layout.
 */
export function composePauliRenormalizeShader(): string {
  return pauliRenormalizeBlock
}

/** Pure WGSL for the Pauli write-grid compute shader. */
export function composePauliWriteGridShader(): string {
  return pauliPrelude() + pauliWriteGridBlock
}

/**
 * Pure WGSL for the Pauli pack compute shader. Pauli has its own pack /
 * unpack shader pair because the merged `spinor: array<vec2f>` buffer
 * is exposed to the FFT pack step as a per-component vec2f sub-binding,
 * not as split Re/Im f32 arrays.
 */
export function composePauliPackShader(): string {
  return pauliComplexPackBlock
}

/** Pure WGSL for the Pauli unpack compute shader (see pack shader docs). */
export function composePauliUnpackShader(): string {
  return pauliComplexUnpackBlock
}

/**
 * Pure WGSL for the Pauli shared-memory Stockham FFT compute shader.
 *
 * Shared-memory variant: performs all log2(N) butterfly stages for one pencil
 * inside a single workgroup using workgroup-local shared memory. One dispatch
 * per axis replaces log2(N) dispatches of the per-stage Stockham kernel,
 * cutting kernel-launch overhead 6× at N=64 and removing log2(N) global-memory
 * round-trips per pencil. Twiddle-table fork: stages s >= 2 read CPU-precomputed
 * twiddles from a storage buffer instead of calling cos/sin per thread.
 *
 * Reuses the TDSE shared-memory FFT shader bytes — the kernel is grid-config
 * agnostic and the bind group layout is identical.
 */
export function composePauliFftSharedMemShader(): string {
  return `\n${fftAxisUniformsBlock}\n${tdseSharedMemFFTTwiddleBlock}\n`
}

/** Pure WGSL for the Pauli diagnostics reduce compute shader. */
export function composePauliDiagReduceShader(): string {
  return pauliDiagReduceBlock
}

/** Pure WGSL for the Pauli diagnostics finalize compute shader. */
export function composePauliDiagFinalizeShader(): string {
  return pauliDiagFinalizeBlock
}

/**
 * Compile every Pauli-spinor compute pipeline asynchronously and return
 * them with their bind group layouts. One-time setup per device.
 *
 * Why async: WGSL→backend (Metal/HLSL/SPIR-V) compilation can take
 * hundreds of ms for the larger Pauli kernels. The synchronous
 * `device.createComputePipeline` blocks the JS main thread for the full
 * compile — which freezes the entire UI when a config change triggers
 * a rebuild. Using `createComputePipelineAsync` and `Promise.all`-ing
 * the issued descriptors lets the browser parallelize compilation
 * across worker threads while the main thread keeps rendering.
 *
 * Cheap setup (BGLs, pipeline layouts, shader modules) still runs
 * synchronously — those are inexpensive. Only the pipeline objects
 * themselves are awaited.
 */
export async function buildPauliPipelines(device: GPUDevice): Promise<PauliPipelineResult> {
  // Shared BGL for spinor passes: PauliUniforms + merged spinor (rw).
  // Binding 0 is `read-only-storage` because PauliUniforms embeds scalar arrays
  // (spec-forbidden in uniform address space). See pauliInit.wgsl.ts for the
  // matching `var<storage, read>` declaration. Binding 1 is the merged
  // `array<vec2f>` spinor buffer (Item 1 of the perf batch — collapses the
  // prior two split f32 bindings into one 8-byte vec2f binding).
  const spinorBGL = createComputeBGL(device, 'pauli-spinor-bgl', ['read-only-storage', 'storage'])
  const spinorLayout = device.createPipelineLayout({ bindGroupLayouts: [spinorBGL] })

  const potentialBGL = createComputeBGL(device, 'pauli-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialLayout = device.createPipelineLayout({ bindGroupLayouts: [potentialBGL] })

  // Potential half-step + Zeeman rotation. Separate 3-binding BGL so that
  // init/kinetic/absorber (which never read V) stay on the lean 2-binding
  // spinorBGL. With the merged `array<vec2f>` spinor, this shrinks from
  // 4 to 3 bindings (was: params, spinorRe, spinorIm, potential).
  const potentialHalfBGL = createComputeBGL(device, 'pauli-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const potentialHalfLayout = device.createPipelineLayout({
    bindGroupLayouts: [potentialHalfBGL],
  })

  const renormalizeBGL = createComputeBGL(device, 'pauli-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // Write-grid pipeline. Binding 0 (PauliUniforms) — see spinor BGL comment.
  // Binding 1 is the merged spinor buffer (RO); binding 2 is the density
  // storage texture. Collapsed from 4 bindings after the merge.
  const writeGridBGL = createComputeBGL(device, 'pauli-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])

  // Pack BGL: uniform + per-component merged spinor slice (RO, array<vec2f>)
  // + interleaved complexBuf (RW). Collapsed from 4 bindings — the old
  // layout bound split psiRe + psiIm.
  const packBGL = createComputeBGL(device, 'pauli-pack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // Unpack BGL: uniform + interleaved complexBuf (RO)
  // + per-component merged spinor slice (RW, array<vec2f>).
  const unpackBGL = createComputeBGL(device, 'pauli-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // Shared-memory FFT BGL. Binding 0: per-axis uniforms (32-byte FFTAxisUniforms),
  // binding 1: complex storage buffer (read_write, in-place butterfly),
  // binding 2: CPU-precomputed twiddle table (read-only).
  const fftSharedMemBGL = createComputeBGL(device, 'pauli-fft-shared-mem-bgl', [
    'uniform',
    'storage',
    'read-only-storage',
  ])

  // Diagnostics: reduce BGL. Collapsed from 4 bindings after the merge
  // (uniform + merged spinor RO + partial output RW).
  const diagReduceBGL = createComputeBGL(device, 'pauli-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // Diagnostics: finalize BGL
  const diagFinalizeBGL = createComputeBGL(device, 'pauli-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // Helper: kick off `createComputePipelineAsync` with a shader module
  // built from the supplied source. Returns a Promise that resolves to
  // the compiled pipeline. All Pauli pipelines share this shape.
  const issuePipeline = (
    label: string,
    layout: GPUPipelineLayout,
    code: string
  ): Promise<GPUComputePipeline> =>
    device.createComputePipelineAsync({
      label: `${label}-pipeline`,
      layout,
      compute: {
        module: device.createShaderModule({ label, code }),
        entryPoint: 'main',
      },
    })

  // Issue every pipeline compile in parallel. Promise.all lets the
  // browser drive WGSL→backend compilation concurrently while the
  // main thread continues rendering frames.
  const [
    initPipeline,
    init3DPipeline,
    potentialPipeline,
    potential3DPipeline,
    potentialHalfPipeline,
    potentialHalf3DPipeline,
    absorberPipeline,
    absorber3DPipeline,
    kineticPipeline,
    kinetic3DPipeline,
    renormalizePipeline,
    writeGridPipeline,
    packPipeline,
    unpackPipeline,
    fftSharedMemPipeline,
    diagReducePipeline,
    diagFinalizePipeline,
  ] = await Promise.all([
    issuePipeline('pauli-init', spinorLayout, composePauliInitShader()),
    issuePipeline('pauli-init-3d', spinorLayout, composePauliInit3DShader()),
    issuePipeline('pauli-potential', potentialLayout, composePauliPotentialShader()),
    issuePipeline('pauli-potential-3d', potentialLayout, composePauliPotential3DShader()),
    issuePipeline('pauli-potential-half', potentialHalfLayout, composePauliPotentialHalfShader()),
    issuePipeline(
      'pauli-potential-half-3d',
      potentialHalfLayout,
      composePauliPotentialHalf3DShader()
    ),
    issuePipeline('pauli-absorber', spinorLayout, composePauliAbsorberShader()),
    issuePipeline('pauli-absorber-3d', spinorLayout, composePauliAbsorber3DShader()),
    issuePipeline('pauli-kinetic', spinorLayout, composePauliKineticShader()),
    issuePipeline('pauli-kinetic-3d', spinorLayout, composePauliKinetic3DShader()),
    issuePipeline(
      'pauli-renormalize',
      device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
      composePauliRenormalizeShader()
    ),
    issuePipeline(
      'pauli-write-grid',
      device.createPipelineLayout({ bindGroupLayouts: [writeGridBGL] }),
      composePauliWriteGridShader()
    ),
    issuePipeline(
      'pauli-pack',
      device.createPipelineLayout({ bindGroupLayouts: [packBGL] }),
      composePauliPackShader()
    ),
    issuePipeline(
      'pauli-unpack',
      device.createPipelineLayout({ bindGroupLayouts: [unpackBGL] }),
      composePauliUnpackShader()
    ),
    issuePipeline(
      'pauli-fft-shared-mem',
      device.createPipelineLayout({ bindGroupLayouts: [fftSharedMemBGL] }),
      composePauliFftSharedMemShader()
    ),
    issuePipeline(
      'pauli-diag-reduce',
      device.createPipelineLayout({ bindGroupLayouts: [diagReduceBGL] }),
      composePauliDiagReduceShader()
    ),
    issuePipeline(
      'pauli-diag-finalize',
      device.createPipelineLayout({ bindGroupLayouts: [diagFinalizeBGL] }),
      composePauliDiagFinalizeShader()
    ),
  ])

  return {
    initPipeline,
    init3DPipeline,
    potentialPipeline,
    potential3DPipeline,
    potentialHalfPipeline,
    potentialHalf3DPipeline,
    absorberPipeline,
    absorber3DPipeline,
    kineticPipeline,
    kinetic3DPipeline,
    renormalizePipeline,
    renormalizeBGL,
    packPipeline,
    unpackPipeline,
    fftSharedMemPipeline,
    writeGridPipeline,
    diagReducePipeline,
    diagFinalizePipeline,
    spinorBGL,
    potentialBGL,
    potentialHalfBGL,
    packBGL,
    unpackBGL,
    fftSharedMemBGL,
    writeGridBGL,
    diagReduceBGL,
    diagFinalizeBGL,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// rebuildPauliBindGroups
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create all bind groups for the Pauli compute pass from pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from {@link buildPauliPipelines}
 * @param inputs - GPU buffers and resources
 * @param oldRenormUniformBuffer - Previous renormalize uniform buffer to destroy (may be null)
 * @returns All bind groups and the per-component cached pack/unpack arrays
 */
export function rebuildPauliBindGroups(
  device: GPUDevice,
  pipelines: PauliPipelineResult,
  inputs: PauliBindGroupInputs,
  oldRenormUniformBuffer: GPUBuffer | null
): PauliBindGroupResult {
  const {
    uniformBuffer,
    spinorBuffer,
    fftScratchA,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    potentialBuffer,
    densityTextureView,
    diagUniformBuffer,
    diagPartialBuffer,
    diagResultBuffer,
    totalSites,
  } = inputs

  // Shared spinor BG for init/kinetic/absorber (2 bindings — no potential).
  const spinorBG = device.createBindGroup({
    label: 'pauli-spinor-bg',
    layout: pipelines.spinorBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
    ],
  })

  // BG for the pauliPotential fill pipeline.
  const potentialBG = device.createBindGroup({
    label: 'pauli-potential-bg',
    layout: pipelines.potentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
    ],
  })

  // BG for pauliPotentialHalf — merged spinor + potential (read-only).
  const potentialHalfBG = device.createBindGroup({
    label: 'pauli-potential-half-bg',
    layout: pipelines.potentialHalfBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
    ],
  })

  // PERF: per-(axis, direction) shared-memory FFT bind groups. Each binds
  // its own pre-populated FFTAxisUniforms buffer, the in-place complex
  // scratch storage, and the shared twiddle table. With one bind group per
  // axis slot, the entire Strang substep's FFT round trip stays inside one
  // batched compute pass — no per-axis copyBufferToBuffer.
  const fftSharedMemBGs: GPUBindGroup[] = new Array(fftAxisUniformBuffers.length)
  for (let slot = 0; slot < fftAxisUniformBuffers.length; slot++) {
    fftSharedMemBGs[slot] = device.createBindGroup({
      label: `pauli-fft-shared-mem-bg-slot-${slot}`,
      layout: pipelines.fftSharedMemBGL,
      entries: [
        { binding: 0, resource: { buffer: fftAxisUniformBuffers[slot]! } },
        { binding: 1, resource: { buffer: fftScratchA } },
        { binding: 2, resource: { buffer: fftTwiddleBuffer } },
      ],
    })
  }

  // Renormalization bind group
  oldRenormUniformBuffer?.destroy()
  const renormalizeUniformBuffer = device.createBuffer({
    label: 'pauli-renormalize-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // targetNorm (f32 at offset 4) starts at 0; updated when initialNorm is captured
  const renormBuf = new ArrayBuffer(16)
  new Uint32Array(renormBuf)[0] = 2 * totalSites
  new Float32Array(renormBuf)[1] = 0 // targetNorm = 0 → shader skips
  device.queue.writeBuffer(renormalizeUniformBuffer, 0, renormBuf)
  const renormalizeBG = device.createBindGroup({
    label: 'pauli-renormalize-bg',
    layout: pipelines.renormalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: renormalizeUniformBuffer } },
      { binding: 1, resource: { buffer: diagResultBuffer } },
      { binding: 2, resource: { buffer: spinorBuffer } },
    ],
  })

  // Write-grid bind group
  const writeGridBG = device.createBindGroup({
    label: 'pauli-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups
  const diagReduceBG = device.createBindGroup({
    label: 'pauli-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: spinorBuffer } },
      { binding: 2, resource: { buffer: diagPartialBuffer } },
    ],
  })
  const diagFinalizeBG = device.createBindGroup({
    label: 'pauli-diag-finalize-bg',
    layout: pipelines.diagFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: diagPartialBuffer } },
      { binding: 2, resource: { buffer: diagResultBuffer } },
    ],
  })

  // Build cached per-component pack/unpack bind groups (2 components: up, down).
  // With the merged `array<vec2f>` buffer, each sub-binding is a single
  // component's vec2f slice. Offset = c * totalSites * 8 (one vec2f = 8 bytes);
  // size = totalSites * 8. WebGPU requires offsets to be a multiple of
  // minStorageBufferOffsetAlignment (256): Pauli guarantees totalSites >= 512
  // (latticeDim >= 3, per-axis gridSize >= 8), so totalSites * 8 >= 4096 —
  // always a multiple of 256.
  const SPINOR_VEC2F_BYTES = 8
  const cachedPackBGs: GPUBindGroup[] = []
  const cachedUnpackBGs: GPUBindGroup[] = []
  const cachedUnpackBGsNoNorm: GPUBindGroup[] = []
  for (let c = 0; c < 2; c++) {
    const byteOffset = c * totalSites * SPINOR_VEC2F_BYTES
    const byteSize = totalSites * SPINOR_VEC2F_BYTES

    cachedPackBGs.push(
      device.createBindGroup({
        label: `pauli-pack-c${c}`,
        layout: pipelines.packBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBufferNoNorm } },
          { binding: 1, resource: { buffer: spinorBuffer, offset: byteOffset, size: byteSize } },
          { binding: 2, resource: { buffer: fftScratchA } },
        ],
      })
    )

    cachedUnpackBGs.push(
      device.createBindGroup({
        label: `pauli-unpack-c${c}-norm`,
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
        label: `pauli-unpack-c${c}`,
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
    spinorBG,
    potentialBG,
    potentialHalfBG,
    fftSharedMemBGs,
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
