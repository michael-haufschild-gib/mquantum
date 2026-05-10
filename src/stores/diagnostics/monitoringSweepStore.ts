/**
 * Monitoring Sweep Store
 *
 * State machine for automated parameter scans across monitoring rate γ.
 * Each sweep point runs for a configured simulation time, records
 * time-averaged IPR + norm drift, then advances to the next γ value.
 *
 * Coordinates with the TDSE render loop via simTime progression:
 * the consumer reads tick() each diagnostic frame and applies the
 * returned γ value (triggering a wavefunction reset).
 *
 * Implemented on top of the shared `createSweepStore` factory; the variant-
 * specific bits are: linear γ interpolation, mid-step accumulation of IPR /
 * norm-drift samples (`iprAccumulator` / `normDriftAccumulator`), and
 * time-averaged finalization.
 *
 * @module stores/monitoringSweepStore
 */

import { createSweepStore } from '../utils/createSweepStore'
import { linearStepValue } from '../utils/sweepUtils'

export type { SweepStatus as MonitoringSweepStatus } from '../utils/sweepUtils'

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

/**
 * Mid-step sample accumulators. The factory spreads these into the store's
 * top-level state, so consumers can read `state.iprAccumulator` directly.
 */
interface MonitoringSweepSamples {
  /** IPR samples accumulated during the current step for time-averaging. */
  iprAccumulator: number[]
  /** Norm drift samples accumulated during the current step. */
  normDriftAccumulator: number[]
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

/** Arithmetic mean of a non-empty sample array. Returns 0 if empty (defensive). */
function mean(samples: number[]): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const v of samples) sum += v
  return sum / samples.length
}

/** Zustand store for monitoring sweep mode. */
export const useMonitoringSweepStore = createSweepStore<
  MonitoringSweepConfig,
  MonitoringSweepResult,
  MonitoringSweepSamples
>({
  defaultConfig: DEFAULT_CONFIG,
  valueForStep: gammaForStep,
  initSamples: () => ({ iprAccumulator: [], normDriftAccumulator: [] }),
  onSample: (samples, ipr, normDrift) => ({
    iprAccumulator: [...samples.iprAccumulator, ipr],
    normDriftAccumulator: [...samples.normDriftAccumulator, normDrift],
  }),
  finalize: (config, step, samples) => ({
    gamma: gammaForStep(config, step),
    ipr: mean(samples.iprAccumulator),
    normDrift: mean(samples.normDriftAccumulator),
  }),
})
