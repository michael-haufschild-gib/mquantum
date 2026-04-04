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

/** Inbound message to the entanglement worker. */
export interface EntanglementWorkerRequest {
  type: 'compute'
  epoch: number
  psiRe: Float32Array
  psiIm: Float32Array
  gridSize: number[]
  options: EntanglementOptions
}

/** Outbound result from the entanglement worker. */
export interface EntanglementWorkerResponse {
  type: 'result'
  epoch: number
  result: CoordinateEntanglementResult
}

self.onmessage = (e: MessageEvent<EntanglementWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  const result = computeCoordinateEntanglement(msg.psiRe, msg.psiIm, msg.gridSize, msg.options)

  const response: EntanglementWorkerResponse = {
    type: 'result',
    epoch: msg.epoch,
    result,
  }

  self.postMessage(response)
}
