/**
 * Coherence Horizon (coherence-sourced gravity) controls panel.
 *
 * Exposes the decoherence dial δ, cat-state geometry (separation, width,
 * fringe wavenumber), the horizon scale, and the photon-ring / glow gains.
 * Scenario presets live in the shared header ScenarioSelector. Live readouts
 * show the coherence-sourced Tangherlini quantities — horizon radius r_h,
 * photon sphere r_ph, and critical impact parameter b_c — recomputed from the
 * same physics module the GPU packer uses, so the panel numbers always match
 * the rendered scene.
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { COHERENCE_HORIZON_RANGES } from '@/lib/geometry/extended/coherenceHorizon'
import {
  criticalImpactParameter,
  l1BranchCoherence,
  photonSphereRadius,
  tangherliniHorizonRadius,
} from '@/lib/physics/coherenceHorizon'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

const R = COHERENCE_HORIZON_RANGES

/**
 * Controls for the Coherence Horizon quantum mode.
 *
 * @returns The Coherence Horizon control panel
 */
export function CoherenceHorizonControls(): React.ReactElement {
  const dimension = useGeometryStore((s) => s.dimension)

  const config = useExtendedObjectStore((s) => s.schroedinger.coherenceHorizon)
  const { setDecoherence, setSeparation, setWidth, setWaveNumber, setScale, setRingGain, setGlow } =
    useExtendedObjectStore(
      useShallow((s) => ({
        setDecoherence: s.setCoherenceHorizonDecoherence,
        setSeparation: s.setCoherenceHorizonSeparation,
        setWidth: s.setCoherenceHorizonWidth,
        setWaveNumber: s.setCoherenceHorizonWaveNumber,
        setScale: s.setCoherenceHorizonScale,
        setRingGain: s.setCoherenceHorizonRingGain,
        setGlow: s.setCoherenceHorizonGlow,
      }))
    )

  const physics = useMemo(() => {
    const rh = tangherliniHorizonRadius(config.decoherence, config.horizonScale, dimension)
    return {
      coherence: l1BranchCoherence(config.decoherence),
      rh,
      rPh: photonSphereRadius(rh, dimension),
      bc: criticalImpactParameter(rh, dimension),
    }
  }, [config.decoherence, config.horizonScale, dimension])

  const evaporated = physics.rh <= 1e-6

  return (
    <div className="flex flex-col gap-3" data-testid="coherence-horizon-controls">
      {/* Scenario presets live in the shared header ScenarioSelector. */}
      <ControlGroup title="Coherence-Sourced Gravity" data-testid="ch-gravity-group">
        <Slider
          label="Decoherence δ"
          tooltip="Damps only the interference cross term. The horizon radius r_h = scale·(1−δ)^(1/(d−2)) evaporates exactly to zero at δ = 1; the diagonal density is untouched."
          value={config.decoherence}
          onChange={setDecoherence}
          min={R.decoherence.min}
          max={R.decoherence.max}
          step={0.01}
          data-testid="ch-decoherence-slider"
        />
        <Slider
          label="Horizon Scale"
          data-testid="ch-horizon-scale-slider"
          tooltip="Tangherlini horizon radius at full coherence (model-space units)."
          value={config.horizonScale}
          onChange={setScale}
          min={R.horizonScale.min}
          max={R.horizonScale.max}
          step={0.01}
        />
      </ControlGroup>

      <ControlGroup title="Cat State" data-testid="ch-cat-group">
        <Slider
          label="Branch Separation"
          data-testid="ch-separation-slider"
          tooltip="Lobes sit at ±s along the first axis."
          value={config.separation}
          onChange={setSeparation}
          min={R.separation.min}
          max={R.separation.max}
          step={0.01}
        />
        <Slider
          label="Branch Width"
          data-testid="ch-width-slider"
          tooltip="Gaussian width w of each branch."
          value={config.width}
          onChange={setWidth}
          min={R.width.min}
          max={R.width.max}
          step={0.01}
        />
        <Slider
          label="Fringe Wavenumber"
          data-testid="ch-wavenumber-slider"
          tooltip="Interference fringes oscillate as cos(2k·u) between the branches."
          value={config.waveNumber}
          onChange={setWaveNumber}
          min={R.waveNumber.min}
          max={R.waveNumber.max}
          step={0.1}
        />
      </ControlGroup>

      <ControlGroup title="Optics" data-testid="ch-optics-group">
        <Slider
          label="Photon Ring Gain"
          data-testid="ch-ring-gain-slider"
          tooltip="Brightness of the photon-sphere ring (perihelion glow near r_ph)."
          value={config.ringGain}
          onChange={setRingGain}
          min={R.ringGain.min}
          max={R.ringGain.max}
          step={0.05}
        />
        <Slider
          label="Cloud Glow"
          data-testid="ch-glow-slider"
          tooltip="Emission gain of the cat-state cloud."
          value={config.glow}
          onChange={setGlow}
          min={R.glow.min}
          max={R.glow.max}
          step={0.05}
        />
      </ControlGroup>

      <div
        className="text-xs text-secondary flex flex-col gap-0.5"
        data-testid="ch-physics-readout"
      >
        <span>
          Coherence C<sub>l1</sub> = {physics.coherence.toFixed(3)}
        </span>
        {evaporated ? (
          <span>Horizon evaporated — flat spacetime, straight rays</span>
        ) : (
          <span>
            r<sub>h</sub> = {physics.rh.toFixed(3)} · r<sub>ph</sub> = {physics.rPh.toFixed(3)} · b
            <sub>c</sub> = {physics.bc.toFixed(3)}
          </span>
        )}
      </div>
    </div>
  )
}
