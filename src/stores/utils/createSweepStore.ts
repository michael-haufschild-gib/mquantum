/**
 * Generic factory for parameter-sweep state machines.
 *
 * Both andersonSweepStore and monitoringSweepStore share the same orchestration:
 * a `'idle' | 'running' | 'complete'` state machine driven by simTime ticks
 * that capture a step start time on the first non-zero tick, detect simTime
 * regressions caused by external resets, advance to the next step once
 * `timePerStep` simulation time has elapsed, and emit a result per step.
 *
 * The variants differ only in sampling semantics:
 * - Anderson samples once at the advance moment (no mid-step accumulation).
 * - Monitoring time-averages mid-step samples accumulated each tick.
 *
 * This factory captures the shared orchestration once and parameterises the
 * sampling via three callbacks (`initSamples`, `onSample`, `finalize`). The
 * generic `Samples` shape is spread directly into the store's top-level state
 * so the per-store public API can keep its existing field names
 * (`iprAccumulator`, `normDriftAccumulator`) without an extra `samples` indirection.
 *
 * @module stores/utils/createSweepStore
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { SweepStatus } from './sweepUtils'

/**
 * Marker for "no per-step sample accumulator". Anderson uses this; Monitoring
 * provides its own concrete `{ iprAccumulator, normDriftAccumulator }` shape.
 *
 * Empty interface (rather than `Record<string, never>` or `{}`) so that
 * `SweepState & EmptySamples` does not introduce an index signature that
 * blocks `Partial<State>` patches in `setState`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EmptySamples {}

/** Minimum config shape every sweep needs. */
export interface SweepConfigBase {
  /** Total number of steps in the sweep. */
  steps: number
  /** Simulation time per step (in simulation time units). */
  timePerStep: number
}

/**
 * Base state shape produced by the factory, before any `Samples` keys are
 * spread in. The `Samples` generic is merged into this type at construction
 * time to form the final store state.
 */
interface SweepStateBase<Config extends SweepConfigBase, Result> {
  /** Current sweep status. */
  status: SweepStatus
  /** Sweep configuration (set at start). */
  config: Config
  /** Current step index (0-based). */
  currentStep: number
  /** simTime at the start of the current step. */
  stepStartTime: number
  /** Accumulated results from completed steps. */
  results: Result[]
  /** Start a new sweep. Caller must apply the initial parameter to the simulator. */
  startSweep: (config: Config) => void
  /**
   * Drive the state machine. Returns the next parameter value if a step
   * boundary was just crossed, or null otherwise (either still running, not
   * running, complete, or invalid input).
   */
  tick: (simTime: number, ipr: number, normDrift: number) => number | null
  /** Abort a running sweep. Preserves results; clears step state and samples. */
  abort: () => void
  /** Reset to idle, clearing results, config, and samples. */
  reset: () => void
}

/**
 * Final state shape: base orchestration state plus the per-store sample fields
 * spread at the top level.
 */
export type SweepState<
  Config extends SweepConfigBase,
  Result,
  Samples extends object = EmptySamples,
> = SweepStateBase<Config, Result> & Samples

/** Configuration object for the sweep-store factory. */
export interface CreateSweepStoreOptions<
  Config extends SweepConfigBase,
  Result,
  Samples extends object,
> {
  /** Default config returned by `reset()`. */
  defaultConfig: Config
  /**
   * Compute the parameter value for a given step index.
   * Used both internally on advance and (typically) re-exported for UI display.
   */
  valueForStep: (config: Config, step: number) => number
  /**
   * Returns a fresh, empty samples object. Called on startSweep, abort, reset,
   * regression-without-anchor, and step advance.
   * Omit when the sweep does not accumulate samples (Anderson).
   */
  initSamples?: () => Samples
  /**
   * Append the current tick's `(ipr, normDrift)` reading to the samples.
   * Called on first-tick, regression-with-anchor, and every running tick.
   * Omit when the sweep does not accumulate samples (Anderson).
   */
  onSample?: (samples: Samples, ipr: number, normDrift: number) => Samples
  /**
   * Produce the result for the just-completed step. Receives the final samples
   * (after the advance tick has been folded in) plus the raw `(ipr, normDrift)`
   * from the advance tick — Anderson uses the raw values directly; Monitoring
   * averages over `samples`.
   */
  finalize: (
    config: Config,
    step: number,
    samples: Samples,
    ipr: number,
    normDrift: number
  ) => Result
  /**
   * Optional input gate. Return `false` to drop the tick without mutating
   * state. Anderson uses this to reject non-finite or negative diagnostics.
   */
  validateTickInputs?: (simTime: number, ipr: number, normDrift: number) => boolean
}

/**
 * Build a Zustand store implementing the shared sweep state machine.
 *
 * @param options - Sampling, finalization, and validation hooks.
 * @returns A Zustand store hook with `{status, config, currentStep, stepStartTime, results, ...samples, startSweep, tick, abort, reset}`.
 */
export function createSweepStore<
  Config extends SweepConfigBase,
  Result,
  Samples extends object = EmptySamples,
