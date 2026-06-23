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

import { getWdwZetaUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'

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
    },
  }
}
