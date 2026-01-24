import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Fractal Render Quality Controls
 * Controls SDF iterations and surface distance for Mandelbulb and Quaternion Julia fractals.
 * These parameters directly control raymarching quality vs performance.
 */
export const FractalRenderQuality: React.FC = React.memo(() => {
  const objectType = useGeometryStore((state) => state.objectType)

  // Mandelbulb selectors
  const mandelbulbSelector = useShallow((state: ExtendedObjectState) => ({
    sdfMaxIterations: state.mandelbulb.sdfMaxIterations,
    sdfSurfaceDistance: state.mandelbulb.sdfSurfaceDistance,
    setSdfMaxIterations: state.setMandelbulbSdfMaxIterations,
    setSdfSurfaceDistance: state.setMandelbulbSdfSurfaceDistance,
  }))

  // Quaternion Julia selectors
  const juliaSelector = useShallow((state: ExtendedObjectState) => ({
    sdfMaxIterations: state.quaternionJulia.sdfMaxIterations,
    sdfSurfaceDistance: state.quaternionJulia.sdfSurfaceDistance,
    setSdfMaxIterations: state.setQuaternionJuliaSdfMaxIterations,
    setSdfSurfaceDistance: state.setQuaternionJuliaSdfSurfaceDistance,
  }))

  const mandelbulbState = useExtendedObjectStore(mandelbulbSelector)
  const juliaState = useExtendedObjectStore(juliaSelector)

  // Select appropriate state based on object type
  const state = objectType === 'mandelbulb' ? mandelbulbState : juliaState
  const testIdPrefix = objectType === 'mandelbulb' ? 'mandelbulb' : 'julia'

  return (
    <ControlGroup title="Render Quality" collapsible defaultOpen>
      <Slider
        label="SDF Iterations"
        min={5}
        max={100}
        step={1}
        value={state.sdfMaxIterations}
        onChange={state.setSdfMaxIterations}
        showValue
        data-testid={`${testIdPrefix}-sdf-max-iterations`}
      />
      <Slider
        label="Surface Distance"
        min={0.00005}
        max={0.01}
        step={0.00005}
        value={state.sdfSurfaceDistance}
        onChange={state.setSdfSurfaceDistance}
        showValue
        data-testid={`${testIdPrefix}-sdf-surface-distance`}
      />
      <p className="text-xs text-text-tertiary">
        Higher iterations and lower surface distance = better quality but slower
      </p>
    </ControlGroup>
  )
})

FractalRenderQuality.displayName = 'FractalRenderQuality'
