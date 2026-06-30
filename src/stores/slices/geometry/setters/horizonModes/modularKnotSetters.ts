/**
 * Modular Knot setter factory.
 *
 * Mirrors the Bifurcation Horizon setter pattern: the mode is analytic and
 * baked on the CPU, so each setter writes its field through `setWithVersion` —
 * the version bump re-packs the uniform buffer and the `ModularKnotStrategy`
 * re-bakes the 3D RGBA volume when a bake-affecting field (`maxLen`,
 * `geodesicCount`, `tubeWidth`) changes; `glow` and `flow` are render-only
 * uniform knobs.
 *
 * Every physics-affecting mutation marks `preset: 'custom'` so the scenario
 * dropdown reflects user edits. The integer-valued fields (`maxLen`,
 * `geodesicCount`) are rounded before clamping.
 *
 * @module stores/slices/geometry/setters/horizonModes/modularKnotSetters
 */

import type { ModularKnotConfig, ModularKnotPresetName } from '@/lib/geometry/extended/modularKnot'
import {
  MODULAR_KNOT_PRESETS,
  MODULAR_KNOT_RANGES,
  MODULAR_KNOT_SCENARIOS,
} from '@/lib/geometry/extended/modularKnot'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useRotationStore } from '@/stores/scene/rotationStore'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the Modular Knot setter bundle. */
export interface ModularKnotSetters {
  setModularKnotGlow: (glow: number) => void
  setModularKnotFlow: (flow: number) => void
  setModularKnotMaxLen: (len: number) => void
  setModularKnotGeodesicCount: (n: number) => void
  setModularKnotTubeWidth: (w: number) => void
  setModularKnotPreset: (name: ModularKnotPresetName) => void
}

/** Integer-valued ModularKnotConfig scalars are rounded before clamping. */
const INTEGER_FIELDS: ReadonlySet<keyof typeof MODULAR_KNOT_RANGES> = new Set([
  'maxLen',
  'geodesicCount',
])

/** Apply a partial mutation to `schroedinger.modularKnot`. */
function applyPartial(ctx: SetterContext, partial: Partial<ModularKnotConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      modularKnot: {
        ...state.schroedinger.modularKnot,
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

/** Build one clamped (and, for integer fields, rounded) numeric setter. */
function numericSetter(
  ctx: SetterContext,
  field: keyof typeof MODULAR_KNOT_RANGES
): (value: number) => void {
  const { min, max } = MODULAR_KNOT_RANGES[field]
  const isInteger = INTEGER_FIELDS.has(field)
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`modularKnot.${field}`, value)
      return
    }
    const prepared = isInteger ? Math.round(value) : value
    applyPartial(ctx, { [field]: clamp(prepared, min, max), preset: 'custom' })
  }
}

/**
 * Build the full Modular Knot setter bundle.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createModularKnotSetters(ctx: SetterContext): ModularKnotSetters {
  return {
    setModularKnotGlow: numericSetter(ctx, 'glow'),
    setModularKnotFlow: numericSetter(ctx, 'flow'),
    setModularKnotMaxLen: numericSetter(ctx, 'maxLen'),
    setModularKnotGeodesicCount: numericSetter(ctx, 'geodesicCount'),
    setModularKnotTubeWidth: numericSetter(ctx, 'tubeWidth'),
    setModularKnotPreset: (name) => {
      if (name === 'custom') {
        applyPartial(ctx, { preset: 'custom' })
        return
      }
      const preset = MODULAR_KNOT_PRESETS[name]
      if (!preset) return
      applyPartial(ctx, { ...preset, preset: name })
      // Dimension guard: snap to the scenario's target dimension and apply its
      // initial W-tilt (dimension first — rotationStore.setDimension resets angles).
      const scenario = MODULAR_KNOT_SCENARIOS.find((s) => s.id === name)
      if (scenario) {
        useGeometryStore.getState().setDimension(scenario.dimension ?? 3)
        if (scenario.rotation) {
          const setRotation = useRotationStore.getState().setRotation
          for (const [plane, angle] of Object.entries(scenario.rotation)) setRotation(plane, angle)
        }
      }
    },
  }
}
