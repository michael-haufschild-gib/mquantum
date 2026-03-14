/**
 * PauliGridControls Component
 *
 * Controls for configuring the computational grid, time-stepping,
 * and physical constants for Pauli spinor simulation.
 *
 * @module components/sections/Geometry/PauliSpinorControls/PauliGridControls
 */

import React, { useMemo } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'

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
  absorberEnabled: boolean
  absorberWidth: number
  absorberStrength: number
  onGridSizeChange: (size: number[]) => void
  onSpacingChange: (spacing: number[]) => void
  onDtChange: (dt: number) => void
  onStepsPerFrameChange: (steps: number) => void
  onHbarChange: (hbar: number) => void
  onMassChange: (mass: number) => void
  onAbsorberEnabledChange: (enabled: boolean) => void
  onAbsorberWidthChange: (width: number) => void
  onAbsorberStrengthChange: (strength: number) => void
}

/**
 * Grid, time-stepping, and absorber controls for Pauli spinor.
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
    absorberEnabled,
    absorberWidth,
    absorberStrength,
    onGridSizeChange,
    onSpacingChange,
    onDtChange,
    onStepsPerFrameChange,
    onHbarChange,
    onMassChange,
    onAbsorberEnabledChange,
    onAbsorberWidthChange,
    onAbsorberStrengthChange,
  }) => {
    const gridSizeOptions = useMemo(() => {
      const maxPerDim = Math.floor(Math.pow(PAULI_MAX_TOTAL_SITES, 1 / latticeDim))
      return ALL_GRID_SIZE_OPTIONS.filter((opt) => parseInt(opt.value) <= maxPerDim)
    }, [latticeDim])

    return (
      <div className="space-y-3">
        {/* Grid size per dimension */}
        {Array.from({ length: latticeDim }, (_, d) => (
          <Select
            key={`grid-${d}`}
            label={`Grid N${AXIS_LABELS[d] ?? d}`}
            options={gridSizeOptions}
            value={String(gridSize[d] ?? 64)}
            onChange={(v) => {
              const newSize = [...gridSize]
              newSize[d] = parseInt(v)
              onGridSizeChange(newSize)
            }}
          />
        ))}

        {/* Spacing per dimension */}
        {Array.from({ length: latticeDim }, (_, d) => (
          <Slider
            key={`spacing-${d}`}
            label={`Spacing Δ${AXIS_LABELS[d] ?? d}`}
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
          value={dt}
          onChange={onDtChange}
          min={0.0001}
          max={0.1}
          step={0.0001}
        />

        <Slider
          label="Steps / Frame"
          value={stepsPerFrame}
          onChange={onStepsPerFrameChange}
          min={1}
          max={16}
          step={1}
        />

        {/* Physical constants */}
        <Slider
          label="ℏ (Planck)"
          value={hbar}
          onChange={onHbarChange}
          min={0.01}
          max={10}
          step={0.01}
        />

        <Slider
          label="Mass m"
          value={mass}
          onChange={onMassChange}
          min={0.01}
          max={10}
          step={0.01}
        />

        {/* Absorbing boundary */}
        <Switch
          label="Absorbing Boundary"
          checked={absorberEnabled}
          onCheckedChange={onAbsorberEnabledChange}
        />

        {absorberEnabled && (
          <>
            <Slider
              label="Absorber Width"
              value={absorberWidth}
              onChange={onAbsorberWidthChange}
              min={0.01}
              max={0.5}
              step={0.01}
            />

            <Slider
              label="Absorber Strength"
              value={absorberStrength}
              onChange={onAbsorberStrengthChange}
              min={0.1}
              max={50}
              step={0.1}
            />
          </>
        )}
      </div>
    )
  }
)
PauliGridControls.displayName = 'PauliGridControls'
