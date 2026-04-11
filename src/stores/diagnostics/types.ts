/**
 * Diagnostics Store — Channel Data Types
 *
 * Type definitions for all per-mode diagnostic channel data.
 * Each quantum mode has its own typed channel within the unified
 * diagnosticsStore. These interfaces define the data shape only;
 * actions are defined in the store itself.
 *
 * @module stores/diagnostics/types
 */

import type { OpenQuantumMetrics } from '@/lib/physics/openQuantum/types'
import type { LevelSpacingResult } from '@/lib/physics/tdse/levelSpacing'

// ─── Shared Constants ────────────────────────────────────────────────────────

/** Ring buffer length — ~2s at 60fps. */
export const HISTORY_LENGTH = 120

/** Maximum basis states for open quantum population tracking. */
export const MAX_POPULATIONS = 14

// ─── Shared Ring Buffer Infrastructure ───────────────────────────────────────

/** Shared ring buffer head/count metadata. */
export interface RingBufferMeta {
  /** Current write head in ring buffer. */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH). */
  historyCount: number
}

/** Advance ring buffer head and count. Returns partial state to merge. */
export function advanceRingBuffer(meta: RingBufferMeta): RingBufferMeta {
  return {
    historyHead: (meta.historyHead + 1) % HISTORY_LENGTH,
    historyCount: Math.min(meta.historyCount + 1, HISTORY_LENGTH),
  }
}

// ─── TDSE Channel ────────────────────────────────────────────────────────────

/** Snapshot pushed from GPU readback for TDSE mode. */
export interface TdseSnapshot {
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

/** TDSE diagnostic channel data with ring buffer history. */
export interface TdseChannelData extends TdseSnapshot, RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  historySimTime: Float32Array
  historyNorm: Float32Array
  historyR: Float32Array
  historyT: Float32Array
  historyIpr: Float32Array
}

// ─── BEC Channel ─────────────────────────────────────────────────────────────

/** BEC diagnostic channel data with ring buffer history. */
export interface BecChannelData extends RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  totalNorm: number
  maxDensity: number
  normDrift: number
  chemicalPotential: number
  healingLength: number
  soundSpeed: number
  thomasFermiRadius: number
  vortexCount: number
  vortexPlaquettes: number
  vortexPositiveCharge: number
  vortexNegativeCharge: number
  incompressibleSpectrum: Float32Array
  spectrumKValues: Float32Array
  totalIncompressibleEnergy: number
  totalCompressibleEnergy: number
  historyNorm: Float32Array
  historyChemPot: Float32Array
  historyHealingLen: Float32Array
}

// ─── Dirac Channel ───────────────────────────────────────────────────────────

/** Dirac equation diagnostic channel data with ring buffer history. */
export interface DiracChannelData extends RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  totalNorm: number
  normDrift: number
  maxDensity: number
  particleFraction: number
  antiparticleFraction: number
  meanPosition: number[]
  comptonWavelength: number
  zitterbewegungFreq: number
  kleinThreshold: number
  historyNorm: Float32Array
  historyParticleFrac: Float32Array
  historyAntiparticleFrac: Float32Array
}

// ─── FSF Channel ─────────────────────────────────────────────────────────────

/** Snapshot pushed from GPU readback for FSF mode. */
export interface FsfDiagnosticsSnapshot {
  totalEnergy: number
  totalNorm: number
  maxPhi: number
  maxPi: number
  energyDrift: number
  meanPhi: number
  variancePhi: number
}

/** Free scalar field diagnostic channel data with ring buffer history. */
export interface FsfChannelData extends FsfDiagnosticsSnapshot, RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  initialEnergy: number
  historyEnergy: Float32Array
  historyNorm: Float32Array
  /**
   * Latest total particle number `N(η) = Σ_k max(n_k, 0)` measured against
   * the instantaneous adiabatic vacuum. Cosmological particle creation is
   * strictly non-negative, so values cluster near zero for Minkowski ground
   * states and grow with expansion on FLRW backgrounds.
   */
  totalParticles: number
  /**
   * Ring buffer history of `totalParticles`. Runs on the k-space readback
   * cadence (independent from `historyEnergy`, which is driven by the
   * diagnostics readback cadence), so this channel has its own head and
   * count counters.
   */
  historyParticles: Float32Array
  /** Write head for `historyParticles` (independent from `historyHead`). */
  historyParticlesHead: number
  /** Valid-sample count for `historyParticles` (up to `HISTORY_LENGTH`). */
  historyParticlesCount: number
}

