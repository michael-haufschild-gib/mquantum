/**
 * PauliGridControls Component
 *
 * Controls for configuring the computational grid, time-stepping,
 * and physical constants for Pauli spinor simulation.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliGridControls
 */

import React, { useCallback, useMemo } from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']

/** Max total sites — must match store constant */
const PAULI_MAX_TOTAL_SITES = 262144

const ALL_GRID_SIZE_OPTIONS = [
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

interface PauliGridControlsProps {
  latticeDim: number
  gridSize: number[]
  spacing: number[]
  dt: number
  stepsPerFrame: number
  hbar: number
  mass: number
  onGridSizeChange: (size: number[]) => void
  onSpacingChange: (spacing: number[]) => void
  onDtChange: (dt: number) => void
  onStepsPerFrameChange: (steps: number) => void
  onHbarChange: (hbar: number) => void
  onMassChange: (mass: number) => void
}

/**
 * Grid, time-stepping, and physical constant controls for Pauli spinor.
 *
 * @param props - Grid parameters and change handlers
 * @returns Grid controls panel
 */
export const PauliGridControls: React.FC<PauliGridControlsProps> = React.memo(
  ({
    latticeDim,
    gridSize,
    spacing,
    dt,
    stepsPerFrame,
    hbar,
    mass,
    onGridSizeChange,
    onSpacingChange,
    onDtChange,
    onStepsPerFrameChange,
    onHbarChange,
    onMassChange,
  }) => {
    const maxPerDim = useMemo(
      () => Math.round(Math.pow(PAULI_MAX_TOTAL_SITES, 1 / latticeDim)),
      [latticeDim]
    )
    const gridSizeOptions = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((opt) => parseInt(opt.value) <= maxPerDim),
      [maxPerDim]
    )

    const activeGridSize = gridSize[0] ?? 64
    const handleGridSizeChange = useCallback(
      (v: string) => {
        const size = parseInt(v)
        onGridSizeChange(Array.from({ length: latticeDim }, () => size))
      },
      [latticeDim, onGridSizeChange]
    )
    const totalSites = useMemo(() => {
      let sites = 1
      for (let d = 0; d < latticeDim; d++) sites *= gridSize[d] ?? 64
      return sites
    }, [gridSize, latticeDim])
    const memoryKB = Math.round((totalSites * 2 * 2 * 8) / 1024)

    return (
      <div className="space-y-3">
        {/* Grid size — uniform across all dimensions */}
        <Select
          label="Grid Size"
          tooltip="Number of lattice points per dimension. More points increase spatial resolution but require more GPU memory."
          options={gridSizeOptions}
          value={String(activeGridSize)}
          onChange={handleGridSizeChange}
          data-testid="pauli-grid-size"
        />
        <div className="text-xs text-text-tertiary">
          {totalSites.toLocaleString()} sites ({maxPerDim}^{latticeDim} max) · {memoryKB} KB
        </div>

        {/* Spacing per dimension */}
        {Array.from({ length: latticeDim }, (_, d) => (
          <Slider
            key={`spacing-${d}`}
            label={`Spacing Δ${AXIS_LABELS[d] ?? d}`}
            tooltip="Distance between adjacent lattice points. Smaller spacing resolves finer wavefunction features but reduces the total domain size."
            value={spacing[d] ?? 0.15}
            onChange={(v) => {
              const newSpacing = [...spacing]
              newSpacing[d] = v
              onSpacingChange(newSpacing)
            }}
            min={0.01}
            max={1.0}
            step={0.01}
          />
        ))}

        {/* Time stepping */}
        <Slider
          label="Time Step dt"
          tooltip="Integration time step. Smaller values improve accuracy but slow evolution. Too large may cause numerical instability."
          value={dt}
          onChange={onDtChange}
          min={0.0001}
          max={0.1}
          step={0.0001}
        />

        <Slider
          label="Steps / Frame"
          tooltip="Number of integration steps computed per animation frame. Higher values evolve the simulation faster."
          value={stepsPerFrame}
          onChange={onStepsPerFrameChange}
          min={1}
          max={16}
          step={1}
        />

        {/* Physical constants */}
        <Slider
          label="ℏ (Planck)"
          tooltip="Reduced Planck constant. Controls the quantum-to-classical ratio — smaller ℏ approaches classical behavior."
          value={hbar}
          onChange={onHbarChange}
          min={0.01}
          max={10}
          step={0.01}
        />

        <Slider
          label="Mass m"
          tooltip="Particle mass in natural units. Affects wavepacket dispersion rate and the Zeeman splitting magnitude."
          value={mass}
          onChange={onMassChange}
          min={0.01}
          max={10}
          step={0.01}
        />
      </div>
    )
  }
)
PauliGridControls.displayName = 'PauliGridControls'
