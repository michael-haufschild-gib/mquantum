/**
 * TDSE State Save/Load — GPU Readback & Injection
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 * Contains the async save readback and the loaded-state injection logic.
 *
 * @module rendering/webgpu/passes/TDSEStateSaveLoad
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderContext } from '../core/types'

/** Mutable state shared between the save function and the TDSE pass. */
export interface SaveLoadState {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  totalSites: number
  saveStagingRe: GPUBuffer | null
  saveStagingIm: GPUBuffer | null
  saveMappingInFlight: boolean
  pendingInjection: { re: Float32Array; im: Float32Array } | null
}

/**
 * Initiate async save of the current wavefunction state.
 * Copies psi buffers to staging within the current command encoder,
 * then maps async after GPU submit.
 */
export function requestStateSave(ctx: WebGPURenderContext, state: SaveLoadState): void {
  if (!state.psiReBuffer || !state.psiImBuffer || state.saveMappingInFlight) return
  const { device, encoder } = ctx
  const byteSize = state.totalSites * 4

  state.saveStagingRe?.destroy()
  state.saveStagingIm?.destroy()
  state.saveStagingRe = device.createBuffer({
    label: 'save-staging-re',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  state.saveStagingIm = device.createBuffer({
    label: 'save-staging-im',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiReBuffer, 0, state.saveStagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, state.saveStagingIm, 0, byteSize)
  state.saveMappingInFlight = true

  const stagingRe = state.saveStagingRe
  const stagingIm = state.saveStagingIm
  const totalSites = state.totalSites

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        state.saveMappingInFlight = false
        return
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])

      const re = new Float32Array(new Float32Array(stagingRe.getMappedRange()).slice(0))
      const im = new Float32Array(new Float32Array(stagingIm.getMappedRange()).slice(0))
      stagingRe.unmap()
      stagingIm.unmap()

      const { serializeSimulationState } = await import('@/lib/export/simulationState')
      const { downloadFile, exportFilename } = await import('@/lib/export/dataExport')
      const { useExtendedObjectStore } = await import('@/stores/extendedObjectStore')
      const { useSimulationStateStore } = await import('@/stores/simulationStateStore')

      const extState = useExtendedObjectStore.getState()
      const schroedinger = extState.schroedinger
      const quantumMode = schroedinger.quantumMode
      const tdseConfig = quantumMode === 'becDynamics' ? schroedinger.bec : schroedinger.tdse
      const gridSize = tdseConfig.gridSize?.slice(0, tdseConfig.latticeDim ?? 3) ?? [64]

      const blob = await serializeSimulationState(
        {
          quantumMode,
          tdse: schroedinger.tdse,
          bec: schroedinger.bec,
          dirac: schroedinger.dirac,
          freeScalar: schroedinger.freeScalar,
        } as Record<string, unknown>,
        { re, im, totalSites, componentCount: 1 },
        quantumMode,
        gridSize
      )
      downloadFile(blob, exportFilename('mdim-state', 'mqstate'), 'application/octet-stream')
      useSimulationStateStore.getState().setSaveComplete()
      state.saveMappingInFlight = false
    })
    .catch((err) => {
      import('@/stores/simulationStateStore').then(({ useSimulationStateStore }) => {
        useSimulationStateStore.getState().setSaveError(String(err))
      })
      state.saveMappingInFlight = false
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
        state.saveMappingInFlight = false
        stagingRe.destroy()
        stagingIm.destroy()
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
      state.saveMappingInFlight = false
      stagingRe.destroy()
      stagingIm.destroy()
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
