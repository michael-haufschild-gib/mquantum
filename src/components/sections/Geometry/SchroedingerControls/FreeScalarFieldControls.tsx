/**
 * FreeScalarFieldControls Component
 *
 * Controls for configuring the free Klein-Gordon scalar field lattice simulation.
 * Supports N-dimensional lattices (1-11D) driven by the global dimension selector.
 * Provides lattice setup, initial condition selection, slice position controls
 * for extra dimensions (d>3), field view controls, and k-space visualization settings.
 */

import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type {
  FreeScalarFieldView,
  FreeScalarInitialCondition,
  KSpaceDisplayMode,
  KSpaceExposureMode,
} from '@/lib/geometry/extended/types'
import React, { useCallback, useMemo } from 'react'
import type { FreeScalarFieldControlsProps } from './types'

/** Power-of-2 grid size options for exact vacuum mode */
const POWER_OF_2_GRID_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

/** Dimension axis labels */
const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']

/** Max total lattice sites for memory budget (~8MB for phi+pi buffers) */
const MAX_TOTAL_SITES = 1048576

/** k-Space display mode toggle options */
const KSPACE_DISPLAY_MODE_OPTIONS = [
  { value: 'raw3d', label: 'Raw 3D' },
  { value: 'radial3d', label: 'Radial 3D' },
]

/** k-Space exposure mode toggle options */
const KSPACE_EXPOSURE_MODE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
]

/**
 * FreeScalarFieldControls component
 *
 * Provides controls for Klein-Gordon scalar field simulation:
 * - Lattice dimension info (driven by global dimension selector)
 * - Grid size, mass parameter, time step, steps per frame
 * - Initial condition selection with mode-specific parameters
 * - Slice position controls for extra dimensions (d > 3)
 * - Field view selection (phi, pi, energy density)
 * - Memory budget display
 * - k-Space visualization transforms (when algorithm 15 is active)
 *
 * @param props - Component props
 * @param props.config - Full Schroedinger config containing freeScalar sub-config
 * @param props.dimension - Current global dimension (drives latticeDim)
 * @param props.actions - Store action callbacks
 * @param props.colorAlgorithm - Current color algorithm index
 * @returns React component
 */
