/**
 * SpinControls Component
 *
 * Controls for configuring the initial spin state of the Pauli spinor.
 * Provides Bloch sphere angle sliders and quick presets for common states.
 *
 * @module components/sections/Geometry/PauliSpinorControls/SpinControls
 */

import React from 'react'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Select } from '@/components/ui/Select'
import type { PauliInitialCondition } from '@/lib/geometry/extended/types'

const SPIN_PRESETS = [
  { value: 'up', label: '↑ Up' },
  { value: 'down', label: '↓ Down' },
  { value: '+x', label: '+X' },
  { value: '-x', label: '-X' },
  { value: '+y', label: '+Y' },
  { value: '-y', label: '-Y' },
] as const

const SPIN_PRESET_ANGLES: Record<string, [number, number]> = {
  up: [0, 0],
  down: [Math.PI, 0],
  '+x': [Math.PI / 2, 0],
  '-x': [Math.PI / 2, Math.PI],
  '+y': [Math.PI / 2, Math.PI / 2],
  '-y': [Math.PI / 2, (3 * Math.PI) / 2],
}

const INITIAL_CONDITION_OPTIONS: { value: PauliInitialCondition; label: string }[] = [
  { value: 'gaussianSpinUp', label: 'Gaussian (Spin Up)' },
  { value: 'gaussianSpinDown', label: 'Gaussian (Spin Down)' },
  { value: 'gaussianSuperposition', label: 'Gaussian (Superposition)' },
  { value: 'planeWaveSpinor', label: 'Plane Wave Spinor' },
]

interface SpinControlsProps {
  initialSpinDirection: [number, number]
  initialCondition: PauliInitialCondition
  packetWidth: number
  onSpinDirectionChange: (direction: [number, number]) => void
  onInitialConditionChange: (condition: PauliInitialCondition) => void
  onPacketWidthChange: (width: number) => void
}

/**
 * Spin state configuration controls.
 *
 * @param props - Spin parameters and change handlers
 * @returns Spin state controls panel
 */
export const SpinControls: React.FC<SpinControlsProps> = React.memo(
  ({
    initialSpinDirection,
    initialCondition,
    packetWidth,
    onSpinDirectionChange,
    onInitialConditionChange,
    onPacketWidthChange,
  }) => {
    const currentPreset = Object.entries(SPIN_PRESET_ANGLES).find(
      ([, angles]) =>
        Math.abs(angles[0] - initialSpinDirection[0]) < 0.01 &&
        Math.abs(angles[1] - initialSpinDirection[1]) < 0.01
    )?.[0]

    return (
      <div className="space-y-3">
        <Select
          label="Initial Condition"
          options={INITIAL_CONDITION_OPTIONS}
          value={initialCondition}
          onChange={(v) => onInitialConditionChange(v as PauliInitialCondition)}
        />

        <ToggleGroup
          options={[...SPIN_PRESETS]}
          value={currentPreset ?? ''}
          onChange={(v) => {
            const angles = SPIN_PRESET_ANGLES[v]
            if (angles) onSpinDirectionChange(angles)
          }}
          ariaLabel="Spin Preset"
        />

        <Slider
          label="Spin θ (polar)"
          value={initialSpinDirection[0]}
          onChange={(v) => onSpinDirectionChange([v, initialSpinDirection[1]])}
          min={0}
          max={Math.PI}
          step={0.01}
        />

        <Slider
          label="Spin φ (azimuthal)"
          value={initialSpinDirection[1]}
          onChange={(v) => onSpinDirectionChange([initialSpinDirection[0], v])}
          min={0}
          max={2 * Math.PI}
          step={0.01}
        />

        <Slider
          label="Packet Width σ"
          value={packetWidth}
          onChange={onPacketWidthChange}
          min={0.2}
          max={3.0}
          step={0.05}
        />
      </div>
    )
  }
)
SpinControls.displayName = 'SpinControls'
