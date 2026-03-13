/**
 * TDSEPotentialControls — sub-component for potential and drive controls.
 *
 * Extracted from TDSEControls to keep file sizes under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/TDSEPotentialControls
 */

import React, { useMemo } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import type { TdseActions } from './types'
import type {
  TdseConfig,
  TdsePotentialType,
  TdseDriveWaveform,
} from '@/lib/geometry/extended/types'
import {
  ALL_POTENTIAL_TYPE_OPTIONS,
  DRIVE_WAVEFORM_OPTIONS,
} from './tdseControlsConstants'

/** Props for TDSEPotentialControls. */
interface TDSEPotentialControlsProps {
  td: TdseConfig
  activeDims: number
  actions: TdseActions
}

/**
 * Potential type selection, parameter sliders, and drive controls for TDSE.
 *
 * @param props - Component props
 * @returns React element
 */
export const TDSEPotentialControls: React.FC<TDSEPotentialControlsProps> = React.memo(
  ({ td, activeDims, actions }) => {
    const potentialTypeOptions = useMemo(
      () => ALL_POTENTIAL_TYPE_OPTIONS.filter((o) => !o.minDims || activeDims >= o.minDims),
      [activeDims],
    )

    const showBarrierControls = td.potentialType === 'barrier' || td.potentialType === 'driven'
    const showWellControls = td.potentialType === 'finiteWell'
    const showHarmonicControls = td.potentialType === 'harmonicTrap'
    const showStepControls = td.potentialType === 'step'
    const showDriveControls = td.potentialType === 'driven'
    const showSlitControls = td.potentialType === 'doubleSlit'
    const showLatticeControls = td.potentialType === 'periodicLattice'
    const showDoubleWellControls = td.potentialType === 'doubleWell'
    const showRadialDoubleWellControls = td.potentialType === 'radialDoubleWell'

    return (
      <>
        {/* Potential */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Select
            label="Potential"
            options={potentialTypeOptions}
            value={td.potentialType}
            onChange={(v) => actions.setPotentialType(v as TdsePotentialType)}
            data-testid="tdse-potential-type"
          />

          {showBarrierControls && (
            <>
              <Slider
                label="Barrier Height" min={0} max={100} step={0.5}
                value={td.barrierHeight} onChange={actions.setBarrierHeight}
                showValue data-testid="tdse-barrier-height"
              />
              <Slider
                label="Barrier Width" min={0.01} max={5} step={0.01}
                value={td.barrierWidth} onChange={actions.setBarrierWidth}
                showValue data-testid="tdse-barrier-width"
              />
              <Slider
                label="Barrier Center" min={-10} max={10} step={0.1}
                value={td.barrierCenter} onChange={actions.setBarrierCenter}
                showValue data-testid="tdse-barrier-center"
              />
            </>
          )}

          {showStepControls && (
            <Slider
              label="Step Height" min={0} max={100} step={0.5}
              value={td.stepHeight} onChange={actions.setStepHeight}
              showValue data-testid="tdse-step-height"
            />
          )}

          {showWellControls && (
            <>
              <Slider
                label="Well Depth" min={0} max={100} step={0.5}
                value={td.wellDepth} onChange={actions.setWellDepth}
                showValue data-testid="tdse-well-depth"
              />
              <Slider
                label="Well Width" min={0.1} max={10} step={0.1}
                value={td.wellWidth} onChange={actions.setWellWidth}
                showValue data-testid="tdse-well-width"
              />
            </>
          )}

          {showHarmonicControls && (
            <Slider
              label="Omega" min={0.01} max={10} step={0.01}
              value={td.harmonicOmega} onChange={actions.setHarmonicOmega}
              showValue data-testid="tdse-harmonic-omega"
            />
          )}

          {showSlitControls && (
            <>
              <Slider
                label="Wall Position" min={-10} max={10} step={0.1}
                value={td.barrierCenter} onChange={actions.setBarrierCenter}
                showValue data-testid="tdse-slit-wall-position"
              />
              <Slider
                label="Slit Separation" min={0.1} max={10} step={0.1}
                value={td.slitSeparation} onChange={actions.setSlitSeparation}
                showValue data-testid="tdse-slit-separation"
              />
              <Slider
                label="Slit Width" min={0.05} max={5} step={0.05}
                value={td.slitWidth} onChange={actions.setSlitWidth}
                showValue data-testid="tdse-slit-width"
              />
              <Slider
                label="Wall Thickness" min={0.05} max={3} step={0.05}
                value={td.wallThickness} onChange={actions.setWallThickness}
                showValue data-testid="tdse-wall-thickness"
              />
              <Slider
                label="Wall Height" min={1} max={500} step={1}
                value={td.wallHeight} onChange={actions.setWallHeight}
                showValue data-testid="tdse-wall-height"
              />
            </>
          )}

          {showLatticeControls && (
            <>
              <Slider
                label="Lattice Depth" min={0.1} max={100} step={0.1}
                value={td.latticeDepth} onChange={actions.setLatticeDepth}
                showValue data-testid="tdse-lattice-depth"
              />
              <Slider
                label="Lattice Period" min={0.1} max={10} step={0.1}
                value={td.latticePeriod} onChange={actions.setLatticePeriod}
                showValue data-testid="tdse-lattice-period"
              />
            </>
          )}

          {showDoubleWellControls && (
            <>
              <Slider
                label="Coupling (\u03BB)" min={0.1} max={100} step={0.1}
                value={td.doubleWellLambda} onChange={actions.setDoubleWellLambda}
                showValue data-testid="tdse-double-well-lambda"
              />
              <Slider
                label="Well Separation (a)" min={0.1} max={5} step={0.05}
                value={td.doubleWellSeparation} onChange={actions.setDoubleWellSeparation}
                showValue data-testid="tdse-double-well-separation"
              />
              <Slider
                label="Asymmetry (\u03B5)" min={0} max={50} step={0.1}
                value={td.doubleWellAsymmetry} onChange={actions.setDoubleWellAsymmetry}
                showValue data-testid="tdse-double-well-asymmetry"
              />
            </>
          )}

          {showRadialDoubleWellControls && (
            <>
              <Slider
                label="Inner Radius (r\u2081)" min={0.01} max={5} step={0.01}
                value={td.radialWellInner} onChange={actions.setRadialWellInner}
                showValue data-testid="tdse-radial-well-inner"
              />
              <Slider
                label="Outer Radius (r\u2082)" min={0.01} max={10} step={0.01}
                value={td.radialWellOuter} onChange={actions.setRadialWellOuter}
                showValue data-testid="tdse-radial-well-outer"
              />
              <Slider
                label="Well Depth (\u03BB)" min={0.1} max={500} step={0.5}
                value={td.radialWellDepth} onChange={actions.setRadialWellDepth}
                showValue data-testid="tdse-radial-well-depth"
              />
              <Slider
                label="Tilt (\u03B5)" min={0} max={50} step={0.1}
                value={td.radialWellTilt} onChange={actions.setRadialWellTilt}
                showValue data-testid="tdse-radial-well-tilt"
              />
            </>
          )}
        </div>

        {/* Drive (only for driven potential) */}
        {showDriveControls && (
          <div className="border-t border-border-subtle pt-3 space-y-3">
            <Switch
              label="Drive"
              checked={td.driveEnabled}
              onCheckedChange={actions.setDriveEnabled}
              data-testid="tdse-drive-enabled"
            />
            {td.driveEnabled && (
              <>
                <Select
                  label="Waveform"
                  options={DRIVE_WAVEFORM_OPTIONS}
                  value={td.driveWaveform}
                  onChange={(v) => actions.setDriveWaveform(v as TdseDriveWaveform)}
                  data-testid="tdse-drive-waveform"
                />
                <Slider
                  label="Frequency" min={0.01} max={10} step={0.01}
                  value={td.driveFrequency} onChange={actions.setDriveFrequency}
                  showValue data-testid="tdse-drive-frequency"
                />
                <Slider
                  label="Amplitude" min={0} max={50} step={0.1}
                  value={td.driveAmplitude} onChange={actions.setDriveAmplitude}
                  showValue data-testid="tdse-drive-amplitude"
                />
              </>
            )}
          </div>
        )}
      </>
    )
  },
)

TDSEPotentialControls.displayName = 'TDSEPotentialControls'
