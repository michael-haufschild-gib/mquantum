/**
 * PauliVisualizationControls Component
 *
 * Controls for selecting which field quantity to render
 * and toggling auto-scale density.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliVisualizationControls
 */

import React from 'react'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Switch } from '@/components/ui/Switch'
import type { PauliFieldView } from '@/lib/geometry/extended/types'

const FIELD_VIEW_OPTIONS: { value: PauliFieldView; label: string }[] = [
  { value: 'spinDensity', label: 'Spin Density' },
  { value: 'totalDensity', label: 'Total |ψ|²' },
  { value: 'spinExpectation', label: '⟨σ_z⟩' },
  { value: 'coherence', label: 'Coherence' },
]

interface PauliVisualizationControlsProps {
  fieldView: PauliFieldView
  autoScale: boolean
  onFieldViewChange: (view: PauliFieldView) => void
  onAutoScaleChange: (autoScale: boolean) => void
}

/**
 * Field view and auto-scale controls for Pauli spinor.
 *
 * @param props - Visualization parameters and change handlers
 * @returns Visualization controls panel
 */
export const PauliVisualizationControls: React.FC<PauliVisualizationControlsProps> = React.memo(
  ({
    fieldView,
    autoScale,
    onFieldViewChange,
    onAutoScaleChange,
  }) => {
    return (
      <div className="space-y-3">
        <ToggleGroup
          options={[...FIELD_VIEW_OPTIONS]}
          value={fieldView}
          onChange={(v) => onFieldViewChange(v as PauliFieldView)}
          ariaLabel="Field View"
        />

        <Switch
          label="Auto-Scale Density"
          checked={autoScale}
          onCheckedChange={onAutoScaleChange}
        />
      </div>
    )
  }
)
PauliVisualizationControls.displayName = 'PauliVisualizationControls'
