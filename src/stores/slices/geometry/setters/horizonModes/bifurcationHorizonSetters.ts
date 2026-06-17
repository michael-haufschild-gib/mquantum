/**
 * Bifurcation Horizon setter factory.
 *
 * Mirrors the Riemann Zeta setter pattern: the mode is fully analytic
 * (no compute pass to re-pack), so each setter writes its field through
 * `setWithVersion` — the version bump re-packs the uniform buffer and the
 * strategy regenerates + re-uploads the ζ-zero LUT when a LUT-shaping field
 * (offLine / winding) changes.
 *
 * Every physics-affecting mutation marks `preset: 'custom'` so the scenario
 * dropdown reflects user edits.
 *
 * @module stores/slices/geometry/setters/horizonModes/bifurcationHorizonSetters
 */

import type {
  BifurcationHorizonConfig,
  BifurcationHorizonPresetName,
  BifurcationSpectralDynamics,
} from '@/lib/geometry/extended/bifurcationHorizon'
import {
  BIFURCATION_HORIZON_PRESETS,
  BIFURCATION_HORIZON_RANGES,
} from '@/lib/geometry/extended/bifurcationHorizon'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the Bifurcation Horizon setter bundle. */
export interface BifurcationHorizonSetters {
  setBifurcationHorizonNeckRadius: (r: number) => void
  setBifurcationHorizonThroatWidth: (w: number) => void
  setBifurcationHorizonGlow: (glow: number) => void
  setBifurcationHorizonFlowRate: (rate: number) => void
  setBifurcationHorizonSwirl: (swirl: number) => void
  setBifurcationHorizonRedshiftRadius: (r: number) => void
  setBifurcationHorizonOffLine: (u: number) => void
  setBifurcationHorizonWinding: (w: number) => void
  setBifurcationHorizonThermalGain: (gain: number) => void
  setBifurcationHorizonSpectralDynamics: (mode: BifurcationSpectralDynamics) => void
  setBifurcationHorizonDynamicsAmplitude: (a: number) => void
  setBifurcationHorizonDynamicsRate: (r: number) => void
  setBifurcationHorizonStiffnessTint: (t: number) => void
  setBifurcationHorizonPreset: (name: BifurcationHorizonPresetName) => void
}

/** Apply a partial mutation to `schroedinger.bifurcationHorizon`. */
function applyPartial(ctx: SetterContext, partial: Partial<BifurcationHorizonConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      bifurcationHorizon: {
        ...state.schroedinger.bifurcationHorizon,
        ...partial,
      },
    },
  }))
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

/** Build one clamped numeric setter for a BifurcationHorizonConfig scalar. */
function numericSetter(
  ctx: SetterContext,
  field: keyof typeof BIFURCATION_HORIZON_RANGES
): (value: number) => void {
  const { min, max } = BIFURCATION_HORIZON_RANGES[field]
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`bifurcationHorizon.${field}`, value)
      return
    }
    applyPartial(ctx, { [field]: clamp(value, min, max), preset: 'custom' })
  }
}

/**
 * Build the full Bifurcation Horizon setter bundle.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createBifurcationHorizonSetters(ctx: SetterContext): BifurcationHorizonSetters {
  return {
    setBifurcationHorizonNeckRadius: numericSetter(ctx, 'neckRadius'),
    setBifurcationHorizonThroatWidth: numericSetter(ctx, 'throatWidth'),
    setBifurcationHorizonGlow: numericSetter(ctx, 'glow'),
    setBifurcationHorizonFlowRate: numericSetter(ctx, 'flowRate'),
    setBifurcationHorizonSwirl: numericSetter(ctx, 'swirl'),
    setBifurcationHorizonRedshiftRadius: numericSetter(ctx, 'redshiftRadius'),
    setBifurcationHorizonOffLine: numericSetter(ctx, 'offLine'),
    setBifurcationHorizonWinding: numericSetter(ctx, 'winding'),
    setBifurcationHorizonThermalGain: numericSetter(ctx, 'thermalGain'),
    setBifurcationHorizonDynamicsAmplitude: numericSetter(ctx, 'dynamicsAmplitude'),
    setBifurcationHorizonDynamicsRate: numericSetter(ctx, 'dynamicsRate'),
    setBifurcationHorizonStiffnessTint: numericSetter(ctx, 'stiffnessTint'),
    setBifurcationHorizonSpectralDynamics: (mode) => {
      applyPartial(ctx, { spectralDynamics: mode, preset: 'custom' })
    },
    setBifurcationHorizonPreset: (name) => {
      if (name === 'custom') {
        applyPartial(ctx, { preset: 'custom' })
        return
      }
      const preset = BIFURCATION_HORIZON_PRESETS[name]
      if (!preset) return
      applyPartial(ctx, { ...preset, preset: name })
    },
  }
}
