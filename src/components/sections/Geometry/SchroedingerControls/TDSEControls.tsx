/**
 * TDSEControls Component
 *
 * Configuration panel for time-dependent Schroedinger equation dynamics.
 * Provides controls for wavepacket initialization, potential selection,
 * drive parameters, absorber boundaries, and numerical settings.
 *
 * @module components/sections/Geometry/SchroedingerControls/TDSEControls
 */

import React, { useCallback, useMemo } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import type { TdseControlsProps } from './types'
import type { TdseInitialCondition, TdseFieldView } from '@/lib/geometry/extended/types'
import { TDSEPotentialControls } from './TDSEPotentialControls'
import {
  AXIS_LABELS,
  TDSE_MAX_TOTAL_SITES,
  ALL_GRID_SIZE_OPTIONS,
  INITIAL_CONDITION_OPTIONS,
  FIELD_VIEW_OPTIONS,
  SCENARIO_PRESET_OPTIONS,
  detectActivePreset,
} from './tdseControlsConstants'

/**
 * TDSE Dynamics configuration panel.
 *
 * @param props - Component props
 * @param props.config - Full Schroedinger config (reads config.tdse sub-object)
 * @param props.dimension - Current geometry dimension
 * @param props.actions - Store setter actions for TDSE config fields
 * @returns React component
 */
