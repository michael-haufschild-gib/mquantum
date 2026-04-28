/**
 * MagneticFieldControls Component
 *
 * Controls for configuring the external magnetic field in Pauli spinor mode.
 * Supports uniform, gradient, rotating, and quadrupole field types.
 *
 * @module components/sections/Geometry/PauliSpinorControls/MagneticFieldControls
 */

import React from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
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
          tooltip="Spatial profile of the effective Zeeman field. Magnetic orbital motion is not included in this spin-only Pauli mode."
          options={FIELD_TYPE_OPTIONS}
          value={fieldType}
          onChange={(v) => onFieldTypeChange(v as PauliFieldType)}
        />

        <Slider
          label="Field Strength B₀"
          tooltip="Magnitude of the effective Zeeman coupling. Higher values increase the Larmor precession frequency ω_L = 2B₀/ℏ in this convention."
          value={fieldStrength}
          onChange={onFieldStrengthChange}
          min={0}
          max={10}
          step={0.1}
        />

        <Slider
          label="Field θ (polar)"
          tooltip="Polar angle of the magnetic field direction. 0 = along +z (standard quantization axis)."
          value={fieldDirection[0]}
          onChange={(v) => onFieldDirectionChange([v, fieldDirection[1]])}
          min={0}
          max={Math.PI}
          step={0.01}
        />

        <Slider
          label="Field φ (azimuthal)"
          tooltip="Azimuthal angle of the magnetic field direction in the x-y plane."
          value={fieldDirection[1]}
          onChange={(v) => onFieldDirectionChange([fieldDirection[0], v])}
          min={0}
          max={2 * Math.PI}
          step={0.01}
        />

        {(fieldType === 'gradient' || fieldType === 'quadrupole') && (
          <Slider
            label={fieldType === 'quadrupole' ? 'Quadrupole Strength g' : "Gradient Strength b'"}
            tooltip={
              fieldType === 'quadrupole'
                ? 'Quadrupole coupling g for B = g(x ẑ + z x̂). Creates a saddle-point field used in magnetic traps and Stern-Gerlach geometries.'
                : 'Spatial gradient dB/dz of the magnetic field. Creates position-dependent Zeeman splitting for Stern-Gerlach separation.'
            }
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
            tooltip="Angular frequency of the rotating magnetic field component. Resonance occurs when ω matches the Larmor frequency."
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
