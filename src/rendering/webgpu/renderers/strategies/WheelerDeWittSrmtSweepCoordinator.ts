/**
 * Coordinator for the SRMT parameter-sweep experiment.
 *
 * Owns the Web Worker hosting {@link handleSrmtSweepRequest} and the
 * main-thread plumbing that converts worker messages into Zustand store
 * mutations. Instantiated once by {@link WheelerDeWittStrategy} and
 * driven each frame through {@link update}, which:
 *
 *  - Aborts an in-flight sweep when the underlying WdW config hash
 *    changes (the user edited a physics parameter; sweep results would
 *    silently mix old and new physics).
 *  - Aborts on mode swap / adoption (no adoption path: a sweep is a
 *    one-shot batch job; if the strategy is replaced, its results are
 *    meaningless).
 *
 * Callers initiate a sweep via {@link startSweep}. The coordinator
 * builds the worker request (transferring the solver output for
 * `kind='cut'`, omitting it for mass/BC so the worker re-solves),
 * wires progress → store appends, done → store complete, error → store
 * fail.
 *
 * ## Differences from {@link WheelerDeWittSrmtCoordinator}
 *
 * The diagnostic coordinator has complex state (cross-clock queue,
 * compute/render hash gating, adoption across warm swaps) because it
 * drives a live density-grid overlay. The sweep coordinator is
 * deliberately narrower: one sweep at a time, no overlay coupling, no
 * adoption — swap = abort.
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittSrmtSweepCoordinator
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import { logger } from '@/lib/logger'
import type { SrmtPhysicsContext } from '@/lib/physics/srmt'
import type {
  SrmtSweepRequest,
  SrmtSweepResponse,
  SrmtSweepSolverSnapshot,
} from '@/lib/physics/srmt/srmtSweep.worker'
import type {
  SrmtSweepConfig,
  SrmtSweepKind,
  SrmtSweepLandmark,
} from '@/lib/physics/srmt/sweepTypes'
import {
  computeCutLandmark,
  landmarkInputsFromConfig,
} from '@/lib/physics/srmt/turningPointLandmark'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import type { PendingSrmtSweep } from '@/stores/srmtSweepStore'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

import { computeWdwConfigHash } from './WheelerDeWittPhysicsCache'

/**
 * Worker-factory indirection so tests can inject a fake Worker without
 * spinning up the real Vite bundler `new Worker(new URL(...))` path.
 */
export type SweepWorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: Worker['onmessage']
  onerror: Worker['onerror']
}

/**
 *
 */
export type SweepWorkerFactory = () => SweepWorkerLike

