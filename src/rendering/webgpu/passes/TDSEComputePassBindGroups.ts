/**
 * TDSE Compute Pass — Bind Group Creation
 *
 * Creates all GPU bind groups for the TDSE compute pass from pipelines and buffers.
 * Extracted from TDSEComputePassSetup to keep files under the 600-line limit.
 *
 * @module rendering/webgpu/passes/TDSEComputePassBindGroups
 */

import type {
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePipelineResult,
} from './TDSEComputePassTypes'

/**
 * Create all bind groups for the TDSE compute pass from pipelines and buffers.
 *
 * @param device - WebGPU device
 * @param pipelines - Pipeline layouts from buildTdsePipelines
 * @param inputs - GPU buffers and resources
 * @param oldRenormUniformBuffer - Previous renormalize uniform buffer to destroy (may be null)
 * @returns All bind groups and the renormalize uniform buffer
 */
export function rebuildTdseBindGroups(
  device: GPUDevice,
  pipelines: TdsePipelineResult,
  inputs: TdseBindGroupInputs,
  oldRenormUniformBuffer: GPUBuffer | null
): TdseBindGroupResult {
  const {
    uniformBuffer,
    psiBuffer,
    potentialBuffer,
    fftScratchA,
    fftScratchB,
    fftUniformBuffer,
    fftAxisUniformBuffer,
    fftAxisUniformBuffers,
    fftTwiddleBuffer,
    packUniformBuffer,
    densityTextureView,
    diagUniformBuffer,
    diagPartialSumsBuffer,
    diagPartialMaxBuffer,
    diagPartialLeftBuffer,
    diagPartialRightBuffer,
    diagPartialIprBuffer,
    diagResultBuffer,
    totalSites,
  } = inputs

  const initBG = device.createBindGroup({
    label: 'tdse-init-bg',
    layout: pipelines.initBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
    ],
  })

  const potentialBG = device.createBindGroup({
    label: 'tdse-potential-bg',
    layout: pipelines.potentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
    ],
  })

  const potentialHalfBG = device.createBindGroup({
    label: 'tdse-potential-half-bg',
    layout: pipelines.potentialHalfBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
    ],
  })

  // PERF: Fused potentialHalf + pack bind group (vec2f ψ)
  const fusedPotentialPackBG = device.createBindGroup({
    label: 'tdse-fused-potential-pack-bg',
    layout: pipelines.fusedPotentialPackBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
      { binding: 3, resource: { buffer: fftScratchA } },
    ],
  })

  // PERF: Fused unpack + potentialHalf bind group (vec2f ψ)
  // Note: shared-memory FFT writes result back to fftScratchA in-place,
  // so the fused unpack always reads from fftScratchA.
  const fusedUnpackPotentialBG = device.createBindGroup({
    label: 'tdse-fused-unpack-potential-bg',
    layout: pipelines.fusedUnpackPotentialBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: psiBuffer } },
      { binding: 3, resource: { buffer: potentialBuffer } },
    ],
  })

  const packBG = device.createBindGroup({
    label: 'tdse-pack-bg',
    layout: pipelines.packBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: fftScratchA } },
    ],
  })

  const unpackBG = device.createBindGroup({
    label: 'tdse-unpack-bg',
    layout: pipelines.unpackBGL,
    entries: [
      { binding: 0, resource: { buffer: packUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: psiBuffer } },
    ],
  })

  // FFT bind groups for A->B and B->A ping-pong. Binding 3 is the twiddle
  // table that replaces cos/sin at stages >= 2 (see FFTTwiddle.ts).
  const fftStageABBG = device.createBindGroup({
    label: 'tdse-fft-ab-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftScratchB } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  const fftStageBABG = device.createBindGroup({
    label: 'tdse-fft-ba-bg',
    layout: pipelines.fftStageBGL,
    entries: [
      { binding: 0, resource: { buffer: fftUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchB } },
      { binding: 2, resource: { buffer: fftScratchA } },
      { binding: 3, resource: { buffer: fftTwiddleBuffer } },
    ],
  })

  // Shared-memory FFT bind group: per-axis uniforms + complexBuf (read_write on fftScratchA).
  // `fftSharedMemBG` uses the legacy single-uniform buffer; observables momentum FFT path
  // (runPostStepDispatches) copies the right axis slot into it via copyBufferToBuffer.
  // Binding 2 is the twiddle table shared with the per-stage kernel.
  const fftSharedMemBG = device.createBindGroup({
    label: 'tdse-fft-shared-mem-bg',
    layout: pipelines.fftSharedMemBGL,
    entries: [
      { binding: 0, resource: { buffer: fftAxisUniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
      { binding: 2, resource: { buffer: fftTwiddleBuffer } },
    ],
  })
  // PERF: per-slot bind groups (one per axis per direction) so the Strang-step
  // FFT dispatches can run in a single compute pass without per-axis uniform
  // copies forcing pass boundaries.
  const fftSharedMemBGs: GPUBindGroup[] = new Array(fftAxisUniformBuffers.length)
  for (let slot = 0; slot < fftAxisUniformBuffers.length; slot++) {
    fftSharedMemBGs[slot] = device.createBindGroup({
      label: `tdse-fft-shared-mem-bg-slot-${slot}`,
      layout: pipelines.fftSharedMemBGL,
      entries: [
        { binding: 0, resource: { buffer: fftAxisUniformBuffers[slot]! } },
        { binding: 1, resource: { buffer: fftScratchA } },
        { binding: 2, resource: { buffer: fftTwiddleBuffer } },
      ],
    })
  }

  const kineticBG = device.createBindGroup({
    label: 'tdse-kinetic-bg',
    layout: pipelines.kineticBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: fftScratchA } },
    ],
  })

  const writeGridBG = device.createBindGroup({
    label: 'tdse-write-grid-bg',
    layout: pipelines.writeGridBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: potentialBuffer } },
      { binding: 3, resource: densityTextureView },
    ],
  })

  // Diagnostics bind groups. ψ is now a single vec2f binding; partial-sum
  // buffers shifted down by one binding index to stay contiguous.
  const diagReduceBG = device.createBindGroup({
    label: 'tdse-diag-reduce-bg',
    layout: pipelines.diagReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: psiBuffer } },
      { binding: 2, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 3, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 4, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 5, resource: { buffer: diagPartialRightBuffer } },
      { binding: 6, resource: { buffer: diagPartialIprBuffer } },
      { binding: 7, resource: { buffer: uniformBuffer } },
    ],
  })

  const diagFinalizeBG = device.createBindGroup({
    label: 'tdse-diag-finalize-bg',
    layout: pipelines.diagFinalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: diagUniformBuffer } },
      { binding: 1, resource: { buffer: diagPartialSumsBuffer } },
      { binding: 2, resource: { buffer: diagPartialMaxBuffer } },
      { binding: 3, resource: { buffer: diagResultBuffer } },
      { binding: 4, resource: { buffer: diagPartialLeftBuffer } },
      { binding: 5, resource: { buffer: diagPartialRightBuffer } },
      { binding: 6, resource: { buffer: diagPartialIprBuffer } },
    ],
  })

  // Renormalization bind group
  oldRenormUniformBuffer?.destroy()
  const renormalizeUniformBuffer = device.createBuffer({
    label: 'tdse-renormalize-uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // TDSE has 1 component; BEC also has 1 component (shared pass)
  // targetNorm (f32 at offset 4) starts at 0; updated when initialNorm is captured
  const renormBuf = new ArrayBuffer(16)
  new Uint32Array(renormBuf)[0] = totalSites
  new Float32Array(renormBuf)[1] = 0 // targetNorm = 0 → shader skips until set
  device.queue.writeBuffer(renormalizeUniformBuffer, 0, renormBuf)
  const renormalizeBG = device.createBindGroup({
    label: 'tdse-renormalize-bg',
    layout: pipelines.renormalizeBGL,
    entries: [
      { binding: 0, resource: { buffer: renormalizeUniformBuffer } },
      { binding: 1, resource: { buffer: diagResultBuffer } },
      { binding: 2, resource: { buffer: psiBuffer } },
    ],
  })

  return {
    initBG,
    potentialBG,
    potentialHalfBG,
    fusedPotentialPackBG,
    fusedUnpackPotentialBG,
    packBG,
    unpackBG,
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
  }
}
