/**
 * TDSEPotentialControls — sub-component for potential and drive controls.
 *
 * Extracted from TDSEControls to keep file sizes under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/TDSEPotentialControls
 */

import React, { useMemo } from 'react'

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type {
  TdseConfig,
  TdseDisorderDistribution,
  TdseDriveWaveform,
  TdsePotentialType,
} from '@/lib/geometry/extended/types'

import { CustomExpressionInput } from './CustomExpressionInput'
import {
  ALL_POTENTIAL_TYPE_OPTIONS,
  DISORDER_DISTRIBUTION_OPTIONS,
  DRIVE_WAVEFORM_OPTIONS,
} from './tdseControlsConstants'
import type { TdseActions } from './types'

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
      [activeDims]
    )

    const showCustomControls = td.potentialType === 'custom'
    const showBarrierControls = td.potentialType === 'barrier' || td.potentialType === 'driven'
    const showWellControls = td.potentialType === 'finiteWell'
    const showHarmonicControls = td.potentialType === 'harmonicTrap'
    const showStepControls = td.potentialType === 'step'
    const showDriveControls = td.potentialType === 'driven'
    const showSlitControls = td.potentialType === 'doubleSlit'
    const showLatticeControls = td.potentialType === 'periodicLattice'
    const showDoubleWellControls = td.potentialType === 'doubleWell'
    const showRadialDoubleWellControls = td.potentialType === 'radialDoubleWell'
    const showDisorderControls = td.potentialType === 'andersonDisorder'
    const showCoupledAnharmonicControls = td.potentialType === 'coupledAnharmonic'

    return (
      <>
        <div className="space-y-3">
          <Select
            label="Potential"
            tooltip="External potential V(x) applied to the wavefunction during time evolution."
            options={potentialTypeOptions}
            value={td.potentialType}
            onChange={(v) => actions.setPotentialType(v as TdsePotentialType)}
            data-testid="tdse-potential-type"
          />

          {showCustomControls && (
            <CustomExpressionInput
              expression={td.customPotentialExpression ?? '0.5 * (x^2 + y^2)'}
              onChange={actions.setCustomPotentialExpression}
              activeDims={activeDims}
            />
          )}

          {showBarrierControls && (
            <>
              <Slider
                label="Barrier Height"
                tooltip="Peak magnitude of the rectangular potential barrier in energy units."
                min={0}
                max={100}
                step={0.5}
                value={td.barrierHeight}
                onChange={actions.setBarrierHeight}
                showValue
                data-testid="tdse-barrier-height"
              />
              <Slider
                label="Barrier Width"
                tooltip="Spatial extent of the potential barrier. Narrower barriers increase tunneling probability."
                min={0.01}
                max={5}
                step={0.01}
                value={td.barrierWidth}
                onChange={actions.setBarrierWidth}
                showValue
                data-testid="tdse-barrier-width"
              />
              <Slider
                label="Barrier Center"
                tooltip="Position of the barrier center along the primary axis."
                min={-10}
                max={10}
                step={0.1}
                value={td.barrierCenter}
                onChange={actions.setBarrierCenter}
                showValue
                data-testid="tdse-barrier-center"
              />
            </>
          )}

          {showStepControls && (
            <Slider
              label="Step Height"
              tooltip="Height of the potential step. Waves partially reflect when energy is near this value."
              min={0}
              max={100}
              step={0.5}
              value={td.stepHeight}
              onChange={actions.setStepHeight}
              showValue
              data-testid="tdse-step-height"
            />
          )}

          {showWellControls && (
            <>
              <Slider
                label="Well Depth"
                tooltip="Depth of the finite square well. Deeper wells support more bound states."
                min={0}
                max={100}
                step={0.5}
                value={td.wellDepth}
                onChange={actions.setWellDepth}
                showValue
                data-testid="tdse-well-depth"
              />
              <Slider
                label="Well Width"
                tooltip="Spatial width of the finite well. Wider wells lower the energy of bound states."
                min={0.1}
                max={10}
                step={0.1}
                value={td.wellWidth}
                onChange={actions.setWellWidth}
                showValue
                data-testid="tdse-well-width"
              />
            </>
          )}

          {showHarmonicControls && (
            <Slider
              label="Omega"
              tooltip="Angular frequency of the harmonic trap. Higher values create a tighter confining potential."
              min={0.01}
              max={10}
              step={0.01}
              value={td.harmonicOmega}
              onChange={actions.setHarmonicOmega}
              showValue
              data-testid="tdse-harmonic-omega"
            />
          )}

          {showSlitControls && (
            <>
              <Slider
                label="Wall Position"
                tooltip="Location of the slit wall along the primary axis."
                min={-10}
                max={10}
                step={0.1}
                value={td.barrierCenter}
                onChange={actions.setBarrierCenter}
                showValue
                data-testid="tdse-slit-wall-position"
              />
              <Slider
                label="Slit Separation"
                tooltip="Distance between the two slit centers. Controls the interference fringe spacing."
                min={0.1}
                max={10}
                step={0.1}
                value={td.slitSeparation}
                onChange={actions.setSlitSeparation}
                showValue
                data-testid="tdse-slit-separation"
              />
              <Slider
                label="Slit Width"
                tooltip="Opening width of each slit. Narrower slits produce broader diffraction patterns."
                min={0.05}
                max={5}
                step={0.05}
                value={td.slitWidth}
                onChange={actions.setSlitWidth}
                showValue
                data-testid="tdse-slit-width"
              />
              <Slider
                label="Wall Thickness"
                tooltip="Thickness of the barrier wall containing the slits."
                min={0.05}
                max={3}
                step={0.05}
                value={td.wallThickness}
                onChange={actions.setWallThickness}
                showValue
                data-testid="tdse-wall-thickness"
              />
              <Slider
                label="Wall Height"
                tooltip="Potential energy of the wall. Higher values reduce leakage through the barrier."
                min={1}
                max={500}
                step={1}
                value={td.wallHeight}
                onChange={actions.setWallHeight}
                showValue
                data-testid="tdse-wall-height"
              />
            </>
          )}

          {showLatticeControls && (
            <>
              <Slider
                label="Lattice Depth"
                tooltip="Amplitude of the periodic potential. Controls the width of Bloch band gaps."
                min={0.1}
                max={100}
                step={0.1}
                value={td.latticeDepth}
                onChange={actions.setLatticeDepth}
                showValue
                data-testid="tdse-lattice-depth"
              />
              <Slider
                label="Lattice Period"
                tooltip="Spatial period of the lattice. Determines the Brillouin zone size."
                min={0.1}
                max={10}
                step={0.1}
                value={td.latticePeriod}
                onChange={actions.setLatticePeriod}
                showValue
                data-testid="tdse-lattice-period"
              />
            </>
          )}

          {showDoubleWellControls && (
            <>
              <Slider
                label="Coupling (\u03BB)"
                tooltip="Quartic coupling strength. Larger values deepen the two minima of the double well."
                min={0.1}
                max={100}
                step={0.1}
                value={td.doubleWellLambda}
                onChange={actions.setDoubleWellLambda}
                showValue
                data-testid="tdse-double-well-lambda"
              />
              <Slider
                label="Well Separation (a)"
                tooltip="Distance between the two potential minima. Controls the tunneling rate between wells."
                min={0.1}
                max={5}
                step={0.05}
                value={td.doubleWellSeparation}
                onChange={actions.setDoubleWellSeparation}
                showValue
                data-testid="tdse-double-well-separation"
              />
              <Slider
                label="Asymmetry (\u03B5)"
                tooltip="Linear tilt breaking the symmetry between wells. Non-zero values localize the ground state."
                min={0}
                max={50}
                step={0.1}
                value={td.doubleWellAsymmetry}
                onChange={actions.setDoubleWellAsymmetry}
                showValue
                data-testid="tdse-double-well-asymmetry"
              />
            </>
          )}

          {showRadialDoubleWellControls && (
            <>
              <Slider
                label="Inner Radius (r\u2081)"
                tooltip="Inner boundary of the radial annular well."
                min={0.01}
                max={5}
                step={0.01}
                value={td.radialWellInner}
                onChange={actions.setRadialWellInner}
                showValue
                data-testid="tdse-radial-well-inner"
              />
              <Slider
                label="Outer Radius (r\u2082)"
                tooltip="Outer boundary of the radial annular well."
                min={0.01}
                max={10}
                step={0.01}
                value={td.radialWellOuter}
                onChange={actions.setRadialWellOuter}
                showValue
                data-testid="tdse-radial-well-outer"
              />
              <Slider
                label="Well Depth (\u03BB)"
                tooltip="Depth of the radial annular potential well in energy units."
                min={0.1}
                max={500}
                step={0.5}
                value={td.radialWellDepth}
                onChange={actions.setRadialWellDepth}
                showValue
                data-testid="tdse-radial-well-depth"
              />
              <Slider
                label="Tilt (\u03B5)"
                tooltip="Linear potential tilt that breaks radial symmetry, favoring one side of the annulus."
                min={0}
                max={50}
                step={0.1}
                value={td.radialWellTilt}
                onChange={actions.setRadialWellTilt}
                showValue
                data-testid="tdse-radial-well-tilt"
              />
            </>
          )}

          {showDisorderControls && (
            <>
              <Slider
                label="Disorder Strength (W)"
                tooltip="Width of the random potential distribution. V(r) drawn from [-W/2, W/2] (uniform) or N(0, W) (Gaussian). Higher W = stronger Anderson localization."
                min={0}
                max={100}
                step={0.1}
                value={td.disorderStrength}
                onChange={actions.setDisorderStrength}
                showValue
                data-testid="tdse-disorder-strength"
              />
              <Select
                label="Distribution"
                tooltip="Statistical distribution of on-site disorder energies."
                options={DISORDER_DISTRIBUTION_OPTIONS}
                value={td.disorderDistribution}
                onChange={(v) => actions.setDisorderDistribution(v as TdseDisorderDistribution)}
                data-testid="tdse-disorder-distribution"
              />
              <Slider
                label="Seed"
                tooltip="PRNG seed for disorder realization. Same seed = same random potential for reproducibility."
                min={0}
                max={999999}
                step={1}
                value={td.disorderSeed}
                onChange={actions.setDisorderSeed}
                showValue
                data-testid="tdse-disorder-seed"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => actions.setDisorderSeed(Math.floor(Math.random() * 999999))}
                data-testid="tdse-randomize-seed"
              >
                Randomize Seed
              </Button>
            </>
          )}

          {showCoupledAnharmonicControls && (
            <>
              <Slider
                label="Omega"
                tooltip="Harmonic oscillator frequency for the confining quadratic part of the potential."
                min={0.01}
                max={10}
                step={0.01}
                value={td.harmonicOmega}
                onChange={actions.setHarmonicOmega}
                showValue
                data-testid="tdse-anharmonic-omega"
              />
              <Slider
                label="Coupling (\u03BB)"
                tooltip="Cross-dimensional coupling strength in V = \u00BDΣ\u03C9\u00B2x\u00B2 + \u03BBΣx_i\u00B2x_j\u00B2. Higher values increase classical chaos."
                min={0}
                max={100}
                step={0.1}
                value={td.anharmonicLambda}
                onChange={actions.setAnharmonicLambda}
                showValue
                data-testid="tdse-anharmonic-lambda"
              />
            </>
          )}

          {/* Disorder overlay (available for any potential except andersonDisorder which has its own) */}
          {!showDisorderControls && (
            <>
              <Slider
                label="Disorder (W)"
                tooltip="Uniform random on-site disorder strength. Adds V_noise \u2208 [-W/2, +W/2] to the potential at each lattice site. Non-zero values enable Anderson localization physics."
                min={0}
                max={100}
                step={0.1}
                value={td.disorderStrength}
                onChange={actions.setDisorderStrength}
                showValue
                data-testid="tdse-disorder-strength"
              />
              {td.disorderStrength > 0 && (
                <Slider
                  label="Disorder Seed"
                  tooltip="Random seed for reproducible disorder realization. Different seeds give different disorder patterns."
                  min={0}
                  max={999999}
                  step={1}
                  value={td.disorderSeed}
                  onChange={actions.setDisorderSeed}
                  showValue
                  data-testid="tdse-disorder-seed"
                />
              )}
            </>
          )}
        </div>

        {/* Drive (only for driven potential) */}
        {showDriveControls && (
          <div className="border-t border-border-subtle pt-3 space-y-3">
            <Switch
              label="Drive"
              tooltip="Enable a time-dependent oscillating force on the potential barrier."
              checked={td.driveEnabled}
              onCheckedChange={actions.setDriveEnabled}
              data-testid="tdse-drive-enabled"
            />
            {td.driveEnabled && (
              <>
                <Select
                  label="Waveform"
                  tooltip="Shape of the driving oscillation: sinusoidal, square, or sawtooth."
                  options={DRIVE_WAVEFORM_OPTIONS}
                  value={td.driveWaveform}
                  onChange={(v) => actions.setDriveWaveform(v as TdseDriveWaveform)}
                  data-testid="tdse-drive-waveform"
                />
                <Slider
                  label="Frequency"
                  tooltip="Angular frequency of the driving force. Resonances occur at natural transition frequencies."
                  min={0.01}
                  max={10}
                  step={0.01}
                  value={td.driveFrequency}
                  onChange={actions.setDriveFrequency}
                  showValue
                  data-testid="tdse-drive-frequency"
                />
                <Slider
                  label="Amplitude"
                  tooltip="Peak strength of the driving perturbation in energy units."
                  min={0}
                  max={50}
                  step={0.1}
                  value={td.driveAmplitude}
                  onChange={actions.setDriveAmplitude}
                  showValue
                  data-testid="tdse-drive-amplitude"
                />
              </>
            )}
          </div>
        )}
      </>
    )
  }
)

TDSEPotentialControls.displayName = 'TDSEPotentialControls'
