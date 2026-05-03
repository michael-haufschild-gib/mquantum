/**
 * Web Worker for coordinate entanglement computation.
 *
 * Offloads the CPU-intensive reduced density matrix + eigendecomposition
 * pipeline from the main thread so rendering is not blocked.
 *
 * Message protocol:
 *   Main → Worker: EntanglementWorkerRequest (with Transferable psi buffers)
 *   Worker → Main: EntanglementWorkerResponse
 *
 * @module lib/physics/coordinateEntanglement.worker
 */

import {
  computeCoordinateEntanglement,
  type CoordinateEntanglementResult,
  type EntanglementOptions,
} from '@/lib/physics/coordinateEntanglement'
import { initAnimationWasm } from '@/lib/wasm'

// Initialize WASM in the worker thread (non-blocking).
// Early messages fall back to JS until WASM is ready.
void initAnimationWasm()

/** Inbound message to the entanglement worker. */
export interface EntanglementWorkerRequest {
  type: 'compute'
  epoch: number
  psiRe: Float32Array
  psiIm: Float32Array
  gridSize: number[]
  options: EntanglementOptions
}

/** Successful compute result. */
export interface EntanglementWorkerResultMessage {
  type: 'result'
  epoch: number
  result: CoordinateEntanglementResult
}

/** In-band compute failure — caller distinguishes "no result" from "error". */
export interface EntanglementWorkerErrorMessage {
  type: 'error'
  epoch: number
  message: string
}

/** Outbound message from the entanglement worker. */
export type EntanglementWorkerResponse =
  | EntanglementWorkerResultMessage
  | EntanglementWorkerErrorMessage

self.onmessage = (e: MessageEvent<EntanglementWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  try {
    const result = computeCoordinateEntanglement(msg.psiRe, msg.psiIm, msg.gridSize, msg.options)
    const response: EntanglementWorkerResultMessage = {
      type: 'result',
      epoch: msg.epoch,
      result,
    }
    self.postMessage(response)
  } catch (err) {
    // In-band error per docs/operability/workers.md: keep the failure
    // path on the same channel as the success path so consumers can
    // listen on `onmessage` alone.
    const message = err instanceof Error ? err.message : String(err)
    const errResponse: EntanglementWorkerErrorMessage = {
      type: 'error',
      epoch: msg.epoch,
      message,
    }
    self.postMessage(errResponse)
  }
}
