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

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ALL_GRID_SIZE_OPTIONS, AXIS_LABELS } from '@/constants/dimension'
import type {
  DiracFieldView,
  DiracInitialCondition,
  DiracPotentialType,
} from '@/lib/geometry/extended/types'
import { minDiracGridPerDim } from '@/stores/slices/geometry/setters/diracSetters'
import { DIRAC_MAX_TOTAL_SITES } from '@/stores/slices/geometry/setters/sliceSetterUtils'

import type { DiracControlsProps } from './types'

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
export const DiracControls = React.memo(({ config, dimension, actions }: DiracControlsProps) => {
  const dirac = config.dirac
  const latticeDim = dirac.latticeDim ?? dimension

  // Compute grid size range (power of 2, limited by total sites + alignment)
  const maxPerDim = useMemo(
    () => Math.round(Math.pow(DIRAC_MAX_TOTAL_SITES, 1 / latticeDim)),
    [latticeDim]
  )
  const gridSizeOptions = useMemo(() => {
    const minGrid = minDiracGridPerDim(latticeDim)
    return ALL_GRID_SIZE_OPTIONS.filter((opt) => {
      const v = parseInt(opt.value)
      return v >= minGrid && v <= maxPerDim
    })
  }, [latticeDim, maxPerDim])

  const activeGridSize = dirac.gridSize[0] ?? 32
  const handleGridSizeChange = useCallback(
    (v: string) => {
      const size = parseInt(v)
      actions.setGridSize(Array.from({ length: latticeDim }, () => size))
    },
    [latticeDim, actions]
  )
  const totalSites = useMemo(() => {
    let sites = 1
    for (let d = 0; d < latticeDim; d++) sites *= dirac.gridSize[d] ?? 32
    return sites
  }, [dirac.gridSize, latticeDim])
  const spinorComponents = Math.pow(2, Math.floor((latticeDim + 1) / 2))
  const memoryKB = Math.round((totalSites * spinorComponents * 2 * 4) / 1024)

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
  const potentialEnabled = dirac.showPotential

  const showPotentialParams = potentialEnabled && potentialType !== 'none'
  const showBarrierWidth = potentialType === 'barrier' || potentialType === 'well'
  const showHarmonicOmega = potentialType === 'harmonicTrap'
  const showCoulombZ = potentialType === 'coulomb'
  const showPotentialCenter =
    potentialType === 'step' || potentialType === 'barrier' || potentialType === 'well'

  return (
    <div className="space-y-1">
      <ControlGroup
        title="Initial Condition"
        collapsible
        defaultOpen
        data-testid="control-group-dirac-initial"
      >
        <Select
          label="Initial Condition"
          tooltip="Shape of the initial four-component Dirac spinor wavepacket at t=0."
          value={dirac.initialCondition}
          options={INITIAL_CONDITION_OPTIONS}
          onChange={(v) => actions.setInitialCondition(v as DiracInitialCondition)}
        />
      </ControlGroup>

      <ControlGroup
        title="Display"
        collapsible
        defaultOpen
        data-testid="control-group-dirac-display"
      >
        <Select
          label="Field View"
          tooltip="Which spinor observable to visualize: total density, individual components, spin, or current."
          value={dirac.fieldView}
          options={FIELD_VIEW_OPTIONS}
          onChange={(v) => actions.setFieldView(v as DiracFieldView)}
        />
      </ControlGroup>

      <ControlGroup
        title="Potential"
        collapsible
        defaultOpen
        data-testid="control-group-dirac-potential"
      >
        <Switch
          label="Enable Potential"
          tooltip="Activate the external potential in the Dirac simulation and show it as an overlay on the density visualization. When off, the spinor evolves as a free particle regardless of the configured potential type."
          checked={potentialEnabled}
          onCheckedChange={actions.setShowPotential}
        />
        <Select
          label="Potential"
          tooltip="External electromagnetic potential acting on the Dirac spinor field."
          value={potentialType}
          options={POTENTIAL_TYPE_OPTIONS}
          onChange={(v) => actions.setPotentialType(v as DiracPotentialType)}
          disabled={!potentialEnabled}
        />
        {showPotentialParams && (
          <>
            <Slider
              label="Potential Strength V₀"
              tooltip="Height of the potential in units of mc². Above 2mc² the Klein paradox regime begins."
              value={dirac.potentialStrength}
              onChange={actions.setPotentialStrength}
              min={0}
              max={10}
              step={0.1}
            />
            {showBarrierWidth && (
              <Slider
                label="Potential Width"
                tooltip="Spatial extent of the barrier or well region in lattice units."
                value={dirac.potentialWidth}
                onChange={actions.setPotentialWidth}
                min={0.1}
                max={5}
                step={0.1}
              />
            )}
            {showPotentialCenter && (
              <Slider
                label="Potential Center"
                tooltip="Position of the potential along the primary axis relative to the lattice center."
                value={dirac.potentialCenter}
                onChange={actions.setPotentialCenter}
                min={-halfExtent}
                max={halfExtent}
                step={0.1}
              />
            )}
            {showHarmonicOmega && (
              <Slider
                label="Trap Frequency ω"
                tooltip="Angular frequency of the harmonic confining potential. Higher values produce tighter confinement."
                value={dirac.harmonicOmega}
                onChange={actions.setHarmonicOmega}
                min={0.01}
                max={10}
                step={0.01}
              />
            )}
            {showCoulombZ && (
              <Slider
                label="Charge Z"
                tooltip="Nuclear charge for the Coulomb potential V = -Z/r. Above Z ≈ 137 the Dirac equation becomes supercritical."
                value={dirac.coulombZ}
                onChange={actions.setCoulombZ}
                min={1}
                max={10}
                step={1}
              />
            )}
          </>
        )}
      </ControlGroup>

      <ControlGroup
        title="Physics"
        collapsible
        defaultOpen={false}
        data-testid="control-group-dirac-physics"
      >
        <Slider
          label="Mass m"
          tooltip="Rest mass of the Dirac particle. Determines the gap between positive and negative energy solutions (mc²)."
          value={dirac.mass}
          onChange={actions.setMass}
          min={0.01}
          max={10}
          step={0.01}
        />
        <Slider
          label="Speed of Light c"
          tooltip="Speed of light in natural units. Controls the relationship between energy and momentum in the dispersion relation E² = (pc)² + (mc²)²."
          value={dirac.speedOfLight}
          onChange={actions.setSpeedOfLight}
          min={0.1}
          max={5}
          step={0.1}
        />
        <Slider
          label="Packet Width σ"
          tooltip="Spatial width of the initial wavepacket. Narrow packets spread quickly due to dispersion."
          value={dirac.packetWidth}
          onChange={actions.setPacketWidth}
          min={0.1}
          max={5}
          step={0.1}
        />
        <Slider
          label="Positive Energy Fraction"
          tooltip="Fraction of positive-energy (particle) components vs negative-energy (antiparticle). At 0.5, equal mix produces Zitterbewegung."
          value={dirac.positiveEnergyFraction}
          onChange={actions.setPositiveEnergyFraction}
          min={0}
          max={1}
          step={0.01}
        />
        {Array.from({ length: Math.min(latticeDim, 3) }, (_, d) => {
          const kMax = Math.PI / (dirac.spacing[d] ?? 0.15)
          return (
            <Slider
              key={`mom-${d}`}
              label={`Momentum k${AXIS_LABELS[d]}`}
              tooltip="Initial crystal momentum of the wavepacket along this axis in units of 1/a."
              value={dirac.packetMomentum[d] ?? 0}
              onChange={(v) => actions.setPacketMomentum(d, v)}
              min={-kMax}
              max={kMax}
              step={0.5}
            />
          )
        })}
      </ControlGroup>

      <ControlGroup
        title="Grid & Numerics"
        collapsible
        defaultOpen={false}
        data-testid="control-group-dirac-numerics"
      >
        <Select
          label="Grid Size"
          tooltip="Number of lattice sites per dimension. Total sites across all dimensions is capped at 262144."
          value={String(activeGridSize)}
          options={gridSizeOptions}
          onChange={handleGridSizeChange}
          data-testid="dirac-grid-size"
        />
        <div className="text-xs text-text-tertiary">
          {totalSites.toLocaleString()} sites ({maxPerDim}^{latticeDim} max) · S={spinorComponents}{' '}
          · {memoryKB} KB
        </div>
        {Array.from({ length: latticeDim }, (_, d) => (
          <Slider
            key={`spacing-${d}`}
            label={`Spacing Δ${AXIS_LABELS[d]}`}
            tooltip="Lattice spacing along this axis. Smaller values increase resolution but reduce the physical domain size."
            value={dirac.spacing[d] ?? 0.15}
            onChange={(v) => {
              const newSpacing = [...dirac.spacing]
              newSpacing[d] = v
              actions.setSpacing(newSpacing)
            }}
            min={0.01}
            max={1}
            step={0.01}
          />
        ))}
        <Slider
          label="Time Step dt"
          tooltip="Integration time step for the split-operator method. Smaller values improve accuracy but slow evolution."
          value={dirac.dt}
          onChange={actions.setDt}
          min={0.0001}
          max={0.05}
          step={0.0001}
        />
        <Slider
          label="Steps per Frame"
          tooltip="Number of time-integration steps computed per rendered frame. More steps speed up evolution."
          value={dirac.stepsPerFrame}
          onChange={actions.setStepsPerFrame}
          min={1}
          max={16}
          step={1}
        />
        {latticeDim > 3 &&
          Array.from({ length: latticeDim - 3 }, (_, i) => {
            const d = i + 3
            const halfExt = (dirac.gridSize[d] ?? 32) * (dirac.spacing[d] ?? 0.15) * 0.5
            return (
              <Slider
                key={`slice-${d}`}
                label={`Slice ${AXIS_LABELS[d]}`}
                tooltip="Position of the 3D cross-section through this higher dimension."
                value={dirac.slicePositions[i] ?? 0}
                onChange={(v) => actions.setSlicePosition(i, v)}
                min={-halfExt}
                max={halfExt}
                step={0.05}
              />
            )
          })}
      </ControlGroup>
    </div>
  )
})

DiracControls.displayName = 'DiracControls'
