/**
 * Zustand store for Dirac equation diagnostics.
 *
 * Updated by DiracComputePass after GPU readback of reduction buffers.
 * Read by DiracAnalysisSection and EnergyDiagramHUD.
 *
 * Includes ring buffer history for time-series export and sparkline display.
 *
 * @module stores/diracDiagnosticsStore
 */

import { create } from 'zustand'

/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

interface DiracDiagnosticsState {
  /** Whether any diagnostic data has been received */
  hasData: boolean
  /** Monotonically increasing counter — incremented on each GPU readback. Never reset. */
  readbackGeneration: number
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

  /** Norm time-series ring buffer */
  historyNorm: Float32Array
  /** Particle fraction time-series ring buffer */
  historyParticleFrac: Float32Array
  /** Antiparticle fraction time-series ring buffer */
  historyAntiparticleFrac: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  update: (snapshot: Partial<DiracDiagnosticsState>) => void
  reset: () => void
}

const INITIAL_STATE = {
  hasData: false,
  readbackGeneration: 0,
  totalNorm: 0,
  normDrift: 0,
  maxDensity: 0,
  particleFraction: 0,
  antiparticleFraction: 0,
  meanPosition: [0, 0, 0],
  comptonWavelength: 1,
  zitterbewegungFreq: 2,
  kleinThreshold: 2,
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historyParticleFrac: new Float32Array(HISTORY_LENGTH),
  historyAntiparticleFrac: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

export const useDiracDiagnosticsStore = create<DiracDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  update: (snapshot) => {
    set((state) => {
      const head = state.historyHead
      state.historyNorm[head] = snapshot.totalNorm ?? state.totalNorm
      state.historyParticleFrac[head] = snapshot.particleFraction ?? state.particleFraction
      state.historyAntiparticleFrac[head] =
        snapshot.antiparticleFraction ?? state.antiparticleFraction

      return {
        ...snapshot,
        hasData: true,
        readbackGeneration: state.readbackGeneration + 1,
        historyHead: (head + 1) % HISTORY_LENGTH,
        historyCount: Math.min(state.historyCount + 1, HISTORY_LENGTH),
      }
    })
  },

  reset: () =>
    set((state) => ({
      ...INITIAL_STATE,
      readbackGeneration: state.readbackGeneration,
      historyNorm: new Float32Array(HISTORY_LENGTH),
      historyParticleFrac: new Float32Array(HISTORY_LENGTH),
      historyAntiparticleFrac: new Float32Array(HISTORY_LENGTH),
      meanPosition: [0, 0, 0],
    })),
}))
