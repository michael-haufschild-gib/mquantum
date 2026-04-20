/**
 * SRMT diagnostic Web-Worker dispatcher with cross-clock sequential queue.
 *
 * Architecture: when SRMT is enabled, the diagnostic runs for all three
 * clocks (`a`, `phi1`, `phi2`) back-to-back on a single worker. The
 * dispatcher owns the queue; the worker still processes one request at a
 * time. Sequential execution keeps peak memory bounded and avoids
 * contention on the main thread's worker proxy.
 *
 * The user-selected clock is placed first in the queue so the panel chart
 * and the density-grid overlay (driven by the selected-clock `sliceK`) fill
 * fastest. Non-selected clocks drain afterward to populate the cross-clock
 * quality table.
 *
 * Key pieces of state:
 *  - `result` / `quality` / `cutIndex` collapsed into `resultsByClock` —
 *    indexed by {@link SrmtClock}, each entry holds `{ result, snapshot,
 *    cutIndex }`. Adoption across strategy swaps moves the whole state
 *    object, so all cached clocks survive a warm swap.
 *  - `lastDispatchedHash` is per-clock so the dedup guard operates
 *    independently on each axis.
 *  - `queue` / `selectedClock` fields drive the sequential dispatch.
 *  - Reply handler writes `setClockQuality(replyClock, q)` on every reply
 *    and reserves `setDiagnostic` for the strategy's snapshot-sync path.
 *
 * The strategy synchronises the store snapshot + density-grid overlay by
 * reading `resultsByClock[wdw.srmtClock]` on its next frame. Clock-only
 * toggles (renderHash changes with computeHash stable) must not re-dispatch
 * — they just swap which cached result the packer consumes.
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker
 */

import { logger } from '@/lib/logger'
import type { SrmtClock, SrmtResult } from '@/lib/physics/srmt'
import { findChampionClock } from '@/lib/physics/srmt'
import type {
  SrmtWorkerRequest,
  SrmtWorkerResponse,
} from '@/lib/physics/srmt/srmtDiagnostic.worker'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  type SrmtClockQuality,
  type SrmtSnapshot,
  useSrmtDiagnosticStore,
} from '@/stores/srmtDiagnosticStore'

/** The three SRMT clocks in canonical dispatch order. */
export const SRMT_CLOCKS: readonly SrmtClock[] = ['a', 'phi1', 'phi2']

/**
 * Entry in the worker-state result cache. `snapshot` is the UI-shaped view
 * (chart + chip), `result` is the raw diagnostic (used by the density-grid
 * packer for the `sliceK` overlay), `cutIndex` is echoed from the request,
 * `generation` is the value of {@link SrmtWorkerState.resultGeneration}
 * assigned when this entry was installed (so a consumer can detect a
 * per-clock update without watching the batch-wide counter).
 */
export interface SrmtClockCacheEntry {
  result: SrmtResult
  snapshot: SrmtSnapshot
  cutIndex: number
  generation: number
}

/** Per-clock mapping (`null` until that clock completes). */
export type SrmtResultsByClock = Record<SrmtClock, SrmtClockCacheEntry | null>

/** Per-clock in-flight hash (only one is non-null at a time — sequential queue). */
export type SrmtLastDispatchedHashes = Record<SrmtClock, string | null>

/**
 * Per-clock rankCap from the most recent dispatch. Stored so the reply
 * handler can attach the rankCap to the snapshot it publishes (the worker
 * response doesn't echo rankCap; the dispatcher is the source of truth).
 */
export type SrmtLastDispatchedRankCap = Record<SrmtClock, number>

/**
 * Payload arguments for {@link dispatchSrmtCompute} / the queue — gathered
 * into an object so the strategy doesn't need to pass seven positional
 * parameters. Each queued clock carries its own copy of the input buffers.
 */
