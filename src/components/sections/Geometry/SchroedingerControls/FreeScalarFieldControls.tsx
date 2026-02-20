/**
 * FreeScalarFieldControls Component
 *
 * Controls for configuring the free Klein-Gordon scalar field lattice simulation.
 * Provides lattice setup, initial condition selection, and field view controls.
 */

import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { FreeScalarFieldView, FreeScalarInitialCondition } from '@/lib/geometry/extended/types'
import React, { useCallback, useMemo } from 'react'
import type { FreeScalarFieldControlsProps } from './types'

/** Power-of-2 grid size options for exact vacuum mode */
const POWER_OF_2_GRID_OPTIONS = [
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

/**
 * FreeScalarFieldControls component
 *
 * Provides controls for Klein-Gordon scalar field simulation:
 * - Lattice dimensionality and grid size
 * - Mass parameter, time step, steps per frame
 * - Initial condition selection with mode-specific parameters
 * - Field view selection (phi, pi, energy density)
 *
 * @param props - Component props
 * @param props.config - Full Schroedinger config containing freeScalar sub-config
 * @param props.actions - Store action callbacks
 * @returns React component
 */
export const FreeScalarFieldControls: React.FC<FreeScalarFieldControlsProps> = React.memo(
  ({ config, actions }) => {
    const fs = config.freeScalar

    const {
      setLatticeDim,
      setGridSize,
      setSpacing,
      setMass,
      setDt,
      setStepsPerFrame,
      setInitialCondition,
      setFieldView,
      setPacketCenter,
      setPacketWidth,
      setPacketAmplitude,
      setModeK,
      setAutoScale,
      setVacuumSeed,
      resetField,
    } = actions

    const isVacuum = fs.initialCondition === 'vacuumNoise'

    // Lattice dimension options
    const latticeDimOptions = useMemo(
      () => [
        { value: '1', label: '1D' },
        { value: '2', label: '2D' },
        { value: '3', label: '3D' },
      ],
      []
    )

    // Initial condition options
    const initConditionOptions = useMemo(
      () => [
        { value: 'vacuumNoise', label: 'Exact Vacuum' },
        { value: 'singleMode', label: 'Single Mode' },
        { value: 'gaussianPacket', label: 'Gaussian Packet' },
      ],
      []
    )

    // Field view options
    const fieldViewOptions = useMemo(
      () => [
        { value: 'phi', label: '\u03C6' },
        { value: 'pi', label: '\u03C0' },
        { value: 'energyDensity', label: '\u03B5' },
      ],
      []
    )

    // Grid size handler — uniform grid for all active dimensions
    const handleGridSize = useCallback(
      (size: number) => {
        const s = Math.round(size)
        const gs: [number, number, number] = [
          s,
          fs.latticeDim >= 2 ? s : 1,
          fs.latticeDim >= 3 ? s : 1,
        ]
        setGridSize(gs)
      },
      [fs.latticeDim, setGridSize]
    )

    // Power-of-2 grid size handler for vacuum mode (from Select)
    const handlePow2GridSize = useCallback(
      (v: string) => {
        const s = Number(v)
        const gs: [number, number, number] = [
          s,
          fs.latticeDim >= 2 ? s : 1,
          fs.latticeDim >= 3 ? s : 1,
        ]
        setGridSize(gs)
      },
      [fs.latticeDim, setGridSize]
    )

    const handleLatticeDim = useCallback(
      (v: string) => {
        setLatticeDim(Number(v) as 1 | 2 | 3)
      },
      [setLatticeDim]
    )

    const handleInitCondition = useCallback(
      (v: string) => {
        setInitialCondition(v as FreeScalarInitialCondition)
      },
      [setInitialCondition]
    )

    const handleFieldView = useCallback(
      (v: string) => {
        setFieldView(v as FreeScalarFieldView)
      },
      [setFieldView]
    )

    // Mode K handlers — individual axis
    const handleModeKx = useCallback(
      (v: number) => setModeK([Math.round(v), fs.modeK[1], fs.modeK[2]]),
      [fs.modeK, setModeK]
    )
    const handleModeKy = useCallback(
      (v: number) => setModeK([fs.modeK[0], Math.round(v), fs.modeK[2]]),
      [fs.modeK, setModeK]
    )
    const handleModeKz = useCallback(
      (v: number) => setModeK([fs.modeK[0], fs.modeK[1], Math.round(v)]),
      [fs.modeK, setModeK]
    )

    // Spacing handler — uniform spacing for all active dimensions
    const handleSpacing = useCallback(
      (v: number) => {
        const s: [number, number, number] = [
          v,
          fs.latticeDim >= 2 ? v : fs.spacing[1],
          fs.latticeDim >= 3 ? v : fs.spacing[2],
        ]
        setSpacing(s)
      },
      [fs.latticeDim, fs.spacing, setSpacing]
    )

    // Packet center handlers — individual axis
    const handleCenterX = useCallback(
      (v: number) => setPacketCenter([v, fs.packetCenter[1], fs.packetCenter[2]]),
      [fs.packetCenter, setPacketCenter]
    )
    const handleCenterY = useCallback(
      (v: number) => setPacketCenter([fs.packetCenter[0], v, fs.packetCenter[2]]),
      [fs.packetCenter, setPacketCenter]
    )
    const handleCenterZ = useCallback(
      (v: number) => setPacketCenter([fs.packetCenter[0], fs.packetCenter[1], v]),
      [fs.packetCenter, setPacketCenter]
    )

    // Vacuum seed randomize
    const handleRandomizeSeed = useCallback(() => {
      setVacuumSeed(Math.floor(Math.random() * 2147483647))
    }, [setVacuumSeed])

    const activeGridSize = fs.gridSize[0]

    return (
      <div className="space-y-4">
        {/* Lattice Setup */}
        <div className="space-y-3">
          <ToggleGroup
            options={latticeDimOptions}
            value={String(fs.latticeDim)}
            onChange={handleLatticeDim}
            ariaLabel="Lattice dimensionality"
            data-testid="lattice-dim-selector"
          />
          {isVacuum ? (
            <Select
              label="Grid Size"
              options={POWER_OF_2_GRID_OPTIONS}
              value={String(activeGridSize)}
              onChange={handlePow2GridSize}
              data-testid="grid-size-select"
            />
          ) : (
            <Slider
              label="Grid Size"
              min={8}
              max={128}
              step={8}
              value={activeGridSize}
              onChange={handleGridSize}
              showValue
              data-testid="grid-size-slider"
            />
          )}
          <Slider
            label="Spacing (a)"
            min={0.01}
            max={1.0}
            step={0.01}
            value={fs.spacing[0]}
            onChange={handleSpacing}
            showValue
            data-testid="spacing-slider"
          />
          <Slider
            label="Mass (m)"
            min={0.0}
            max={10.0}
            step={0.1}
            value={fs.mass}
            onChange={setMass}
            showValue
            data-testid="mass-slider"
          />
          <Slider
            label="Time Step (dt)"
            min={0.001}
            max={0.1}
            step={0.001}
            value={fs.dt}
            onChange={setDt}
            showValue
            data-testid="dt-slider"
          />
          <Slider
            label="Steps / Frame"
            min={1}
            max={16}
            step={1}
            value={fs.stepsPerFrame}
            onChange={setStepsPerFrame}
            showValue
            data-testid="steps-per-frame-slider"
          />
        </div>

        {/* Initial Condition */}
        <div className="space-y-3 border-t border-border-subtle pt-3">
          <Select
            label="Initial Condition"
            options={initConditionOptions}
            value={fs.initialCondition}
            onChange={handleInitCondition}
            data-testid="init-condition-select"
          />

          {isVacuum && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <NumberInput
                  label="Seed"
                  value={fs.vacuumSeed}
                  onChange={setVacuumSeed}
                  min={0}
                  max={2147483647}
                  step={1}
                  data-testid="vacuum-seed-input"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRandomizeSeed}
                  data-testid="randomize-seed-button"
                >
                  Randomize
                </Button>
              </div>
            </div>
          )}

          {!isVacuum && (
            <Slider
              label="Amplitude"
              min={0.1}
              max={5.0}
              step={0.1}
              value={fs.packetAmplitude}
              onChange={setPacketAmplitude}
              showValue
              data-testid="amplitude-slider"
            />
          )}

          {fs.initialCondition === 'singleMode' && (
            <div className="space-y-2">
              <Slider
                label="k_x"
                min={-8}
                max={8}
                step={1}
                value={fs.modeK[0]}
                onChange={handleModeKx}
                showValue
              />
              {fs.latticeDim >= 2 && (
                <Slider
                  label="k_y"
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[1]}
                  onChange={handleModeKy}
                  showValue
                />
              )}
              {fs.latticeDim >= 3 && (
                <Slider
                  label="k_z"
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[2]}
                  onChange={handleModeKz}
                  showValue
                />
              )}
            </div>
          )}

          {fs.initialCondition === 'gaussianPacket' && (
            <div className="space-y-2">
              <Slider
                label="Packet Width (\u03C3)"
                min={0.05}
                max={2.0}
                step={0.05}
                value={fs.packetWidth}
                onChange={setPacketWidth}
                showValue
              />
              <Slider
                label="Center x"
                min={-5.0}
                max={5.0}
                step={0.1}
                value={fs.packetCenter[0]}
                onChange={handleCenterX}
                showValue
              />
              {fs.latticeDim >= 2 && (
                <Slider
                  label="Center y"
                  min={-5.0}
                  max={5.0}
                  step={0.1}
                  value={fs.packetCenter[1]}
                  onChange={handleCenterY}
                  showValue
                />
              )}
              {fs.latticeDim >= 3 && (
                <Slider
                  label="Center z"
                  min={-5.0}
                  max={5.0}
                  step={0.1}
                  value={fs.packetCenter[2]}
                  onChange={handleCenterZ}
                  showValue
                />
              )}
              <Slider
                label="k_x"
                min={-8}
                max={8}
                step={1}
                value={fs.modeK[0]}
                onChange={handleModeKx}
                showValue
              />
              {fs.latticeDim >= 2 && (
                <Slider
                  label="k_y"
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[1]}
                  onChange={handleModeKy}
                  showValue
                />
              )}
              {fs.latticeDim >= 3 && (
                <Slider
                  label="k_z"
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[2]}
                  onChange={handleModeKz}
                  showValue
                />
              )}
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={resetField}
            data-testid="reset-field-button"
          >
            Reset Field
          </Button>
        </div>

        {/* Field View */}
        <div className="space-y-3 border-t border-border-subtle pt-3">
          <ToggleGroup
            options={fieldViewOptions}
            value={fs.fieldView}
            onChange={handleFieldView}
            ariaLabel="Field view"
            data-testid="field-view-selector"
          />
          <Switch
            label="Auto-Scale"
            checked={fs.autoScale}
            onCheckedChange={setAutoScale}
            data-testid="auto-scale-switch"
          />
        </div>
      </div>
    )
  }
)

FreeScalarFieldControls.displayName = 'FreeScalarFieldControls'
