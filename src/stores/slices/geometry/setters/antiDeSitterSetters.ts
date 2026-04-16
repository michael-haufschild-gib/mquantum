/**
 * Anti-de Sitter (Stage 1) setter factory.
 *
 * Mirrors the Wheeler–DeWitt setters: each physics-affecting setter writes
 * the target field AND flips `antiDeSitter.needsReset = true` in a single
 * `setWithVersion` transaction so the strategy re-packs the density texture
 * exactly once per user interaction.
 *
 * Mutating `l` cascades onto `m` (clamp to [-l, +l]); mutating `d` leaves
 * (n, ℓ, m) alone but they remain subject to their own UI clamps.
 *
 * TODO(Stage2): Expose BTZ-thermal toggle and Chern-Simons level setter at
 * the same layer — no shared plumbing required beyond this file.
 *
 * @module stores/slices/geometry/setters/antiDeSitterSetters
 */

import type {
  AdsPresetName,
  AdsQuantizationBranch,
  AntiDeSitterConfig,
} from '@/lib/geometry/extended/antiDeSitter'
import { ADS_PRESET_MAP } from '@/lib/physics/antiDeSitter/presets'

import type { SetterContext } from './sliceSetterUtils'

/** Closed interval bounds for the AdS sliders. */
export const ADS_LIMITS = {
  dMin: 3,
  dMax: 7,
  nMin: 0,
  nMax: 4,
  lMin: 0,
  lMax: 3,
  mLMin: -3,
  mLMax: 3,
  // Stage 2A BTZ bounds (see PRD).
  btzHorizonMin: 0.05,
  btzHorizonMax: 2.0,
  btzOmegaMin: 0.1,
  btzOmegaMax: 10.0,
  btzAngularMMin: -5,
  btzAngularMMax: 5,
} as const

/** Actions exposed by the AdS setter bundle. */
export interface AntiDeSitterSetters {
  setAdsDimension: (d: number) => void
  setAdsRadialQuantumNumber: (n: number) => void
  setAdsAngularQuantumNumber: (l: number) => void
  setAdsMagneticQuantumNumber: (m: number) => void
  setAdsMassParameter: (mL: number) => void
  setAdsQuantizationBranch: (branch: AdsQuantizationBranch) => void
  setAdsBoundaryOverlay: (enabled: boolean) => void
  setAdsPreset: (name: AdsPresetName) => void
  setAdsBtzEnabled: (enabled: boolean) => void
  setAdsBtzHorizonRadius: (r: number) => void
  setAdsBtzOmega: (omega: number) => void
  setAdsBtzAngularM: (m: number) => void
  triggerAdsRecompute: () => void
  clearAdsNeedsReset: () => void
}

/** Apply a single field mutation and flag `needsReset`. */
function applyWithReset(ctx: SetterContext, partial: Partial<AntiDeSitterConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      antiDeSitter: {
        ...state.schroedinger.antiDeSitter,
        ...partial,
        needsReset: true,
      },
    },
  }))
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)))
}

