/**
 * Zeta / Prime group scenario plumbing for the unified ScenarioSelector.
 *
 * The Types tab collapses the fourteen ζ-related modes into one "Zeta / Prime"
 * entry. The Scenario dropdown for that type is therefore a single, **stable**
 * menu listing *every* scenario preset of *every* member mode — it does not
 * change when the geometry-tab sub-mode toggle moves. Picking a scenario both
 * switches to the owning sub-type and applies that preset (see the selector's
 * handleChange). Option values are encoded `memberKey::presetId`; disabled
 * `__hdr:` rows are per-mode section headers.
 *
 * @module components/sections/Geometry/ScenarioSelector.zetaGroup
 */

import type { SelectOption } from '@/components/ui/Select'
import { BIFURCATION_HORIZON_SCENARIOS } from '@/lib/geometry/extended/bifurcationHorizon'
import { HILBERT_POLYA_SCENARIOS } from '@/lib/geometry/extended/hilbertPolya'
import { MODULAR_KNOT_SCENARIOS } from '@/lib/geometry/extended/modularKnot'
import { RIEMANN_ZETA_SCENARIOS } from '@/lib/geometry/extended/riemannZeta'
import { isWdwZetaMode } from '@/lib/geometry/extended/wdwZeta/shared'
import { wdwZetaPresetOptions } from '@/lib/geometry/extended/wdwZeta/uiRegistry'
import { getQuantumTypeName, type QuantumTypeGroup } from '@/lib/geometry/registry'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'

const HEADER_PREFIX = '__hdr:'
const SEP = '::'

/** `{value,label}` scenario options for a single group member, any mode family. */
function memberScenarioOptions(memberKey: QuantumTypeKey): { value: string; label: string }[] {
  if (isWdwZetaMode(memberKey)) return wdwZetaPresetOptions(memberKey)
  switch (memberKey) {
    case 'riemannZeta':
      return RIEMANN_ZETA_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))
    case 'hilbertPolya':
      return HILBERT_POLYA_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))
    case 'bifurcationHorizon':
      return BIFURCATION_HORIZON_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))
    case 'modularKnot':
      return MODULAR_KNOT_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))
    default:
      return []
  }
}

/**
 * The full, stable scenario list for a collapsed group: every member's presets
 * under a disabled per-mode header. Independent of which sub-type is active.
 *
 * @param group - The collapsed quantum-type group.
 * @returns Flat `SelectOption[]` (headers + `memberKey::presetId` rows).
 */
export function zetaGroupScenarioOptions(group: QuantumTypeGroup): SelectOption[] {
  const out: SelectOption[] = []
  for (const m of group.members) {
    const presets = memberScenarioOptions(m)
    if (presets.length === 0) continue
    out.push({
      value: `${HEADER_PREFIX}${m}`,
      label: `— ${getQuantumTypeName(m)} —`,
      disabled: true,
    })
    for (const p of presets) out.push({ value: `${m}${SEP}${p.value}`, label: p.label })
  }
  return out
}

/** Encode the active (sub-mode, preset) pair as a group option value. */
export function zetaGroupActiveValue(mode: string, perModeActiveValue: string): string {
  return perModeActiveValue ? `${mode}${SEP}${perModeActiveValue}` : ''
}

/** A parsed group selection: which sub-mode + which preset id. */
export interface ZetaGroupSelection {
  memberKey: QuantumTypeKey
  presetId: string
}

/** Parse a `memberKey::presetId` option value (null for headers / malformed). */
export function parseZetaGroupValue(value: string): ZetaGroupSelection | null {
  if (value.startsWith(HEADER_PREFIX)) return null
  const i = value.indexOf(SEP)
  if (i < 0) return null
  return { memberKey: value.slice(0, i) as QuantumTypeKey, presetId: value.slice(i + SEP.length) }
}
