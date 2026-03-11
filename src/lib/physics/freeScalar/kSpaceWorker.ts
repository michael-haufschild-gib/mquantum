/**
 * Web Worker for k-space occupation computation.
 *
 * Offloads the CPU-intensive pipeline (FFT + n_k + display transforms) from
 * the main thread so rendering is not blocked during k-space updates.
 *
 * Message protocol:
 *   Main → Worker: KSpaceWorkerRequest (with Transferable phi/pi buffers)
 *   Worker → Main: KSpaceWorkerResponse (with Transferable density/analysis buffers)
 */

import { computeRawKSpaceDataFromComplex } from '@/lib/physics/freeScalar/kSpaceOccupation'
import { buildKSpaceDisplayTextures } from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'
import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'

/** Inbound message to the k-space web worker requesting a texture computation. */
export interface KSpaceWorkerRequest {
  type: 'compute'
  epoch: number
  phiComplex: Float32Array
  piComplex: Float32Array
  gridSize: number[]
  spacing: number[]
  mass: number
  latticeDim: number
  kSpaceViz: KSpaceVizConfig
}

/** Outbound result from the k-space web worker with computed display textures. */
export interface KSpaceWorkerResponse {
  type: 'result'
  epoch: number
  density: Uint16Array
  analysis: Uint16Array
}

self.onmessage = (e: MessageEvent<KSpaceWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  const raw = computeRawKSpaceDataFromComplex(
    msg.phiComplex,
    msg.piComplex,
    msg.gridSize,
    msg.spacing,
    msg.mass,
    msg.latticeDim
  )

  // nkOnly=true: k-space occupation only reads analysis.r
  const { density, analysis } = buildKSpaceDisplayTextures(raw, msg.kSpaceViz, true)

  const response: KSpaceWorkerResponse = {
    type: 'result',
    epoch: msg.epoch,
    density,
    analysis,
  }

  // Transfer ownership of the typed array buffers back to main thread
  self.postMessage(response, { transfer: [density.buffer, analysis.buffer] })
}
