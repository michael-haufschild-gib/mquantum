/**
 * DiracControls Component
 *
 * Configuration panel for Dirac equation dynamics.
 * Provides controls for initial condition, potential, field view,
 * physics parameters, and numerical settings.
 *
 * @module components/sections/Geometry/SchroedingerControls/DiracControls
 */

import React, { useCallback, useMemo } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import type { DiracControlsProps } from './types'
import type { DiracInitialCondition, DiracFieldView, DiracPotentialType } from '@/lib/geometry/extended/types'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/** Max total sites for Dirac mode — must match store constant */
const DIRAC_MAX_TOTAL_SITES = 262144

const ALL_GRID_SIZE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

const INITIAL_CONDITION_OPTIONS: { value: DiracInitialCondition; label: string }[] = [
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'planeWave', label: 'Plane Wave' },
  { value: 'standingWave', label: 'Standing Wave' },
  { value: 'zitterbewegung', label: 'Zitterbewegung' },
]

const FIELD_VIEW_OPTIONS: { value: DiracFieldView; label: string }[] = [
  { value: 'totalDensity', label: 'Total Density ψ†ψ' },
  { value: 'particleDensity', label: 'Upper Spinor Components' },
  { value: 'antiparticleDensity', label: 'Lower Spinor Components' },
  { value: 'particleAntiparticleSplit', label: 'Upper / Lower Split' },
  { value: 'spinDensity', label: 'Spin Density |s|' },
  { value: 'currentDensity', label: 'Current Density |j|' },
  { value: 'phase', label: 'Phase arg(ψ₀)' },
]

