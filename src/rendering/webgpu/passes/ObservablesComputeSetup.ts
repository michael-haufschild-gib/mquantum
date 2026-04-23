/**
 * Observable Expectation Value Compute Setup
 *
 * Creates GPU buffers, pipelines, and bind groups for the position-space
 * and momentum-space observable reduction passes. Designed to be called
 * from TDSEComputePass when observables are enabled.
 *
 * @module rendering/webgpu/passes/ObservablesComputeSetup
 */

import { MAX_DIMENSION } from '@/constants/dimension'
import { logger } from '@/lib/logger'
import { NUM_ENERGY_BINS } from '@/rendering/webgpu/shaders/schroedinger/compute/energySpectralDensity.wgsl'
import type { ObservablesSnapshot } from '@/stores/diagnostics/types'

/**
 * Maximum observable channels: 1 norm + 2 * 11 dims + 1 potential = 24
 * Position layout: [norm, x0_mean, x0_sq, ..., xD_mean, xD_sq, potentialEnergy]
 * Momentum layout: [knorm, k0_mean, k0_sq, ..., kD_mean, kD_sq]
 */
export const MAX_OBS_CHANNELS = 24

/** GPU resources for observable reduction passes. */
export interface ObservablesResources {
  posUniformBuffer: GPUBuffer
  posPartialBuffer: GPUBuffer
  posResultBuffer: GPUBuffer
  posStagingBuffer: GPUBuffer
  momUniformBuffer: GPUBuffer
  momPartialBuffer: GPUBuffer
  momResultBuffer: GPUBuffer
  momStagingBuffer: GPUBuffer
  numWorkgroups: number
  /** Position channels: 2 + 2 * latticeDim (includes ⟨V⟩) */
  posNumChannels: number
  /** Momentum channels: 1 + 2 * latticeDim */
  momNumChannels: number
  /** Energy spectrum uniform buffer */
  esUniformBuffer: GPUBuffer
  /** Energy spectrum histogram bins (atomic<u32> × NUM_ENERGY_BINS) */
  esBinsBuffer: GPUBuffer
  /** Energy spectrum staging buffer for readback */
  esStagingBuffer: GPUBuffer
}

/**
 * Create GPU buffers for observable reduction.
 *
 * @param device - GPU device
 * @param totalSites - Total lattice sites
 * @param latticeDim - Number of active dimensions
 * @returns Allocated GPU resources
 */
export function createObservablesBuffers(
  device: GPUDevice,
  totalSites: number,
  latticeDim: number
): ObservablesResources {
  const posNumChannels = 2 + 2 * latticeDim
  const momNumChannels = 1 + 2 * latticeDim
  const wgCount = Math.max(1, Math.ceil(totalSites / 256))

  const uniformSize = 16 + 12 * 4 * 3 // ObsReduceUniforms: 4 scalars + 3 arrays of 12
  const posPartialSize = wgCount * posNumChannels * 4
  const momPartialSize = wgCount * momNumChannels * 4
  const resultSize = MAX_OBS_CHANNELS * 4

  const makeBuffer = (label: string, size: number, usage: number) =>
    device.createBuffer({ label, size: Math.max(size, 4), usage })

  return {
    // ObsReduceUniforms binds as STORAGE (not UNIFORM) because the struct embeds
    // scalar arrays that are spec-forbidden in uniform address space. See
    // observablesPositionReduce.wgsl.ts for the matching `var<storage, read>`.
    posUniformBuffer: makeBuffer(
      'obs-pos-uniform',
      uniformSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    ),
    posPartialBuffer: makeBuffer('obs-pos-partials', posPartialSize, GPUBufferUsage.STORAGE),
    posResultBuffer: makeBuffer(
      'obs-pos-result',
      resultSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    ),
    posStagingBuffer: makeBuffer(
      'obs-pos-staging',
      resultSize,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    ),
    // ObsMomReduceUniforms — see posUniformBuffer comment.
    momUniformBuffer: makeBuffer(
      'obs-mom-uniform',
      uniformSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    ),
    momPartialBuffer: makeBuffer('obs-mom-partials', momPartialSize, GPUBufferUsage.STORAGE),
    momResultBuffer: makeBuffer(
      'obs-mom-result',
      resultSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    ),
    momStagingBuffer: makeBuffer(
      'obs-mom-staging',
      resultSize,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    ),
    numWorkgroups: wgCount,
    posNumChannels,
    momNumChannels,
    // Energy spectrum buffers.
    // EnergySpectrumUniforms — see posUniformBuffer comment.
    esUniformBuffer: makeBuffer(
      'energy-spectrum-uniform',
      176, // EnergySpectrumUniforms: 8 scalars + 3 arrays of 12 = 44 u32s = 176 bytes
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    ),
    esBinsBuffer: makeBuffer(
      'energy-spectrum-bins',
      NUM_ENERGY_BINS * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    ),
    esStagingBuffer: makeBuffer(
      'energy-spectrum-staging',
      NUM_ENERGY_BINS * 4,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    ),
  }
}

