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

/** Atlas sweep state machine phases. */
export type SweepStatus = 'idle' | 'running' | 'complete'

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

  // ── Pairwise MI ─────────────────────────────────────────────────────────
  /** N×N mutual information matrix (flat row-major), null when disabled. */
  mutualInfoMatrix: Float64Array | null

  // ── Long-time statistics ────────────────────────────────────────────────
  /** Running mean of S̄. */
  longTimeSum: number
  /** Running sum of S̄² for variance. */
  longTimeSumSq: number
  /** Number of samples for long-time stats. */
  longTimeN: number
  /** Long-time average ⟨S̄⟩_T. */
  longTimeAverage: number
  /** Long-time variance Var(S̄)_T. */
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
  if (config.lambdaSteps <= 1) return config.lambdaMin
  const logMin = Math.log10(config.lambdaMin)
  const logMax = Math.log10(config.lambdaMax)
  const logVal = logMin + (lambdaIdx * (logMax - logMin)) / (config.lambdaSteps - 1)
  return Math.pow(10, logVal)
}

// ─── Store ──────────────────────────────────────────────────────────────────

/** Zustand store for coordinate entanglement diagnostics. */
export const useCoordinateEntanglementStore = create<CoordinateEntanglementState>((set, get) => ({
  // Feature toggles
  enabled: false,
  computePairwiseMI: false,
  computeBipartitions: false,

  // Ring buffer
  historyEntropies: createHistoryArrays(MAX_DIMS),
  historyAverage: new Float64Array(HISTORY_LENGTH),
  historyHead: 0,
  historyCount: 0,

  // Latest snapshot
  currentEntropies: [],
  currentAverageEntropy: 0,
  currentNormalizedEntropy: 0,
  currentMaxEntropies: [],
  currentSpectrum: [],
  currentBipartitionEntropies: [],

  // Pairwise MI
  mutualInfoMatrix: null,

  // Long-time statistics
  longTimeSum: 0,
  longTimeSumSq: 0,
  longTimeN: 0,
  longTimeAverage: 0,
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
  setComputePairwiseMI: (v) => set({ computePairwiseMI: v }),
  setComputeBipartitions: (v) => set({ computeBipartitions: v }),

  pushResult: (result) => {
    const state = get()
    const head = state.historyHead
    const N = result.entropies.length

    // Write per-dimension entropies into ring buffer (NaN for null/skipped dimensions
    // so downstream consumers can distinguish "not computed" from genuinely separable S=0)
    for (let d = 0; d < N && d < MAX_DIMS; d++) {
      state.historyEntropies[d]![head] = result.entropies[d] ?? NaN
    }
    state.historyAverage[head] = result.averageEntropy

    const newHead = (head + 1) % HISTORY_LENGTH
    const newCount = Math.min(state.historyCount + 1, HISTORY_LENGTH)

    // Update long-time statistics only for finite frames — non-finite results
    // (GPU divergence, skipped dims) must not advance the sweep clock or
    // dilute the running average with phantom zeros.
    let newLtN = state.longTimeN
    let newLtSum = state.longTimeSum
    let newLtSumSq = state.longTimeSumSq
    let newLtAvg = state.longTimeAverage
    let newLtVar = state.longTimeVariance

    if (Number.isFinite(result.averageEntropy)) {
      newLtN = state.longTimeN + 1
      newLtSum = state.longTimeSum + result.averageEntropy
      newLtSumSq = state.longTimeSumSq + result.averageEntropy * result.averageEntropy
      newLtAvg = newLtSum / newLtN
      // Clamp to ≥ 0: E[X²] − E[X]² can go slightly negative from floating-point cancellation
      newLtVar = newLtN > 1 ? Math.max(newLtSumSq / newLtN - newLtAvg * newLtAvg, 0) : 0
    }

    set({
      historyHead: newHead,
      historyCount: newCount,
      currentEntropies: result.entropies,
      currentAverageEntropy: result.averageEntropy,
      currentNormalizedEntropy: result.normalizedEntropy,
      currentMaxEntropies: result.maxEntropies,
      currentSpectrum: result.spectrum,
      currentBipartitionEntropies: result.bipartitionEntropies,
      mutualInfoMatrix: result.mutualInfo,
      longTimeSum: newLtSum,
      longTimeSumSq: newLtSumSq,
      longTimeN: newLtN,
      longTimeAverage: newLtAvg,
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
      mutualInfoMatrix: null,
      longTimeSum: 0,
      longTimeSumSq: 0,
      longTimeN: 0,
      longTimeAverage: 0,
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
      state.sweepEntropySamples > 0 ? state.sweepEntropyAccumulator / state.sweepEntropySamples : 0

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
