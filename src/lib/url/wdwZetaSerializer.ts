/**
 * WDW ⊗ ζ suite URL serializer / deserializer — generic & registry-driven.
 *
 * One module serializes every suite mode by looping its `WDW_ZETA_UI` field
 * schema: each field owns a disjoint short URL key (`f.url`); the per-mode preset
 * uses `<prefix>_p`. Params are emitted only while the owning mode is active
 * (caller-gated) and parsed unconditionally for forward compatibility into a
 * nested `wdwZeta` / `wdwZetaPreset` structure the apply step consumes.
 *
 * @module lib/url/wdwZetaSerializer
 */

import { WDW_ZETA_UI, type WdwZetaModeUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import {
  isWdwZetaMode,
  WDW_ZETA_MODES,
  type WdwZetaModeKey,
} from '@/lib/geometry/extended/wdwZeta/shared'

import { parseBoolParam, parseFloatParam, setBoolParam, setFloatParam } from './paramHelpers'

/** Shareable WDW ⊗ ζ suite fields (nested by mode) folded into the parent state. */
export interface WdwZetaUrlState {
  quantumMode?: string
  /** Parsed field values by mode → field → value. */
  wdwZeta?: Record<string, Record<string, number | boolean>>
  /** Parsed non-`custom` preset id by mode. */
  wdwZetaPreset?: Record<string, string>
}

/** Per-mode URL prefix (the first field's url prefix, e.g. `cs` → preset key `cs_p`). */
function presetKey(mode: WdwZetaModeKey): string {
  const first = WDW_ZETA_UI[mode]?.fields[0]?.url ?? mode
  return `${first.split('_')[0]}_p`
}

/**
 * Emit the active suite mode's params. Callers gate on the mode being active;
 * a non-`custom` preset is emitted as `<prefix>_p`, otherwise the field values
 * are emitted under their per-field keys (3-decimal floats).
 *
 * @param params - Target search params.
 * @param state - Shareable state carrying the suite values.
 */
export function serializeWdwZeta(params: URLSearchParams, state: WdwZetaUrlState): void {
  const mode = state.quantumMode
  if (!isWdwZetaMode(mode)) return
  const ui = WDW_ZETA_UI[mode]
  if (!ui) return
  const preset = state.wdwZetaPreset?.[mode]
  if (preset !== undefined && preset !== 'custom') {
    params.set(presetKey(mode), preset)
    return
  }
  const fields = state.wdwZeta?.[mode]
  if (!fields) return
  for (const f of ui.fields) {
    const v = fields[f.key]
    if (v === undefined) continue
    if (typeof v === 'boolean') setBoolParam(params, f.url, v)
    else setFloatParam(params, f.url, v, false, 3)
  }
}

/**
 * Parse the suite params (all modes, forward-compatible) into the nested
 * structure. Out-of-range numbers are clamped to the mode ranges; the store's
 * setters re-enforce on apply.
 *
 * @param params - Source search params.
 * @param state - Shareable state to populate.
 */
export function deserializeWdwZeta(params: URLSearchParams, state: WdwZetaUrlState): void {
  for (const mode of WDW_ZETA_MODES) {
    const ui = WDW_ZETA_UI[mode]
    if (ui) deserializeMode(params, state, mode, ui)
  }
}

/** Parse one suite mode's preset + field params into `state`. */
function deserializeMode(
  params: URLSearchParams,
  state: WdwZetaUrlState,
  mode: WdwZetaModeKey,
  ui: WdwZetaModeUi
): void {
  const presetRaw = params.get(presetKey(mode))
  if (presetRaw && Object.prototype.hasOwnProperty.call(ui.presets, presetRaw)) {
    ;(state.wdwZetaPreset ??= {})[mode] = presetRaw
  }
  for (const f of ui.fields) {
    const value =
      f.kind === 'switch'
        ? parseBoolParam(params, f.url)
        : parseFloatParam(
            params,
            f.url,
            ui.ranges[f.key]?.min ?? -1e6,
            ui.ranges[f.key]?.max ?? 1e6
          )
    if (value !== undefined) ((state.wdwZeta ??= {})[mode] ??= {})[f.key] = value
  }
}
