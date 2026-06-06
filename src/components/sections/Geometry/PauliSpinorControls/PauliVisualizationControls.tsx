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
  { value: 'spinHelicity', label: 'Spin Helicity' },
  { value: 'berryCurvature', label: 'Berry Curvature' },
  { value: 'zeemanAnamorph', label: 'Zeeman Anamorph' },
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
          data-testid="components-sections-geometry-pauli-spinor-controls-pauli-visualization-controls-toggle-group-39-9"
          options={[...FIELD_VIEW_OPTIONS]}
          value={fieldView}
          onChange={(v) => onFieldViewChange(v as PauliFieldView)}
          ariaLabel="Field View"
          tooltip="Which spinor observable to render: spin density, total probability, spin expectation, coherence, spin helicity, Berry curvature, or Zeeman Anamorph."
        />
      </div>
    )
  }
)
PauliVisualizationControls.displayName = 'PauliVisualizationControls'
