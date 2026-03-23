/**
 * Quantum Walk — State Save
 *
 * Async GPU readback of coin state data for serialization and download.
 *
 * @module rendering/webgpu/passes/QuantumWalkStateSave
 */

import type { WebGPURenderContext } from '../core/types'

/** Mutable state needed by the save operation. */
export interface QwSaveState {
  coinStateA: GPUBuffer | null
  saveMappingInFlight: boolean
  totalSites: number
  latticeDim: number
}

/**
 * Initiate async save of the current coin state.
 * Copies coinStateA to staging, de-interleaves re/im, serializes and downloads.
 *
 * @param ctx - Render context with device and command encoder
 * @param state - Mutable state from the compute pass (mutations propagate back)
 */
export function requestQwStateSave(ctx: WebGPURenderContext, state: QwSaveState): void {
  if (!state.coinStateA || state.saveMappingInFlight || state.totalSites === 0) return
  const { device, encoder } = ctx
  const coinStates = 2 * state.latticeDim
  const totalElements = state.totalSites * coinStates
  const byteSize = totalElements * 2 * 4

  const staging = device.createBuffer({
    label: 'qw-save-staging',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  encoder.copyBufferToBuffer(state.coinStateA, 0, staging, 0, byteSize)
  state.saveMappingInFlight = true

  const totalSites = state.totalSites
  const latDim = state.latticeDim

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (staging.mapState !== 'unmapped') {
        state.saveMappingInFlight = false
        return
      }
      await staging.mapAsync(GPUMapMode.READ)
      const interleaved = new Float32Array(staging.getMappedRange())

      const re = new Float32Array(totalElements)
      const im = new Float32Array(totalElements)
      for (let i = 0; i < totalElements; i++) {
        re[i] = interleaved[i * 2]!
        im[i] = interleaved[i * 2 + 1]!
      }
      staging.unmap()
      staging.destroy()

      const { serializeSimulationState } = await import('@/lib/export/simulationState')
      const { downloadFile, exportFilename } = await import('@/lib/export/dataExport')
      const { useExtendedObjectStore } = await import('@/stores/extendedObjectStore')
      const { useSimulationStateStore } = await import('@/stores/simulationStateStore')

      const qwConfig = useExtendedObjectStore.getState().schroedinger.quantumWalk
      const gridSize = qwConfig.gridSize.slice(0, qwConfig.latticeDim)
      const componentCount = 2 * latDim

      const blob = await serializeSimulationState(
        { quantumMode: 'quantumWalk', quantumWalk: qwConfig } as Record<string, unknown>,
        { re, im, totalSites, componentCount },
        'quantumWalk',
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