const PRESET_OPTIONS = [
  { value: '', label: '— Select Preset —' },
  ...DIRAC_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

const POTENTIAL_TYPE_OPTIONS: { value: DiracPotentialType; label: string }[] = [
  { value: 'none', label: 'Free Particle' },
  { value: 'step', label: 'Step (Klein Paradox)' },
  { value: 'barrier', label: 'Rectangular Barrier' },
  { value: 'well', label: 'Finite Square Well' },
  { value: 'harmonicTrap', label: 'Harmonic Trap' },
  { value: 'coulomb', label: 'Coulomb (-Z/r)' },
]

/**
 * Control panel for the Dirac equation mode.
 *
 * @param props - Component props
 * @returns Dirac controls JSX
 * @example
 * ```tsx
 * <DiracControls config={config} dimension={3} actions={diracActions} />
 * ```
 */
export const DiracControls = React.memo(
  ({ config, dimension, actions }: DiracControlsProps) => {
    const dirac = config.dirac
    const latticeDim = dirac.latticeDim ?? dimension

    // Compute max grid size per dimension (power of 2, limited by total sites)
    const gridSizeOptions = useMemo(() => {
      const maxPerDim = Math.floor(Math.pow(DIRAC_MAX_TOTAL_SITES, 1 / latticeDim))
      return ALL_GRID_SIZE_OPTIONS.filter((opt) => parseInt(opt.value) <= maxPerDim)
    }, [latticeDim])

    // Half-extent for position sliders
    const halfExtent = useMemo(() => {
      let max = 1
      for (let d = 0; d < latticeDim; d++) {
        const extent = (dirac.gridSize[d] ?? 32) * (dirac.spacing[d] ?? 0.15) * 0.5
        if (extent > max) max = extent
      }
      return max
    }, [dirac.gridSize, dirac.spacing, latticeDim])

    const potentialType = dirac.potentialType ?? 'none'
    const showPotentialParams = potentialType !== 'none'
    const showBarrierWidth = potentialType === 'barrier' || potentialType === 'well'
    const showHarmonicOmega = potentialType === 'harmonicTrap'
    const showCoulombZ = potentialType === 'coulomb'
    const showPotentialCenter = potentialType === 'step' || potentialType === 'barrier' || potentialType === 'well'

    const handleReset = useCallback(() => {
      actions.setNeedsReset()
    }, [actions])

    return (
      <div className="space-y-3">
        {/* Scenario Preset */}
        <Select
          label="Scenario"
          value=""
          options={PRESET_OPTIONS}
          onChange={(v) => { if (v) actions.applyPreset(v) }}
        />

        {/* Initial Condition */}
        <Select
          label="Initial Condition"
          value={dirac.initialCondition}
          options={INITIAL_CONDITION_OPTIONS}
          onChange={(v) => actions.setInitialCondition(v as DiracInitialCondition)}
        />

        {/* Field View */}
        <Select
          label="Field View"
          value={dirac.fieldView}
          options={FIELD_VIEW_OPTIONS}
          onChange={(v) => actions.setFieldView(v as DiracFieldView)}
        />

        <Switch
          label="Show Potential Overlay"
          checked={dirac.showPotential}
          onCheckedChange={actions.setShowPotential}
        />

        {/* Potential */}
        <Select
          label="Potential"
          value={potentialType}
          options={POTENTIAL_TYPE_OPTIONS}
          onChange={(v) => actions.setPotentialType(v as DiracPotentialType)}
        />

        {showPotentialParams && (
          <>
            <Slider
              label="Potential Strength V₀"
              value={dirac.potentialStrength}
              onChange={actions.setPotentialStrength}
              min={0} max={10} step={0.1}
            />
            {showBarrierWidth && (
              <Slider
                label="Potential Width"
                value={dirac.potentialWidth}
                onChange={actions.setPotentialWidth}
                min={0.1} max={5} step={0.1}
              />
            )}
            {showPotentialCenter && (
              <Slider
                label="Potential Center"
                value={dirac.potentialCenter}
                onChange={actions.setPotentialCenter}
                min={-halfExtent} max={halfExtent} step={0.1}
              />
            )}
            {showHarmonicOmega && (
              <Slider
                label="Trap Frequency ω"
                value={dirac.harmonicOmega}
                onChange={actions.setHarmonicOmega}
                min={0.01} max={10} step={0.01}
              />
            )}
            {showCoulombZ && (
              <Slider
                label="Charge Z"
                value={dirac.coulombZ}
                onChange={actions.setCoulombZ}
                min={0.1} max={10} step={0.1}
              />
            )}
          </>
        )}

        {/* Physics Parameters */}
        <Slider
          label="Mass m"
          value={dirac.mass}
          onChange={actions.setMass}
          min={0.01} max={10} step={0.01}
        />
        <Slider
          label="Speed of Light c"
          value={dirac.speedOfLight}
          onChange={actions.setSpeedOfLight}
          min={0.1} max={5} step={0.1}
        />
        <Slider
          label="Packet Width σ"
          value={dirac.packetWidth}
          onChange={actions.setPacketWidth}
          min={0.1} max={5} step={0.1}
        />
        <Slider
          label="Positive Energy Fraction"
          value={dirac.positiveEnergyFraction}
          onChange={actions.setPositiveEnergyFraction}
          min={0} max={1} step={0.01}
        />

        {/* Packet Momentum (one per dimension) */}
        {Array.from({ length: Math.min(latticeDim, 3) }, (_, d) => (
          <Slider
            key={`mom-${d}`}
            label={`Momentum k${AXIS_LABELS[d]}`}
            value={dirac.packetMomentum[d] ?? 0}
            onChange={(v) => actions.setPacketMomentum(d, v)}
            min={-20} max={20} step={0.5}
          />
        ))}

        {/* Grid Settings */}
        {Array.from({ length: latticeDim }, (_, d) => (
          <Select
            key={`grid-${d}`}
            label={`Grid ${AXIS_LABELS[d]}`}
            value={String(dirac.gridSize[d] ?? 32)}
            options={gridSizeOptions}
            onChange={(v) => {
              const newGrid = [...dirac.gridSize]
              newGrid[d] = parseInt(v)
              actions.setGridSize(newGrid)
            }}
          />
        ))}

        {Array.from({ length: latticeDim }, (_, d) => (
          <Slider
            key={`spacing-${d}`}
            label={`Spacing Δ${AXIS_LABELS[d]}`}
            value={dirac.spacing[d] ?? 0.15}
            onChange={(v) => {
              const newSpacing = [...dirac.spacing]
              newSpacing[d] = v
              actions.setSpacing(newSpacing)
            }}
            min={0.01} max={1} step={0.01}
          />
        ))}

        {/* Slice positions for dimensions > 3 */}
        {latticeDim > 3 && Array.from({ length: latticeDim - 3 }, (_, i) => {
          const d = i + 3
          const halfExt = (dirac.gridSize[d] ?? 32) * (dirac.spacing[d] ?? 0.15) * 0.5
          return (
            <Slider
              key={`slice-${d}`}
              label={`Slice ${AXIS_LABELS[d]}`}
              value={dirac.slicePositions[i] ?? 0}
              onChange={(v) => actions.setSlicePosition(i, v)}
              min={-halfExt} max={halfExt} step={0.05}
            />
          )
        })}

        {/* Numerical Settings */}
        <Slider
          label="Time Step dt"
          value={dirac.dt}
          onChange={actions.setDt}
          min={0.0001} max={0.05} step={0.0001}
        />
        <Slider
          label="Steps per Frame"
          value={dirac.stepsPerFrame}
          onChange={actions.setStepsPerFrame}
          min={1} max={16} step={1}
        />

        {/* Absorber */}
        <Switch
          label="Absorber"
          checked={dirac.absorberEnabled}
          onCheckedChange={actions.setAbsorberEnabled}
        />
        {dirac.absorberEnabled && (
          <>
            <Slider label="Absorber Width" value={dirac.absorberWidth}
              onChange={actions.setAbsorberWidth} min={0.01} max={0.5} step={0.01} />
            <Slider label="Absorber Strength" value={dirac.absorberStrength}
              onChange={actions.setAbsorberStrength} min={0.1} max={50} step={0.1} />
          </>
        )}

        {/* Auto Scale */}
        <Switch
          label="Auto Scale"
          checked={dirac.autoScale}
          onCheckedChange={actions.setAutoScale}
        />

        {/* Reset */}
        <Button onClick={handleReset} className="w-full">
          Reset Field
        </Button>
      </div>
    )
  }
)

DiracControls.displayName = 'DiracControls'
