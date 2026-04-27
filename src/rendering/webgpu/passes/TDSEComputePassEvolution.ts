/**
 * TDSE Per-Frame Evolution Pipeline
 *
 * Extracted from TDSEComputePass: contains all per-frame GPU work.
 *
 * Phase 1 — Strang splitting time steps:
 *   potentialHalf → pack → FFT → kinetic → IFFT → unpack+potentialHalf → absorber → renorm
 *
 * Phase 2 — Post-step dispatches:
 *   density grid write → decimated diagnostics → vortex detection
 *
 * The main TDSEComputePass handles lifecycle (setup, rebuild, dispose).
 * This module handles the physics loop and readback scheduling.
 *
 * @module rendering/webgpu/passes/TDSEComputePassEvolution
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { isTimeDependentMetric } from '@/lib/physics/tdse/metrics/types'

import type { WebGPURenderContext } from '../core/types'
import {
  computeStridesPadded,
  DIAG_DECIMATION,
  GRID_WG,
  LINEAR_WG,
  type SiteDispatch,
} from './computePassUtils'
import { dispatchDiagnostics as extDispatchDiagnostics } from './TDSEComputePassDispatchers'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import {
  dispatchWormholeCoupling,
  dispatchWormholeCouplingInPass,
  type WormholePipelineResources,
} from './TDSEComputePassWormhole'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { dispatchGramSchmidt as gsDispatch, type GramSchmidtState } from './TDSEGramSchmidt'
import { type HellerReadbackState, tickHellerStep } from './TDSEHellerReadback'
import type { ObservablesState } from './TDSEObservablesDispatch'
import {
  computeCSLSubsteps,
  maybeDispatchStochasticLoc,
  prepareStochasticStaging,
  type StochasticLocState,
} from './TDSEStochasticLocalization'
import { runVortexDetection, type VortexDetectState } from './TDSEVortexDetect'

/** Mutable state updated by the evolution loop each frame. */
export interface EvolutionFrameState {
  simTime: number
  stepAccumulator: number
}

