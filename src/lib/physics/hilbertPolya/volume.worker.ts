/**
 * Web Worker computing the Hilbert–Pólya Evans-landscape volume LUT.
 *
 * One job = one full (Re z, Im z, θ) volume. Slices are computed from the TOP
 * θ-slice downward (sharp filaments first — they carry the science; the veil
 * fog fills in afterwards) and posted individually as transferables so the
 * render thread can upload progressively. A newer job supersedes an older
 * one between slices.
 *
 * @module lib/physics/hilbertPolya/volume.worker
 */

import type { HilbertPolyaVolumeParams } from './evans'
import { computeVolumeSlice, HP_VOL_NTHETA } from './evans'

/** Job request message. */
export interface HpVolumeJobRequest {
  type: 'compute'
  jobId: number
  params: HilbertPolyaVolumeParams
}

/** Per-slice response message. */
export interface HpVolumeSliceResponse {
  type: 'slice'
  jobId: number
  /** θ-slice index. */
  k: number
  data: Float32Array
}

let currentJobId = 0

self.onmessage = (event: MessageEvent<HpVolumeJobRequest>) => {
  const msg = event.data
  if (msg.type !== 'compute') return
  currentJobId = msg.jobId
  const jobId = msg.jobId
  const params = msg.params

  // Yield between slices via microtask-free setTimeout chunks so a newer
  // job's message can preempt the loop.
  let k = HP_VOL_NTHETA - 1
  const step = (): void => {
    if (jobId !== currentJobId) return
    const data = computeVolumeSlice(k, params)
    const response: HpVolumeSliceResponse = { type: 'slice', jobId, k, data }
    ;(self as unknown as Worker).postMessage(response, [data.buffer])
    k--
    if (k >= 0) setTimeout(step, 0)
  }
  step()
}
