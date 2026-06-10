/**
 * Riemann Zeta (Arithmetic Horizon) setter factory.
 *
 * Mirrors the Coherence Horizon setter pattern: the mode is fully analytic
 * (no compute pass to re-pack), so each setter only writes its field through
 * `setWithVersion` — the version bump re-packs the uniform buffer and the
 * strategy regenerates + re-uploads the radial LUT when a LUT-shaping field
 * (source / numZeros / β) changes.
 *
 * Every physics-affecting mutation marks `preset: 'custom'` so the scenario
 * dropdown reflects user edits.
 *
 * @module stores/slices/geometry/setters/riemannZetaSetters
 */

import type {
  RiemannZetaConfig,
  RiemannZetaPresetName,
  RiemannZetaSource,
} from '@/lib/geometry/extended/riemannZeta'
import { RIEMANN_ZETA_PRESETS, RIEMANN_ZETA_RANGES } from '@/lib/geometry/extended/riemannZeta'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the Riemann Zeta setter bundle. */
export interface RiemannZetaSetters {
  setRiemannZetaSource: (source: RiemannZetaSource) => void
  setRiemannZetaNumZeros: (n: number) => void
  setRiemannZetaBeta: (beta: number) => void
  setRiemannZetaHorizonRadius: (r: number) => void
  setRiemannZetaAngularL: (l: number) => void
  setRiemannZetaAngularM: (m: number) => void
  setRiemannZetaFlowRate: (rate: number) => void
  setRiemannZetaGlow: (glow: number) => void
  setRiemannZetaCutaway: (enabled: boolean) => void
  setRiemannZetaPreset: (name: RiemannZetaPresetName) => void
}

/** Apply a partial mutation to `schroedinger.riemannZeta`. */
function applyPartial(ctx: SetterContext, partial: Partial<RiemannZetaConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      riemannZeta: {
        ...state.schroedinger.riemannZeta,
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

/** Build one clamped numeric setter for a RiemannZetaConfig scalar. */
function numericSetter(
  ctx: SetterContext,
  field: keyof typeof RIEMANN_ZETA_RANGES,
  options?: { integer?: boolean }
): (value: number) => void {
  const { min, max } = RIEMANN_ZETA_RANGES[field]
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`riemannZeta.${field}`, value)
      return
    }
    const v = options?.integer ? Math.round(value) : value
    applyPartial(ctx, { [field]: clamp(v, min, max), preset: 'custom' })
  }
}

/**
 * Build the full Riemann Zeta setter bundle.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createRiemannZetaSetters(ctx: SetterContext): RiemannZetaSetters {
  return {
    setRiemannZetaSource: (source) => {
      if (source !== 'zeros' && source !== 'primes') return
      applyPartial(ctx, { source, preset: 'custom' })
    },
    setRiemannZetaNumZeros: numericSetter(ctx, 'numZeros', { integer: true }),
    setRiemannZetaBeta: numericSetter(ctx, 'beta'),
    setRiemannZetaHorizonRadius: numericSetter(ctx, 'horizonRadius'),
    setRiemannZetaAngularL: numericSetter(ctx, 'angularL', { integer: true }),
    setRiemannZetaAngularM: numericSetter(ctx, 'angularM', { integer: true }),
    setRiemannZetaFlowRate: numericSetter(ctx, 'flowRate'),
    setRiemannZetaGlow: numericSetter(ctx, 'glow'),
    setRiemannZetaCutaway: (enabled) => {
      applyPartial(ctx, { cutaway: enabled, preset: 'custom' })
    },
    setRiemannZetaPreset: (name) => {
      if (name === 'custom') {
        applyPartial(ctx, { preset: 'custom' })
        return
      }
      const preset = RIEMANN_ZETA_PRESETS[name]
      if (!preset) return
      applyPartial(ctx, { ...preset, preset: name })
    },
  }
}
