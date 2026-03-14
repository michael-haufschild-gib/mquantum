/**
 * Zustand store for Pauli spinor diagnostics.
 *
 * Updated by PauliComputePass after GPU readback of reduction buffers.
 * Read by PauliAnalysisSection for live observable display.
 */

import { create } from 'zustand'

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
}

export const usePauliDiagnosticsStore = create<PauliDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  update: (snapshot) => set({ ...snapshot, hasData: true }),

  reset: () => set(INITIAL_STATE),
}))
