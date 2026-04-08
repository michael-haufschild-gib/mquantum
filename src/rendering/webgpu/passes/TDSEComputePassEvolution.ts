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

import type { WebGPURenderContext } from '../core/types'
import {
  computeStridesPadded,
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  GRID_WG,
  LINEAR_WG,
} from './computePassUtils'
import { dispatchDiagnostics as extDispatchDiagnostics } from './TDSEComputePassDispatchers'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { dispatchGramSchmidt as gsDispatch, type GramSchmidtState } from './TDSEGramSchmidt'
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
  fwdStageCount: number
  gsState: GramSchmidtState
  /** Stochastic localization state (optional — null when feature not built). */
  stochasticState: StochasticLocState | null
  /** Dynamic bounding radius of the quantum state (used to concentrate CSL centers). */
  boundingRadius: number
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
  const { pl, bg, dc } = res
  const linearWG = Math.ceil(res.totalSites / LINEAR_WG)

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
  if (res.stochasticState && stepsThisFrame > 0) {
    prepareStochasticStaging(
      ctx.device, config, res.stochasticState, stepsThisFrame, res.boundingRadius
    )
  }

  for (let step = 0; step < stepsThisFrame; step++) {
    // 1+2. PERF: Fused half-step potential + pack (saves 1 dispatch + 2MB memory)
    const fusedVPack = ctx.beginComputePass({ label: `tdse-fused-Vhalf-pack-${step}` })
    dc(fusedVPack, pl.fusedPotentialPackPipeline, [bg.fusedPotentialPackBG], linearWG)
    fusedVPack.end()

    // 3. Forward FFT (for each spatial axis)
    let fftSlot = 0
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      fftSlot = res.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
    }

    // 4. Apply kinetic propagator in k-space
    const kinPass = ctx.beginComputePass({ label: `tdse-kinetic-${step}` })
    dc(kinPass, pl.kineticPipeline, [bg.kineticBG], linearWG)
    kinPass.end()

    // 5. Inverse FFT
    fftSlot = res.fwdStageCount
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      fftSlot = res.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
    }

    // 6+7. PERF: Fused unpack (1/N norm) + second half-step potential (saves 1 dispatch + 2MB memory)
    const fusedUnpackV = ctx.beginComputePass({ label: `tdse-fused-unpack-Vhalf-${step}` })
    dc(fusedUnpackV, pl.fusedUnpackPotentialPipeline, [bg.fusedUnpackPotentialBG], linearWG)
    fusedUnpackV.end()

    // 7.5. Stochastic localization (CSL) — conditional on γ > 0
    // Sub-stepped: M micro-kicks per Strang step, each with γ/M and fresh
    // random centers. This smooths the effective collapse field and prevents
    // strong kicks from destroying the wavepacket structure.
    if (res.stochasticState) {
      const cslSub = computeCSLSubsteps(config.stochasticGamma, config.dt)
      for (let sub = 0; sub < cslSub; sub++) {
        maybeDispatchStochasticLoc(
          ctx.device,
          ctx,
          config,
          res.stochasticState,
          linearWG,
          res.totalSites,
          step * cslSub + sub,
          (pass, pipeline, bindGroups, wgX) => dc(pass, pipeline, bindGroups, wgX)
        )
      }
    }

    // 8. Absorber (separate pass AFTER the Strang step)
    // Applied once per step, after the FFT kinetic step has completed.
    // This prevents the FFT from seeing the absorber's spatial modulation
    // and scattering it across k-space (which creates spurious emission artifacts).
    // PERF: Skip dispatch entirely when absorber is disabled — saves ~5µs per step.
    if (config.absorberEnabled) {
      const absPass = ctx.beginComputePass({ label: `tdse-absorber-${step}` })
      dc(absPass, pl.absorberPipeline, [bg.initBG], linearWG)
      absPass.end()
    }

    state.simTime += config.dt

    // 9. Renormalization:
    //   - Every step for imaginary-time (decay must be renormalized to prevent ψ→0)
    //   - Every step when stochastic localization is active (the exponential
    //     discretization's Itô drift causes systematic norm bias per step;
    //     without per-step renorm, high γ causes amplitude swings that destroy
    //     the wavepacket structure before localization can bias one branch)
    //   - Once per frame otherwise (f32 drift correction)
    const isImaginaryTime = config.imaginaryTimeEnabled
    const needsPerStepRenorm =
      isImaginaryTime ||
      (config.stochasticEnabled && config.stochasticGamma > 0)
    if (needsPerStepRenorm || step === stepsThisFrame - 1) {
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
  dc: EvolutionResources['dc']
  dispatchCompute: (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
  dispatchFFTAxis: EvolutionResources['dispatchFFTAxis']
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
  const { pl, bg, dc } = res

  // Write density grid
  const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
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
