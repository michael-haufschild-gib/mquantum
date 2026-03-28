/**
 * TDSEControls Component
 *
 * Configuration panel for time-dependent Schroedinger equation dynamics.
 * Provides controls for wavepacket initialization, potential selection,
 * drive parameters, and numerical settings.
 *
 * @module components/sections/Geometry/SchroedingerControls/TDSEControls
 */

import React, { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { TdseFieldView, TdseInitialCondition } from '@/lib/geometry/extended/types'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

import {
  ALL_GRID_SIZE_OPTIONS,
  AXIS_LABELS,
  detectActivePreset,
  FIELD_VIEW_OPTIONS,
  INITIAL_CONDITION_OPTIONS,
  getScenarioPresetOptions,
  TDSE_MAX_TOTAL_SITES,
} from './tdseControlsConstants'
import { TDSEPotentialControls } from './TDSEPotentialControls'
import type { TdseControlsProps } from './types'

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
      [td.gridSize, actions]
    )

    const handleSpacingChange = useCallback(
      (dimIdx: number, value: number) => {
        const newSpacing = [...td.spacing]
        newSpacing[dimIdx] = value
        actions.setSpacing(newSpacing)
      },
      [td.spacing, actions]
    )

    const handlePacketCenterChange = useCallback(
      (dimIdx: number, value: number) => {
        const newCenter = [...td.packetCenter]
        newCenter[dimIdx] = value
        actions.setPacketCenter(newCenter)
      },
      [td.packetCenter, actions]
    )

    const handlePacketMomentumChange = useCallback(
      (dimIdx: number, value: number) => {
        const newMom = [...td.packetMomentum]
        newMom[dimIdx] = value
        actions.setPacketMomentum(newMom)
      },
      [td.packetMomentum, actions]
    )

    const activeDims = useMemo(() => td.latticeDim, [td.latticeDim])

    // Filter grid options by budget: at high D, large grid sizes exceed TDSE_MAX_TOTAL_SITES
    const maxGridPerDim = useMemo(
      () => Math.floor(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / activeDims)),
      [activeDims]
    )
    const gridSizeOptions = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((o) => parseInt(o.value, 10) <= maxGridPerDim),
      [maxGridPerDim]
    )

    const handlePresetChange = useCallback(
      (value: string) => {
        if (value) actions.applyPreset(value)
      },
      [actions]
    )

    // Filter presets to those compatible with the current dimension
    const scenarioPresetOptions = useMemo(
      () => getScenarioPresetOptions(dimension),
      [dimension]
    )

    return (
      <div className="space-y-4" data-testid="tdse-controls">
        {/* Scenario Presets */}
        <div className="space-y-3">
          <Select
            label="Scenario"
            tooltip="Preconfigured physics scenarios with tuned parameters for tunneling, scattering, interference, and other quantum phenomena."
            options={scenarioPresetOptions}
            value={activePreset}
            onChange={handlePresetChange}
            data-testid="tdse-scenario-preset"
          />
        </div>

        {/* Initial Condition */}
        <div className="space-y-3">
          <Select
            label="Initial State"
            tooltip="Shape of the initial wavefunction. Gaussian wavepacket is most common; coherent state matches a classical oscillator."
            options={INITIAL_CONDITION_OPTIONS}
            value={td.initialCondition}
            onChange={(v) => actions.setInitialCondition(v as TdseInitialCondition)}
            data-testid="tdse-initial-condition"
          />
          <Slider
            label="Packet Width"
            tooltip="Spatial width (σ) of the initial Gaussian wavepacket. Smaller values give a more localized particle with higher momentum uncertainty."
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
            tooltip="Peak amplitude of the initial wavepacket. Affects the normalization of the probability density."
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
              tooltip="Initial center position of the wavepacket along this axis."
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
              tooltip="Initial momentum (wavenumber) of the wavepacket along this axis. Determines propagation direction and speed."
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

        {/* Display */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Select
            label="Field View"
            tooltip="Which quantity to visualize: probability density |ψ|², real/imaginary parts, phase, or momentum-space distribution."
            options={FIELD_VIEW_OPTIONS}
            value={td.fieldView}
            onChange={(v) => actions.setFieldView(v as TdseFieldView)}
            data-testid="tdse-field-view"
          />
          <Switch
            label="Auto Scale"
            tooltip="Automatically normalize the color range to the current maximum probability density. Prevents saturation as the wavepacket spreads."
            checked={td.autoScale}
            onCheckedChange={actions.setAutoScale}
            data-testid="tdse-auto-scale"
          />
          <Switch
            label="Show Potential"
            tooltip="Overlay the external potential V(x) on the wavefunction visualization."
            checked={td.showPotential}
            onCheckedChange={actions.setShowPotential}
            data-testid="tdse-show-potential"
          />
        </div>

        {/* Imaginary-Time Propagation */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Switch
            label="Imaginary Time (Ground State)"
            tooltip="Propagate in imaginary time to find the ground state eigenfunction. The wavefunction decays to the lowest-energy eigenstate and is renormalized each step."
            checked={td.imaginaryTimeEnabled}
            onCheckedChange={actions.setImaginaryTimeEnabled}
            data-testid="tdse-imaginary-time"
          />
          {td.imaginaryTimeEnabled && <StoreEigenstateButton />}
        </div>

        {/* Numerics */}
        <div className="border-t border-border-subtle pt-3 space-y-3">
          <Slider
            label="Lattice Dim"
            tooltip="Number of spatial dimensions for the TDSE simulation. Higher dimensions require exponentially more memory."
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
              tooltip="Number of lattice points along this axis. More points increase resolution but use more GPU memory."
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
              tooltip="Lattice spacing along this axis. Smaller values resolve finer features but reduce total domain size."
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
            tooltip="Particle mass in natural units. Higher mass means slower dispersion and smaller de Broglie wavelength."
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
            tooltip="Controls the quantum-to-classical ratio. Smaller ħ approaches classical behavior; larger ħ amplifies quantum effects like tunneling and interference."
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
            tooltip="Time step for the numerical integrator. Smaller values give higher accuracy but slower evolution. Too large may cause instability."
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
            tooltip="Number of integration steps computed per animation frame. Higher values evolve the simulation faster."
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
                  tooltip="Cross-section position for this extra dimension. View different slices of the higher-dimensional wavefunction."
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
      </div>
    )
  }
)

TDSEControls.displayName = 'TDSEControls'

/* ────────────────────────────────────────────────────────────── */
/*  Store Eigenstate (Gram-Schmidt)                               */
/* ────────────────────────────────────────────────────────────── */

const StoreEigenstateButton: React.FC = React.memo(() => {
  const count = useSimulationStateStore((s) => s.storedEigenstateCount)

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => useSimulationStateStore.getState().requestStoreEigenstate()}
        disabled={count >= 8}
        tooltip="Capture the current converged eigenstate for Gram-Schmidt orthogonalization. Subsequent imaginary-time runs will find the next excited state."
        data-testid="store-eigenstate"
      >
        Store Eigenstate
      </Button>
      {count > 0 && <span className="text-[10px] text-text-tertiary">{count} stored</span>}
    </div>
  )
})

StoreEigenstateButton.displayName = 'StoreEigenstateButton'
