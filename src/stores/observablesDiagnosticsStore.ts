/**
 * Observable Expectation Values Diagnostics Store
 *
 * Tracks position/momentum expectation values, uncertainties, and the
 * Heisenberg uncertainty product per spatial dimension. Updated by
 * TDSEComputePass GPU readback when observables are enabled.
 *
 * Ring buffer history enables sparkline time-series display.
 *
 * @module stores/observablesDiagnosticsStore
 */

import { create } from 'zustand'

/** Maximum supported spatial dimensions */
const MAX_DIM = 11
/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

/**
 * Per-snapshot observable data pushed from GPU readback.
 */
export interface ObservablesSnapshot {
  /** Number of active dimensions in this snapshot */
  activeDims: number
  /** Position mean ⟨x_i⟩ per dimension */
  positionMean: Float64Array
  /** Position variance Δx_i² = ⟨x_i²⟩ − ⟨x_i⟩² per dimension */
  positionVariance: Float64Array
  /** Momentum mean ⟨p_i⟩ = ℏ⟨k_i⟩ per dimension */
  momentumMean: Float64Array
  /** Momentum variance Δp_i² = ℏ²(⟨k_i²⟩ − ⟨k_i⟩²) per dimension */
  momentumVariance: Float64Array
  /** Uncertainty product Δx_i · Δp_i per dimension (should be ≥ ℏ/2) */
  uncertaintyProduct: Float64Array
  /** Total energy ⟨E⟩ = ⟨T⟩ + ⟨V⟩ */
  totalEnergy: number
  /** Position-space norm Σ|ψ|²·dV */
  positionNorm: number
  /** Momentum-space norm Σ|φ|²·dk */
  momentumNorm: number
}

interface ObservablesDiagnosticsState extends ObservablesSnapshot {
  /** Whether any data has been received from GPU */
  hasData: boolean

  /** Uncertainty product history per dimension (ring buffer for sparklines) */
  historyUncertainty: Float32Array[]
  /** Total energy history (ring buffer) */
  historyEnergy: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  /** Push a new observables snapshot from GPU readback */
  pushSnapshot: (snapshot: ObservablesSnapshot) => void
  /** Reset to initial state */
  reset: () => void
}

function createEmptyHistoryArrays(): Float32Array[] {
  return Array.from({ length: MAX_DIM }, () => new Float32Array(HISTORY_LENGTH))
}

const INITIAL_STATE: Omit<ObservablesDiagnosticsState, 'pushSnapshot' | 'reset'> = {
  hasData: false,
  activeDims: 0,
  positionMean: new Float64Array(MAX_DIM),
  positionVariance: new Float64Array(MAX_DIM),
  momentumMean: new Float64Array(MAX_DIM),
  momentumVariance: new Float64Array(MAX_DIM),
  uncertaintyProduct: new Float64Array(MAX_DIM),
  totalEnergy: 0,
  positionNorm: 0,
  momentumNorm: 0,
  historyUncertainty: createEmptyHistoryArrays(),
  historyEnergy: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

/**
 * Zustand store for observable expectation value diagnostics.
 *
 * @example
 * ```ts
 * const deltaXdeltaP = useObservablesDiagnosticsStore((s) => s.uncertaintyProduct[0])
 * ```
 */
export const useObservablesDiagnosticsStore = create<ObservablesDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  pushSnapshot: (snapshot) => {
    set((state) => {
      const head = state.historyHead

      // Write uncertainty products into per-dimension ring buffers
      for (let d = 0; d < snapshot.activeDims; d++) {
        state.historyUncertainty[d]![head] = snapshot.uncertaintyProduct[d]!
      }
      state.historyEnergy[head] = snapshot.totalEnergy

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
      positionMean: new Float64Array(MAX_DIM),
      positionVariance: new Float64Array(MAX_DIM),
      momentumMean: new Float64Array(MAX_DIM),
      momentumVariance: new Float64Array(MAX_DIM),
      uncertaintyProduct: new Float64Array(MAX_DIM),
      historyUncertainty: createEmptyHistoryArrays(),
      historyEnergy: new Float32Array(HISTORY_LENGTH),
    }),
}))
