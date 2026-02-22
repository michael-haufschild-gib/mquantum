/**
 * Open Quantum Diagnostics Store
 *
 * Runtime store for density matrix diagnostic metrics.
 * Decoupled from the scene config store — holds transient metrics
 * and a fixed-size ring buffer for sparkline charts.
 *
 * @example
 * ```ts
 * const purity = useOpenQuantumDiagnosticsStore((s) => s.purity)
 * ```
 */

import { create } from 'zustand'
import type { OpenQuantumMetrics } from '@/lib/physics/openQuantum/types'

/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

/** Maximum basis states for population tracking */
const MAX_POPULATIONS = 14

/**
 * Open quantum diagnostics state
 */
interface OpenQuantumDiagnosticsState {
  // --- Current metrics ---
  /** Tr(ρ²) ∈ [1/K, 1] */
  purity: number
  /** 1 − Tr(ρ²) */
  linearEntropy: number
  /** −Tr(ρ ln ρ) */
  vonNeumannEntropy: number
  /** Σ_{k≠l} |ρ_{kl}| */
  coherenceMagnitude: number
  /** Re(ρ_{00}) */
  groundPopulation: number
  /** Tr(ρ) — should be ≈1 */
  trace: number

  // --- Per-state populations (hydrogen mode) ---
  /** ρ_{kk} for each basis state (length = basisCount) */
  populations: Float32Array
  /** Spectroscopic labels for each basis state */
  basisLabels: string[]
  /** Number of active basis states */
  basisCount: number

  // --- Ring buffer for sparkline charts ---
  /** Purity history */
  historyPurity: Float32Array
  /** Entropy history */
  historyEntropy: Float32Array
  /** Coherence history */
  historyCoherence: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  // --- Actions ---
  /** Push a new metrics snapshot into current values and ring buffer */
  pushMetrics: (metrics: OpenQuantumMetrics) => void
  /** Update per-state populations and labels (hydrogen mode) */
  setPopulations: (populations: Float32Array, labels: string[]) => void
  /** Reset all metrics and history to initial state */
  reset: () => void
}

/**
 * Zustand store for open quantum system diagnostic metrics.
 *
 * Updated each frame by the renderer when open quantum is active.
 * UI components subscribe to individual fields for minimal re-renders.
 */
export const useOpenQuantumDiagnosticsStore = create<OpenQuantumDiagnosticsState>((set) => ({
  purity: 1,
  linearEntropy: 0,
  vonNeumannEntropy: 0,
  coherenceMagnitude: 0,
  groundPopulation: 1,
  trace: 1,

  populations: new Float32Array(MAX_POPULATIONS),
  basisLabels: [],
  basisCount: 0,

  historyPurity: new Float32Array(HISTORY_LENGTH),
  historyEntropy: new Float32Array(HISTORY_LENGTH),
  historyCoherence: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,

  pushMetrics: (metrics) => {
    set((state) => {
      const head = state.historyHead
      state.historyPurity[head] = metrics.purity
      state.historyEntropy[head] = metrics.vonNeumannEntropy
      state.historyCoherence[head] = metrics.coherenceMagnitude

      return {
        purity: metrics.purity,
        linearEntropy: metrics.linearEntropy,
        vonNeumannEntropy: metrics.vonNeumannEntropy,
        coherenceMagnitude: metrics.coherenceMagnitude,
        groundPopulation: metrics.groundPopulation,
        trace: metrics.trace,
        historyHead: (head + 1) % HISTORY_LENGTH,
        historyCount: Math.min(state.historyCount + 1, HISTORY_LENGTH),
      }
    })
  },

  setPopulations: (populations, labels) => {
    set({
      populations,
      basisLabels: labels,
      basisCount: labels.length,
    })
  },

  reset: () => {
    set({
      purity: 1,
      linearEntropy: 0,
      vonNeumannEntropy: 0,
      coherenceMagnitude: 0,
      groundPopulation: 1,
      trace: 1,
      populations: new Float32Array(MAX_POPULATIONS),
      basisLabels: [],
      basisCount: 0,
      historyPurity: new Float32Array(HISTORY_LENGTH),
      historyEntropy: new Float32Array(HISTORY_LENGTH),
      historyCoherence: new Float32Array(HISTORY_LENGTH),
      historyHead: 0,
      historyCount: 0,
    })
  },
}))