export interface SrmtDispatchArgs {
  /** Strategy-owned solver output. Must remain valid for the synchronous copy below. */
  output: WheelerDeWittSolverOutput
  /** Clock axis for this dispatch. */
  clock: SrmtClock
  /** Cut index along the clock axis (must be strictly interior). */
  cutIndex: number
  /** Rank cap echoed into the snapshot. */
  rankCap: number
  /** Inflaton mass `m` for the HJ potential. */
  inflatonMass: number
  /**
   * Per-axis effective-mass ratio `α` on the φ₂ axis. Optional; defaults
   * to `1` (isotropic) when absent. Must match the solver's value.
   */
  inflatonMassAsymmetry?: number
  /** Cosmological constant `Λ` for the HJ potential. */
  cosmologicalConstant: number
  /** Compute hash for this clock's dispatch — deduplicates retries. */
  hash: string
}

/**
 * Mutable dispatcher state shared with {@link WheelerDeWittStrategy}. Moves
 * wholesale across strategy instances during
 * {@link WheelerDeWittStrategy.adoptComputeState}.
 */
export interface SrmtWorkerState {
  worker: Worker | null
  /** Monotonic tag bumped on each dispatch; worker replies echo this. */
  epoch: number
  /** True while a postMessage is awaiting a reply. */
  inFlight: boolean
  /** Set on strategy dispose — suppresses late callbacks. */
  disposed: boolean
  /** Per-clock hash of the last in-flight request. */
  lastDispatchedHash: SrmtLastDispatchedHashes
  /**
   * Per-clock rankCap carried across the dispatch + reply boundary so the
   * reply handler can publish a fully-populated {@link SrmtSnapshot}.
   */
  lastDispatchedRankCap: SrmtLastDispatchedRankCap
  /**
   * Per-clock result cache. A clock's entry is populated when that clock's
   * reply arrives and remains cached until the next cache invalidation
   * (compute-hash change, cancel, dispose).
   */
  resultsByClock: SrmtResultsByClock
  /**
   * Remaining dispatches for the current batch. Head is dispatched when
   * the current in-flight reply arrives (sequential execution).
   */
  queue: SrmtDispatchArgs[]
  /**
   * Clock that was user-selected when the current batch was queued. The
   * queue is ordered with this clock first. The strategy reads `config`
   * directly for real-time selected-clock changes — this field is purely
   * a queue-ordering record.
   */
  selectedClock: SrmtClock | null
  /**
   * Monotonic counter incremented each time the worker's `onmessage`
   * handler installs a fresh cache entry. The strategy's paired counter
   * drives density-texture repacks.
   */
  resultGeneration: number
}

/** Build a fresh per-clock map of `null` entries. */
function createEmptyResultsByClock(): SrmtResultsByClock {
  return { a: null, phi1: null, phi2: null }
}

/** Build a fresh per-clock map of `null` hashes. */
function createEmptyLastDispatchedHash(): SrmtLastDispatchedHashes {
  return { a: null, phi1: null, phi2: null }
}

/** Build a fresh per-clock map of zero rankCaps. */
function createEmptyLastDispatchedRankCap(): SrmtLastDispatchedRankCap {
  return { a: 0, phi1: 0, phi2: 0 }
}

/** Construct an idle SRMT worker state. */
export function createSrmtWorkerState(): SrmtWorkerState {
  return {
    worker: null,
    epoch: 0,
    inFlight: false,
    disposed: false,
    lastDispatchedHash: createEmptyLastDispatchedHash(),
    lastDispatchedRankCap: createEmptyLastDispatchedRankCap(),
    resultsByClock: createEmptyResultsByClock(),
    queue: [],
    selectedClock: null,
    resultGeneration: 0,
  }
}

/**
 * Derive a {@link SrmtClockQuality} record from the per-clock cache. Missing
 * clocks map to `NaN` (pending). Pure function — does not mutate state.
 */
export function qualityFromResults(results: SrmtResultsByClock): SrmtClockQuality {
  return {
    a: results.a ? results.a.result.affineMatchQuality : Number.NaN,
    phi1: results.phi1 ? results.phi1.result.affineMatchQuality : Number.NaN,
    phi2: results.phi2 ? results.phi2.result.affineMatchQuality : Number.NaN,
  }
}