/**
 * Destroy all observable GPU buffers.
 */
export function destroyObservablesBuffers(resources: ObservablesResources | null): void {
  if (!resources) return
  resources.posUniformBuffer.destroy()
  resources.posPartialBuffer.destroy()
  resources.posResultBuffer.destroy()
  resources.posStagingBuffer.destroy()
  resources.momUniformBuffer.destroy()
  resources.momPartialBuffer.destroy()
  resources.momResultBuffer.destroy()
  resources.momStagingBuffer.destroy()
  resources.esUniformBuffer.destroy()
  resources.esBinsBuffer.destroy()
  resources.esStagingBuffer.destroy()
}

/**
 * Process the GPU readback results and push to the observables store.
 *
 * Position data layout: [norm, x0_mean, x0_sq, ..., xD_mean, xD_sq, potentialEnergy]
 * Momentum data layout: [knorm, k0_mean, k0_sq, ..., kD_mean, kD_sq]
 *
 * @param posData - Position-space reduction result
 * @param momData - Momentum-space reduction result
 * @param latticeDim - Number of active dimensions
 * @param hbar - Reduced Planck constant
 * @returns Snapshot to push to store, or null if data is invalid
 */
export function processObservablesReadback(
  posData: Float32Array,
  momData: Float32Array,
  latticeDim: number,
  hbar: number,
  mass = 1
): ObservablesSnapshot | null {
  const posNorm = posData[0]!
  const momNorm = momData[0]!

  if (posNorm <= 0 || momNorm <= 0) return null

  const positionMean = new Float64Array(MAX_DIMENSION)
  const positionVariance = new Float64Array(MAX_DIMENSION)
  const momentumMean = new Float64Array(MAX_DIMENSION)
  const momentumVariance = new Float64Array(MAX_DIMENSION)
  const uncertaintyProduct = new Float64Array(MAX_DIMENSION)

  let kineticEnergy = 0

  for (let d = 0; d < latticeDim; d++) {
    const meanX = posData[1 + d * 2]! / posNorm
    const meanX2 = posData[2 + d * 2]! / posNorm
    const varX = Math.max(0, meanX2 - meanX * meanX)

    const meanK = momData[1 + d * 2]! / momNorm
    const meanK2 = momData[2 + d * 2]! / momNorm
    const varK = Math.max(0, meanK2 - meanK * meanK)
    const varP = varK * hbar * hbar

    positionMean[d] = meanX
    positionVariance[d] = varX
    momentumMean[d] = meanK * hbar
    momentumVariance[d] = varP
    uncertaintyProduct[d] = Math.sqrt(varX) * Math.sqrt(varP)

    kineticEnergy += (hbar * hbar * meanK2) / (2 * mass)
  }

  // Potential energy: last channel in position data = Σ V(x)|ψ|² dV
  const potentialEnergyRaw = posData[1 + 2 * latticeDim]
  const potentialEnergy = potentialEnergyRaw != null ? potentialEnergyRaw / posNorm : 0

  const minUncertainty = hbar / 2
  for (let d = 0; d < latticeDim; d++) {
    if (uncertaintyProduct[d]! < minUncertainty * 0.9) {
      logger.warn(
        `[Observables] ΔxΔp[${d}] = ${uncertaintyProduct[d]!.toFixed(4)} < ℏ/2 = ${minUncertainty.toFixed(4)} — numerical issue`
      )
    }
  }

  return {
    activeDims: latticeDim,
    positionMean,
    positionVariance,
    momentumMean,
    momentumVariance,
    uncertaintyProduct,
    totalEnergy: kineticEnergy + potentialEnergy,
    positionNorm: posNorm,
    momentumNorm: momNorm,
  }
}
