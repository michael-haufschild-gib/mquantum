/**
 * TDSE State Save/Load — GPU Readback & Injection
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 * Contains the save readback (via generic stateSave), slice capture, and
 * loaded-state injection logic.
 *
 * @module rendering/webgpu/passes/TDSEStateSaveLoad
 */

import { logger } from '@/lib/logger'
import {
  useWavefunctionSliceStore,
  type WavefunctionSliceSourceMode,
} from '@/stores/diagnostics/wavefunctionSliceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import type { WebGPURenderContext } from '../core/types'
import { interleaveStateInjection, requestStateSave as genericStateSave } from './stateSave'

/** Mutable state shared between the save function and the TDSE pass. */
export interface SaveLoadState {
  /** Merged ψ buffer (array<vec2f>, totalSites * 8 bytes). */
  psiBuffer: GPUBuffer | null
  totalSites: number
  saveMappingInFlight: boolean
  pendingInjection: {
    re: Float32Array
    im: Float32Array
    isMeasurementCollapse?: boolean
    targetNorm?: number
  } | null
}

/**
 * Initiate async save of the current wavefunction state.
 * Copies the merged ψ buffer to staging within the current command encoder
 * via the generic stateSave 'interleaved' layout (the merged ψ memory
 * layout is exactly [Re,Im,Re,Im,...] f32, matching the existing
 * interleaved consumer used by quantum walk), then maps async after GPU
 * submit.
 */
export function requestStateSave(ctx: WebGPURenderContext, state: SaveLoadState): boolean {
  if (!state.psiBuffer || state.saveMappingInFlight) return false
  // Merged ψ stride: 8 bytes/site (vec2f = 2 × f32 interleaved).
  const byteSize = state.totalSites * 8

  state.saveMappingInFlight = true
  genericStateSave(ctx, {
    source: {
      layout: 'interleaved',
      buffer: state.psiBuffer,
      byteSize,
      elementCount: state.totalSites,
    },
    totalSites: state.totalSites,
    label: 'tdse',
    getMetadata: async () => {
      const schroedinger = useExtendedObjectStore.getState().schroedinger
      const quantumMode = schroedinger.quantumMode
      const tdseConfig = quantumMode === 'becDynamics' ? schroedinger.bec : schroedinger.tdse
      return {
        quantumMode,
        config: {
          quantumMode,
          tdse: schroedinger.tdse,
          bec: schroedinger.bec,
          dirac: schroedinger.dirac,
          freeScalar: schroedinger.freeScalar,
        } as Record<string, unknown>,
        gridSize: tdseConfig.gridSize?.slice(0, tdseConfig.latticeDim ?? 3) ?? [64],
        componentCount: 1,
      }
    },
    onFinished: () => {
      state.saveMappingInFlight = false
    },
  })
  return true
}

/**
 * Initiate async capture of a 1D wavefunction slice |ψ(x)|².
 * Copies psi buffers to staging, maps, extracts a center-plane 1D cross-section,
 * and delivers the result to the wavefunctionSliceStore.
 *
 * @param ctx - Render context (device + encoder)
 * @param state - Shared save/load state with buffer references
 * @param axis - Axis to slice along ('x', 'y', or 'z')
 * @param gridSize - Per-dimension grid sizes
 * @param worldBound - World-space half-extent
 * @param sourceMode - Quantum mode that scheduled this capture
 */
export function requestSliceCapture(
  ctx: WebGPURenderContext,
  state: SaveLoadState,
  axis: 'x' | 'y' | 'z',
  gridSize: number[],
  worldBound: number,
  sourceMode: WavefunctionSliceSourceMode = null
): boolean {
  // Returns false when a previous save/slice readback is still in flight
  // (sharing `saveMappingInFlight`) so the caller can leave the request
  // flag set and retry next frame instead of silently dropping the user's
  // capture request.
  if (!state.psiBuffer || state.saveMappingInFlight) return false
  const { device, encoder } = ctx
  // Merged ψ stride: 8 bytes/site (vec2f, interleaved [Re,Im,...]).
  const byteSize = state.totalSites * 8

  const staging = device.createBuffer({
    label: 'slice-staging',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiBuffer, 0, staging, 0, byteSize)
  state.saveMappingInFlight = true

  const totalSites = state.totalSites

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (staging.mapState !== 'unmapped') {
        staging.destroy()
        state.saveMappingInFlight = false
        return
      }
      await staging.mapAsync(GPUMapMode.READ)

      const interleaved = new Float32Array(staging.getMappedRange())

      // Extract a 1D slice through the center of the grid
      const dims = gridSize.length
      const nx = gridSize[0] ?? 1
      const ny = dims > 1 ? (gridSize[1] ?? 1) : 1
      const nz = dims > 2 ? (gridSize[2] ?? 1) : 1
      const cx = Math.floor(nx / 2)
      const cy = Math.floor(ny / 2)
      const cz = Math.floor(nz / 2)

      const axisMap = { x: 0, y: 1, z: 2 }
      const axisIdx = axisMap[axis]
      const sliceSize = gridSize[axisIdx] ?? 1
      const sliceData = new Float32Array(sliceSize)

      for (let i = 0; i < sliceSize; i++) {
        let ix = cx,
          iy = cy,
          iz = cz
        if (axisIdx === 0) ix = i
        else if (axisIdx === 1) iy = i
        else iz = i

        const flatIdx = ix * ny * nz + iy * nz + iz
        if (flatIdx < totalSites) {
          // Interleaved layout: [re0, im0, re1, im1, ...].
          const r = interleaved[2 * flatIdx]!
          const j = interleaved[2 * flatIdx + 1]!
          sliceData[i] = r * r + j * j
        }
      }

      staging.unmap()
      staging.destroy()

      useWavefunctionSliceStore.getState().fulfillCapture({
        sliceData,
        axis,
        sourceMode,
        gridSize: sliceSize,
        worldBound,
      })

      state.saveMappingInFlight = false
    })
    .catch(() => {
      staging.destroy()
      state.saveMappingInFlight = false
    })
  return true
}

/**
 * Inject loaded wavefunction data into GPU psi buffers.
 * Skips the normal init shader dispatch.
 *
 * @returns true if injection was performed
 */
export function injectLoadedWavefunction(
  device: GPUDevice,
  state: SaveLoadState,
  totalSites: number
): boolean {
  if (!state.pendingInjection || !state.psiBuffer) return false

  let interleaved: Float32Array<ArrayBuffer>
  try {
    interleaved = interleaveStateInjection('TDSE', state.pendingInjection, totalSites)
  } catch (err) {
    state.pendingInjection = null
    throw err
  }
  const elementCount = totalSites
  device.queue.writeBuffer(state.psiBuffer, 0, interleaved)
  state.pendingInjection = null
  logger.log(`[TDSE] Injected loaded wavefunction (${elementCount} sites)`)
  return true
}