/**
 * Build the snapshot shape published to {@link useSrmtDiagnosticStore}.
 */
function buildSnapshot(
  result: SrmtResult,
  clock: SrmtClock,
  cutIndex: number,
  rankCap: number,
  computeTimeMs: number
): SrmtSnapshot {
  return {
    clock,
    slicePlane: result.slicePlane,
    cutIndex,
    rankCap,
    kSpectrum: result.kSpectrum,
    hjSpectrum: result.hjSpectrum,
    affineMatchQuality: result.affineMatchQuality,
    computeTimeMs,
  }
}

/**
 * Re-export the champion-clock selection helper from the shared SRMT
 * library so existing call sites continue to work.
 */
export { findChampionClock }

/**
 * Lazy-construct the worker. Reply handler drives the per-clock cache +
 * queue auto-advance.
 */
function ensureWorker(state: SrmtWorkerState): Worker {
  if (state.worker) return state.worker
  const worker = new Worker(
    new URL('../../../../lib/physics/srmt/srmtDiagnostic.worker.ts', import.meta.url),
    { type: 'module' }
  )
  worker.onmessage = (e: MessageEvent<SrmtWorkerResponse>) => {
    if (state.disposed) return
    const msg = e.data
    // Stale replies: drop silently. Matches the BEC dispatcher behaviour.
    if (msg.epoch !== state.epoch) return
    state.inFlight = false
    if (msg.type === 'error') {
      logger.warn(`[SRMT] Worker error: ${msg.message}`)
      // Error aborts the queue; leave any partial results in the cache so
      // the user still sees whatever did complete.
      state.queue = []
      useSrmtDiagnosticStore.getState().setSrmtComputing(false)
      return
    }
    handleResultReply(state, msg)
  }
  worker.onerror = (ev) => {
    if (state.disposed) return
    state.inFlight = false
    state.queue = []
    logger.warn('[SRMT] Worker onerror:', ev)
    useSrmtDiagnosticStore.getState().setSrmtComputing(false)
  }
  state.worker = worker
  return worker
}

/**
 * Process a successful worker reply: install the cache entry, update the
 * store's per-clock quality, bump the result-generation counter, and
 * advance the queue (dispatch next or finalize).
 */
function handleResultReply(
  state: SrmtWorkerState,
  msg: Extract<SrmtWorkerResponse, { type: 'result' }>
): void {
  const replyClock = msg.clock
  // rankCap travelled side-channel on state.lastDispatchedRankCap (the
  // worker response doesn't echo it). Fall back to the schmidt count when
  // the side-channel is missing — can happen in tests that exercise
  // dispatchSrmtCompute directly without queueSrmtCompute. Clamp to the
  // returned spectrum length so boundary-adjacent cuts (where the
  // available rank is smaller than the requested cap) don't publish a
  // cap the dispatched output never actually hit.
  const carriedRankCap = state.lastDispatchedRankCap[replyClock]
  const availableRank = msg.result.schmidtValues.length
  const effectiveRankCap =
    carriedRankCap > 0 ? Math.min(carriedRankCap, availableRank) : availableRank
  const snapshot = buildSnapshot(
    msg.result,
    replyClock,
    msg.cutIndex,
    effectiveRankCap,
    msg.computeTimeMs
  )
  state.resultGeneration += 1
  state.resultsByClock[replyClock] = {
    result: msg.result,
    snapshot,
    cutIndex: msg.cutIndex,
    generation: state.resultGeneration,
  }
  state.lastDispatchedHash[replyClock] = null

  // Store-side publish rule:
  //  - Always merge this clock's quality into `clockAffineQuality` so the
  //    cross-clock table fills in as replies arrive.
  //  - Publish the `snapshot` field only when this reply is for the
  //    user-selected clock (or when no queue-ordered selection is
  //    recorded — the legacy solo-dispatch path takes this branch so
  //    `dispatchSrmtCompute` keeps its Phase-4 contract).
  const store = useSrmtDiagnosticStore.getState()
  store.setClockQuality(replyClock, msg.result.affineMatchQuality)
  if (state.selectedClock === null || state.selectedClock === replyClock) {
    store.setDiagnostic(snapshot, qualityFromResults(state.resultsByClock))
  }

  // Auto-advance: dispatch next queued clock, or finalize the batch.
  if (state.queue.length > 0) {
    dispatchNextInQueue(state)
    return
  }
  finalizeBatch(state)
}

