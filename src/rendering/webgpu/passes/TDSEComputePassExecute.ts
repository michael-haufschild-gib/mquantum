/**
 * TDSE Compute Pass — per-frame execute orchestration.
 *
 * Extracted from `TDSEComputePass.executeTDSE` to keep the class file under
 * the 600-line cap. Behavior is unchanged: this is the same body with the
 * `this` receiver replaced by a typed `pass` parameter. The field interface
 * below enumerates every member touched by the frame loop (including
 * private helper methods and state objects) so the cast in
 * `TDSEComputePass.executeTDSE` stays narrow.
 *
 * @module rendering/webgpu/passes/TDSEComputePassExecute
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

import type { WebGPURenderContext } from '../core/types'
import {
  computeConfigHash,
  computeStridesPadded,
  LINEAR_WG,
  pickSiteDispatch,
  sanitizeGridSizes,
  type SiteDispatch,
} from './computePassUtils'
import {
  computePotentialHash,
  uploadAndersonDisorderBuffer,
  uploadCustomPotentialBuffer,
} from './TDSEComputePassCustomPotential'
import type { DisorderState } from './TDSEComputePassDisorder'
import { maybeDispatchDisorder } from './TDSEComputePassDisorder'
import type { DiagFrameState, EvolutionFrameState } from './TDSEComputePassEvolution'
import { runPostStepDispatches, runStrangEvolution } from './TDSEComputePassEvolution'
import type { HawkingInjectState } from './TDSEComputePassHawking'
import { runHawkingFrame } from './TDSEComputePassHawking'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import { writeTdseUniforms } from './TDSEComputePassUniforms'
import type { WormholePipelineResources } from './TDSEComputePassWormhole'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import type { GramSchmidtState } from './TDSEGramSchmidt'
import {
  clearEigenstates as gsClearEigenstates,
  ensureGSBuffers as gsEnsureBuffers,
} from './TDSEGramSchmidt'
import type { HellerReadbackState } from './TDSEHellerReadback'
import { prepareHellerFrame } from './TDSEHellerReadback'
import type { ObservablesState } from './TDSEObservablesDispatch'
import { updateObservablesResources as obsUpdate } from './TDSEObservablesDispatch'
import type { StochasticLocState } from './TDSEStochasticLocalization'
import type { VortexDetectState } from './TDSEVortexDetect'
import { requestWormholeReadback, type WormholeReadbackState } from './TDSEWormholeReadback'

/** Narrow view of `TDSEComputePass` used by `runTdseExecute`. */
export interface TdseExecuteFields {
  // GPU buffers
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null

  // Scalar state
  lastConfigHash: string
  lastPotentialHash: string
  initialized: boolean
  simTime: number
  stepAccumulator: number
  totalSites: number
  fwdAxisCount: number
  diagNumWorkgroups: number
  customPotentialScale: number

  // Uniform scratch
  readonly uniformData: ArrayBuffer
  readonly uniformU32: Uint32Array
  readonly uniformF32: Float32Array

  // Pipelines + bind groups
  pl: TdsePipelineResult | null
  bg: TdseBindGroupResult | null

  // State objects shared with helper modules
  _diagFrameState: DiagFrameState
  _diagState: DiagReadbackState
  _obsState: ObservablesState
  _gsState: GramSchmidtState
  _hellerState: HellerReadbackState
  _vdState: VortexDetectState
  _disorderState: DisorderState
  _stochasticState: StochasticLocState
  _hawkingState: HawkingInjectState
  _wormholeReadback: WormholeReadbackState
  wormholePipeline: WormholePipelineResources | null
  wormholeBG: GPUBindGroup | null
  _hellerLastResetToken: number
  readonly densityGridSize: number

