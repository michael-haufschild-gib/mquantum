/**
 * BlackHoleRingdownControls — sub-controls for the Regge–Wheeler ringdown
 * TDSE potential (potentialType = 'blackHoleRingdown').
 *
 * Exposes BH mass M, multipole index ℓ, and perturbation spin s as three
 * typed controls. Spin is stored as 0/1/2 but exposed via ToggleGroup with
 * string values (ToggleGroup uses string keys internally).
 *
 * @module components/sections/Geometry/SchroedingerControls/BlackHoleRingdownControls
 */

import React, { useCallback } from 'react'

import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { TdseConfig } from '@/lib/geometry/extended/types'

import type { TdseActions } from './types'

/** Perturbation-spin options for the black-hole ringdown control. */
const BH_SPIN_OPTIONS = [
  { value: '0', label: 'Scalar (s=0)' },
  { value: '1', label: 'EM (s=1)' },
  { value: '2', label: 'Gravitational (s=2)' },
]

/** Props for the BlackHoleRingdownControls sub-panel. */
interface BlackHoleRingdownControlsProps {
  td: TdseConfig
  actions: TdseActions
}

/**
 * Control sub-panel for the Regge–Wheeler ringdown potential.
 *
 * @param props - Component props
 * @returns React element
 */
export const BlackHoleRingdownControls: React.FC<BlackHoleRingdownControlsProps> = React.memo(
  ({ td, actions }) => {
    const setBhSpinString = useCallback(
      (v: string) => actions.setBhSpin(Number.parseInt(v, 10)),
      [actions]
    )

    return (
      <>
        <Slider
          label="BH Mass (M)"
          tooltip="Schwarzschild mass M in geometrized units. Smaller M shrinks the barrier scale and raises its peak (V_peak ~ 1/M²)."
          min={0.1}
          max={5}
          step={0.05}
          value={td.bhMass}
          onChange={actions.setBhMass}
          showValue
          data-testid="tdse-bh-mass"
        />
        <Slider
          label="Multipole (ℓ)"
          tooltip="Angular multipole index ℓ. Physical Schwarzschild perturbation modes require ℓ ≥ s: scalar allows any ℓ, EM requires ℓ ≥ 1, gravitational requires ℓ ≥ 2. The gravitational ringdown is dominated by ℓ=2 (quadrupole)."
          min={td.bhSpin}
          max={6}
          step={1}
          value={td.bhMultipoleL}
          onChange={actions.setBhMultipoleL}
          showValue
          data-testid="tdse-bh-ell"
        />
        <ToggleGroup
          options={BH_SPIN_OPTIONS}
          value={String(td.bhSpin)}
          onChange={setBhSpinString}
          ariaLabel="Perturbation spin"
          tooltip="Perturbation spin: scalar (s=0), electromagnetic (s=1), or gravitational (s=2). The (1−s²) coefficient flips sign between cases."
          data-testid="tdse-bh-spin"
        />
      </>
    )
  }
)

BlackHoleRingdownControls.displayName = 'BlackHoleRingdownControls'
