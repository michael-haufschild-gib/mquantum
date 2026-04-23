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

import { diracAbsorberBlock } from '../shaders/schroedinger/compute/diracAbsorber.wgsl'
import {
  diracDiagNormFinalizeBlock,
  diracDiagNormReduceBlock,
} from '../shaders/schroedinger/compute/diracDiagnostics.wgsl'
import { diracInitBlock } from '../shaders/schroedinger/compute/diracInit.wgsl'
import { diracKineticBlock } from '../shaders/schroedinger/compute/diracKinetic.wgsl'
import { diracPotentialBlock } from '../shaders/schroedinger/compute/diracPotential.wgsl'
import { diracPotentialHalfBlock } from '../shaders/schroedinger/compute/diracPotentialHalf.wgsl'
import { diracUniformsBlock } from '../shaders/schroedinger/compute/diracUniforms.wgsl'
import { diracWriteGridBlock } from '../shaders/schroedinger/compute/diracWriteGrid.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import { renormalizeBlock } from '../shaders/schroedinger/compute/renormalize.wgsl'
import {
  tdseComplexPackShaderBlock,
  tdseComplexUnpackShaderBlock,
  tdsePackUniformsShaderBlock,
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTBlock,
} from '../shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
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

/** Pure WGSL for the Dirac init compute shader. */
export function composeDiracInitShader(): string {
  return diracPrelude() + diracInitBlock
}

/** Pure WGSL for the Dirac potential-fill compute shader. */
export function composeDiracPotentialShader(): string {
  return diracPrelude() + diracPotentialBlock
}

/** Pure WGSL for the Dirac potential half-step compute shader. */
export function composeDiracPotentialHalfShader(): string {
  return diracPrelude() + diracPotentialHalfBlock
}

/** Pure WGSL for the Dirac absorber (post-FFT) compute shader. */
export function composeDiracAbsorberShader(): string {
  return diracPrelude() + pmlProfileBlock + diracAbsorberBlock
}

/** Pure WGSL for the Dirac renormalization compute shader. */
export function composeDiracRenormalizeShader(): string {
  return renormalizeBlock
}

/** Pure WGSL for the Dirac pack compute shader. */
export function composeDiracPackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexPackShaderBlock]).wgsl
}

/** Pure WGSL for the Dirac unpack compute shader. */
export function composeDiracUnpackShader(): string {
  return assembleShaderBlocks([tdsePackUniformsShaderBlock, tdseComplexUnpackShaderBlock]).wgsl
}

/** Pure WGSL for the Dirac Stockham FFT stage compute shader. */
export function composeDiracFftStageShader(): string {
  return tdseFFTStageUniformsBlock + tdseStockhamFFTBlock
}

/** Pure WGSL for the Dirac shared-memory per-axis FFT compute shader. */
export function composeDiracFftSharedMemShader(): string {
  return fftAxisUniformsBlock + tdseSharedMemFFTBlock
}

/** Pure WGSL for the Dirac kinetic propagator compute shader. */
export function composeDiracKineticShader(): string {
  return diracPrelude() + diracKineticBlock
}

