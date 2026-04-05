/**
 * State management for the Quantumness Atlas sweep.
 *
 * Orchestrates a 3-axis parameter sweep (λ, N, γ) collecting three
 * independent diagnostics per point: coordinate entanglement (S̄),
 * Wigner negativity (N̄_W), and spatial delocalization (IPR_norm).
 *
 * @module
 */

import { create } from 'zustand'

// ── Types ────────────────────────────────────────────────────────────────────

/** A single completed point in the quantumness atlas. */
export interface AtlasPoint {
  /** Coupling strength λ */
  lambda: number
  /** Number of spatial dimensions */
  dim: number
  /** Monitoring rate γ */
  gamma: number
  /** Time-averaged normalized coordinate entanglement S̄/log(M) ∈ [0,1] over the measurement window. */
  avgNormalizedEntropy: number
  /** Variance of S̄/log(M) over the measurement window. */
  varNormalizedEntropy: number
  /** Time-averaged Wigner negativity N̄_W. */
  avgWignerNegativity: number
  /** Variance of N̄_W. */
  varWignerNegativity: number
  /** Time-averaged normalized IPR ∈ (0, 1]. */
  avgIPR: number
  /** Variance of IPR. */
  varIPR: number
  /** Grid size per dimension (power of 2). */
  gridSizePerDim: number
  /** Total entanglement samples (evolve + measure). */
  totalSamples: number
  /** Number of diagnostic samples in the measurement window. */
  measurementSamples: number
}

/** Configuration for an atlas parameter sweep. */
export interface AtlasSweepConfig {
  /** Log-spaced lambda range. */
  lambdaMin: number
  lambdaMax: number
  lambdaSteps: number
  /** Dimensions to sweep (outer loop — most expensive to change). */
  dimensions: number[]
  /** Monitoring rates γ to sweep (inner loop — cheapest to change). */
  gammas: number[]
  /** Entanglement samples to skip before measurement (thermalization window). */
  evolveSamples: number
  /** Entanglement samples to collect during measurement window. */
  measureSamples: number
}

/** Sweep status: idle → running → complete. */
export type AtlasSweepStatus = 'idle' | 'running' | 'complete'

/** Progress within the current sweep point. */
export interface AtlasSweepProgress {
  /** Index of the current N in the dimensions array. */
  dimIdx: number
  /** Index of the current λ step. */
  lambdaIdx: number
  /** Index of the current γ in the gammas array. */
  gammaIdx: number
  /** Total points to sweep. */
  totalPoints: number
  /** Points completed so far. */
  completedPoints: number
}

// ── Accumulators ─────────────────────────────────────────────────────────────

/** Running mean/variance accumulator for streaming diagnostics. */
interface SampleAccumulator {
  n: number
  sum: number
  sumSq: number
}

function emptyAccumulator(): SampleAccumulator {
  return { n: 0, sum: 0, sumSq: 0 }
}

function pushSample(acc: SampleAccumulator, x: number): void {
  acc.n++
  acc.sum += x
  acc.sumSq += x * x
}

function meanVariance(acc: SampleAccumulator): { mean: number; variance: number } {
  if (acc.n === 0) return { mean: 0, variance: 0 }
  const mean = acc.sum / acc.n
  const variance = acc.n > 1 ? acc.sumSq / acc.n - mean * mean : 0
  return { mean, variance: Math.max(variance, 0) }
}

// ── Store ────────────────────────────────────────────────────────────────────

interface QuantumnessAtlasState {
  // ── Config ──
  config: AtlasSweepConfig

  // ── Status ──
  status: AtlasSweepStatus
  progress: AtlasSweepProgress

  // ── Results ──
  results: AtlasPoint[]

  // ── Per-point accumulators (used during sweep) ──
  entanglementAcc: SampleAccumulator
  wignerAcc: SampleAccumulator
  iprAcc: SampleAccumulator
  /** How many TDSE frames have elapsed since the current point started. */
  framesEvolved: number

