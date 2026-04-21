/**
 * Web Worker for BEC incompressible kinetic energy spectrum computation.
 *
 * Offloads `computeIncompressibleSpectrum` from the main thread. At 64³
 * grid size the computation does 3 Float64 FFTs plus a Helmholtz
 * projection + shell binning — 5–30 ms of main-thread work per trigger,
 * which jitters the render pipeline for BEC turbulence presets.
 *
 * Message protocol:
 *   Main → Worker: IncompressibleSpectrumWorkerRequest (with Transferable psi buffers)
 *   Worker → Main: IncompressibleSpectrumWorkerResponse
 *
 * @module lib/physics/bec/incompressibleSpectrum.worker
 */

import {
  computeIncompressibleSpectrum,
  type IncompressibleSpectrumResult,
} from '@/lib/physics/bec/incompressibleSpectrum'
import { initAnimationWasm } from '@/lib/wasm'

// Initialize WASM in the worker thread (non-blocking). `computeIncompressibleSpectrum`
// internally calls the shared FFT module which uses WASM when ready — early
// messages transparently fall back to the JS FFT path until WASM is loaded.
void initAnimationWasm()

/** Inbound message to the incompressible spectrum worker. */
export interface IncompressibleSpectrumWorkerRequest {
  type: 'compute'
  epoch: number
  psiRe: Float32Array
  psiIm: Float32Array
  gridSize: number[]
  spacing: number[]
  hbar: number
  mass: number
}

/** Successful spectrum response. */
export interface IncompressibleSpectrumWorkerResultResponse {
  type: 'result'
  epoch: number
  result: IncompressibleSpectrumResult
}

/**
 * Error response — mirrors the `srmtDiagnostic.worker.ts` pattern so the
 * main-thread dispatcher can distinguish "compute threw" from "no data
 * yet" and surface the cause through `logger.warn`. Previously the
 * worker posted an empty-spectrum `result` on failure, which looked
 * identical to an uncomputed initial state and gave the renderer no
 * signal that anything had gone wrong.
 */
export interface IncompressibleSpectrumWorkerErrorResponse {
  type: 'error'
  epoch: number
  message: string
}

/** Outbound message from the incompressible spectrum worker. */
export type IncompressibleSpectrumWorkerResponse =
  | IncompressibleSpectrumWorkerResultResponse
  | IncompressibleSpectrumWorkerErrorResponse

self.onmessage = (e: MessageEvent<IncompressibleSpectrumWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  try {
    const result = computeIncompressibleSpectrum(
      msg.psiRe,
      msg.psiIm,
      msg.gridSize,
      msg.spacing,
      msg.hbar,
      msg.mass
    )
    const response: IncompressibleSpectrumWorkerResponse = {
      type: 'result',
      epoch: msg.epoch,
      result,
    }
    // Spectrum buffers are small (NUM_SPECTRUM_BINS Float32 = 128 bytes each);
    // structured-clone copy is cheaper than setting up the transfer list.
    self.postMessage(response)
  } catch (err) {
    const response: IncompressibleSpectrumWorkerResponse = {
      type: 'error',
      epoch: msg.epoch,
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
