/**
 * Dirac Compute Pass — Buffer Creation
 *
 * Creates all GPU buffers required by the Dirac equation compute pass.
 * Extracted from DiracComputePassSetup to keep individual files under the 600-line limit.
 */

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { spinorSize } from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { FFT_UNIFORM_SIZE, PACK_UNIFORM_SIZE } from './computePassUtils'
import type {
  DiracBufferResult,
  DiracDestroyableBuffers,
  DiracPassHelpers,
} from './DiracComputePassTypes'

/** DiracUniforms struct size in bytes (544) */
const UNIFORM_SIZE = 544
/** Diagnostics workgroup size */
const DIAG_WG = 256
/** DiracDiagUniforms struct size (16 bytes: totalSites, numWorkgroups, spinorSize, pad) */
const DIAG_UNIFORM_SIZE = 16
/** Number of f32 values in diagnostic result buffer */
const DIAG_RESULT_COUNT = 4

/**
 * Destroy old GPU buffers and create all buffers required by the Dirac
 * compute pass for the given lattice configuration.
 *
 * @param device - WebGPU device
 * @param config - Current Dirac configuration (already sanitized)
 * @param old - Buffers from the previous configuration to destroy
 * @param helpers - Base-class helper methods
 * @param buildFFTStagingData - Callback to generate pre-computed FFT stage uniforms
 * @returns All newly created buffers and derived scalar state
 */