/**
 * Dispatch the head of the queue on the worker. Assumes `state.queue`
 * non-empty and `state.inFlight === false`.
 */
function dispatchNextInQueue(state: SrmtWorkerState): void {
  const next = state.queue.shift()
  if (!next) return
  postArgsToWorker(state, next)
}

/**
 * Post one {@link SrmtDispatchArgs} to the worker thread with
 * transferable buffers. No dedup here — the queue has already been
 * filtered by {@link queueSrmtCompute}.
 *
 * ## Buffer-copy rationale
 *
 * The solver output lives in the strategy's cache and may be consumed
 * by the density-grid packer + SRMT compute on the SAME frame. If we
 * transferred the original `chi` / `lorentzianMask` buffers directly,
 * the strategy would lose ownership and the packer's next read would
 * hit a detached `ArrayBuffer`.
 *
 * The fix is to copy once, then transfer the copy. This is the
 * correct trade-off at current scales:
 *
 *  - `chi` at default grid = `2 · 128 · 32 · 32 · 4 B` ≈ 1 MB.
 *  - `lorentzianMask` = 128 KB.
 *  - Combined copy cost ≈ 200 µs on typical hardware — dwarfed by
 *    the SRMT compute itself (0.5-3 s per clock on the worker).
 *
 * A pool-and-return scheme (transfer on dispatch, back-transfer on
 * reply) would remove the allocator pressure but complicate the
 * worker protocol substantially. If the solver output ever grows 10×
 * (e.g. a 256³ grid experiment), revisit this decision — until then
 * the extra copy is negligible.
 */
function postArgsToWorker(state: SrmtWorkerState, args: SrmtDispatchArgs): void {
  try {
    const worker = ensureWorker(state)
    state.epoch += 1
    state.inFlight = true
    state.lastDispatchedHash[args.clock] = args.hash
    state.lastDispatchedRankCap[args.clock] = args.rankCap
    const chiCopy = new Float32Array(args.output.chi)
    const maskCopy = new Uint8Array(args.output.lorentzianMask)
    const request: SrmtWorkerRequest = {
      type: 'compute',
      epoch: state.epoch,
      chi: chiCopy,
      lorentzianMask: maskCopy,
      gridSize: args.output.gridSize,
      aMin: args.output.aMin,
      aMax: args.output.aMax,
      phiExtent: args.output.phiExtent,
      maxDensity: args.output.maxDensity,
      config: {
        clock: args.clock,
        cutIndex: args.cutIndex,
        rankCap: args.rankCap,
      },
      physics: {
        inflatonMass: args.inflatonMass,
        cosmologicalConstant: args.cosmologicalConstant,
        inflatonMassAsymmetry: args.inflatonMassAsymmetry ?? 1,
      },
    }
    worker.postMessage(request, [chiCopy.buffer, maskCopy.buffer])
  } catch (err) {
    state.inFlight = false
    state.queue = []
    logger.warn('[SRMT] Failed to dispatch diagnostic to worker:', err)
    useSrmtDiagnosticStore.getState().setSrmtComputing(false)
  }
}

/**
 * Emit completion telemetry + flip `computing` off. Telemetry line records
 * quality per clock, the champion (tie-aware), and the separation vector
 * {qP1 − qA, qP2 − qA} so a BC sweep can be skim-read in devtools.
 */
