/**
 * Measurement Controls
 *
 * Born rule measurement UI: toggle, collapse width, partial measurement
 * axis selector, statistics display, and clear button.
 *
 * @module components/sections/Analysis/MeasurementControls
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAnySweepRunning } from '@/hooks/useAnySweepRunning'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useMeasurementStore } from '@/stores/measurementStore'

const DIM_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']

/** Reactive hook for the half-extent of the TDSE lattice grid (world units). */
function useLatticeHalfExtent(): number {
  return useExtendedObjectStore((s) => {
    const tdse = s.schroedinger.tdse
    if (!tdse.gridSize[0] || !tdse.spacing[0]) return 0
    return tdse.gridSize[0] * tdse.spacing[0] * 0.5
  })
}

/** Compute the half-extent imperatively (for callbacks where subscription is not needed). */
function getLatticeHalfExtent(): number {
  const tdse = useExtendedObjectStore.getState().schroedinger.tdse
  if (!tdse.gridSize[0] || !tdse.spacing[0]) return 0
  return tdse.gridSize[0] * tdse.spacing[0] * 0.5
}

/**
 * Born rule measurement controls: enable/disable, collapse width,
 * partial measurement axis, statistics.
 */
export const MeasurementControls: React.FC = React.memo(() => {
  const sweepRunning = useAnySweepRunning()
  const dimension = useGeometryStore((s) => s.dimension)
  const {
    enabled,
    measurements,
    totalCount,
    collapseWidth,
    measureAxis,
    isCollapsing,
    cooldownFrames,
    positionMean,
    positionStd,
    setEnabled,
    setCollapseWidth,
    setMeasureAxis,
    clearMeasurements,
  } = useMeasurementStore(
    useShallow((s) => ({
      enabled: s.enabled,
      measurements: s.measurements,
      totalCount: s.totalCount,
      collapseWidth: s.collapseWidth,
      measureAxis: s.measureAxis,
      isCollapsing: s.isCollapsing,
      cooldownFrames: s.cooldownFrames,
      positionMean: s.positionMean,
      positionStd: s.positionStd,
      setEnabled: s.setEnabled,
      setCollapseWidth: s.setCollapseWidth,
      setMeasureAxis: s.setMeasureAxis,
      clearMeasurements: s.clearMeasurements,
    }))
  )

  const axisOptions = [
    { value: 'full', label: 'All axes' },
    ...Array.from({ length: Math.min(dimension, 11) }, (_, i) => ({
      value: String(i),
      label: `Axis ${DIM_LABELS[i] ?? i}`,
    })),
  ]

  const handleAxisChange = useCallback(
    (v: string) => {
      setMeasureAxis(v === 'full' ? null : parseInt(v, 10))
    },
    [setMeasureAxis]
  )

  // When enabling measurement, set collapse width to ~20% of grid half-extent
  // so the collapsed state is visible within the rendering volume.
  const handleToggle = useCallback(
    (on: boolean) => {
      if (on) {
        const halfExtent = getLatticeHalfExtent()
        if (halfExtent > 0) {
          const width = Math.round(halfExtent * 0.2 * 20) / 20 // round to 0.05 step
          setCollapseWidth(Math.max(0.1, width))
        }
      }
      setEnabled(on)
    },
    [setEnabled, setCollapseWidth]
  )

  // Scale slider max to grid extent so the full range is usable (reactive to grid changes)
  const halfExtent = useLatticeHalfExtent()
  const sliderMax = halfExtent > 0 ? Math.max(2.0, Math.round(halfExtent * 0.6 * 10) / 10) : 2.0

  return (
    <ControlGroup
      title="Measurement"
      collapsible
      defaultOpen={false}
      data-testid="control-group-measurement"
      rightElement={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={sweepRunning}
          tooltip="Enable Born-rule measurement: click the volume to sample from |ψ|² and collapse the wavefunction."
          data-testid="measurement-toggle"
        />
      }
    >
      {enabled && (
        <fieldset
          disabled={sweepRunning}
          className={`space-y-3 transition-opacity border-0 p-0 m-0 min-w-0${sweepRunning ? ' opacity-50' : ''}`}
        >
          <div className="text-xs text-text-tertiary">Click the volume to sample from |psi|^2</div>

          <Slider
            label="Collapse Width"
            tooltip="Width of the post-measurement Gaussian collapse. Smaller values give more localized collapse."
            min={0.05}
            max={sliderMax}
            step={0.05}
            value={collapseWidth}
            onChange={setCollapseWidth}
            showValue
            data-testid="measurement-collapse-width"
          />

          {dimension >= 2 && (
            <Select
              label="Measure Axis"
              tooltip="Full: measure all axes and collapse to a point. Partial: measure one axis, preserving the conditional wavefunction in other dimensions."
              options={axisOptions}
              value={measureAxis === null ? 'full' : String(measureAxis)}
              onChange={handleAxisChange}
              data-testid="measurement-axis"
            />
          )}

          {isCollapsing && (
            <div className="text-xs text-accent-primary animate-pulse">Collapsing...</div>
          )}
          {!isCollapsing && cooldownFrames > 0 && (
            <div className="text-xs text-text-tertiary">Evolving... ({cooldownFrames} frames)</div>
          )}

          <div className="text-xs text-text-secondary">Measurements: {totalCount}</div>

          {measurements.length > 0 && positionMean.length > 0 && (
            <div className="text-xs font-mono space-y-0.5">
              <div className="flex gap-2 text-text-tertiary font-semibold">
                <span className="w-4">d</span>
                <span className="w-16 text-right">mean</span>
                <span className="w-12 text-right">std</span>
              </div>
              {positionMean.map((mean, d) => (
                <div key={d} className="flex gap-2 text-text-secondary">
                  <span className="w-4 text-text-tertiary">{DIM_LABELS[d]}</span>
                  <span className="w-16 text-right">{mean.toFixed(3)}</span>
                  <span className="w-12 text-right">{(positionStd[d] ?? 0).toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearMeasurements}
            data-testid="measurement-clear"
          >
            Clear Measurements
          </Button>
        </fieldset>
      )}
    </ControlGroup>
  )
})

MeasurementControls.displayName = 'MeasurementControls'
