/**
 * Zustand slice for the Bell-pair configuration.
 *
 * Holds the user-tunable settings of the Bell / CHSH experiment object:
 * the four measurement axes, Werner visibility v, detection efficiency η,
 * per-particle precession fields, sampler mode (QM vs LHV), trial-loop
 * pacing, and PRNG seed. Trial-loop *state* (accumulators, S history,
 * outcome stream) lives in the Bell-experiment diagnostic store (M3) —
 * keep them separate so presets serialize cleanly.
 *
 * All setters auto-bump `bellPairVersion` so the renderer/strategy picks
 * up changes via dirty-flag tracking.
 *
 * @module stores/slices/geometry/bellPairSlice
 */

import { StateCreator } from 'zustand'

import {
  type BellAnalysisMode,
  type BellPairAxis,
  type BellPairConfig,
  type BellPairField,
  type BellSamplerMode,
  createDefaultBellPairConfig,
} from '@/lib/geometry/extended/bellPair'

import { type BellPairSlice, type ExtendedObjectSlice } from './types'

/** Clamp a number to [min, max]; returns NaN passthrough for non-finite input. */
const clampFinite = (value: number, min: number, max: number): number | null => {
  if (!Number.isFinite(value)) return null
  return Math.max(min, Math.min(max, value))
}

/** Normalize a Bloch axis: θ ∈ [0, π], φ folded to [0, 2π). */
const normalizeAxis = (axis: BellPairAxis): BellPairAxis | null => {
  const t = clampFinite(axis[0], 0, Math.PI)
  if (t === null) return null
  const phiRaw = axis[1]
  if (!Number.isFinite(phiRaw)) return null
  const twoPi = 2 * Math.PI
  const phi = ((phiRaw % twoPi) + twoPi) % twoPi
  return [t, phi]
}

/** Validate and clamp a 3-vector field; returns null on non-finite entries. */
const normalizeField = (b: BellPairField): BellPairField | null => {
  if (!b.every((x) => Number.isFinite(x))) return null
  const lim = 50 // Larmor angular frequency cap, |B| · t per frame
  return [
    Math.max(-lim, Math.min(lim, b[0])),
    Math.max(-lim, Math.min(lim, b[1])),
    Math.max(-lim, Math.min(lim, b[2])),
  ]
}

/**
 * Slice creator. Auto-bumps the bellPairVersion counter whenever any
 * `bellPair` field changes so the renderer's dirty check fires.
 */
export const createBellPairSlice: StateCreator<ExtendedObjectSlice, [], [], BellPairSlice> = (
  set,
  get
) => {
  /** Wrapped setter that auto-increments bellPairVersion on bellPair changes. */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('bellPair' in update) {
        return { ...update, bellPairVersion: state.bellPairVersion + 1 }
      }
      return update
    })
  }

  /** Helper: update a single BellPairConfig field. */
  const setField = <K extends keyof BellPairConfig>(key: K, value: BellPairConfig[K]) => {
    setWithVersion((state) => ({
      bellPair: { ...state.bellPair, [key]: value },
    }))
  }

  return {
    bellPair: createDefaultBellPairConfig(),

    // === Measurement axes ===
    setBellAliceAxis: (axis) => {
      const a = normalizeAxis(axis)
      if (a !== null) setField('aliceAxis', a)
    },
    setBellAliceAxisPrime: (axis) => {
      const a = normalizeAxis(axis)
      if (a !== null) setField('aliceAxisPrime', a)
    },
    setBellBobAxis: (axis) => {
      const a = normalizeAxis(axis)
      if (a !== null) setField('bobAxis', a)
    },
    setBellBobAxisPrime: (axis) => {
      const a = normalizeAxis(axis)
      if (a !== null) setField('bobAxisPrime', a)
    },

    // === State noise / loopholes ===
    setBellVisibility: (v) => {
      const x = clampFinite(v, 0, 1)
      if (x !== null) setField('visibility', x)
    },
    setBellDetectionEfficiency: (eta) => {
      const x = clampFinite(eta, 0, 1)
      if (x !== null) setField('detectionEfficiency', x)
    },
    setBellAnalysisMode: (mode: BellAnalysisMode) => setField('analysisMode', mode),

    // === Precession fields ===
    setBellFieldA: (b) => {
      const f = normalizeField(b)
      if (f !== null) setField('fieldA', f)
    },
    setBellFieldB: (b) => {
      const f = normalizeField(b)
      if (f !== null) setField('fieldB', f)
    },

    // === Sampler ===
    setBellSamplerMode: (mode: BellSamplerMode) => setField('samplerMode', mode),
    setBellLhvStrategyId: (id: string) => setField('lhvStrategyId', id),

    // === Trial loop ===
    setBellTargetTrials: (n) => {
      if (!Number.isFinite(n)) return
      setField('targetTrials', Math.max(4, Math.min(10_000_000, Math.round(n))))
    },
    setBellTrialsPerFrame: (n) => {
      if (!Number.isFinite(n)) return
      setField('trialsPerFrame', Math.max(1, Math.min(5000, Math.round(n))))
    },

    // === Reproducibility ===
    setBellSeed: (seed) => {
      if (!Number.isFinite(seed)) return
      setField('seed', Math.round(seed) >>> 0)
    },

    // === Lifecycle ===
    resetBellPair: () => {
      setWithVersion((state) => ({
        bellPair: { ...state.bellPair, needsReset: true },
      }))
    },
    setBellPairConfig: (config) => {
      setWithVersion((state) => ({
        bellPair: { ...state.bellPair, ...config },
      }))
    },
    getBellPairConfig: () => get().bellPair,
  }
}
