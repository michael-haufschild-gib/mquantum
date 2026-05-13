/**
 * Coordinate Entanglement Store
 *
 * Zustand store for inter-dimensional entanglement diagnostics.
 * Tracks per-dimension entropy time series, pairwise mutual information,
 * bipartition entropies, long-time statistics, and atlas sweep state.
 *
 * @module stores/coordinateEntanglementStore
 */

import { create } from 'zustand'

import type { CoordinateEntanglementResult } from '@/lib/physics/coordinateEntanglement'

import { logStepValue, type SweepStatus } from '../utils/sweepUtils'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Ring buffer length for entropy time series. */
const HISTORY_LENGTH = 256

/** Maximum number of dimensions for preallocated history arrays. */
const MAX_DIMS = 11

// ─── Sweep Types ────────────────────────────────────────────────────────────

/** Configuration for an atlas sweep across λ × N. */
export interface AtlasSweepConfig {
  /** Minimum coupling strength (log-spaced). */
  lambdaMin: number
  /** Maximum coupling strength (log-spaced). */
  lambdaMax: number
  /** Number of λ points. */
  lambdaSteps: number
  /** Dimensions to sweep. */
  dimensions: number[]
}

/** Result of a single (λ, N) point in the atlas sweep. */
export interface AtlasSweepPoint {
  /** Coupling strength. */
  lambda: number
  /** Spatial dimension. */
  dim: number
  /** Long-time average normalized entropy S̄_∞. */
  entropy: number
}

export type { SweepStatus } from '../utils/sweepUtils'

// ─── Store Type ─────────────────────────────────────────────────────────────

/** State shape for the coordinate entanglement store. */
interface CoordinateEntanglementState {
  // ── Feature toggles ─────────────────────────────────────────────────────
  /** Master enable for entanglement diagnostics. */
  enabled: boolean
  /** Compute pairwise mutual information (CPU-expensive for large M). */
  computePairwiseMI: boolean
  /** Compute k-dimensional bipartition entropies. */
  computeBipartitions: boolean
  /** Compute Wigner negativity from per-dimension RDMs. */
  computeWignerNegativity: boolean

