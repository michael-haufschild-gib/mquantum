/**
 * Bifurcation Horizon controls panel.
 *
 * The Riemann critical strip rendered as the maximally-extended (Kruskal)
 * eternal black hole. Exposes the neck radius r₀ (the Einstein–Rosen-bridge
 * bifurcation surface), the throat-membrane width, the cloud glow, the Tomita
 * modular dilation flow + azimuthal swirl, the extremal redshift core r_h, the
 * off-line ring displacement (the ¬RH symmetry-breaking knob), the phase
 * winding along the throat, and the KMS thermal-wedge haze gain. Scenario
 * presets live in the shared header ScenarioSelector. A live readout reports
 * whether the spectrum is pinned on-line (RH) or displaced off the throat.
 *
 * @module components/sections/Geometry/SchroedingerControls/BifurcationHorizonControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { BIFURCATION_HORIZON_RANGES } from '@/lib/geometry/extended/bifurcationHorizon'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const R = BIFURCATION_HORIZON_RANGES

/** On-line displacement below which the spectrum is pinned to the throat. */
const ON_LINE_EPS = 1e-6

/**
 * Controls for the Bifurcation Horizon quantum mode.
 *
 * @returns The Bifurcation Horizon control panel
 */
export function BifurcationHorizonControls(): React.ReactElement {
  const config = useExtendedObjectStore((s) => s.schroedinger.bifurcationHorizon)
  const {
    setNeckRadius,
    setThroatWidth,
    setGlow,
    setFlowRate,
    setSwirl,
    setRedshiftRadius,
    setOffLine,
    setWinding,
    setThermalGain,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      setNeckRadius: s.setBifurcationHorizonNeckRadius,
      setThroatWidth: s.setBifurcationHorizonThroatWidth,
      setGlow: s.setBifurcationHorizonGlow,
      setFlowRate: s.setBifurcationHorizonFlowRate,
      setSwirl: s.setBifurcationHorizonSwirl,
      setRedshiftRadius: s.setBifurcationHorizonRedshiftRadius,
      setOffLine: s.setBifurcationHorizonOffLine,
      setWinding: s.setBifurcationHorizonWinding,
      setThermalGain: s.setBifurcationHorizonThermalGain,
    }))
  )

  const onLine = config.offLine < ON_LINE_EPS

  return (
    <div className="flex flex-col gap-3" data-testid="bifurcation-horizon-controls">
      {/* Scenario presets live in the shared header ScenarioSelector. */}
      <ControlGroup title="Bifurcation Throat" data-testid="bh-throat-group">
        <Slider
          label="Neck radius r₀"
          tooltip="The Einstein–Rosen-bridge throat radius (× R_bound): the critical-line bifurcation surface where the two Kruskal wedges meet."
          value={config.neckRadius}
          onChange={setNeckRadius}
          min={R.neckRadius.min}
          max={R.neckRadius.max}
          step={0.01}
          data-testid="bh-neck-slider"
        />
        <Slider
          label="Throat width"
          tooltip="Gaussian half-width of the throat membrane — the glow envelope around the bifurcation surface."
          value={config.throatWidth}
          onChange={setThroatWidth}
          min={R.throatWidth.min}
          max={R.throatWidth.max}
          step={0.01}
          data-testid="bh-throat-slider"
        />
        <Slider
          label="Glow"
          tooltip="Cloud emission gain of the throat and ζ-zero rings."
          value={config.glow}
          onChange={setGlow}
          min={R.glow.min}
          max={R.glow.max}
          step={0.05}
          data-testid="bh-glow-slider"
        />
      </ControlGroup>

      <ControlGroup title="Modular Flow" data-testid="bh-modular-group">
        <Slider
          label="Modular flow rate"
          tooltip="Tomita–Takesaki modular flow: the wedge dilation streams the ζ-zero rings along the throat coordinate u = log(rPerp/r₀) (render-only)."
          value={config.flowRate}
          onChange={setFlowRate}
          min={R.flowRate.min}
          max={R.flowRate.max}
          step={0.01}
          data-testid="bh-flow-slider"
        />
        <Slider
          label="Azimuthal swirl"
          tooltip="Rotates the wedge hue with time around the throat axis (render-only)."
          value={config.swirl}
          onChange={setSwirl}
          min={R.swirl.min}
          max={R.swirl.max}
          step={0.01}
          data-testid="bh-swirl-slider"
        />
        <Slider
          label="Phase winding"
          tooltip="Phase winding of the ζ-zero rings along the throat."
          value={config.winding}
          onChange={setWinding}
          min={R.winding.min}
          max={R.winding.max}
          step={0.05}
          data-testid="bh-winding-slider"
        />
      </ControlGroup>

      <ControlGroup title="Wedges and Symmetry" data-testid="bh-wedge-group">
        <Slider
          label="Extremal core r_h"
          tooltip="Captured dark core at the extremal radius r_h with Tangherlini √f redshift; 0 disables the core."
          value={config.redshiftRadius}
          onChange={setRedshiftRadius}
          min={R.redshiftRadius.min}
          max={R.redshiftRadius.max}
          step={0.01}
          data-testid="bh-rs-slider"
        />
        <Slider
          label="Thermal-wedge gain"
          tooltip="KMS thermal-wedge haze gain — the faint atmosphere filling the two Kruskal wedges."
          value={config.thermalGain}
          onChange={setThermalGain}
          min={R.thermalGain.min}
          max={R.thermalGain.max}
          step={0.01}
          data-testid="bh-therm-slider"
        />
        <Slider
          label="Off-line displacement (¬RH)"
          tooltip="Displaces the ζ-zero rings off the throat, breaking the Tomita modular conjugation J (the wedge reflection u ↦ −u). 0 = the on-line RH case; > 0 is the Riemann-hypothesis-violating view."
          value={config.offLine}
          onChange={setOffLine}
          min={R.offLine.min}
          max={R.offLine.max}
          step={0.01}
          data-testid="bh-off-slider"
        />
      </ControlGroup>

      <div className="text-xs text-secondary flex flex-col gap-0.5" data-testid="bh-readout">
        <span>
          {onLine
            ? 'On-line (RH): spectrum pinned to the bifurcation surface'
            : `Off-line δu = ${config.offLine.toFixed(2)}: mirror symmetry broken (¬RH)`}
        </span>
      </div>
    </div>
  )
}
