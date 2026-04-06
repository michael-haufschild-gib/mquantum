/**
 * Monitoring Sweep Store
 *
 * State machine for automated parameter scans across monitoring rate γ.
 * Mirrors andersonSweepStore.ts architecture: each sweep point runs for
 * a configured simulation time, records time-averaged IPR + norm drift,
 * then advances to the next γ value.
 *
 * Coordinates with the TDSE render loop via simTime progression:
 * the consumer reads tick() each diagnostic frame and applies the
 * returned γ value (triggering a wavefunction reset).
 *
 * @module stores/monitoringSweepStore
 */

import { create } from 'zustand'

import { linearStepValue, type SweepStatus } from './utils/sweepUtils'

export type { SweepStatus as MonitoringSweepStatus } from './utils/sweepUtils'

/** Configuration for a monitoring sweep. */
export interface MonitoringSweepConfig {
  /** Minimum monitoring rate γ */
  gammaMin: number
  /** Maximum monitoring rate γ */
  gammaMax: number
  /** Number of γ values to scan */
  steps: number
  /** Simulation time per point (in simulation time units) */
  timePerStep: number
}

/** Result of a single point in the monitoring sweep. */
export interface MonitoringSweepResult {
  /** Monitoring rate γ for this point */
  gamma: number
  /** Time-averaged inverse participation ratio over the measurement window */
  ipr: number
  /** Fractional norm drift from initial value */
  normDrift: number
}

interface MonitoringSweepState {
  /** Current sweep status */
  status: SweepStatus
  /** Sweep configuration (set at start) */
  config: MonitoringSweepConfig
  /** Current step index (0-based) */
  currentStep: number
  /** simTime at the start of the current point */
  stepStartTime: number
  /** Accumulated results from completed points */
  results: MonitoringSweepResult[]
  /** IPR samples accumulated during the current step for time-averaging */
  iprAccumulator: number[]
  /** Norm drift samples accumulated during the current step */
  normDriftAccumulator: number[]

  /** Start a new sweep. Caller must set the initial γ in the TDSE config. */
  startSweep: (config: MonitoringSweepConfig) => void
  /**
   * Called each diagnostic frame with current simulation state.
   * Returns the next γ value if the step should advance, or null if still running.
   */
  tick: (simTime: number, ipr: number, normDrift: number) => number | null
  /** Abort a running sweep. */
  abort: () => void
  /** Reset to idle, clearing results. */
  reset: () => void
}

const DEFAULT_CONFIG: MonitoringSweepConfig = {
  gammaMin: 0.01,
  gammaMax: 5.0,
  steps: 20,
  timePerStep: 1.0,
}

/**
 * Compute the γ value for a given step index.
 *
 * @param config - Sweep configuration
 * @param step - Step index (0-based)
 * @returns Monitoring rate γ
 */
export function gammaForStep(config: MonitoringSweepConfig, step: number): number {
  return linearStepValue(config.gammaMin, config.gammaMax, config.steps, step)
}

/** Zustand store for monitoring sweep mode. */
export const useMonitoringSweepStore = create<MonitoringSweepState>((set, get) => ({
  status: 'idle',
  config: DEFAULT_CONFIG,
  currentStep: 0,
  stepStartTime: 0,
  results: [],
  iprAccumulator: [],
  normDriftAccumulator: [],

  startSweep: (config) => {
    set({
      status: 'running',
      config,
      currentStep: 0,
      stepStartTime: 0,
      results: [],
      iprAccumulator: [],
      normDriftAccumulator: [],
    })
  },

  tick: (simTime, ipr, normDrift) => {
    const state = get()
    if (state.status !== 'running') return null

    // On first tick of a new step, record the start time
    if (state.stepStartTime === 0 && simTime > 0) {
      set({ stepStartTime: simTime, iprAccumulator: [ipr], normDriftAccumulator: [normDrift] })
      return null
    }

    // Accumulate samples for time-averaging
    const iprSamples = [...state.iprAccumulator, ipr]
    const ndSamples = [...state.normDriftAccumulator, normDrift]

    // Check if enough simulation time has elapsed
    const elapsed = simTime - state.stepStartTime
    if (elapsed < state.config.timePerStep) {
      set({ iprAccumulator: iprSamples, normDriftAccumulator: ndSamples })
      return null
    }

    // Record time-averaged result for current step
    const step = state.currentStep
    const gamma = gammaForStep(state.config, step)
    const avgIpr = iprSamples.reduce((a, b) => a + b, 0) / iprSamples.length
    const avgNormDrift = ndSamples.reduce((a, b) => a + b, 0) / ndSamples.length
    const result: MonitoringSweepResult = { gamma, ipr: avgIpr, normDrift: avgNormDrift }
    const newResults = [...state.results, result]
    const nextStep = step + 1

    if (nextStep >= state.config.steps) {
      // Sweep complete
      set({
        status: 'complete',
        results: newResults,
        currentStep: nextStep,
        iprAccumulator: [],
        normDriftAccumulator: [],
      })
      return null
    }

    // Advance to next step
    const nextGamma = gammaForStep(state.config, nextStep)
    set({
      currentStep: nextStep,
      stepStartTime: 0,
      results: newResults,
      iprAccumulator: [],
      normDriftAccumulator: [],
    })
    return nextGamma
  },

  abort: () => {
    set({
      status: 'idle',
      currentStep: 0,
      stepStartTime: 0,
      iprAccumulator: [],
      normDriftAccumulator: [],
    })
  },

  reset: () => {
    set({
      status: 'idle',
      config: DEFAULT_CONFIG,
      currentStep: 0,
      stepStartTime: 0,
      results: [],
      iprAccumulator: [],
      normDriftAccumulator: [],
    })
  },
}))