/**
 * Build the full AdS setter bundle. Mirrors the WdW pattern: physics-
 * affecting setters mark the strategy dirty; the `preset` field is marked
 * `custom` on any individual-field mutation so the dropdown correctly
 * reflects user edits.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createAntiDeSitterSetters(ctx: SetterContext): AntiDeSitterSetters {
  const {
    dMin,
    dMax,
    nMin,
    nMax,
    lMin,
    lMax,
    mLMin,
    mLMax,
    btzHorizonMin,
    btzHorizonMax,
    btzOmegaMin,
    btzOmegaMax,
    btzAngularMMin,
    btzAngularMMax,
  } = ADS_LIMITS

  return {
    setAdsDimension: (d) => {
      if (!ctx.isFinite(d)) {
        ctx.warnNonFinite('antiDeSitter.d', d)
        return
      }
      applyWithReset(ctx, { d: clampInt(d, dMin, dMax), preset: 'custom' })
    },
    setAdsRadialQuantumNumber: (n) => {
      if (!ctx.isFinite(n)) {
        ctx.warnNonFinite('antiDeSitter.n', n)
        return
      }
      applyWithReset(ctx, { n: clampInt(n, nMin, nMax), preset: 'custom' })
    },
    setAdsAngularQuantumNumber: (l) => {
      if (!ctx.isFinite(l)) {
        ctx.warnNonFinite('antiDeSitter.l', l)
        return
      }
      const clampedL = clampInt(l, lMin, lMax)
      const currentM = ctx.get().schroedinger.antiDeSitter.m
      const newM = clampInt(currentM, -clampedL, clampedL)
      applyWithReset(ctx, { l: clampedL, m: newM, preset: 'custom' })
    },
    setAdsMagneticQuantumNumber: (m) => {
      if (!ctx.isFinite(m)) {
        ctx.warnNonFinite('antiDeSitter.m', m)
        return
      }
      const l = ctx.get().schroedinger.antiDeSitter.l
      // `|| 0` normalises JS −0 to +0 when l = 0.
      const clampedM = clampInt(m, -l, l) || 0
      applyWithReset(ctx, { m: clampedM, preset: 'custom' })
    },
    setAdsMassParameter: (mL) => {
      if (!ctx.isFinite(mL)) {
        ctx.warnNonFinite('antiDeSitter.mL', mL)
        return
      }
      applyWithReset(ctx, { mL: clamp(mL, mLMin, mLMax), preset: 'custom' })
    },
    setAdsQuantizationBranch: (branch) => {
      applyWithReset(ctx, { branch, preset: 'custom' })
    },
    setAdsBoundaryOverlay: (enabled) => {
      applyWithReset(ctx, { boundaryOverlay: enabled, preset: 'custom' })
    },
    setAdsPreset: (name) => {
      if (name === 'custom') {
        ctx.setWithVersion((state) => ({
          schroedinger: {
            ...state.schroedinger,
            antiDeSitter: { ...state.schroedinger.antiDeSitter, preset: 'custom' },
          },
        }))
        return
      }
      const preset = ADS_PRESET_MAP[name]
      if (!preset) return
      applyWithReset(ctx, {
        d: preset.d,
        n: preset.n,
        l: preset.l,
        m: preset.m,
        mL: preset.mL,
        branch: preset.branch,
        boundaryOverlay: preset.boundaryOverlay,
        // BTZ sub-config: explicit values override; absent means "reset to
        // default". Stops a BTZ preset from leaking its horizon/omega
        // settings into a subsequently-selected AdS bound-state preset.
        btzEnabled: preset.btzEnabled ?? false,
        btzHorizonRadius: preset.btzHorizonRadius ?? 0.3,
        btzOmega: preset.btzOmega ?? 1.0,
        btzAngularM: preset.btzAngularM ?? 0,
        preset: name,
      })
    },
    setAdsBtzEnabled: (enabled) => {
      applyWithReset(ctx, { btzEnabled: !!enabled, preset: 'custom' })
    },
    setAdsBtzHorizonRadius: (r) => {
      if (!ctx.isFinite(r)) {
        ctx.warnNonFinite('antiDeSitter.btzHorizonRadius', r)
        return
      }
      applyWithReset(ctx, {
        btzHorizonRadius: clamp(r, btzHorizonMin, btzHorizonMax),
        preset: 'custom',
      })
    },
    setAdsBtzOmega: (omega) => {
      if (!ctx.isFinite(omega)) {
        ctx.warnNonFinite('antiDeSitter.btzOmega', omega)
        return
      }
      applyWithReset(ctx, { btzOmega: clamp(omega, btzOmegaMin, btzOmegaMax), preset: 'custom' })
    },
    setAdsBtzAngularM: (m) => {
      if (!ctx.isFinite(m)) {
        ctx.warnNonFinite('antiDeSitter.btzAngularM', m)
        return
      }
      const clampedM = clampInt(m, btzAngularMMin, btzAngularMMax) || 0
      applyWithReset(ctx, { btzAngularM: clampedM, preset: 'custom' })
    },
    triggerAdsRecompute: () => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          antiDeSitter: { ...state.schroedinger.antiDeSitter, needsReset: true },
        },
      }))
    },
    clearAdsNeedsReset: () => {
      ctx.set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          antiDeSitter: { ...state.schroedinger.antiDeSitter, needsReset: false },
        },
      }))
    },
  }
}