export const FreeScalarFieldControls: React.FC<FreeScalarFieldControlsProps> = React.memo(
  ({ config, dimension: _dimension, actions, colorAlgorithm }) => {
    const fs = config.freeScalar
    const kv = fs.kSpaceViz

    const {
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
      setSlicePosition,
      resetField,
      setKSpaceDisplayMode,
      setKSpaceFftShift,
      setKSpaceExposureMode,
      setKSpaceLowPercentile,
      setKSpaceHighPercentile,
      setKSpaceGamma,
      setKSpaceBroadeningEnabled,
      setKSpaceBroadeningRadius,
      setKSpaceBroadeningSigma,
      setKSpaceRadialBinCount,
    } = actions

    const isVacuum = fs.initialCondition === 'vacuumNoise'
    const latticeDim = fs.latticeDim
    const isKSpaceActive = colorAlgorithm === 'kSpaceOccupation'

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

    // Power-of-2 grid size handler (from Select)
    const handlePow2GridSize = useCallback(
      (v: string) => {
        const s = Number(v)
        const gs = Array.from({ length: latticeDim }, (_, d) => (d < latticeDim ? s : 1))
        setGridSize(gs)
      },
      [latticeDim, setGridSize]
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

    // Mode K handler for a specific dimension
    const handleModeK = useCallback(
      (dimIdx: number, v: number) => {
        const newK = [...fs.modeK]
        newK[dimIdx] = Math.round(v)
        setModeK(newK)
      },
      [fs.modeK, setModeK]
    )

    // Spacing handler — uniform spacing for all active dimensions
    const handleSpacing = useCallback(
      (v: number) => {
        const s = Array.from({ length: latticeDim }, () => v)
        setSpacing(s)
      },
      [latticeDim, setSpacing]
    )

    // Packet center handler for a specific dimension
    const handlePacketCenter = useCallback(
      (dimIdx: number, v: number) => {
        const newCenter = [...fs.packetCenter]
        newCenter[dimIdx] = v
        setPacketCenter(newCenter)
      },
      [fs.packetCenter, setPacketCenter]
    )

    // Vacuum seed randomize
    const handleRandomizeSeed = useCallback(() => {
      setVacuumSeed(Math.floor(Math.random() * 2147483647))
    }, [setVacuumSeed])

    // k-Space display mode handler
    const handleKSpaceDisplayMode = useCallback(
      (v: string) => setKSpaceDisplayMode(v as KSpaceDisplayMode),
      [setKSpaceDisplayMode]
    )

    // k-Space exposure mode handler
    const handleKSpaceExposureMode = useCallback(
      (v: string) => setKSpaceExposureMode(v as KSpaceExposureMode),
      [setKSpaceExposureMode]
    )

    const activeGridSize = fs.gridSize[0] ?? 16

    // Compute memory estimate
    const totalSites = useMemo(() => {
      let sites = 1
      for (let d = 0; d < latticeDim; d++) {
        sites *= fs.gridSize[d] ?? 1
      }
      return sites
    }, [fs.gridSize, latticeDim])

    const memoryKB = Math.round((totalSites * 2 * 4) / 1024)

    // Max grid size for current dimension (budget cap)
    const maxGridPerDim = useMemo(() => {
      const raw = Math.floor(Math.pow(MAX_TOTAL_SITES, 1 / latticeDim))
      // Round down to nearest power-of-2 to match store logic and dropdown options
      const pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
      return Math.max(2, Math.min(128, pow2))
    }, [latticeDim])

    // Filter power-of-2 options by budget
    const filteredPow2Options = useMemo(
      () => POWER_OF_2_GRID_OPTIONS.filter((opt) => Number(opt.value) <= maxGridPerDim),
      [maxGridPerDim]
    )

    return (
      <div className="space-y-4">
        {/* Lattice Info */}
        <div className="space-y-3">
          <div className="text-xs text-text-secondary">
            Lattice: {latticeDim}D (set via dimension selector)
          </div>
          {latticeDim <= 2 && (
            <div className="text-xs text-text-secondary/70 italic">
              Rendered as 3D volume (2D data extruded along z-axis)
            </div>
          )}

          <Select
            label="Grid Size"
            options={filteredPow2Options}
            value={String(activeGridSize)}
            onChange={handlePow2GridSize}
            data-testid="grid-size-select"
          />
          <Slider
            label="Spacing (a)"
            min={0.01}
            max={1.0}
            step={0.01}
            value={fs.spacing[0] ?? 0.1}
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

          {/* Memory budget display */}
          <div className="text-xs text-text-tertiary">
            {totalSites.toLocaleString()} sites ({maxGridPerDim}^{latticeDim} max) · {memoryKB} KB
          </div>
        </div>

        {/* Slice Positions for extra dimensions (d > 3) */}
        {latticeDim > 3 && (
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <div className="text-xs text-text-secondary font-medium">
              Extra-Dimension Slice
            </div>
            {Array.from({ length: latticeDim - 3 }, (_, i) => {
              const dimIdx = i + 3
              const halfExtent =
                ((fs.gridSize[dimIdx] ?? 4) * (fs.spacing[dimIdx] ?? fs.spacing[0] ?? 0.1)) / 2
              return (
                <Slider
                  key={`slice-${dimIdx}`}
                  label={`${AXIS_LABELS[dimIdx] ?? `d${dimIdx}`} slice`}
                  min={-halfExtent}
                  max={halfExtent}
                  step={halfExtent / 20}
                  value={fs.slicePositions[i] ?? 0}
                  onChange={(v) => setSlicePosition(i, v)}
                  showValue
                />
              )
            })}
          </div>
        )}

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
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`modeK-${d}`}
                  label={`k_${AXIS_LABELS[d] ?? d}`}
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[d] ?? 0}
                  onChange={(v) => handleModeK(d, v)}
                  showValue
                />
              ))}
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
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`center-${d}`}
                  label={`Center ${AXIS_LABELS[d] ?? d}`}
                  min={-5.0}
                  max={5.0}
                  step={0.1}
                  value={fs.packetCenter[d] ?? 0}
                  onChange={(v) => handlePacketCenter(d, v)}
                  showValue
                />
              ))}
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`modeK-${d}`}
                  label={`k_${AXIS_LABELS[d] ?? d}`}
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[d] ?? 0}
                  onChange={(v) => handleModeK(d, v)}
                  showValue
                />
              ))}
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

        {/* k-Space Visualization (only when algorithm 15 is active) */}
        {isKSpaceActive && (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <div className="text-xs text-text-secondary font-medium">
              k-Space Visualization
            </div>

            <ToggleGroup
              options={KSPACE_DISPLAY_MODE_OPTIONS}
              value={kv.displayMode}
              onChange={handleKSpaceDisplayMode}
              ariaLabel="Display mode"
              data-testid="kspace-display-mode"
            />

            <Switch
              label="Center Low |k|"
              checked={kv.fftShiftEnabled}
              onCheckedChange={setKSpaceFftShift}
              data-testid="kspace-fft-shift"
            />

            {/* Exposure */}
            <div className="space-y-2 ps-3 border-s border-border-subtle">
              <div className="text-xs text-text-tertiary">Exposure</div>
              <ToggleGroup
                options={KSPACE_EXPOSURE_MODE_OPTIONS}
                value={kv.exposureMode}
                onChange={handleKSpaceExposureMode}
                ariaLabel="Exposure mode"
                data-testid="kspace-exposure-mode"
              />
              <Slider
                label="Low %"
                min={0}
                max={99}
                step={0.5}
                value={kv.lowPercentile}
                onChange={setKSpaceLowPercentile}
                showValue
                data-testid="kspace-low-percentile"
              />
              <Slider
                label="High %"
                min={1}
                max={100}
                step={0.5}
                value={kv.highPercentile}
                onChange={setKSpaceHighPercentile}
                showValue
                data-testid="kspace-high-percentile"
              />
              <Slider
                label="Gamma"
                min={0.1}
                max={3.0}
                step={0.1}
                value={kv.gamma}
                onChange={setKSpaceGamma}
                showValue
                data-testid="kspace-gamma"
              />
            </div>

            {/* Broadening */}
            <div className="space-y-2 ps-3 border-s border-border-subtle">
              <div className="text-xs text-text-tertiary">Broadening (display only)</div>
              <Switch
                label="Enable"
                checked={kv.broadeningEnabled}
                onCheckedChange={setKSpaceBroadeningEnabled}
                data-testid="kspace-broadening-enabled"
              />
              {kv.broadeningEnabled && (
                <>
                  <Slider
                    label="Radius"
                    min={1}
                    max={5}
                    step={1}
                    value={kv.broadeningRadius}
                    onChange={setKSpaceBroadeningRadius}
                    showValue
                    data-testid="kspace-broadening-radius"
                  />
                  <Slider
                    label="Sigma"
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    value={kv.broadeningSigma}
                    onChange={setKSpaceBroadeningSigma}
                    showValue
                    data-testid="kspace-broadening-sigma"
                  />
                </>
              )}
            </div>

            {/* Radial bin count (only for radial3d mode) */}
            {kv.displayMode === 'radial3d' && (
              <Slider
                label="Radial Bins"
                min={16}
                max={128}
                step={1}
                value={kv.radialBinCount}
                onChange={setKSpaceRadialBinCount}
                showValue
                data-testid="kspace-radial-bins"
              />
            )}
          </div>
        )}
      </div>
    )
  }
)

FreeScalarFieldControls.displayName = 'FreeScalarFieldControls'
