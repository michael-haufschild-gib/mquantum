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
import type {
  TdseInitialCondition,
  TdsePotentialType,
  TdseDriveWaveform,
  TdseFieldView,
} from '@/lib/geometry/extended/types'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/** Power-of-2 grid sizes required by Stockham FFT */
const GRID_SIZE_OPTIONS = [
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

const INITIAL_CONDITION_OPTIONS = [
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'planeWave', label: 'Plane Wave' },
  { value: 'superposition', label: 'Superposition' },
]

const POTENTIAL_TYPE_OPTIONS = [
  { value: 'free', label: 'Free (V=0)' },
  { value: 'barrier', label: 'Barrier' },
  { value: 'step', label: 'Step' },
  { value: 'finiteWell', label: 'Finite Well' },
  { value: 'harmonicTrap', label: 'Harmonic Trap' },
  { value: 'driven', label: 'Driven' },
]

const DRIVE_WAVEFORM_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'pulse', label: 'Gaussian Pulse' },
  { value: 'chirp', label: 'Chirp' },
]

const FIELD_VIEW_OPTIONS = [
  { value: 'density', label: 'Density |ψ|²' },
  { value: 'phase', label: 'Phase arg(ψ)' },
  { value: 'current', label: 'Current |j|' },
  { value: 'potential', label: 'Potential V(x)' },
]

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

    const showBarrierControls = td.potentialType === 'barrier' || td.potentialType === 'driven'
    const showWellControls = td.potentialType === 'finiteWell'
    const showHarmonicControls = td.potentialType === 'harmonicTrap'
    const showStepControls = td.potentialType === 'step'
    const showDriveControls = td.potentialType === 'driven'

    return (
      <div className="space-y-4" data-testid="tdse-controls">
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

        {/* Potential */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Select
            label="Potential"
            options={POTENTIAL_TYPE_OPTIONS}
            value={td.potentialType}
            onChange={(v) => actions.setPotentialType(v as TdsePotentialType)}
            data-testid="tdse-potential-type"
          />

          {showBarrierControls && (
            <>
              <Slider
                label="Barrier Height"
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
              min={0.01}
              max={10}
              step={0.01}
              value={td.harmonicOmega}
              onChange={actions.setHarmonicOmega}
              showValue
              data-testid="tdse-harmonic-omega"
            />
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
                  label="Frequency"
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
              options={GRID_SIZE_OPTIONS}
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
            max={0.1}
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

        {/* Diagnostics */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Switch
            label="Diagnostics"
            checked={td.diagnosticsEnabled}
            onCheckedChange={actions.setDiagnosticsEnabled}
            data-testid="tdse-diagnostics-enabled"
          />
          {td.diagnosticsEnabled && (
            <Slider
              label="Diagnostics Interval (frames)"
              min={1}
              max={60}
              step={1}
              value={td.diagnosticsInterval}
              onChange={actions.setDiagnosticsInterval}
              showValue
              data-testid="tdse-diagnostics-interval"
            />
          )}
        </div>

        {/* Slice positions for dims > 3 */}
        {activeDims > 3 && (
          <div className="border-t border-border-subtle pt-3 space-y-3">
            {Array.from({ length: activeDims - 3 }, (_, i) => {
              const dimIdx = i + 3
              return (
                <Slider
                  key={`slice-${dimIdx}`}
                  label={`Slice ${AXIS_LABELS[dimIdx]}`}
                  min={-5}
                  max={5}
                  step={0.1}
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
