/** TDSE Diagnostics — Norm Readback Callback */

import {
  computeReflectionTransmission,
  type TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'
// eslint-disable-next-line no-restricted-imports -- diagnostic store write-direction access
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

/** Number of f32 values in diagnostic result buffer */
const DIAG_RESULT_COUNT = 4

/** Mutable state shared with the TDSE pass for diagnostics readback. */
export interface DiagReadbackState {
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
  diagMappingInFlight: boolean
  diagGeneration: number
  maxDensity: number
  initialNorm: number
  currentAutoLoop: boolean
  pendingAutoReset: boolean
  simTime: number
  diagHistory: TdseDiagnosticsHistory
}

/**
 * Copy result → staging and schedule async GPU readback for norm diagnostics.
 * Fire-and-forget pattern with in-flight guard.
 */
export function scheduleNormReadback(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  s: DiagReadbackState,
  renormBuf: GPUBuffer | null,
  recordHistory: boolean
): void {
  if (s.diagMappingInFlight || !s.diagResultBuffer || !s.diagStagingBuffer) return

  encoder.copyBufferToBuffer(s.diagResultBuffer, 0, s.diagStagingBuffer, 0, DIAG_RESULT_COUNT * 4)
  s.diagMappingInFlight = true
  const staging = s.diagStagingBuffer
  const simTime = s.simTime
  const gen = s.diagGeneration

  device.queue
    .onSubmittedWorkDone()
    .then(() => {
      if (
        !staging ||
        staging.mapState !== 'unmapped' ||
        s.diagStagingBuffer !== staging ||
        gen !== s.diagGeneration
      ) {
        s.diagMappingInFlight = false
        return
      }
      staging
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const data = new Float32Array(staging.getMappedRange())
          const totalNorm = data[0]!
          const maxDens = data[1]!
          const normLeft = data[2]!
          const normRight = data[3]!
          staging.unmap()

          // Asymmetric maxDensity smoothing
          if (maxDens > 0) {
            if (s.maxDensity <= 0 || maxDens >= s.maxDensity) s.maxDensity = maxDens
            else s.maxDensity += 0.4 * (maxDens - s.maxDensity)
          }

          // Auto-loop: capture initial norm, check decay/divergence
          if (s.initialNorm < 0) {
            s.initialNorm = totalNorm
            if (renormBuf) device.queue.writeBuffer(renormBuf, 4, new Float32Array([totalNorm]))
          } else if (s.initialNorm > 0) {
            if (!isFinite(totalNorm)) s.pendingAutoReset = true
            else if (
              s.currentAutoLoop &&
              (totalNorm < s.initialNorm * 0.001 || totalNorm > s.initialNorm * 5.0)
            )
              s.pendingAutoReset = true
          }

          if (recordHistory) {
            const norm0 =
              s.diagHistory.length > 0 ? s.diagHistory.getHistory()[0]!.totalNorm : totalNorm
            const { R, T } = computeReflectionTransmission(normLeft, normRight, norm0)
            const snapshot: TdseDiagnosticsSnapshot = {
              simTime,
              totalNorm,
              maxDensity: maxDens,
              normDrift: norm0 > 0 ? (totalNorm - norm0) / norm0 : 0,
              normLeft,
              normRight,
              R,
              T,
            }
            s.diagHistory.push(snapshot)
            useTdseDiagnosticsStore.getState().pushSnapshot(snapshot)
          }
          s.diagMappingInFlight = false
        })
        .catch(() => {
          s.diagMappingInFlight = false
        })
    })
    .catch(() => {
      s.diagMappingInFlight = false
    })
}