/** Immutable resources needed by the evolution loop. */
export interface EvolutionResources {
  pl: TdsePipelineResult
  bg: TdseBindGroupResult
  totalSites: number
  diagNumWorkgroups: number
  /**
   * Index into the per-slot FFT axis arrays
   * (`TdseBufferResult.fftAxisUniformBuffers` /
   * `TdseBindGroupResult.fftSharedMemBGs`) at which the inverse-FFT run
   * starts. Forward axes occupy slots `[0, latticeDim)`, inverse axes
   * occupy `[latticeDim, 2*latticeDim)`.
   *
   * Value is `latticeDim` (one slot per axis direction). Do NOT set this
   * to `Σ log2(N)` — the Strang inverse-FFT loop indexes directly into
   * the per-axis bind-group array and would go out of bounds.
   */
  ifftSlotOffset: number
  gsState: GramSchmidtState
  /** Stochastic localization state (optional — null when feature not built). */
  stochasticState: StochasticLocState | null
  /** Dynamic bounding radius of the quantum state (used to concentrate CSL centers). */
  boundingRadius: number
  /**
   * Heller wavepacket spectrometer readback state. The loop calls
   * {@link tickHellerStep} after each Strang step so captures land on a
   * perfectly uniform `simTime` grid, independent of frame-rate jitter,
   * fractional `stepsPerFrame * speed`, or paused-resume cycles. Pass
   * `null` if Heller is not wired up.
   */
  hellerState: HellerReadbackState | null
  /**
   * ER=EPR double-trace wormhole coupling — pipeline + bind group.
   * Both `null` disables the coupling entirely (hot path untouched).
   */
  wormholePipeline: WormholePipelineResources | null
  wormholeBG: GPUBindGroup | null
  /**
   * 3-D dispatch shape + variant flag for per-site kernels (absorber, etc.).
   * Computed once per frame in {@link runTdseExecute} and forwarded so all
   * dispatches in this frame share the same choice.
   */
  siteDispatch: SiteDispatch
  /** Dispatch a compute pass. */
  dc: (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
  /** Dispatch one FFT axis, returning the next slot offset. */
  dispatchFFTAxis: (ctx: WebGPURenderContext, axisDim: number, slotOffset: number) => number
  /**
   * PERF: dispatch one FFT axis inside an already-open compute pass.
   * Used by the Strang loop to batch all substep dispatches into a single pass.
   * Caller has already set the FFT pipeline on the encoder.
   */
  dispatchFFTAxisInPass: (passEncoder: GPUComputePassEncoder, axisDim: number, slot: number) => void
  /**
   * Curved-space RK4 integrator dispatcher. When `undefined`, the Strang
   * loop runs as before — this preserves the flat-metric zero-regression
   * guarantee. When present AND the metric kind is non-flat and non-torus,
   * the Strang body is entirely replaced by per-step RK4 dispatches.
   * (Flat and torus both use the existing split-step FFT path. All other
   * metrics invoke the curved-space RK4 integrator. This preserves the v1
   * zero-regression guarantee for flat and adds torus as a zero-curvature
   * periodic case — FFT naturally implements periodic BC for a uniform grid.)
   */
  dispatchCurvedRK4?: (ctx: WebGPURenderContext) => void
  /**
   * Per-frame refresh + per-step apply of RK4 stage times in the TDSE
   * uniform buffer. Without these, `stageTimeK{1..4}` is written once per
   * frame from the start-of-frame simTime, so multi-step frames
   * (`stepsPerFrame × speed > 1`) drift by up to `(stepsPerFrame−1)·dt`
   * on time-dependent metrics (deSitter). `prepareCurvedStageTimes`
   * uploads a per-step stage-time table for the whole frame via
   * queue.writeBuffer; `applyCurvedStageTimesForStep` emits the
   * copyBufferToBuffer on the active encoder that patches
   * `stageTimeK{1..4}` for the current step. Both are no-ops on flat /
   * torus / static-curved runs because they're only invoked inside the
   * curved branch when the metric is time-dependent.
   */
  prepareCurvedStageTimes?: (device: GPUDevice, simTimeStart: number, steps: number) => void
  applyCurvedStageTimesForStep?: (encoder: GPUCommandEncoder, stepIdx: number) => void
}

/**
 * Run the Strang splitting evolution loop for one frame.
 *
 * @param ctx - WebGPU render context
 * @param config - TDSE configuration
 * @param speed - Timeline speed multiplier
 * @param state - Mutable frame state (simTime, stepAccumulator)
 * @param res - Immutable pipeline/buffer resources
 */
export function runStrangEvolution(
  ctx: WebGPURenderContext,
  config: TdseConfig,
  speed: number,
  state: EvolutionFrameState,
  res: EvolutionResources
): void {
  // ─── Curved-space early branch ───────────────────────────────────────────
  // For non-flat metrics the split-step FFT kinetic step does not diagonalize
  // the Hamiltonian. Replace the entire Strang body with a per-step RK4
  // integrator on the position-space Laplace–Beltrami operator. The branch
  // is guarded so that any flat or missing-metric config — plus any build
  // where `dispatchCurvedRK4` wasn't injected — falls through to the
  // existing path unchanged (zero-regression guarantee).
  const metricKind = config.metric?.kind
  const curvedBranch = metricKind !== undefined && metricKind !== 'flat' && metricKind !== 'torus'
  if (curvedBranch && res.dispatchCurvedRK4) {
    const { pl: curvedPl, bg: curvedBg, dc: curvedDc } = res
    const curvedLinearWG = Math.ceil(res.totalSites / LINEAR_WG)
    const scaledSteps = config.stepsPerFrame * speed
    state.stepAccumulator += scaledSteps
    const curvedSteps = Math.floor(state.stepAccumulator)
    state.stepAccumulator -= curvedSteps
    const curvedAbsorberActive = config.absorberEnabled === true
    const curvedPerStepRenorm =
      config.imaginaryTimeEnabled || (config.stochasticEnabled && config.stochasticGamma > 0)
    // Per-step RK4 stage-time patch for time-dependent metrics (deSitter).
    // The frame-start `stageTimeK{1..4}` values in TDSEUniforms are only
    // correct for step 0; without a per-step rewrite, step i uses t_start
    // instead of t_start + i·dt, so a(t) = exp(H·t) drifts across the
    // frame. Only dispatch the copy when (a) the hooks are wired, (b) the
    // metric actually reads the stage time (`deSitter`), and (c) the frame
    // executes at least one step.
    const curvedTimeDep =
      metricKind !== undefined &&
      isTimeDependentMetric(metricKind) &&
      res.prepareCurvedStageTimes !== undefined &&
      res.applyCurvedStageTimesForStep !== undefined
    if (curvedTimeDep && curvedSteps > 0 && res.prepareCurvedStageTimes) {
      res.prepareCurvedStageTimes(ctx.device, state.simTime, curvedSteps)
    }
    for (let step = 0; step < curvedSteps; step++) {
      if (curvedTimeDep && res.applyCurvedStageTimesForStep) {
        res.applyCurvedStageTimesForStep(ctx.encoder, step)
      }
      res.dispatchCurvedRK4(ctx)
      state.simTime += config.dt
      // PML absorber: ψ damping at boundaries. Uses the same pipeline +
      // init-bind-group as the flat path; operates on ψ regardless of metric.
      if (curvedAbsorberActive) {
        const absPass = ctx.beginComputePass({ label: `tdse-curved-absorber-${step}` })
        const absPl = res.siteDispatch.use3D
          ? curvedPl.absorberPipeline3D
          : curvedPl.absorberPipeline
        curvedDc(
          absPass,
          absPl,
          [curvedBg.initBG],
          res.siteDispatch.x,
          res.siteDispatch.y,
          res.siteDispatch.z
        )
        absPass.end()
      }
      // Per-step renormalization for non-unitary modes (imaginary-time,
      // stochastic), plus a last-step frame-level renorm when absorber is
      // off to correct numeric drift — same logic as the Strang path.
      const curvedFrameRenorm = !curvedAbsorberActive && step === curvedSteps - 1
      if (curvedPerStepRenorm || curvedFrameRenorm) {
        const rPass = ctx.beginComputePass({ label: `tdse-curved-renorm-reduce-${step}` })
        curvedDc(rPass, curvedPl.diagReducePipeline, [curvedBg.diagReduceBG], res.diagNumWorkgroups)
        rPass.end()
        const fPass = ctx.beginComputePass({ label: `tdse-curved-renorm-finalize-${step}` })
        curvedDc(fPass, curvedPl.diagFinalizePipeline, [curvedBg.diagFinalizeBG], 1)
        fPass.end()
        const sPass = ctx.beginComputePass({ label: `tdse-curved-renorm-scale-${step}` })
        curvedDc(sPass, curvedPl.renormalizePipeline, [curvedBg.renormalizeBG], curvedLinearWG)
        sPass.end()

        if (config.imaginaryTimeEnabled && res.gsState.gsEigenstates.length > 0) {
          gsDispatch(ctx, res.gsState, curvedDc, {
            diagReducePipeline: curvedPl.diagReducePipeline,
            diagReduceBG: curvedBg.diagReduceBG,
            diagFinalizePipeline: curvedPl.diagFinalizePipeline,
            diagFinalizeBG: curvedBg.diagFinalizeBG,
            renormalizePipeline: curvedPl.renormalizePipeline,
            renormalizeBG: curvedBg.renormalizeBG,
            diagNumWorkgroups: res.diagNumWorkgroups,
          })
        }
      }
      // Heller spectrometer tick — same per-step cadence as the flat path.
      if (res.hellerState) {
        tickHellerStep(ctx.device, ctx.encoder, res.hellerState, state.simTime)
      }
    }
    return
  }

  const { pl, bg, dc } = res
  const linearWG = Math.ceil(res.totalSites / LINEAR_WG)

  const stochasticActive = config.stochasticEnabled && config.stochasticGamma > 0

  // Compute speed-scaled step count using fractional accumulator.
  // This preserves dt (critical for numerical stability) while allowing
  // the user to control evolution rate via the timeline speed slider.
  const scaledSteps = config.stepsPerFrame * speed
  state.stepAccumulator += scaledSteps
  const stepsThisFrame = Math.floor(state.stepAccumulator)
  state.stepAccumulator -= stepsThisFrame

  // Pre-compute stochastic uniforms for all steps (staging buffer pattern).
  // Must happen before the loop so each step gets independent random data.
  // Pass bounding radius so centers concentrate near the wavepacket.
  if (stochasticActive && res.stochasticState && stepsThisFrame > 0) {
    prepareStochasticStaging(
      ctx.device,
      config,
      res.stochasticState,
      stepsThisFrame,
      res.boundingRadius
    )
  }

  // PERF: batch every dispatch of the Strang step into a single compute pass.
  // Previously each substep opened ~10 separate passes (fused_Vhalf_pack, 3 fwd
  // FFT, kinetic, 3 inv FFT, fused_unpack_Vhalf, optional absorber). Each pass
  // boundary carries 5–20 µs of CPU/driver overhead on Metal WebGPU. With per-
  // slot FFT bind groups (see `TdseBindGroupResult.fftSharedMemBGs`) no
  // `copyBufferToBuffer` is needed between FFT axes, so we can keep the whole
  // step inside one `MTLComputeCommandEncoder`. Implicit WAW/RAW barriers
  // between dispatches touching overlapping storage buffers are inserted by
  // the driver automatically, so correctness is unchanged.
  // Enable the batched path when the per-slot bind groups are populated.
  const fftAxesInPassAvailable = (bg.fftSharedMemBGs?.length ?? 0) >= config.latticeDim * 2
  // ER=EPR wormhole coupling — Strang-split around the kinetic+potential
  // block. Each dispatch applies exp(-i·(dt/2)·g·P_M); two dispatches per
  // step reconstruct exp(-i·dt·g·P_M) to first order in the full Trotter
  // factorization. Off-path: both branches skip when the uniform flag is
  // zero, so the hot path stays bit-identical when disabled. We also gate
  // dispatch here on the TS-side flag so the pipeline/bind-group isn't
  // touched at all when the feature is off — preserves command-buffer
  // identity with the pre-feature build.
  const wormholeActive =
    config.wormholeCouplingEnabled === true &&
    res.wormholePipeline !== null &&
    res.wormholeBG !== null
  for (let step = 0; step < stepsThisFrame; step++) {
    if (fftAxesInPassAvailable) {
      const strangPass = ctx.beginComputePass({ label: `tdse-strang-${step}` })
      if (wormholeActive && res.wormholePipeline && res.wormholeBG) {
        // Leading half-kick of g·P_M.
        dispatchWormholeCouplingInPass(
          strangPass,
          res.wormholePipeline.pipeline,
          res.wormholeBG,
          res.totalSites
        )
      }
      // 1+2. Fused half-step potential + pack
      dc(strangPass, pl.fusedPotentialPackPipeline, [bg.fusedPotentialPackBG], linearWG)
      // 3. Forward FFT — one dispatch per axis, batched in this pass
      strangPass.setPipeline(pl.fftSharedMemPipeline)
      let fftSlot = 0
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        const axisDim = config.gridSize[d]!
        strangPass.setBindGroup(0, bg.fftSharedMemBGs[fftSlot]!)
        strangPass.dispatchWorkgroups(res.totalSites / axisDim)
        fftSlot++
      }
      // 4. Kinetic propagator in k-space.
      // Uses 3-D dispatch when latticeDim===3 to skip the per-thread linearToND
      // k-coord decode. Pipeline shape and dispatch shape are paired by
      // pickSiteDispatch + buildTdsePipelines.
      const kinPl = res.siteDispatch.use3D ? pl.kineticPipeline3D : pl.kineticPipeline
      dc(
        strangPass,
        kinPl,
        [bg.kineticBG],
        res.siteDispatch.x,
        res.siteDispatch.y,
        res.siteDispatch.z
      )
      // 5. Inverse FFT — axes batched
      strangPass.setPipeline(pl.fftSharedMemPipeline)
      fftSlot = res.ifftSlotOffset
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        const axisDim = config.gridSize[d]!
        strangPass.setBindGroup(0, bg.fftSharedMemBGs[fftSlot]!)
        strangPass.dispatchWorkgroups(res.totalSites / axisDim)
        fftSlot++
      }
      // 6+7. Fused unpack + second half-step potential (reads density for BEC nonlinearity)
      dc(strangPass, pl.fusedUnpackPotentialPipeline, [bg.fusedUnpackPotentialBG], linearWG)
      if (wormholeActive && res.wormholePipeline && res.wormholeBG) {
        // Trailing half-kick of g·P_M (before absorber + renorm).
        dispatchWormholeCouplingInPass(
          strangPass,
          res.wormholePipeline.pipeline,
          res.wormholeBG,
          res.totalSites
        )
      }
      // 8. Absorber (inline — same pass as the Strang step). Only when
      // stochastic localization is NOT active, because the legacy code placed
      // the PML damping AFTER the CSL kicks and we must preserve that operator
      // ordering for stochastic mode. When stochastic is active, absorber is
      // dispatched after the stochastic sub-step loop below.
      const inlineAbsorber = config.absorberEnabled && !stochasticActive
      if (inlineAbsorber) {
        const absPl = res.siteDispatch.use3D ? pl.absorberPipeline3D : pl.absorberPipeline
        dc(
          strangPass,
          absPl,
          [bg.initBG],
          res.siteDispatch.x,
          res.siteDispatch.y,
          res.siteDispatch.z
        )
      }
      strangPass.end()
    } else {
      // Fallback (grid or bind-group layout not yet populated): unfused legacy path.
      if (wormholeActive && res.wormholePipeline && res.wormholeBG) {
        dispatchWormholeCoupling(
          ctx.encoder,
          res.wormholePipeline.pipeline,
          res.wormholeBG,
          res.totalSites,
          `tdse-wormhole-leading-${step}`
        )
      }
      const fusedVPack = ctx.beginComputePass({ label: `tdse-fused-Vhalf-pack-${step}` })
      dc(fusedVPack, pl.fusedPotentialPackPipeline, [bg.fusedPotentialPackBG], linearWG)
      fusedVPack.end()

      let fftSlot = 0
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        fftSlot = res.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
      }

