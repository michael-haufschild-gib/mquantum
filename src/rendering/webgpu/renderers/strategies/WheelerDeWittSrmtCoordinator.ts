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
import { useSrmtDiagnosticStore } from '@/stores/diagnostics/srmtDiagnosticStore'

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
 * Clamp the user-facing `srmtRankCap` to the integer range the worker
 * actually honours. Kept as a shared helper so the compute hash and the
 * per-dispatch rank cap stay in lock-step — otherwise values like `7`,
 * `7.4`, and `8` all collapse to a worker rank cap of `8` but each
 * produce a different raw hash, invalidating the whole SRMT batch on
 * innocuous URL/store churn.
 */
export function normalizeSrmtRankCap(rankCap: number): number {
  return Math.max(8, Math.min(256, Math.round(rankCap)))
}

/**
 * Pure form of {@link WheelerDeWittSrmtCoordinator.resolveSrmtCutIndex}
 * used by the compute-hash to match what the worker actually consumes.
 * Maps a normalized cut position onto the interior index range
 * `[1, clockLen - 2]` required by `computeSrmtDiagnostic`. Returns `1`
 * for degenerate axes (`clockLen < 3`).
 */
export function resolveSrmtCutIndexForLen(srmtCutNormalized: number, clockLen: number): number {
  if (clockLen < 3) return 1
  const raw = Math.round(srmtCutNormalized * (clockLen - 1))
  return Math.max(1, Math.min(clockLen - 2, raw))
}

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
 * When `gridSize` is provided, the cut position is folded in as the
 * resolved *integer* cut indices the worker actually consumes (one per
 * axis length), so sub-pixel slider / URL churn that collapses to the
 * same interior index leaves the hash stable. Without `gridSize`
 * (callers that do not yet have solver output — e.g. unit tests), the
 * raw normalized float is hashed instead.
 *
 * When this hash changes, all three clocks are re-queued on the worker.
 */
export function computeWdwSrmtComputeHash(
  config: WheelerDeWittConfig,
  gridSize?: readonly [number, number, number]
): string {
  // The worker consumes the resolved interior cut index, not the raw
  // `srmtCutNormalized` float. Emit the resolved per-axis indices when
  // we know the grid size so slider/URL changes that don't actually
  // shift any dispatched index keep the hash stable.
  const cutToken = gridSize
    ? `${resolveSrmtCutIndexForLen(config.srmtCutNormalized, gridSize[0])},` +
      `${resolveSrmtCutIndexForLen(config.srmtCutNormalized, gridSize[1])}`
    : config.srmtCutNormalized.toFixed(4)
  return [
    config.srmtEnabled ? 1 : 0,
    computeWdwConfigHash(config),
    cutToken,
    normalizeSrmtRankCap(config.srmtRankCap),
  ].join('|')
}

/**
 * Hash of fields that affect the SRMT RENDER-TIME overlay. Embeds the
 * compute hash plus the clock selection and heatmap intensity. When
 * this hash changes but {@link computeWdwSrmtComputeHash} does not, the
 * strategy swaps which cached per-clock result drives the panel snapshot
 * + density texture without re-dispatching the worker.
 */
