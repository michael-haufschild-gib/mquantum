/**
 * BECControls Component
 *
 * Configuration panel for Bose-Einstein condensate dynamics via Gross-Pitaevskii equation.
 * Provides controls for initial condition, interaction strength, trap parameters,
 * field view, absorber boundaries, and numerical settings.
 *
 * @module components/sections/Geometry/SchroedingerControls/BECControls
 */

import React, { useCallback, useMemo } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import type { BecControlsProps } from './types'
import type { BecInitialCondition, BecFieldView } from '@/lib/geometry/extended/types'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/** TDSE/BEC max total sites — must match store constant */
const TDSE_MAX_TOTAL_SITES = 262144

const ALL_GRID_SIZE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

const INITIAL_CONDITION_OPTIONS = [
  { value: 'thomasFermi', label: 'Thomas-Fermi' },
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'vortexImprint', label: 'Vortex Imprint' },
  { value: 'vortexLattice', label: 'Vortex Lattice' },
  { value: 'darkSoliton', label: 'Dark Soliton' },
]

const FIELD_VIEW_OPTIONS = [
  { value: 'density', label: 'Density |ψ|²' },
  { value: 'phase', label: 'Phase arg(ψ)' },
  { value: 'current', label: 'Probability Current' },
  { value: 'potential', label: 'Potential V(x)' },
  { value: 'superfluidVelocity', label: 'Superfluid Velocity' },
  { value: 'healingLength', label: 'Healing Length' },
]

