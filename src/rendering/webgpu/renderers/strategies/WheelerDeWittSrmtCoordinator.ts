/**
 * SRMT coordinator for the Wheeler–DeWitt strategy.
 *
 * Owns the {@link SrmtWorkerState} and the strategy-side
 * `lastSrmtResultGeneration` counter. Updates the state each frame based
 * on the current WdW config plus the solver output from the physics
 * cache, and reports whether the density-grid packer needs to re-pack
 * its SRMT overlay.
 *
 * Extracted from the strategy so all SRMT transitions (enable edge,
 * compute-hash change, render-hash change, worker-reply arrival, dispose,
 * adoption) live in one place rather than scattered across
 * `executeFrame`'s boolean disjunction.
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittSrmtCoordinator
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock } from '@/lib/physics/srmt'
import type { WdwSrmtOverlay } from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'

import { computeWdwConfigHash } from './WheelerDeWittPhysicsCache'
import {
  cancelSrmtCompute,
  createSrmtWorkerState,
  disposeSrmtWorker,
  qualityFromResults,
  queueSrmtCompute,
  SRMT_CLOCKS,
  type SrmtDispatchArgs,
  type SrmtWorkerState,
} from './WheelerDeWittSrmtWorker'

/**
 * Hash of the fields that affect the SRMT COMPUTE step. Embeds the
 * solver config hash — any change that re-runs the solver also
 * invalidates the SRMT cache. Also includes the cut position and rank
 * cap (both change the per-clock diagnostic output). Excludes:
 *
 * - `srmtClock` — clock selection is a render-time choice; see
 *   {@link computeWdwSrmtRenderHash}.
 * - `srmtHeatmapIntensity` — pure render-side alpha multiplier.
 *
 * When this hash changes, all three clocks are re-queued on the worker.
 */
export function computeWdwSrmtComputeHash(config: WheelerDeWittConfig): string {
  return [
    config.srmtEnabled ? 1 : 0,
    computeWdwConfigHash(config),
    config.srmtCutNormalized.toFixed(4),
    config.srmtRankCap,
  ].join('|')
}

/**
 * Hash of fields that affect the SRMT RENDER-TIME overlay. Embeds the
 * compute hash plus the clock selection and heatmap intensity. When
 * this hash changes but {@link computeWdwSrmtComputeHash} does not, the
 * strategy swaps which cached per-clock result drives the panel snapshot
 * + density texture without re-dispatching the worker.
 */
export function computeWdwSrmtRenderHash(config: WheelerDeWittConfig): string {
  return [
    computeWdwSrmtComputeHash(config),
    config.srmtClock,
    config.srmtHeatmapIntensity.toFixed(4),
  ].join('|')
}

/**
 * Per-tick report from the SRMT coordinator.
 */
export interface SrmtTick {
  /** Whether the density packer needs to redo the SRMT overlay. */
  overlayDirty: boolean
  /** Current SRMT overlay payload for the density packer (null when disabled). */
  overlay: WdwSrmtOverlay | null
}

/** Return the clock-axis length for a given clock in the solver grid. */
function clockAxisLenFor(clock: SrmtClock, gridSize: readonly [number, number, number]): number {
  return clock === 'a' ? gridSize[0] : gridSize[1]
}

/**
 * Coordinator state transitions:
 *
 * 1. **SRMT toggle-on (`false → true`)** — queue all three clocks.
 * 2. **Compute-hash change** (solver output changed OR cut/rank changed)
 *    while enabled — flush per-clock cache, re-queue all three.
 * 3. **Render-hash change only** (clock / intensity changed while
 *    compute hash stable) — swap the selected-clock snapshot in the
 *    store, no worker dispatch.
 * 4. **SRMT toggle-off (`true → false`)** — cancel in-flight, clear
 *    store, reset counters.
 * 5. **Worker reply arrives** — counted via
 *    {@link SrmtWorkerState.resultGeneration}; when the strategy's
 *    paired counter differs, syncStoreForSelectedClock fires and the
 *    coordinator reports `overlayDirty = true`.
 *
 * Outputs only describe density-grid impact — the store is updated
 * directly (behind `useSrmtDiagnosticStore.getState()`).
 */
