/**
 * Diagnostics Store — Initial Channel States
 *
 * Default values for each diagnostic channel. Used by the store's
 * create() call and reset actions to restore channels to defaults.
 *
 * @module stores/diagnostics/initialStates
 */

import { MAX_DIMENSION } from '@/constants/dimension'
import { NUM_SPECTRUM_BINS } from '@/lib/physics/bec/incompressibleSpectrum'

import {
  type BecChannelData,
  type DensityChannelData,
  type DiracChannelData,
  type EigenstateChannelData,
  type FsfChannelData,
  HISTORY_LENGTH,
  MAX_POPULATIONS,
  type ObservablesChannelData,
  type OpenQuantumChannelData,
  type PauliChannelData,
  type QwChannelData,
  type TdseChannelData,
} from './types'

// ─── TDSE ────────────────────────────────────────────────────────────────────

/** @internal */
export const TDSE_INITIAL: TdseChannelData = {
  hasData: false,
  readbackGeneration: 0,
  simTime: 0,
  totalNorm: 1,
  maxDensity: 0,
  normDrift: 0,
  normLeft: 0,
  normRight: 0,
  R: 0,
  T: 0,
  ipr: 0,
  historySimTime: new Float32Array(HISTORY_LENGTH),
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historyR: new Float32Array(HISTORY_LENGTH),
  historyT: new Float32Array(HISTORY_LENGTH),
  historyIpr: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

// ─── BEC ─────────────────────────────────────────────────────────────────────

/** @internal */
export const BEC_INITIAL: BecChannelData = {
  hasData: false,
  readbackGeneration: 0,
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

// ─── Dirac ───────────────────────────────────────────────────────────────────

/** @internal */
export const DIRAC_INITIAL: DiracChannelData = {
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

// ─── FSF ─────────────────────────────────────────────────────────────────────

/** @internal */
export const FSF_INITIAL: FsfChannelData = {
  hasData: false,
  readbackGeneration: 0,
  totalEnergy: 0,
  totalNorm: 0,
  maxPhi: 0,
  maxPi: 0,
  energyDrift: 0,
  meanPhi: 0,
  variancePhi: 0,
  initialEnergy: 0,
  historyEnergy: new Float32Array(HISTORY_LENGTH),
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
  totalParticles: 0,
  historyParticles: new Float32Array(HISTORY_LENGTH),
  historyParticlesHead: 0,
  historyParticlesCount: 0,
}

// ─── Pauli ───────────────────────────────────────────────────────────────────

/** @internal */
export const PAULI_INITIAL: PauliChannelData = {
  hasData: false,
  readbackGeneration: 0,
  totalNorm: 0,
  normDrift: 0,
  maxDensity: 0,
  spinUpFraction: 0,
  spinDownFraction: 0,
  spinExpectationZ: 0,
  coherenceMagnitude: 0,
  meanPosition: [0, 0, 0],
  larmorFrequency: 0,
  historyNorm: new Float32Array(HISTORY_LENGTH),
  historySpinUpFrac: new Float32Array(HISTORY_LENGTH),
  historySpinExpZ: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

// ─── Quantum Walk ────────────────────────────────────────────────────────────

/** @internal */
export const QW_INITIAL: QwChannelData = {
  hasData: false,
  totalNorm: 1,
  normDrift: 0,
  stepCount: 0,
  positionMean: 0,
  positionVariance: 0,
  initialNorm: -1,
}

// ─── Eigenstate ──────────────────────────────────────────────────────────────

/** @internal */
export const EIGENSTATE_INITIAL: EigenstateChannelData = {
  eigenstates: [],
  levelSpacing: null,
}

// ─── Observables ─────────────────────────────────────────────────────────────

/** Number of bins for energy spectral density histogram. */
export const NUM_ENERGY_BINS = 32

/** @internal */
export function createEmptyHistoryArrays(): Float32Array[] {
  return Array.from({ length: MAX_DIMENSION }, () => new Float32Array(HISTORY_LENGTH))
}

/** @internal */
export function createEmptyPositionMeanHistory(): Float64Array[] {
  return Array.from({ length: MAX_DIMENSION }, () => new Float64Array(HISTORY_LENGTH))
}

/** @internal */
export const OBSERVABLES_INITIAL: ObservablesChannelData = {
  hasData: false,
  readbackGeneration: 0,
  activeDims: 0,
  positionMean: new Float64Array(MAX_DIMENSION),
  positionVariance: new Float64Array(MAX_DIMENSION),
  momentumMean: new Float64Array(MAX_DIMENSION),
  momentumVariance: new Float64Array(MAX_DIMENSION),
  uncertaintyProduct: new Float64Array(MAX_DIMENSION),
  totalEnergy: 0,
  positionNorm: 0,
  momentumNorm: 0,
  historyUncertainty: createEmptyHistoryArrays(),
  historyEnergy: new Float32Array(HISTORY_LENGTH),
  historyPositionMean: createEmptyPositionMeanHistory(),
  historyHead: 0,
  historyCount: 0,
  energySpectrum: new Float32Array(NUM_ENERGY_BINS),
}

// ─── Open Quantum ────────────────────────────────────────────────────────────

/** @internal */
export const OPEN_QUANTUM_INITIAL: OpenQuantumChannelData = {
  purity: 1,
  linearEntropy: 0,
  vonNeumannEntropy: 0,
  coherenceMagnitude: 0,
  groundPopulation: 1,
  trace: 1,
  populations: new Float32Array(MAX_POPULATIONS),
  basisLabels: [],
  basisCount: 0,
  readbackGeneration: 0,
  historyPurity: new Float32Array(HISTORY_LENGTH),
  historyEntropy: new Float32Array(HISTORY_LENGTH),
  historyCoherence: new Float32Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,
}

// ─── Density ─────────────────────────────────────────────────────────────────

/** @internal */
export const DENSITY_INITIAL: DensityChannelData = {
  hasData: false,
  readbackGeneration: 0,
  maxDensity: 0,
  totalDensityMass: 0,
  activeVoxelCount: 0,
  centerDensity: 0,
  gridSize: 0,
  worldBound: 0,
  sliceX: null,
  sliceY: null,
  sliceZ: null,
  sliceGridSize: 0,
  sliceWorldBound: 0,
}