/** Production worker factory. */
function defaultSweepWorkerFactory(): SweepWorkerLike {
  return new Worker(new URL('../../../../lib/physics/srmt/srmtSweep.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/** Inputs to start a sweep. */
export interface StartSweepInputs {
  config: SrmtSweepConfig
  wdwConfig: WheelerDeWittConfig
  physics: SrmtPhysicsContext
  landmarks: SrmtSweepLandmark[]
  /** Required only when `config.kind === 'cut'`. */
  solverOutput?: WheelerDeWittSolverOutput
}

/**
 *
 */
export class WheelerDeWittSrmtSweepCoordinator {
  private worker: SweepWorkerLike | null = null
  private epoch = 0
  /** Config hash at the start of the in-flight sweep, or `null` when idle. */
  private sweepConfigHash: string | null = null
  /** Disposed coordinators must no-op on further messages. */
  private disposed = false
  private readonly workerFactory: SweepWorkerFactory

  constructor(workerFactory: SweepWorkerFactory = defaultSweepWorkerFactory) {
    this.workerFactory = workerFactory
  }

  /**
   * Called each frame with the live WdW config + solver-cache state.
   * Aborts an in-flight sweep when the underlying physics (solver
   * output) has changed — the sweep snapshot is stale.
   */
  update(wdwConfig: WheelerDeWittConfig, solverDirty: boolean): void {
    if (this.disposed) return
    const store = useSrmtSweepStore.getState()
    if (store.status !== 'running') return
    if (!this.sweepConfigHash) return
    const currentHash = computeWdwConfigHash(wdwConfig)
    if (currentHash !== this.sweepConfigHash || solverDirty) {
      this.cancelAndFail('Sweep aborted: Wheeler–DeWitt configuration changed mid-sweep')
    }
  }

  /**
   * Begin a new sweep. Aborts any in-flight sweep first (epoch bump +
   * cancel message, defensive). Returns the epoch assigned to the new
   * sweep so callers can correlate telemetry.
   */
  startSweep(inputs: StartSweepInputs): number {
    if (this.disposed) {
      throw new Error('WheelerDeWittSrmtSweepCoordinator.startSweep called after dispose')
    }
    // Cancel any prior in-flight sweep before bumping epoch.
    this.sendCancelBestEffort()
    this.epoch += 1
    const epoch = this.epoch

    const worker = this.ensureWorker()
    this.sweepConfigHash = computeWdwConfigHash(inputs.wdwConfig)
    useSrmtSweepStore.getState().startSweep(inputs.config, inputs.wdwConfig, inputs.landmarks)

    const solverSnapshot = inputs.solverOutput ? copySolverSnapshot(inputs.solverOutput) : undefined
    const request: SrmtSweepRequest = {
      type: 'start',
      epoch,
      config: inputs.config,
      physics: inputs.physics,
      wdwConfig: inputs.wdwConfig,
      landmarks: inputs.landmarks,
      solverOutput: solverSnapshot,
    }
    const transfer: Transferable[] = solverSnapshot
      ? [
          solverSnapshot.chi.buffer as Transferable,
          solverSnapshot.lorentzianMask.buffer as Transferable,
        ]
      : []
    try {
      worker.postMessage(request, transfer)
    } catch (err) {
      logger.warn('[SRMT sweep] failed to post start message:', err)
      useSrmtSweepStore.getState().failSweep(err instanceof Error ? err.message : String(err))
      this.sweepConfigHash = null
    }
    return epoch
  }

  /**
   * Abort the in-flight sweep (if any) without tearing down the worker.
   * The store transitions from `running → idle`.
   */
  abortSweep(): void {
    if (this.disposed) return
    // Bump the epoch so any in-flight same-epoch worker messages that
    // arrive after this call are filtered out by the onmessage guard.
    // Without this, a worker that was already inside a synchronous
    // sweep could repopulate the store with `progress` / `done` after
    // the user has already aborted.
    const cancelledEpoch = this.epoch
    this.epoch += 1
    this.sendCancelBestEffort(cancelledEpoch)
    this.sweepConfigHash = null
    useSrmtSweepStore.getState().abortSweep()
  }

  /**
   * Tear down the worker. After disposal the coordinator no-ops on
   * every call. Callers should construct a new instance after dispose.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.sendCancelBestEffort()
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.terminate()
      this.worker = null
    }
    this.sweepConfigHash = null
    // Sweep is strategy-scoped; resetting the store on strategy dispose
    // prevents the UI from showing stale points after the user switches
    // away from Wheeler–DeWitt.
    useSrmtSweepStore.getState().reset()
  }

  /**
   * Adoption is intentionally not supported. A warm-swap means a fresh
   * strategy instance is taking over — the sweep state does NOT
   * transfer. Source cancels its in-flight sweep; successor retains its
   * own fresh worker; source cleans up its own worker on `dispose`.
   */
  adoptFrom(source: WheelerDeWittSrmtSweepCoordinator): void {
    source.abortSweep()
  }

  /** Exposed for tests so they can exercise the wire protocol. */
  getActiveEpoch(): number {
    return this.epoch
  }

  /**
   * Consume a pending sweep queued by URL deserialization or a UI
   * action, if the current strategy has produced a solver output the
   * sweep can anchor to. No-op when nothing is pending or when the
   * solver has not yet produced its first output.
   */
  maybeDispatchPending(
    wdwConfig: WheelerDeWittConfig,
    solverOutput: WheelerDeWittSolverOutput | null
  ): void {
    if (this.disposed) return
    if (!solverOutput) return
    const store = useSrmtSweepStore.getState()
    if (store.status === 'running') return
    const pending = store.consumePendingSweep()
    if (!pending) return
    const config = materialiseSweepConfig(pending, wdwConfig)
    const landmarks = computeLandmarksForSweep(config, wdwConfig)
    this.startSweep({
      config,
      wdwConfig,
      physics: {
        inflatonMass: wdwConfig.inflatonMass,
        cosmologicalConstant: wdwConfig.cosmologicalConstant,
      },
      landmarks,
      solverOutput: sweepReusesSolver(config.kind) ? solverOutput : undefined,
    })
  }

  private ensureWorker(): SweepWorkerLike {
    if (this.worker) return this.worker
    const worker = this.workerFactory()
    worker.onmessage = (e: MessageEvent<SrmtSweepResponse>) => {
      if (this.disposed) return
      const msg = e.data
      if (msg.epoch !== this.epoch) return
      const store = useSrmtSweepStore.getState()
      switch (msg.type) {
        case 'progress':
          store.appendPoint(msg.point)
          break
        case 'solveStart':
          store.setSolveStart(msg.index)
          break
        case 'done':
          store.completeSweep()
          this.sweepConfigHash = null
          break
        case 'error':
          store.failSweep(msg.message)
          this.sweepConfigHash = null
          break
      }
    }
    worker.onerror = (ev) => {
      if (this.disposed) return
      logger.warn('[SRMT sweep] worker onerror:', ev)
      useSrmtSweepStore.getState().failSweep('Sweep worker crashed')
      this.sweepConfigHash = null
    }
    this.worker = worker
    return worker
  }

  private sendCancelBestEffort(epoch: number = this.epoch): void {
    if (!this.worker) return
    try {
      this.worker.postMessage({ type: 'cancel', epoch })
    } catch {
      // Swallowing is correct — the worker may already be terminating.
    }
  }

  private cancelAndFail(message: string): void {
    // Same epoch-invalidation story as `abortSweep` — bump so stale
    // same-epoch worker messages cannot flip the store back to
    // `complete` after we've already transitioned to `error`.
    const cancelledEpoch = this.epoch
    this.epoch += 1
    this.sendCancelBestEffort(cancelledEpoch)
    this.sweepConfigHash = null
    useSrmtSweepStore.getState().failSweep(message)
  }
}

/**
 * Merge a pending sweep (possibly partial, as URL params may only
 * carry the kind) with sensible per-kind defaults drawn from the live
 * Wheeler–DeWitt config.
 */
export function materialiseSweepConfig(
  pending: PendingSrmtSweep,
  wdwConfig: WheelerDeWittConfig
): SrmtSweepConfig {
  const clocks = ['a', 'phi1', 'phi2'] as const
  const defaultPhiRef = (wdwConfig.phiExtent || 1) / 2
  const common = {
    clocks,
    rankCap: wdwConfig.srmtRankCap,
    cutNormalized: pending.cutAnchor ?? wdwConfig.srmtCutNormalized,
    phiRef: pending.phiRef ?? defaultPhiRef,
  }
  switch (pending.kind) {
    case 'cut':
      return {
        ...common,
        kind: 'cut',
        points: pending.points ?? 17,
        sweepMin: pending.sweepMin ?? 0.1,
        sweepMax: pending.sweepMax ?? 0.9,
      }
    case 'mass':
      return {
        ...common,
        kind: 'mass',
        points: pending.points ?? 9,
        sweepMin: pending.sweepMin ?? 0.1,
        sweepMax: pending.sweepMax ?? 1.5,
      }
    case 'lambda':
      return {
        ...common,
        kind: 'lambda',
        points: pending.points ?? 9,
        // Default spans the Λ < 0 (AdS) → Λ > 0 (dS) transition so the
        // sweep captures the regime change in one shot.
        sweepMin: pending.sweepMin ?? -0.5,
        sweepMax: pending.sweepMax ?? 0.5,
      }
    case 'bc':
      return {
        ...common,
        kind: 'bc',
        points: 3,
        sweepMin: 0,
        sweepMax: 2,
      }
    case 'phiRef': {
      const phiExt = wdwConfig.phiExtent
      return {
        ...common,
        kind: 'phiRef',
        points: pending.points ?? 11,
        // `phiRef` sweep range spans roughly (0, phiExtent); the landmark
        // is symmetric in sign so 0 → phiExtent is enough.
        sweepMin: pending.sweepMin ?? 0.05,
        sweepMax: pending.sweepMax ?? Math.max(0.05, phiExt - 0.05),
      }
    }
    case 'rankCap':
      return {
        ...common,
        kind: 'rankCap',
        points: pending.points ?? 9,
        // rankCap sweep reports the span [8, 128] by default; driver
        // rounds + dedups, so 9 points across this range yields the
        // 8,16,24,…,128 cadence that fits on the plot.
        sweepMin: pending.sweepMin ?? 8,
        sweepMax: pending.sweepMax ?? 128,
      }
    case 'phiExtent':
      return {
        ...common,
        kind: 'phiExtent',
        points: pending.points ?? 5,
        // Default range sits either side of the DEFAULT_WHEELER_DEWITT_CONFIG
        // `phiExtent=2`. CFL tightens as phiExtent shrinks (smaller dφ),
        // so the lower bound is kept ≥ 1 to stay inside the stability
        // budget on default (aMin, gridNphi).
        sweepMin: pending.sweepMin ?? 1.0,
        sweepMax: pending.sweepMax ?? 3.0,
      }
  }
}

/**
 * Build the per-clock landmark set for the sweep. For cut sweeps we
 * produce one landmark per requested clock; for mass/bc sweeps the
 * anchor cut is fixed so landmarks are not plotted (returned empty).
 */
export function computeLandmarksForSweep(
  config: SrmtSweepConfig,
  wdwConfig: WheelerDeWittConfig
): SrmtSweepLandmark[] {
  // Top-level landmarks only make sense for the `cut` sweep, where a
  // single classical-turning-point coordinate annotates the full plot.
  //   - mass / λ / bc / phiExtent: the landmark moves with the varying
  //     physics; a single top-level landmark would be misleading.
  //   - rankCap: physics is fixed; the fixed-cut landmark applies, but
  //     the plot x-axis is `rankCap`, not a physical coordinate, so a
  //     vertical line is meaningless.
  //   - phiRef: landmark moves per point; the driver writes per-point
  //     `perPointLandmarks` and the top-level array stays empty.
  if (config.kind !== 'cut') return []
  const clocks: readonly ('a' | 'phi1' | 'phi2')[] =
    config.clocks.length > 0
      ? (config.clocks as readonly ('a' | 'phi1' | 'phi2')[])
      : ['a', 'phi1', 'phi2']
  return clocks.map((clock) =>
    computeCutLandmark(
      landmarkInputsFromConfig(wdwConfig, clock, config.phiRef, config.cutNormalized)
    )
  )
}

/**
 * True when the sweep kind reuses the pre-existing WdW solver snapshot
 * (Schmidt is cut-independent) instead of re-solving per sweep point.
 * Cut / phiRef / rankCap satisfy this; mass / λ / bc / phiExtent do not.
 */
function sweepReusesSolver(kind: SrmtSweepConfig['kind']): boolean {
  return kind === 'cut' || kind === 'phiRef' || kind === 'rankCap'
}

// Kind-guard re-export so callers who want to branch on the union keep
// the symbol resolvable.
export type { SrmtSweepKind }

/** Defensive copy of the solver output for transfer to the worker. */
function copySolverSnapshot(output: WheelerDeWittSolverOutput): SrmtSweepSolverSnapshot {
  return {
    chi: new Float32Array(output.chi),
    lorentzianMask: new Uint8Array(output.lorentzianMask),
    gridSize: output.gridSize,
    aMin: output.aMin,
    aMax: output.aMax,
    phiExtent: output.phiExtent,
    maxDensity: output.maxDensity,
  }
}
