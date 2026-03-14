/**
 * PauliPotentialControls Component
 *
 * Controls for configuring the scalar potential V(x) in Pauli spinor mode.
 * Supports none, harmonic trap, barrier, and double-well potentials.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliPotentialControls
 */

import React from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import type { PauliPotentialType } from '@/lib/geometry/extended/types'

const POTENTIAL_TYPE_OPTIONS: { value: PauliPotentialType; label: string }[] = [
  { value: 'none', label: 'Free Particle' },
  { value: 'harmonicTrap', label: 'Harmonic Trap' },
  { value: 'barrier', label: 'Barrier' },
  { value: 'doubleWell', label: 'Double Well' },
]

interface PauliPotentialControlsProps {
  potentialType: PauliPotentialType
  harmonicOmega: number
  wellDepth: number
  wellWidth: number
  showPotential: boolean
  onPotentialTypeChange: (type: PauliPotentialType) => void
  onHarmonicOmegaChange: (omega: number) => void
  onWellDepthChange: (depth: number) => void
  onWellWidthChange: (width: number) => void
  onShowPotentialChange: (show: boolean) => void
}

/**
 * Scalar potential configuration controls.
 *
 * @param props - Potential parameters and change handlers
 * @returns Potential controls panel
 */
export const PauliPotentialControls: React.FC<PauliPotentialControlsProps> = React.memo(
  ({
    potentialType,
    harmonicOmega,
    wellDepth,
    wellWidth,
    showPotential,
    onPotentialTypeChange,
    onHarmonicOmegaChange,
    onWellDepthChange,
    onWellWidthChange,
    onShowPotentialChange,
  }) => {
    const showHarmonicParams = potentialType === 'harmonicTrap'
    const showWellParams = potentialType === 'barrier' || potentialType === 'doubleWell'

    return (
      <div className="space-y-3">
        <Select
          label="Potential Type"
          options={POTENTIAL_TYPE_OPTIONS}
          value={potentialType}
          onChange={(v) => onPotentialTypeChange(v as PauliPotentialType)}
        />

        {showHarmonicParams && (
          <Slider
            label="Trap Frequency ω"
            value={harmonicOmega}
            onChange={onHarmonicOmegaChange}
            min={0.01}
            max={10}
            step={0.01}
          />
        )}

        {showWellParams && (
          <>
            <Slider
              label="Well Depth V₀"
              value={wellDepth}
              onChange={onWellDepthChange}
              min={0}
              max={100}
              step={0.5}
            />

            <Slider
              label="Well Width"
              value={wellWidth}
              onChange={onWellWidthChange}
              min={0.01}
              max={10}
              step={0.01}
            />
          </>
        )}

        {potentialType !== 'none' && (
          <Switch
            label="Show Potential Overlay"
            checked={showPotential}
            onCheckedChange={onShowPotentialChange}
          />
        )}
      </div>
    )
  }
)
PauliPotentialControls.displayName = 'PauliPotentialControls'
