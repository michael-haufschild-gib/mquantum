/**
 * PauliPotentialControls Component
 *
 * Controls for configuring the scalar potential V(x) in Pauli spinor mode.
 * Supports none, harmonic trap, barrier, and double-well potentials.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliPotentialControls
 */

import React from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
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
          tooltip="External scalar potential acting on the spinor. Harmonic trap confines the wavepacket; barrier and double-well create scattering/tunneling scenarios."
          options={POTENTIAL_TYPE_OPTIONS}
          value={potentialType}
          onChange={(v) => onPotentialTypeChange(v as PauliPotentialType)}
        />

        {showHarmonicParams && (
          <Slider
            label="Trap Frequency ω"
            tooltip="Angular frequency of the harmonic confining potential V(x) = ½mω²x². Higher ω gives tighter confinement."
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
              tooltip="Height (barrier) or depth (well) of the potential in energy units. Controls tunneling probability and bound state count."
              value={wellDepth}
              onChange={onWellDepthChange}
              min={0}
              max={100}
              step={0.5}
            />

            <Slider
              label="Well Width"
              tooltip="Spatial extent of the barrier or well region. Wider barriers reduce tunneling; wider wells support more bound states."
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
            tooltip="Overlay the scalar potential V(x) on the spinor density visualization."
            checked={showPotential}
            onCheckedChange={onShowPotentialChange}
          />
        )}
      </div>
    )
  }
)
PauliPotentialControls.displayName = 'PauliPotentialControls'
