/**
 * Web Worker for the SRMT parameter sweep.
 *
 * Drives {@link runCutSweep}, {@link runMassSweep}, {@link runBcSweep}
 * off the main thread and streams progress back to the coordinator.
 * Keeping the sweep separate from the single-shot diagnostic worker is
 * deliberate — the sweep protocol adds streaming progress, per-solve
 * announcements (for mass/BC), and cancellation, which do not map
 * cleanly onto the diagnostic worker's single-request/single-reply
 * shape.
 *
 * ## Worker-safety of imports
 *
 * All transitive imports are pure TS + standard ES modules:
 *
 *  - `@/lib/physics/wheelerDeWitt/solver` — only external dep is
 *    `@/lib/logger`, which uses `console.*` gated by `import.meta.env.DEV`.
 *    Vite injects `import.meta.env` into workers; `console` is available
 *    in `DedicatedWorkerGlobalScope`.
 *  - `@/lib/physics/srmt/*` — pure TS.
 *  - `@/lib/geometry/extended/wheelerDeWitt` — type-only imports here.
 *
 * No DOM, WebGPU, React, or Zustand references anywhere in the transitive
 * closure. If a future change adds one, the worker bundler (Vite) will
 * fail at build time — so this contract is enforced.
 *
 * ## Message protocol
 *
 *   Main → Worker: {@link SrmtSweepRequest}. For cut sweep the caller
 *   transfers `chi` and `lorentzianMask` buffers; the worker then owns
 *   them. For mass/BC the worker re-solves so only the config is sent.
 *
 *   Worker → Main: {@link SrmtSweepResponse} discriminant — `progress`
 *   per-point (with transferable spectrum buffers), `solveStart` before
 *   each per-point solver re-run, `done` on completion, `error` on
 *   failure. All replies echo the request `epoch` so the coordinator can
 *   discard stale replies.
 *
 * @module lib/physics/srmt/srmtSweep.worker
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

import type { SrmtPhysicsContext } from './diagnostic'
import {
  runBcSweep,
  runCutSweep,
  runLambdaSweep,
  runMassSweep,
  runPhiExtentSweep,
  runPhiRefSweep,
  runRankCapSweep,
  type SrmtSweepCancelToken,
} from './sweepDriver'
import type { SrmtSweepConfig, SrmtSweepLandmark, SrmtSweepPoint } from './sweepTypes'

/** Transferable-friendly subset of {@link WheelerDeWittSolverOutput}. */
export interface SrmtSweepSolverSnapshot {
  chi: Float32Array
  lorentzianMask: Uint8Array
  gridSize: [number, number, number]
  aMin: number
  aMax: number
  phiExtent: number
  maxDensity: number
}

/**
 *
 */
export type SrmtSweepRequest =
  | {
      type: 'start'
      epoch: number
      config: SrmtSweepConfig
      physics: SrmtPhysicsContext
      wdwConfig: WheelerDeWittConfig
      landmarks: SrmtSweepLandmark[]
      /** Required for kind='cut'; omitted for mass/bc (worker re-solves). */
      solverOutput?: SrmtSweepSolverSnapshot
    }
  | { type: 'cancel'; epoch: number }

/**
 *
 */
export type SrmtSweepResponse =
  | { type: 'progress'; epoch: number; point: SrmtSweepPoint; completed: number; total: number }
  | { type: 'solveStart'; epoch: number; index: number }
  | { type: 'done'; epoch: number; landmarks: SrmtSweepLandmark[]; totalMs: number }
  | { type: 'error'; epoch: number; message: string }

/** Worker scope with only the members we use. */
interface SweepWorkerScope {
  postMessage(message: SrmtSweepResponse, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<SrmtSweepRequest>) => void) | null
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * Collect transferable buffers from a sweep point so the main thread
 * owns them zero-copy. Schmidt and HJ spectra are per-clock typed
 * arrays. Exported for direct-dispatch tests.
 */
export function transferablesForPoint(point: SrmtSweepPoint): Transferable[] {
  const out: Transferable[] = []
  for (const clock of ['a', 'phi1', 'phi2'] as const) {
    const k = point.kSpectrumByClock[clock]
    if (k) out.push(k.buffer as Transferable)
    const hj = point.hjSpectrumByClock[clock]
    if (hj) out.push(hj.buffer as Transferable)
  }
  return out
}

/** Emit channel used by {@link handleSrmtSweepRequest}. */
export type SrmtSweepEmit = (message: SrmtSweepResponse, transfer?: Transferable[]) => void

/**
 * Module-level state exposed for the onmessage handler + direct tests.
 * Holds the current run's cancel token and epoch so `cancel` messages
 * can flip the in-flight driver.
 */
export interface SrmtSweepWorkerState {
  cancel: SrmtSweepCancelToken | null
  epoch: number
}

/**
 *
 */
export function createSrmtSweepWorkerState(): SrmtSweepWorkerState {
  return { cancel: null, epoch: 0 }
}

/**
 * Reconstruct a {@link WheelerDeWittSolverOutput} from the transfered
 * snapshot. `bandKind` + `columnAiry` are not needed by the sweep
 * driver so we stub them.
 */
