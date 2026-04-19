/**
 * SRMT parameter-sweep store.
 *
 * Holds the state of a running or completed SRMT sweep: config snapshot,
 * per-point results streamed from the worker, turning-point landmarks,
 * and the sweep status machine (`idle | running | complete | error`).
 * Mirrors the pattern established by `andersonSweepStore`, with
 * streaming per-point appends instead of a single completion callback.
 *
 * ## Ownership
 *
 * The store is singleton-coupled to the active
 * {@link WheelerDeWittSrmtSweepCoordinator}. When the Wheeler–DeWitt
 * strategy is disposed (mode change, renderer teardown) the coordinator
 * aborts the sweep and the store resets to `idle`. When a sweep is
 * running and the user edits any physics parameter that would
 * invalidate the coordinator's config snapshot, the coordinator aborts
 * the sweep and calls {@link failSweep} with a stale-config message.
 *
 * @module stores/srmtSweepStore
 */

import { create } from 'zustand'

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock } from '@/lib/physics/srmt'
import type {
  SrmtSweepConfig,
  SrmtSweepLandmark,
  SrmtSweepPoint,
} from '@/lib/physics/srmt/sweepTypes'

import type { SweepStatus } from './utils/sweepUtils'

/**
 *
 */
export type SrmtSweepStatus = SweepStatus | 'error'

/**
 * Pending sweep configuration queued by URL deserialization. The UI /
 * sweep section picks it up once the Wheeler–DeWitt strategy has
 * mounted + produced its first solver output, then clears the pending
 * slot. Partial fields are allowed — the UI merges them over the
 * default sweep config at dispatch time.
 */
export interface PendingSrmtSweep {
  kind: 'cut' | 'mass' | 'lambda' | 'bc' | 'phiRef' | 'rankCap' | 'phiExtent'
  points?: number
  sweepMin?: number
  sweepMax?: number
  phiRef?: number
  cutAnchor?: number
}

/** Public shape of the SRMT sweep store. */
export interface SrmtSweepState {
  /** Current sweep status. */
  status: SrmtSweepStatus
  /** Config used to start the current sweep (null when idle). */
  config: SrmtSweepConfig | null
  /**
   * Wheeler–DeWitt config snapshot at sweep start. Used to detect
   * staleness when the live config drifts — the UI shows a banner and
   * the coordinator aborts to avoid mixing pre- and post-edit results.
   */
  wdwConfigSnapshot: WheelerDeWittConfig | null
  /** Index of the most recent progress point (`-1` until the first arrives). */
  lastPointIndex: number
  /** Total number of sweep points expected (driven by config). */
  totalPoints: number
  /** Index of the current `solveStart` step (mass/BC sweeps only). */
  currentSolveIndex: number
  /** Wall-clock ms at `startSweep`. 0 when idle. */
  startedAt: number
  /** Per-point results (streamed via {@link appendPoint}). */
  points: SrmtSweepPoint[]
  /** Landmark overlays per clock, computed once at sweep start. */
  landmarks: SrmtSweepLandmark[]
  /** Last error message when `status === 'error'`; `null` otherwise. */
  errorMessage: string | null
  /**
   * Pending sweep queued by URL deserialization. `null` when none is
   * waiting. Consumers pop it via {@link consumePendingSweep} exactly
   * once and are responsible for dispatching.
   */
  pendingSweep: PendingSrmtSweep | null
  /** Monotonic update counter for React consumers. */
  version: number

  /** Transition idle → running. Clears prior results. */
  startSweep: (
    config: SrmtSweepConfig,
    wdwConfigSnapshot: WheelerDeWittConfig,
    landmarks: SrmtSweepLandmark[]
  ) => void
  /** Abort a running sweep (returns to idle, keeps results around). */
  abortSweep: () => void
  /** Append a progress point (must be called in ascending `index` order). */
  appendPoint: (point: SrmtSweepPoint) => void
  /** Record that a per-point solver re-run is starting (mass/bc). */
  setSolveStart: (index: number) => void
  /** Finalise the sweep. */
  completeSweep: () => void
  /** Mark the sweep as errored. */
  failSweep: (message: string) => void
  /** Queue a sweep configuration for auto-dispatch (URL load). */
  setPendingSweep: (pending: PendingSrmtSweep | null) => void
  /** Atomically retrieve + clear the pending sweep. */
  consumePendingSweep: () => PendingSrmtSweep | null
  /** Reset everything back to idle. */
  reset: () => void
}

function totalPointsFor(config: SrmtSweepConfig): number {
  switch (config.kind) {
    case 'cut':
      return Math.max(1, Math.min(64, Math.floor(config.points)))
    case 'mass':
    case 'lambda':
    case 'phiRef':
      return Math.max(1, Math.min(21, Math.floor(config.points)))
    case 'rankCap':
      return Math.max(1, Math.min(32, Math.floor(config.points)))
    case 'phiExtent':
      return Math.max(1, Math.min(13, Math.floor(config.points)))
    case 'bc':
      return 3
  }
}

