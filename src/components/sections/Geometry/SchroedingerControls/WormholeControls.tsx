/**
 * WormholeControls — ER=EPR Double-trace Coupling sub-section.
 *
 * Nested inside {@link TDSEControls}. Renders the four knobs that drive
 * the mirror-plane coupling `Ĥ_int = g·P_M`:
 *
 *   - Switch  : Enable coupling (flips `wormholeCouplingEnabled`).
 *   - Slider  : Coupling strength `g ∈ [0, 5]`.
 *   - Select  : Mirror axis (0 | 1 | 2).
 *   - Switch  : Show coherence HUD panel (purely visual toggle).
 *
 * @module components/sections/Geometry/SchroedingerControls/WormholeControls
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { normalizeMirrorAxisForLattice } from '@/lib/physics/tdse/wormholeCoupling'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const AXIS_OPTIONS = [
  { value: '0', label: 'Axis 0 (x)' },
  { value: '1', label: 'Axis 1 (y)' },
  { value: '2', label: 'Axis 2 (z)' },
]

/**
 * ER=EPR wormhole coupling sub-section for the TDSE control panel.
 *
 * @param props - Component props.
 * @param props.td - Current TDSE config (read for initial values).
 * @returns React element with the four wormhole knobs.
 */
export function WormholeControls({ td }: { td: TdseConfig }): React.ReactElement {
  const {
    setTdseWormholeEnabled,
    setTdseWormholeG,
    setTdseWormholeAxis,
    setTdseWormholeHudEnabled,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      setTdseWormholeEnabled: s.setTdseWormholeEnabled,
      setTdseWormholeG: s.setTdseWormholeG,
      setTdseWormholeAxis: s.setTdseWormholeAxis,
      setTdseWormholeHudEnabled: s.setTdseWormholeHudEnabled,
    }))
  )

  const axisValue = useMemo(
    () => String(normalizeMirrorAxisForLattice(td.wormholeMirrorAxis, td.latticeDim)),
    [td.latticeDim, td.wormholeMirrorAxis]
  )
  const axisOptions = useMemo(
    () =>
      AXIS_OPTIONS.slice(
        0,
        Math.max(1, Math.min(3, Number.isFinite(td.latticeDim) ? Math.floor(td.latticeDim) : 1))
      ),
    [td.latticeDim]
  )

  return (
    <ControlGroup
      title="ER=EPR Wormhole (mirror coupling)"
      collapsible
      defaultOpen={false}
      data-testid="control-group-tdse-wormhole"
    >
      <Switch
        label="Wormhole coupling"
        tooltip="Enable the double-trace mirror Hamiltonian Ĥ_int = g·P_M. It coherently swaps amplitude between each point and its reflection across the chosen axis — the boundary-side analog of traversable ER=EPR coupling between the two halves of the lattice."
        checked={td.wormholeCouplingEnabled ?? false}
        onCheckedChange={setTdseWormholeEnabled}
        data-testid="tdse-wormhole-enabled"
      />
      <Slider
        label="Coupling g"
        tooltip="Coupling strength. Population oscillates between L and R halves at frequency g (Rabi rate). g·dt · stepsPerFrame ≈ π/2 → complete teleportation per frame."
        min={0}
        max={5}
        step={0.01}
        value={td.wormholeCouplingG ?? 0}
        onChange={setTdseWormholeG}
        showValue
        data-testid="tdse-wormhole-g"
      />
      <Select
        label="Mirror axis"
        tooltip="Spatial axis across which the reflection operator P_M acts. The grid size along this axis must be even (power-of-two in practice)."
        options={axisOptions}
        value={axisValue}
        onChange={(v) => setTdseWormholeAxis((Number(v) as 0 | 1 | 2) ?? 0)}
        data-testid="tdse-wormhole-axis"
      />
      <Switch
        label="Show coherence HUD"
        tooltip="Overlay a real-time trace of I(L:R)(t) = |⟨ψ|P_M|ψ⟩|² / ‖ψ‖⁴ ∈ [0, 1]. Zero means ψ has no mirror overlap; unity means ψ is exactly mirror-symmetric."
        checked={td.wormholeCoherenceHudEnabled ?? false}
        onCheckedChange={setTdseWormholeHudEnabled}
        data-testid="tdse-wormhole-hud-enabled"
      />
    </ControlGroup>
  )
}