function unpackSolverSnapshot(s: SrmtSweepSolverSnapshot): WheelerDeWittSolverOutput {
  return {
    chi: s.chi,
    lorentzianMask: s.lorentzianMask,
    bandKind: new Uint8Array(s.gridSize[0] * s.gridSize[1] * s.gridSize[2]),
    gridSize: s.gridSize,
    aMin: s.aMin,
    aMax: s.aMax,
    phiExtent: s.phiExtent,
    maxDensity: s.maxDensity,
    columnAiry: [],
  }
}

/**
 * Dispatch a sweep request. Pure logic — callers provide the emit
 * channel and a module-owned {@link SrmtSweepWorkerState} so the worker
 * and tests share the exact same code path.
 */
export function handleSrmtSweepRequest(
  msg: SrmtSweepRequest,
  emit: SrmtSweepEmit,
  state: SrmtSweepWorkerState
): void {
  if (msg.type === 'cancel') {
    if (msg.epoch === state.epoch && state.cancel) {
      state.cancel.aborted = true
    }
    return
  }
  if (msg.type !== 'start') return

  state.epoch = msg.epoch
  const cancel: SrmtSweepCancelToken = { aborted: false }
  state.cancel = cancel
  const start = nowMs()

  const total = totalPointsFor(msg.config)
  let completed = 0
  const onProgress = (point: SrmtSweepPoint): void => {
    completed += 1
    if (msg.epoch !== state.epoch) return
    const response: SrmtSweepResponse = {
      type: 'progress',
      epoch: msg.epoch,
      point,
      completed,
      total,
    }
    emit(response, transferablesForPoint(point))
  }
  const onSolveStart = (index: number): void => {
    if (msg.epoch !== state.epoch) return
    const response: SrmtSweepResponse = {
      type: 'solveStart',
      epoch: msg.epoch,
      index,
    }
    emit(response)
  }

  try {
    if (msg.config.kind === 'cut') {
      if (!msg.solverOutput) {
        throw new Error("SRMT sweep worker: kind='cut' requires solverOutput")
      }
      runCutSweep({
        solverOutput: unpackSolverSnapshot(msg.solverOutput),
        config: msg.config,
        physics: msg.physics,
        onProgress,
        cancel,
      })
    } else if (msg.config.kind === 'mass') {
      runMassSweep({
        wdwConfig: msg.wdwConfig,
        config: msg.config,
        onProgress,
        onSolveStart,
        cancel,
      })
    } else if (msg.config.kind === 'lambda') {
      runLambdaSweep({
        wdwConfig: msg.wdwConfig,
        config: msg.config,
        onProgress,
        onSolveStart,
        cancel,
      })
    } else if (msg.config.kind === 'phiRef') {
      if (!msg.solverOutput) {
        throw new Error("SRMT sweep worker: kind='phiRef' requires solverOutput")
      }
      runPhiRefSweep({
        solverOutput: unpackSolverSnapshot(msg.solverOutput),
        config: msg.config,
        physics: msg.physics,
        onProgress,
        cancel,
      })
    } else if (msg.config.kind === 'rankCap') {
      if (!msg.solverOutput) {
        throw new Error("SRMT sweep worker: kind='rankCap' requires solverOutput")
      }
      runRankCapSweep({
        solverOutput: unpackSolverSnapshot(msg.solverOutput),
        config: msg.config,
        physics: msg.physics,
        onProgress,
        cancel,
      })
    } else if (msg.config.kind === 'phiExtent') {
      runPhiExtentSweep({
        wdwConfig: msg.wdwConfig,
        config: msg.config,
        onProgress,
        onSolveStart,
        cancel,
      })
    } else {
      runBcSweep({
        wdwConfig: msg.wdwConfig,
        config: msg.config,
        onProgress,
        onSolveStart,
        cancel,
      })
    }
    if (cancel.aborted) return
    if (msg.epoch !== state.epoch) return
    const done: SrmtSweepResponse = {
      type: 'done',
      epoch: msg.epoch,
      landmarks: msg.landmarks,
      totalMs: nowMs() - start,
    }
    emit(done)
  } catch (err) {
    if (msg.epoch !== state.epoch) return
    const response: SrmtSweepResponse = {
      type: 'error',
      epoch: msg.epoch,
      message: err instanceof Error ? err.message : String(err),
    }
    emit(response)
  }
}

// Worker runtime binding: wire the module-level scope's onmessage to the
// shared dispatcher. Tests import the named exports above directly and
// never hit this branch, which is guarded behind a `self.postMessage`
// feature check so `vitest` imports are side-effect-free.
/* istanbul ignore next -- executed only in a real Worker runtime */
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  const scope = self as unknown as SweepWorkerScope
  const moduleState = createSrmtSweepWorkerState()
  scope.onmessage = (e: MessageEvent<SrmtSweepRequest>) => {
    handleSrmtSweepRequest(
      e.data,
      (message, transfer) => scope.postMessage(message, transfer),
      moduleState
    )
  }
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
