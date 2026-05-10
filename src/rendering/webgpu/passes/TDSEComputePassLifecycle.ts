/**
 * TDSE Compute Pass — lifecycle helpers.
 *
 * Extracted from `TDSEComputePass.dispose` to keep the class file under
 * the 600-line cap. `runTdseDispose` snapshots the GPU fields held by the
 * pass, delegates destruction to `disposeFullPass` + `disposeHawkingInject`,
 * then re-assigns the nulled snapshot back onto the instance. Behavior is
 * unchanged vs. the inline version.
 *
 * The caller is responsible for invoking `super.dispose()` after this helper
 * returns.
 *
 * @module rendering/webgpu/passes/TDSEComputePassLifecycle
 */

import type { DisorderState } from './TDSEComputePassDisorder'
import type { HawkingInjectState } from './TDSEComputePassHawking'
import { disposeHawkingInject } from './TDSEComputePassHawking'
import type { TdsePassGpuSnapshot } from './TDSEComputePassResources'
import { disposeFullPass } from './TDSEComputePassResources'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import type { WormholePipelineResources } from './TDSEComputePassWormhole'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import type { GramSchmidtState } from './TDSEGramSchmidt'
import type { HellerReadbackState } from './TDSEHellerReadback'
import type { ObservablesState } from './TDSEObservablesDispatch'
import type { SaveLoadState } from './TDSEStateSaveLoad'
import type { StochasticLocState } from './TDSEStochasticLocalization'
import type { VortexDetectState } from './TDSEVortexDetect'
import { resetWormholeReadback, type WormholeReadbackState } from './TDSEWormholeReadback'

/** Narrow view of `TDSEComputePass` used by `runTdseDispose`. */
export interface TdseDisposeFields {
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffers: GPUBuffer[] | null
  fftTwiddleBuffer: GPUBuffer | null
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
  pl: TdsePipelineResult | null
  bg: TdseBindGroupResult | null
  initialized: boolean
  lastConfigHash: string
  _vdState: VortexDetectState
  _disorderState: DisorderState
  _stochasticState: StochasticLocState
  _hellerState: HellerReadbackState
  _diagState: DiagReadbackState
  _gsState: GramSchmidtState
  _slState: SaveLoadState
  _obsState: ObservablesState
  _hawkingState: HawkingInjectState
  wormholePipeline: WormholePipelineResources | null
  wormholeBG: GPUBindGroup | null
  _wormholeReadback: WormholeReadbackState
}

/**
 * Release every GPU resource owned by the pass and reset lifecycle flags.
 *
 * Equivalent to the pre-extraction body of `TDSEComputePass.dispose`
 * minus the `super.dispose()` call, which the caller must still invoke.
 *
 * @param pass - The TDSE compute pass instance to dispose.
 */
export function runTdseDispose(pass: TdseDisposeFields): void {
  const gpu: TdsePassGpuSnapshot = {
    psiBuffer: pass.psiBuffer,
    potentialBuffer: pass.potentialBuffer,
    fftScratchA: pass.fftScratchA,
    fftScratchB: pass.fftScratchB,
    uniformBuffer: pass.uniformBuffer,
    fftUniformBuffer: pass.fftUniformBuffer,
    fftStagingBuffer: pass.fftStagingBuffer,
    fftAxisUniformBuffer: pass.fftAxisUniformBuffer,
    fftAxisStagingBuffer: pass.fftAxisStagingBuffer,
    fftAxisUniformBuffers: pass.fftAxisUniformBuffers,
    fftTwiddleBuffer: pass.fftTwiddleBuffer,
    packUniformBuffer: pass.packUniformBuffer,
    omegaStagingBuffer: pass.omegaStagingBuffer,
    densityTexture: pass.densityTexture,
    densityTextureView: pass.densityTextureView,
    diagUniformBuffer: pass.diagUniformBuffer,
    diagPartialSumsBuffer: pass.diagPartialSumsBuffer,
    diagPartialMaxBuffer: pass.diagPartialMaxBuffer,
    diagPartialLeftBuffer: pass.diagPartialLeftBuffer,
    diagPartialRightBuffer: pass.diagPartialRightBuffer,
    diagPartialIprBuffer: pass.diagPartialIprBuffer,
    pl: pass.pl,
    bg: pass.bg,
    initialized: pass.initialized,
    lastConfigHash: pass.lastConfigHash,
  }
  disposeFullPass(
    gpu,
    pass._vdState,
    pass._disorderState,
    pass._stochasticState,
    pass._hellerState,
    pass._diagState,
    pass._gsState,
    pass._slState,
    pass._obsState
  )
  disposeHawkingInject(pass._hawkingState)
  // ER=EPR wormhole — pipeline + bind group are GC'd via field nulling;
  // readback staging has its own destroy path.
  pass.wormholePipeline = null
  pass.wormholeBG = null
  resetWormholeReadback(pass._wormholeReadback)
  Object.assign(pass, gpu)
}
