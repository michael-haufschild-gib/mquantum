/**
 * PauliVisualizationControls Component
 *
 * Controls for selecting which field quantity to render.
 * Auto-scale toggle has been moved to the centralized Exposure section.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliVisualizationControls
 */

import React from 'react'

import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { PauliFieldView } from '@/lib/geometry/extended/types'

const FIELD_VIEW_OPTIONS: { value: PauliFieldView; label: string }[] = [
  { value: 'spinDensity', label: 'Spin Density' },
  { value: 'totalDensity', label: 'Total |ψ|²' },
  { value: 'spinExpectation', label: '⟨σ_z⟩' },
  { value: 'coherence', label: 'Coherence' },
]

interface PauliVisualizationControlsProps {
  fieldView: PauliFieldView
  onFieldViewChange: (view: PauliFieldView) => void
}

/**
 * Field view controls for Pauli spinor.
 *
 * @param props - Visualization parameters and change handlers
 * @returns Visualization controls panel
 */
export const PauliVisualizationControls: React.FC<PauliVisualizationControlsProps> = React.memo(
  ({ fieldView, onFieldViewChange }) => {
    return (
      <div className="space-y-3">
        <ToggleGroup
          options={[...FIELD_VIEW_OPTIONS]}
          value={fieldView}
          onChange={(v) => onFieldViewChange(v as PauliFieldView)}
          ariaLabel="Field View"
          tooltip="Which spinor observable to render: spin density (up vs down), total probability, spin expectation value, or off-diagonal coherence."
        />
      </div>
    )
  }
)
PauliVisualizationControls.displayName = 'PauliVisualizationControls'