function finalizeBatch(state: SrmtWorkerState): void {
  const quality = qualityFromResults(state.resultsByClock)
  const champion = findChampionClock(quality)
  logger.log('[SRMT] clocks', quality, 'champion:', champion ?? 'tie', 'separation:', [
    quality.phi1 - quality.a,
    quality.phi2 - quality.a,
  ])
  useSrmtDiagnosticStore.getState().setSrmtComputing(false)
}

/**
 * Queue all three clocks for a fresh batch. Clears any cached results +
 * queue, puts `selectedClock` first, and dispatches the head. Bumps the
 * epoch for any pending reply in flight (guarded by {@link ensureWorker}'s
 * stale-epoch drop).
 *
 * Called by the strategy on compute-hash change or `srmtEnabled` toggle-on.
 *
 * @param state - Dispatcher state.
 * @param argsByClock - Per-clock dispatch payload. Must contain an entry
 *   for every clock in {@link SRMT_CLOCKS}.
 * @param selectedClock - The user-selected clock. Dispatched first.
 */
export function queueSrmtCompute(
  state: SrmtWorkerState,
  argsByClock: Record<SrmtClock, SrmtDispatchArgs>,
  selectedClock: SrmtClock
): void {
  if (state.disposed) return
  // Clear in-flight state + cache before re-queueing. We intentionally do
  // NOT bump epoch here — `postArgsToWorker` bumps it on each post, so
  // any stale reply from a previous batch would be dropped by that next
  // post's epoch guard anyway. Bumping twice desynchronises the first
  // request's epoch from the test harness' simulated reply epoch.
  state.inFlight = false
  state.resultsByClock = createEmptyResultsByClock()
  state.lastDispatchedHash = createEmptyLastDispatchedHash()
  state.queue = []
  state.selectedClock = selectedClock
  // Order: selected clock first, then the remaining two in canonical order
  // (so tests get a deterministic tail).
  const ordered: SrmtClock[] = [selectedClock, ...SRMT_CLOCKS.filter((c) => c !== selectedClock)]
  for (const clock of ordered) {
    state.queue.push(argsByClock[clock])
  }
  useSrmtDiagnosticStore.getState().setSrmtComputing(true)
  dispatchNextInQueue(state)
}

/**
 * Dispatch a single SRMT compute to the worker, bypassing the
 * cross-clock queue.
 *
 * ## When to use this vs {@link queueSrmtCompute}
 *
 * Production code path is {@link queueSrmtCompute} — it queues all
 * three clocks back-to-back so the cross-clock quality table fills in
 * without ever falling behind the current selected clock.
 *
 * `dispatchSrmtCompute` is the **single-clock primitive** kept for two
 * permanent use cases:
 *
 *  1. **Test authoring.** Unit tests that want to assert a single
 *     request/reply round-trip without exercising the queue-drain path
 *     (e.g. "dedup same-hash dispatches" or "epoch bump on cancel")
 *     use this API to keep the test focused.
 *  2. **Direct dedup check.** A caller holding its own dedup state can
 *     invoke this to post exactly one request with an in-flight-hash
 *     guard; the queued variant rebuilds the whole three-clock set on
 *     every call.
 *
 * The two functions share the internal dispatch machinery
 * ({@link postArgsToWorker}) — dedup semantics and epoch handling are
 * consistent across both.
 */