  // Methods
  syncSharedState(): void
  rebuildBuffers(device: GPUDevice, config: TdseConfig): void
  buildPipelines(device: GPUDevice): void
  rebuildBindGroups(device: GPUDevice): void
  maybeInitialize(ctx: WebGPURenderContext, config: TdseConfig): void
  dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number
  dispatchFFTAxisInPass(passEncoder: GPUComputePassEncoder, axisDim: number, slot: number): void
  /** Curved-space RK4 dispatcher — only invoked when the TDSE metric is non-flat. */
  runCurvedFrame(device: GPUDevice, encoder: GPUCommandEncoder, siteDispatch: SiteDispatch): void
  /**
   * Populate the curved integrator's per-step RK4 stage-time staging buffer
   * for the upcoming frame. Called once per frame before any encoder work
   * when the metric is time-dependent (deSitter).
   */
  prepareCurvedStageTimes(device: GPUDevice, simTimeStart: number, dt: number, steps: number): void
  /**
   * Emit a `copyBufferToBuffer` on the active encoder that patches
   * `TDSEUniforms.stageTimeK{1..4}` with the pre-computed stage times for
   * step `stepIdx`. Called before each RK4 step's kinetic dispatches when
   * the metric is time-dependent.
   */
  applyCurvedStageTimesForStep(encoder: GPUCommandEncoder, stepIdx: number): void
  dispatchCompute(
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ): void
  dc: (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
}

/**
 * Execute the full TDSE compute pipeline for one frame.
 *
 * Behavior mirrors the pre-extraction `TDSEComputePass.executeTDSE` method
 * exactly. All effects (buffer rebuild on config change, observables sync,
 * Gram-Schmidt buffer ensure, uniform write, potential refresh, Strang
 * evolution, analog Hawking injection, post-step diagnostics) are invoked
 * in the same order with the same arguments.
 *
 * @param pass - Narrow view of the owning `TDSEComputePass` instance.
 * @param ctx - Current frame render context (device + encoder).
 * @param rawConfig - Unsanitized TDSE config from the store.
 * @param isPlaying - Whether time-evolution substeps should run this frame.
 * @param speed - Animation speed multiplier for `stepsPerFrame`.
 * @param basisX - Optional per-axis basis vector (dimension reduction).
 * @param basisY - Optional per-axis basis vector.
 * @param basisZ - Optional per-axis basis vector.
 * @param boundingRadius - Physical bounding radius used by uniforms.
 */
export function runTdseExecute(
  pass: TdseExecuteFields,
  ctx: WebGPURenderContext,
  rawConfig: TdseConfig,
  isPlaying: boolean,
  speed: number,
  basisX?: Float32Array,
  basisY?: Float32Array,
  basisZ?: Float32Array,
  boundingRadius?: number
): void {
  const config = sanitizeGridSizes(rawConfig)
  const { device } = ctx
  pass.syncSharedState()
  const configHash = computeConfigHash(config.gridSize, config.latticeDim)

  if (configHash !== pass.lastConfigHash || !pass.psiBuffer) {
    pass.rebuildBuffers(device, config)
    // Drop stale pipelines/bind groups so the early-return guards below
    // (and inside the Strang loop) skip dispatch until the new async
    // compile lands. `buildPipelines` kicks off an async build whose
    // .then() callback wires bind groups when it resolves.
    pass.pl = null
    pass.bg = null
    pass.buildPipelines(device)
    pass.initialized = false
    pass.simTime = 0
    pass.lastPotentialHash = ''
    pass._obsState.obsEnabled = false // force rebuild on next check
    gsClearEigenstates(pass._gsState) // eigenstates are grid-size-specific
    useSimulationStateStore.getState().clearStoredEigenstates()
    useDiagnosticsStore.getState().clearEigenstate()
  }

  // Create/destroy observables resources when toggle changes or after rebuild
  pass.syncSharedState()
  obsUpdate(device, config, pass._obsState)
  // Ensure GS uniform buffer exists when needed
  gsEnsureBuffers(device, pass._gsState)

  if (pass.uniformBuffer) {
    writeTdseUniforms(
      device,
      pass.uniformBuffer,
      pass.uniformData,
      pass.uniformU32,
      pass.uniformF32,
      {
        config,
        totalSites: pass.totalSites,
        simTime: pass.simTime,
        maxDensity: pass._diagState.maxDensity,
        initialMaxDensity: pass._diagState.initialMaxDensity,
        autoScaleMaxGain: config.autoScaleMaxGain ?? 20,
        strides: computeStridesPadded(config.gridSize, config.latticeDim),
        needsInit: !pass.initialized || config.needsReset || pass._diagState.pendingAutoReset,
        basisX,
        basisY,
        basisZ,
        boundingRadius,
        customPotentialScale: pass.customPotentialScale,
        hawkingStepIndex: pass._hawkingState.stepIndex,
      }
    )
  }

  pass.maybeInitialize(ctx, config)

  // Strang splitting time steps (only when playing)
  const linearWG = Math.ceil(pass.totalSites / LINEAR_WG)
  // 3-D dispatch fast-path for the per-site kernels (init/potential/absorber/
  // stochastic-loc/curved-kinetic). Computed once per frame so all site
  // dispatches share the same shape choice.
  const siteDispatch = pickSiteDispatch(config.latticeDim, pass.totalSites, config.gridSize)

  // Refresh potential only when parameters change (dirty tracking).
  const fullPotHash = computePotentialHash(config, pass.simTime)
  if (fullPotHash !== pass.lastPotentialHash) {
    pass.lastPotentialHash = fullPotHash
    if (pass.pl && pass.bg) {
      if (config.potentialType === 'custom') {
        pass.customPotentialScale = uploadCustomPotentialBuffer(
          device,
          pass.potentialBuffer,
          config
        )
      } else if (config.potentialType === 'andersonDisorder') {
        pass.customPotentialScale = uploadAndersonDisorderBuffer(
          device,
          pass.potentialBuffer,
          config
        )
      } else {
        const p = ctx.beginComputePass({ label: 'tdse-potential-update' })
        const potPl = siteDispatch.use3D ? pass.pl.potentialPipeline3D : pass.pl.potentialPipeline
        pass.dispatchCompute(
          p,
          potPl,
          [pass.bg.potentialBG],
          siteDispatch.x,
          siteDispatch.y,
          siteDispatch.z
        )
        p.end()
      }
      // Disorder overlay: add random noise to non-Anderson potentials.
      // Anderson disorder is fully generated by uploadAndersonDisorderBuffer —
      // dispatching the overlay here would double-apply disorder.
      if (config.potentialType !== 'andersonDisorder') {
        maybeDispatchDisorder(
          device,
          ctx,
          config,
          pass._disorderState,
          pass.potentialBuffer,
          pass.totalSites,
          linearWG,
          pass.dispatchCompute.bind(pass)
        )
      }
    }
  }

  const { pl, bg } = pass
  if (!pl || !bg) return

  // Heller wavepacket spectrometer — sync store → readback state
  // BEFORE the evolution loop so that the per-Strang-step tick inside
  // `runStrangEvolution` sees the current `enabled` / `sampleInterval`
  // values for this frame. See `prepareHellerFrame` for the
  // time-dependent Hamiltonian guard and reset-token handling.
  pass._hellerLastResetToken = prepareHellerFrame(
    pass._hellerState,
    config,
    pass._hellerLastResetToken
  )

  if (isPlaying) {
    const evoState: EvolutionFrameState = {
      simTime: pass.simTime,
      stepAccumulator: pass.stepAccumulator,
    }
    // Inject the curved-RK4 dispatcher only when the active metric is
    // non-flat. Creating the closure is cheap but gating it here keeps the
    // flat path fully identical to pre-feature — the resource field stays
    // `undefined` and the evolution branch falls through unchanged.
    // Flat and torus both use the existing split-step FFT path. All other
    // metrics invoke the curved-space RK4 integrator. This preserves the
    // v1 zero-regression guarantee for flat and adds torus as a
    // zero-curvature periodic case — FFT wraps natively on a uniform grid.
    const metricKind = config.metric?.kind
    const curvedActive = metricKind !== undefined && metricKind !== 'flat' && metricKind !== 'torus'
    const dispatchCurvedRK4 = curvedActive
      ? (curvedCtx: WebGPURenderContext) =>
          pass.runCurvedFrame(curvedCtx.device, curvedCtx.encoder, siteDispatch)
      : undefined
    // Per-step RK4 stage-time hooks for time-dependent metrics. Wired up
    // only when the curved path is active — flat / torus runs get
    // `undefined` here so the evolution branch short-circuits on a cheap
    // falsy check.
    const prepareCurvedStageTimes = curvedActive
      ? (device: GPUDevice, simTimeStart: number, steps: number) =>
          pass.prepareCurvedStageTimes(device, simTimeStart, config.dt, steps)
      : undefined
    const applyCurvedStageTimesForStep = curvedActive
      ? (encoder: GPUCommandEncoder, stepIdx: number) =>
          pass.applyCurvedStageTimesForStep(encoder, stepIdx)
      : undefined
    runStrangEvolution(ctx, config, speed, evoState, {
      pl,
      bg,
      totalSites: pass.totalSites,
      diagNumWorkgroups: pass.diagNumWorkgroups,
      ifftSlotOffset: pass.fwdAxisCount,
      gsState: pass._gsState,
      stochasticState: pass._stochasticState,
      boundingRadius: boundingRadius ?? 2.0,
      hellerState: pass._hellerState,
      wormholePipeline: pass.wormholePipeline,
      wormholeBG: pass.wormholeBG,
      siteDispatch,
      dc: pass.dc,
      dispatchFFTAxis: (c, axisDim, slot) => pass.dispatchFFTAxis(c, axisDim, slot),
      dispatchFFTAxisInPass: (passEncoder, axisDim, slot) =>
        pass.dispatchFFTAxisInPass(passEncoder, axisDim, slot),
      dispatchCurvedRK4,
      prepareCurvedStageTimes,
      applyCurvedStageTimesForStep,
    })
    pass.simTime = evoState.simTime
    pass.stepAccumulator = evoState.stepAccumulator

    // Analog Hawking pair injection + step-counter advance (gated off by default).
    runHawkingFrame(
      device,
      ctx,
      config,
      pass._hawkingState,
      pass.uniformBuffer,
      pass.psiBuffer,
      linearWG,
      pass.dispatchCompute.bind(pass)
    )
  }

  // ER=EPR wormhole coherence HUD readback — piggybacks on the same
  // per-frame cadence as diagnostics. Allocates staging buffers lazily
  // on first enabled call; no-op when the HUD toggle is off.
  if (config.wormholeCoherenceHudEnabled === true) {
    requestWormholeReadback(
      device,
      ctx.encoder,
      pass._wormholeReadback,
      true,
      pass.psiBuffer,
      pass.totalSites,
      config.gridSize,
      (config.wormholeMirrorAxis ?? 0) as 0 | 1 | 2,
      config.wormholeCouplingG ?? 0,
      pass.simTime
    )
  }

  runPostStepDispatches(ctx, config, pass._diagFrameState, {
    pl,
    bg,
    totalSites: pass.totalSites,
    diagNumWorkgroups: pass.diagNumWorkgroups,
    simTime: pass.simTime,
    diagUniformBuffer: pass.diagUniformBuffer,
    diagState: pass._diagState,
    obsState: pass._obsState,
    vdState: pass._vdState,
    dispatchCompute: pass.dc,
    dispatchFFTAxis: (c, axisDim, slot) => pass.dispatchFFTAxis(c, axisDim, slot),
    densityGridSize: pass.densityGridSize,
  })
}
