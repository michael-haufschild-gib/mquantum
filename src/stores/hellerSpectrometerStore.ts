/**
 * Heller Wavepacket Spectrometer Store
 *
 * Bridges the TDSE compute pass and the analysis UI for the wavepacket
 * spectrometer instrument. The pass writes capture state (enabled flag,
 * sample interval, latest sample count); the UI reads it to drive the
 * spectrometer panel.
 *
 * Access pattern:
 *  - `enabled`, `sampleInterval`, `sampleCount`, `resetVersion` are
 *    reactive fields that trigger component re-renders.
 *  - `bufferRef` is a non-reactive live reference to the ring buffer
 *    owned by the TDSE pass. The UI only reads it from event handlers
 *    (e.g. the "Compute spectrum" button onClick), never during render,
 *    so there is no staleness risk.
 *
 * @module stores/hellerSpectrometerStore
 */

import { create } from 'zustand'

import type { HellerRingBuffer } from '@/lib/physics/tdse/heller'

/** Default frames between autocorrelation samples. */
export const HELLER_DEFAULT_SAMPLE_INTERVAL = 2

/** Minimum and maximum slider bounds for `sampleInterval`. */
export const HELLER_MIN_SAMPLE_INTERVAL = 1
export const HELLER_MAX_SAMPLE_INTERVAL = 30

/** State shape of the Heller spectrometer store. */
export interface HellerSpectrometerState {
  /** Whether the pass should capture autocorrelation samples. */
  enabled: boolean
  /** Frames between successive captures. */
  sampleInterval: number
  /** Number of samples currently stored in the ring buffer. */
  sampleCount: number
  /** Bumped by `bumpResetVersion` whenever the ring buffer is cleared. */
  resetVersion: number
  /**
   * Monotonic token the UI increments to request a full reset of the
   * capture (ψ₀ snapshot + ring buffer + in-flight generation). The
   * TDSE pass watches this value each frame; when it disagrees with
   * its locally cached handled token, the pass calls `resetHellerCapture`.
   * This is the only safe way for the UI to clear ψ₀ because the pass
   * is the sole owner of `_hellerState`.
   */
  pendingResetToken: number
  /** Live reference to the pass's ring buffer. `null` until wired. */
  bufferRef: HellerRingBuffer | null
  /**
   * True when the TDSE pass has detected a time-dependent Hamiltonian
   * this frame (i.e. driven potential with drive armed). The pass
   * suspends capture in that regime because the Heller theorem assumes
   * a stationary H — the FFT output would otherwise contain drive
   * sidebands that look like eigenvalues but aren't.
   */
  hamiltonianTimeDependent: boolean
  /** Toggle capture on/off. */
  setEnabled: (v: boolean) => void
  /** Set the per-frame sample decimation interval. */
  setSampleInterval: (v: number) => void
  /** Report the latest sample count from the pass. */
  setSampleCount: (v: number) => void
  /** Publish the ring buffer reference (called once by the pass). */
  setBufferRef: (buf: HellerRingBuffer | null) => void
  /**
   * Publish whether the TDSE pass's current config makes the
   * Hamiltonian time-dependent. Called once per frame by the pass —
   * the UI reads it to disable the capture toggle and "Compute
   * spectrum" button with an explanatory banner.
   */
  setHamiltonianTimeDependent: (v: boolean) => void
  /** Increment reset version to signal a buffer clear to consumers. */
  bumpResetVersion: () => void
  /**
   * Increment `pendingResetToken` to ask the pass to clear ψ₀ and the
   * ring buffer on its next frame. Also bumps `resetVersion` so the UI
   * drops any stale computed spectrum.
   */
  requestReset: () => void
}

/**
 * Zustand store coupling the Heller readback state to the UI panel.
 *
 * @example
 * ```ts
 * useHellerSpectrometerStore.getState().setEnabled(true)
 * ```
 */
export const useHellerSpectrometerStore = create<HellerSpectrometerState>((set) => ({
  enabled: false,
  sampleInterval: HELLER_DEFAULT_SAMPLE_INTERVAL,
  sampleCount: 0,
  resetVersion: 0,
  pendingResetToken: 0,
  bufferRef: null,
  hamiltonianTimeDependent: false,
  setEnabled: (v) =>
    set((s) => {
      if (v === s.enabled) return {}
      // Off→on must start a fresh measurement. Without this, resuming
      // capture would anchor against the previous ψ₀ snapshot — the
      // computed autocorrelation would be nonsense because the current
      // wavefunction has evolved far away from the stale reference.
      if (v && !s.enabled) {
        return {
          enabled: v,
          pendingResetToken: s.pendingResetToken + 1,
          resetVersion: s.resetVersion + 1,
          sampleCount: 0,
        }
      }
      return { enabled: v }
    }),
  setSampleInterval: (v) =>
    set((s) => {
      const clamped = Math.max(
        HELLER_MIN_SAMPLE_INTERVAL,
        Math.min(HELLER_MAX_SAMPLE_INTERVAL, Math.round(v))
      )
      if (clamped === s.sampleInterval) return {}
      // A cadence change invalidates the existing trace: mixing two
      // sampling periods into one FFT input shifts every peak on the ω
      // axis. Restart the capture so the new interval is applied to a
      // fully fresh buffer and ψ₀ snapshot.
      return {
        sampleInterval: clamped,
        pendingResetToken: s.pendingResetToken + 1,
        resetVersion: s.resetVersion + 1,
        sampleCount: 0,
      }
    }),
  setSampleCount: (v) => set({ sampleCount: v }),
  setBufferRef: (buf) => set({ bufferRef: buf }),
  setHamiltonianTimeDependent: (v) => set({ hamiltonianTimeDependent: v }),
  bumpResetVersion: () => set((s) => ({ resetVersion: s.resetVersion + 1, sampleCount: 0 })),
  requestReset: () =>
    set((s) => ({
      pendingResetToken: s.pendingResetToken + 1,
      resetVersion: s.resetVersion + 1,
      sampleCount: 0,
    })),
}))
