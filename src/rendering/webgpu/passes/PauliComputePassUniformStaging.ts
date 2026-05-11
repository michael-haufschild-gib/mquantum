/**
 * Pauli Compute Pass — Per-Step Uniform Staging
 *
 * Owns the staging buffer used to upload one PauliUniforms struct per
 * Strang substep within a frame and pre-packs snapshots into it before the
 * Strang loop runs. Extracted from PauliComputePass to keep that file
 * under the 600-line cap.
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'

import { computeStridesPadded, MAX_DIM } from './computePassUtils'
import { packPauliUniforms, PAULI_UNIFORM_SIZE } from './PauliComputePassBuffers'

/**
 * Mutable holder for the GPU staging buffer that backs per-substep
 * uniform copies. Caller is responsible for calling {@link disposePauliUniformStepStaging}
 * when the owning pass is disposed.
 */
export interface PauliUniformStepStagingState {
  buffer: GPUBuffer | null
  size: number
  strides: number[]
}

/** Create a fresh, empty staging-state record. */
export function createPauliUniformStepStagingState(): PauliUniformStepStagingState {
  return { buffer: null, size: 0, strides: new Array<number>(MAX_DIM).fill(0) }
}

/**
 * Ensure the staging buffer is at least `byteSize` bytes long. Recreates it
 * (destroying the previous one) when the requested size grows.
 */
export function ensurePauliUniformStepStaging(
  state: PauliUniformStepStagingState,
  device: GPUDevice,
  byteSize: number
): GPUBuffer {
  if (state.buffer && state.size >= byteSize) {
    return state.buffer
  }
  state.buffer?.destroy()
  state.buffer = device.createBuffer({
    label: 'pauli-step-uniform-staging',
    size: byteSize,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  state.size = byteSize
  return state.buffer
}

/** Destroy the underlying GPU buffer and reset the state. Idempotent. */
export function disposePauliUniformStepStaging(state: PauliUniformStepStagingState): void {
  state.buffer?.destroy()
  state.buffer = null
  state.size = 0
}

/** Inputs for pre-packing a Strang frame's worth of uniform snapshots. */
export interface PrePackPauliSnapshotsParams {
  state: PauliUniformStepStagingState
  device: GPUDevice
  config: PauliConfig
  totalSites: number
  simTime: number
  stepsThisFrame: number
  maxDensity: number
  uniformU32: Uint32Array
  uniformF32: Float32Array
  uniformData: ArrayBuffer
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  boundingRadius?: number
}

/**
 * Pre-pack `stepsThisFrame + 1` PauliUniforms snapshots into the staging
 * buffer (resizing it as needed) and queue per-snapshot writeBuffer calls.
 * Returns the staging buffer, or `null` when `stepsThisFrame === 0`.
 */
export function prePackPauliFrameSnapshots(params: PrePackPauliSnapshotsParams): GPUBuffer | null {
  if (params.stepsThisFrame <= 0) return null
  const staging = ensurePauliUniformStepStaging(
    params.state,
    params.device,
    (params.stepsThisFrame + 1) * PAULI_UNIFORM_SIZE
  )
  const strides = computeStridesPadded(
    params.config.gridSize,
    params.config.latticeDim,
    params.state.strides
  )
  for (let step = 0; step <= params.stepsThisFrame; step++) {
    packPauliUniforms(params.uniformU32, params.uniformF32, {
      config: params.config,
      totalSites: params.totalSites,
      simTime: params.simTime + step * params.config.dt,
      maxDensity: params.maxDensity,
      strides,
      basisX: params.basisX,
      basisY: params.basisY,
      basisZ: params.basisZ,
      boundingRadius: params.boundingRadius,
    })
    params.device.queue.writeBuffer(staging, step * PAULI_UNIFORM_SIZE, params.uniformData)
  }
  return staging
}