export function computeWdwSrmtRenderHash(
  config: WheelerDeWittConfig,
  gridSize?: readonly [number, number, number]
): string {
  return [
    computeWdwSrmtComputeHash(config, gridSize),
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
   * packed into the density texture. Used to trigger store syncs on ANY
   * reply (so the cross-clock quality table fills in as non-selected
   * replies arrive).
   */
  private lastResultGeneration = 0
  /**
   * Generation of the selected-clock cache entry that was last packed
   * into the density texture. Repacks are gated on THIS counter rather
   * than the batch-wide one so replies for non-selected clocks do not
   * trigger redundant full-grid repacks.
   */
  private lastSelectedClockGeneration = 0
  /** Last non-null overlay — reused when the selected clock is still pending. */
  private lastOverlay: WdwSrmtOverlay | null = null
  /**
   * True when this coordinator still owns the global
   * {@link useSrmtDiagnosticStore}. Flipped to `false` on the source side
   * of {@link adoptFrom} so a late `dispose()` cannot wipe the live UI
   * after worker-state ownership has moved to a successor.
   */
  private ownsDiagnosticStore = true

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
    const gridSize = solverOutput?.gridSize
    const computeHash = computeWdwSrmtComputeHash(config, gridSize)
    const renderHash = computeWdwSrmtRenderHash(config, gridSize)
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
      this.lastSelectedClockGeneration = 0
      useSrmtDiagnosticStore.getState().clear()
    } else if (enabled && renderChanged) {
      // Transition 3: render-only delta.
      this.syncStoreForSelectedClock(config.srmtClock)
      this.lastRenderHash = renderHash
    }

    // Transition 5a: any worker reply arrived since the last tick →
    // refresh the store so the cross-clock quality table fills in as
    // replies for non-selected clocks land. Harmless when the selected
    // clock has no cache yet (syncStoreForSelectedClock early-returns).
    const resultArrived = enabled && this.workerState.resultGeneration !== this.lastResultGeneration
    if (resultArrived) {
      this.syncStoreForSelectedClock(config.srmtClock)
    }

    // Transition 5b: density repacks are expensive, so gate them on the
    // SELECTED clock's per-entry generation — not the batch-wide counter.
    // Replies for the other two clocks update the quality table but must
    // not force a full-grid repack.
    const selectedClockGeneration =
      this.workerState.resultsByClock[config.srmtClock]?.generation ?? 0
    const hasSelectedClockResult =
      enabled && this.workerState.resultsByClock[config.srmtClock] !== null
    // Only treat the generation delta as a meaningful repack trigger once
    // the newly selected clock actually has a cached result. Switching
    // from a completed clock to one that is still pending otherwise
    // drags `selectedClockGeneration` down to 0 and forces a full repack
    // of the previous (re-used) overlay.
    const selectedClockResultChanged =
      hasSelectedClockResult && selectedClockGeneration !== this.lastSelectedClockGeneration
    // Skip repacks that would clear the overlay mid-dispatch: on a
    // render-only clock switch the newly selected clock may still be
    // pending, and we prefer to keep the prior snapshot visible until
    // its reply lands.
    const renderDirtyGated = enabled && renderChanged && hasSelectedClockResult
    const nextOverlay = enabled ? this.buildOverlay(config, solverOutput) : null
    // Retain the last non-null overlay ONLY for render-only clock switches
    // where the newly selected clock is still pending — we prefer holding
    // the prior snapshot a few frames over a black gap. After a compute
    // invalidation (`computeDirty`) the cache was flushed and `lastOverlay`
    // reflects the PREVIOUS solver/cut/rank output; reusing it would repaint
    // the density texture with stale physics for the whole worker latency.
    const canReusePreviousOverlay =
      enabled && renderChanged && !computeDirty && !hasSelectedClockResult
    // Apply the current heatmap intensity to the reused overlay so a
    // render-only intensity change is not silently frozen until the
    // worker reply for the newly selected clock lands.
    const reusedOverlay =
      canReusePreviousOverlay && this.lastOverlay
        ? { ...this.lastOverlay, intensity: config.srmtHeatmapIntensity }
        : null
    const overlayDirty =
      computeDirty ||
      justToggledOff ||
      renderDirtyGated ||
      selectedClockResultChanged ||
      reusedOverlay !== null
    const overlay = enabled ? (nextOverlay ?? reusedOverlay) : null
    if (nextOverlay) {
      this.lastOverlay = nextOverlay
    } else if (reusedOverlay) {
      // Persist the freshly-stamped intensity so subsequent ticks keep
      // the correct alpha rather than reverting to the pre-change value.
      this.lastOverlay = reusedOverlay
    } else if (!enabled || justToggledOff || computeDirty) {
      // Drop the stale overlay on compute invalidation so downstream frames
      // don't resurrect it via `lastOverlay` the next time renderChanged fires.
      this.lastOverlay = null
    }

    this.lastEnabled = enabled
    // Advance the paired generation counters after this tick — written
    // unconditionally so the next frame sees no drift even when SRMT is
    // disabled (the worker state is zeroed on cancel, so this just
    // re-affirms the 0 baseline).
    this.lastResultGeneration = this.workerState.resultGeneration
    this.lastSelectedClockGeneration = selectedClockGeneration

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
    const rankCap = normalizeSrmtRankCap(config.srmtRankCap)
    const hash = computeWdwSrmtComputeHash(config, solverOutput.gridSize)
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
      inflatonMassAsymmetry: config.inflatonMassAsymmetry,
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
    return resolveSrmtCutIndexForLen(config.srmtCutNormalized, clockLen)
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
    // Transfer worker-state ownership. Successor's own (fresh, idle)
    // worker state is torn down with `skipStoreMutation` so the global
    // `srmtComputing` flag is preserved for the live worker we're about
    // to adopt from `source`.
    disposeSrmtWorker(this.workerState, { skipStoreMutation: true })
    this.workerState = source.workerState
    this.lastComputeHash = source.lastComputeHash
    this.lastRenderHash = source.lastRenderHash
    this.lastEnabled = source.lastEnabled
    this.lastResultGeneration = source.lastResultGeneration
    this.lastSelectedClockGeneration = source.lastSelectedClockGeneration
    this.lastOverlay = source.lastOverlay
    // Move diagnostic-store ownership too: after adoption the successor
    // drives the global SRMT store, and `source.dispose()` must not wipe
    // the live panel.
    this.ownsDiagnosticStore = true
    source.ownsDiagnosticStore = false
    source.workerState = createSrmtWorkerState()
    source.lastComputeHash = null
    source.lastRenderHash = null
    source.lastEnabled = false
    source.lastResultGeneration = 0
    source.lastSelectedClockGeneration = 0
    source.lastOverlay = null
  }

  /**
   * Terminate the worker, reset all state. Safe to call multiple times.
   * Clears the SRMT diagnostic store so any mounted UI reverts to the
   * "no diagnostic" state rather than showing stale readings.
   */
  dispose(): void {
    // After `adoptFrom`, this coordinator is detached: the worker state
    // is fresh+idle (no live worker) and a successor owns the global
    // store. Skip store mutation in that case so we don't clear the
    // successor's live `srmtComputing` flag or its readings.
    disposeSrmtWorker(this.workerState, { skipStoreMutation: !this.ownsDiagnosticStore })
    this.lastComputeHash = null
    this.lastRenderHash = null
    this.lastEnabled = false
    this.lastResultGeneration = 0
    this.lastSelectedClockGeneration = 0
    this.lastOverlay = null
    if (this.ownsDiagnosticStore) {
      useSrmtDiagnosticStore.getState().clear()
    }
  }

  /** Expose the canonical clock order for tests + debugging. */
  static readonly SRMT_CLOCKS = SRMT_CLOCKS
}
