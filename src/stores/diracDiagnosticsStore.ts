/**
 * Zustand store for Dirac equation diagnostics.
 *
 * Updated by DiracComputePass after GPU readback of reduction buffers.
 * Read by DiracAnalysisSection and EnergyDiagramHUD.
 */

import { create } from 'zustand'

interface DiracDiagnosticsState {
  /** Whether any diagnostic data has been received */
  hasData: boolean
  /** Total probability norm ||ψ||² (should stay ≈ 1) */
  totalNorm: number
  /** Norm drift from initial value (percentage) */
  normDrift: number
  /** Maximum density across all grid sites */
  maxDensity: number
  /** Upper spinor component fraction of total probability (representation-basis, not energy projection) */
  particleFraction: number
  /** Lower spinor component fraction (representation-basis, not energy projection) */
  antiparticleFraction: number
  /** Mean position ⟨x⟩ (for tracking Zitterbewegung) */
  meanPosition: number[]
  /** Compton wavelength λ_C = ℏ/(mc) at current parameters */
  comptonWavelength: number
  /** Zitterbewegung frequency ω_Z = 2mc²/ℏ */
  zitterbewegungFreq: number
  /** Klein threshold V_K = 2mc² */
  kleinThreshold: number

  update: (snapshot: Partial<DiracDiagnosticsState>) => void
  reset: () => void
}

const INITIAL_STATE = {
  hasData: false,
  totalNorm: 0,
  normDrift: 0,
  maxDensity: 0,
  particleFraction: 0,
  antiparticleFraction: 0,
  meanPosition: [0, 0, 0],
  comptonWavelength: 1,
  zitterbewegungFreq: 2,
  kleinThreshold: 2,
}

export const useDiracDiagnosticsStore = create<DiracDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  update: (snapshot) => set({ ...snapshot, hasData: true }),

  reset: () => set(INITIAL_STATE),
}))
