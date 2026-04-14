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

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'

import type { DisorderState } from './TDSEComputePassDisorder'
import { disposeDisorder } from './TDSEComputePassDisorder'
import type { TdseBindGroupResult } from './TDSEComputePassSetup'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { destroyGSBuffers, type GramSchmidtState } from './TDSEGramSchmidt'
import {
  disposeHellerStagingBuffers,
  type HellerReadbackState,
  resetHellerCapture,
} from './TDSEHellerReadback'
import { disposeObservables, type ObservablesState } from './TDSEObservablesDispatch'
import type { SaveLoadState } from './TDSEStateSaveLoad'
import { disposeStochasticLoc, type StochasticLocState } from './TDSEStochasticLocalization'
import { disposeVortexDetect, type VortexDetectState } from './TDSEVortexDetect'

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
  // Cancel any pending mapAsync before destroying staging buffers
  if (diagState.diagMappingInFlight && diagState.diagStagingBuffer) {
    diagState.diagStagingBuffer.unmap()
    diagState.diagMappingInFlight = false
  }
  // Diagnostics readback buffers
  diagState.diagResultBuffer?.destroy()
  diagState.diagStagingBuffer?.destroy()
  diagState.diagResultBuffer = diagState.diagStagingBuffer = null
  diagState.diagHistory.clear()
  useDiagnosticsStore.getState().resetTdse()

  // Gram-Schmidt eigenstates and infrastructure
  destroyGSBuffers(gsState)

  // Save/load state
  slState.pendingInjection = null

  // Observables compute resources
  disposeObservables(obsState)
}

/**
 * Snapshot of the TDSE pass's GPU buffer/texture fields for disposal.
 * All handles are nulled and the `initialized`/`lastConfigHash` reset flags
 * are cleared in place by {@link destroyTdsePassGpu}.
 */
export interface TdsePassGpuSnapshot {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  /** PERF: per-slot axis uniform buffers for batched Strang FFT (length = 2 × latticeDim). */
  fftAxisUniformBuffers: GPUBuffer[] | null
  packUniformBuffer: GPUBuffer | null
  omegaStagingBuffer: GPUBuffer | null
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialSumsBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialLeftBuffer: GPUBuffer | null
  diagPartialRightBuffer: GPUBuffer | null
  diagPartialIprBuffer: GPUBuffer | null
  pl: { renormalizePipeline?: unknown } | null
  bg: TdseBindGroupResult | null
  initialized: boolean
  lastConfigHash: string
}

/**
 * Destroy all GPU buffers/textures owned by the pass and null their handles.
 * Mutates `fields` in place — the caller writes the cleared snapshot back.
 */
export function destroyTdsePassGpu(fields: TdsePassGpuSnapshot): void {
  const bufs: (GPUBuffer | GPUTexture | null | undefined)[] = [
    fields.psiReBuffer,
    fields.psiImBuffer,
    fields.potentialBuffer,
    fields.fftScratchA,
    fields.fftScratchB,
    fields.uniformBuffer,
    fields.fftUniformBuffer,
    fields.fftStagingBuffer,
    fields.fftAxisUniformBuffer,
    fields.fftAxisStagingBuffer,
    fields.packUniformBuffer,
    fields.omegaStagingBuffer,
    fields.densityTexture,
    fields.diagUniformBuffer,
    fields.diagPartialSumsBuffer,
    fields.diagPartialMaxBuffer,
    fields.diagPartialLeftBuffer,
    fields.diagPartialRightBuffer,
    fields.diagPartialIprBuffer,
    fields.bg?.renormalizeUniformBuffer,
  ]
  for (const b of bufs) b?.destroy()
  if (fields.fftAxisUniformBuffers) {
    for (const b of fields.fftAxisUniformBuffers) b.destroy()
  }
  fields.psiReBuffer = fields.psiImBuffer = fields.potentialBuffer = null
  fields.fftScratchA = fields.fftScratchB = fields.omegaStagingBuffer = null
  fields.uniformBuffer = fields.fftUniformBuffer = fields.fftStagingBuffer = null
  fields.fftAxisUniformBuffer = fields.fftAxisStagingBuffer = null
  fields.fftAxisUniformBuffers = null
  fields.packUniformBuffer = fields.diagUniformBuffer = null
  fields.diagPartialSumsBuffer = fields.diagPartialMaxBuffer = null
  fields.diagPartialLeftBuffer = fields.diagPartialRightBuffer = fields.diagPartialIprBuffer = null
  fields.densityTexture = fields.densityTextureView = null
  fields.pl = fields.bg = null
  fields.initialized = false
  fields.lastConfigHash = ''
}

/**
 * Full pass disposal: cleans up vortex, disorder, stochastic, Heller state,
 * GPU buffers, and extracted-module resources, then writes nulled fields back.
 *
 * Extracted from TDSEComputePass.dispose() to keep the orchestrator under
 * the 600-line limit.
 *
 * @param pass - Mutable pass fields (written back via Object.assign)
 * @param vdState - Vortex detection state
 * @param disorderState - Anderson disorder state
 * @param stochasticState - Stochastic localization state
 * @param hellerState - Heller spectrometer readback state
 * @param diagState - Diagnostics readback state
 * @param gsState - Gram-Schmidt state
 * @param slState - Save/load state
 * @param obsState - Observables state
 */
export function disposeFullPass(
  pass: TdsePassGpuSnapshot,
  vdState: VortexDetectState,
  disorderState: DisorderState,
  stochasticState: StochasticLocState,
  hellerState: HellerReadbackState,
  diagState: DiagReadbackState,
  gsState: GramSchmidtState,
  slState: SaveLoadState,
  obsState: ObservablesState
): void {
  disposeVortexDetect(vdState)
  disposeDisorder(disorderState)
  disposeStochasticLoc(stochasticState)

  // Invalidate any in-flight Heller readback and drop psi0 snapshot.
  // `resetHellerCapture` bumps the generation counter, which causes the
  // async mapAsync handler to bail out before touching the staging
  // buffers we are about to destroy. Order matters: bump first, then
  // release the pool.
  resetHellerCapture(hellerState)
  disposeHellerStagingBuffers(hellerState)
  hellerState.psiReBuffer = null
  hellerState.psiImBuffer = null
  hellerState.totalSites = 0
  useHellerSpectrometerStore.getState().setBufferRef(null)

  destroyTdsePassGpu(pass)
  disposeTdseResources(diagState, gsState, slState, obsState)
}
