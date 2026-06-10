/**
 * Hilbert–Pólya Spectrum controls panel.
 *
 * Exposes the spectral window upper bound zMax (Re z ∈ [5, zMax]), the Im z
 * half-extent of the volume, the Gaussian filament half-width, the filament
 * emission gain, the cancellation-veil fog gain, and the critical-plane
 * marker toggle at Im z = 0. Scenario presets live in the shared header
 * ScenarioSelector. The θ contour-rotation axis is the third volume axis —
 * flying along it lifts the Matsubara veil and crystallizes the zero
 * filaments.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { HILBERT_POLYA_RANGES } from '@/lib/geometry/extended/hilbertPolya'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const R = HILBERT_POLYA_RANGES

/**
 * Controls for the Hilbert–Pólya Spectrum quantum mode.
 *
 * @returns The Hilbert–Pólya control panel
 */
export function HilbertPolyaControls(): React.ReactElement {
  const config = useExtendedObjectStore((s) => s.schroedinger.hilbertPolya)
  const { setZMax, setYExtent, setFilamentWidth, setGlow, setFogGain, setPlaneMarker } =
    useExtendedObjectStore(
      useShallow((s) => ({
        setZMax: s.setHilbertPolyaZMax,
        setYExtent: s.setHilbertPolyaYExtent,
        setFilamentWidth: s.setHilbertPolyaFilamentWidth,
        setGlow: s.setHilbertPolyaGlow,
        setFogGain: s.setHilbertPolyaFogGain,
        setPlaneMarker: s.setHilbertPolyaPlaneMarker,
      }))
    )

  return (
    <div className="flex flex-col gap-3" data-testid="hilbert-polya-controls">
      {/* Scenario presets live in the shared header ScenarioSelector. */}
      <ControlGroup title="Spectral Window" data-testid="hp-window-group">
        <Slider
          label="Window z max"
          tooltip="Upper Re z bound of the spectral window [5, zMax]. Larger windows show more zero filaments but thin the per-zero resolution of the volume LUT."
          value={config.zMax}
          onChange={setZMax}
          min={R.zMax.min}
          max={R.zMax.max}
          step={5}
          data-testid="hp-zmax-slider"
        />
        <Slider
          label="Im z extent"
          tooltip="Half-extent of the Im z axis. The Riemann Hypothesis says every spectral filament is pinned to Im z = 0; the eta-prefactor comb sits at Im z = −1/2."
          value={config.yExtent}
          onChange={setYExtent}
          min={R.yExtent.min}
          max={R.yExtent.max}
          step={0.05}
          data-testid="hp-yextent-slider"
        />
      </ControlGroup>

      <ControlGroup title="Filaments" data-testid="hp-filament-group">
        <Slider
          label="Filament width"
          tooltip="Gaussian half-width of each zero filament in Re z units. Narrower filaments sharpen the spectrum but demand more LUT resolution."
          value={config.filamentWidth}
          onChange={setFilamentWidth}
          min={R.filamentWidth.min}
          max={R.filamentWidth.max}
          step={0.01}
          data-testid="hp-filament-width-slider"
        />
        <Slider
          label="Filament glow"
          tooltip="Emission gain of the zero filaments."
          value={config.glow}
          onChange={setGlow}
          min={R.glow.min}
          max={R.glow.max}
          step={0.05}
          data-testid="hp-glow-slider"
        />
      </ControlGroup>

      <ControlGroup title="Veil and Markers" data-testid="hp-veil-group">
        <Slider
          label="Veil fog"
          tooltip="Emission gain of the double-precision cancellation fog (the Matsubara veil) that hides the zeros at θ ≈ 0."
          value={config.fogGain}
          onChange={setFogGain}
          min={R.fogGain.min}
          max={R.fogGain.max}
          step={0.05}
          data-testid="hp-fog-slider"
        />
        <Switch
          label="Critical-plane marker"
          tooltip="Faint marker plane at Im z = 0 — the critical line where every filament should sit if the Riemann Hypothesis holds (render-only)."
          checked={config.planeMarker}
          onCheckedChange={setPlaneMarker}
          data-testid="hp-plane-marker-switch"
        />
      </ControlGroup>
    </div>
  )
}
