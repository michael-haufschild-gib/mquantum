/**
 * TDSE Compute Pass — Extracted-module disposal
 *
 * Handles cleanup of state objects shared with extracted modules
 * (diagnostics readback, Gram-Schmidt, save/load, observables).
 * Extracted from TDSEComputePass to keep the main file under
 * the project's 600-line limit.
 *
 * @module rendering/webgpu/passes/TDSEComputePassDispose
 */

import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { destroyGSBuffers, type GramSchmidtState } from './TDSEGramSchmidt'
import { disposeObservables, type ObservablesState } from './TDSEObservablesDispatch'
import type { SaveLoadState } from './TDSEStateSaveLoad'

/**
 * Dispose all extracted-module state: diagnostics readback, Gram-Schmidt
 * eigenstates, save/load staging buffers, and observables resources.
 *
 * @param diagState - Diagnostics readback state
 * @param gsState - Gram-Schmidt state
 * @param slState - Save/load state
 * @param obsState - Observables state
 */
export function disposeTdseResources(
  diagState: DiagReadbackState,
  gsState: GramSchmidtState,
  slState: SaveLoadState,
  obsState: ObservablesState
): void {
  // Diagnostics readback buffers
  diagState.diagResultBuffer?.destroy()
  diagState.diagStagingBuffer?.destroy()
  diagState.diagResultBuffer = diagState.diagStagingBuffer = null
  diagState.diagHistory.clear()
  useTdseDiagnosticsStore.getState().reset()

  // Gram-Schmidt eigenstates and infrastructure
  destroyGSBuffers(gsState)

  // Save/load staging buffers
  slState.saveStagingRe?.destroy()
  slState.saveStagingIm?.destroy()
  slState.saveStagingRe = slState.saveStagingIm = null
  slState.pendingInjection = null

  // Observables compute resources
  disposeObservables(obsState)
}
