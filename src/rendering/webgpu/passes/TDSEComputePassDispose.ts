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

import type { TdseBindGroupResult } from './TDSEComputePassSetup'
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

  // Save/load staging buffers
  slState.saveStagingRe?.destroy()
  slState.saveStagingIm?.destroy()
  slState.saveStagingRe = slState.saveStagingIm = null
  slState.pendingInjection = null

  // Observables compute resources
  disposeObservables(obsState)
}

/** GPU buffer fields that must be destroyed and nulled on dispose. */
export interface TdseGpuFields {
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
 * Destroy all GPU buffers and textures, null all references.
 * @param fields - Mutable pass fields to destroy and null
 */
export function destroyPassBuffers(fields: TdseGpuFields): void {
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
  fields.psiReBuffer = fields.psiImBuffer = fields.potentialBuffer = null
  fields.fftScratchA = fields.fftScratchB = fields.omegaStagingBuffer = null
  fields.uniformBuffer = fields.fftUniformBuffer = fields.fftStagingBuffer = null
  fields.fftAxisUniformBuffer = fields.fftAxisStagingBuffer = null
  fields.packUniformBuffer = fields.diagUniformBuffer = null
  fields.diagPartialSumsBuffer = fields.diagPartialMaxBuffer = null
  fields.diagPartialLeftBuffer = fields.diagPartialRightBuffer = fields.diagPartialIprBuffer = null
  fields.densityTexture = fields.densityTextureView = null
  fields.pl = fields.bg = null
  fields.initialized = false
  fields.lastConfigHash = ''
}
