/**
 * Shared utilities for parameter sweep stores.
 *
 * Provides the common status type and step interpolation functions
 * used by andersonSweepStore, monitoringSweepStore, quantumnessAtlasStore,
 * and coordinateEntanglementStore.
 *
 * @module stores/utils/sweepUtils
 */

/** Sweep state machine phases common to all sweep stores. */
export type SweepStatus = 'idle' | 'running' | 'complete'

/**
 * Linearly interpolate a parameter value for a given sweep step.
 *
 * @param min - Minimum value (returned at step 0)
 * @param max - Maximum value (returned at step `steps - 1`)
 * @param steps - Total number of steps in the sweep
 * @param step - Current step index (0-based)
 * @returns Interpolated value
 */
export function linearStepValue(min: number, max: number, steps: number, step: number): number {
  if (steps <= 1) return min
  return min + (step * (max - min)) / (steps - 1)
}

/**
 * Log-spaced interpolation of a parameter value for a given sweep step.
 *
 * Produces geometrically spaced values between min and max.
 * Equivalent to `min * (max/min)^(step/(steps-1))`.
 *
 * @param min - Minimum value (must be > 0, returned at step 0)
 * @param max - Maximum value (must be > 0, returned at step `steps - 1`)
 * @param steps - Total number of steps in the sweep
 * @param step - Current step index (0-based)
 * @returns Log-interpolated value
 */
export function logStepValue(min: number, max: number, steps: number, step: number): number {
  if (steps <= 1) return min
  const t = step / (steps - 1)
  return min * Math.pow(max / min, t)
}
