/**
 * MagneticFieldControls Component
 *
 * Controls for configuring the external magnetic field in Pauli spinor mode.
 * Supports uniform, gradient, rotating, and quadrupole field types.
 *
 * @module components/sections/Geometry/PauliSpinorControls/MagneticFieldControls
 */

import React from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import type { PauliFieldType } from '@/lib/geometry/extended/types'

const FIELD_TYPE_OPTIONS: { value: PauliFieldType; label: string }[] = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'gradient', label: 'Gradient (Stern-Gerlach)' },
  { value: 'rotating', label: 'Rotating' },
  { value: 'quadrupole', label: 'Quadrupole' },
]

interface MagneticFieldControlsProps {
  fieldType: PauliFieldType
  fieldStrength: number
  fieldDirection: [number, number]
  gradientStrength: number
  rotatingFrequency: number
  onFieldTypeChange: (type: PauliFieldType) => void
  onFieldStrengthChange: (strength: number) => void
  onFieldDirectionChange: (direction: [number, number]) => void
  onGradientStrengthChange: (strength: number) => void
  onRotatingFrequencyChange: (frequency: number) => void
}

/**
 * Magnetic field configuration controls.
 *
 * @param props - Field parameters and change handlers
 * @returns Magnetic field controls panel
 */
export const MagneticFieldControls: React.FC<MagneticFieldControlsProps> = React.memo(
  ({
    fieldType,
    fieldStrength,
    fieldDirection,
    gradientStrength,
    rotatingFrequency,
    onFieldTypeChange,
    onFieldStrengthChange,
    onFieldDirectionChange,
    onGradientStrengthChange,
    onRotatingFrequencyChange,
  }) => {
    return (
      <div className="space-y-3">
        <Select
          label="Field Type"
          options={FIELD_TYPE_OPTIONS}
          value={fieldType}
          onChange={(v) => onFieldTypeChange(v as PauliFieldType)}
        />

        <Slider
          label="Field Strength B₀"
          value={fieldStrength}
          onChange={onFieldStrengthChange}
          min={0}
          max={10}
          step={0.1}
        />

        <Slider
          label="Field θ (polar)"
          value={fieldDirection[0]}
          onChange={(v) => onFieldDirectionChange([v, fieldDirection[1]])}
          min={0}
          max={Math.PI}
          step={0.01}
        />

        <Slider
          label="Field φ (azimuthal)"
          value={fieldDirection[1]}
          onChange={(v) => onFieldDirectionChange([fieldDirection[0], v])}
          min={0}
          max={2 * Math.PI}
          step={0.01}
        />

        {fieldType === 'gradient' && (
          <Slider
            label="Gradient Strength b'"
            value={gradientStrength}
            onChange={onGradientStrengthChange}
            min={0}
            max={5}
            step={0.1}
          />
        )}

        {fieldType === 'rotating' && (
          <Slider
            label="Rotation Frequency ω"
            value={rotatingFrequency}
            onChange={onRotatingFrequencyChange}
            min={0}
            max={10}
            step={0.1}
          />
        )}
      </div>
    )
  }
)
MagneticFieldControls.displayName = 'MagneticFieldControls'
