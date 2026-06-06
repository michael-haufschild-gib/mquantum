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
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import {
  WDW_GRID_PRESETS,
  WDW_GRID_PRESETS_4D,
  type WdwGridPreset,
  type WdwGridPreset4D,
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
const GRID_PRESET_OPTIONS_4D = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** Resolve the current `(gridNa, gridNphi)` pair to a preset label. */
function gridPresetKey(
  dimension: 3 | 4,
  gridNa: number,
  gridNphi: number
): WdwGridPreset {
  if (dimension === 4) {
    for (const key of ['low', 'medium', 'high'] as const) {
      const p = WDW_GRID_PRESETS_4D[key]
      if (p.gridNa === gridNa && p.gridNphi === gridNphi) return key
    }
    return 'low'
  }
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
  const geometryDimension = useGeometryStore((s) => s.dimension)
  const {
    wdw,
    setWdwPhi3SliceNormalized,
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
      setWdwPhi3SliceNormalized: s.setWdwPhi3SliceNormalized,
      setWdwBoundaryCondition: s.setWdwBoundaryCondition,
      setWdwInflatonMass: s.setWdwInflatonMass,
      setWdwInflatonMassAsymmetry: s.setWdwInflatonMassAsymmetry,
      setWdwCosmologicalConstant: s.setWdwCosmologicalConstant,
      setWdwGridSize: s.setWdwGridSize,
      setWdwStreamlinesEnabled: s.setWdwStreamlinesEnabled,
      setWdwStreamlineDensity: s.setWdwStreamlineDensity,
    }))
  )

  const minisuperspaceDimension = geometryDimension === 4 ? 4 : 3
  const is4d = minisuperspaceDimension === 4
  const activePreset = gridPresetKey(minisuperspaceDimension, wdw.gridNa, wdw.gridNphi)

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
        tooltip="Hartle–Hawking: real Euclidean no-boundary proposal. Vilenkin: complex outgoing tunneling wave. DeWitt: χ(0,·)=0 node with the solver's Gaussian derivative seed."
        fullWidth
        data-testid="wdw-bc-selector"
      />
      <Slider
        label="Inflaton mass m"
        tooltip="Mass in V(φ) = ½m²(φ₁² + φ₃²) + ½(m·α)²φ₂² + Λ. In 3D, φ₃ = 0."
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
        tooltip="Effective-mass ratio on the φ₂ axis (m_eff = m·α). φ₁ and φ₃ use the base mass m."
        min={0.1}
        max={10}
        step={0.01}
        value={wdw.inflatonMassAsymmetry}
        onChange={setWdwInflatonMassAsymmetry}
        showValue
        data-testid="wdw-asymmetry-slider"
      />
      <ToggleGroup
        options={is4d ? GRID_PRESET_OPTIONS_4D : GRID_PRESET_OPTIONS}
        value={activePreset}
        onChange={(v) => setWdwGridSize(v as WdwGridPreset | WdwGridPreset4D)}
        ariaLabel="Wheeler–DeWitt grid size"
        tooltip={
          is4d
            ? `Solver grid: Low ${WDW_GRID_PRESETS_4D.low.gridNa}×${WDW_GRID_PRESETS_4D.low.gridNphi}³, Medium ${WDW_GRID_PRESETS_4D.medium.gridNa}×${WDW_GRID_PRESETS_4D.medium.gridNphi}³, High ${WDW_GRID_PRESETS_4D.high.gridNa}×${WDW_GRID_PRESETS_4D.high.gridNphi}³. 4D uses conservative caps.`
            : `Solver grid: Low ${WDW_GRID_PRESETS.low.gridNa}×${WDW_GRID_PRESETS.low.gridNphi}², Medium ${WDW_GRID_PRESETS.medium.gridNa}×${WDW_GRID_PRESETS.medium.gridNphi}² (default), High ${WDW_GRID_PRESETS.high.gridNa}×${WDW_GRID_PRESETS.high.gridNphi}², Publication ${WDW_GRID_PRESETS.publication.gridNa}×${WDW_GRID_PRESETS.publication.gridNphi}². Higher = finer classical-regime fringes, slower solve.`
        }
        fullWidth
        data-testid="wdw-grid-size"
      />
      {is4d && (
        <Slider
          label="φ₃ slice"
          tooltip="Fixed normalized φ₃ slice rendered into the 3D density texture."
          min={0}
          max={1}
          step={0.01}
          value={wdw.phi3SliceNormalized}
          onChange={setWdwPhi3SliceNormalized}
          showValue
          data-testid="wdw-phi3-slice"
        />
      )}
      <Slider
        label="Cosmological constant Λ"
        tooltip="Added to V(φ). Positive Λ produces a de-Sitter-like Lorentzian region for small φ; strongly negative Λ yields AdS-like unbounded oscillation. Large positive Λ can push columns above the Airy/Langer extraction ceiling, so Euclidean boundary-condition differences may be visually muted."
        min={-1}
        max={1}
        step={0.01}
        value={wdw.cosmologicalConstant}
        onChange={setWdwCosmologicalConstant}
        showValue
        data-testid="wdw-lambda-slider"
      />
      {!is4d && (
        <>
          <Switch
            label="WKB streamlines"
            checked={wdw.streamlinesEnabled}
            onCheckedChange={setWdwStreamlinesEnabled}
            tooltip="Overlay WKB-classical streamlines on the Wheeler-DeWitt PDE"
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
        </>
      )}
    </div>
  )
})

WheelerDeWittControls.displayName = 'WheelerDeWittControls'
