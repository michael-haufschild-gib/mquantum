/**
 * Unified Diagnostics Store
 *
 * Single Zustand store for all quantum-mode diagnostic metrics.
 * Each mode's data lives in a typed channel object (e.g. `state.tdse`,
 * `state.bec`). Actions are top-level with mode-prefixed names.
 *
 * Replaces 10 individual diagnostics stores:
 * tdseDiagnosticsStore, becDiagnosticsStore, diracDiagnosticsStore,
 * fsfDiagnosticsStore, pauliDiagnosticsStore, qwDiagnosticsStore,
 * eigenstateDiagnosticsStore, observablesDiagnosticsStore,
 * openQuantumDiagnosticsStore, densityDiagnosticsStore
 *
 * @module stores/diagnosticsStore
 */

import { create } from 'zustand'

import { MAX_DIMENSION } from '@/constants/dimension'
import { NUM_SPECTRUM_BINS } from '@/lib/physics/bec/incompressibleSpectrum'
import { computeLevelSpacing } from '@/lib/physics/tdse/levelSpacing'

import {
  BEC_INITIAL,
  createEmptyHistoryArrays,
  createEmptyPositionMeanHistory,
  DENSITY_INITIAL,
  DIRAC_INITIAL,
  EIGENSTATE_INITIAL,
  FSF_INITIAL,
  NUM_ENERGY_BINS,
  OBSERVABLES_INITIAL,
  OPEN_QUANTUM_INITIAL,
  PAULI_INITIAL,
  QW_INITIAL,
  TDSE_INITIAL,
} from './diagnostics/initialStates'
import {
  advanceRingBuffer,
  type BecChannelData,
  type DensityChannelData,
  type DensitySnapshot,
  type DiracChannelData,
  type EigenstateChannelData,
  type EigenstateEntry,
  type FsfChannelData,
  type FsfDiagnosticsSnapshot,
  HISTORY_LENGTH,
  MAX_POPULATIONS,
  type ObservablesChannelData,
  type ObservablesSnapshot,
  type OpenQuantumChannelData,
  type OpenQuantumMetrics,
  type PauliChannelData,
  type QwChannelData,
  type TdseChannelData,
  type TdseSnapshot,
  type WavefunctionSliceData,
} from './diagnostics/types'

// ─── Eigenstate Helpers ──────────────────────────────────────────────────────

function recomputeLevelSpacing(entries: EigenstateEntry[]) {
  const valid = entries.filter((e) => Number.isFinite(e.energy))
  if (valid.length < 10) return null
  return computeLevelSpacing(
    valid.map((e) => e.energy),
    valid.map((e) => e.ipr)
  )
}

// ─── Store Type ──────────────────────────────────────────────────────────────

interface DiagnosticsState {
  // Channel data
  tdse: TdseChannelData
  bec: BecChannelData
  dirac: DiracChannelData
  fsf: FsfChannelData
  pauli: PauliChannelData
  qw: QwChannelData
  eigenstate: EigenstateChannelData
  observables: ObservablesChannelData
  openQuantum: OpenQuantumChannelData
  density: DensityChannelData

  // TDSE actions
  pushTdseSnapshot: (snapshot: TdseSnapshot) => void
  resetTdse: () => void

  // BEC actions
  updateBec: (snapshot: Partial<BecChannelData>) => void
  setBecIncompressibleSpectrum: (
    spectrum: Float32Array,
    kValues: Float32Array,
    totalIncomp: number,
    totalComp: number
  ) => void
  clearBecIncompressibleSpectrum: () => void
  resetBec: () => void

  // Dirac actions
  updateDirac: (snapshot: Partial<DiracChannelData>) => void
  resetDirac: () => void

  // FSF actions
  pushFsfSnapshot: (snapshot: FsfDiagnosticsSnapshot) => void
  pushFsfParticleNumber: (value: number) => void
  resetFsf: () => void

  // Pauli actions
  updatePauli: (snapshot: Partial<PauliChannelData>) => void
  resetPauli: () => void

  // Quantum Walk actions
  pushQwDiagnostics: (
    totalNorm: number,
    stepCount: number,
    posSum: number,
    posSqSum: number
  ) => void
  resetQw: () => void

  // Eigenstate actions
  pushEigenstate: (energy: number, ipr: number, orbitCorrelation?: number) => void
  updateEigenstateIPR: (index: number, ipr: number) => void
  updateEigenstateOrbitCorrelation: (index: number, orbitCorrelation: number) => void
  clearEigenstate: () => void

  // Observables actions
  pushObservablesSnapshot: (snapshot: ObservablesSnapshot) => void
  setObservablesEnergySpectrum: (spectrum: Float32Array) => void
  resetObservables: () => void

