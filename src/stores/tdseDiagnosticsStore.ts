/**
 * TDSE Diagnostics Store
 *
 * Runtime store for TDSE simulation diagnostic metrics.
 * Updated by TDSEComputePass after each GPU readback.
 * UI components (energy diagram HUD) subscribe to individual fields.
 *
 * @module stores/tdseDiagnosticsStore
 */

import { create } from 'zustand'

interface TdseDiagnosticsState {
  /** Total norm ||psi||^2 */
  totalNorm: number
  /** Maximum probability density */
  maxDensity: number
  /** Fractional norm drift from initial */
  normDrift: number
  /** Norm of psi left of barrier */
  normLeft: number
  /** Norm of psi right of barrier */
  normRight: number
  /** Reflection coefficient */
  R: number
  /** Transmission coefficient */
  T: number
  /** Simulation time of latest snapshot */
  simTime: number
  /** Whether any diagnostics data has been received */
  hasData: boolean

  /** Push a new diagnostics snapshot */
  pushSnapshot: (snapshot: {
    simTime: number
    totalNorm: number
    maxDensity: number
    normDrift: number
    normLeft: number
    normRight: number
    R: number
    T: number
  }) => void
  /** Reset to initial state */
  reset: () => void
}

export const useTdseDiagnosticsStore = create<TdseDiagnosticsState>((set) => ({
  totalNorm: 1,
  maxDensity: 0,
  normDrift: 0,
  normLeft: 0,
  normRight: 0,
  R: 0,
  T: 0,
  simTime: 0,
  hasData: false,

  pushSnapshot: (snapshot) => {
    set({
      totalNorm: snapshot.totalNorm,
      maxDensity: snapshot.maxDensity,
      normDrift: snapshot.normDrift,
      normLeft: snapshot.normLeft,
      normRight: snapshot.normRight,
      R: snapshot.R,
      T: snapshot.T,
      simTime: snapshot.simTime,
      hasData: true,
    })
  },

  reset: () => {
    set({
      totalNorm: 1,
      maxDensity: 0,
      normDrift: 0,
      normLeft: 0,
      normRight: 0,
      R: 0,
      T: 0,
      simTime: 0,
      hasData: false,
    })
  },
}))