export const TDSEControls: React.FC<TdseControlsProps> = React.memo(
  ({ config, dimension, actions }) => {
    const td = config.tdse
    const activePreset = useMemo(() => detectActivePreset(td), [td])

    const handleGridSizeChange = useCallback(
      (dimIdx: number, value: number) => {
        const newGrid = [...td.gridSize]
        newGrid[dimIdx] = value
        actions.setGridSize(newGrid)
      },
      [td.gridSize, actions],
    )

    const handleSpacingChange = useCallback(
      (dimIdx: number, value: number) => {
        const newSpacing = [...td.spacing]
        newSpacing[dimIdx] = value
        actions.setSpacing(newSpacing)
      },
      [td.spacing, actions],
    )

    const handlePacketCenterChange = useCallback(
      (dimIdx: number, value: number) => {
        const newCenter = [...td.packetCenter]
        newCenter[dimIdx] = value
        actions.setPacketCenter(newCenter)
      },
      [td.packetCenter, actions],
    )

    const handlePacketMomentumChange = useCallback(
      (dimIdx: number, value: number) => {
        const newMom = [...td.packetMomentum]
        newMom[dimIdx] = value
        actions.setPacketMomentum(newMom)
      },
      [td.packetMomentum, actions],
    )

    const activeDims = useMemo(() => td.latticeDim, [td.latticeDim])

    // Filter grid options by budget: at high D, large grid sizes exceed TDSE_MAX_TOTAL_SITES
    const maxGridPerDim = useMemo(
      () => Math.floor(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / activeDims)),
      [activeDims],
    )
    const gridSizeOptions = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((o) => parseInt(o.value, 10) <= maxGridPerDim),
      [maxGridPerDim],
    )

    const handlePresetChange = useCallback(
      (value: string) => {
        if (value) actions.applyPreset(value)
      },
      [actions],
    )

    return (
      <div className="space-y-4" data-testid="tdse-controls">
        {/* Scenario Presets */}
        <div className="space-y-3">
          <Select
            label="Scenario"
            options={SCENARIO_PRESET_OPTIONS}
            value={activePreset}
            onChange={handlePresetChange}
            data-testid="tdse-scenario-preset"
          />
        </div>

        {/* Initial Condition */}
        <div className="space-y-3">
          <Select
            label="Initial State"
            options={INITIAL_CONDITION_OPTIONS}
            value={td.initialCondition}
            onChange={(v) => actions.setInitialCondition(v as TdseInitialCondition)}
            data-testid="tdse-initial-condition"
          />
          <Slider
            label="Packet Width"
            min={0.1}
            max={5.0}
            step={0.05}
            value={td.packetWidth}
            onChange={actions.setPacketWidth}
            showValue
            data-testid="tdse-packet-width"
          />
          <Slider
            label="Amplitude"
            min={0.1}
            max={5.0}
            step={0.1}
            value={td.packetAmplitude}
            onChange={actions.setPacketAmplitude}
            showValue
            data-testid="tdse-packet-amplitude"
          />
          {/* Per-axis packet center */}
          {Array.from({ length: activeDims }, (_, d) => (
            <Slider
              key={`center-${d}`}
              label={`Center ${AXIS_LABELS[d]}`}
              min={-10}
              max={10}
              step={0.1}
              value={td.packetCenter[d] ?? 0}
              onChange={(v) => handlePacketCenterChange(d, v)}
              showValue
              data-testid={`tdse-center-${d}`}
            />
          ))}
          {/* Per-axis momentum */}
          {Array.from({ length: activeDims }, (_, d) => (
            <Slider
              key={`momentum-${d}`}
              label={`k${AXIS_LABELS[d]}`}
              min={-10}
              max={10}
              step={0.1}
              value={td.packetMomentum[d] ?? 0}
              onChange={(v) => handlePacketMomentumChange(d, v)}
              showValue
              data-testid={`tdse-momentum-${d}`}
            />
          ))}
        </div>

        <TDSEPotentialControls td={td} activeDims={activeDims} actions={actions} />

        {/* Absorber */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Switch
            label="Absorbing Boundary"
            checked={td.absorberEnabled}
            onCheckedChange={actions.setAbsorberEnabled}
            data-testid="tdse-absorber-enabled"
          />
          {td.absorberEnabled && (
            <>
              <Slider
                label="Absorber Width"
                min={0.05}
                max={0.3}
                step={0.01}
                value={td.absorberWidth}
                onChange={actions.setAbsorberWidth}
                showValue
                data-testid="tdse-absorber-width"
              />
              <Slider
                label="Absorber Strength"
                min={0.1}
                max={10}
                step={0.1}
                value={td.absorberStrength}
                onChange={actions.setAbsorberStrength}
                showValue
                data-testid="tdse-absorber-strength"
              />
            </>
          )}
        </div>

        {/* Display */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Select
            label="Field View"
            options={FIELD_VIEW_OPTIONS}
            value={td.fieldView}
            onChange={(v) => actions.setFieldView(v as TdseFieldView)}
            data-testid="tdse-field-view"
          />
          <Switch
            label="Auto Scale"
            checked={td.autoScale}
            onCheckedChange={actions.setAutoScale}
            data-testid="tdse-auto-scale"
          />
          <Switch
            label="Show Potential"
            checked={td.showPotential}
            onCheckedChange={actions.setShowPotential}
            data-testid="tdse-show-potential"
          />
        </div>

        {/* Numerics */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Slider
            label="Lattice Dim"
            min={1}
            max={Math.min(dimension, 11)}
            step={1}
            value={activeDims}
            onChange={actions.setLatticeDim}
            showValue
            data-testid="tdse-lattice-dim"
          />
          {Array.from({ length: activeDims }, (_, d) => (
            <Select
              key={`grid-${d}`}
              label={`Grid ${AXIS_LABELS[d]}`}
              options={gridSizeOptions}
              value={String(td.gridSize[d] ?? 32)}
              onChange={(v) => handleGridSizeChange(d, Number(v))}
              data-testid={`tdse-grid-${d}`}
            />
          ))}
          {Array.from({ length: activeDims }, (_, d) => (
            <Slider
              key={`spacing-${d}`}
              label={`dx${AXIS_LABELS[d]}`}
              min={0.01}
              max={1.0}
              step={0.01}
              value={td.spacing[d] ?? 0.1}
              onChange={(v) => handleSpacingChange(d, v)}
              showValue
              data-testid={`tdse-spacing-${d}`}
            />
          ))}
          <Slider
            label="Mass"
            min={0.1}
            max={10}
            step={0.1}
            value={td.mass}
            onChange={actions.setMass}
            showValue
            data-testid="tdse-mass"
          />
          <Slider
            label="Reduced Planck Constant (ħ)"
            min={0.01}
            max={10}
            step={0.01}
            value={td.hbar}
            onChange={actions.setHbar}
            showValue
            data-testid="tdse-hbar"
          />
          <Slider
            label="dt"
            min={0.0001}
            max={0.02}
            step={0.0001}
            value={td.dt}
            onChange={actions.setDt}
            showValue
            data-testid="tdse-dt"
          />
          <Slider
            label="Steps/Frame"
            min={1}
            max={16}
            step={1}
            value={td.stepsPerFrame}
            onChange={actions.setStepsPerFrame}
            showValue
            data-testid="tdse-steps-per-frame"
          />
        </div>

        {/* Slice positions for dims > 3 */}
        {activeDims > 3 && (
          <div className="border-t border-border-subtle pt-3 space-y-3">
            {Array.from({ length: activeDims - 3 }, (_, i) => {
              const dimIdx = i + 3
              const halfExtent =
                ((td.gridSize[dimIdx] ?? 64) * (td.spacing[dimIdx] ?? td.spacing[0] ?? 0.1)) / 2
              return (
                <Slider
                  key={`slice-${dimIdx}`}
                  label={`Slice ${AXIS_LABELS[dimIdx]}`}
                  min={-halfExtent}
                  max={halfExtent}
                  step={halfExtent / 20}
                  value={td.slicePositions[i] ?? 0}
                  onChange={(v) => actions.setSlicePosition(i, v)}
                  showValue
                  data-testid={`tdse-slice-${dimIdx}`}
                />
              )
            })}
          </div>
        )}

        {/* Reset */}
        <div className="border-t border-border-subtle pt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={actions.resetField}
            data-testid="tdse-reset"
          >
            Reset Wavefunction
          </Button>
        </div>
      </div>
    )
  },
)

TDSEControls.displayName = 'TDSEControls'
