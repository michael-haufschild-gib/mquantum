/**
 * FSF Diagnostics Store
 *
 * Runtime store for Free Scalar Field simulation diagnostic metrics.
 * Updated by FreeScalarFieldComputePass after each GPU readback.
 * UI components (FSFAnalysisSection) subscribe to individual fields.
 *
 * @module stores/fsfDiagnosticsStore
 */

import { create } from 'zustand'

/**
 * FSF diagnostic snapshot pushed from GPU readback.
 */
export interface FsfDiagnosticsSnapshot {
  /** Total field energy (kinetic + gradient + mass + potential) */
  totalEnergy: number
  /** Total field norm sum(phi^2) * dV */
  totalNorm: number
  /** Maximum |phi| value across the lattice */
  maxPhi: number
  /** Maximum |pi| value across the lattice */
  maxPi: number
  /** Energy drift from initial value (fraction) */
  energyDrift: number
  /** Mean field value <phi> */
  meanPhi: number
  /** Field variance var(phi) */
  variancePhi: number
}

interface FsfDiagnosticsState extends FsfDiagnosticsSnapshot {
  /** Whether any diagnostics data has been received */
  hasData: boolean
  /** Initial energy for drift tracking */
  initialEnergy: number

  /** Push a new diagnostics snapshot */
  pushSnapshot: (snapshot: FsfDiagnosticsSnapshot) => void
  /** Reset to initial state */
  reset: () => void
}

const INITIAL_STATE: Omit<FsfDiagnosticsState, 'pushSnapshot' | 'reset'> = {
  hasData: false,
  totalEnergy: 0,
  totalNorm: 0,
  maxPhi: 0,
  maxPi: 0,
  energyDrift: 0,
  meanPhi: 0,
  variancePhi: 0,
  initialEnergy: 0,
}

/**
 * Zustand store for FSF diagnostic observables.
 *
 * @example
 * ```ts
 * const energy = useFsfDiagnosticsStore((s) => s.totalEnergy)
 * ```
 */
export const useFsfDiagnosticsStore = create<FsfDiagnosticsState>((set, get) => ({
  ...INITIAL_STATE,

  pushSnapshot: (snapshot) => {
    const state = get()
    const initialEnergy = state.hasData ? state.initialEnergy : snapshot.totalEnergy
    const energyDrift =
      initialEnergy !== 0
        ? (snapshot.totalEnergy - initialEnergy) / Math.abs(initialEnergy)
        : 0
    set({
      ...snapshot,
      energyDrift,
      initialEnergy,
      hasData: true,
    })
  },

  reset: () => set(INITIAL_STATE),
}))