      const kinPass = ctx.beginComputePass({ label: `tdse-kinetic-${step}` })
      const kinPlLegacy = res.siteDispatch.use3D ? pl.kineticPipeline3D : pl.kineticPipeline
      dc(
        kinPass,
        kinPlLegacy,
        [bg.kineticBG],
        res.siteDispatch.x,
        res.siteDispatch.y,
        res.siteDispatch.z
      )
      kinPass.end()

      fftSlot = res.ifftSlotOffset
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        fftSlot = res.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
      }

      const fusedUnpackV = ctx.beginComputePass({ label: `tdse-fused-unpack-Vhalf-${step}` })
      dc(fusedUnpackV, pl.fusedUnpackPotentialPipeline, [bg.fusedUnpackPotentialBG], linearWG)
      fusedUnpackV.end()

      if (wormholeActive && res.wormholePipeline && res.wormholeBG) {
        dispatchWormholeCoupling(
          ctx.encoder,
          res.wormholePipeline.pipeline,
          res.wormholeBG,
          res.totalSites,
          `tdse-wormhole-trailing-${step}`
        )
      }

      if (config.absorberEnabled && !stochasticActive) {
        const absPass = ctx.beginComputePass({ label: `tdse-absorber-${step}` })
        const absPl = res.siteDispatch.use3D ? pl.absorberPipeline3D : pl.absorberPipeline
        dc(absPass, absPl, [bg.initBG], res.siteDispatch.x, res.siteDispatch.y, res.siteDispatch.z)
        absPass.end()
      }
    }

    // 7.5. Stochastic localization (CSL) — conditional on γ > 0
    // Sub-stepped: M micro-kicks per Strang step, each with γ/M and fresh
    // random centers. This smooths the effective collapse field and prevents
    // strong kicks from destroying the wavepacket structure.
    if (stochasticActive && res.stochasticState) {
      const cslSub = computeCSLSubsteps(config.stochasticGamma, config.dt)
      for (let sub = 0; sub < cslSub; sub++) {
        maybeDispatchStochasticLoc(
          ctx.device,
          ctx,
          config,
          res.stochasticState,
          res.siteDispatch,
          res.totalSites,
          step * cslSub + sub,
          dc
        )
      }
    }

    // Absorber dispatch (legacy ordering): when stochastic localization is
    // active, PML must come AFTER the CSL kicks. The batched path above only
    // inlines absorber when stochastic is disabled, so we run the dispatch
    // here for the stochastic case.
    if (config.absorberEnabled && stochasticActive) {
      const absPass = ctx.beginComputePass({ label: `tdse-absorber-${step}` })
      const absPl = res.siteDispatch.use3D ? pl.absorberPipeline3D : pl.absorberPipeline
      dc(absPass, absPl, [bg.initBG], res.siteDispatch.x, res.siteDispatch.y, res.siteDispatch.z)
      absPass.end()
    }

    state.simTime += config.dt

    // 9. Renormalization:
    //   - Every step for imaginary-time (decay must be renormalized to prevent ψ→0)
    //   - Every step when stochastic localization is active (the exponential
    //     discretization's Itô drift causes systematic norm bias per step;
    //     without per-step renorm, high γ causes amplitude swings that destroy
    //     the wavepacket structure before localization can bias one branch)
    //   - Once per frame otherwise (f32 drift correction), UNLESS the PML
    //     absorber is enabled. With PML, the user is intentionally watching
    //     the wave packet decay at boundaries — renormalising back to the
    //     initial norm cancels the visible absorption (the renorm scale
    //     factor exactly compensates the absorber's damping). The user
    //     reads the unchanged total density and concludes "PML doesn't
    //     work". Imaginary-time / stochastic modes still renormalise even
    //     under PML because their non-unitary mechanics mandate it.
    const isImaginaryTime = config.imaginaryTimeEnabled
    const needsPerStepRenorm =
      isImaginaryTime || (config.stochasticEnabled && config.stochasticGamma > 0)
    const needsFrameRenorm = !config.absorberEnabled && step === stepsThisFrame - 1
    if (needsPerStepRenorm || needsFrameRenorm) {
      const rPass = ctx.beginComputePass({ label: `tdse-renorm-reduce-${step}` })
      dc(rPass, pl.diagReducePipeline, [bg.diagReduceBG], res.diagNumWorkgroups)
      rPass.end()
      const fPass = ctx.beginComputePass({ label: `tdse-renorm-finalize-${step}` })
      dc(fPass, pl.diagFinalizePipeline, [bg.diagFinalizeBG], 1)
      fPass.end()
      const sPass = ctx.beginComputePass({ label: `tdse-renorm-scale-${step}` })
      const renormWG = Math.ceil(res.totalSites / LINEAR_WG)
      dc(sPass, pl.renormalizePipeline, [bg.renormalizeBG], renormWG)
      sPass.end()

      // Gram-Schmidt: orthogonalize against stored eigenstates (imaginary-time only)
      if (isImaginaryTime && res.gsState.gsEigenstates.length > 0) {
        gsDispatch(ctx, res.gsState, dc, {
          diagReducePipeline: pl.diagReducePipeline,
          diagReduceBG: bg.diagReduceBG,
          diagFinalizePipeline: pl.diagFinalizePipeline,
          diagFinalizeBG: bg.diagFinalizeBG,
          renormalizePipeline: pl.renormalizePipeline,
          renormalizeBG: bg.renormalizeBG,
          diagNumWorkgroups: res.diagNumWorkgroups,
        })
      }
    }

    // Heller wavepacket spectrometer — sample ψ at the END of this
    // Strang step. `state.simTime` has already been advanced by
    // `config.dt`, and any per-step renormalization has already run,
    // so `tickHellerStep` sees ψ in its stable post-step form. Sampling
    // by step count (not frame count) guarantees perfectly uniform
    // spacing on the simTime axis regardless of frame rate jitter,
    // fractional `stepsPerFrame * speed`, or back-pressure drops.
    if (res.hellerState) {
      tickHellerStep(ctx.device, ctx.encoder, res.hellerState, state.simTime)
    }
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  Phase 2 — Post-step dispatches                                */
/* ────────────────────────────────────────────────────────────── */

