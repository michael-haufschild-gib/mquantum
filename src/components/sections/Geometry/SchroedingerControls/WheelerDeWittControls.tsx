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
import {
  WDW_GRID_PRESETS,
  type WdwGridPreset,
} from '@/stores/slices/geometry/setters/wheelerDeWittSetters'

const BOUNDARY_CONDITION_OPTIONS = [
  { value: 'noBoundary', label: 'Hartle–Hawking' },
  { value: 'tunneling', label: 'Vilenkin' },
  { value: 'deWitt', label: 'DeWitt' },
]

const GRID_PRESET_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'publication', label: 'Publication' },
]

/** Resolve the current `(gridNa, gridNphi)` pair to a preset label. */
function gridPresetKey(gridNa: number, gridNphi: number): WdwGridPreset {
  for (const key of ['low', 'medium', 'high', 'publication'] as const) {
    const p = WDW_GRID_PRESETS[key]
    if (p.gridNa === gridNa && p.gridNphi === gridNphi) return key
  }
  return 'medium'
}

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
    setWdwInflatonMassAsymmetry,
    setWdwCosmologicalConstant,
    setWdwGridSize,
    setWdwStreamlinesEnabled,
    setWdwStreamlineDensity,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      wdw: s.schroedinger.wheelerDeWitt,
      setWdwBoundaryCondition: s.setWdwBoundaryCondition,
      setWdwInflatonMass: s.setWdwInflatonMass,
      setWdwInflatonMassAsymmetry: s.setWdwInflatonMassAsymmetry,
      setWdwCosmologicalConstant: s.setWdwCosmologicalConstant,
      setWdwGridSize: s.setWdwGridSize,
      setWdwStreamlinesEnabled: s.setWdwStreamlinesEnabled,
      setWdwStreamlineDensity: s.setWdwStreamlineDensity,
    }))
  )

  const activePreset = gridPresetKey(wdw.gridNa, wdw.gridNphi)

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
        tooltip="Mass in V(φ) = ½m²φ₁² + ½(m·α)²φ₂² + Λ. Drives the slow-roll vs eternal-inflation character."
        min={0}
        max={2}
        step={0.01}
        value={wdw.inflatonMass}
        onChange={setWdwInflatonMass}
        showValue
        data-testid="wdw-mass-slider"
      />
      <Slider
        label="Mass asymmetry α"
        tooltip="Effective-mass ratio on the φ₂ axis (m_eff = m·α). α = 1 is isotropic. α ≠ 1 breaks the φ₁↔φ₂ exchange symmetry so the SRMT diagnostic can distinguish the three clocks {a, φ₁, φ₂}."
        min={0.1}
        max={10}
        step={0.01}
        value={wdw.inflatonMassAsymmetry}
        onChange={setWdwInflatonMassAsymmetry}
        showValue
        data-testid="wdw-asymmetry-slider"
      />
      <ToggleGroup
        options={GRID_PRESET_OPTIONS}
        value={activePreset}
        onChange={(v) => setWdwGridSize(v as WdwGridPreset)}
        ariaLabel="Wheeler–DeWitt grid size"
        tooltip={`Solver grid: Low ${WDW_GRID_PRESETS.low.gridNa}×${WDW_GRID_PRESETS.low.gridNphi}², Medium ${WDW_GRID_PRESETS.medium.gridNa}×${WDW_GRID_PRESETS.medium.gridNphi}² (default), High ${WDW_GRID_PRESETS.high.gridNa}×${WDW_GRID_PRESETS.high.gridNphi}², Publication ${WDW_GRID_PRESETS.publication.gridNa}×${WDW_GRID_PRESETS.publication.gridNphi}². Higher = finer classical-regime fringes, slower solve.`}
        fullWidth
        data-testid="wdw-grid-size"
      />
      <Slider
        label="Cosmological constant Λ"
        tooltip="Added to V(φ). Positive Λ produces a de-Sitter-like Lorentzian region for small φ; strongly negative Λ yields AdS-like unbounded oscillation. Range matches the setter's physical clamp so the curated presets (Λ = 0.8 deSitter, Λ = −0.5 antiDeSitter) land inside the visible slider track."
        min={-1}
        max={1}
        step={0.01}
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
