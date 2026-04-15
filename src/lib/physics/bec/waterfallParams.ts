/**
 * Shared waterfall-parameter builder used by both the Page-curve HUD panel
 * and the TDSE/BEC renderer strategy. Centralising this prevents the HUD
 * readout and the GPU island overlay from drifting when we tweak one
 * parameter default but forget the other.
 *
 * @module lib/physics/bec/waterfallParams
 */

import { computeWaterfallBackgroundDensity } from '@/rendering/webgpu/renderers/strategies/TdseBecConfigBuilder'

import type { WaterfallParams } from './sonicHorizon'

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