/** Mutable state for diagnostics frame decimation. */
export interface DiagFrameState {
  diagFrameCounter: number
}

/** Resources needed by the post-step dispatches. */
export interface PostStepResources {
  pl: TdsePipelineResult
  bg: TdseBindGroupResult
  totalSites: number
  diagNumWorkgroups: number
  simTime: number
  diagUniformBuffer: GPUBuffer | null
  diagState: DiagReadbackState
  obsState: ObservablesState
  vdState: VortexDetectState
  dispatchCompute: EvolutionResources['dc']
  dispatchFFTAxis: EvolutionResources['dispatchFFTAxis']
  densityGridSize: number
}

/**
 * Run post-evolution dispatches: density grid write, decimated diagnostics,
 * and vortex detection.
 *
 * @param ctx - WebGPU render context
 * @param config - TDSE configuration
 * @param frameState - Mutable diagnostics frame counter
 * @param res - Pipeline/buffer resources
 */
export function runPostStepDispatches(
  ctx: WebGPURenderContext,
  config: TdseConfig,
  frameState: DiagFrameState,
  res: PostStepResources
): void {
  const { pl, bg, dispatchCompute: dc } = res

  // Write density grid
  const gridWG = Math.ceil(res.densityGridSize / GRID_WG)
  const wgPass = ctx.beginComputePass({ label: 'tdse-write-grid-pass' })
  res.dispatchCompute(wgPass, pl.writeGridPipeline, [bg.writeGridBG], gridWG, gridWG, gridWG)
  wgPass.end()

  // Always run decimated norm reduction to keep maxDensity updated for
  // display normalization. Without this, a spreading wavepacket fades to
  // invisible because maxDensity stays at the initial peak value.
  res.diagState.currentAutoLoop = config.autoLoop
  frameState.diagFrameCounter++
  const interval = config.diagnosticsEnabled
    ? config.diagnosticsInterval || DIAG_DECIMATION
    : DIAG_DECIMATION
  if (frameState.diagFrameCounter >= interval) {
    frameState.diagFrameCounter = 0
    const { diagResultBuffer, diagStagingBuffer } = res.diagState
    if (diagResultBuffer && diagStagingBuffer && res.diagUniformBuffer) {
      extDispatchDiagnostics(ctx, config, config.diagnosticsEnabled, {
        pl,
        bg,
        diagState: res.diagState,
        obsState: res.obsState,
        diagUniformBuffer: res.diagUniformBuffer,
        totalSites: res.totalSites,
        diagNumWorkgroups: res.diagNumWorkgroups,
        simTime: res.simTime,
        computeStrides: (c) => computeStridesPadded(c.gridSize, c.latticeDim),
        dispatchCompute: dc,
        observablesMomentumFFT: (fftCtx) => {
          const wg = Math.ceil(res.totalSites / LINEAR_WG)
          const packP = fftCtx.beginComputePass({ label: 'obs-fft-pack' })
          dc(packP, pl.packPipeline, [bg.packBG], wg)
          packP.end()
          let slot = 0
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            slot = res.dispatchFFTAxis(fftCtx, config.gridSize[d]!, slot)
          }
        },
      })
      runVortexDetection(ctx, res.vdState, config, res.totalSites, res.diagState.maxDensity)
    }
  }
}
