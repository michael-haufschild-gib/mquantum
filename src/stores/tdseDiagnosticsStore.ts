/**
 * TDSE Diagnostics Store
 *
 * Runtime store for TDSE simulation diagnostic metrics.
 * Updated by TDSEComputePass after each GPU readback.
 * UI components (energy diagram HUD) subscribe to individual fields.
 *
 * Includes ring buffer history for time-series export and sparkline display.
 *
 * @module stores/tdseDiagnosticsStore
 */

import { create } from 'zustand'

/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

interface TdseDiagnosticsSnapshot {
  simTime: number
  totalNorm: number
  maxDensity: number
  normDrift: number
  normLeft: number
  normRight: number
  R: number
  T: number
  ipr: number
}

interface TdseDiagnosticsState extends TdseDiagnosticsSnapshot {
  /** Whether any diagnostics data has been received */
  hasData: boolean

  /** Simulation time ring buffer */
  historySimTime: Float32Array
  /** Norm time-series ring buffer */
  historyNorm: Float32Array
  /** Reflection coefficient time-series ring buffer */
  historyR: Float32Array
  /** Transmission coefficient time-series ring buffer */
  historyT: Float32Array
  /** IPR time-series ring buffer (inverse participation ratio) */
  historyIpr: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  /** Push a new diagnostics snapshot */
  pushSnapshot: (snapshot: TdseDiagnosticsSnapshot) => void
  /** Reset to initial state */
  reset: () => void
}

const INITIAL_SNAPSHOT: TdseDiagnosticsSnapshot = {
  totalNorm: 1,
  maxDensity: 0,
  normDrift: 0,
  normLeft: 0,
  normRight: 0,
  R: 0,
  T: 0,
  ipr: 0,
  simTime: 0,
}

export const useTdseDiagnosticsStore = create<TdseDiagnosticsState>((set) => ({
  ...INITIAL_SNAPSHOT,
  hasData: false,
  historySimTime: new Float32Array(HISTORY_LENGTH),
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historyR: new Float32Array(HISTORY_LENGTH),
  historyT: new Float32Array(HISTORY_LENGTH),
  historyIpr: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,

  pushSnapshot: (snapshot) => {
    set((state) => {
      const head = state.historyHead
      state.historySimTime[head] = snapshot.simTime
      state.historyNorm[head] = snapshot.totalNorm
      state.historyR[head] = snapshot.R
      state.historyT[head] = snapshot.T
      state.historyIpr[head] = snapshot.ipr

      return {
        ...snapshot,
        hasData: true,
        historyHead: (head + 1) % HISTORY_LENGTH,
        historyCount: Math.min(state.historyCount + 1, HISTORY_LENGTH),
      }
    })
  },

  reset: () => {
    set({
      ...INITIAL_SNAPSHOT,
      hasData: false,
      historyNorm: new Float32Array(HISTORY_LENGTH),
      historyR: new Float32Array(HISTORY_LENGTH),
      historyT: new Float32Array(HISTORY_LENGTH),
      historyIpr: new Float32Array(HISTORY_LENGTH),
      historyHead: 0,
      historyCount: 0,
    })
  },
}))
