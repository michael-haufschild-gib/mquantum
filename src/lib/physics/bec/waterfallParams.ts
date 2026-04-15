/**
 * Shared waterfall-parameter builder and pure BEC-background helpers.
 *
 * Lives at `@/lib/physics/bec` so CPU-side analysis (HUD readouts, unit
 * tests) and the TDSE/BEC renderer strategy can consume the same values
 * without the lib layer reaching up into the rendering layer.
 *
 * @module lib/physics/bec/waterfallParams
 */

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'

import type { WaterfallParams } from './sonicHorizon'

/**
 * Background condensate density `n₀` used by the waterfall
 * (`blackHoleAnalog`) initial condition. Mirrors the `μ` override inside
 * `buildBecConfig`:
 *
 *   μ_wf  = max(g · 0.01, 1.0)
 *   n₀    = μ_wf / g   (for g > 0)
 *
 * Single source of truth consumed by
 *   - the CPU HUD readout (analytic κ, T_H),
 *   - the page-curve integrator,
 *   - the BEC config mapper that seeds the GPU init shader.
 *
 * Keeping the function at the `lib/physics` layer guarantees none of these
 * callers has to climb to the rendering layer to reach a pure physics
 * helper — a layering violation that masked real drift in earlier PRs.
 *
 * @param config - minimal shape carrying `interactionStrength` (g).
 * @returns background density n₀; returns 1.0 for non-positive g as a safe fallback.
 */
export function computeWaterfallBackgroundDensity(config: { interactionStrength: number }): number {
  const g = config.interactionStrength
  // Require a finite, strictly-positive g. `g = Infinity` would otherwise
  // propagate NaN through `max(Inf*0.01, 1) / Inf`; `g = NaN` already fails
  // `g > 0`. Both cases collapse to the safe 1.0 fallback.
  if (!Number.isFinite(g) || !(g > 0)) return 1.0
  const muWaterfall = Math.max(g * 0.01, 1.0)
  return muWaterfall / g
}

/**
 * Resolve the effective particle mass used by the BEC simulator.
 *
 * Single canonical source of truth for `mass` in the BEC pipeline. Mirrors
 * the fallback used inside `buildBecConfig` so CPU-side analysis (HUD
 * readout, analytic κ / T_H, trap-profile plot) can compute the same value
 * the GPU simulator uses — preventing silent divergence if the pipeline
 * ever nulls `bec.mass` upstream.
 *
 * @param config - minimal shape carrying an optional `mass` field.
 * @returns `config.mass` when finite and positive, otherwise the TDSE default.
 */
export function resolveBecMass(config: { mass?: number | null }): number {
  const m = config.mass
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m
  return DEFAULT_TDSE_CONFIG.mass
}

/** Minimal shape needed to derive `WaterfallParams`. */
export interface WaterfallParamInputs {
  hawkingVmax?: number
  hawkingLh?: number
  hawkingDeltaN?: number
  interactionStrength?: number
  mass?: number
  gridSize: readonly number[]
  spacing: readonly number[]
}

/**
 * Build the canonical waterfall struct from the current BEC config. Applies
 * the same defaults everywhere — the shader and the HUD see identical
 * numeric values even if a caller leaves optional fields undefined.
 */
export function buildWaterfallParams(input: WaterfallParamInputs): WaterfallParams {
  const g = input.interactionStrength ?? 500
  return {
    vMax: input.hawkingVmax ?? 2.0,
    lh: input.hawkingLh ?? 0.6,
    n0: computeWaterfallBackgroundDensity({ interactionStrength: g }),
    deltaN: input.hawkingDeltaN ?? 0,
    g,
    mass: input.mass ?? 1.0,
    lBox: (input.gridSize[0] ?? 64) * (input.spacing[0] ?? 0.15),
  }
}
