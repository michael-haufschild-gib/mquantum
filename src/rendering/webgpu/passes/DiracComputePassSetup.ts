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
  tdseComplexPackBlock,
  tdseComplexUnpackBlock,
  tdsePackUniformsBlock,
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
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
export function buildDiracPipelines(
  device: GPUDevice,
  helpers: DiracPassHelpers
): DiracPipelineResult {
  const unifAndIndex = diracUniformsBlock + freeScalarNDIndexBlock

  // Init: uniforms + spinorRe + spinorIm
  const initBGL = createComputeBGL(device, 'dirac-init-bgl', ['uniform', 'storage', 'storage'])
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracInitBlock, 'dirac-init'),
    [initBGL],
    'dirac-init'
  )

  // Potential fill: uniforms + potential
  const potentialBGL = createComputeBGL(device, 'dirac-potential-bgl', ['uniform', 'storage'])
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracPotentialBlock, 'dirac-potential'),
    [potentialBGL],
    'dirac-potential'
  )

  // Potential half-step: uniforms + spinorRe + spinorIm + potential(read)
  const potentialHalfBGL = createComputeBGL(device, 'dirac-potential-half-bgl', [
    'uniform',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const potentialHalfPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + diracPotentialHalfBlock,
      'dirac-potential-half'
    ),
    [potentialHalfBGL],
    'dirac-potential-half'
  )

  // Absorber (separate pass after Strang step — NOT merged into potential half-step).
  // Running absorption after the FFT kinetic step prevents the FFT from scattering
  // the spatially-modulated absorber profile across k-space.
  // Reuses initBGL layout (uniform + spinorRe + spinorIm).
  const absorberPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      unifAndIndex + pmlProfileBlock + diracAbsorberBlock,
      'dirac-absorber'
    ),
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
      module: device.createShaderModule({ label: 'dirac-renormalize', code: renormalizeBlock }),
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
    helpers.createShaderModule(device, tdsePackUniformsBlock + tdseComplexPackBlock, 'dirac-pack'),
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
    helpers.createShaderModule(
      device,
      tdsePackUniformsBlock + tdseComplexUnpackBlock,
      'dirac-unpack'
    ),
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
    helpers.createShaderModule(
      device,
      tdseFFTStageUniformsBlock + tdseStockhamFFTBlock,
      'dirac-fft-stage'
    ),
    [fftStageBGL],
    'dirac-fft-stage'
  )

  // Kinetic propagator: uniforms + spinorRe + spinorIm + gammaMatrices(read)
  const kineticBGL = createComputeBGL(device, 'dirac-kinetic-bgl', [
    'uniform',
    'storage',
    'storage',
    'read-only-storage',
  ])
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracKineticBlock, 'dirac-kinetic'),
    [kineticBGL],
    'dirac-kinetic'
  )

  // Write grid: uniforms + spinorRe + spinorIm + potential + gamma + outputTex
  const writeGridBGL = createComputeBGL(device, 'dirac-write-grid-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
  ])
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracWriteGridBlock, 'dirac-write-grid'),
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
    helpers.createShaderModule(device, diracDiagNormReduceBlock, 'dirac-diag-reduce'),
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
    helpers.createShaderModule(device, diracDiagNormFinalizeBlock, 'dirac-diag-finalize'),
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
