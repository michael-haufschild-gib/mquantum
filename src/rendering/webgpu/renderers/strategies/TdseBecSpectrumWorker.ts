/**
 * BEC incompressible-spectrum web-worker dispatcher.
 *
 * Extracted from TdseBecStrategy.ts to keep the strategy file under the
 * project's 600-line cap. Owns lazy worker construction, epoch-based
 * stale-result discarding, and the readback → postMessage transfer path.
 */

import { logger } from '@/lib/logger'
import type {
  IncompressibleSpectrumWorkerRequest,
  IncompressibleSpectrumWorkerResponse,
} from '@/lib/physics/bec/incompressibleSpectrum.worker'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

/** Mutable state shared with the strategy across maybeComputeSpectrum calls. */
export interface BecSpectrumWorkerState {
  worker: Worker | null
  epoch: number
  inFlight: boolean
  /** Set when the strategy disposes; suppresses late callbacks. */
  disposed: boolean
}

/** Construct an idle BEC spectrum worker state. */
export function createBecSpectrumWorkerState(): BecSpectrumWorkerState {
  return { worker: null, epoch: 0, inFlight: false, disposed: false }
}

/** Lazy-construct the worker and wire its message/error handlers. */
function ensureWorker(state: BecSpectrumWorkerState): Worker {
  if (state.worker) return state.worker
  const worker = new Worker(
    new URL('../../../../lib/physics/bec/incompressibleSpectrum.worker.ts', import.meta.url),
    { type: 'module' }
  )
  worker.onmessage = (e: MessageEvent<IncompressibleSpectrumWorkerResponse>) => {
    if (state.disposed) return
    if (e.data.type !== 'result') return
    if (e.data.epoch !== state.epoch) return
    state.inFlight = false
    const spec = e.data.result
    useDiagnosticsStore
      .getState()
      .setBecIncompressibleSpectrum(
        spec.spectrum,
        spec.kValues,
        spec.totalIncompressible,
        spec.totalCompressible
      )
  }
  worker.onerror = () => {
    if (state.disposed) return
    state.inFlight = false
    logger.warn('[BEC] Spectrum worker error')
  }
  state.worker = worker
  return worker
}

/** Build the request payload + post to the worker with zero-copy transfer. */
export function dispatchBecSpectrumComputation(
  state: BecSpectrumWorkerState,
  result: { re: Float32Array; im: Float32Array },
  gridSize: number[],
  spacing: number[],
  hbar: number,
  mass: number,
  epoch: number
): void {
  if (state.disposed) return
  try {
    const worker = ensureWorker(state)
    const request: IncompressibleSpectrumWorkerRequest = {
      type: 'compute',
      epoch,
      psiRe: result.re,
      psiIm: result.im,
      gridSize,
      spacing,
      hbar,
      mass,
    }
    worker.postMessage(request, [result.re.buffer, result.im.buffer])
  } catch (err) {
    state.inFlight = false
    logger.warn('[BEC] Failed to dispatch spectrum to worker:', err)
  }
}
