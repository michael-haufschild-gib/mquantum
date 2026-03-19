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
} from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
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
  const initBGL = device.createBindGroupLayout({
    label: 'dirac-init-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const initPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracInitBlock, 'dirac-init'),
    [initBGL],
    'dirac-init'
  )

  // Potential fill: uniforms + potential
  const potentialBGL = device.createBindGroupLayout({
    label: 'dirac-potential-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const potentialPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracPotentialBlock, 'dirac-potential'),
    [potentialBGL],
    'dirac-potential'
  )

  // Potential half-step: uniforms + spinorRe + spinorIm + potential(read)
  const potentialHalfBGL = device.createBindGroupLayout({
    label: 'dirac-potential-half-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
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
  const renormalizeBGL = device.createBindGroupLayout({
    label: 'dirac-renormalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const renormalizePipeline = device.createComputePipeline({
    label: 'dirac-renormalize-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renormalizeBGL] }),
    compute: {
      module: device.createShaderModule({ label: 'dirac-renormalize', code: renormalizeBlock }),
      entryPoint: 'main',
    },
  })

  // Pack/Unpack (reuse TDSE shaders — they operate on totalSites elements)
  const packUnifBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}
`
  const packBGL = device.createBindGroupLayout({
    label: 'dirac-pack-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const packPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      packUnifBlock + tdseComplexPackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''),
      'dirac-pack'
    ),
    [packBGL],
    'dirac-pack'
  )

  const unpackBGL = device.createBindGroupLayout({
    label: 'dirac-unpack-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const unpackPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      packUnifBlock + tdseComplexUnpackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''),
      'dirac-unpack'
    ),
    [unpackBGL],
    'dirac-unpack'
  )

  // FFT stage (reuse TDSE FFT shader)
  const fftStageBGL = device.createBindGroupLayout({
    label: 'dirac-fft-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
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
  const kineticBGL = device.createBindGroupLayout({
    label: 'dirac-kinetic-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const kineticPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracKineticBlock, 'dirac-kinetic'),
    [kineticBGL],
    'dirac-kinetic'
  )

  // Write grid: uniforms + spinorRe + spinorIm + potential + gamma + outputTex
  const writeGridBGL = device.createBindGroupLayout({
    label: 'dirac-write-grid-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only',
          format: 'rgba16float',
          viewDimension: '3d',
        },
      },
    ],
  })
  const writeGridPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, unifAndIndex + diracWriteGridBlock, 'dirac-write-grid'),
    [writeGridBGL],
    'dirac-write-grid'
  )

  // Diagnostics: reduce (pass 1)
  const diagReduceBGL = device.createBindGroupLayout({
    label: 'dirac-diag-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const diagReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, diracDiagNormReduceBlock, 'dirac-diag-reduce'),
    [diagReduceBGL],
    'dirac-diag-reduce'
  )

  // Diagnostics: finalize (pass 2)
  const diagFinalizeBGL = device.createBindGroupLayout({
    label: 'dirac-diag-finalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
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
