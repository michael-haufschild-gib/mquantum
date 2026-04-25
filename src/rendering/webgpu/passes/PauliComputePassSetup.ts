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
import { pauliKineticBlock } from '../shaders/schroedinger/compute/pauliKinetic.wgsl'
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
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
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
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  unpackPipeline: GPUComputePipeline
  fftStagePipeline: GPUComputePipeline
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
  fftStageBGL: GPUBindGroupLayout
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
  fftStageABBG: GPUBindGroup
  fftStageBABG: GPUBindGroup
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
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
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

/** Pure WGSL for the Pauli Stockham FFT stage compute shader. */
export function composePauliFftStageShader(): string {
  return `\n${tdseFFTStageUniformsBlock}\n${tdseStockhamFFTBlock}\n`
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
 * Compile every Pauli-spinor compute pipeline and return them with
 * their bind group layouts. One-time setup per device.
 */
export function buildPauliPipelines(device: GPUDevice): PauliPipelineResult {
  // Shared BGL for spinor passes: PauliUniforms + merged spinor (rw).
  // Binding 0 is `read-only-storage` because PauliUniforms embeds scalar arrays
  // (spec-forbidden in uniform address space). See pauliInit.wgsl.ts for the
  // matching `var<storage, read>` declaration. Binding 1 is the merged
  // `array<vec2f>` spinor buffer (Item 1 of the perf batch — collapses the
  // prior two split f32 bindings into one 8-byte vec2f binding).
  const spinorBGL = createComputeBGL(device, 'pauli-spinor-bgl', ['read-only-storage', 'storage'])
  const spinorLayout = device.createPipelineLayout({ bindGroupLayouts: [spinorBGL] })

  // Init pipeline
  const initPipeline = device.createComputePipeline({
    label: 'pauli-init-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({ label: 'pauli-init', code: composePauliInitShader() }),
      entryPoint: 'main',
    },
  })
  // 3D-dispatch sibling — same BGL/layout, alternative entry-point shape.
  const init3DPipeline = device.createComputePipeline({
    label: 'pauli-init-3d-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-init-3d',
        code: composePauliInit3DShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Potential fill pipeline (pauliPotential). Dispatched once per parameter
  // change — not per substep — so pauliPotentialHalf only pays one load.
  const potentialBGL = createComputeBGL(device, 'pauli-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialLayout = device.createPipelineLayout({ bindGroupLayouts: [potentialBGL] })
  const potentialPipeline = device.createComputePipeline({
    label: 'pauli-potential-pipeline',
    layout: potentialLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-potential',
        code: composePauliPotentialShader(),
      }),
      entryPoint: 'main',
    },
  })
  const potential3DPipeline = device.createComputePipeline({
    label: 'pauli-potential-3d-pipeline',
    layout: potentialLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-potential-3d',
        code: composePauliPotential3DShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Potential half-step + Zeeman rotation pipeline. Separate 3-binding BGL
  // so that init/kinetic/absorber (which never read V) stay on the lean
  // 2-binding spinorBGL. With the merged `array<vec2f>` spinor, this
  // shrinks from 4 to 3 bindings (was: params, spinorRe, spinorIm, potential).
  const potentialHalfBGL = createComputeBGL(device, 'pauli-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const potentialHalfLayout = device.createPipelineLayout({
    bindGroupLayouts: [potentialHalfBGL],
  })
  const potentialHalfPipeline = device.createComputePipeline({
    label: 'pauli-potential-half-pipeline',
    layout: potentialHalfLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-potential-half',
        code: composePauliPotentialHalfShader(),
      }),
      entryPoint: 'main',
    },
  })
  const potentialHalf3DPipeline = device.createComputePipeline({
    label: 'pauli-potential-half-3d-pipeline',
    layout: potentialHalfLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-potential-half-3d',
        code: composePauliPotentialHalf3DShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Absorber — reuses spinorBGL layout.
  const absorberPipeline = device.createComputePipeline({
    label: 'pauli-absorber-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-absorber',
        code: composePauliAbsorberShader(),
      }),
      entryPoint: 'main',
    },
  })
  const absorber3DPipeline = device.createComputePipeline({
    label: 'pauli-absorber-3d-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-absorber-3d',
        code: composePauliAbsorber3DShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Kinetic phase kick pipeline (k-space)
  const kineticPipeline = device.createComputePipeline({
    label: 'pauli-kinetic-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-kinetic',
        code: composePauliKineticShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Renormalization pipeline. 3 bindings against the merged spinor buffer
  // (uniform params, diagResult RO, merged spinor RW).
  const renormalizeBGL = createComputeBGL(device, 'pauli-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const renormalizePipeline = device.createComputePipeline({
    label: 'pauli-renormalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-renormalize',
        code: composePauliRenormalizeShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Write-grid pipeline. Binding 0 (PauliUniforms) — see spinor BGL comment.
  // Binding 1 is the merged spinor buffer (RO); binding 2 is the density
  // storage texture. Collapsed from 4 bindings after the merge.
  const writeGridBGL = createComputeBGL(device, 'pauli-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  const writeGridPipeline = device.createComputePipeline({
    label: 'pauli-write-grid-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [writeGridBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-write-grid',
        code: composePauliWriteGridShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Pack BGL: uniform + per-component merged spinor slice (RO, array<vec2f>)
  // + interleaved complexBuf (RW). Collapsed from 4 bindings — the old
  // layout bound split psiRe + psiIm.
  const packBGL = createComputeBGL(device, 'pauli-pack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const packPipeline = device.createComputePipeline({
    label: 'pauli-pack-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [packBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-pack',
        code: composePauliPackShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Unpack BGL: uniform + interleaved complexBuf (RO)
  // + per-component merged spinor slice (RW, array<vec2f>).
  const unpackBGL = createComputeBGL(device, 'pauli-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const unpackPipeline = device.createComputePipeline({
    label: 'pauli-unpack-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [unpackBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-unpack',
        code: composePauliUnpackShader(),
      }),
      entryPoint: 'main',
    },
  })

  // FFT pipeline (shared Stockham FFT infrastructure)
  const fftStageBGL = createComputeBGL(device, 'pauli-fft-stage-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const fftStagePipeline = device.createComputePipeline({
    label: 'pauli-fft-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [fftStageBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-fft-stage',
        code: composePauliFftStageShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Diagnostics: reduce BGL. Collapsed from 4 bindings after the merge
  // (uniform + merged spinor RO + partial output RW).
  const diagReduceBGL = createComputeBGL(device, 'pauli-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const diagReducePipeline = device.createComputePipeline({
    label: 'pauli-diag-reduce-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [diagReduceBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-diag-reduce',
        code: composePauliDiagReduceShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Diagnostics: finalize BGL
  const diagFinalizeBGL = createComputeBGL(device, 'pauli-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const diagFinalizePipeline = device.createComputePipeline({
    label: 'pauli-diag-finalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [diagFinalizeBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-diag-finalize',
        code: composePauliDiagFinalizeShader(),
      }),
      entryPoint: 'main',
    },
  })

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
    renormalizePipeline,
    renormalizeBGL,
    packPipeline,
    unpackPipeline,
    fftStagePipeline,
    writeGridPipeline,
    diagReducePipeline,
    diagFinalizePipeline,
    spinorBGL,
    potentialBGL,
    potentialHalfBGL,
    packBGL,
    unpackBGL,
    fftStageBGL,
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
    fftScratchB,
    fftUniformBuffer,
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

  // FFT bind groups (A→B and B→A)
  const fftStageABBG = device.createBindGroup({
    label: 'pauli-fft-ab',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'pauli-fft-ba',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
    ],
  })

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
    fftStageABBG,
    fftStageBABG,
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
