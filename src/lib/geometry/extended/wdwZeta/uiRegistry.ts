/**
 * Scenario-dropdown helpers for the WDW ⊗ ζ suite, sourced from the unified
 * `WDW_ZETA_UI` config registry so every mode's scenarios flow into the shared
 * ScenarioSelector with no per-mode wiring.
 *
 * @module lib/geometry/extended/wdwZeta/uiRegistry
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'

import { getWdwZetaUi } from './configRegistry'
import type { WdwZetaModeKey } from './shared'

/** Map a suite mode's scenarios to `{ value, label }` dropdown options. */
export function wdwZetaPresetOptions(mode: WdwZetaModeKey): { value: string; label: string }[] {
  return (getWdwZetaUi(mode)?.scenarios ?? []).map((s) => ({ value: s.id, label: s.label }))
}

/** The active (non-`custom`) preset id for a suite mode, or `''`. */
export function wdwZetaActivePreset(
  schroedinger: Partial<SchroedingerConfig>,
  mode: WdwZetaModeKey
): string {
  const sub = (schroedinger as unknown as Record<string, { preset?: string }>)[mode]
  const preset = sub?.preset
  return preset === undefined || preset === 'custom' ? '' : preset
}

/** The description of a suite mode's active preset, or `null`. */
export function wdwZetaActiveDescription(
  schroedinger: Partial<SchroedingerConfig>,
  mode: WdwZetaModeKey
): string | null {
  const active = wdwZetaActivePreset(schroedinger, mode)
  if (!active) return null
  const found = getWdwZetaUi(mode)?.scenarios.find((s) => s.id === active)
  return found?.description ?? null
}
