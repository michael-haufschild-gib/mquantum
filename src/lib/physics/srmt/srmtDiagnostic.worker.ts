/**
 * Web Worker for the SRMT (Superspace-Relational Modular Time) diagnostic.
 *
 * Offloads {@link computeSrmtDiagnostic} from the main thread. At the default
 * Wheeler–DeWitt grid (`Na=128, Nphi=32`) the Hamilton–Jacobi Jacobi
 * eigendecomposition runs on a 1024×1024 symmetric matrix — O(n³) ≈ 10⁹
 * ops in pure JS, which blocks the main thread for seconds. Dispatching to
 * this worker keeps the UI responsive while the compute runs on a background
 * thread; results are posted back with transferable buffers for zero-copy
 * delivery to the strategy + store.
 *
 * Message protocol:
 *   Main → Worker: {@link SrmtWorkerRequest} with transferable `chi` /
 *                  `lorentzianMask` buffers.
 *   Worker → Main: {@link SrmtWorkerResponse} — either a `'result'` carrying
 *                  the full diagnostic, or an `'error'` discriminant carrying
 *                  a message string. In both cases the request's `epoch` is
 *                  echoed so the dispatcher can drop stale replies.
 *
 * @module lib/physics/srmt/srmtDiagnostic.worker
 */

import { computeSrmtDiagnostic, type SrmtPhysicsContext } from '@/lib/physics/srmt/diagnostic'
import type { SrmtConfig, SrmtResult } from '@/lib/physics/srmt/types'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Inbound message to the SRMT diagnostic worker. Mirrors the subset of
 * {@link WheelerDeWittSolverOutput} consumed by {@link computeSrmtDiagnostic},
 * plus the diagnostic's own config + physics context. `chi` and
 * `lorentzianMask` should be transferred (ownership moves to the worker) so
 * the main-thread dispatcher must copy the strategy's cached solver output
 * first — see {@link ./../../rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker.ts}.
 */
export interface SrmtWorkerRequest {
  /** Discriminant for future expansion. */
  type: 'compute'
  /** Monotonic tag used to drop stale replies in the dispatcher. */
  epoch: number
  /** Interleaved (re, im) χ grid — transferred, not copied. */
  chi: Float32Array
  /** Per-cell Lorentzian mask — transferred, not copied. */
  lorentzianMask: Uint8Array
  /** Grid dimensions `(Na, Nphi, Nphi)`. */
  gridSize: [number, number, number]
  /** Minimum scale factor `a` on the grid. */
  aMin: number
  /** Maximum scale factor `a` on the grid. */
  aMax: number
  /** Half-range of the inflaton grid. */
  phiExtent: number
  /** Solver's observed maximum `|χ|²`. */
  maxDensity: number
  /** Diagnostic configuration: clock, cutIndex, rankCap. */
  config: SrmtConfig
  /** Physics context: inflaton mass + cosmological constant. */
  physics: SrmtPhysicsContext
}

/** Outbound response: either a successful result or an error. */
export type SrmtWorkerResponse =
  | {
      type: 'result'
      epoch: number
      result: SrmtResult
      /** Clock echoed back from the request (`config.clock`). */
      clock: SrmtConfig['clock']
      /** Cut index echoed back from the request (`config.cutIndex`). */
      cutIndex: number
      /** Wall-clock compute time in milliseconds for telemetry / UI. */
      computeTimeMs: number
    }
  | {
      type: 'error'
      epoch: number
      message: string
    }

/**
 * Minimal local typing for the Worker global scope. The main `tsconfig.json`
 * does not include the `"WebWorker"` lib, so `DedicatedWorkerGlobalScope`
 * isn't available — defining the two members we actually use keeps the
 * file compilable while the Vite worker bundler delivers the real scope at
 * runtime.
 */
interface SrmtWorkerScope {
  postMessage(message: SrmtWorkerResponse, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<SrmtWorkerRequest>) => void) | null
}

/**
 * Return a high-resolution timestamp when `performance.now` is available,
 * else fall back to `Date.now`. Some worker test harnesses do not expose
 * `performance`, so the fallback keeps the worker robust.
 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

const scope = self as unknown as SrmtWorkerScope

scope.onmessage = (e: MessageEvent<SrmtWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  const start = nowMs()
  try {
    // SRMT consumes only `chi`, `lorentzianMask`, `gridSize`, and the
    // physical extents — it does not read `bandKind` or `columnAiry`.
    // Stub them out with empty buffers / array so the reconstructed
    // object satisfies the full {@link WheelerDeWittSolverOutput} type.
    const slab = msg.gridSize[0] * msg.gridSize[1] * msg.gridSize[2]
    const output: WheelerDeWittSolverOutput = {
      chi: msg.chi,
      lorentzianMask: msg.lorentzianMask,
      bandKind: new Uint8Array(slab),
      gridSize: msg.gridSize,
      aMin: msg.aMin,
      aMax: msg.aMax,
      phiExtent: msg.phiExtent,
      maxDensity: msg.maxDensity,
      columnAiry: [],
    }
    const result = computeSrmtDiagnostic(output, msg.config, msg.physics)
    const response: SrmtWorkerResponse = {
      type: 'result',
      epoch: msg.epoch,
      result,
      clock: msg.config.clock,
      cutIndex: msg.config.cutIndex,
      computeTimeMs: nowMs() - start,
    }
    // All four Float32Array spectra own their own buffers per SrmtResult
    // contract — transfer them back to avoid a structured-clone copy at the
    // main-thread boundary.
    scope.postMessage(response, [
      result.schmidtValues.buffer as Transferable,
      result.kSpectrum.buffer as Transferable,
      result.hjSpectrum.buffer as Transferable,
      result.sliceK.buffer as Transferable,
    ])
  } catch (err) {
    const response: SrmtWorkerResponse = {
      type: 'error',
      epoch: msg.epoch,
      message: err instanceof Error ? err.message : String(err),
    }
    scope.postMessage(response)
  }
}
