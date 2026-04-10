/**
 * Anderson Disorder Sweep Store
 *
 * State machine for automated parameter scans across disorder strength W.
 * Coordinates with the TDSE render loop via simTime progression:
 * each realization runs for a configured simulation time, then the sweep
 * records IPR + norm drift and advances to the next W value.
 *
 * @module stores/andersonSweepStore
 */

import { create } from 'zustand'

import { linearStepValue, type SweepStatus } from './utils/sweepUtils'

export type { SweepStatus } from './utils/sweepUtils'

/** Number of energy bins for spectral density histogram. */
export const ENERGY_BINS = 32

/** Configuration for a disorder sweep. */
export interface SweepConfig {
  /** Minimum disorder strength */
  wMin: number
  /** Maximum disorder strength */
  wMax: number
  /** Number of W values to scan */
  steps: number
  /** Simulation time per realization (in simulation time units) */
  timePerStep: number
  /** Distribution type for each realization */
  distribution: 'uniform' | 'gaussian'
}

/** Result of a single realization in the sweep. */
export interface SweepResult {
  /** Disorder strength W for this realization */
  w: number
  /** Inverse participation ratio at the end of the realization */
  ipr: number
  /** Fractional norm drift from initial value */
  normDrift: number
  /** PRNG seed used for this realization */
  seed: number
}

interface AndersonSweepState {
  /** Current sweep status */
  status: SweepStatus
  /** Sweep configuration (set at start) */
  config: SweepConfig
  /** Current step index (0-based) */
  currentStep: number
  /** simTime at the start of the current realization */
  stepStartTime: number
  /** Accumulated results from completed realizations */
  results: SweepResult[]

  /** Start a new sweep. Caller must set the initial W in the TDSE config. */
  startSweep: (config: SweepConfig) => void
  /**
   * Called each diagnostic frame with current simulation state.
   * Returns the next W value if the step should advance, or null if still running.
   */
  tick: (simTime: number, ipr: number, normDrift: number) => number | null
  /** Abort a running sweep. */
  abort: () => void
  /** Reset to idle, clearing results. */
  reset: () => void
}

const DEFAULT_CONFIG: SweepConfig = {
  wMin: 1,
  wMax: 30,
  steps: 10,
  timePerStep: 1.0,
  distribution: 'uniform',
}

/**
 * Compute the W value for a given step index.
 *
 * @param config - Sweep configuration
 * @param step - Step index (0-based)
 * @returns Disorder strength W
 */
function wForStep(config: SweepConfig, step: number): number {
  return linearStepValue(config.wMin, config.wMax, config.steps, step)
}

/**
 * Generate a deterministic seed for a sweep step.
 * Uses step index to produce reproducible but uncorrelated disorder realizations.
 *
 * @param step - Step index
 * @returns PRNG seed
 */
function seedForStep(step: number): number {
  // Deterministic hash: different enough per step, reproducible
  return ((step + 1) * 2654435761) >>> 0
}

/** Zustand store for Anderson disorder sweep mode. */
export const useAndersonSweepStore = create<AndersonSweepState>((set, get) => ({
  status: 'idle',
  config: DEFAULT_CONFIG,
  currentStep: 0,
  stepStartTime: 0,
  results: [],

  startSweep: (config) => {
    set({
      status: 'running',
      config,
      currentStep: 0,
      stepStartTime: 0,
      results: [],
    })
  },

  tick: (simTime, ipr, normDrift) => {
    const state = get()
    if (state.status !== 'running') return null

    // On first tick of a new step, record the start time
    if (state.stepStartTime === 0 && simTime > 0) {
      set({ stepStartTime: simTime })
      return null
    }

    // Detect a simTime regression caused by an external TDSE reset (user
    // toggled a setting, clicked the timeline reset, etc.) and re-anchor
    // the current step. Without this, the elapsed condition stays false
    // until simTime climbs back past stepStartTime + timePerStep, which
    // can effectively freeze a sweep until the user notices.
    if (simTime < state.stepStartTime) {
      set({ stepStartTime: simTime > 0 ? simTime : 0 })
      return null
    }

    // Check if enough simulation time has elapsed for this realization
    const elapsed = simTime - state.stepStartTime
    if (elapsed < state.config.timePerStep) return null

    // Record result for current step
    const step = state.currentStep
    const w = wForStep(state.config, step)
    const result: SweepResult = {
      w,
      ipr,
      normDrift,
      seed: seedForStep(step),
    }
    const newResults = [...state.results, result]
    const nextStep = step + 1

    if (nextStep >= state.config.steps) {
      // Sweep complete
      set({ status: 'complete', results: newResults, currentStep: nextStep })
      return null
    }

    // Advance to next step
    const nextW = wForStep(state.config, nextStep)
    set({
      currentStep: nextStep,
      stepStartTime: 0, // reset — next tick will capture the new simTime
      results: newResults,
    })
    return nextW
  },

  abort: () => {
    set({ status: 'idle', currentStep: 0, stepStartTime: 0 })
  },

  reset: () => {
    set({
      status: 'idle',
      config: DEFAULT_CONFIG,
      currentStep: 0,
      stepStartTime: 0,
      results: [],
    })
  },
}))

export { seedForStep, wForStep }
