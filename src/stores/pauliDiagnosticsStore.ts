/**
 * Zustand store for Pauli spinor diagnostics.
 *
 * Updated by PauliComputePass after GPU readback of reduction buffers.
 * Read by PauliAnalysisSection for live observable display.
 *
 * Includes ring buffer history for time-series export and sparkline display.
 *
 * @module stores/pauliDiagnosticsStore
 */

import { create } from 'zustand'

/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

interface PauliDiagnosticsState {
  /** Whether any diagnostic data has been received */
  hasData: boolean
  /** Total probability norm ||ψ||² (should stay ≈ 1) */
  totalNorm: number
  /** Norm drift from initial value (percentage) */
  normDrift: number
  /** Maximum density across all grid sites */
  maxDensity: number
  /** Spin-up component fraction of total probability */
  spinUpFraction: number
  /** Spin-down component fraction */
  spinDownFraction: number
  /** Spin expectation value ⟨σ_z⟩ ∈ [-1, 1] */
  spinExpectationZ: number
  /** Off-diagonal coherence magnitude |⟨↑|ρ|↓⟩| */
  coherenceMagnitude: number
  /** Mean position ⟨x⟩ */
  meanPosition: number[]
  /** Larmor precession frequency ω_L = μ_B B₀ / ℏ */
  larmorFrequency: number

  /** Norm time-series ring buffer */
  historyNorm: Float32Array
  /** Spin-up fraction time-series ring buffer */
  historySpinUpFrac: Float32Array
  /** ⟨σ_z⟩ expectation value time-series ring buffer */
  historySpinExpZ: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  update: (snapshot: Partial<PauliDiagnosticsState>) => void
  reset: () => void
}

const INITIAL_STATE = {
  hasData: false,
  totalNorm: 0,
  normDrift: 0,
  maxDensity: 0,
  spinUpFraction: 0,
  spinDownFraction: 0,
  spinExpectationZ: 0,
  coherenceMagnitude: 0,
  meanPosition: [0, 0, 0],
  larmorFrequency: 0,
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historySpinUpFrac: new Float32Array(HISTORY_LENGTH),
  historySpinExpZ: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

export const usePauliDiagnosticsStore = create<PauliDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  update: (snapshot) => {
    set((state) => {
      const head = state.historyHead
      state.historyNorm[head] = snapshot.totalNorm ?? state.totalNorm
      state.historySpinUpFrac[head] = snapshot.spinUpFraction ?? state.spinUpFraction
      state.historySpinExpZ[head] = snapshot.spinExpectationZ ?? state.spinExpectationZ

      return {
        ...snapshot,
        hasData: true,
        historyHead: (head + 1) % HISTORY_LENGTH,
        historyCount: Math.min(state.historyCount + 1, HISTORY_LENGTH),
      }
    })
  },

  reset: () =>
    set({
      ...INITIAL_STATE,
      historyNorm: new Float32Array(HISTORY_LENGTH),
      historySpinUpFrac: new Float32Array(HISTORY_LENGTH),
      historySpinExpZ: new Float32Array(HISTORY_LENGTH),
      meanPosition: [0, 0, 0],
    }),
}))
