/**
 * Wheeler–DeWitt (minisuperspace) controls.
 *
 * Exposes boundary-condition selection, inflaton mass, cosmological
 * constant, and WKB streamline toggles for the Wheeler–DeWitt quantum mode.
 *
 * @module components/sections/Geometry/SchroedingerControls/WheelerDeWittControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

const BOUNDARY_CONDITION_OPTIONS = [
  { value: 'noBoundary', label: 'Hartle–Hawking' },
  { value: 'tunneling', label: 'Vilenkin' },
  { value: 'deWitt', label: 'DeWitt' },
]

/**
 * Top-level Wheeler–DeWitt controls panel. Shown inside the Quantum State
 * section when `quantumMode === 'wheelerDeWitt'`.
 *
 * @returns Wheeler–DeWitt configuration UI
 */
export const WheelerDeWittControls: React.FC = React.memo(() => {
  const {
    wdw,
    setWdwBoundaryCondition,
    setWdwInflatonMass,
    setWdwCosmologicalConstant,
    setWdwStreamlinesEnabled,
    setWdwStreamlineDensity,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      wdw: s.schroedinger.wheelerDeWitt,
      setWdwBoundaryCondition: s.setWdwBoundaryCondition,
      setWdwInflatonMass: s.setWdwInflatonMass,
      setWdwCosmologicalConstant: s.setWdwCosmologicalConstant,
      setWdwStreamlinesEnabled: s.setWdwStreamlinesEnabled,
      setWdwStreamlineDensity: s.setWdwStreamlineDensity,
    }))
  )

  return (
    <div className="space-y-3" data-testid="wheeler-dewitt-controls">
      <ToggleGroup
        options={BOUNDARY_CONDITION_OPTIONS}
        value={wdw.boundaryCondition}
        // Cast is safe because BOUNDARY_CONDITION_OPTIONS is a static
        // tuple of the three valid `WdwBoundaryCondition` values — the
        // ToggleGroup can only emit one of those, even though the memo
        // wrapper erases the T generic at the type level.
        onChange={(v) => setWdwBoundaryCondition(v as WdwBoundaryCondition)}
        ariaLabel="Wheeler–DeWitt boundary condition"
        tooltip="Hartle–Hawking: real Euclidean no-boundary proposal. Vilenkin: complex outgoing tunneling wave. DeWitt: χ(0,·)=0 hard node."
        fullWidth
        data-testid="wdw-bc-selector"
      />
      <Slider
        label="Inflaton mass m"
        tooltip="Mass in V(φ) = ½m²(φ₁² + φ₂²) + Λ. Drives the slow-roll vs eternal-inflation character."
        min={0}
        max={2}
        step={0.01}
        value={wdw.inflatonMass}
        onChange={setWdwInflatonMass}
        showValue
        data-testid="wdw-mass-slider"
      />
      <Slider
        label="Cosmological constant Λ"
        tooltip="Added to V(φ). Positive Λ produces a de-Sitter-like Lorentzian region for small φ."
        min={-0.3}
        max={0.3}
        step={0.005}
        value={wdw.cosmologicalConstant}
        onChange={setWdwCosmologicalConstant}
        showValue
        data-testid="wdw-lambda-slider"
      />
      <Switch
        label="WKB streamlines"
        checked={wdw.streamlinesEnabled}
        onCheckedChange={setWdwStreamlinesEnabled}
        data-testid="wdw-streamlines-switch"
      />
      {wdw.streamlinesEnabled && (
        <Slider
          label="Streamline density"
          tooltip="Seeds per axis in the Lorentzian region (total seeds ≈ density²)."
          min={2}
          max={16}
          step={1}
          value={wdw.streamlineDensity}
          onChange={setWdwStreamlineDensity}
          showValue
          data-testid="wdw-streamline-density"
        />
      )}
    </div>
  )
})

WheelerDeWittControls.displayName = 'WheelerDeWittControls'