  // ── Actions ──
  setConfig: (config: Partial<AtlasSweepConfig>) => void
  startSweep: () => void
  abortSweep: () => void
  /** Record a diagnostic sample for the current sweep point. */
  recordSample: (entanglement: number, wignerNegativity: number, ipr: number) => void
  /** Called each frame to advance the evolution counter. */
  tickFrame: () => void
  /** Complete the current sweep point and advance to the next. Returns null if sweep is done. */
  completePointAndAdvance: (gridSizePerDim: number) => {
    dim: number
    lambda: number
    gamma: number
    dimChanged: boolean
  } | null
  /** Mark sweep as complete. */
  completeSweep: () => void
  /** Clear all results. */
  clearResults: () => void
}

/** Default sweep config: quick scan (reduced set). */
export const DEFAULT_ATLAS_CONFIG: AtlasSweepConfig = {
  lambdaMin: 0.1,
  lambdaMax: 50,
  lambdaSteps: 8,
  dimensions: [3, 4, 5],
  gammas: [0, 0.3, 1, 3, 10],
  evolveSamples: 30,
  measureSamples: 10,
}

/** Compute log-spaced lambda for a given step index. */
export function lambdaForStep(config: AtlasSweepConfig, idx: number): number {
  if (config.lambdaSteps <= 1) return config.lambdaMin
  const t = idx / (config.lambdaSteps - 1)
  return config.lambdaMin * Math.pow(config.lambdaMax / config.lambdaMin, t)
}

function totalPoints(config: AtlasSweepConfig): number {
  return config.dimensions.length * config.lambdaSteps * config.gammas.length
}

