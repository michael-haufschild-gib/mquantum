/**
 * ZetaModeSelector — sub-mode toggle row for the collapsed Zeta / Prime family.
 *
 * The Types tab shows a single "Zeta / Prime" card for the fourteen ζ-related
 * analytic modes (Arithmetic Horizon, Hilbert–Pólya, Bifurcation Horizon,
 * Modular Knot, and the ten WDW ⊗ ζ suite modes). This selector — rendered at
 * the top of the Schrödinger geometry controls whenever one of those modes is
 * active — lets the user pick the specific variant, mirroring how Quantum Walk
 * exposes its coin types as a toggle row.
 *
 * Switching routes through `setSchroedingerQuantumMode`, which already handles
 * dimension constraints, representation overrides, per-mode rendering settings,
 * and first-preset application — so no extra orchestration is needed here.
 *
 * @module components/sections/Geometry/SchroedingerControls/ZetaModeSelector
 */

import React, { useCallback } from 'react'

import { ToggleButton } from '@/components/ui/ToggleButton'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import {
  getQuantumTypeEntry,
  getQuantumTypeGroupForKey,
  getQuantumTypeName,
} from '@/lib/geometry/registry'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/** One toggle for a single sub-mode within the family. */
const SubModeToggle = React.memo(function SubModeToggle({
  memberKey,
  active,
  onSelect,
}: {
  memberKey: QuantumTypeKey
  active: boolean
  onSelect: (key: QuantumTypeKey) => void
}): React.ReactElement {
  const handleToggle = useCallback(
    (next: boolean) => {
      // Radio-like: only act on turning ON; a mode cannot be "deselected".
      if (next) onSelect(memberKey)
    },
    [memberKey, onSelect]
  )
  const name = getQuantumTypeName(memberKey)
  return (
    <ToggleButton
      pressed={active}
      onToggle={handleToggle}
      ariaLabel={name}
      tooltip={getQuantumTypeEntry(memberKey)?.description}
      data-testid={`zeta-mode-${memberKey}`}
    >
      {name}
    </ToggleButton>
  )
})

/**
 * Render the Zeta / Prime sub-mode selector for the active grouped mode.
 *
 * @returns The sectioned toggle rows, or null when the active mode is not a
 *   member of a collapsed family.
 */
export function ZetaModeSelector(): React.ReactElement | null {
  const mode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  const setMode = useExtendedObjectStore((s) => s.setSchroedingerQuantumMode)

  const onSelect = useCallback(
    (key: QuantumTypeKey) => setMode(key as SchroedingerQuantumMode),
    [setMode]
  )

  const group = getQuantumTypeGroupForKey(mode)
  if (!group) return null

  return (
    <div className="flex flex-col gap-3" data-testid="zeta-mode-selector">
      {group.sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">
            {section.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {section.members.map((key) => (
              <SubModeToggle key={key} memberKey={key} active={key === mode} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