export function rebuildDiracBuffers(
  device: GPUDevice,
  config: DiracConfig,
  old: DiracDestroyableBuffers,
  helpers: DiracPassHelpers,
  buildFFTStagingData: (config: DiracConfig, totalSites: number) => ArrayBuffer
): DiracBufferResult {
  // Destroy old buffers
  old.spinorReBuffer?.destroy()
  old.spinorImBuffer?.destroy()
  old.potentialBuffer?.destroy()
  old.gammaBuffer?.destroy()
  old.fftScratchA?.destroy()
  old.fftScratchB?.destroy()
  old.uniformBuffer?.destroy()
  old.fftUniformBuffer?.destroy()
  old.fftStagingBuffer?.destroy()
  old.fftAxisUniformBuffer?.destroy()
  old.fftAxisStagingBuffer?.destroy()
  old.packUniformBuffer?.destroy()
  old.packUniformBufferNoNorm?.destroy()
  old.diagUniformBuffer?.destroy()
  old.diagPartialNormBuffer?.destroy()
  old.diagPartialMaxBuffer?.destroy()
  old.diagPartialParticleBuffer?.destroy()
  old.diagPartialAntiBuffer?.destroy()
  old.diagResultBuffer?.destroy()
  old.diagStagingBuffer?.destroy()

  // Compute dimensions
  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) totalSites *= config.gridSize[d]!
  const S = spinorSize(config.latticeDim)

  // Spinor buffers: S × totalSites floats each
  const spinorBytes = S * totalSites * 4
  const spinorReBuffer = device.createBuffer({
    label: 'dirac-spinorRe',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const spinorImBuffer = device.createBuffer({
    label: 'dirac-spinorIm',
    size: spinorBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Potential buffer (scalar, one per site)
  const siteBytes = totalSites * 4
  const potentialBuffer = device.createBuffer({
    label: 'dirac-potential',
    size: siteBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // Gamma matrices buffer: (N+1) matrices × S×S×2 floats
  const gammaFloats = (config.latticeDim + 1) * S * S * 2
  const gammaBuffer = device.createBuffer({
    label: 'dirac-gamma-matrices',
    size: gammaFloats * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // FFT scratch buffers (used for one component at a time)
  const complexBytes = totalSites * 8
  const fftScratchA = device.createBuffer({
    label: 'dirac-fft-scratch-a',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftScratchB = device.createBuffer({
    label: 'dirac-fft-scratch-b',
    size: complexBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  // Uniform buffers
  const uniformBuffer = helpers.createUniformBuffer(device, UNIFORM_SIZE, 'dirac-uniforms')
  const fftUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'dirac-fft-uniforms'
  )
  const packUniformBuffer = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'dirac-pack-uniforms'
  )

  // FFT staging buffer (Stockham per-stage fallback — still allocated for diagnostics FFT)
  let stockhamFwdStageCount = 0
  for (let d = 0; d < config.latticeDim; d++) {
    stockhamFwdStageCount += Math.log2(config.gridSize[d]!)
  }
  const totalFFTStages = stockhamFwdStageCount * 2
  // Shared-memory FFT: one slot per axis (used as inverse FFT offset)
  const fwdStageCount = config.latticeDim
  const fftStagingBuffer = device.createBuffer({
    label: 'dirac-fft-staging',
    size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftStagingData = buildFFTStagingData(config, totalSites)
  device.queue.writeBuffer(fftStagingBuffer, 0, fftStagingData)

  // Shared-memory FFT: per-axis uniform buffer + staging buffer
  const fftAxisUniformBuffer = helpers.createUniformBuffer(
    device,
    FFT_UNIFORM_SIZE,
    'dirac-fft-axis-uniforms'
  )
  const axisSlotCount = config.latticeDim * 2 // forward + inverse
  const fftAxisStagingBuffer = device.createBuffer({
    label: 'dirac-fft-axis-staging',
    size: Math.max(FFT_UNIFORM_SIZE, axisSlotCount * FFT_UNIFORM_SIZE),
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const fftAxisStagingData = buildFFTAxisStagingData(config, totalSites)
  device.queue.writeBuffer(fftAxisStagingBuffer, 0, fftAxisStagingData)

  // Pack uniforms (with 1/N normalization for inverse FFT unpack)
  const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const pu32 = new Uint32Array(packData)
  const pf32 = new Float32Array(packData)
  pu32[0] = totalSites
  pf32[1] = 1.0 / totalSites
  device.queue.writeBuffer(packUniformBuffer, 0, packData)

  // Pack uniforms WITHOUT normalization (invN=1.0 for forward FFT unpack)
  const packUniformBufferNoNorm = helpers.createUniformBuffer(
    device,
    PACK_UNIFORM_SIZE,
    'dirac-pack-uniforms-no-norm'
  )
  const noNormData = new ArrayBuffer(PACK_UNIFORM_SIZE)
  const nnu32 = new Uint32Array(noNormData)
  const nnf32 = new Float32Array(noNormData)
  nnu32[0] = totalSites
  nnf32[1] = 1.0 // No normalization for forward FFT
  device.queue.writeBuffer(packUniformBufferNoNorm, 0, noNormData)

  // Diagnostics
  const diagNumWorkgroups = Math.ceil(totalSites / DIAG_WG)
  const diagUniformBuffer = helpers.createUniformBuffer(
    device,
    DIAG_UNIFORM_SIZE,
    'dirac-diag-uniforms'
  )
  const diagPartialNormBuffer = device.createBuffer({
    label: 'dirac-diag-partial-norm',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialMaxBuffer = device.createBuffer({
    label: 'dirac-diag-partial-max',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialParticleBuffer = device.createBuffer({
    label: 'dirac-diag-partial-particle',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagPartialAntiBuffer = device.createBuffer({
    label: 'dirac-diag-partial-anti',
    size: diagNumWorkgroups * 4,
    usage: GPUBufferUsage.STORAGE,
  })
  const diagResultBuffer = device.createBuffer({
    label: 'dirac-diag-result',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const diagStagingBuffer = device.createBuffer({
    label: 'dirac-diag-staging',
    size: DIAG_RESULT_COUNT * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  useDiagnosticsStore.getState().resetDirac()

  return {
    spinorReBuffer,
    spinorImBuffer,
    potentialBuffer,
    gammaBuffer,
    fftScratchA,
    fftScratchB,
    uniformBuffer,
    fftUniformBuffer,
    fftStagingBuffer,
    fftAxisUniformBuffer,
    fftAxisStagingBuffer,
    packUniformBuffer,
    packUniformBufferNoNorm,
    diagUniformBuffer,
    diagPartialNormBuffer,
    diagPartialMaxBuffer,
    diagPartialParticleBuffer,
    diagPartialAntiBuffer,
    diagResultBuffer,
    diagStagingBuffer,
    totalSites,
    currentSpinorSize: S,
    fwdStageCount,
    diagNumWorkgroups,
  }
}

/**
 * Build per-axis staging data for the shared-memory FFT.
 * One 32-byte slot per axis per direction (forward + inverse).
 * Identical layout to TDSE's `buildTdseFFTAxisStagingData`.
 */
function buildFFTAxisStagingData(config: DiracConfig, totalSites: number): ArrayBuffer {
  const slotCount = config.latticeDim * 2 // forward + inverse
  const data = new ArrayBuffer(slotCount * FFT_UNIFORM_SIZE)
  let slotIdx = 0

  for (const direction of [1.0, -1.0]) {
    let axisStride = 1
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      const log2N = Math.round(Math.log2(axisDim))

      const offset = slotIdx * FFT_UNIFORM_SIZE
      const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
      view.setUint32(0, axisDim, true) // axisDim
      view.setFloat32(4, direction, true) // direction
      view.setUint32(8, totalSites, true) // totalElements
      view.setUint32(12, axisStride, true) // axisStride
      view.setUint32(16, log2N, true) // log2N
      view.setUint32(20, 0, true) // _pad0
      view.setUint32(24, 0, true) // _pad1
      view.setUint32(28, 0, true) // _pad2
      slotIdx++

      axisStride *= axisDim
    }
  }

  return data
}