const SCENARIO_PRESET_OPTIONS = [
  { value: '', label: '— Select Preset —' },
  ...BEC_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/**
 * BEC (Gross-Pitaevskii) control panel.
 *
 * @param props - BEC controls props
 * @returns BEC configuration UI
 *
 * @example
 * ```tsx
 * <BECControls config={config} dimension={3} actions={becActions} />
 * ```
 */
export const BECControls: React.FC<BecControlsProps> = React.memo(({ config, dimension, actions }) => {
  const bec = config.bec
  const activeDims = Math.min(bec.latticeDim, dimension)

  // Scenario preset detection
  const detectActivePreset = useCallback((cfg: typeof bec): string => {
    for (const preset of BEC_SCENARIO_PRESETS) {
      const o = preset.overrides
      if (
        (o.interactionStrength === undefined || o.interactionStrength === cfg.interactionStrength) &&
        (o.trapOmega === undefined || o.trapOmega === cfg.trapOmega) &&
        (o.initialCondition === undefined || o.initialCondition === cfg.initialCondition)
      ) {
        return preset.id
      }
    }
    return ''
  }, [])

  const activePreset = useMemo(() => detectActivePreset(bec), [detectActivePreset, bec])

  // Filter grid options by budget: at high D, large grid sizes exceed TDSE_MAX_TOTAL_SITES
  const maxGridPerDim = useMemo(
    () => Math.floor(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / activeDims)),
    [activeDims]
  )
  const gridSizeOptions = useMemo(
    () => ALL_GRID_SIZE_OPTIONS.filter((o) => parseInt(o.value, 10) <= maxGridPerDim),
    [maxGridPerDim]
  )

  const showVortexControls = bec.initialCondition === 'vortexImprint' || bec.initialCondition === 'vortexLattice'
  const showSolitonControls = bec.initialCondition === 'darkSoliton'

  return (
    <div className="space-y-4">
      {/* Scenario Preset */}
      <Select
        label="Scenario"
        value={activePreset}
        onChange={(v) => v && actions.applyPreset(v)}
        options={SCENARIO_PRESET_OPTIONS}
      />

      {/* Initial Condition */}
      <Select
        label="Initial Condition"
        value={bec.initialCondition}
        onChange={(v) => actions.setInitialCondition(v as BecInitialCondition)}
        options={INITIAL_CONDITION_OPTIONS}
      />

      {/* Conditional: Vortex controls */}
      {showVortexControls && (
        <>
          <Slider
            label="Vortex Charge"
            value={bec.vortexCharge}
            onChange={actions.setVortexCharge}
            min={-4} max={4} step={1}
          />
          {bec.initialCondition === 'vortexLattice' && (
            <Slider
              label="Vortex Count"
              value={bec.vortexLatticeCount}
              onChange={actions.setVortexLatticeCount}
              min={1} max={16} step={1}
            />
          )}
        </>
      )}

      {/* Conditional: Soliton controls */}
      {showSolitonControls && (
        <>
          <Slider
            label="Soliton Depth"
            value={bec.solitonDepth}
            onChange={actions.setSolitonDepth}
            min={0} max={1} step={0.05}
          />
          <Slider
            label="Soliton Velocity"
            value={bec.solitonVelocity}
            onChange={actions.setSolitonVelocity}
            min={-1} max={1} step={0.05}
          />
        </>
      )}

      {/* Physics */}
      <Slider
        label="Interaction g̃"
        value={bec.interactionStrength}
        onChange={actions.setInteractionStrength}
        min={-1000} max={10000} step={10}
      />
      <Slider
        label="Trap ω"
        value={bec.trapOmega}
        onChange={actions.setTrapOmega}
        min={0.01} max={10} step={0.01}
      />

      {/* Per-dimension trap anisotropy ratios (ω_d = ratio * ω) */}
      {activeDims > 1 && Array.from({ length: activeDims }, (_, i) => (
        <Slider
          key={`aniso-${i}`}
          label={`ω ratio ${AXIS_LABELS[i]}`}
          value={bec.trapAnisotropy?.[i] ?? 1.0}
          onChange={(v) => actions.setTrapAnisotropy(i, v)}
          min={0.1} max={5.0} step={0.05}
        />
      ))}

      {/* Display */}
      <Select
        label="Field View"
        value={bec.fieldView}
        onChange={(v) => actions.setFieldView(v as BecFieldView)}
        options={FIELD_VIEW_OPTIONS}
      />
      <Switch
        label="Auto-Scale"
        checked={bec.autoScale}
        onCheckedChange={actions.setAutoScale}
      />

      {/* Absorber */}
      <Switch
        label="Absorber"
        checked={bec.absorberEnabled}
        onCheckedChange={actions.setAbsorberEnabled}
      />
      {bec.absorberEnabled && (
        <>
          <Slider
            label="Absorber Width"
            value={bec.absorberWidth}
            onChange={actions.setAbsorberWidth}
            min={0.05} max={0.3} step={0.01}
          />
          <Slider
            label="Absorber Strength"
            value={bec.absorberStrength}
            onChange={actions.setAbsorberStrength}
            min={0.1} max={50} step={0.1}
          />
        </>
      )}

      {/* Numerics: Grid */}
      {Array.from({ length: activeDims }, (_, i) => (
        <Select
          key={`grid-${i}`}
          label={`Grid ${AXIS_LABELS[i]}`}
          value={String(bec.gridSize[i] ?? 64)}
          onChange={(v) => {
            const arr = [...bec.gridSize]
            arr[i] = parseInt(v, 10)
            actions.setGridSize(arr)
          }}
          options={gridSizeOptions}
        />
      ))}

      {/* Numerics: Spacing */}
      {Array.from({ length: activeDims }, (_, i) => (
        <Slider
          key={`spacing-${i}`}
          label={`Spacing ${AXIS_LABELS[i]}`}
          value={bec.spacing[i] ?? 0.15}
          onChange={(v) => {
            const arr = [...bec.spacing]
            arr[i] = v
            actions.setSpacing(arr)
          }}
          min={0.01} max={1.0} step={0.01}
        />
      ))}

      {/* Numerics: Particle */}
      <Slider
        label="Mass"
        value={bec.mass}
        onChange={actions.setMass}
        min={0.1} max={10} step={0.1}
      />
      <Slider
        label="ℏ"
        value={bec.hbar}
        onChange={actions.setHbar}
        min={0.1} max={10} step={0.1}
      />

      {/* Numerics: Time */}
      <Slider
        label="dt"
        value={bec.dt}
        onChange={actions.setDt}
        min={0.0001} max={0.02} step={0.0001}
      />
      <Slider
        label="Steps/Frame"
        value={bec.stepsPerFrame}
        onChange={actions.setStepsPerFrame}
        min={1} max={16} step={1}
      />

      {/* Diagnostics */}
      <Switch
        label="Diagnostics"
        checked={bec.diagnosticsEnabled}
        onCheckedChange={actions.setDiagnosticsEnabled}
      />

      {/* Slice positions for dims > 3 */}
      {activeDims > 3 && bec.slicePositions.length > 0 && (
        <>
          {Array.from({ length: Math.min(activeDims - 3, bec.slicePositions.length) }, (_, i) => {
            const dimIdx = i + 3
            const halfExtent =
              ((bec.gridSize[dimIdx] ?? 8) * (bec.spacing[dimIdx] ?? bec.spacing[0] ?? 0.15)) / 2
            return (
              <Slider
                key={`slice-${dimIdx}`}
                label={`Slice ${AXIS_LABELS[dimIdx]}`}
                value={bec.slicePositions[i] ?? 0}
                onChange={(v) => actions.setSlicePosition(i, v)}
                min={-halfExtent} max={halfExtent} step={halfExtent / 20}
              />
            )
          })}
        </>
      )}

      {/* Reset */}
      <Button
        onClick={actions.resetField}
        className="w-full"
      >
        Reset BEC
      </Button>
    </div>
  )
})

BECControls.displayName = 'BECControls'