  // Open Quantum actions
  pushOpenQuantumMetrics: (metrics: OpenQuantumMetrics) => void
  setOpenQuantumPopulations: (populations: Float32Array, labels: string[]) => void
  resetOpenQuantum: () => void

  // Density actions
  pushDensitySnapshot: (snapshot: DensitySnapshot) => void
  pushDensitySlices: (slices: WavefunctionSliceData) => void
  resetDensity: () => void
}

// ─── Store Creation ──────────────────────────────────────────────────────────

/**
 * Unified diagnostics store for all quantum modes.
 *
 * Each mode's data is a typed channel object. Actions are flat with
 * mode-prefixed names.
 *
 * @example
 * ```ts
 * // React hook
 * const norm = useDiagnosticsStore((s) => s.tdse.totalNorm)
 *
 * // Imperative (GPU readback)
 * useDiagnosticsStore.getState().pushTdseSnapshot(snapshot)
 * ```
 */
export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  // ── Channel Data ─────────────────────────────────────────────────────────
  tdse: { ...TDSE_INITIAL },
  bec: { ...BEC_INITIAL },
  dirac: { ...DIRAC_INITIAL },
  fsf: { ...FSF_INITIAL },
  pauli: { ...PAULI_INITIAL },
  qw: { ...QW_INITIAL },
  eigenstate: { ...EIGENSTATE_INITIAL },
  observables: { ...OBSERVABLES_INITIAL },
  openQuantum: { ...OPEN_QUANTUM_INITIAL },
  density: { ...DENSITY_INITIAL },

  // ── TDSE Actions ─────────────────────────────────────────────────────────

  pushTdseSnapshot: (snapshot) => {
    set((state) => {
      const ch = state.tdse
      const head = ch.historyHead
      ch.historySimTime[head] = snapshot.simTime
      ch.historyNorm[head] = snapshot.totalNorm
      ch.historyR[head] = snapshot.R
      ch.historyT[head] = snapshot.T
      ch.historyIpr[head] = snapshot.ipr
      return {
        tdse: {
          ...ch,
          ...snapshot,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  resetTdse: () => {
    set((state) => ({
      tdse: {
        ...TDSE_INITIAL,
        readbackGeneration: state.tdse.readbackGeneration,
        historySimTime: new Float32Array(HISTORY_LENGTH),
        historyNorm: new Float32Array(HISTORY_LENGTH),
        historyR: new Float32Array(HISTORY_LENGTH),
        historyT: new Float32Array(HISTORY_LENGTH),
        historyIpr: new Float32Array(HISTORY_LENGTH),
      },
    }))
  },

  // ── BEC Actions ──────────────────────────────────────────────────────────

  updateBec: (snapshot) => {
    set((state) => {
      const ch = state.bec
      const head = ch.historyHead
      const norm = snapshot.totalNorm ?? ch.totalNorm
      const chemPot = snapshot.chemicalPotential ?? ch.chemicalPotential
      const healingLen = snapshot.healingLength ?? ch.healingLength
      ch.historyNorm[head] = norm
      ch.historyChemPot[head] = chemPot
      ch.historyHealingLen[head] = healingLen
      return {
        bec: {
          ...ch,
          ...snapshot,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  setBecIncompressibleSpectrum: (spectrum, kValues, totalIncomp, totalComp) => {
    set((state) => ({
      bec: {
        ...state.bec,
        incompressibleSpectrum: spectrum,
        spectrumKValues: kValues,
        totalIncompressibleEnergy: totalIncomp,
        totalCompressibleEnergy: totalComp,
      },
    }))
  },

  clearBecIncompressibleSpectrum: () => {
    set((state) => {
      const ch = state.bec
      const alreadyClear =
        ch.totalIncompressibleEnergy === 0 &&
        ch.totalCompressibleEnergy === 0 &&
        ch.incompressibleSpectrum.every((value) => value === 0) &&
        ch.spectrumKValues.every((value) => value === 0)
      if (alreadyClear) return state
      return {
        bec: {
          ...ch,
          incompressibleSpectrum: new Float32Array(NUM_SPECTRUM_BINS),
          spectrumKValues: new Float32Array(NUM_SPECTRUM_BINS),
          totalIncompressibleEnergy: 0,
          totalCompressibleEnergy: 0,
        },
      }
    })
  },

  resetBec: () => {
    set((state) => ({
      bec: {
        ...BEC_INITIAL,
        readbackGeneration: state.bec.readbackGeneration,
        incompressibleSpectrum: new Float32Array(NUM_SPECTRUM_BINS),
        spectrumKValues: new Float32Array(NUM_SPECTRUM_BINS),
        historyNorm: new Float32Array(HISTORY_LENGTH),
        historyChemPot: new Float32Array(HISTORY_LENGTH),
        historyHealingLen: new Float32Array(HISTORY_LENGTH),
      },
    }))
  },

  // ── Dirac Actions ────────────────────────────────────────────────────────

  updateDirac: (snapshot) => {
    set((state) => {
      const ch = state.dirac
      const head = ch.historyHead
      ch.historyNorm[head] = snapshot.totalNorm ?? ch.totalNorm
      ch.historyParticleFrac[head] = snapshot.particleFraction ?? ch.particleFraction
      ch.historyAntiparticleFrac[head] = snapshot.antiparticleFraction ?? ch.antiparticleFraction
      return {
        dirac: {
          ...ch,
          ...snapshot,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  resetDirac: () => {
    set((state) => ({
      dirac: {
        ...DIRAC_INITIAL,
        readbackGeneration: state.dirac.readbackGeneration,
        historyNorm: new Float32Array(HISTORY_LENGTH),
        historyParticleFrac: new Float32Array(HISTORY_LENGTH),
        historyAntiparticleFrac: new Float32Array(HISTORY_LENGTH),
        meanPosition: [0, 0, 0],
      },
    }))
  },

  // ── FSF Actions ──────────────────────────────────────────────────────────

  pushFsfSnapshot: (snapshot) => {
    set((state) => {
      const ch = state.fsf
      const initialEnergy = ch.hasData ? ch.initialEnergy : snapshot.totalEnergy
      const energyDrift =
        initialEnergy !== 0 ? (snapshot.totalEnergy - initialEnergy) / Math.abs(initialEnergy) : 0
      const head = ch.historyHead
      ch.historyEnergy[head] = snapshot.totalEnergy
      ch.historyNorm[head] = snapshot.totalNorm
      return {
        fsf: {
          ...ch,
          ...snapshot,
          energyDrift,
          initialEnergy,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  pushFsfParticleNumber: (value) => {
    set((state) => {
      const ch = state.fsf
      const head = ch.historyParticlesHead
      ch.historyParticles[head] = value
      return {
        fsf: {
          ...ch,
          totalParticles: value,
          historyParticlesHead: (head + 1) % HISTORY_LENGTH,
          historyParticlesCount: Math.min(ch.historyParticlesCount + 1, HISTORY_LENGTH),
        },
      }
    })
  },

  resetFsf: () => {
    set((state) => ({
      fsf: {
        ...FSF_INITIAL,
        readbackGeneration: state.fsf.readbackGeneration,
        historyEnergy: new Float32Array(HISTORY_LENGTH),
        historyNorm: new Float32Array(HISTORY_LENGTH),
        historyParticles: new Float32Array(HISTORY_LENGTH),
        historyParticlesHead: 0,
        historyParticlesCount: 0,
      },
    }))
  },

  // ── Pauli Actions ────────────────────────────────────────────────────────

  updatePauli: (snapshot) => {
    set((state) => {
      const ch = state.pauli
      const head = ch.historyHead
      ch.historyNorm[head] = snapshot.totalNorm ?? ch.totalNorm
      ch.historySpinUpFrac[head] = snapshot.spinUpFraction ?? ch.spinUpFraction
      ch.historySpinExpZ[head] = snapshot.spinExpectationZ ?? ch.spinExpectationZ
      return {
        pauli: {
          ...ch,
          ...snapshot,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  resetPauli: () => {
    set((state) => ({
      pauli: {
        ...PAULI_INITIAL,
        readbackGeneration: state.pauli.readbackGeneration,
        historyNorm: new Float32Array(HISTORY_LENGTH),
        historySpinUpFrac: new Float32Array(HISTORY_LENGTH),
        historySpinExpZ: new Float32Array(HISTORY_LENGTH),
        meanPosition: [0, 0, 0],
      },
    }))
  },

  // ── Quantum Walk Actions ─────────────────────────────────────────────────

  pushQwDiagnostics: (totalNorm, stepCount, posSum, posSqSum) => {
    set((state) => {
      const ch = state.qw
      const norm0 = ch.initialNorm < 0 ? totalNorm : ch.initialNorm
      const mean = totalNorm > 0 ? posSum / totalNorm : 0
      const variance = totalNorm > 0 ? posSqSum / totalNorm - mean * mean : 0
      return {
        qw: {
          hasData: true,
          totalNorm,
          normDrift: norm0 > 0 ? (totalNorm - norm0) / norm0 : 0,
          stepCount,
          positionMean: mean,
          positionVariance: Math.max(0, variance),
          initialNorm: norm0,
        },
      }
    })
  },

  resetQw: () => {
    set({ qw: { ...QW_INITIAL } })
  },

  // ── Eigenstate Actions ───────────────────────────────────────────────────

  pushEigenstate: (energy, ipr, orbitCorrelation) => {
    const current = get().eigenstate.eigenstates
    const entry: EigenstateEntry = {
      index: current.length,
      energy,
      ipr,
      orbitCorrelation: orbitCorrelation ?? NaN,
    }
    const updated = [...current, entry]
    set({
      eigenstate: {
        eigenstates: updated,
        levelSpacing: recomputeLevelSpacing(updated),
      },
    })
  },

  updateEigenstateIPR: (index, ipr) => {
    const current = get().eigenstate.eigenstates
    if (index < 0 || index >= current.length) return
    const updated = current.map((e, i) => (i === index ? { ...e, ipr } : e))
    set({ eigenstate: { eigenstates: updated, levelSpacing: recomputeLevelSpacing(updated) } })
  },

  updateEigenstateOrbitCorrelation: (index, orbitCorrelation) => {
    const current = get().eigenstate.eigenstates
    if (index < 0 || index >= current.length) return
    const updated = current.map((e, i) => (i === index ? { ...e, orbitCorrelation } : e))
    set((state) => ({ eigenstate: { ...state.eigenstate, eigenstates: updated } }))
  },

  clearEigenstate: () => {
    set({ eigenstate: { ...EIGENSTATE_INITIAL } })
  },

  // ── Observables Actions ──────────────────────────────────────────────────

  pushObservablesSnapshot: (snapshot) => {
    set((state) => {
      const ch = state.observables
      const head = ch.historyHead
      for (let d = 0; d < snapshot.activeDims; d++) {
        ch.historyUncertainty[d]![head] = snapshot.uncertaintyProduct[d]!
        ch.historyPositionMean[d]![head] = snapshot.positionMean[d]!
      }
      ch.historyEnergy[head] = snapshot.totalEnergy
      return {
        observables: {
          ...ch,
          ...snapshot,
          hasData: true,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  setObservablesEnergySpectrum: (spectrum) => {
    set((state) => ({
      observables: { ...state.observables, energySpectrum: spectrum },
    }))
  },

  resetObservables: () => {
    set((state) => ({
      observables: {
        ...OBSERVABLES_INITIAL,
        readbackGeneration: state.observables.readbackGeneration,
        positionMean: new Float64Array(MAX_DIMENSION),
        positionVariance: new Float64Array(MAX_DIMENSION),
        momentumMean: new Float64Array(MAX_DIMENSION),
        momentumVariance: new Float64Array(MAX_DIMENSION),
        uncertaintyProduct: new Float64Array(MAX_DIMENSION),
        historyUncertainty: createEmptyHistoryArrays(),
        historyEnergy: new Float32Array(HISTORY_LENGTH),
        historyPositionMean: createEmptyPositionMeanHistory(),
        energySpectrum: new Float32Array(NUM_ENERGY_BINS),
      },
    }))
  },

  // ── Open Quantum Actions ─────────────────────────────────────────────────

  pushOpenQuantumMetrics: (metrics) => {
    set((state) => {
      const ch = state.openQuantum
      const head = ch.historyHead
      ch.historyPurity[head] = metrics.purity
      ch.historyEntropy[head] = metrics.vonNeumannEntropy
      ch.historyCoherence[head] = metrics.coherenceMagnitude
      return {
        openQuantum: {
          ...ch,
          purity: metrics.purity,
          linearEntropy: metrics.linearEntropy,
          vonNeumannEntropy: metrics.vonNeumannEntropy,
          coherenceMagnitude: metrics.coherenceMagnitude,
          groundPopulation: metrics.groundPopulation,
          trace: metrics.trace,
          readbackGeneration: ch.readbackGeneration + 1,
          ...advanceRingBuffer(ch),
        },
      }
    })
  },

  setOpenQuantumPopulations: (populations, labels) => {
    set((state) => ({
      openQuantum: {
        ...state.openQuantum,
        populations,
        basisLabels: labels,
        basisCount: labels.length,
      },
    }))
  },

  resetOpenQuantum: () => {
    set((state) => ({
      openQuantum: {
        ...OPEN_QUANTUM_INITIAL,
        readbackGeneration: state.openQuantum.readbackGeneration,
        populations: new Float32Array(MAX_POPULATIONS),
        historyPurity: new Float32Array(HISTORY_LENGTH),
        historyEntropy: new Float32Array(HISTORY_LENGTH),
        historyCoherence: new Float32Array(HISTORY_LENGTH),
      },
    }))
  },

  // ── Density Actions ──────────────────────────────────────────────────────

  pushDensitySnapshot: (snapshot) => {
    set((state) => ({
      density: {
        ...state.density,
        ...snapshot,
        hasData: true,
        readbackGeneration: state.density.readbackGeneration + 1,
      },
    }))
  },

  pushDensitySlices: (slices) => {
    set((state) => ({
      density: { ...state.density, ...slices },
    }))
  },

  resetDensity: () => {
    set((state) => ({
      density: {
        ...DENSITY_INITIAL,
        readbackGeneration: state.density.readbackGeneration,
      },
    }))
  },
}))
