/**
 * SRMT (Superspace-Relational Modular Time) diagnostic store.
 *
 * Holds the most recent Schmidt modular spectrum, Hamilton-Jacobi
 * eigenspectrum, and affine-match quality readouts produced by
 * {@link WheelerDeWittStrategy} after evaluating
 * {@link computeSrmtDiagnostic} against the cached Wheeler–DeWitt solver
 * output. The UI subscribes to this store to render the
 * side-by-side spectra comparison and the cross-clock quality table.
 *
 * Pattern mirrors {@link useWormholeCoherenceStore}: mutable arrays
 * written by the strategy, a monotonic `version` counter so React
 * consumers can detect updates cheaply, and a `clear` action that
 * resets everything (used on `WheelerDeWittStrategy.dispose` and on
 * `srmtEnabled` true → false transitions).
 *
 * ## Ownership and coupling
 *
 * The store is **singleton-coupled to the active Wheeler–DeWitt
 * strategy**. The renderer instantiates exactly one strategy per mode
 * and swaps it when the quantum mode changes — so at most one writer
 * exists at any wall-clock moment. `dispose()` unconditionally
 * `clear()`s the store because the caller guarantees no other
 * coordinator is writing.
 *
 * If side-by-side rendering of multiple WdW instances is ever
 * introduced, this store becomes a global singleton on a per-instance
 * resource, and the ownership guarantee breaks. The refactor would be
 * to make the coordinator carry its own local store (via `createStore`
 * from Zustand's vanilla API) and expose a scoped hook to the panel.
 * Tracked in the `WheelerDeWittSrmtCoordinator.dispose` docstring.
 *
 * All three clock slots are always populated — clocks that were not
 * computed synchronously hold `NaN` for affine quality and empty
 * `Float32Array`s for the spectra; the UI displays these as "pending"
 * with a reference to the upcoming Rust/WASM port plan tracked in
 * ADR-011.
 *
 * @module stores/srmtDiagnosticStore
 */

import { create } from 'zustand'

import type { SrmtClock, SrmtSlicePlane } from '@/lib/physics/srmt'

/**
 * Per-clock affine-match quality (lower is better; NaN = pending/not
 * yet computed, e.g. because the synchronous compute budget was
 * exhausted on the other clocks).
 */
export interface SrmtClockQuality {
  a: number
  phi1: number
  phi2: number
}

/**
 * Snapshot the strategy writes after a successful diagnostic run.
 */
export interface SrmtSnapshot {
  /** Clock actually computed synchronously (source of truth for kSpectrum / hjSpectrum). */
  clock: SrmtClock
  /** Slice plane matching `clock`. */
  slicePlane: SrmtSlicePlane
  /** Integer cut index used on the clock axis. */
  cutIndex: number
  /** Rank cap used; ≤ `srmtRankCap` from config. */
  rankCap: number
  /** Modular Hamiltonian spectrum `K_n`, ascending. */
  kSpectrum: Float32Array
  /** Hamilton-Jacobi operator spectrum, ascending. */
  hjSpectrum: Float32Array
  /** Affine-match quality of the selected clock (duplicated in `clockAffineQuality`). */
  affineMatchQuality: number
  /** Wall-clock compute duration in milliseconds (selected clock only). */
  computeTimeMs: number
}

/** Public shape of the SRMT diagnostic store. */
export interface SrmtDiagnosticState {
  /** Most recent diagnostic snapshot; `null` before the first run. */
  snapshot: SrmtSnapshot | null
  /**
   * Cross-clock affine-match quality. NaN entries are "pending" — either
   * the queue has not drained yet (the sequential dispatcher fills them
   * one at a time) or SRMT is disabled. The UI renders these as
   * placeholders until a concrete number arrives.
   */
  clockAffineQuality: SrmtClockQuality
  /**
   * True while any SRMT diagnostic dispatch is in-flight. Stays `true` for
   * the entire duration of a three-clock batch — flipped to `false` only
   * when the queue fully drains or the dispatcher cancels. The UI renders
   * the progress indicator `Computing: X/3 clocks` while this is true
   * (X = finite entries in `clockAffineQuality`).
   */
  computing: boolean
  /** Monotonic update counter for React subscribers. */
  version: number

  /** Overwrite the snapshot + quality record (bumps version). */
  setDiagnostic: (snapshot: SrmtSnapshot, quality: SrmtClockQuality) => void
  /**
   * Merge a single clock's affine-match quality into `clockAffineQuality`.
   * Used by the sequential dispatcher when a non-selected clock's
   * result arrives — the snapshot is driven by the selected clock, so that
   * stays put; only the one slot gets overwritten. Bumps `version`.
   *
   * @param clock - Clock axis that just completed computing.
   * @param affineMatchQuality - Scalar affine-match quality from the reply
   *   (NaN treated as a no-op pending value).
   */
  setClockQuality: (clock: SrmtClock, affineMatchQuality: number) => void
  /**
   * Set the `computing` flag. Called from the worker dispatcher at batch
   * start (`true`) and on final result / error / cancel (`false`). Bumps
   * `version` so `useShallow` selectors re-render.
   */
  setSrmtComputing: (computing: boolean) => void
  /** Clear everything back to the initial state (bumps version). */
  clear: () => void
}

/** Factory for a "pending" quality record (all NaN). */
export function createPendingClockQuality(): SrmtClockQuality {
  return { a: Number.NaN, phi1: Number.NaN, phi2: Number.NaN }
}

/**
 * Create the SRMT diagnostic Zustand store. Initial state: no snapshot,
 * all-NaN quality, version 0.
 */
export const useSrmtDiagnosticStore = create<SrmtDiagnosticState>((set) => ({
  snapshot: null,
  clockAffineQuality: createPendingClockQuality(),
  computing: false,
  version: 0,

  setDiagnostic: (snapshot, quality) => {
    set((s) => ({
      snapshot,
      clockAffineQuality: { ...quality },
      version: s.version + 1,
    }))
  },

  setClockQuality: (clock, affineMatchQuality) => {
    set((s) => ({
      clockAffineQuality: {
        ...s.clockAffineQuality,
        [clock]: affineMatchQuality,
      },
      version: s.version + 1,
    }))
  },

  setSrmtComputing: (computing) => {
    set((s) => ({
      computing,
      version: s.version + 1,
    }))
  },

  clear: () => {
    set((s) => ({
      snapshot: null,
      clockAffineQuality: createPendingClockQuality(),
      computing: false,
      version: s.version + 1,
    }))
  },
}))
