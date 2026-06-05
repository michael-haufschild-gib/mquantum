/** TDSE Diagnostics — Norm Readback Callback */

import {
  computeReflectionTransmission,
  type TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import {
  finiteNonNegativeReadbackOrZero,
  finiteReadbackOrZero,
  finiteReadbackRatioOrZero,
  isFinitePositiveNorm,
  smoothPositiveReadbackPeak,
} from '../normalizationGuards'

/** Number of f32 values in diagnostic result buffer: [norm, maxDensity, normLeft, normRight, sumPsi4, properMaxDensity] */
const DIAG_RESULT_COUNT = 6

/** Mutable state shared with the TDSE pass for diagnostics readback. */
export interface DiagReadbackState {
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
  diagMappingInFlight: boolean
  diagGeneration: number
  maxDensity: number
  properMaxDensity: number
  initialNorm: number
  currentAutoLoop: boolean
  pendingAutoReset: boolean
  simTime: number
  diagHistory: TdseDiagnosticsHistory
  /** Previous norm reading for stagnation detection */
  prevNorm: number
  /** Count of consecutive readings where norm barely changed */
  stagnationCount: number
  /** Peak maxDensity from the first diagnostics readback, used to cap autoScale gain */
  initialMaxDensity: number
  /** Initial peak proper density from first diagnostics readback, for proper-view gain cap */
  initialProperMaxDensity: number
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

  // PERF: mapAsync waits for the GPU copy — skip onSubmittedWorkDone() to avoid
  // a pipeline stall (BEC ~30% FPS drop when diagnosticsEnabled defaults to true).
  // Defer via queueMicrotask so the buffer isn't in "pending map" state when
  // queue.submit() fires later in the same synchronous block.
  queueMicrotask(() =>
    staging
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (
          !staging ||
          staging.mapState !== 'mapped' ||
          s.diagStagingBuffer !== staging ||
          gen !== s.diagGeneration
        ) {
          try {
            staging.unmap()
          } catch {
            /* already unmapped */
          }
          s.diagMappingInFlight = false
          return
        }

        const data = new Float32Array(staging.getMappedRange())
        const totalNorm = data[0]!
        const maxDens = data[1]!
        const normLeft = data[2]!
        const normRight = data[3]!
        const sumPsi4 = data[4]!
        const properMaxDens = data[5]!
        staging.unmap()
        const totalNormIsSafe = isFinitePositiveNorm(totalNorm)
        const safeTotalNorm = totalNormIsSafe ? totalNorm : 0
        const safeMaxDens = finiteNonNegativeReadbackOrZero(maxDens)
        const safeNormLeft = finiteNonNegativeReadbackOrZero(normLeft)
        const safeNormRight = finiteNonNegativeReadbackOrZero(normRight)
        const safeSumPsi4 = finiteNonNegativeReadbackOrZero(sumPsi4)
        const safeProperMaxDens = finiteNonNegativeReadbackOrZero(properMaxDens)

        // Inverse Participation Ratio: IPR = (Σ|ψ|²)² / Σ|ψ|⁴ = 1 / Σp²
        // IPR → N for extended (delocalized) states, IPR → 1 for fully localized
        const ipr =
          totalNormIsSafe && safeSumPsi4 > 0
            ? finiteReadbackRatioOrZero(totalNorm * totalNorm, safeSumPsi4)
            : 0

        // Asymmetric maxDensity smoothing
        s.maxDensity = smoothPositiveReadbackPeak(s.maxDensity, safeMaxDens)
        s.properMaxDensity = smoothPositiveReadbackPeak(s.properMaxDensity, safeProperMaxDens)

        // Auto-loop: capture initial norm, check decay/divergence/stagnation
        if (s.initialNorm < 0) {
          if (totalNormIsSafe) {
            s.initialNorm = totalNorm
            s.initialMaxDensity = safeMaxDens
            s.initialProperMaxDensity = safeProperMaxDens
            s.prevNorm = totalNorm
            s.stagnationCount = 0
            if (renormBuf) device.queue.writeBuffer(renormBuf, 4, new Float32Array([totalNorm]))
          } else {
            s.pendingAutoReset = true
          }
        } else if (s.initialNorm > 0) {
          if (!totalNormIsSafe) s.pendingAutoReset = true
          else if (s.currentAutoLoop) {
            // Reset if norm dropped below 1% or diverged above 5×
            if (totalNorm < s.initialNorm * 0.01 || totalNorm > s.initialNorm * 5.0) {
              s.pendingAutoReset = true
            }
            // Stagnation detection: if norm has decayed significantly (below 10%)
            // but stopped changing (< 0.1% relative change between readings),
            // the remaining probability is a trapped residual that will never
            // reach the absorber (e.g., near-zero-momentum density next to a
            // high barrier). Reset to avoid visually misleading late-time states.
            else if (totalNorm < s.initialNorm * 0.1 && s.prevNorm > 0) {
              const relChange = Math.abs(totalNorm - s.prevNorm) / s.prevNorm
              if (relChange < 0.001) {
                s.stagnationCount++
                // 3 consecutive stagnant readings ≈ 15 frames at interval=5
                if (s.stagnationCount >= 3) s.pendingAutoReset = true
              } else {
                s.stagnationCount = 0
              }
            }
          }
          s.prevNorm = safeTotalNorm
        }

        if (recordHistory) {
          const norm0 =
            s.diagHistory.length > 0 ? s.diagHistory.getHistory()[0]!.totalNorm : safeTotalNorm
          const safeNorm0 = finiteNonNegativeReadbackOrZero(norm0)
          const { R, T } = computeReflectionTransmission(safeNormLeft, safeNormRight, safeNorm0)
          const snapshot: TdseDiagnosticsSnapshot = {
            simTime: finiteReadbackOrZero(simTime),
            totalNorm: safeTotalNorm,
            maxDensity: safeMaxDens,
            normDrift:
              safeNorm0 > 0 ? finiteReadbackRatioOrZero(safeTotalNorm - safeNorm0, safeNorm0) : 0,
            normLeft: safeNormLeft,
            normRight: safeNormRight,
            R,
            T,
            ipr,
          }
          s.diagHistory.push(snapshot)
          useDiagnosticsStore.getState().pushTdseSnapshot(snapshot)
        }
        s.diagMappingInFlight = false
      })
      .catch(() => {
        s.diagMappingInFlight = false
      })
  )
}