export class WheelerDeWittSrmtCoordinator {
  private workerState: SrmtWorkerState = createSrmtWorkerState()
  private lastComputeHash: string | null = null
  private lastRenderHash: string | null = null
  private lastEnabled = false
  /**
   * Counter paired with `SrmtWorkerState.resultGeneration`. When the
   * worker posts a new result the worker state bumps its counter; the
   * coordinator's paired counter tracks the last generation that was
   * packed into the density texture.
   */
  private lastResultGeneration = 0

  /**
   * Update the coordinator with the current config and solver output.
   * Returns the SRMT overlay payload for the density packer plus a
   * dirty flag indicating whether the packer needs to re-run.
   *
   * Handles the five transitions listed in the class docstring.
   */
  update(
    config: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput | null,
    solverDirty: boolean
  ): SrmtTick {
    const enabled = !!config.srmtEnabled
    const computeHash = computeWdwSrmtComputeHash(config)
    const renderHash = computeWdwSrmtRenderHash(config)
    const justToggledOff = !enabled && this.lastEnabled
    const justToggledOn = enabled && !this.lastEnabled
    const computeChanged = computeHash !== this.lastComputeHash
    const renderChanged = renderHash !== this.lastRenderHash

    // Transition 1+2: compute re-queue.
    const computeDirty = enabled && (justToggledOn || computeChanged || solverDirty)
    if (computeDirty && solverOutput) {
      this.queueAllClocks(config, solverOutput)
      this.lastComputeHash = computeHash
      this.lastRenderHash = renderHash
    } else if (justToggledOff) {
      // Transition 4: disable.
      cancelSrmtCompute(this.workerState)
      this.lastComputeHash = null
      this.lastRenderHash = null
      this.lastResultGeneration = 0
      useSrmtDiagnosticStore.getState().clear()
    } else if (enabled && renderChanged) {
      // Transition 3: render-only delta.
      this.syncStoreForSelectedClock(config.srmtClock)
      this.lastRenderHash = renderHash
    }

    // Transition 5: worker reply arrived since the last tick.
    const resultArrived = enabled && this.workerState.resultGeneration !== this.lastResultGeneration
    if (resultArrived) {
      this.syncStoreForSelectedClock(config.srmtClock)
    }

    const overlayDirty =
      computeDirty || justToggledOff || (enabled && renderChanged) || resultArrived
    const overlay = enabled ? this.buildOverlay(config, solverOutput) : null

    this.lastEnabled = enabled
    // Advance the paired generation counter after this tick — written
    // unconditionally so the next frame sees no drift even when SRMT is
    // disabled (the worker state is zeroed on cancel, so this just
    // re-affirms the 0 baseline).
    this.lastResultGeneration = this.workerState.resultGeneration

    return { overlayDirty, overlay }
  }

  /**
   * Build the SRMT overlay payload for the currently-selected clock.
   * Returns `null` when the selected clock has no cached result yet
   * (the density packer treats `null` as "no overlay").
   */
  private buildOverlay(
    config: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput | null
  ): WdwSrmtOverlay | null {
    if (!solverOutput) return null
    const cache = this.workerState.resultsByClock[config.srmtClock]
    if (!cache) return null
    return {
      sliceK: cache.result.sliceK,
      slicePlane: cache.result.slicePlane,
      intensity: config.srmtHeatmapIntensity,
      cutIndex: cache.cutIndex,
      clockAxisLen: clockAxisLenFor(config.srmtClock, solverOutput.gridSize),
      Nphi: solverOutput.gridSize[1],
    }
  }