>(
  options: CreateSweepStoreOptions<Config, Result, Samples>
): UseBoundStore<StoreApi<SweepState<Config, Result, Samples>>> {
  const { defaultConfig, valueForStep, initSamples, onSample, finalize, validateTickInputs } =
    options

  /** Helper: produce an empty Samples patch (or `{}` if no sample accumulator was supplied). */
  const emptySamples = (): Samples => (initSamples ? initSamples() : ({} as Samples))

  /**
   * Helper: produce a Samples patch representing "first tick of a step":
   * empty accumulator plus this tick's reading folded in. Reduces to `{}` for
   * sweeps with no sample accumulator.
   */
  const firstTickSamples = (ipr: number, normDrift: number): Samples => {
    if (!initSamples || !onSample) return {} as Samples
    return onSample(initSamples(), ipr, normDrift)
  }

  type State = SweepState<Config, Result, Samples>

  return create<State>((set, get) => {
    /** Build the initial / reset state. Cast through unknown because the
     *  intersection `SweepStateBase & Samples` requires the spread to be
     *  expressed as a single value. */
    const buildInitialState = (config: Config): Omit<State, never> =>
      ({
        status: 'idle' as SweepStatus,
        config,
        currentStep: 0,
        stepStartTime: 0,
        results: [] as Result[],
        ...emptySamples(),
      }) as unknown as State

    return {
      ...buildInitialState(defaultConfig),

      startSweep: (config: Config) => {
        set({
          status: 'running',
          config,
          currentStep: 0,
          stepStartTime: 0,
          results: [],
          ...emptySamples(),
        } as unknown as Partial<State>)
      },

      tick: (simTime: number, ipr: number, normDrift: number): number | null => {
        const state = get()
        if (state.status !== 'running') return null
        if (validateTickInputs && !validateTickInputs(simTime, ipr, normDrift)) {
          return null
        }

        // First tick of a new step: capture the start time and seed samples
        // from the current reading. simTime must be strictly > 0 — a tick at
        // simTime=0 means the simulator hasn't actually advanced yet, so we
        // wait for a real reading rather than anchoring at 0.
        if (state.stepStartTime === 0 && simTime > 0) {
          set({
            stepStartTime: simTime,
            ...firstTickSamples(ipr, normDrift),
          } as unknown as Partial<State>)
          return null
        }

        // Regression: an external simulator reset (user toggled a setting,
        // clicked the timeline reset, etc.) drove simTime back below the
        // step's anchor. Discard any samples accumulated against the
        // pre-reset window and re-anchor the current step:
        //  - simTime > 0: treat this tick as a fresh first-tick and capture
        //    its reading as the new sample-1. (Mirrors the normal first-tick
        //    branch above.)
        //  - simTime <= 0: re-anchor to 0 and wait for a real first-tick;
        //    samples reset to empty.
        if (simTime < state.stepStartTime) {
          if (simTime > 0) {
            set({
              stepStartTime: simTime,
              ...firstTickSamples(ipr, normDrift),
            } as unknown as Partial<State>)
          } else {
            set({
              stepStartTime: 0,
              ...emptySamples(),
            } as unknown as Partial<State>)
          }
          return null
        }

        // Fold this tick's reading into the running accumulator. For sweeps
        // without an accumulator (Anderson), this is a no-op cast.
        const currentSamples = extractSamples<Samples>(
          state as unknown as Record<string, unknown>,
          initSamples
        )
        const newSamples: Samples = onSample
          ? onSample(currentSamples, ipr, normDrift)
          : currentSamples

        const elapsed = simTime - state.stepStartTime
        if (elapsed < state.config.timePerStep) {
          // Mid-step: persist the updated samples and keep waiting. For
          // Anderson this spread is `{}`, leaving state untouched.
          set({ ...newSamples } as unknown as Partial<State>)
          return null
        }

        // Step advances. Compute the result using the FINAL samples (which
        // include this tick's reading) plus the raw (ipr, normDrift). Anderson
        // ignores `newSamples` and uses the raw values; Monitoring averages
        // over `newSamples`.
        const step = state.currentStep
        const result = finalize(state.config, step, newSamples, ipr, normDrift)
        const newResults = [...state.results, result]
        const nextStep = step + 1

        if (nextStep >= state.config.steps) {
          // Sweep complete. Clear samples — the consumer reads `results`.
          set({
            status: 'complete',
            results: newResults,
            currentStep: nextStep,
            ...emptySamples(),
          } as unknown as Partial<State>)
          return null
        }

        // Advance: reset stepStartTime so the next tick re-anchors, and clear
        // the samples accumulator for the next step.
        const nextValue = valueForStep(state.config, nextStep)
        set({
          currentStep: nextStep,
          stepStartTime: 0,
          results: newResults,
          ...emptySamples(),
        } as unknown as Partial<State>)
        return nextValue
      },

      abort: () => {
        set({
          status: 'idle',
          currentStep: 0,
          stepStartTime: 0,
          ...emptySamples(),
        } as unknown as Partial<State>)
      },

      reset: () => {
        set(buildInitialState(defaultConfig) as Partial<State>)
      },
    }
  })
}

/**
 * Extract the current samples sub-object from a flattened state by reading
 * each key returned by `initSamples()`. Returns an empty object cast for
 * sweeps without an accumulator.
 */
function extractSamples<Samples extends object>(
  state: Record<string, unknown>,
  initSamples: (() => Samples) | undefined
): Samples {
  if (!initSamples) return {} as Samples
  // Use the seed object's keys as the authoritative sample-key list; this is
  // computed per-call but the keyset is fixed so the cost is trivial.
  const seed = initSamples() as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(seed)) {
    out[key] = state[key]
  }
  return out as Samples
}
