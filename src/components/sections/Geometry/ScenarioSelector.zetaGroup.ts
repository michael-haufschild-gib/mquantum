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
import { getWdwZetaUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import { isWdwZetaMode } from '@/lib/geometry/extended/wdwZeta/shared'
import { getQuantumTypeName, type QuantumTypeGroup } from '@/lib/geometry/registry'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'

const HEADER_PREFIX = '__hdr:'
const SEP = '::'

/** A scenario carries an optional target dimension; default 3 (a 3D scenario). */
interface DimScenario {
  id: string
  label: string
  dimension?: number
}

/**
 * Keep only the scenarios that make sense at the current spatial dimension. A
 * mode that defines any 4D scenario (`dimension ≥ 4`) is dimension-split: at
 * dim ≥ 4 only its 4D scenarios show, at dim 3 only its 3D ones. A mode with no
 * 4D scenarios (riemannZeta, bifurcationHorizon — N-D via the Tangherlini
 * exponent) is dimension-agnostic and shows all of its scenarios at every dim.
 */
function filterByDim<T extends DimScenario>(scenarios: readonly T[], dim: number): T[] {
  const has4D = scenarios.some((s) => (s.dimension ?? 3) >= 4)
  if (!has4D) return [...scenarios]
  const want4D = dim >= 4
  return scenarios.filter((s) => (s.dimension ?? 3) >= 4 === want4D)
}

/** `{value,label}` scenario options for a single group member, filtered by dimension. */
function memberScenarioOptions(
  memberKey: QuantumTypeKey,
  dim: number
): { value: string; label: string }[] {
  const toOpt = (s: DimScenario): { value: string; label: string } => ({
    value: s.id,
    label: s.label,
  })
  if (isWdwZetaMode(memberKey)) {
    const ui = getWdwZetaUi(memberKey)
    return ui ? filterByDim(ui.scenarios as readonly DimScenario[], dim).map(toOpt) : []
  }
  switch (memberKey) {
    case 'riemannZeta':
      return filterByDim(RIEMANN_ZETA_SCENARIOS, dim).map(toOpt)
    case 'hilbertPolya':
      return filterByDim(HILBERT_POLYA_SCENARIOS, dim).map(toOpt)
    case 'bifurcationHorizon':
      return filterByDim(BIFURCATION_HORIZON_SCENARIOS, dim).map(toOpt)
    case 'modularKnot':
      return filterByDim(MODULAR_KNOT_SCENARIOS, dim).map(toOpt)
    default:
      return []
  }
}

/**
 * The full, stable scenario list for a collapsed group: every member's presets
 * (dimension-filtered) under a disabled per-mode header.
 *
 * @param group - The collapsed quantum-type group.
 * @param dim - Current spatial dimension (3 or 4), used to filter scenarios.
 * @returns Flat `SelectOption[]` (headers + `memberKey::presetId` rows).
 */
export function zetaGroupScenarioOptions(group: QuantumTypeGroup, dim: number): SelectOption[] {
  const out: SelectOption[] = []
  for (const m of group.members) {
    const presets = memberScenarioOptions(m, dim)
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
