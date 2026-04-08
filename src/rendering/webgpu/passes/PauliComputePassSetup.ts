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
import { pauliAbsorberBlock } from '../shaders/schroedinger/compute/pauliAbsorber.wgsl'
import {
  pauliDiagFinalizeBlock,
  pauliDiagReduceBlock,
} from '../shaders/schroedinger/compute/pauliDiagnostics.wgsl'
import { pauliInitBlock } from '../shaders/schroedinger/compute/pauliInit.wgsl'
import { pauliKineticBlock } from '../shaders/schroedinger/compute/pauliKinetic.wgsl'
import { pauliPotentialHalfBlock } from '../shaders/schroedinger/compute/pauliPotentialHalf.wgsl'
import { pauliUniformsBlock } from '../shaders/schroedinger/compute/pauliUniforms.wgsl'
import { pauliWriteGridBlock } from '../shaders/schroedinger/compute/pauliWriteGrid.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { renormalizeBlock } from '../shaders/schroedinger/compute/renormalize.wgsl'
import {
  tdseComplexPackShaderBlock,
  tdseComplexUnpackShaderBlock,
  tdsePackUniformsShaderBlock,
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import { assembleShaderBlocks } from '../shaders/shared/compose-helpers'
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
  potentialHalfPipeline: GPUComputePipeline
  absorberPipeline: GPUComputePipeline
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
  spinorBGL: GPUBindGroupLayout
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
  spinorReBuffer: GPUBuffer
  spinorImBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
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
export function buildPauliPipelines(device: GPUDevice): PauliPipelineResult {
  // Common shader preamble: uniforms struct + N-D index utilities
  const preamble = `${pauliUniformsBlock}\n${freeScalarNDIndexBlock}\n`

  // Shared BGL for spinor passes: uniform + spinorRe(rw) + spinorIm(rw)
  const spinorBGL = createComputeBGL(device, 'pauli-spinor-bgl', ['uniform', 'storage', 'storage'])
  const spinorLayout = device.createPipelineLayout({ bindGroupLayouts: [spinorBGL] })

  // Init pipeline
  const initPipeline = device.createComputePipeline({
    label: 'pauli-init-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({ label: 'pauli-init', code: preamble + pauliInitBlock }),
      entryPoint: 'main',
    },
  })

  // Potential half-step + Zeeman rotation pipeline
  const potentialHalfPipeline = device.createComputePipeline({
    label: 'pauli-potential-half-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-potential-half',
        code: preamble + pauliPotentialHalfBlock,
      }),
      entryPoint: 'main',
    },
  })

  // Absorber (separate pass after Strang step — NOT merged into potential half-step).
  // Running absorption after the FFT kinetic step prevents the FFT from scattering
  // the spatially-modulated absorber profile across k-space.
  // Reuses spinorBGL layout (uniform + spinorRe + spinorIm).
  const absorberPipeline = device.createComputePipeline({
    label: 'pauli-absorber-pipeline',
    layout: spinorLayout,
    compute: {
      module: device.createShaderModule({
        label: 'pauli-absorber',
        code: preamble + pmlProfileBlock + pauliAbsorberBlock,
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
        code: preamble + pauliKineticBlock,
      }),
      entryPoint: 'main',
    },
  })

  // Renormalization pipeline: reads totalNorm from diagResultBuffer,
  // scales ψ by 1/√(totalNorm) to counteract f32 norm drift.
  // Layout: uniform(totalElements) + diagResult(read) + spinorRe(rw) + spinorIm(rw)
  const renormalizeBGL = createComputeBGL(device, 'pauli-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const renormalizePipeline = device.createComputePipeline({
    label: 'pauli-renormalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-renormalize',
        code: renormalizeBlock,
      }),
      entryPoint: 'main',
    },
  })

  // Write-grid pipeline: uniform + spinorRe(read) + spinorIm(read) + texture_storage_3d(write)
  const writeGridBGL = createComputeBGL(device, 'pauli-write-grid-bgl', [
    'uniform',
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
        code: preamble + pauliWriteGridBlock,
      }),
      entryPoint: 'main',
    },
  })

  // Pack BGL: uniforms + spinorRe + spinorIm + scratchA
  const packBGL = createComputeBGL(device, 'pauli-pack-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const packPipeline = device.createComputePipeline({
    label: 'pauli-pack-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [packBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-pack',
        code: assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexPackShaderBlock]).wgsl,
      }),
      entryPoint: 'main',
    },
  })

  // Unpack BGL: uniforms + scratchA + spinorRe + spinorIm
  const unpackBGL = createComputeBGL(device, 'pauli-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const unpackPipeline = device.createComputePipeline({
    label: 'pauli-unpack-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [unpackBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-unpack',
        code: assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexUnpackShaderBlock]).wgsl,
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
        code: `\n${tdseFFTStageUniformsBlock}\n${tdseStockhamFFTBlock}\n`,
      }),
      entryPoint: 'main',
    },
  })

  // Diagnostics: reduce BGL
  const diagReduceBGL = createComputeBGL(device, 'pauli-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const diagReducePipeline = device.createComputePipeline({
    label: 'pauli-diag-reduce-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [diagReduceBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'pauli-diag-reduce',
        code: pauliDiagReduceBlock,
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
        code: pauliDiagFinalizeBlock,
      }),
      entryPoint: 'main',
    },
  })

  return {
    initPipeline,
    potentialHalfPipeline,
    absorberPipeline,
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
    spinorReBuffer,
    spinorImBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    densityTextureView,
    diagUniformBuffer,
    diagPartialBuffer,
    diagResultBuffer,
    totalSites,
  } = inputs

  // Shared spinor BG for init/potentialHalf/kinetic/absorber
  const spinorBG = device.createBindGroup({
    label: 'pauli-spinor-bg',
    layout: pipelines.spinorBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
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
      { binding: 2, resource: { buffer: spinorReBuffer } },
      { binding: 3, resource: { buffer: spinorImBuffer } },
    ],
  })

  // Write-grid bind group
  const writeGridBG = device.createBindGroup({
    label: 'pauli-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups
  const diagReduceBG = device.createBindGroup({
    label: 'pauli-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: { buffer: diagPartialBuffer } },
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

  // Build cached per-component pack/unpack bind groups (2 components: up, down)
  const cachedPackBGs: GPUBindGroup[] = []
  const cachedUnpackBGs: GPUBindGroup[] = []
  const cachedUnpackBGsNoNorm: GPUBindGroup[] = []
  for (let c = 0; c < 2; c++) {
    const byteOffset = c * totalSites * Float32Array.BYTES_PER_ELEMENT
    const byteSize = totalSites * Float32Array.BYTES_PER_ELEMENT

    cachedPackBGs.push(
      device.createBindGroup({
        label: `pauli-pack-c${c}`,
        layout: pipelines.packBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBufferNoNorm } },
          { binding: 1, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 2, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: fftScratchA } },
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
          { binding: 2, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
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
          { binding: 2, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
        ],
      })
    )
  }

  return {
    spinorBG,
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
