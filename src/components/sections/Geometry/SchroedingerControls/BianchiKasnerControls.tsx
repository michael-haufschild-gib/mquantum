/**
 * BianchiKasnerControls — Bianchi-I vacuum Kasner exponent sub-panel.
 *
 * Renders the three exponent sliders `p₁, p₂, p₃` alongside a live readout
 * of the two vacuum constraints `Σp_i = 1` and `Σp_i² = 1`, and a
 * "Snap to vacuum" button that projects the current triple onto the
 * nearest vacuum solution on the constraint circle. Only mounted when
 * the parent cosmology preset is `bianchiKasner` — see
 * {@link CosmologyControls}.
 *
 * @module components/sections/Geometry/SchroedingerControls/BianchiKasnerControls
 */

import React, { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import {
  isKasnerVacuum,
  type KasnerExponents,
  kasnerSymmetricVacuum,
  snapToKasnerVacuum,
} from '@/lib/physics/cosmology/bianchiKasner'

import type { FreeScalarFieldActions } from './types'

/** Props for the Bianchi-I Kasner exponent controls sub-panel. */
export interface BianchiKasnerControlsProps {
  /** Current exponent triple, or `undefined` (falls back to canonical vacuum). */
  kasnerExponents: KasnerExponents | undefined
  /** Active lattice dimension — Bianchi-I requires ≥ 3 spatial axes. */
  latticeDim: number
  /** Store setter for the three exponents. */
  setBianchiExponents: FreeScalarFieldActions['setCosmologyBianchiExponents']
}

const DEFAULT_TRIPLE = kasnerSymmetricVacuum()

/**
 * Sub-panel exposing the three Kasner exponents as sliders, plus a live
 * constraint readout and a vacuum-projection button.
 *
 * @param props - Component props
 * @returns React component
 */
export const BianchiKasnerControls: React.FC<BianchiKasnerControlsProps> = React.memo(
  ({ kasnerExponents, latticeDim, setBianchiExponents }) => {
    const exp = kasnerExponents ?? DEFAULT_TRIPLE

    const sumP = exp.p1 + exp.p2 + exp.p3
    const sumP2 = exp.p1 * exp.p1 + exp.p2 * exp.p2 + exp.p3 * exp.p3
    const vacuum = useMemo(() => isKasnerVacuum(exp, 1e-3), [exp])

    const setP1 = useCallback(
      (v: number) => setBianchiExponents(v, exp.p2, exp.p3),
      [exp.p2, exp.p3, setBianchiExponents]
    )
    const setP2 = useCallback(
      (v: number) => setBianchiExponents(exp.p1, v, exp.p3),
      [exp.p1, exp.p3, setBianchiExponents]
    )
    const setP3 = useCallback(
      (v: number) => setBianchiExponents(exp.p1, exp.p2, v),
      [exp.p1, exp.p2, setBianchiExponents]
    )

    const handleSnap = useCallback(() => {
      const snapped = snapToKasnerVacuum(exp)
      setBianchiExponents(snapped.p1, snapped.p2, snapped.p3)
    }, [exp, setBianchiExponents])

    const handleCanonical = useCallback(() => {
      const c = kasnerSymmetricVacuum()
      setBianchiExponents(c.p1, c.p2, c.p3)
    }, [setBianchiExponents])

    return (
      <ControlGroup
        title="Bianchi-I Kasner Exponents"
        collapsible
        defaultOpen
        data-testid="control-group-fsf-bianchi-kasner"
      >
        <div className="text-xs text-text-secondary">
          Vacuum solution: Σp_i = 1, Σp_i² = 1. Canonical triple (−1/3, 2/3, 2/3) contracts axis 0
          and dilates axes 1, 2.
        </div>

        <Slider
          label="p₁ (axis 0)"
          tooltip="Kasner exponent along lattice axis 0. Negative values contract, positive values dilate."
          min={-2}
          max={2}
          step={0.01}
          value={exp.p1}
          onChange={setP1}
          showValue
          data-testid="bianchi-p1-slider"
        />
        <Slider
          label="p₂ (axis 1)"
          tooltip="Kasner exponent along lattice axis 1."
          min={-2}
          max={2}
          step={0.01}
          value={exp.p2}
          onChange={setP2}
          showValue
          data-testid="bianchi-p2-slider"
        />
        <Slider
          label="p₃ (axis 2)"
          tooltip="Kasner exponent along lattice axis 2."
          min={-2}
          max={2}
          step={0.01}
          value={exp.p3}
          onChange={setP3}
          showValue
          data-testid="bianchi-p3-slider"
        />

        <div
          className={vacuum ? 'text-xs text-accent' : 'text-xs text-text-secondary'}
          data-testid="bianchi-constraint-readout"
        >
          Σp = {sumP.toFixed(4)} {Math.abs(sumP - 1) < 1e-3 ? '[ok]' : '[fail]'} &nbsp;|&nbsp; Σp² ={' '}
          {sumP2.toFixed(4)} {Math.abs(sumP2 - 1) < 1e-3 ? '[ok]' : '[fail]'}
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleSnap}
            data-testid="bianchi-snap-button"
            title="Project the current triple onto the nearest vacuum Kasner solution"
          >
            Snap to vacuum
          </Button>
          <Button
            variant="secondary"
            onClick={handleCanonical}
            data-testid="bianchi-canonical-button"
            title="Reset to the canonical symmetric vacuum triple (−1/3, 2/3, 2/3)"
          >
            Canonical
          </Button>
        </div>

        <div className="text-xs text-text-tertiary italic">
          Only the first three spatial axes feel the anisotropy — higher-dim lattices stay
          isotropic on the extra axes. Generalised conformal time η &gt; 0.
        </div>
      </ControlGroup>
    )
  }
)

BianchiKasnerControls.displayName = 'BianchiKasnerControls'
