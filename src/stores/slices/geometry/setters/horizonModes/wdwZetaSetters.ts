/**
 * Generic setter factory for the WDW ⊗ ζ visualization suite.
 *
 * Two data-driven actions cover all ten modes (no per-field setters): every
 * field write and preset apply is resolved through the `WDW_ZETA_UI` config
 * registry (ranges, integer flags, presets). Like the other analytic horizon
 * modes, writes go through `setWithVersion` so the uniform buffer re-packs and
 * `WdwZetaVolumeStrategy` re-bakes the 3D volume; every edit marks
 * `preset: 'custom'`.
 *
 * @module stores/slices/geometry/setters/horizonModes/wdwZetaSetters
 */

import { getWdwZetaUi, type WdwZetaModeUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useRotationStore } from '@/stores/scene/rotationStore'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the WDW ⊗ ζ suite setter bundle. */
export interface WdwZetaSetters {
  /** Set one config field for a suite mode (clamped/rounded per the registry). */
  setWdwZetaField: (mode: WdwZetaModeKey, field: string, value: number | boolean) => void
  /** Apply a named preset (or `'custom'`) for a suite mode. */
  setWdwZetaPreset: (mode: WdwZetaModeKey, name: string) => void
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/**
 * Apply a suite scenario's dimension guard: snap the global dimension to the
 * scenario's target (3D scenarios → 3D, the 4D scenario → 4D, clamped to the
 * mode's registry bounds) and apply any authored initial N-D rotation so a 4D
 * scenario tilts the visible slice into the 4th axis at rest. Dimension is set
 * first because `rotationStore.setDimension` resets all rotation angles, so the
 * scenario rotation must be applied afterward.
 *
 * @param ui - The mode's UI descriptor (carries the scenario list).
 * @param name - The selected scenario id.
 */
function applyScenarioDimensionGuard(ui: WdwZetaModeUi, name: string): void {
  const scenario = ui.scenarios.find((s) => s.id === name)
  if (!scenario) return
  useGeometryStore.getState().setDimension(scenario.dimension ?? 3)
  if (scenario.rotation) {
    const setRotation = useRotationStore.getState().setRotation
    for (const [plane, angle] of Object.entries(scenario.rotation)) setRotation(plane, angle)
  }
}

/**
 * Build the WDW ⊗ ζ suite setter bundle.
 *
 * @param ctx - Shared Zustand setter context.
 * @returns Map of action name → setter.
 */
export function createWdwZetaSetters(ctx: SetterContext): WdwZetaSetters {
  /** Merge a partial into `schroedinger[mode]` with a version bump. */
  const writePartial = (mode: WdwZetaModeKey, partial: Record<string, unknown>): void => {
    ctx.setWithVersion((state) => {
      const prev = (state.schroedinger as unknown as Record<string, unknown>)[mode] as Record<
        string,
        unknown
      >
      return {
        schroedinger: {
          ...state.schroedinger,
          [mode]: { ...prev, ...partial },
        },
      }
    })
  }

  return {
    setWdwZetaField: (mode, field, value) => {
      const ui = getWdwZetaUi(mode)
      if (!ui) return
      let v: number | boolean = value
      if (typeof v === 'number') {
        if (!ctx.isFinite(v)) {
          ctx.warnNonFinite(`${mode}.${field}`, v)
          return
        }
        const fd = ui.fields.find((f) => f.key === field)
        if (fd?.integer) v = Math.round(v)
        const r = ui.ranges[field]
        if (r) v = clamp(v, r.min, r.max)
      }
      writePartial(mode, { [field]: v, preset: 'custom' })
    },
    setWdwZetaPreset: (mode, name) => {
      const ui = getWdwZetaUi(mode)
      if (!ui) return
      if (name === 'custom') {
        writePartial(mode, { preset: 'custom' })
        return
      }
      const preset = ui.presets[name]
      if (!preset) return
      writePartial(mode, { ...preset, preset: name })
      applyScenarioDimensionGuard(ui, name)
    },
  }
}