  /**
   * Queue all three SRMT clocks on the worker with the currently
   * selected clock at the head of the queue — see
   * {@link queueSrmtCompute} for the queue semantics.
   */
  private queueAllClocks(
    config: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput
  ): void {
    const rankCap = Math.max(8, Math.min(256, Math.round(config.srmtRankCap)))
    const hash = computeWdwSrmtComputeHash(config)
    const argsByClock: Record<SrmtClock, SrmtDispatchArgs> = {
      a: this.buildDispatchArgs(config, solverOutput, 'a', rankCap, hash),
      phi1: this.buildDispatchArgs(config, solverOutput, 'phi1', rankCap, hash),
      phi2: this.buildDispatchArgs(config, solverOutput, 'phi2', rankCap, hash),
    }
    queueSrmtCompute(this.workerState, argsByClock, config.srmtClock)
  }

  /** Build the per-clock dispatch arguments for the queue. */
  private buildDispatchArgs(
    config: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput,
    clock: SrmtClock,
    rankCap: number,
    hash: string
  ): SrmtDispatchArgs {
    return {
      output: solverOutput,
      clock,
      cutIndex: this.resolveSrmtCutIndex(config, solverOutput, clock),
      rankCap,
      inflatonMass: config.inflatonMass,
      cosmologicalConstant: config.cosmologicalConstant,
      hash,
    }
  }

  /**
   * Clamp `srmtCutNormalized * (clockAxisLen - 1)` into the interior
   * `[1, clockAxisLen - 2]` required by `computeSrmtDiagnostic`
   * (cutIndex must be strictly inside the axis).
   */
  private resolveSrmtCutIndex(
    config: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput,
    clock: SrmtClock
  ): number {
    const clockLen = clockAxisLenFor(clock, solverOutput.gridSize)
    if (clockLen < 3) return 1
    const raw = Math.round(config.srmtCutNormalized * (clockLen - 1))
    return Math.max(1, Math.min(clockLen - 2, raw))
  }

  /**
   * Publish the store snapshot + quality record for the selected clock.
   * When the selected clock has not completed yet, leaves the store
   * alone so the UI can continue showing whatever previously completed
   * data is available.
   */
  private syncStoreForSelectedClock(selectedClock: SrmtClock): void {
    const cache = this.workerState.resultsByClock[selectedClock]
    if (!cache) return
    const quality = qualityFromResults(this.workerState.resultsByClock)
    useSrmtDiagnosticStore.getState().setDiagnostic(cache.snapshot, quality)
  }

  /**
   * Hand the worker state across to a successor coordinator during a
   * strategy warm swap. The source is reset to a fresh idle state so a
   * late dispose on the source cannot terminate the live worker.
   */
  adoptFrom(source: WheelerDeWittSrmtCoordinator): void {
    // Transfer worker-state ownership.
    disposeSrmtWorker(this.workerState)
    this.workerState = source.workerState
    this.lastComputeHash = source.lastComputeHash
    this.lastRenderHash = source.lastRenderHash
    this.lastEnabled = source.lastEnabled
    this.lastResultGeneration = source.lastResultGeneration
    source.workerState = createSrmtWorkerState()
    source.lastComputeHash = null
    source.lastRenderHash = null
    source.lastEnabled = false
    source.lastResultGeneration = 0
  }

  /**
   * Terminate the worker, reset all state. Safe to call multiple times.
   * Clears the SRMT diagnostic store so any mounted UI reverts to the
   * "no diagnostic" state rather than showing stale readings.
   */
  dispose(): void {
    disposeSrmtWorker(this.workerState)
    this.lastComputeHash = null
    this.lastRenderHash = null
    this.lastEnabled = false
    this.lastResultGeneration = 0
    useSrmtDiagnosticStore.getState().clear()
  }

  /** Expose the canonical clock order for tests + debugging. */
  static readonly SRMT_CLOCKS = SRMT_CLOCKS
}