// ─── Pauli Channel ───────────────────────────────────────────────────────────

/** Pauli spinor diagnostic channel data with ring buffer history. */
export interface PauliChannelData extends RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  totalNorm: number
  normDrift: number
  maxDensity: number
  spinUpFraction: number
  spinDownFraction: number
  spinExpectationZ: number
  coherenceMagnitude: number
  meanPosition: number[]
  larmorFrequency: number
  historyNorm: Float32Array
  historySpinUpFrac: Float32Array
  historySpinExpZ: Float32Array
}

// ─── Quantum Walk Channel ────────────────────────────────────────────────────

/** Quantum walk diagnostic channel data (no ring buffers). */
export interface QwChannelData {
  hasData: boolean
  totalNorm: number
  normDrift: number
  stepCount: number
  positionMean: number
  positionVariance: number
  initialNorm: number
}

// ─── Eigenstate Channel ──────────────────────────────────────────────────────

/** Per-eigenstate diagnostics snapshot. */
export interface EigenstateEntry {
  index: number
  energy: number
  ipr: number
  orbitCorrelation: number
}

/** Eigenstate spectral diagnostics — accumulated entries with level spacing statistics. */
export interface EigenstateChannelData {
  eigenstates: EigenstateEntry[]
  levelSpacing: LevelSpacingResult | null
}

// ─── Observables Channel ─────────────────────────────────────────────────────

/** Per-snapshot observable data pushed from GPU readback. */
export interface ObservablesSnapshot {
  activeDims: number
  positionMean: Float64Array
  positionVariance: Float64Array
  momentumMean: Float64Array
  momentumVariance: Float64Array
  uncertaintyProduct: Float64Array
  totalEnergy: number
  positionNorm: number
  momentumNorm: number
}

/** Observables diagnostic channel data with per-dimension ring buffer history. */
export interface ObservablesChannelData extends ObservablesSnapshot, RingBufferMeta {
  hasData: boolean
  readbackGeneration: number
  historyUncertainty: Float32Array[]
  historyEnergy: Float32Array
  historyPositionMean: Float64Array[]
  energySpectrum: Float32Array
}

// ─── Open Quantum Channel ────────────────────────────────────────────────────

/** Open quantum system diagnostic channel data with ring buffer history. */
export interface OpenQuantumChannelData extends RingBufferMeta {
  purity: number
  linearEntropy: number
  vonNeumannEntropy: number
  coherenceMagnitude: number
  groundPopulation: number
  trace: number
  populations: Float32Array
  basisLabels: string[]
  basisCount: number
  readbackGeneration: number
  historyPurity: Float32Array
  historyEntropy: Float32Array
  historyCoherence: Float32Array
}

// ─── Density Channel ─────────────────────────────────────────────────────────

/** Snapshot pushed from GPU readback for density grid analysis. */
export interface DensitySnapshot {
  maxDensity: number
  totalDensityMass: number
  activeVoxelCount: number
  centerDensity: number
  gridSize: number
  worldBound: number
}

/** Center-plane wavefunction slice data for export. */
export interface WavefunctionSliceData {
  sliceX: Float32Array | null
  sliceY: Float32Array | null
  sliceZ: Float32Array | null
  sliceGridSize: number
  sliceWorldBound: number
}

/** Density grid diagnostic channel data (no ring buffers). */
export interface DensityChannelData extends DensitySnapshot, WavefunctionSliceData {
  hasData: boolean
  readbackGeneration: number
}

// ─── Re-export External Types Used by Consumers ──────────────────────────────

export type { OpenQuantumMetrics }
export type { LevelSpacingResult }
