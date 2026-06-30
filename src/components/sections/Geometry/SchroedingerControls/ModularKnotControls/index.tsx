/**
 * Modular Knot ("Rademacher Horizon") controls panel.
 *
 * The unit tangent bundle of the modular surface SL₂(ℝ)/SL₂(ℤ) rendered as the
 * trefoil complement in S³ (Ghys): a tangle of closed modular geodesics, each
 * wound |Φ| times in the meridian and colored by its Rademacher invariant Φ =
 * lk(modular knot, trefoil). Exposes the cloud glow, the auto-rotation flow,
 * and the three bake-affecting knobs — the geodesic word-length cap, the
 * geodesic count, and the tube width — that drive the re-baked 3D volume.
 * Scenario presets live in the shared header ScenarioSelector.
 *
 * @module components/sections/Geometry/SchroedingerControls/ModularKnotControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { MODULAR_KNOT_RANGES } from '@/lib/geometry/extended/modularKnot'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const R = MODULAR_KNOT_RANGES

/**
 * Controls for the Modular Knot quantum mode.
 *
 * @returns The Modular Knot control panel
 */
export function ModularKnotControls(): React.ReactElement {
  const config = useExtendedObjectStore((s) => s.schroedinger.modularKnot)
  const { setGlow, setFlow, setMaxLen, setGeodesicCount, setTubeWidth } = useExtendedObjectStore(
    useShallow((s) => ({
      setGlow: s.setModularKnotGlow,
      setFlow: s.setModularKnotFlow,
      setMaxLen: s.setModularKnotMaxLen,
      setGeodesicCount: s.setModularKnotGeodesicCount,
      setTubeWidth: s.setModularKnotTubeWidth,
    }))
  )

  return (
    <div className="flex flex-col gap-3" data-testid="modular-knot-controls">
      {/* Scenario presets live in the shared header ScenarioSelector. */}
      <ControlGroup title="Modular Geodesics" data-testid="mk-geodesics-group">
        <Slider
          label="Geodesic word length"
          tooltip="Maximum {L, R} word length enumerated. Longer words add higher-|Φ| primitive hyperbolic conjugacy classes. Re-bakes the 3D volume."
          value={config.maxLen}
          onChange={setMaxLen}
          min={R.maxLen.min}
          max={R.maxLen.max}
          step={1}
          data-testid="mk-maxlen-slider"
        />
        <Slider
          label="Geodesic count"
          tooltip="Cap on the number of shortest closed modular geodesics splatted as knotted tubes. Re-bakes the 3D volume."
          value={config.geodesicCount}
          onChange={setGeodesicCount}
          min={R.geodesicCount.min}
          max={R.geodesicCount.max}
          step={1}
          data-testid="mk-count-slider"
        />
        <Slider
          label="Tube width"
          tooltip="Gaussian radius (voxel units) of each geodesic tube and the trefoil core. Re-bakes the 3D volume."
          value={config.tubeWidth}
          onChange={setTubeWidth}
          min={R.tubeWidth.min}
          max={R.tubeWidth.max}
          step={0.05}
          data-testid="mk-tube-slider"
        />
      </ControlGroup>

      <ControlGroup title="Appearance" data-testid="mk-appearance-group">
        <Slider
          label="Glow"
          tooltip="Cloud emission gain of the knotted geodesic tangle and trefoil core."
          value={config.glow}
          onChange={setGlow}
          min={R.glow.min}
          max={R.glow.max}
          step={0.05}
          data-testid="mk-glow-slider"
        />
        <Slider
          label="Auto-rotation rate"
          tooltip="Turns the knot around its axis for a continuous 3D read of the linking (render-only)."
          value={config.flow}
          onChange={setFlow}
          min={R.flow.min}
          max={R.flow.max}
          step={0.01}
          data-testid="mk-flow-slider"
        />
      </ControlGroup>
    </div>
  )
}
