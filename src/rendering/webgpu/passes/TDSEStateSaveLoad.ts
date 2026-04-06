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
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import type { WebGPURenderContext } from '../core/types'
import { requestStateSave as genericStateSave } from './stateSave'

/** Mutable state shared between the save function and the TDSE pass. */
export interface SaveLoadState {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  totalSites: number
  saveMappingInFlight: boolean
  pendingInjection: { re: Float32Array; im: Float32Array; isMeasurementCollapse?: boolean } | null
}

/**
 * Initiate async save of the current wavefunction state.
 * Copies psi buffers to staging within the current command encoder,
 * then maps async after GPU submit.
 */
export function requestStateSave(ctx: WebGPURenderContext, state: SaveLoadState): void {
  if (!state.psiReBuffer || !state.psiImBuffer || state.saveMappingInFlight) return
  const byteSize = state.totalSites * 4

  state.saveMappingInFlight = true
  genericStateSave(ctx, {
    source: {
      layout: 'separate',
      reBuffer: state.psiReBuffer,
      imBuffer: state.psiImBuffer,
      byteSize,
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
 */
export function requestSliceCapture(
  ctx: WebGPURenderContext,
  state: SaveLoadState,
  axis: 'x' | 'y' | 'z',
  gridSize: number[],
  worldBound: number
): void {
  if (!state.psiReBuffer || !state.psiImBuffer || state.saveMappingInFlight) return
  const { device, encoder } = ctx
  const byteSize = state.totalSites * 4

  // Create temporary staging buffers for the readback
  const stagingRe = device.createBuffer({
    label: 'slice-staging-re',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const stagingIm = device.createBuffer({
    label: 'slice-staging-im',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiReBuffer, 0, stagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, stagingIm, 0, byteSize)
  state.saveMappingInFlight = true

  const totalSites = state.totalSites

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        stagingRe.destroy()
        stagingIm.destroy()
        state.saveMappingInFlight = false
        return
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])

      const re = new Float32Array(stagingRe.getMappedRange())
      const im = new Float32Array(stagingIm.getMappedRange())

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

        const flatIdx = ix + iy * nx + iz * nx * ny
        if (flatIdx < totalSites) {
          const r = re[flatIdx]!
          const j = im[flatIdx]!
          sliceData[i] = r * r + j * j
        }
      }

      stagingRe.unmap()
      stagingIm.unmap()
      stagingRe.destroy()
      stagingIm.destroy()

      const { useWavefunctionSliceStore } = await import('@/stores/wavefunctionSliceStore')
      useWavefunctionSliceStore.getState().fulfillCapture({
        sliceData,
        axis,
        gridSize: sliceSize,
        worldBound,
      })

      state.saveMappingInFlight = false
    })
    .catch(() => {
      stagingRe.destroy()
      stagingIm.destroy()
      state.saveMappingInFlight = false
    })
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
  if (!state.pendingInjection || !state.psiReBuffer || !state.psiImBuffer) return false

  const { re, im } = state.pendingInjection
  const elementCount = Math.min(re.length, totalSites)
  const reData = new Float32Array(
    re.buffer instanceof ArrayBuffer ? re.buffer : new ArrayBuffer(0),
    re.byteOffset,
    elementCount
  )
  const imData = new Float32Array(
    im.buffer instanceof ArrayBuffer ? im.buffer : new ArrayBuffer(0),
    im.byteOffset,
    elementCount
  )
  device.queue.writeBuffer(state.psiReBuffer, 0, reData)
  device.queue.writeBuffer(state.psiImBuffer, 0, imData)
  state.pendingInjection = null
  logger.log(`[TDSE] Injected loaded wavefunction (${elementCount} sites)`)
  return true
}
