/**
 * BEC diagnostics store — holds computed observables from GPU readback.
 *
 * Updated by TDSEComputePass when in BEC mode, read by EnergyDiagramHUD
 * and BECControls for real-time diagnostic display.
 *
 * Includes ring buffer history for time-series export and sparkline display.
 *
 * @module
 */

import { create } from 'zustand'

import { NUM_SPECTRUM_BINS } from '@/lib/physics/bec/incompressibleSpectrum'

/** Ring buffer length — ~2s at 60fps */
const HISTORY_LENGTH = 120

/**
 * BEC diagnostic observables state.
 */
interface BecDiagnosticsState {
  /** Whether diagnostics data has been received at least once */
  hasData: boolean
  /** Total wavefunction norm ||ψ||² */
  totalNorm: number
  /** Peak density max(|ψ|²) */
  maxDensity: number
  /** Norm drift from initial value (fraction) */
  normDrift: number
  /** Chemical potential μ = g·n₀ */
  chemicalPotential: number
  /** Healing length ξ at peak density */
  healingLength: number
  /** Bogoliubov sound speed at peak density */
  soundSpeed: number
  /** Thomas-Fermi radius */
  thomasFermiRadius: number
  /** Estimated vortex count from plaquette phase-winding detection */
  vortexCount: number
  /** Total vortex plaquettes detected (raw count before deduplication) */
  vortexPlaquettes: number
  /** Positive-charge vortex plaquettes */
  vortexPositiveCharge: number
  /** Negative-charge vortex plaquettes */
  vortexNegativeCharge: number

  /** Incompressible kinetic energy spectrum E_incomp(k) — log-binned by |k| */
  incompressibleSpectrum: Float32Array
  /** Bin-center k values for the incompressible spectrum (log-spaced) */
  spectrumKValues: Float32Array
  /** Total incompressible kinetic energy (integral of spectrum) */
  totalIncompressibleEnergy: number
  /** Total compressible kinetic energy */
  totalCompressibleEnergy: number

  /** Norm time-series ring buffer */
  historyNorm: Float32Array
  /** Chemical potential time-series ring buffer */
  historyChemPot: Float32Array
  /** Healing length time-series ring buffer */
  historyHealingLen: Float32Array
  /** Current write head in ring buffer */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH) */
  historyCount: number

  /** Push new diagnostic snapshot */
  update: (snapshot: Partial<BecDiagnosticsState>) => void
  /** Update the incompressible kinetic energy spectrum */
  setIncompressibleSpectrum: (
    spectrum: Float32Array,
    kValues: Float32Array,
    totalIncomp: number,
    totalComp: number
  ) => void
  /** Reset all diagnostics to defaults */
  reset: () => void
}

const INITIAL_STATE = {
  hasData: false,
  totalNorm: 1.0,
  maxDensity: 0,
  normDrift: 0,
  chemicalPotential: 0,
  healingLength: 0,
  soundSpeed: 0,
  thomasFermiRadius: 0,
  vortexCount: 0,
  vortexPlaquettes: 0,
  vortexPositiveCharge: 0,
  vortexNegativeCharge: 0,
  incompressibleSpectrum: new Float32Array(NUM_SPECTRUM_BINS),
  spectrumKValues: new Float32Array(NUM_SPECTRUM_BINS),
  totalIncompressibleEnergy: 0,
  totalCompressibleEnergy: 0,
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historyChemPot: new Float32Array(HISTORY_LENGTH),
  historyHealingLen: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

/**
 * Zustand store for BEC diagnostic observables.
 *
 * @example
 * ```ts
 * const mu = useBecDiagnosticsStore((s) => s.chemicalPotential)
 * ```
 */
export const useBecDiagnosticsStore = create<BecDiagnosticsState>((set) => ({
  ...INITIAL_STATE,

  update: (snapshot) => {
    set((state) => {
      const head = state.historyHead
      const norm = snapshot.totalNorm ?? state.totalNorm
      const chemPot = snapshot.chemicalPotential ?? state.chemicalPotential
      const healingLen = snapshot.healingLength ?? state.healingLength

      state.historyNorm[head] = norm
      state.historyChemPot[head] = chemPot
      state.historyHealingLen[head] = healingLen

      return {
        ...snapshot,
        hasData: true,
        historyHead: (head + 1) % HISTORY_LENGTH,
        historyCount: Math.min(state.historyCount + 1, HISTORY_LENGTH),
      }
    })
  },

  setIncompressibleSpectrum: (spectrum, kValues, totalIncomp, totalComp) =>
    set({
      incompressibleSpectrum: spectrum,
      spectrumKValues: kValues,
      totalIncompressibleEnergy: totalIncomp,
      totalCompressibleEnergy: totalComp,
    }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      incompressibleSpectrum: new Float32Array(NUM_SPECTRUM_BINS),
      spectrumKValues: new Float32Array(NUM_SPECTRUM_BINS),
      historyNorm: new Float32Array(HISTORY_LENGTH),
      historyChemPot: new Float32Array(HISTORY_LENGTH),
      historyHealingLen: new Float32Array(HISTORY_LENGTH),
    }),
}))
