/**
 * BEC diagnostics store — holds computed observables from GPU readback.
 *
 * Updated by TDSEComputePass when in BEC mode, read by EnergyDiagramHUD
 * and BECControls for real-time diagnostic display.
 *
 * @module
 */

import { create } from 'zustand'

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
  /** Estimated vortex count (future: phase winding analysis) */
  vortexCount: number

  /** Push new diagnostic snapshot */
  update: (snapshot: Partial<BecDiagnosticsState>) => void
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
  update: (snapshot) => set({ ...snapshot, hasData: true }),
  reset: () => set(INITIAL_STATE),
}))