/** @internal Exported for testing. */
export const useQuantumnessAtlasStore = create<QuantumnessAtlasState>((set, get) => ({
  config: { ...DEFAULT_ATLAS_CONFIG },
  status: 'idle',
  progress: { dimIdx: 0, lambdaIdx: 0, gammaIdx: 0, totalPoints: 0, completedPoints: 0 },
  results: [],
  entanglementAcc: emptyAccumulator(),
  wignerAcc: emptyAccumulator(),
  iprAcc: emptyAccumulator(),
  framesEvolved: 0,

  setConfig: (partial) =>
    set((state) => {
      if (state.status === 'running') return state
      return { config: { ...state.config, ...partial } }
    }),

  startSweep: () => {
    const config = get().config
    if (
      !Number.isInteger(config.lambdaSteps) ||
      config.lambdaSteps < 1 ||
      !Number.isFinite(config.lambdaMin) ||
      !Number.isFinite(config.lambdaMax) ||
      config.lambdaMin <= 0 ||
      config.lambdaMax <= 0 ||
      config.lambdaMax < config.lambdaMin
    ) {
      throw new Error(
        `Invalid lambda config: min=${config.lambdaMin}, max=${config.lambdaMax}, steps=${config.lambdaSteps}`
      )
    }
    if (config.dimensions.length === 0 || config.gammas.length === 0) {
      throw new Error('dimensions and gammas must be non-empty arrays')
    }
    if (
      !Number.isInteger(config.evolveSamples) ||
      config.evolveSamples < 0 ||
      !Number.isInteger(config.measureSamples) ||
      config.measureSamples < 1
    ) {
      throw new Error(
        `Invalid sample config: evolve=${config.evolveSamples}, measure=${config.measureSamples}`
      )
    }
    if (
      config.dimensions.some((d) => !Number.isInteger(d) || d < 3) ||
      config.gammas.some((g) => !Number.isFinite(g) || g < 0)
    ) {
      throw new Error('dimensions must be integers >= 3 and gammas must be finite numbers >= 0')
    }
    set({
      status: 'running',
      progress: {
        dimIdx: 0,
        lambdaIdx: 0,
        gammaIdx: 0,
        totalPoints: totalPoints(config),
        completedPoints: 0,
      },
      results: [],
      entanglementAcc: emptyAccumulator(),
      wignerAcc: emptyAccumulator(),
      iprAcc: emptyAccumulator(),
      framesEvolved: 0,
    })
  },

  abortSweep: () => set({ status: 'idle' }),

  recordSample: (entanglement, wignerNegativity, ipr) =>
    set((state) => {
      const eAcc = { ...state.entanglementAcc }
      const wAcc = { ...state.wignerAcc }
      const iAcc = { ...state.iprAcc }
      if (Number.isFinite(entanglement)) pushSample(eAcc, entanglement)
      if (Number.isFinite(wignerNegativity)) pushSample(wAcc, wignerNegativity)
      if (Number.isFinite(ipr)) pushSample(iAcc, ipr)
      return { entanglementAcc: eAcc, wignerAcc: wAcc, iprAcc: iAcc }
    }),

  tickFrame: () => set((state) => ({ framesEvolved: state.framesEvolved + 1 })),

  completePointAndAdvance: (gridSizePerDim) => {
    const state = get()
    if (state.status !== 'running') return null
    const { config, progress } = state
    const { entanglementAcc, wignerAcc, iprAcc } = state

    // Finalize the current point
    const ent = meanVariance(entanglementAcc)
    const wig = meanVariance(wignerAcc)
    const ipr = meanVariance(iprAcc)

    const point: AtlasPoint = {
      lambda: lambdaForStep(config, progress.lambdaIdx),
      dim: config.dimensions[progress.dimIdx]!,
      gamma: config.gammas[progress.gammaIdx]!,
      avgNormalizedEntropy: ent.mean,
      varNormalizedEntropy: ent.variance,
      avgWignerNegativity: wig.mean,
      varWignerNegativity: wig.variance,
      avgIPR: ipr.mean,
      varIPR: ipr.variance,
      gridSizePerDim,
      totalSamples: config.evolveSamples + config.measureSamples,
      measurementSamples: entanglementAcc.n,
    }

    const newResults = [...state.results, point]
    const completed = progress.completedPoints + 1

    // Advance: γ (inner) → λ (middle) → N (outer)
    let gammaIdx = progress.gammaIdx + 1
    let lambdaIdx = progress.lambdaIdx
    let dimIdx = progress.dimIdx

    if (gammaIdx >= config.gammas.length) {
      gammaIdx = 0
      lambdaIdx++
      if (lambdaIdx >= config.lambdaSteps) {
        lambdaIdx = 0
        dimIdx++
        if (dimIdx >= config.dimensions.length) {
          // Sweep complete — set status so UI gating releases immediately
          set({
            status: 'complete',
            results: newResults,
            progress: { ...progress, completedPoints: completed },
          })
          return null
        }
      }
    }

    const dimChanged = dimIdx !== progress.dimIdx

    set({
      results: newResults,
      progress: {
        dimIdx,
        lambdaIdx,
        gammaIdx,
        totalPoints: progress.totalPoints,
        completedPoints: completed,
      },
      entanglementAcc: emptyAccumulator(),
      wignerAcc: emptyAccumulator(),
      iprAcc: emptyAccumulator(),
      framesEvolved: 0,
    })

    return {
      dim: config.dimensions[dimIdx]!,
      lambda: lambdaForStep(config, lambdaIdx),
      gamma: config.gammas[gammaIdx]!,
      dimChanged,
    }
  },

  completeSweep: () => set({ status: 'complete' }),

  clearResults: () =>
    set({
      status: 'idle',
      results: [],
      progress: { dimIdx: 0, lambdaIdx: 0, gammaIdx: 0, totalPoints: 0, completedPoints: 0 },
      entanglementAcc: emptyAccumulator(),
      wignerAcc: emptyAccumulator(),
      iprAcc: emptyAccumulator(),
      framesEvolved: 0,
    }),
}))