  // ── Ring buffer time series ─────────────────────────────────────────────
  /** Per-dimension entropy history: N arrays of length HISTORY_LENGTH. */
  historyEntropies: Float64Array[]
  /** Average entropy S̄(t) history. */
  historyAverage: Float64Array
  /** Current write head in ring buffer. */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH). */
  historyCount: number

  // ── Latest snapshot ─────────────────────────────────────────────────────
  /** Per-dimension entanglement entropies S_d. null if dimension was too large to compute. */
  currentEntropies: (number | null)[]
  /** Average entropy S̄ (over computed dimensions only). */
  currentAverageEntropy: number
  /** Normalized average entropy S̄ / max(S̄). */
  currentNormalizedEntropy: number
  /** Maximum possible entropy log(M_d) per dimension. null if skipped. */
  currentMaxEntropies: (number | null)[]
  /** Eigenvalue spectrum of ρ₁ (first dimension). */
  currentSpectrum: number[]
  /** Bipartition entropies S_{k|N-k}, null entries if skipped. */
  currentBipartitionEntropies: (number | null)[]

  // ── Wigner negativity ────────────────────────────────────────────────────
  /** Per-dimension Wigner negativity from ρ_d. null entries if skipped. */
  currentWignerNegativities: (number | null)[]
  /** Average Wigner negativity across computed dimensions. */
  currentAverageWignerNegativity: number
  /** Ring-buffer history for average Wigner negativity. */
  historyWignerNegativity: Float64Array

  // ── Pairwise MI ─────────────────────────────────────────────────────────
  /** N×N mutual information matrix (flat row-major), null when disabled. */
  mutualInfoMatrix: Float64Array | null

  // ── Long-time statistics (Welford's online algorithm) ───────────────────
  /** Number of samples for long-time stats. */
  longTimeN: number
  /** Running mean ⟨S̄⟩_T (Welford's M). */
  longTimeAverage: number
  /** Sum of squared deviations from running mean (Welford's M2). */
  longTimeM2: number
  /** Long-time variance Var(S̄)_T = M2/N. */
  longTimeVariance: number

  // ── Atlas sweep ─────────────────────────────────────────────────────────
  /** Current sweep status. */
  sweepStatus: SweepStatus
  /** Sweep configuration. */
  sweepConfig: AtlasSweepConfig
  /** Completed sweep points. */
  sweepResults: AtlasSweepPoint[]
  /** Sweep progress 0–1. */
  sweepProgress: number
  /** Current sweep step index (across the λ×N grid). */
  sweepCurrentStep: number
  /** Current sweep lambda value being tested. */
  sweepCurrentLambda: number
  /** Current sweep dimension being tested. */
  sweepCurrentDim: number
  /** Frames evolved in current sweep step. */
  sweepFramesEvolved: number
  /** Entropy accumulator for current sweep step. */
  sweepEntropyAccumulator: number
  /** Number of entropy samples in current sweep step. */
  sweepEntropySamples: number

  // ── Actions ─────────────────────────────────────────────────────────────
  setEnabled: (v: boolean) => void
  setComputePairwiseMI: (v: boolean) => void
  setComputeBipartitions: (v: boolean) => void
  setComputeWignerNegativity: (v: boolean) => void
  pushResult: (result: CoordinateEntanglementResult) => void
  clearHistory: () => void
  startSweep: (config: AtlasSweepConfig) => void
  advanceSweepStep: () => { lambda: number; dim: number } | null
  recordSweepSample: (entropy: number) => void
  completeSweepStep: () => void
  completeSweep: () => void
  abortSweep: () => void
  resetSweep: () => void
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_SWEEP_CONFIG: AtlasSweepConfig = {
  lambdaMin: 0.01,
  lambdaMax: 50,
  lambdaSteps: 15,
  dimensions: [3, 4, 5],
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create empty history arrays for N dimensions. */
function createHistoryArrays(n: number): Float64Array[] {
  const arrays: Float64Array[] = []
  for (let i = 0; i < n; i++) {
    arrays.push(new Float64Array(HISTORY_LENGTH))
  }
  return arrays
}

/**
 * Compute log-spaced lambda value for a sweep step.
 *
 * @param config - Sweep configuration
 * @param lambdaIdx - Lambda index (0-based)
 * @returns The lambda value
 */
export function lambdaForStep(config: AtlasSweepConfig, lambdaIdx: number): number {
  return logStepValue(config.lambdaMin, config.lambdaMax, config.lambdaSteps, lambdaIdx)
}

// ─── Store ──────────────────────────────────────────────────────────────────

/** Zustand store for coordinate entanglement diagnostics. */
export const useCoordinateEntanglementStore = create<CoordinateEntanglementState>((set, get) => ({
  // Feature toggles
  enabled: false,
  computePairwiseMI: false,
  computeBipartitions: false,
  computeWignerNegativity: false,

  // Ring buffer
  historyEntropies: createHistoryArrays(MAX_DIMS),
  historyAverage: new Float64Array(HISTORY_LENGTH),
  historyWignerNegativity: new Float64Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,

  // Latest snapshot
  currentEntropies: [],
  currentAverageEntropy: 0,
  currentNormalizedEntropy: 0,
  currentMaxEntropies: [],
  currentSpectrum: [],
  currentBipartitionEntropies: [],

  // Wigner negativity
  currentWignerNegativities: [],
  currentAverageWignerNegativity: 0,

  // Pairwise MI
  mutualInfoMatrix: null,

  // Long-time statistics (Welford's online algorithm)
  longTimeN: 0,
  longTimeAverage: 0,
  longTimeM2: 0,
  longTimeVariance: 0,

  // Atlas sweep
  sweepStatus: 'idle',
  sweepConfig: DEFAULT_SWEEP_CONFIG,
  sweepResults: [],
  sweepProgress: 0,
  sweepCurrentStep: 0,
  sweepCurrentLambda: 0,
  sweepCurrentDim: 3,
  sweepFramesEvolved: 0,
  sweepEntropyAccumulator: 0,
  sweepEntropySamples: 0,

  // ── Actions ─────────────────────────────────────────────────────────────

  setEnabled: (v) => set({ enabled: v }),
  setComputePairwiseMI: (v) =>
    set((state) => ({
      computePairwiseMI: v,
      mutualInfoMatrix: v ? state.mutualInfoMatrix : null,
    })),
  setComputeBipartitions: (v) =>
    set((state) => ({
      computeBipartitions: v,
      currentBipartitionEntropies: v ? state.currentBipartitionEntropies : [],
    })),
  setComputeWignerNegativity: (v) =>
    set((state) => ({
      computeWignerNegativity: v,
      currentWignerNegativities: v ? state.currentWignerNegativities : [],
      currentAverageWignerNegativity: v ? state.currentAverageWignerNegativity : 0,
      historyWignerNegativity: v
        ? state.historyWignerNegativity
        : new Float64Array(HISTORY_LENGTH).fill(NaN),
    })),

  pushResult: (result) => {
    const state = get()
    const head = state.historyHead
    const N = result.entropies.length

    // Write per-dimension entropies into ring buffer (NaN for null/skipped dimensions
    // so downstream consumers can distinguish "not computed" from genuinely separable S=0)
    for (let d = 0; d < N && d < MAX_DIMS; d++) {
      state.historyEntropies[d]![head] = result.entropies[d] ?? NaN
    }
    const currentBipartitionEntropies = state.computeBipartitions ? result.bipartitionEntropies : []
    const mutualInfoMatrix = state.computePairwiseMI ? result.mutualInfo : null
    const currentWignerNegativities = state.computeWignerNegativity ? result.wignerNegativities : []
    const hasComputedWigner =
      state.computeWignerNegativity && result.wignerNegativities.some((v) => v !== null)
    const currentAverageWignerNegativity = hasComputedWigner ? result.averageWignerNegativity : 0

    state.historyAverage[head] = result.averageEntropy
    state.historyWignerNegativity[head] = hasComputedWigner ? result.averageWignerNegativity : NaN

    const newHead = (head + 1) % HISTORY_LENGTH
    const newCount = Math.min(state.historyCount + 1, HISTORY_LENGTH)

    // Update long-time statistics only for finite frames — non-finite results
    // (GPU divergence, skipped dims) must not advance the sweep clock or
    // dilute the running average with phantom zeros.
    // Uses Welford's online algorithm for numerically stable variance.
    let newLtN = state.longTimeN
    let newLtAvg = state.longTimeAverage
    let newLtM2 = state.longTimeM2
    let newLtVar = state.longTimeVariance

    if (Number.isFinite(result.averageEntropy)) {
      const x = result.averageEntropy
      newLtN = state.longTimeN + 1
      const delta = x - state.longTimeAverage
      newLtAvg = state.longTimeAverage + delta / newLtN
      const delta2 = x - newLtAvg
      newLtM2 = state.longTimeM2 + delta * delta2
      newLtVar = newLtN > 1 ? newLtM2 / newLtN : 0
    }

    set({
      historyHead: newHead,
      historyCount: newCount,
      currentEntropies: result.entropies,
      currentAverageEntropy: result.averageEntropy,
      currentNormalizedEntropy: result.normalizedEntropy,
      currentMaxEntropies: result.maxEntropies,
      currentSpectrum: result.spectrum,
      currentBipartitionEntropies,
      currentWignerNegativities,
      currentAverageWignerNegativity,
      mutualInfoMatrix,
      longTimeN: newLtN,
      longTimeAverage: newLtAvg,
      longTimeM2: newLtM2,
      longTimeVariance: newLtVar,
    })
  },

  clearHistory: () =>
    set({
      historyEntropies: createHistoryArrays(MAX_DIMS),
      historyAverage: new Float64Array(HISTORY_LENGTH),
      historyHead: 0,
      historyCount: 0,
      currentEntropies: [],
      currentAverageEntropy: 0,
      currentNormalizedEntropy: 0,
      currentMaxEntropies: [],
      currentSpectrum: [],
      currentBipartitionEntropies: [],
      currentWignerNegativities: [],
      currentAverageWignerNegativity: 0,
      historyWignerNegativity: new Float64Array(HISTORY_LENGTH),
      mutualInfoMatrix: null,
      longTimeN: 0,
      longTimeAverage: 0,
      longTimeM2: 0,
      longTimeVariance: 0,
    }),

  startSweep: (config) => {
    const firstLambda = lambdaForStep(config, 0)
    set({
      sweepStatus: 'running',
      sweepConfig: config,
      sweepResults: [],
      sweepProgress: 0,
      sweepCurrentStep: 0,
      sweepCurrentLambda: firstLambda,
      sweepCurrentDim: config.dimensions[0]!,
      sweepFramesEvolved: 0,
      sweepEntropyAccumulator: 0,
      sweepEntropySamples: 0,
    })
  },

  advanceSweepStep: () => {
    const state = get()
    if (state.sweepStatus !== 'running') return null

    const totalSteps = state.sweepConfig.lambdaSteps * state.sweepConfig.dimensions.length
    const nextStep = state.sweepCurrentStep + 1
    if (nextStep >= totalSteps) return null

    // Compute (dimIdx, lambdaIdx) from flat step — group by dimension
    const dimIdx = Math.floor(nextStep / state.sweepConfig.lambdaSteps)
    const lambdaIdx = nextStep % state.sweepConfig.lambdaSteps
    const dim = state.sweepConfig.dimensions[dimIdx]!
    const lambda = lambdaForStep(state.sweepConfig, lambdaIdx)

    set({
      sweepCurrentStep: nextStep,
      sweepCurrentLambda: lambda,
      sweepCurrentDim: dim,
      sweepProgress: nextStep / totalSteps,
      sweepFramesEvolved: 0,
      sweepEntropyAccumulator: 0,
      sweepEntropySamples: 0,
    })

    return { lambda, dim }
  },

  recordSweepSample: (entropy) => {
    // Guard against NaN from GPU divergence or skipped dimensions —
    // a single NaN poisons the accumulator irreversibly.
    if (!Number.isFinite(entropy)) return
    const state = get()
    set({
      sweepFramesEvolved: state.sweepFramesEvolved + 1,
      sweepEntropyAccumulator: state.sweepEntropyAccumulator + entropy,
      sweepEntropySamples: state.sweepEntropySamples + 1,
    })
  },

  completeSweepStep: () => {
    const state = get()
    const avg =
      state.sweepEntropySamples > 0
        ? state.sweepEntropyAccumulator / state.sweepEntropySamples
        : Number.NaN

    const point: AtlasSweepPoint = {
      lambda: state.sweepCurrentLambda,
      dim: state.sweepCurrentDim,
      entropy: avg,
    }

    set({
      sweepResults: [...state.sweepResults, point],
    })
  },

  completeSweep: () => {
    // Clear live data so sweep-era samples don't persist as if they were live diagnostics
    get().clearHistory()
    set({
      sweepStatus: 'complete',
      sweepProgress: 1,
    })
  },

  abortSweep: () => {
    get().clearHistory()
    set({
      sweepStatus: 'idle',
      sweepProgress: 0,
      sweepCurrentStep: 0,
    })
  },

  resetSweep: () =>
    set({
      sweepStatus: 'idle',
      sweepResults: [],
      sweepProgress: 0,
      sweepCurrentStep: 0,
      sweepFramesEvolved: 0,
      sweepEntropyAccumulator: 0,
      sweepEntropySamples: 0,
    }),
}))