/** Pure WGSL for the Dirac write-grid compute shader. */
export function composeDiracWriteGridShader(): string {
  return diracPrelude() + diracWriteGridBlock
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
 * Compile every Dirac compute pipeline and return them with their bind
 * group layouts. One-time setup per device; safe to memoize at the pass
 * level.
 */
export function buildDiracPipelines(
  device: GPUDevice,
  helpers: DiracPassHelpers
): DiracPipelineResult {
  // Init: uniforms + spinorRe + spinorIm
  // Binding 0 (DiracUniforms) is `read-only-storage` because the struct embeds
  // scalar arrays (spec-forbidden in uniform address space). See
  // `diracInit.wgsl.ts` for the matching `var<storage, read>` declaration.
  const initBGL = createComputeBGL(device, 'dirac-init-bgl', [
    'read-only-storage',
    'storage',
    'storage',
  ])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracInitShader(), 'dirac-init'),
    [initBGL],
    'dirac-init'
  )

  // Potential fill: uniforms + potential
  // Binding 0 (DiracUniforms) — see init BGL comment.
  const potentialBGL = createComputeBGL(device, 'dirac-potential-bgl', [
    'read-only-storage',
    'storage',
  ])
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracPotentialShader(), 'dirac-potential'),
    [potentialBGL],
    'dirac-potential'
  )

  // Potential half-step: uniforms + spinorRe + spinorIm + potential(read).
  // Binding 0 (DiracUniforms) — see init BGL comment.
  const potentialHalfBGL = createComputeBGL(device, 'dirac-potential-half-bgl', [
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const potentialHalfPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracPotentialHalfShader(), 'dirac-potential-half'),
    [potentialHalfBGL],
    'dirac-potential-half'
  )

  // Absorber — reuses initBGL layout.
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracAbsorberShader(), 'dirac-absorber'),
    [initBGL],
    'dirac-absorber'
  )

  // Renormalization
  const renormalizeBGL = createComputeBGL(device, 'dirac-renormalize-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const renormalizePipeline = device.createComputePipeline({
    label: 'dirac-renormalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
    compute: {
      module: device.createShaderModule({
        label: 'dirac-renormalize',
        code: composeDiracRenormalizeShader(),
      }),
      entryPoint: 'main',
    },
  })

  // Pack/Unpack (reuse TDSE shaders directly — they operate on totalSites elements
  // and include their own PackUniforms struct definition)
  const packBGL = createComputeBGL(device, 'dirac-pack-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const packPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracPackShader(), 'dirac-pack'),
    [packBGL],
    'dirac-pack'
  )

  const unpackBGL = createComputeBGL(device, 'dirac-unpack-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const unpackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracUnpackShader(), 'dirac-unpack'),
    [unpackBGL],
    'dirac-unpack'
  )

  // FFT stage (reuse TDSE FFT shader)
  const fftStageBGL = createComputeBGL(device, 'dirac-fft-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const fftStagePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracFftStageShader(), 'dirac-fft-stage'),
    [fftStageBGL],
    'dirac-fft-stage'
  )

  // Shared-memory FFT: one dispatch per axis
  const fftSharedMemBGL = createComputeBGL(device, 'dirac-fft-shared-mem-bgl', [
    'uniform',
    'storage',
  ])
  const fftSharedMemPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracFftSharedMemShader(), 'dirac-fft-shared-mem'),
    [fftSharedMemBGL],
    'dirac-fft-shared-mem'
  )

  // Kinetic propagator: uniforms + spinorRe + spinorIm + gammaMatrices(read).
  // Binding 0 (DiracUniforms) — see init BGL comment.
  const kineticBGL = createComputeBGL(device, 'dirac-kinetic-bgl', [
    'read-only-storage',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracKineticShader(), 'dirac-kinetic'),
    [kineticBGL],
    'dirac-kinetic'
  )

  // Write grid. Binding 0 (DiracUniforms) — see init BGL comment.
  const writeGridBGL = createComputeBGL(device, 'dirac-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracWriteGridShader(), 'dirac-write-grid'),
    [writeGridBGL],
    'dirac-write-grid'
  )

  // Diagnostics: reduce (pass 1)
  const diagReduceBGL = createComputeBGL(device, 'dirac-diag-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
    'storage',
  ])
  const diagReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracDiagReduceShader(), 'dirac-diag-reduce'),
    [diagReduceBGL],
    'dirac-diag-reduce'
  )

  // Diagnostics: finalize (pass 2)
  const diagFinalizeBGL = createComputeBGL(device, 'dirac-diag-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
    'read-only-storage',
  ])
  const diagFinalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeDiracDiagFinalizeShader(), 'dirac-diag-finalize'),
    [diagFinalizeBGL],
    'dirac-diag-finalize'
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
    spinorReBuffer,
    spinorImBuffer,
    potentialBuffer,
    gammaBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
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
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
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
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
    ],
  })

  // FFT bind groups
  const fftStageABBG = device.createBindGroup({
    label: 'dirac-fft-ab-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'dirac-fft-ba-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
    ],
  })

  // Shared-memory FFT bind group: per-axis uniforms + complexBuf (read_write on fftScratchA).
  // `fftSharedMemBG` uses the shared single-uniform buffer (legacy dispatchFFTAxisSharedMem
  // path patches it via copyBufferToBuffer and incurs a pass boundary per axis).
  const fftSharedMemBG = device.createBindGroup({
    label: 'dirac-fft-shared-mem-bg',
    layout: pipelines.fftSharedMemBGL,
    entries: [
      { binding: 0, resource: { buffer: inputs.fftAxisUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
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
      ],
    })
  }

  const kineticBG = device.createBindGroup({
    label: 'dirac-kinetic-bg',
    layout: pipelines.kineticBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: { buffer: gammaBuffer } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'dirac-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
      { binding: 4, resource: { buffer: gammaBuffer } },
      { binding: 5, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups
  const diagReduceBG = device.createBindGroup({
    label: 'dirac-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: spinorReBuffer } },
      { binding: 2, resource: { buffer: spinorImBuffer } },
      { binding: 3, resource: { buffer: diagPartialNormBuffer } },
      { binding: 4, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 5, resource: { buffer: diagPartialParticleBuffer } },
      { binding: 6, resource: { buffer: diagPartialAntiBuffer } },
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
      { binding: 2, resource: { buffer: spinorReBuffer } },
      { binding: 3, resource: { buffer: spinorImBuffer } },
    ],
  })

  // Build cached per-component pack/unpack bind groups
  const cachedPackBGs: GPUBindGroup[] = []
  const cachedUnpackBGs: GPUBindGroup[] = []
  const cachedUnpackBGsNoNorm: GPUBindGroup[] = []
  const S = currentSpinorSize
  for (let c = 0; c < S; c++) {
    const byteOffset = c * totalSites * 4
    const byteSize = totalSites * 4

    cachedPackBGs.push(
      device.createBindGroup({
        label: `dirac-pack-c${c}`,
        layout: pipelines.packBGL,
        entries: [
          { binding: 0, resource: { buffer: packUniformBuffer } },
          { binding: 1, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 2, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: fftScratchA } },
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
          { binding: 2, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
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
          { binding: 2, resource: { buffer: spinorReBuffer, offset: byteOffset, size: byteSize } },
          { binding: 3, resource: { buffer: spinorImBuffer, offset: byteOffset, size: byteSize } },
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