export function dispatchSrmtCompute(state: SrmtWorkerState, args: SrmtDispatchArgs): void {
  if (state.disposed) return
  if (state.inFlight && state.lastDispatchedHash[args.clock] === args.hash) return
  // Detach from any prior batch: a lingering `queue` or `selectedClock`
  // from a previous `queueSrmtCompute` would cause the reply handler to
  // auto-dispatch the next queued clock AND gate `setDiagnostic` on the
  // old selection, skipping the publish for the clock we're about to post.
  // Also drop the cached per-clock results so `qualityFromResults()` on the
  // reply path does not publish stale qualities for the untouched clocks
  // alongside the fresh single-clock snapshot.
  state.queue = []
  state.selectedClock = null
  state.resultsByClock = createEmptyResultsByClock()
  state.lastDispatchedRankCap = createEmptyLastDispatchedRankCap()
  // Bump epoch so any stale in-flight reply for a different hash drops.
  state.epoch += 1
  state.inFlight = true
  state.lastDispatchedHash[args.clock] = args.hash
  state.lastDispatchedRankCap[args.clock] = args.rankCap
  useSrmtDiagnosticStore.getState().setSrmtComputing(true)
  try {
    const worker = ensureWorker(state)
    const chiCopy = new Float32Array(args.output.chi)
    const maskCopy = new Uint8Array(args.output.lorentzianMask)
    const request: SrmtWorkerRequest = {
      type: 'compute',
      epoch: state.epoch,
      chi: chiCopy,
      lorentzianMask: maskCopy,
      gridSize: args.output.gridSize,
      aMin: args.output.aMin,
      aMax: args.output.aMax,
      phiExtent: args.output.phiExtent,
      maxDensity: args.output.maxDensity,
      config: {
        clock: args.clock,
        cutIndex: args.cutIndex,
        rankCap: args.rankCap,
      },
      physics: {
        inflatonMass: args.inflatonMass,
        cosmologicalConstant: args.cosmologicalConstant,
        inflatonMassAsymmetry: args.inflatonMassAsymmetry ?? 1,
      },
    }
    worker.postMessage(request, [chiCopy.buffer, maskCopy.buffer])
  } catch (err) {
    state.inFlight = false
    logger.warn('[SRMT] Failed to dispatch diagnostic to worker:', err)
    useSrmtDiagnosticStore.getState().setSrmtComputing(false)
  }
}

/**
 * Cancel any in-flight dispatch without tearing down the worker. Used when
 * `srmtEnabled` toggles off or the compute hash changes mid-queue. Clears
 * the per-clock cache so downstream consumers see an empty state on the
 * next frame.
 */
export function cancelSrmtCompute(state: SrmtWorkerState): void {
  if (state.disposed) return
  state.epoch += 1
  state.inFlight = false
  state.queue = []
  state.resultsByClock = createEmptyResultsByClock()
  state.lastDispatchedHash = createEmptyLastDispatchedHash()
  state.lastDispatchedRankCap = createEmptyLastDispatchedRankCap()
  state.selectedClock = null
  state.resultGeneration = 0
  // Without this the "Computing…" strip can stay live after the user
  // flips SRMT off mid-batch.
  useSrmtDiagnosticStore.getState().setSrmtComputing(false)
}

/**
 * Options for {@link disposeSrmtWorker}.
 */
export interface DisposeSrmtWorkerOptions {
  /**
   * When `true`, skip the global `setSrmtComputing(false)` write.
   *
   * Used by strategy warm-swaps (`adoptFrom` → transferring worker-state
   * ownership): the successor now drives the live worker, so the source's
   * `dispose()` — and the pre-adoption teardown of the successor's fresh
   * idle state — must NOT clear the global computing flag. Defaults to
   * `false` (production teardown does flip the flag).
   */
  skipStoreMutation?: boolean
}

/**
 * Terminate the worker and mark the state disposed. Safe to call multiple
 * times.
 */
export function disposeSrmtWorker(
  state: SrmtWorkerState,
  options: DisposeSrmtWorkerOptions = {}
): void {
  state.disposed = true
  state.inFlight = false
  state.queue = []
  state.resultsByClock = createEmptyResultsByClock()
  state.lastDispatchedHash = createEmptyLastDispatchedHash()
  state.lastDispatchedRankCap = createEmptyLastDispatchedRankCap()
  state.selectedClock = null
  state.resultGeneration = 0
  state.worker?.terminate()
  state.worker = null
  if (!options.skipStoreMutation) {
    useSrmtDiagnosticStore.getState().setSrmtComputing(false)
  }
}
