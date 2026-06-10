/**
 * Coherence Horizon setter factory.
 *
 * Mirrors the AdS setter pattern minus `needsReset`: the mode is fully
 * analytic (no compute pass to re-pack), so each setter only writes its field
 * through `setWithVersion` — the version bump re-packs the uniform buffer and
 * the strategy recomputes the bounding radius from the new physics.
 *
 * Every physics-affecting mutation marks `preset: 'custom'` so the scenario
 * dropdown reflects user edits.
 *
 * @module stores/slices/geometry/setters/coherenceHorizonSetters
 */

import type {
  CoherenceHorizonConfig,
  CoherenceHorizonPresetName,
} from '@/lib/geometry/extended/coherenceHorizon'
import {
  COHERENCE_HORIZON_PRESETS,
  COHERENCE_HORIZON_RANGES,
} from '@/lib/geometry/extended/coherenceHorizon'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the Coherence Horizon setter bundle. */
export interface CoherenceHorizonSetters {
  setCoherenceHorizonDecoherence: (delta: number) => void
  setCoherenceHorizonSeparation: (s: number) => void
  setCoherenceHorizonWidth: (w: number) => void
  setCoherenceHorizonWaveNumber: (k: number) => void
  setCoherenceHorizonScale: (scale: number) => void
  setCoherenceHorizonRingGain: (gain: number) => void
  setCoherenceHorizonGlow: (glow: number) => void
  setCoherenceHorizonPreset: (name: CoherenceHorizonPresetName) => void
}

/** Apply a partial mutation to `schroedinger.coherenceHorizon`. */
function applyPartial(ctx: SetterContext, partial: Partial<CoherenceHorizonConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      coherenceHorizon: {
        ...state.schroedinger.coherenceHorizon,
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

/** Build one clamped numeric setter for a CoherenceHorizonConfig scalar. */
function numericSetter(
  ctx: SetterContext,
  field: keyof typeof COHERENCE_HORIZON_RANGES
): (value: number) => void {
  const { min, max } = COHERENCE_HORIZON_RANGES[field]
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`coherenceHorizon.${field}`, value)
      return
    }
    applyPartial(ctx, { [field]: clamp(value, min, max), preset: 'custom' })
  }
}

/**
 * Build the full Coherence Horizon setter bundle.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createCoherenceHorizonSetters(ctx: SetterContext): CoherenceHorizonSetters {
  return {
    setCoherenceHorizonDecoherence: numericSetter(ctx, 'decoherence'),
    setCoherenceHorizonSeparation: numericSetter(ctx, 'separation'),
    setCoherenceHorizonWidth: numericSetter(ctx, 'width'),
    setCoherenceHorizonWaveNumber: numericSetter(ctx, 'waveNumber'),
    setCoherenceHorizonScale: numericSetter(ctx, 'horizonScale'),
    setCoherenceHorizonRingGain: numericSetter(ctx, 'ringGain'),
    setCoherenceHorizonGlow: numericSetter(ctx, 'glow'),
    setCoherenceHorizonPreset: (name) => {
      if (name === 'custom') {
        applyPartial(ctx, { preset: 'custom' })
        return
      }
      const preset = COHERENCE_HORIZON_PRESETS[name]
      if (!preset) return
      applyPartial(ctx, { ...preset, preset: name })
    },
  }
}