/** Factory for the default idle state. */
function idleState(): Omit<
  SrmtSweepState,
  | 'startSweep'
  | 'abortSweep'
  | 'appendPoint'
  | 'setSolveStart'
  | 'completeSweep'
  | 'failSweep'
  | 'setPendingSweep'
  | 'consumePendingSweep'
  | 'reset'
  | 'version'
> {
  return {
    status: 'idle',
    config: null,
    wdwConfigSnapshot: null,
    lastPointIndex: -1,
    totalPoints: 0,
    currentSolveIndex: -1,
    startedAt: 0,
    points: [],
    landmarks: [],
    errorMessage: null,
    pendingSweep: null,
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * Summarise which clocks completed in a sweep point's quality record,
 * producing a stable key for presentation/telemetry. Exported for
 * consumers that want to detect incomplete per-clock data without
 * re-iterating the full `quality` map.
 */
export function clocksCompletedIn(point: SrmtSweepPoint): readonly SrmtClock[] {
  const out: SrmtClock[] = []
  if (Number.isFinite(point.quality.a ?? NaN)) out.push('a')
  if (Number.isFinite(point.quality.phi1 ?? NaN)) out.push('phi1')
  if (Number.isFinite(point.quality.phi2 ?? NaN)) out.push('phi2')
  return out
}

/** Zustand store for the SRMT sweep experiment. */
export const useSrmtSweepStore = create<SrmtSweepState>((set) => ({
  ...idleState(),
  version: 0,

  startSweep: (config, wdwConfigSnapshot, landmarks) => {
    set((s) => ({
      ...idleState(),
      status: 'running',
      config,
      wdwConfigSnapshot,
      totalPoints: totalPointsFor(config),
      startedAt: nowMs(),
      landmarks,
      version: s.version + 1,
    }))
  },

  abortSweep: () => {
    set((s) => {
      if (s.status !== 'running') return s
      // Preserve accumulated points so the user can still inspect partial
      // results after aborting. Clear transient fields (errorMessage,
      // currentSolveIndex, config, wdwConfigSnapshot) so a subsequent
      // startSweep doesn't carry stale state, and so an error banner from
      // before cannot resurface.
      return {
        status: 'idle',
        errorMessage: null,
        currentSolveIndex: -1,
        config: null,
        wdwConfigSnapshot: null,
        version: s.version + 1,
      }
    })
  },

  appendPoint: (point) => {
    set((s) => {
      if (s.status !== 'running') return s
      if (point.index !== s.points.length) {
        // Caller violated ordering — drop silently. (Worker dispatcher
        // guarantees sequential delivery, so this branch is defensive.)
        return s
      }
      return {
        points: [...s.points, point],
        lastPointIndex: point.index,
        version: s.version + 1,
      }
    })
  },

  setSolveStart: (index) => {
    set((s) => {
      if (s.status !== 'running') return s
      if (s.currentSolveIndex === index) return s
      return { currentSolveIndex: index, version: s.version + 1 }
    })
  },

  completeSweep: () => {
    set((s) => {
      if (s.status !== 'running') return s
      return { status: 'complete', version: s.version + 1 }
    })
  },

  failSweep: (message) => {
    // Only transition on an in-flight sweep. A worker error that arrives
    // after the user has aborted (→ 'idle') or after 'complete' must NOT
    // flip the banner back to 'error' — it would surface a stale message.
    set((s) => {
      if (s.status !== 'running') return s
      return {
        status: 'error',
        errorMessage: message,
        version: s.version + 1,
      }
    })
  },

  setPendingSweep: (pending) => {
    set((s) => ({ pendingSweep: pending, version: s.version + 1 }))
  },

  consumePendingSweep: () => {
    // Atomic read-and-clear: no other consumer should see the same
    // pending sweep twice.
    let out: PendingSrmtSweep | null = null
    set((s) => {
      out = s.pendingSweep
      if (!s.pendingSweep) return s
      return { pendingSweep: null, version: s.version + 1 }
    })
    return out
  },

  reset: () => {
    // Preserve the pendingSweep slot: it represents user intent (URL load
    // or Start-button queue) that has not yet been dispatched. A React
    // StrictMode cleanup or a mid-lifecycle strategy rebuild would
    // otherwise clobber a pendingSweep that the URL loader set moments
    // earlier but the coordinator has not yet consumed.
    set((s) => ({
      ...idleState(),
      pendingSweep: s.pendingSweep,
      version: s.version + 1,
    }))
  },
}))
