/**
 * Quantum Walk Diagnostics Store
 *
 * Runtime store for quantum walk simulation diagnostic metrics.
 * Updated by QuantumWalkComputePass after each GPU norm readback.
 *
 * Key invariants:
 * - Unitary walk (no absorber): totalNorm ≈ 1.0 (norm conservation)
 * - Ballistic spreading: positionVariance ∝ t² (quantum walk signature)
 *
 * @module stores/qwDiagnosticsStore
 */

import { create } from 'zustand'

interface QwDiagnosticsState {
  /** Whether any diagnostics data has been received */
  hasData: boolean
  /** Total wavefunction norm: Σ |c_j(site)|² */
  totalNorm: number
  /** Relative norm drift from initial: (norm - norm₀) / norm₀ */
  normDrift: number
  /** Number of coin+shift steps executed */
  stepCount: number
  /** Position mean along dimension 0 (lattice units) */
  positionMean: number
  /** Position variance along dimension 0 (lattice units²) */
  positionVariance: number
  /** Initial norm captured at first readback */
  initialNorm: number

  /** Push new diagnostics from GPU readback */
  pushDiagnostics: (totalNorm: number, stepCount: number, posSum: number, posSqSum: number) => void
  /** Reset to initial state */
  reset: () => void
}

/** @internal */
export const useQwDiagnosticsStore = create<QwDiagnosticsState>((set) => ({
  hasData: false,
  totalNorm: 1,
  normDrift: 0,
  stepCount: 0,
  positionMean: 0,
  positionVariance: 0,
  initialNorm: -1,

  pushDiagnostics: (totalNorm, stepCount, posSum, posSqSum) => {
    set((state) => {
      const norm0 = state.initialNorm < 0 ? totalNorm : state.initialNorm
      const mean = totalNorm > 0 ? posSum / totalNorm : 0
      const variance = totalNorm > 0 ? posSqSum / totalNorm - mean * mean : 0
      return {
        hasData: true,
        totalNorm,
        normDrift: norm0 > 0 ? (totalNorm - norm0) / norm0 : 0,
        stepCount,
        positionMean: mean,
        positionVariance: Math.max(0, variance),
        initialNorm: norm0,
      }
    })
  },

  reset: () => {
    set({
      hasData: false,
      totalNorm: 1,
      normDrift: 0,
      stepCount: 0,
      positionMean: 0,
      positionVariance: 0,
      initialNorm: -1,
    })
  },
}))
