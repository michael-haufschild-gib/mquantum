/**
 * Eigenstate Diagnostics Store
 *
 * Tracks per-eigenstate energy and inverse participation ratio (IPR)
 * for spectral statistics (level spacing, localization analysis).
 * Updated by the render loop when eigenstates are stored via Gram-Schmidt.
 *
 * @module stores/eigenstateDiagnosticsStore
 */

import { create } from 'zustand'

import { computeLevelSpacing, type LevelSpacingResult } from '@/lib/physics/tdse/levelSpacing'

/** Per-eigenstate diagnostics snapshot. */
export interface EigenstateEntry {
  /** Eigenstate index (0 = ground state, 1 = first excited, etc.) */
  index: number
  /** Energy expectation value ⟨H⟩ (NaN if observables were off) */
  energy: number
  /** Inverse participation ratio Σ|ψ|⁴ / (Σ|ψ|²)² */
  ipr: number
  /** Orbit correlation strength: max/mean across trajectories (NaN if not computed) */
  orbitCorrelation: number
}

interface EigenstateDiagnosticsState {
  /** Ordered list of stored eigenstates with diagnostics */
  eigenstates: EigenstateEntry[]
  /** Computed level spacing statistics (null until ≥ 10 eigenstates with valid energies) */
  levelSpacing: LevelSpacingResult | null
  /** Push a new eigenstate entry and recompute statistics */
  pushEigenstate: (energy: number, ipr: number, orbitCorrelation?: number) => void
  /** Update IPR for an existing eigenstate (async readback completion) */
  updateIPR: (index: number, ipr: number) => void
  /** Update orbit correlation for an existing eigenstate (async computation) */
  updateOrbitCorrelation: (index: number, orbitCorrelation: number) => void
  /** Clear all stored data */
  clear: () => void
}

/**
 * Zustand store for eigenstate spectral diagnostics.
 *
 * @example
 * ```ts
 * const entries = useEigenstateDiagnosticsStore((s) => s.eigenstates)
 * const ls = useEigenstateDiagnosticsStore((s) => s.levelSpacing)
 * ```
 */
/** Recompute level spacing from eigenstate entries (≥10 valid energies required). */
function recomputeLevelSpacing(entries: EigenstateEntry[]): LevelSpacingResult | null {
  const valid = entries.filter((e) => Number.isFinite(e.energy))
  if (valid.length < 10) return null
  return computeLevelSpacing(
    valid.map((e) => e.energy),
    valid.map((e) => e.ipr)
  )
}

export const useEigenstateDiagnosticsStore = create<EigenstateDiagnosticsState>((set, get) => ({
  eigenstates: [],
  levelSpacing: null,

  pushEigenstate: (energy, ipr, orbitCorrelation) => {
    const current = get().eigenstates
    const entry: EigenstateEntry = {
      index: current.length,
      energy,
      ipr,
      orbitCorrelation: orbitCorrelation ?? NaN,
    }
    const updated = [...current, entry]
    set({
      eigenstates: updated,
      levelSpacing: recomputeLevelSpacing(updated),
    })
  },

  updateIPR: (index, ipr) => {
    const current = get().eigenstates
    if (index < 0 || index >= current.length) return
    const updated = current.map((e, i) => (i === index ? { ...e, ipr } : e))
    set({ eigenstates: updated, levelSpacing: recomputeLevelSpacing(updated) })
  },

  updateOrbitCorrelation: (index, orbitCorrelation) => {
    const current = get().eigenstates
    if (index < 0 || index >= current.length) return
    const updated = current.map((e, i) => (i === index ? { ...e, orbitCorrelation } : e))
    set({ eigenstates: updated })
  },

  clear: () => set({ eigenstates: [], levelSpacing: null }),
}))
