/**
 * Anderson Disorder Sweep Store
 *
 * State machine for automated parameter scans across disorder strength W.
 * Coordinates with the TDSE render loop via simTime progression:
 * each realization runs for a configured simulation time, then the sweep
 * records IPR + norm drift and advances to the next W value.
 *
 * Implemented on top of the shared `createSweepStore` factory; the variant-
 * specific bits are: linear W interpolation, deterministic per-step seed,
 * single-shot sampling at the advance moment, and rejection of non-finite or
 * negative diagnostic readings.
 *
 * @module stores/andersonSweepStore
 */

import { createSweepStore } from '../utils/createSweepStore'
import { linearStepValue } from '../utils/sweepUtils'

export type { SweepStatus } from '../utils/sweepUtils'

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
export const useAndersonSweepStore = createSweepStore<SweepConfig, SweepResult>({
  defaultConfig: DEFAULT_CONFIG,
  valueForStep: wForStep,
  finalize: (config, step, _samples, ipr, normDrift) => ({
    w: wForStep(config, step),
    ipr,
    normDrift,
    seed: seedForStep(step),
  }),
  validateTickInputs: (simTime, ipr, normDrift) =>
    Number.isFinite(simTime) && Number.isFinite(ipr) && ipr >= 0 && Number.isFinite(normDrift),
})

export { seedForStep, wForStep }
